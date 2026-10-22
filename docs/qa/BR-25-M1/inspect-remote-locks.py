# Read-only host inspection: stat LOCK inodes and match kernel advisory locks.
import json, os, re
from pathlib import Path
base = Path('/home/superpcm/foundry/narlington-data/Data/systems/osp-houserules')
report = {'inspection': 'read-only; no database open, shutdown or kill', 'packs': {}, 'errors': []}
identities = {}
for name in ('armor', 'gear', 'weapons'):
    file = base / 'packs' / name / 'LOCK'
    try:
        info = file.stat()
        identities[(os.major(info.st_dev), os.minor(info.st_dev), info.st_ino)] = name
        report['packs'][name] = {'path': str(file), 'device': [os.major(info.st_dev), os.minor(info.st_dev)], 'inode': info.st_ino, 'locks': []}
    except OSError as exc:
        report['errors'].append(str(exc))
try:
    for line in Path('/proc/locks').read_text().splitlines():
        parts = line.split()
        if len(parts) > 1 and parts[1] == '->':
            parts.pop(1)
        if len(parts) < 6:
            continue
        device = parts[5].split(':')
        if len(device) != 3:
            continue
        identity = (int(device[0], 16), int(device[1], 16), int(device[2]))
        if identity not in identities:
            continue
        pid = int(parts[4])
        holder = {'pid': pid, 'type': parts[1], 'mode': parts[3], 'kernelRecord': line}
        if pid > 0:
            for field, filename in [('processName', 'comm'), ('cgroup', 'cgroup')]:
                try:
                    holder[field] = (Path('/proc') / str(pid) / filename).read_text().strip()
                except OSError as exc:
                    holder[field + 'Error'] = str(exc)
        report['packs'][identities[identity]]['locks'].append(holder)
except OSError as exc:
    report['errors'].append(str(exc))
print(json.dumps(report, indent=2, sort_keys=True))
