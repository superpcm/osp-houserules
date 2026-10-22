#!/usr/bin/env python3
"""Closed POSIX capture. Never open original databases through LevelDB."""
import argparse
import datetime
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import uuid
try:
    import fcntl
except ImportError:
    fcntl = None

CATALOGS = ('ammunition', 'armor', 'clothing', 'gear', 'livestock', 'misc', 'spells', 'tack', 'treasure', 'vehicles', 'weapons')
REQUIRED = tuple('data/' + name + '.json' for name in CATALOGS) + ('data/item-templates.js', 'system.json', 'template.json', 'package.json', 'package-lock.json')

class SnapshotError(RuntimeError):
    pass

def plain_path(path):
    """Reject symlinks in existing ancestors, including a supplied root alias."""
    for candidate in reversed((path,) + tuple(path.parents)):
        if candidate.is_symlink():
            raise SnapshotError('unsafe symlink path: ' + str(candidate))

def regular(path):
    plain_path(path)
    try:
        info = path.stat()
    except FileNotFoundError as exc:
        raise SnapshotError('missing input: ' + str(path)) from exc
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise SnapshotError('unsafe non-regular or hardlinked input: ' + str(path))
    return info

def digest(path, fd=None):
    h = hashlib.sha256()
    if fd is not None:
        # Closing another fd to LOCK would release this process's fcntl lock.
        offset = 0
        while True:
            block = os.pread(fd, 1024 * 1024, offset)
            if not block:
                break
            h.update(block)
            offset += len(block)
    else:
        with path.open('rb') as source:
            for block in iter(lambda: source.read(1024 * 1024), b''):
                h.update(block)
    return h.hexdigest()

def copy_file(source, target, fd=None):
    target.parent.mkdir(parents=True, exist_ok=True)
    if fd is None:
        shutil.copyfile(source, target, follow_symlinks=False)
    else:
        with target.open('wb') as dest:
            offset = 0
            while True:
                block = os.pread(fd, 1024 * 1024, offset)
                if not block:
                    break
                dest.write(block)
                offset += len(block)
    shutil.copystat(source, target, follow_symlinks=False)

def select_packs(root):
    regular(root / 'system.json')
    system_bytes = (root / 'system.json').read_bytes()
    system = json.loads(system_bytes)
    packs = system.get('packs')
    if not isinstance(packs, list) or not packs:
        raise SnapshotError('system.json must declare at least one pack')
    names = set()
    paths = set()
    for pack in packs:
        name = pack.get('name', '') if isinstance(pack, dict) else ''
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', name) or name in ('.', '..'):
            raise SnapshotError('unsafe pack name')
        if pack.get('path') != 'packs/' + name or pack.get('type') != 'Item':
            raise SnapshotError('unsupported pack path/type; expected Item at packs/name')
        if name in names or pack['path'] in paths:
            raise SnapshotError('duplicate declared pack')
        names.add(name)
        paths.add(pack['path'])
        plain_path(root / pack['path'])
        if not (root / pack['path']).is_dir():
            raise SnapshotError('missing declared pack: ' + pack['path'])
        regular(root / pack['path'] / 'CURRENT')
        regular(root / pack['path'] / 'LOCK')
    return sorted(packs, key=lambda p: p['name']), hashlib.sha256(system_bytes).hexdigest()

def inventory(root, packs):
    files = set(REQUIRED)
    directories = set()
    for relative in REQUIRED:
        regular(root / relative)
    for pack in packs:
        base = root / pack['path']
        plain_path(base)
        directories.add(pack['path'])
        for current, dirs, names in os.walk(base, followlinks=False):
            for name in dirs:
                directory = Path(current) / name
                plain_path(directory)
                directories.add(directory.relative_to(root).as_posix())
            for name in names:
                file = Path(current) / name
                regular(file)
                files.add(file.relative_to(root).as_posix())
    return sorted(files), sorted(directories)

def validate_output(root, output):
    plain_path(root)
    plain_path(output)
    if not root.is_dir():
        raise SnapshotError('missing source root')
    if output.exists():
        raise SnapshotError('output already exists: ' + str(output))
    if output == root or (root in output.parents and root / 'release' not in output.parents):
        raise SnapshotError('unsafe output; inside source only release/ is permitted')
    if output == root / 'release':
        raise SnapshotError('unsafe output; use a unique release subdirectory')

def snapshot(root, stage):
    if sys.platform not in ('darwin', 'linux') or fcntl is None:
        raise SnapshotError('unsupported platform; POSIX darwin/linux required')
    validate_output(root, stage)
    packs, initial_system_hash = select_packs(root)
    held = {}
    try:
        # Acquire every pack lock before hashing or copying any source content.
        for pack in packs:
            relative = pack['path'] + '/LOCK'
            regular(root / relative)
            fd = os.open(root / relative, os.O_RDWR)
            try:
                fcntl.lockf(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as exc:
                os.close(fd)
                if exc.errno in (errno.EACCES, errno.EAGAIN):
                    raise SnapshotError('active or contested pack database: ' + pack['path']) from exc
                raise SnapshotError('cannot acquire pack lock: ' + pack['path'] + ': ' + str(exc)) from exc
            held[relative] = fd
        files, dirs = inventory(root, packs)
        def hashes():
            for relative, fd in held.items():
                actual, locked = (root / relative).stat(), os.fstat(fd)
                if (actual.st_dev, actual.st_ino) != (locked.st_dev, locked.st_ino):
                    raise SnapshotError('source LOCK replaced during capture')
            return {name: digest(root / name, held.get(name)) for name in files}
        before = hashes()
        if before['system.json'] != initial_system_hash:
            raise SnapshotError('source manifest changed during lock acquisition')
        stage.mkdir(parents=True, exist_ok=False)
        for directory in dirs:
            (stage / directory).mkdir(parents=True, exist_ok=True)
        for name in files:
            copy_file(root / name, stage / name, held.get(name))
        copied = {name: digest(stage / name) for name in files}
        after_files, after_dirs = inventory(root, packs)
        if files != after_files or dirs != after_dirs or before != copied or before != hashes():
            raise SnapshotError('source changed while snapshot was being captured')
        manifest = {'format': 'osp-houserules-br25-raw-v1', 'sourceRoot': str(root), 'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceFiles': before, 'directories': dirs, 'packs': packs, 'catalogs': list(CATALOGS), 'capture': 'all declared POSIX LOCKs held; original databases never opened'}
        (stage / 'raw-manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
        return manifest
    finally:
        for fd in held.values():
            os.close(fd)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    root, output = Path(os.path.abspath(args.root)), Path(os.path.abspath(args.output))
    tmp = None
    try:
        validate_output(root, output)
        if args.validate_only:
            packs, _ = select_packs(root)
            inventory(root, packs)
            print(json.dumps({'status': 'validated'}))
            return 0
        output.parent.mkdir(parents=True, exist_ok=True)
        tmp = output.parent / ('.' + output.name + '.raw-' + uuid.uuid4().hex)
        snapshot(root, tmp)
        if output.exists() or output.is_symlink():
            raise SnapshotError('output appeared before publish')
        os.rename(tmp, output)
        print(json.dumps({'output': str(output), 'status': 'captured'}))
        return 0
    except Exception as exc:
        if tmp is not None and tmp.exists():
            shutil.rmtree(tmp)  # Only this invocation's uniquely owned staging output.
        print(json.dumps({'error': type(exc).__name__, 'message': str(exc)}))
        return 2

if __name__ == '__main__':
    raise SystemExit(main())
