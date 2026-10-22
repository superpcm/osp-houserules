import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, expect, it, afterEach } from "vitest";
import { migrateWorld, FORMAT, CURRENT_VERSION, MIGRATION_IDS } from "../migrations/br23-world.js";

const root = path.resolve(".");
const fixturePath = path.join(root, "migrations/fixtures/br23-legacy-world.json");
const cliPath = path.join(root, "scripts/br23-world-migrate.js");
const fixtureBytes = () => fs.readFileSync(fixturePath);
const fixture = () => JSON.parse(fixtureBytes().toString("utf8"));
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const tempRoots = [];
afterEach(() => { while (tempRoots.length) fs.rmSync(tempRoots.pop(), { recursive: true, force: true }); });
function tempRoot() { const dir = fs.mkdtempSync(path.join("/private/tmp", "br23-cli-")); tempRoots.push(dir); return dir; }
function run(...args) { return spawnSync(process.execPath, [cliPath, ...args], { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }); }
function copyFixture(dir, name = "source.json") { const file = path.join(dir, name); fs.writeFileSync(file, fixtureBytes()); return file; }
const catalogs = ["ammunition", "armor", "clothing", "gear", "livestock", "misc", "tack", "treasure", "vehicles", "weapons"].flatMap(name => JSON.parse(fs.readFileSync(path.join(root, `data/${name}.json`))));
const options = { catalogs, baseDefaults: { base: JSON.parse(fs.readFileSync(path.join(root, "template.json"))).Item.templates.base } };

describe("BR23 pure contract", () => {
  it("keeps every loaded catalog identity unique and preserves canonical Staff metadata", () => {
    const identities = catalogs.map(item => `${item.type}\u0000${item.name}`);
    expect(new Set(identities).size).toBe(identities.length);
    const staff = catalogs.filter(item => item.type === "weapon" && item.name === "Staff");
    expect(staff).toHaveLength(1);
    expect(staff[0].img).toContain("mage-staff_thumb.webp");
    expect(staff[0].system).toMatchObject({ cost: 1, unitWeight: 4, storedSize: 15, damage: "1d6", damageL: "1d6", size: "L" });
    expect(staff[0].system.tags).toEqual(expect.arrayContaining(["focus", "mage"]));
  });
  it("rejects synthetic duplicate catalog identities", () => {
    const staff = catalogs.find(item => item.type === "weapon" && item.name === "Staff");
    const duplicate = migrateWorld(fixture(), { ...options, catalogs: [...catalogs, structuredClone(staff)] });
    expect(duplicate.report.errors.some(issue => issue.code === "duplicate-catalog-entry")).toBe(true);
    expect(duplicate.report.changes.some(change => change.path === "migrationVersion")).toBe(false);
  });
  it("uses current catalog defaults without overwriting custom physical values", () => {
    const input = fixture(); const result = migrateWorld(input, options);
    expect(result.report.errors).toEqual([]);
    const catalog = catalogs.find(item => item.name === "Backpack" && item.type === "container");
    expect(result.world.items[0].system.capacity).toEqual(catalog.system.capacity);
    expect(result.world.items[0].system.unitWeight).toBe(input.items[0].system.weight);
    expect(result.world.items[2].system.unitWeight).toBeUndefined();
    input.items[0].system.capacity = 99;
    const custom = migrateWorld(input, options);
    expect(custom.world.items[0].system.capacity).toBe(99);
    expect(custom.report.warnings.some(issue => issue.code === "catalog-discrepancy")).toBe(true);
    expect(custom.report.changes.slice(-2).map(change => change.path)).toEqual(["migrationVersion", "migrationHistory"]);
  });
  it("preserves legacy progression state and blocks conflicting missing baselines", () => {
    const input = fixture(); const state = { status: "pending", fromLevel: 2, targetLevel: 3 };
    input.actors[0].system.levelUpState = state;
    input.actors[0].flags["osp-houserules"].lastKnownLevel = 2;
    const result = migrateWorld(input, options);
    expect(result.report.errors).toEqual([]);
    expect(result.world.actors[0].system.levelUpState).toEqual(state);
    expect(result.world.actors[0].flags["osp-houserules"].levelUpState).toBeUndefined();
    expect(result.world.actors[0].flags["osp-houserules"].lastKnownLevel).toBe(2);
    delete input.actors[0].system.levelUpState;
    expect(migrateWorld(input, options).report.errors.some(issue => issue.code === "progression-baseline-mismatch")).toBe(true);
  });
  it.each([
    ["malformed flags", value => { value.actors[0].flags = 3; }],
    ["null embedded document", value => { value.actors[0].items.push(null); }],
    ["malformed pack", value => { value.compendiums[0].documents = {}; }],
    ["missing image", value => { value.assetIndex = []; }],
    ["future version", value => { value.migrationVersion = 6; }],
    ["negative version", value => { value.migrationVersion = -1; }],
    ["duplicate actors", value => { value.actors[1]._id = value.actors[0]._id; }],
    ["explicit kg override", value => { value.items[0].system.legacyWeightUnits = "kg"; }],
    ["ambiguous legacy Backpack", value => { value.items[0].type = "item"; }],
    ["null capacity", value => { value.items[0].system.capacity = { max: null }; }]
  ])("reports %s without committing migration markers", (_, mutate) => {
    const input = fixture(); mutate(input); const result = migrateWorld(input, options);
    expect(result.report.errors.length).toBeGreaterThan(0);
    expect(result.world.migrationVersion).toBe(input.migrationVersion);
    expect(result.report.changes.some(change => change.path === "migrationVersion")).toBe(false);
  });
  it("checks completed exports and resolves Item pack references in the pack scope", () => {
    const input = fixture();
    input.compendiums[0].documents = [structuredClone(input.items[0]), structuredClone(input.items[1])];
    const first = migrateWorld(input, options); expect(first.report.errors).toEqual([]);
    first.world.items[2].system.unitWeight = -1;
    expect(migrateWorld(first.world, options).report.errors.some(issue => issue.code === "malformed-existing-physical")).toBe(true);
    input.compendiums[0].documents.push(structuredClone(input.compendiums[0].documents[0]));
    expect(migrateWorld(input, options).report.errors.some(issue => issue.code === "duplicate-id")).toBe(true);
  });
  it("preserves ledgers, custom data, item snapshots and character state", () => {
    const input = fixture();
    const result = migrateWorld(input, { catalogs: [] });
    expect(result.report.errors).toEqual([]);
    expect(result.world.format).toBe(FORMAT);
    expect(result.world.migrationVersion).toBe(CURRENT_VERSION);
    expect(result.world.migrationHistory).toEqual(MIGRATION_IDS);
    expect(result.world.actors[0].system.hitpoints).toEqual(input.actors[0].system.hitpoints);
    expect(result.world.actors[0].system.maxhitpoints).toEqual(input.actors[0].system.maxhitpoints);
    expect(result.world.actors[0].system.xp).toEqual(input.actors[0].system.xp);
    expect(result.world.actors[0].flags["osp-houserules"].customActorData).toEqual({ origin: "synthetic" });
    expect(result.world.actors[0].flags["osp-houserules"].bankLedger.currency).toEqual(input.actors[0].flags["osp-houserules"].bankLedger.currency);
    expect(result.world.actors[0].flags["osp-houserules"].bankLedger.items[0].itemData).toEqual(input.actors[0].flags["osp-houserules"].bankLedger.items[0].itemData);
    expect(result.world.settings["osp-houserules.inventoryOperationReceipts"]).toEqual(input.settings["osp-houserules.inventoryOperationReceipts"]);
  });
  it("is repeat safe and rejects malformed units, ledgers, references and journals", () => {
    const first = migrateWorld(fixture(), { catalogs: [] });
    const second = migrateWorld(first.world, { catalogs: [] });
    expect(second.report.errors).toEqual([]);
    expect(second.report.changes).toEqual([]);
    expect(JSON.stringify(second.world)).toBe(JSON.stringify(first.world));
    for (const mutate of [
      value => { value.source.legacyWeightUnits = "kg"; delete value.items[0].system.legacyWeightUnits; },
      value => { value.settings["osp-houserules.partyTreasury"].currency = { gold: 1 }; },
      value => { value.items[1].system.containerId = "missing"; },
      value => { value.actors[0].flags["osp-houserules"].pendingInventoryTransaction = { id: "pending" }; }
    ]) {
      const value = fixture(); mutate(value);
      expect(migrateWorld(value, { catalogs: [] }).report.errors.length).toBeGreaterThan(0);
    }
  });
  it("keeps collection scoped IDs independent while rejecting local collisions", () => {
    const value = fixture();
    value.actors[0].items[0]._id = "world-backpack";
    expect(migrateWorld(value, { catalogs: [] }).report.errors).toEqual([]);
    value.actors[0].items.push({ ...value.actors[0].items[0] });
    expect(migrateWorld(value, { catalogs: [] }).report.errors.some(error => error.code === "duplicate-id")).toBe(true);
  });
  it("derives a missing baseline from class, race and XP without rewriting character history", () => {
    const value = fixture();
    value.actors[0].system.level = 1;
    const result = migrateWorld(value, { catalogs: [] });
    const state = result.world.actors[0].flags["osp-houserules"].levelUpState;
    expect(state.fromLevel).toBe(3);
    expect(state.targetLevel).toBe(3);
    expect(result.world.actors[0].system.level).toBe(1);
    expect(result.world.actors[0].system.hitpoints).toBe(value.actors[0].system.hitpoints);
    expect(result.world.actors[0].system.maxhitpoints).toBe(value.actors[0].system.maxhitpoints);
    expect(result.world.actors[0].system.xp).toBe(value.actors[0].system.xp);
  });
});

describe("BR23 CLI filesystem contract", () => {
  it("dry-run emits JSON only and never writes beside the source", () => {
    const dir = tempRoot(); const input = copyFixture(dir); const before = sha(fs.readFileSync(input));
    const result = run("dry-run", "--input", input);
    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stderr).toBe("");
    expect(sha(fs.readFileSync(input))).toBe(before);
    expect(fs.readdirSync(dir)).toEqual(["source.json"]);
  });
  it("apply-copy records a byte backup, hashes and provenance, and repeats with no changes", () => {
    const dir = tempRoot(); const input = copyFixture(dir); const output = path.join(dir, "first");
    const applied = run("apply-copy", "--input", input, "--output", output);
    expect(applied.status).toBe(0);
    const original = fs.readFileSync(input); const manifest = JSON.parse(fs.readFileSync(path.join(output, "manifest.json"), "utf8"));
    expect(fs.readFileSync(path.join(output, "backup.json"))).toEqual(original);
    expect(manifest.format).toBe("osp-br23-backup-v1");
    expect(manifest.source.originalSha256).toBe(sha(original));
    expect(manifest.source.bytes).toBe(original.length);
    expect(manifest.provenance.template.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.provenance.runtime.tool.sha256).toMatch(/^[0-9a-f]{64}$/);
    const repeat = run("apply-copy", "--input", path.join(output, "world.json"), "--output", path.join(dir, "repeat"));
    expect(repeat.status).toBe(0);
    expect(JSON.parse(repeat.stdout).changes).toEqual([]);
  });
  it("restores original bytes and refuses corrupt or unsafe backup children", () => {
    const dir = tempRoot(); const input = copyFixture(dir); const output = path.join(dir, "first");
    const applied = run("apply-copy", "--input", input, "--output", output);
    expect(applied.status, applied.stderr).toBe(0);
    const restored = path.join(dir, "restored"); const result = run("restore", "--backup", output, "--output", restored);
    expect(result.status).toBe(0); expect(fs.readFileSync(path.join(restored, "restored.json"))).toEqual(fs.readFileSync(input));
    const corrupt = path.join(dir, "corrupt"); fs.cpSync(output, corrupt, { recursive: true });
    fs.writeFileSync(path.join(corrupt, "backup.json"), Buffer.from("{}\n"));
    const failed = run("restore", "--backup", corrupt, "--output", path.join(dir, "bad-restore"));
    expect(failed.status).not.toBe(0); expect(fs.existsSync(path.join(dir, "bad-restore"))).toBe(false);
    const unsafe = path.join(dir, "unsafe"); fs.cpSync(output, unsafe, { recursive: true }); fs.unlinkSync(path.join(unsafe, "backup.json")); fs.symlinkSync(input, path.join(unsafe, "backup.json"));
    const unsafeResult = run("restore", "--backup", unsafe, "--output", path.join(dir, "unsafe-restore"));
    expect(unsafeResult.status).not.toBe(0); expect(fs.existsSync(path.join(dir, "unsafe-restore"))).toBe(false);
    const hard = path.join(dir, "hardlink"); fs.cpSync(output, hard, { recursive: true });
    fs.unlinkSync(path.join(hard, "backup.json")); fs.linkSync(input, path.join(hard, "backup.json"));
    expect(run("restore", "--backup", hard, "--output", path.join(dir, "hard-restore")).status).not.toBe(0);
    expect(fs.existsSync(path.join(dir, "hard-restore"))).toBe(false);
    const corruptManifest = path.join(dir, "manifest-corrupt"); fs.cpSync(output, corruptManifest, { recursive: true });
    const manifestPath = path.join(corruptManifest, "manifest.json"); const manifest = JSON.parse(fs.readFileSync(manifestPath));
    manifest.summary.before.records[0].quantity = 999; fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(run("restore", "--backup", corruptManifest, "--output", path.join(dir, "manifest-restore")).status).not.toBe(0);
    expect(fs.existsSync(path.join(dir, "manifest-restore"))).toBe(false);
  });
  it("rejects extra, duplicate and unsafe path arguments without output", () => {
    const dir = tempRoot(); const input = copyFixture(dir);
    for (const args of [
      ["dry-run", "--input", input, "--extra", "x"],
      ["dry-run", "--input", input, "--input", input],
      ["dry-run", "--input", input, "extra"],
      ["dry-run", "--input", "relative.json"],
      ["apply-copy", "--input", input, "--output", input]
    ]) {
      const result = run(...args); expect(result.status).not.toBe(0);
    }
    expect(fs.readdirSync(dir)).toEqual(["source.json"]);
    const dangling = path.join(dir, "dangling"); fs.symlinkSync(path.join(dir, "missing"), dangling);
    expect(run("apply-copy", "--input", input, "--output", dangling).status).not.toBe(0);
    expect(fs.lstatSync(dangling).isSymbolicLink()).toBe(true);
  });
});
