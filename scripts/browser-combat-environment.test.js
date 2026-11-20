import { describe, expect, it, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, linkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateEnvironment } from "./start-browser-combat.js";

const roots = [];
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function fixture() {
  const root = mkdtempSync(`/private/tmp/osp-browser-combat-guard-`); roots.push(root);
  const dirs = ["Config", "Data/worlds/osp-browser-combat", "Data/systems/osp-houserules/dist", "Data/modules/osp-browser-combat-tests", "native/classic-level", "run"];
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });
  const system = { id: "osp-houserules", version: "1.0.12" };
  writeFileSync(join(root, "Data/systems/osp-houserules/system.json"), JSON.stringify(system));
  writeFileSync(join(root, "Data/systems/osp-houserules/dist/ose.js"), "runtime");
  writeFileSync(join(root, "Data/systems/osp-houserules/dist/ose.css"), "css");
  writeFileSync(join(root, "Data/worlds/osp-browser-combat/world.json"), JSON.stringify({ id: "osp-browser-combat", system: "osp-houserules" }));
  const markerPath = join(root, "osp-browser-combat.json");
  const nonce = "test-nonce";
  writeFileSync(join(root, "Data/modules/osp-browser-combat-tests/environment.json"), JSON.stringify({ format: "osp-browser-combat-environment-v1", disposable: true, nonce, root, worldId: "osp-browser-combat", port: 31051 }));
  writeFileSync(join(root, "native/classic-level/native.node"), "native");
  writeFileSync(join(root, "Config/options.json"), JSON.stringify({ dataPath: root, unixSocket: join(root, "run/foundry.sock"), world: "osp-browser-combat", hostname: "127.0.0.1", port: null, proxyPort: 31051, protocol: null, routePrefix: null, upnp: false, telemetry: false, classicLevelPrebuild: join(root, "native/classic-level") }));
  const marker = { format: "osp-browser-combat-environment-v1", disposable: true, nonce, root, dataPath: join(root, "Data"), configPath: join(root, "Config"), worldPath: join(root, "Data/worlds/osp-browser-combat"), systemPath: join(root, "Data/systems/osp-houserules"), modulePath: join(root, "Data/modules/osp-browser-combat-tests"), nativePrebuildPath: join(root, "native/classic-level"), worldId: "osp-browser-combat", port: 31051, unixSocket: join(root, "run/foundry.sock"), markerPath, hashes: { systemManifest: sha(readFileSync(join(root, "Data/systems/osp-houserules/system.json"))), runtimeJS: sha(Buffer.from("runtime")), runtimeCSS: sha(Buffer.from("css")) } };
  writeFileSync(markerPath, JSON.stringify(marker));
  return { root, marker, markerPath };
}
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

describe("browser combat environment guards", () => {
  it("accepts a complete isolated fixture", () => {
    const { marker, markerPath } = fixture();
    expect(validateEnvironment(marker, markerPath)).toBe(marker.root);
  });
  it.each(["port", "dataPath", "worldPath", "systemHash"])("rejects unsafe %s", (kind) => {
    const { marker, markerPath, root } = fixture();
    if (kind === "port") marker.port = 30000;
    if (kind === "dataPath") marker.dataPath = root;
    if (kind === "worldPath") marker.worldPath = join(root, "Data/worlds/other");
    if (kind === "systemHash") marker.hashes.runtimeJS = "bad";
    expect(() => validateEnvironment(marker, markerPath)).toThrow();
  });
  it("rejects a copied campaign world", () => {
    const { marker, markerPath, root } = fixture();
    mkdirSync(join(root, "Data/worlds/westford"));
    expect(() => validateEnvironment(marker, markerPath)).toThrow();
  });
  it("rejects symlink and hardlink content", () => {
    const first = fixture();
    symlinkSync(join(first.root, "Data/worlds/osp-browser-combat/world.json"), join(first.root, "Data/worlds/osp-browser-combat/link.json"));
    expect(() => validateEnvironment(first.marker, first.markerPath)).toThrow();
    const second = fixture();
    linkSync(join(second.root, "Data/systems/osp-houserules/system.json"), join(second.root, "Data/systems/osp-houserules/hardlink.json"));
    expect(() => validateEnvironment(second.marker, second.markerPath)).toThrow();
  });
  it("does not launch a process when imported", () => { expect(existsSync(join(process.cwd(), "scripts/start-browser-combat.js"))).toBe(true); });
});
