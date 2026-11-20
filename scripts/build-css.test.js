import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

it('preserves the approved pre-Store stylesheet byte-for-byte', () => {
  const baseline = readFileSync(resolve('src/styles/pre-store-baseline.css'));
  expect(createHash('sha256').update(baseline).digest('hex'))
    .toBe('fcc00ea6081241fb9e76b3b507bd30071651637506f86eda89dfa97e31e05c5b');
});

it('builds additions without recompiling or replacing the existing theme', () => {
  const root = mkdtempSync(join(tmpdir(), 'osp-css-build-'));
  try {
    mkdirSync(join(root, 'src/styles'), { recursive: true });
    mkdirSync(join(root, 'dist'));
    const baseline = Buffer.from('/* Preserve formatting and line endings. */\r\n.sheet { color: #123456; }\r\n');
    writeFileSync(join(root, 'src/styles/pre-store-baseline.css'), baseline);
    writeFileSync(join(root, 'src/styles/ose.scss'), '.osp-store-app { .cart { color: red; } }');
    execFileSync(process.execPath, [resolve('scripts/build-css.js')], { cwd: root });
    const output = readFileSync(join(root, 'dist/ose.css'));
    expect(output.subarray(0, baseline.length).equals(baseline)).toBe(true);
    expect(output.subarray(baseline.length).toString()).toContain('.osp-store-app .cart');
    expect(readFileSync(join(root, 'src/styles/pre-store-baseline.css')).equals(baseline)).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
