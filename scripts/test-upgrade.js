#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const pkgJsonPath = path.join(cwd, 'package.json');
const lockPath = path.join(cwd, 'package-lock.json');
const pkgBak = pkgJsonPath + '.bak';
const lockBak = lockPath + '.bak';

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
  return res;
}

function saveBackups() {
  fs.copyFileSync(pkgJsonPath, pkgBak);
  if (fs.existsSync(lockPath)) fs.copyFileSync(lockPath, lockBak);
}

function restoreBackups() {
  if (fs.existsSync(pkgBak)) fs.copyFileSync(pkgBak, pkgJsonPath);
  if (fs.existsSync(lockBak)) {
    fs.copyFileSync(lockBak, lockPath);
    console.log('Restored package-lock.json from backup. Running `npm ci` to restore node_modules.');
    run('npm', ['ci', '--no-audit', '--no-fund'], { cwd });
  } else {
    // No lockfile to restore: reinstall from package.json
    console.log('No package-lock backup found. Running `npm install` to restore node_modules from package.json.');
    run('npm', ['install', '--no-audit', '--no-fund'], { cwd });
  }
}

function removeBackups() {
  if (fs.existsSync(pkgBak)) fs.unlinkSync(pkgBak);
  if (fs.existsSync(lockBak)) fs.unlinkSync(lockBak);
}

async function main() {
  const args = process.argv.slice(2);

  let packages = args.length ? args : [];
  if (packages.length === 0) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    packages = Object.keys(pkg.devDependencies || {});
    if (packages.length === 0) {
      console.error('No packages provided and no devDependencies found. Provide package names as args.');
      process.exit(1);
    }
  }

  console.log('Packages to test:', packages.join(', '));

  // Ensure we start from a clean backup
  saveBackups();

  const results = [];

  for (const p of packages) {
    console.log('\n---');
    console.log(`Testing upgrade for: ${p}`);

    // Determine whether package currently in devDependencies or dependencies
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const isDev = (pkg.devDependencies && pkg.devDependencies[p]) ? true : false;
    const saveFlag = isDev ? '--save-dev' : '--save';

    console.log(`Installing latest for ${p} (${isDev ? 'devDependency' : 'dependency'})`);
    const installRes = run('npm', ['install', `${p}@latest`, saveFlag, '--no-audit', '--no-fund'], { cwd });
    process.stdout.write(installRes.stdout || '');
    process.stderr.write(installRes.stderr || '');
    if (installRes.status !== 0) {
      console.error(`npm install failed for ${p} (exit ${installRes.status}). Reverting changes.`);
      restoreBackups();
      results.push({ package: p, success: false, reason: 'npm install failed' });
      // continue to next package using restored state
      continue;
    }

    console.log('Running build...');
    const buildRes = run('npm', ['run', 'build'], { cwd, env: process.env });
    process.stdout.write(buildRes.stdout || '');
    process.stderr.write(buildRes.stderr || '');
    if (buildRes.status !== 0) {
      console.error(`Build failed after upgrading ${p} (exit ${buildRes.status}). Reverting.`);
      restoreBackups();
      results.push({ package: p, success: false, reason: 'build failed' });
      continue;
    }

    console.log(`Upgrade and build succeeded for ${p}. Keeping changes.`);
    // Update backups to the new state (so next upgrade is incremental)
    saveBackups();
    results.push({ package: p, success: true });
  }

  console.log('\nUpgrade test summary:');
  for (const r of results) {
    console.log(` - ${r.package}: ${r.success ? 'OK' : `FAILED (${r.reason})`}`);
  }

  // Cleanup backups
  removeBackups();
}

main().catch(err => {
  console.error('Unexpected error:', err);
  try { restoreBackups(); } catch (e) {}
  process.exit(1);
});
