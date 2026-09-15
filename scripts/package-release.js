import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const system = JSON.parse(fs.readFileSync(path.join(root, 'system.json'), 'utf8'));
const releaseDir = path.join(root, 'release');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osp-houserules-release-'));
const stageDir = path.join(tempDir, 'osp-houserules');
const archive = path.join(releaseDir, `osp-houserules-v${system.version}.zip`);
const include = [
  'system.json', 'template.json', 'system-image.webp', 'README.md',
  'dist', 'assets', 'data', 'lang', 'templates',
];

fs.mkdirSync(stageDir, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });
for (const entry of include) {
  const source = path.join(root, entry);
  if (!fs.existsSync(source)) throw new Error(`Required release entry is missing: ${entry}`);
  fs.cpSync(source, path.join(stageDir, entry), { recursive: true });
}

for (const pack of system.packs || []) {
  const source = path.join(root, pack.path);
  const destination = path.join(stageDir, pack.path);
  if (!fs.existsSync(source)) throw new Error(`Required release pack is missing: ${pack.path}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

// Finder metadata must never enter a Foundry package.
for (const entry of fs.readdirSync(stageDir, { recursive: true })) {
  if (path.basename(entry).startsWith('._')) fs.rmSync(path.join(stageDir, entry), { force: true });
}

fs.rmSync(archive, { force: true });
const result = spawnSync('zip', ['-q', '-r', archive, '.'], { cwd: stageDir, stdio: 'inherit' });
if (result.status !== 0) throw new Error('Unable to create release archive.');
console.log(`Created ${path.relative(root, archive)}`);
