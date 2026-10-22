import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, writeFile, symlink, link, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { ClassicLevel } from "classic-level";
import { validateTable } from "./leveldb-table-integrity.js";

const exec = promisify(execFile);
const script = join(process.cwd(), "scripts", "pack-snapshot.js");
const helper = join(process.cwd(), "scripts", "pack-snapshot.py");
const catalogs = ["ammunition", "armor", "clothing", "gear", "livestock", "misc", "spells", "tack", "treasure", "vehicles", "weapons"];
const temps = [];
const temp = async () => { const path = await realpath(await mkdtemp(join(tmpdir(), "osp-br25-test-"))); temps.push(path); return path; };
const output = async () => join(await temp(), "snapshot");
const build = (root, destination) => exec(process.execPath, [script, "--root", root, "--output", destination]);

async function hashes(root, excludeLocks = false) {
  const result = {};
  async function walk(path, prefix = "") {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), name + "/");
      else if (!(excludeLocks && entry.name === "LOCK")) result[name] = createHash("sha256").update(await readFile(join(path, entry.name))).digest("hex");
    }
  }
  await walk(root);
  return result;
}

async function fixture({ empty = false, large = false } = {}) {
  const root = await temp();
  await mkdir(join(root, "data"));
  await mkdir(join(root, "packs", "alpha"), { recursive: true });
  await writeFile(join(root, "system.json"), JSON.stringify({ id: "fixture", packs: [{ name: "alpha", path: "packs/alpha", type: "Item" }] }));
  for (const file of ["template.json", "package.json", "package-lock.json"]) await writeFile(join(root, file), "{}\n");
  await writeFile(join(root, "data", "item-templates.js"), "export default {};\n");
  for (const name of catalogs) await writeFile(join(root, "data", `${name}.json`), JSON.stringify([{ name, type: "item", system: { cost: 1 } }]));
  const db = new ClassicLevel(join(root, "packs", "alpha"), { keyEncoding: "buffer", valueEncoding: "buffer" });
  try {
    await db.open();
    if (!empty) for (const number of (large ? Array.from({ length: 40 }, (_, index) => index + 1) : [2, 1])) await db.put(Buffer.from([number]), Buffer.from(JSON.stringify({ _id: String(number), name: `item ${number}`, type: "item", system: { cost: number } })));
  } finally { await db.close(); }
  return root;
}

afterEach(async () => { await Promise.all(temps.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

// Inject mutations only in a disposable test process; production has no test hook.
async function pythonWith(root, destination, injection) {
  const code = `import importlib.util,sys\nspec=importlib.util.spec_from_file_location('snapshot',sys.argv[1])\nm=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(m)\nroot=m.Path(sys.argv[2])\n${injection}\nsys.argv=['snapshot','--root',sys.argv[2],'--output',sys.argv[3]]\nraise SystemExit(m.main())`;
  try { return await exec("python3", ["-c", code, helper, root, destination]); }
  catch (error) { error.message += "\n" + error.stdout + "\n" + error.stderr; throw error; }
}

describe("BR-25 closed pack/catalog snapshot", () => {
  it("preserves every original byte and exports sorted records with a stable pack/catalog identity", async () => {
    const root = await fixture();
    // An undeclared local pack is evidence, not an implicit release input.
    await mkdir(join(root, "packs", "undeclared"));
    await writeFile(join(root, "packs", "undeclared", "LOG"), "local only");
    const before = await hashes(root);
    const first = await output(), second = await output();
    await build(root, first); await build(root, second);
    const a = JSON.parse(await readFile(join(first, "snapshot-manifest.json"), "utf8"));
    const b = JSON.parse(await readFile(join(second, "snapshot-manifest.json"), "utf8"));
    expect(a.packs).toEqual(["alpha"]);
    expect(a.canonicalIdentity).toBe(b.canonicalIdentity);
    expect(a.packDiagnostics.alpha).toMatchObject({ records: 2, itemDocuments: 2, roundTripVerified: true });
    const exported = JSON.parse(await readFile(join(first, "canonical", "alpha.json"), "utf8"));
    expect(exported.entries.map(entry => entry.key)).toEqual(["AQ==", "Ag=="]);
    const raw = JSON.parse(await readFile(join(first, "raw-manifest.json"), "utf8"));
    for (const [name, expected] of Object.entries(raw.sourceFiles)) expect(createHash("sha256").update(await readFile(join(first, name))).digest("hex")).toBe(expected);
    expect(await hashes(root)).toEqual(before);
    await expect(stat(join(first, ".inspect"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 60000);

  it("includes a changed catalog in the canonical identity", async () => {
    const root = await fixture(); const first = await output(), second = await output();
    await build(root, first);
    await writeFile(join(root, "data", "weapons.json"), '[{"name":"changed","system":{"cost":9}}]');
    await build(root, second);
    const a = JSON.parse(await readFile(join(first, "snapshot-manifest.json"), "utf8"));
    const b = JSON.parse(await readFile(join(second, "snapshot-manifest.json"), "utf8"));
    expect(a.canonicalIdentity).not.toBe(b.canonicalIdentity);
  }, 60000);

  it("fails closed while ClassicLevel actually holds the original LOCK", async () => {
    const root = await fixture(); const destination = await output();
    const held = new ClassicLevel(join(root, "packs", "alpha"), { createIfMissing: false });
    try {
      await held.open();
      // Reading/closing a second LOCK descriptor in this process would release ClassicLevel's lock.
      const before = await hashes(root, true);
      await expect(build(root, destination)).rejects.toThrow(/active or contested/);
      expect(await hashes(root, true)).toEqual(before);
      await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await held.close(); }
  }, 30000);

  it("keeps the POSIX lock held after source LOCK has been hashed and copied", async () => {
    const root = await fixture(); const destination = await output();
    const probe = "import fcntl,os,sys\\nfd=os.open(sys.argv[1],os.O_RDWR)\\ntry:\\n    fcntl.lockf(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)\\n    sys.exit(7)\\nexcept BlockingIOError:\\n    sys.exit(0)\\nfinally:\\n    os.close(fd)".replaceAll("\\n", "\n");
    const injection = `import subprocess\noriginal=m.copy_file\ndef copy(source,target,fd=None):\n    original(source,target,fd)\n    if source.name=='LOCK':\n        result=subprocess.run(['python3','-c',${JSON.stringify(probe)},str(source)],capture_output=True)\n        if result.returncode!=0: raise m.SnapshotError('lock was released during hashing/copying')\nm.copy_file=copy`;
    await pythonWith(root, destination, injection);
    expect(JSON.parse(await readFile(join(destination, "raw-manifest.json"), "utf8")).packs).toHaveLength(1);
  }, 30000);

  it("reports an empty database without treating it as catalog acceptance", async () => {
    const root = await fixture({ empty: true }); const destination = await output();
    await build(root, destination);
    const report = JSON.parse(await readFile(join(destination, "snapshot-manifest.json"), "utf8"));
    expect(report.packDiagnostics.alpha).toMatchObject({ records: 0, roundTripVerified: true });
    expect(report.packDiagnostics.alpha.warnings).toHaveLength(1);
  }, 30000);

  it("refuses existing or unsafe output without modifying source inputs", async () => {
    const root = await fixture(); const destination = await output(); await mkdir(destination);
    await writeFile(join(destination, "sentinel"), "preserve");
    const before = await hashes(root);
    await expect(build(root, destination)).rejects.toThrow(/output already exists/);
    await expect(build(root, join(root, "data", "new-output"))).rejects.toThrow(/unsafe output/);
    expect(await readFile(join(destination, "sentinel"), "utf8")).toBe("preserve");
    expect(await hashes(root)).toEqual(before);
  }, 30000);

  it("rejects missing inputs and symlink/hardlink input aliases", async () => {
    const root = await fixture();
    await rm(join(root, "template.json"));
    await expect(build(root, await output())).rejects.toThrow(/missing input/);
    await writeFile(join(root, "template.json"), "{}");
    await rm(join(root, "data", "weapons.json"));
    await symlink(join(root, "data", "gear.json"), join(root, "data", "weapons.json"));
    await expect(build(root, await output())).rejects.toThrow(/symlink/);
    await rm(join(root, "data", "weapons.json")); await writeFile(join(root, "data", "weapons.json"), "[]");
    await link(join(root, "packs", "alpha", "LOCK"), join(root, "packs", "alpha", "alias"));
    await expect(build(root, await output())).rejects.toThrow(/hardlinked/);
  }, 30000);

  it("rejects malformed databases rather than silently creating a fresh empty pack", async () => {
    const root = await fixture(); const destination = await output();
    await writeFile(join(root, "packs", "alpha", "CURRENT"), "not a manifest\n");
    const before = await hashes(root);
    await expect(build(root, destination)).rejects.toThrow();
    await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await hashes(root)).toEqual(before);
  }, 30000);

  it("fails closed when a captured WAL byte is corrupted", async () => {
    const root = await fixture({ large: true }); const destination = await output();
    const wal = (await readdir(join(root, "packs", "alpha"))).find(name => /^\d+\.log$/.test(name));
    expect(wal).toBeDefined();
    const bytes = Buffer.from(await readFile(join(root, "packs", "alpha", wal)));
    expect(bytes.length).toBeGreaterThan(255);
    bytes[255] ^= 0xff;
    await writeFile(join(root, "packs", "alpha", wal), bytes);
    const before = await hashes(root);
    await expect(build(root, destination)).rejects.toThrow(/checksum|record|WAL|log/i);
    await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await hashes(root)).toEqual(before);
  }, 30000);

  it.each([false, true])("checks real compacted SSTs with compression=%s and rejects stale CRC", async compression => {
    const root = await fixture();
    const pack = join(root, "packs", "alpha");
    const db = new ClassicLevel(pack, { keyEncoding: "buffer", valueEncoding: "buffer", createIfMissing: false, compression });
    try {
      await db.open();
      await db.put(Buffer.from("independent-sst-key"), Buffer.from(JSON.stringify({ name: "SST original sentinel", type: "item", payload: "repeated-content".repeat(2048) })));
      await db.compactRange(Buffer.alloc(0), Buffer.from([255, 255, 255]));
    } finally { await db.close(); }
    let tables = (await readdir(pack)).filter(file => /\.ldb$/.test(file));
    expect(tables.length).toBeGreaterThan(0);
    if (!compression) {
      const renamed = tables[0].replace(/\.ldb$/, ".sst");
      await rename(join(pack, tables[0]), join(pack, renamed));
      tables[0] = renamed;
    }
    let compressedBlocks = 0;
    for (const file of tables) compressedBlocks += validateTable(await readFile(join(pack, file))).compressedBlocks;
    if (compression) expect(compressedBlocks).toBeGreaterThan(0);
    const beforeClean = await hashes(root);
    const clean = await output(); await build(root, clean);
    expect(await hashes(root)).toEqual(beforeClean);
    const report = JSON.parse(await readFile(join(clean, "snapshot-manifest.json"), "utf8"));
    expect(report.packDiagnostics.alpha).toMatchObject({ records: 3, tableIntegrityVerified: true, roundTripVerified: true });
    if (compression) {
      const file = tables[0]; const bytes = Buffer.from(await readFile(join(pack, file)));
      bytes[0] ^= 255; await writeFile(join(pack, file), bytes);
    } else {
      let changed = false;
      for (const file of tables) {
        const bytes = Buffer.from(await readFile(join(pack, file)));
        const offset = bytes.indexOf("SST original sentinel");
        if (offset >= 0) { bytes.write("SST modified sentinel", offset); await writeFile(join(pack, file), bytes); changed = true; break; }
      }
      expect(changed).toBe(true);
    }
    const beforeCorrupt = await hashes(root), destination = await output();
    await expect(build(root, destination)).rejects.toThrow(/checksum/);
    expect(await hashes(root)).toEqual(beforeCorrupt);
    await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  }, 60000);

  it.each(["change", "add"])("rejects source %s during copy and publishes no partial output", async mode => {
    const root = await fixture(); const destination = await output();
    const mutation = mode === "change" ? "(root/'data/weapons.json').write_text('[]')" : "(root/'packs/alpha/new-file').write_text('new')";
    const injection = `original=m.copy_file\nmutated=[]\ndef copy(source,target,fd=None):\n    original(source,target,fd)\n    if not mutated:\n        ${mutation}\n        mutated.append(True)\nm.copy_file=copy`;
    await expect(pythonWith(root, destination, injection)).rejects.toThrow(/source changed/);
    await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  }, 30000);

  it("fails closed on unsupported platforms and unsafe manifest paths", async () => {
    const root = await fixture();
    await expect(pythonWith(root, await output(), "m.sys.platform='win32'")).rejects.toThrow(/unsupported platform/);
    await writeFile(join(root, "system.json"), JSON.stringify({ packs: [{ name: "alpha", path: "../outside", type: "Item" }] }));
    await expect(build(root, await output())).rejects.toThrow(/unsupported pack path/);
  }, 30000);
});
