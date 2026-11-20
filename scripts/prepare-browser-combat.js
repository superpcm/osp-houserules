#!/usr/bin/env node
import { chmod, cp, mkdir, readFile, rename, writeFile, readdir } from "node:fs/promises";
import { existsSync, lstatSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";

const repo = resolve(dirname(new URL(import.meta.url).pathname), "..");
const tmpPrefix = "/private/tmp/osp-browser-combat-";
const appRoot = process.env.OSP_FOUNDRY_APP || "/Users/paul/Applications/FoundryVTT-Node-14.367";
const nodeBinary = process.env.OSP_NODE24 || "/opt/homebrew/opt/node@24/bin/node";
const source = resolve(repo);
const root = process.env.OSP_BROWSER_COMBAT_ROOT || `${tmpPrefix}${Date.now()}-${randomBytes(5).toString("hex")}`;
const worldId = "osp-browser-combat";
const port = 31051;
const moduleSource = join(source, "tests/browser/module");

function fail(message) { console.error(`browser combat prepare: ${message}`); process.exit(1); }
function safeRoot(value) {
  const absolute = resolve(value);
  if (!absolute.startsWith(tmpPrefix) || absolute === tmpPrefix || absolute.includes("/../")) fail(`root must be a new directory under ${tmpPrefix}`);
  if (existsSync(absolute)) fail(`root already exists: ${absolute}`);
  return absolute;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function assertPhysicalTree(path) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) fail(`symbolic link is not allowed in copied content: ${path}`);
  if (info.isDirectory()) for (const entry of await readdir(path)) await assertPhysicalTree(join(path, entry));
}
async function main() {
  const data = join(root, "Data");
  const target = join(data, "systems", "osp-houserules");
  const config = join(root, "Config");
  const run = join(root, "run");
  const world = join(data, "worlds", worldId);
  const moduleTarget = join(data, "modules", "osp-browser-combat-tests");
  const nativeTarget = join(root, "native", "classic-level");
  const markerPath = join(root, "osp-browser-combat.json");
  const output = join(repo, "output", "browser-combat", "environment.json");
  safeRoot(root);
  if (!existsSync(join(appRoot, "main.js"))) fail(`Foundry app not found: ${appRoot}`);
  if (!existsSync(nodeBinary)) fail(`Node binary not found: ${nodeBinary}`);
  if (!existsSync(moduleSource)) fail(`browser test module is required: ${moduleSource}`);
  await assertPhysicalTree(moduleSource);
  await mkdir(target, { recursive: true, mode: 0o700 });
  await mkdir(config, { recursive: true, mode: 0o700 });
  await mkdir(run, { recursive: true, mode: 0o700 });
  // Copy only runtime files required by system.json; source, tests, scripts, and dependencies stay out.
  const runtimeEntries = ["system.json", "template.json", "system-image.webp", "dist", "templates", "assets", "data", "fonts", "lang", "packs"];
  for (const entry of runtimeEntries) {
    const from = join(source, entry);
    if (!existsSync(from)) continue;
    await assertPhysicalTree(from);
    await cp(from, join(target, entry), { recursive: true, dereference: true });
  }
  for (const required of ["system.json", "dist/ose.js", "dist/ose.css"]) {
    const sourceHash = sha256(await readFile(join(source, required)));
    const copiedHash = sha256(await readFile(join(target, required)));
    if (sourceHash !== copiedHash) fail(`copied runtime hash mismatch: ${required}`);
  }
  const license = "/Users/paul/FoundryData/osp-dev/Config/license.json";
  if (!existsSync(license)) fail(`license file not found: ${license}`);
  await cp(license, join(config, "license.json"));
  await chmod(join(config, "license.json"), 0o600);
  await mkdir(moduleTarget, { recursive: true, mode: 0o700 });
  await cp(moduleSource, moduleTarget, { recursive: true, dereference: true });
  const manifest = JSON.parse(await readFile(join(source, "system.json"), "utf8"));
  const worldManifest = {
    id: worldId, title: "OSP Browser Combat Test (isolated)", name: worldId,
    system: "osp-houserules", systemVersion: manifest.version, coreVersion: "14.367",
    compatibility: { minimum: "14.0.0", verified: "14.0.0" },
    flags: {}, relationships: {}, playtime: 0
  };
  await mkdir(world, { recursive: true, mode: 0o700 });
  await writeFile(join(world, "world.json"), `${JSON.stringify(worldManifest, null, 2)}\n`, { mode: 0o600 });
  const options = {
    dataPath: root, hostname: "127.0.0.1", localHostname: "127.0.0.1", port: null,
    proxyPort: port, protocol: null, routePrefix: null, upnp: false, telemetry: false,
    noIPDiscovery: true, unixSocket: join(run, "foundry.sock"), world: worldId,
    updateChannel: "stable", hotReload: false, compressStatic: true, compressSocket: true
  };
  const prebuildSource = join(appRoot, "node_modules/classic-level/prebuilds/darwin-x64+arm64/classic-level.node");
  if (!existsSync(prebuildSource)) fail(`classic-level native prebuild not found: ${prebuildSource}`);
  await assertPhysicalTree(prebuildSource);
  await mkdir(join(nativeTarget, "prebuilds", "darwin-x64+arm64"), { recursive: true, mode: 0o700 });
  const nativePrebuildPath = join(nativeTarget, "prebuilds", "darwin-x64+arm64", "classic-level.node");
  await cp(prebuildSource, nativePrebuildPath, { dereference: true });
  options.classicLevelPrebuild = nativeTarget;
  await writeFile(join(config, "options.json"), `${JSON.stringify(options, null, 2)}\n`, { mode: 0o600 });
  const marker = {
    format: "osp-browser-combat-environment-v1", disposable: true,
    nonce: randomBytes(16).toString("hex"), createdAt: new Date().toISOString(),
    root, dataPath: data, configPath: config, worldPath: world, markerPath,
    appRoot: resolve(appRoot), nodeBinary: resolve(nodeBinary), systemPath: target,
    worldId, port, unixSocket: options.unixSocket, nativePrebuildPath: nativeTarget,
    hashes: {
      systemManifest: sha256(await readFile(join(target, "system.json"))),
      runtimeJS: sha256(await readFile(join(target, "dist/ose.js"))),
      runtimeCSS: sha256(await readFile(join(target, "dist/ose.css"))),
      world: sha256(JSON.stringify(worldManifest))
    },
    urls: { gm: `http://127.0.0.1:${port}/game`, player: `http://localhost:${port}/game` },
    modulePath: moduleTarget
  };
  await writeFile(join(moduleTarget, "environment.json"), `${JSON.stringify({ format: marker.format, disposable: true, nonce: marker.nonce, root, worldId, port, urls: marker.urls }, null, 2)}\n`, { mode: 0o600 });
  await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  await mkdir(dirname(output), { recursive: true });
  const report = { format: marker.format, root, dataPath: data, worldId, port, unixSocket: options.unixSocket, urls: marker.urls, markerPath, createdAt: marker.createdAt, modulePath: moduleTarget };
  const temp = `${output}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, output);
  console.log(JSON.stringify({ prepared: true, root, worldId, port, unixSocket: options.unixSocket, gmUrl: marker.urls.gm, playerUrl: marker.urls.player, launch: `node scripts/start-browser-combat.js ${markerPath}` }, null, 2));
}
main().catch((error) => fail(error.message));
