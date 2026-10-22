#!/usr/bin/env node
/* BR-25 closed snapshot orchestrator.  Source databases are never opened. */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, stat, rm, writeFile, rename } from "node:fs/promises";
import { dirname, join, resolve, basename } from "node:path";
import { platform, release, arch } from "node:os";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";
import { validateLog } from "./leveldb-log-integrity.js";
import { validateTable } from "./leveldb-table-integrity.js";

const catalogs = ["ammunition.json", "armor.json", "clothing.json", "gear.json", "livestock.json", "misc.json", "spells.json", "tack.json", "treasure.json", "vehicles.json", "weapons.json"];
const required = [...catalogs.map(name => join("data", name)), "data/item-templates.js", "system.json", "template.json", "package.json", "package-lock.json"];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const json = value => JSON.stringify(value, null, 2) + "\n";

function args() {
  const values = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!["--root", "--output"].includes(key) || !argv[i + 1] || argv[i + 1].startsWith("--") || values[key]) {
      throw new Error("usage: node scripts/pack-snapshot.js --root ROOT --output UNIQUE_OUTPUT");
    }
    values[key] = argv[i + 1];
  }
  if (!values["--root"] || !values["--output"]) throw new Error("root and output are required");
  return { root: resolve(values["--root"]), output: resolve(values["--output"]) };
}

async function runRaw(root, output, validateOnly = false) {
  return new Promise((resolveResult, reject) => {
    const child = spawn("python3", [join(dirname(fileURLToPath(import.meta.url)), "pack-snapshot.py"), "--root", root, "--output", output, ...(validateOnly ? ["--validate-only"] : [])], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", chunk => { out += chunk; });
    child.stderr.on("data", chunk => { err += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolveResult({ out, err }) : reject(new Error(`raw snapshot failed (${code}): ${out || err}`)));
  });
}

async function canonicalPack(stage, packName) {
  const source = join(stage, "packs", packName);
  const disposable = join(stage, ".inspect", packName);
  await cp(source, disposable, { recursive: true });
  // Force native recovery diagnostics into a fresh disposable LOG. Historical
  // source LOG/LOG.old bytes were already checked by validateCapturedLogs.
  for (const file of await readdir(disposable)) {
    if (/^LOG(?:\..*)?$/.test(file)) await rm(join(disposable, file), { force: true });
  }
  const db = new ClassicLevel(disposable, { keyEncoding: "buffer", valueEncoding: "buffer", createIfMissing: false, errorIfExists: false });
  const entries = [];
  try {
    await db.open();
    for await (const [key, value] of db.iterator()) entries.push({ key: key.toString("base64"), value: value.toString("base64") });
  } finally { await db.close(); }
  entries.sort((a, b) => Buffer.from(a.key, "base64").compare(Buffer.from(b.key, "base64")));
  const exported = { format: "osp-houserules-br25-canonical-v1", pack: packName, entries };
  const freshPath = join(stage, ".roundtrip", packName);
  await mkdir(freshPath, { recursive: true });
  const fresh = new ClassicLevel(freshPath, { keyEncoding: "buffer", valueEncoding: "buffer", createIfMissing: true });
  try {
    await fresh.open();
    for (const entry of entries) await fresh.put(Buffer.from(entry.key, "base64"), Buffer.from(entry.value, "base64"));
    await fresh.close();
    const reopened = new ClassicLevel(freshPath, { keyEncoding: "buffer", valueEncoding: "buffer", createIfMissing: false });
    const roundtrip = [];
    try {
      await reopened.open();
      for await (const [key, value] of reopened.iterator()) roundtrip.push({ key: key.toString("base64"), value: value.toString("base64") });
    } finally { await reopened.close(); }
    if (json(roundtrip) !== json(entries)) throw new Error(`fresh round-trip mismatch: ${packName}`);
  } finally {
    try { await fresh.close(); } catch { /* already closed */ }
  }
  for (const file of await readdir(disposable)) {
    if (file !== "LOG") continue;
    const bytes = await readFile(join(disposable, file));
    const diagnostics = bytes.toString("utf8");
    if (/Corruption|ignoring error/i.test(diagnostics)) throw new Error(`native recovery reported corruption for ${packName}: ${diagnostics.trim()}`);
  }
  return { exported, nativeRecoveryVerified: true };
}

async function validateCapturedLogs(stage, packs, raw) {
  const diagnostics = {};
  for (const pack of packs) {
    const prefix = `packs/${pack}/`;
    const files = Object.keys(raw.sourceFiles).filter(file => file.startsWith(prefix) && !file.slice(prefix.length).includes("/") && (/^\d+\.log$/.test(file.slice(prefix.length)) || /^MANIFEST-\d+$/.test(file.slice(prefix.length))));
    const packDiagnostics = { physicalRecords: 0, logicalRecords: 0, files: 0 };
    for (const file of files) {
      const isWal = /^\d+\.log$/.test(file.slice(prefix.length));
      const result = validateLog(await readFile(join(stage, file)), { label: file, writeBatch: isWal });
      packDiagnostics.physicalRecords += result.physicalRecords;
      packDiagnostics.logicalRecords += result.logicalRecords;
      packDiagnostics.files += 1;
    }
    diagnostics[pack] = packDiagnostics;
  }
  return diagnostics;
}

async function validateCapturedTables(stage, raw) {
  const diagnostics = {};
  for (const file of Object.keys(raw.sourceFiles)) {
    if (!/\.(?:ldb|sst)$/.test(file)) continue;
    if ((await stat(join(stage, file))).size > 512 * 1024 * 1024) throw new Error(`${file}: table exceeds 512 MiB bound`);
    const result = validateTable(await readFile(join(stage, file)), { label: file });
    diagnostics[file] = result;
  }
  return diagnostics;
}

async function main() {
  const { root, output } = args();
  if (existsSync(output)) throw new Error(`output already exists: ${output}`);
  await runRaw(root, output, true);
  const parent = dirname(output);
  await mkdir(parent, { recursive: true });
  const stage = join(parent, `.${basename(output)}.build-${process.pid}-${Date.now()}`);
  if (existsSync(stage)) throw new Error(`staging collision: ${stage}`);
  try {
    await runRaw(root, stage);
    const raw = JSON.parse(await readFile(join(stage, "raw-manifest.json"), "utf8"));
    const packs = raw.packs.map(pack => pack.name);
    const tableIntegrity = await validateCapturedTables(stage, raw);
    const integrity = await validateCapturedLogs(stage, packs, raw);
    const canonical = {};
    const nativeRecovery = {};
    for (const pack of packs) {
      const result = await canonicalPack(stage, pack);
      canonical[pack] = result.exported;
      nativeRecovery[pack] = result.nativeRecoveryVerified;
    }
    await mkdir(join(stage, "canonical"), { recursive: true });
    for (const [pack, exported] of Object.entries(canonical)) await writeFile(join(stage, "canonical", `${pack}.json`), json(exported));
    const outputFiles = {};
    for (const file of required) outputFiles[file] = sha256(await readFile(join(stage, file)));
    for (const pack of packs) outputFiles[`canonical/${pack}.json`] = sha256(await readFile(join(stage, "canonical", `${pack}.json`)));
    const catalogDiagnostics = {};
    for (const catalog of catalogs) {
      const content = JSON.parse(await readFile(join(stage, "data", catalog), "utf8"));
      catalogDiagnostics[catalog] = { shape: Array.isArray(content) ? "array" : typeof content,
        count: Array.isArray(content) ? content.length : null };
    }
    // Structural diagnostics are evidence, not catalog fidelity acceptance.
    const packDiagnostics = {};
    for (const [name, exported] of Object.entries(canonical)) {
      const types = {};
      let itemDocuments = 0, invalidJsonValues = 0, otherRecords = 0;
      for (const entry of exported.entries) {
        let document;
        try { document = JSON.parse(Buffer.from(entry.value, "base64").toString("utf8")); }
        catch { invalidJsonValues++; continue; }
        if (document && typeof document === "object" && typeof document.name === "string" && typeof document.type === "string") {
          itemDocuments++;
          types[document.type] = (types[document.type] || 0) + 1;
        } else otherRecords++;
      }
      packDiagnostics[name] = { records: exported.entries.length, itemDocuments, types, invalidJsonValues, otherRecords,
        canonicalFileSha256: outputFiles[`canonical/${name}.json`], roundTripVerified: true,
        walIntegrityVerified: true, nativeRecoveryVerified: nativeRecovery[name],
        integrity: integrity[name],
        tableIntegrityVerified: Object.entries(tableIntegrity).filter(([file]) => file.startsWith(`packs/${name}/`)).every(([, result]) => result.tableIntegrityVerified),
        tableIntegrity: Object.fromEntries(Object.entries(tableIntegrity).filter(([file]) => file.startsWith(`packs/${name}/`))),
        rawTreeSha256: sha256(json(Object.fromEntries(Object.entries(raw.sourceFiles).filter(([file]) => file.startsWith(`packs/${name}/`))))),
        warnings: exported.entries.length ? [] : ["Empty database; catalog reconciliation required"] };
    }
    const toolDir = dirname(fileURLToPath(import.meta.url));
    const git = argv => {
      const result = spawnSync("git", argv, { cwd: root, encoding: "utf8", timeout: 5000 });
      return result.status === 0 ? { available: true, output: result.stdout.trim() } : { available: false, error: result.error?.message || result.stderr.trim() };
    };
    const provenance = {
      sourceRevision: git(["rev-parse", "HEAD"]), branch: git(["branch", "--show-current"]),
      workspaceStatus: git(["status", "--porcelain=v1", "--untracked-files=normal"]),
      runtime: { node: process.version, platform: platform(), osRelease: release(), architecture: arch(),
        python: spawnSync("python3", ["--version"], { encoding: "utf8" }).stdout.trim(),
        classicLevel: JSON.parse(await readFile(join(toolDir, "..", "node_modules", "classic-level", "package.json"), "utf8")).version },
      toolHashes: Object.fromEntries(await Promise.all(["pack-snapshot.js", "pack-snapshot.py", "leveldb-log-integrity.js", "leveldb-table-integrity.js"].map(async file => [file, sha256(await readFile(join(toolDir, file)))]))),
      validation: "implementer-reported; Foundry/catalog/release acceptance pending"
    };
    const manifest = {
      format: "osp-houserules-br25-snapshot-v1",
      builtAt: new Date().toISOString(),
      source: raw,
      packs,
      requiredFiles: required,
      catalogDiagnostics, packDiagnostics, provenance,
      walIntegrityVerified: true,
      tableIntegrityVerified: Object.values(tableIntegrity).every(result => result.tableIntegrityVerified),
      tableIntegrity,
      outputFiles,
      canonicalIdentity: sha256(Buffer.from(json({
        packs: Object.values(canonical),
        requiredFiles: outputFiles
      })))
    };
    await writeFile(join(stage, "snapshot-manifest.json"), json(manifest));
    await rm(join(stage, ".inspect"), { recursive: true, force: true });
    await rm(join(stage, ".roundtrip"), { recursive: true, force: true });
    if (existsSync(output)) throw new Error(`output appeared before atomic publish: ${output}`);
    await rename(stage, output);
    process.stdout.write(json({ status: "published", output, packs, canonicalIdentity: manifest.canonicalIdentity }));
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

main().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
