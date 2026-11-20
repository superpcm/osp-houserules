#!/usr/bin/env node
/* Read only a disposable copy of Westford's actors LevelDB. */
import { cp, mkdtemp, readFile, readdir, rm, unlink, writeFile, mkdir, rename } from 'node:fs/promises';
import { tmpdir, platform, arch } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(process.argv[2] ?? join(root, '../../worlds/westford/data/actors'));
const fixturePath = resolve(process.argv[3] ?? join(root, 'tests/fixtures/westford-combat-party.json'));
const usersSource = resolve(join(source, '..', 'users'));
const worldData = dirname(source);
if (fixturePath === worldData || fixturePath.startsWith(`${worldData}/`)) throw new Error('fixture output must not be inside live world data');
const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const snapshot = async directory => {
  const names = (await readdir(directory)).filter(name => name !== 'LOCK' && !name.startsWith('._')).sort();
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await digest(join(directory, name))])));
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const before = await snapshot(source), usersBefore = await snapshot(usersSource);
const disposable = await mkdtemp(join(tmpdir(), 'osp-combat-actors-'));
const usersDisposable = await mkdtemp(join(tmpdir(), 'osp-combat-users-'));
let nativeDir;
const previousPrebuild = process.env.CLASSIC_LEVEL_PREBUILD;
const temporaryFixture = `${fixturePath}.tmp-${process.pid}`;
try {
  await cp(source, disposable, { recursive: true });
  try { await unlink(join(disposable, 'LOCK')); } catch { /* absent in some snapshots */ }
  if (!same(before, await snapshot(disposable)) || !same(before, await snapshot(source))) throw new Error('actors source changed during copy');
  const prebuildRoot = join(root, 'node_modules/classic-level/prebuilds');
  const tuple = (await readdir(prebuildRoot)).find(name => name.startsWith(`${platform()}-`) && name.includes(arch()));
  if (!tuple) throw new Error(`No classic-level prebuild for ${platform()} ${arch()}`);
  const native = join(prebuildRoot, tuple, 'classic-level.node');
  nativeDir = await mkdtemp(join(tmpdir(), 'osp-combat-native-'));
  await mkdir(join(nativeDir, 'build/Release'), { recursive: true });
  await cp(native, join(nativeDir, 'build/Release/classic-level.node'));
  process.env.CLASSIC_LEVEL_PREBUILD = nativeDir;
  const { ClassicLevel } = await import('classic-level');
  const db = new ClassicLevel(disposable, { keyEncoding: 'buffer', valueEncoding: 'buffer', createIfMissing: false });
  await db.open();
  const records = [];
  try {
    for await (const [key, value] of db.iterator()) {
      try { const document = JSON.parse(value.toString('utf8')); if (document?._id && document.type) records.push({ key: key.toString('utf8'), document }); } catch { /* index records */ }
    }
  } finally { await db.close(); }
  const actorRecords = records.filter(record => record.key.startsWith('!actors!') && record.document.type === 'character');
  const actors = actorRecords.map(({ document: record }) => ({ _id: record._id, name: record.name, type: record.type, system: record.system, items: records.filter(item => item.key.startsWith(`!actors.items!${record._id}.`)).map(item => ({ ...item.document, _id: item.key.split('.').at(-1) })), flags: record.flags ?? {}, ownership: record.ownership ?? {}, folder: record.folder ?? null }));
  if (!actors.length) throw new Error('No character actor documents found in copied actors database.');
  await cp(usersSource, usersDisposable, { recursive: true });
  try { await unlink(join(usersDisposable, 'LOCK')); } catch { /* absent */ }
  if (!same(usersBefore, await snapshot(usersDisposable)) || !same(usersBefore, await snapshot(usersSource))) throw new Error('users source changed during copy');
  const usersDb = new ClassicLevel(usersDisposable, { keyEncoding: 'buffer', valueEncoding: 'buffer', createIfMissing: false });
  await usersDb.open();
  const users = [];
  try { for await (const [key, value] of usersDb.iterator()) if (key.toString('utf8').startsWith('!users!')) { try { const user = JSON.parse(value.toString('utf8')); if (user?._id) users.push({ _id: user._id, name: user.name, role: user.role, character: user.character ?? null }); } catch { /* index */ } } } finally { await usersDb.close(); }
  if (!same(before, await snapshot(source)) || !same(usersBefore, await snapshot(usersSource))) throw new Error('world source changed during capture; retry while idle');
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(temporaryFixture, `${JSON.stringify({ format: 'osp-westford-combat-party-v2', source, capturedAt: new Date().toISOString(), sourceFiles: before, usersSourceFiles: usersBefore, actorCount: actors.length, actors, users }, null, 2)}\n`, { flag: 'wx' });
  await rename(temporaryFixture, fixturePath);
  console.log(JSON.stringify({ fixturePath, actorCount: actors.length, names: actors.map(actor => actor.name), sourceUnchanged: true }, null, 2));
} finally {
  await rm(disposable, { recursive: true, force: true });
  await rm(usersDisposable, { recursive: true, force: true });
  if (nativeDir) await rm(nativeDir, { recursive: true, force: true });
  await rm(temporaryFixture, { force: true });
  if (previousPrebuild === undefined) delete process.env.CLASSIC_LEVEL_PREBUILD;
  else process.env.CLASSIC_LEVEL_PREBUILD = previousPrebuild;
}
