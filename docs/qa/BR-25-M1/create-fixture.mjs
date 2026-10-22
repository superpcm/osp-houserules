// Synthetic QA data only. Does not open or copy campaign databases.
import { ClassicLevel } from '../../../node_modules/classic-level/index.js';
import { mkdtemp, realpath, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = await realpath(await mkdtemp(join(tmpdir(), 'osp-br25-m1-fixture-')));
await mkdir(join(root, 'data'));
await mkdir(join(root, 'packs', 'qa-fixture'), { recursive: true });
await writeFile(join(root, 'system.json'), JSON.stringify({ id: 'osp-br25-synthetic-qa', version: '1.0.12', packs: [{ name: 'qa-fixture', path: 'packs/qa-fixture', type: 'Item' }] }, null, 2) + '\n');
await writeFile(join(root, 'template.json'), '{}\n');
for (const file of ['package.json', 'package-lock.json']) await writeFile(join(root, file), await readFile(file));
await writeFile(join(root, 'data', 'item-templates.js'), 'export default {};\n');
const docs = [1, 2].map(number => ({ _id: 'QAItem000000000' + number, name: 'Synthetic QA item ' + number, type: 'item', img: 'icons/svg/item-bag.svg', system: { quantity: 1, cost: number, unitWeight: number, storedSize: number, tags: ['synthetic-qa'] } }));
for (const catalog of ['ammunition', 'armor', 'clothing', 'gear', 'livestock', 'misc', 'spells', 'tack', 'treasure', 'vehicles', 'weapons']) await writeFile(join(root, 'data', catalog + '.json'), JSON.stringify(catalog === 'gear' ? docs : catalog === 'spells' ? {} : [], null, 2) + '\n');
const db = new ClassicLevel(join(root, 'packs', 'qa-fixture'), { keyEncoding: 'utf8', valueEncoding: 'json' });
try {
  await db.open();
  for (const doc of docs.toReversed()) await db.put('!items!' + doc._id, doc);
} finally { await db.close(); }
await writeFile('docs/qa/BR-25-M1/fixture-source-location.txt', root + '\n');
console.log(JSON.stringify({ fixtureRoot: root, documents: docs.length, classification: 'synthetic QA fixture; no campaign or release acceptance' }));
