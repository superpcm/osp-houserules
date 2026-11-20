import { spawnSync } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
// Report is emitted by the exact encounter assertions used in npm test.
const candidate = `output/combat-encounter/report.json.candidate-${process.pid}`;
let exitCode = 1;
try {
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/combat-encounter.test.js'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, OSP_COMBAT_REPORT: candidate }
  });
  if (result.error) throw result.error;
  exitCode = result.status ?? 1;
  if (exitCode === 0) await rename(`${root}/${candidate}`, `${root}/output/combat-encounter/report.json`);
} finally {
  await rm(`${root}/${candidate}`, { force: true });
}
process.exitCode = exitCode;
