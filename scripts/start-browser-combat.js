#!/usr/bin/env node
import { createConnection, createServer } from "node:net";
import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, unlinkSync, createWriteStream } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const prefix = "/private/tmp/osp-browser-combat-";
function fail(message) { throw new Error(message); }
function ownedTree(path) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) fail(`symbolic link in owned path: ${path}`);
  if (info.isFile() && info.nlink > 1) fail(`hard link in owned path: ${path}`);
  if (info.isDirectory()) for (const entry of readdirSync(path)) ownedTree(join(path, entry));
}
export function validateEnvironment(marker, markerPath) {
  const root = resolve(marker.root || "");
  if (!/^\/private\/tmp\/osp-browser-combat-[A-Za-z0-9-]+$/.test(root) || realpathSync(root) !== root) fail("root is not a direct disposable environment path");
  if (marker.format !== "osp-browser-combat-environment-v1" || marker.disposable !== true) fail("invalid environment marker");
  if (resolve(marker.markerPath) !== resolve(markerPath) || realpathSync(resolve(markerPath)) !== resolve(markerPath)) fail("marker is not for a disposable environment");
  const expected = { dataPath: join(root, "Data"), configPath: join(root, "Config"), worldPath: join(root, "Data/worlds/osp-browser-combat"), systemPath: join(root, "Data/systems/osp-houserules"), modulePath: join(root, "Data/modules/osp-browser-combat-tests"), nativePrebuildPath: join(root, "native/classic-level"), unixSocket: join(root, "run/foundry.sock") };
  for (const [key, value] of Object.entries(expected)) if (resolve(marker[key]) !== value) fail(`marker path mismatch: ${key}`);
  if (marker.worldId !== "osp-browser-combat" || marker.port !== 31051) fail("marker identity mismatch");
  if (!existsSync(join(root, "Config/options.json")) || !existsSync(join(marker.worldPath, "world.json")) || !existsSync(marker.modulePath) || !existsSync(marker.nativePrebuildPath)) fail("environment is incomplete");
  if (readdirSync(join(root, "Data/worlds")).some((entry) => !["README.txt", "osp-browser-combat"].includes(entry)) || readdirSync(join(root, "Data/systems")).some((entry) => !["README.txt", "osp-houserules"].includes(entry)) || readdirSync(join(root, "Data/modules")).some((entry) => !["README.txt", "osp-browser-combat-tests"].includes(entry))) fail("environment contains an unexpected campaign or module");
  for (const owned of [join(root, "Data"), join(root, "Config"), marker.worldPath, marker.systemPath, marker.modulePath, marker.nativePrebuildPath]) ownedTree(owned);
  const options = JSON.parse(readFileSync(join(root, "Config/options.json"), "utf8"));
  const world = JSON.parse(readFileSync(join(marker.worldPath, "world.json"), "utf8"));
  const moduleEnvironment = JSON.parse(readFileSync(join(marker.modulePath, "environment.json"), "utf8"));
  if (options.dataPath !== root || options.unixSocket !== marker.unixSocket || options.world !== marker.worldId || options.hostname !== "127.0.0.1" || options.port !== null || options.proxyPort !== marker.port || options.protocol !== null || options.routePrefix !== null || options.upnp !== false || options.telemetry !== false || options.classicLevelPrebuild !== marker.nativePrebuildPath || world.id !== marker.worldId || world.system !== "osp-houserules" || moduleEnvironment.nonce !== marker.nonce || moduleEnvironment.root !== root || moduleEnvironment.worldId !== marker.worldId || moduleEnvironment.port !== marker.port || moduleEnvironment.disposable !== true) fail("unsafe options, world, or module metadata");
  for (const [file, expectedHash] of [["system.json", marker.hashes.systemManifest], ["dist/ose.js", marker.hashes.runtimeJS], ["dist/ose.css", marker.hashes.runtimeCSS]]) if (createHash("sha256").update(readFileSync(join(marker.systemPath, file))).digest("hex") !== expectedHash) fail(`runtime hash mismatch: ${file}`);
  return root;
}
const isCli = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
const markerFile = process.argv[2] || process.env.OSP_BROWSER_COMBAT_MARKER;
let marker; let root; let child; let proxy; let log; const clients = new Set(); let stopping = false;
async function close() {
  if (stopping) return; stopping = true;
  for (const client of clients) client.destroy();
  if (proxy) await new Promise((done) => proxy.close(() => done()));
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((done) => { const timer = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); done(); }, 3000); child.once("exit", () => { clearTimeout(timer); done(); }); });
  }
  if (log) log.end();
  if (marker?.unixSocket && marker.unixSocket.startsWith(`${root}/`) && existsSync(marker.unixSocket)) unlinkSync(marker.unixSocket);
}
process.on("SIGINT", async () => { await close(); process.exit(130); });
process.on("SIGTERM", async () => { await close(); process.exit(143); });
async function main() {
  if (!markerFile) fail("usage: node scripts/start-browser-combat.js /private/tmp/osp-browser-combat-*/osp-browser-combat.json");
  marker = JSON.parse(readFileSync(resolve(markerFile), "utf8")); root = validateEnvironment(marker, markerFile);
  await mkdir(join(root, "logs"), { recursive: true });
  log = createWriteStream(join(root, "logs/foundry.log"), { flags: "a", mode: 0o600 });
  const probe = createServer();
  await new Promise((resolveProbe, reject) => { probe.once("error", reject); probe.listen(marker.port, "127.0.0.1", () => probe.close(resolveProbe)); });
  child = spawn(marker.nodeBinary, [join(marker.appRoot, "main.js"), `--dataPath=${root}`, `--world=${marker.worldId}`, "--noupnp", "--noupdate"], { cwd: marker.appRoot, env: { ...process.env, CLASSIC_LEVEL_PREBUILD: marker.nativePrebuildPath }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  child.on("error", (error) => { if (!stopping) { console.error(`browser combat child error: ${error.message}`); void close().then(() => process.exit(1)); } });
  child.on("exit", (code, signal) => { if (!stopping && proxy) { console.error(`browser combat child exited: ${code ?? signal}`); void close().then(() => process.exit(1)); } });
  const started = Date.now();
  while (!existsSync(marker.unixSocket)) {
    if (child.exitCode !== null) fail(`Foundry exited before socket (code ${child.exitCode})`);
    if (Date.now() - started > 30000) fail("timed out waiting for Foundry Unix socket");
    await new Promise((r) => setTimeout(r, 250));
  }
  proxy = createServer((client) => { clients.add(client); const upstream = createConnection(marker.unixSocket); client.once("close", () => { clients.delete(client); upstream.destroy(); }); client.on("error", () => upstream.destroy()); upstream.on("error", () => client.destroy()); upstream.once("close", () => client.destroy()); client.pipe(upstream); upstream.pipe(client); });
  await new Promise((ok, bad) => { proxy.once("error", bad); proxy.listen(marker.port, "127.0.0.1", ok); });
  console.log(JSON.stringify({ ready: true, pid: child.pid, worldId: marker.worldId, url: marker.urls.gm, log: join(root, "logs/foundry.log") }, null, 2));
  await new Promise(() => {});
}
if (isCli) main().catch(async (error) => { console.error(`browser combat start: ${error.message}`); await close(); process.exit(1); });
