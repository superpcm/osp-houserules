#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrateWorld, summarizeWorld, validateWorldEnvelope, FORMAT, CURRENT_VERSION, MIGRATION_IDS } from "../migrations/br23-world.js";

const TOOL_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(TOOL_PATH), "..");
const CATALOG_NAMES = ["ammunition", "armor", "clothing", "gear", "livestock", "misc", "tack", "treasure", "vehicles", "weapons"];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const isObject = value => value && typeof value === "object" && !Array.isArray(value);
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const fail = message => { throw new Error(message); };

function help() { process.stdout.write("BR23 offline world migration\n\nUsage:\n  node scripts/br23-world-migrate.js dry-run --input FILE\n  node scripts/br23-world-migrate.js apply-copy --input FILE --output UNIQUE_DIR\n  node scripts/br23-world-migrate.js restore --backup DIR --output UNIQUE_DIR\n\nOffline JSON only; no Foundry native database support.\n"); }

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { mode: "help" };
  const mode = argv[0];
  const specs = { "dry-run": ["--input"], "apply-copy": ["--input", "--output"], restore: ["--backup", "--output"] };
  if (!specs[mode]) fail(`Unknown mode: ${mode || "(missing)"}`);
  if (argv.length !== 1 + specs[mode].length * 2) fail("Unexpected or missing CLI arguments");
  const values = {};
  for (let i = 1; i < argv.length; i += 2) {
    const option = argv[i];
    if (!specs[mode].includes(option)) fail(`Unknown CLI option: ${option}`);
    const key = option.slice(2);
    if (own(values, key)) fail(`Duplicate CLI option: ${option}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${option}`);
    values[key] = value;
  }
  return { mode, ...values };
}

function lstatSafe(file, label) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) { fail(`${label} is not accessible: ${error.message}`); }
  if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) fail(`${label} may not be a symlink or hardlink`);
  return stat;
}
function assertSafeAncestor(file, label) {
  let current = path.resolve(file); const root = path.parse(current).root;
  while (current !== root) { current = path.dirname(current); if (!fs.existsSync(current)) continue; if (fs.lstatSync(current).isSymbolicLink()) fail(`${label} has a symlink ancestor`); }
}
function assertAbsolute(file, label) { if (!path.isAbsolute(file)) fail(`${label} must be an absolute path`); }
function assertRegularFile(file, label) { assertAbsolute(file, label); assertSafeAncestor(file, label); const stat = lstatSafe(file, label); if (!stat.isFile()) fail(`${label} must be a regular file`); return stat; }
function assertDirectory(dir, label) { assertAbsolute(dir, label); assertSafeAncestor(dir, label); const stat = lstatSafe(dir, label); if (!stat.isDirectory()) fail(`${label} must be a directory`); return stat; }
function assertFreshOutput(dir) { assertAbsolute(dir, "output"); assertSafeAncestor(dir, "output"); let exists = false; try { fs.lstatSync(dir); exists = true; } catch (error) { if (error.code !== "ENOENT") fail(`output is not accessible: ${error.message}`); } if (exists) fail("output already exists"); assertDirectory(path.dirname(path.resolve(dir)), "output parent"); }
function pathsOverlap(a, b) { const left = path.resolve(a); const right = path.resolve(b); return left === right || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`); }
function readInput(file) {
  const stat = assertRegularFile(file, "input"); const bytes = fs.readFileSync(file); let world;
  try { world = JSON.parse(bytes.toString("utf8")); } catch (error) { fail(`input is not valid JSON: ${error.message}`); }
  const after = lstatSafe(file, "input"); if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ino !== stat.ino) fail("input changed while being read");
  return { bytes, world, stat, hash: sha256(bytes) };
}
function readJsonFile(file, label) {
  const bytes = fs.readFileSync(file); let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
  return { bytes, value };
}

function catalogBundle() {
  const files = {}; const entries = []; let catalogCount = 0;
  for (const name of CATALOG_NAMES) {
    const file = path.join(ROOT, "data", `${name}.json`); const bytes = fs.readFileSync(file); const value = JSON.parse(bytes.toString("utf8"));
    files[name] = { path: path.relative(ROOT, file), sha256: sha256(bytes), bytes: bytes.length };
    if (Array.isArray(value)) { entries.push(...value); catalogCount += value.length; }
  }
  const templatePath = path.join(ROOT, "template.json"); const templateBytes = fs.readFileSync(templatePath); const template = JSON.parse(templateBytes.toString("utf8"));
  const base = template?.Item?.templates?.base; if (!isObject(base)) fail("template.json does not contain Item.templates.base");
  return { catalogs: entries, baseDefaults: { base }, provenance: { catalogs: files, catalogCount, template: { path: "template.json", sha256: sha256(templateBytes), bytes: templateBytes.length } } };
}
function runtimeProvenance() {
  const packageBytes = fs.readFileSync(path.join(ROOT, "package.json")); const lockBytes = fs.readFileSync(path.join(ROOT, "package-lock.json")); const systemBytes = fs.readFileSync(path.join(ROOT, "system.json"));
  const pkg = JSON.parse(packageBytes.toString("utf8")); const system = JSON.parse(systemBytes.toString("utf8"));
  const sourceFiles = ["migrations/br23-world.js", "src/config/progression.js", "src/module/actor/level-up-state.js"];
  const implementation = Object.fromEntries(sourceFiles.map(relative => { const bytes = fs.readFileSync(path.join(ROOT, relative)); return [relative, { sha256: sha256(bytes), bytes: bytes.length }]; }));
  return { node: process.version, package: { version: pkg.version, sha256: sha256(packageBytes) }, system: { version: system.version, sha256: sha256(systemBytes) }, dependencies: { "package-lock.json": sha256(lockBytes) }, tool: { path: path.relative(ROOT, TOOL_PATH), sha256: sha256(fs.readFileSync(TOOL_PATH)) }, implementation };
}
function migrationInput(input) { const bundle = catalogBundle(); return { input, ...bundle, provenance: { ...bundle.provenance, runtime: runtimeProvenance() } }; }

function writeAtomic(dir, files, beforeRename = () => {}) {
  const parent = path.dirname(path.resolve(dir)); const stage = path.join(parent, `.${path.basename(dir)}.br23-stage-${process.pid}-${crypto.randomBytes(8).toString("hex")}`); fs.mkdirSync(stage, { mode: 0o700 });
  try {
    for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(stage, name), bytes, { flag: "wx", mode: 0o600 });
    for (const [name, bytes] of Object.entries(files)) if (sha256(fs.readFileSync(path.join(stage, name))) !== sha256(bytes)) fail(`staged file verification failed: ${name}`);
    beforeRename(); assertFreshOutput(dir); fs.renameSync(stage, dir);
  } catch (error) { if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true }); throw error; }
}
function sourceStillUnchanged(inputPath, original) {
  const stat = assertRegularFile(inputPath, "input"); const bytes = fs.readFileSync(inputPath);
  if (sha256(bytes) !== original.hash || stat.size !== original.stat.size || stat.mtimeMs !== original.stat.mtimeMs || stat.ino !== original.stat.ino) fail("source changed during migration");
}
function reportOnly(result) { process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`); if (result.report.errors.length) process.exitCode = 2; }

function applyCopy(inputPath, outputPath) {
  const original = readInput(inputPath); assertFreshOutput(outputPath); if (pathsOverlap(inputPath, outputPath)) fail("input and output overlap");
  const context = migrationInput(original); const result = migrateWorld(original.world, { catalogs: context.catalogs, baseDefaults: context.baseDefaults });
  if (result.report.errors.length) { reportOnly(result); fail("blocking migration issues; no output created"); }
  sourceStillUnchanged(inputPath, original);
  const worldBytes = Buffer.from(`${JSON.stringify(result.world, null, 2)}\n`); const backupSha = sha256(original.bytes);
  const manifest = { format: "osp-br23-backup-v1", worldFormat: FORMAT, source: { path: path.resolve(inputPath), originalSha256: backupSha, bytes: original.bytes.length, inode: original.stat.ino }, backupSha256: backupSha, outputSha256: sha256(worldBytes), version: CURRENT_VERSION, migrationIds: MIGRATION_IDS, timestamp: new Date().toISOString(), provenance: context.provenance, summary: { before: result.report.before, after: result.report.after }, report: result.report };
  const files = { "backup.json": original.bytes, "world.json": worldBytes, "manifest.json": Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) };
  writeAtomic(outputPath, files, () => sourceStillUnchanged(inputPath, original)); process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
}

function validateBackupManifest(manifest, original, backupDir) {
  if (!isObject(manifest) || manifest.format !== "osp-br23-backup-v1" || manifest.worldFormat !== FORMAT) fail("backup manifest format mismatch");
  if (manifest.version !== CURRENT_VERSION || JSON.stringify(manifest.migrationIds) !== JSON.stringify(MIGRATION_IDS)) fail("backup manifest version mismatch");
  if (!isObject(manifest.source) || manifest.source.originalSha256 !== sha256(original) || manifest.source.bytes !== original.length || manifest.backupSha256 !== sha256(original)) fail("backup manifest/hash/size mismatch");
  if (!isObject(manifest.summary) || !isObject(manifest.summary.before) || !isObject(manifest.summary.after)) fail("backup manifest summary is missing");
  let originalWorld; try { originalWorld = JSON.parse(original.toString("utf8")); } catch (error) { fail(`backup.json is not valid JSON: ${error.message}`); }
  if (validateWorldEnvelope(originalWorld).length) fail("backup source envelope is invalid");
  if (JSON.stringify(manifest.summary.before) !== JSON.stringify(summarizeWorld(originalWorld))) fail("backup source summary mismatch");
  const worldPath = path.join(backupDir, "world.json"); assertRegularFile(worldPath, "backup world.json"); const worldBytes = fs.readFileSync(worldPath);
  if (manifest.outputSha256 !== sha256(worldBytes)) fail("backup migrated-world hash mismatch");
  let world; try { world = JSON.parse(worldBytes.toString("utf8")); } catch (error) { fail(`backup world.json is not valid JSON: ${error.message}`); }
  if (world.format !== FORMAT || world.migrationVersion !== CURRENT_VERSION || JSON.stringify(world.migrationHistory) !== JSON.stringify(MIGRATION_IDS)) fail("backup world envelope is invalid");
  if (validateWorldEnvelope(world).length) fail("backup world document structure is invalid");
  if (JSON.stringify(manifest.summary.after) !== JSON.stringify(summarizeWorld(world))) fail("backup migrated-world summary mismatch");
}
function restore(backupDir, outputPath) {
  assertDirectory(backupDir, "backup"); assertFreshOutput(outputPath); if (pathsOverlap(backupDir, outputPath)) fail("backup and output overlap");
  const manifestFile = path.join(backupDir, "manifest.json"); const backupFile = path.join(backupDir, "backup.json"); assertRegularFile(manifestFile, "backup manifest"); assertRegularFile(backupFile, "backup.json");
  const manifestData = readJsonFile(manifestFile, "backup manifest"); const original = fs.readFileSync(backupFile); const worldFile = path.join(backupDir, "world.json");
  assertRegularFile(worldFile, "backup world.json"); const worldBytes = fs.readFileSync(worldFile); validateBackupManifest(manifestData.value, original, backupDir);
  const backupHash = sha256(original); const manifestHash = sha256(manifestData.bytes); const worldHash = sha256(worldBytes);
  if (sha256(fs.readFileSync(backupFile)) !== backupHash || sha256(fs.readFileSync(manifestFile)) !== manifestHash || sha256(fs.readFileSync(worldFile)) !== worldHash) fail("backup changed during restore");
  writeAtomic(outputPath, { "restored.json": original }, () => {
    for (const file of [backupFile, manifestFile, worldFile]) assertRegularFile(file, "backup child");
    if (sha256(fs.readFileSync(backupFile)) !== backupHash || sha256(fs.readFileSync(manifestFile)) !== manifestHash || sha256(fs.readFileSync(worldFile)) !== worldHash) fail("backup changed during restore");
  }); process.stdout.write(`${JSON.stringify({ restoredSha256: backupHash, bytes: original.length, summary: manifestData.value.summary.before })}\n`);
}

try {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.mode === "help") help();
  else if (parsed.mode === "dry-run") { const source = readInput(parsed.input); const context = migrationInput(source); const result = migrateWorld(source.world, { catalogs: context.catalogs, baseDefaults: context.baseDefaults }); sourceStillUnchanged(parsed.input, source); reportOnly(result); }
  else if (parsed.mode === "apply-copy") applyCopy(parsed.input, parsed.output);
  else restore(parsed.backup, parsed.output);
} catch (error) { process.stderr.write(`BR23 migration failed: ${error.message}\n`); process.exitCode = process.exitCode || 1; }
