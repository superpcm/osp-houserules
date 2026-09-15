import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const system = readJson('system.json');
const pkg = readJson('package.json');
const errors = [];

if (pkg.version !== system.version) {
  errors.push(`Version mismatch: package.json=${pkg.version}, system.json=${system.version}`);
}

for (const relativePath of [...(system.esmodules || []), ...(system.styles || [])]) {
  if (!fs.existsSync(path.join(root, relativePath))) errors.push(`Missing manifest asset: ${relativePath}`);
}

const builtModule = path.join(root, system.esmodules?.[0] || '');
if (system.esmodules?.length && fs.existsSync(builtModule)) {
  const syntax = spawnSync(process.execPath, ['--check', builtModule], { encoding: 'utf8' });
  if (syntax.status !== 0) errors.push(`Built JavaScript is invalid: ${syntax.stderr.trim()}`);
}

for (const pack of system.packs || []) {
  if (!fs.existsSync(path.join(root, pack.path))) errors.push(`Missing compendium: ${pack.path}`);
}

const expectedTag = `/v${system.version}/`;
if (!system.download?.includes(expectedTag)) {
  errors.push(`Download URL is not pinned to release v${system.version}`);
}

if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Release manifest validated for v${system.version}.`);
