import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createdTokenChange, flagChange, getPendingTransaction, recoverTransaction, runTransaction, snapshotToken,
} from "./transaction-journal.js";

function makeToken(data, scene) {
  const value = structuredClone(data);
  return {
    id: value._id,
    uuid: `${scene.uuid}.Token.${value._id}`,
    toObject: () => structuredClone(value),
    delete: vi.fn(async () => { scene.tokens.delete(value._id); }),
    update: vi.fn(async (changes) => { Object.entries(changes).forEach(([key, next]) => { value[key] = next; }); }),
  };
}

let actor;
let scene;
beforeEach(() => {
  const flags = new Map();
  scene = {
    id: "scene-1", uuid: "Scene.scene-1", tokens: new Map(),
    createEmbeddedDocuments: vi.fn(async (_type, data) => data.map((entry) => {
      const token = makeToken({
        ...entry,
        _stats: { modifiedTime: 1 },
        ownership: { default: 0 },
        flags: {}, elevation: 0, width: 1, height: 1, rotation: 0,
        texture: { src: "icons/svg/mystery-man.svg" },
      }, scene);
      scene.tokens.set(entry._id, token);
      return token;
    })),
  };
  actor = {
    id: "actor-1", name: "Journal Host", items: new Map(),
    getFlag: vi.fn((_scope, key) => flags.get(key) ?? null),
    setFlag: vi.fn(async (_scope, key, value) => { if (value === null) flags.delete(key); else flags.set(key, structuredClone(value)); }),
  };
  globalThis.game = {
    system: { id: "osp-houserules" }, user: { isGM: true },
    actors: new Map([[actor.id, actor]]), scenes: new Map([[scene.id, scene]]),
    settings: { get: vi.fn(() => null), set: vi.fn(async () => {}) },
  };
  globalThis.fromUuid = vi.fn(async (uuid) => uuid === scene.uuid ? scene : null);
});

describe("scene token transaction journal", () => {
  it("creates a token with a fresh id and accepts Foundry defaults", async () => {
    const change = createdTokenChange(scene, { id: "catalog", name: "Ruby", x: 10, y: 20 });
    expect(change.id).not.toBe("catalog");
    expect(change.sceneUuid).toBe(scene.uuid);
    expect((await runTransaction(actor, { label: "spawn token", changes: [change] })).success).toBe(true);
    expect(snapshotToken(scene.tokens.get(change.id))).toMatchObject({
      _id: change.id, name: "Ruby", x: 10, y: 20,
      ownership: { default: 0 }, flags: {}, elevation: 0, width: 1, height: 1,
    });
    expect(getPendingTransaction(actor)).toBeNull();
  });

  it("resolves by exact scene UUID and leaves the journal recoverable when missing", async () => {
    const change = createdTokenChange(scene, { name: "Missing scene token" });
    const missing = { ...change, sceneUuid: "Scene.missing" };
    const result = await runTransaction(actor, { label: "missing scene", changes: [missing] });
    expect(result).toMatchObject({ success: false, recoveryRequired: false });
    expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
    await actor.setFlag("osp-houserules", "pendingInventoryTransaction", { id: "recover", changes: [missing] });
    const recovered = await recoverTransaction(actor);
    expect(recovered).toMatchObject({ success: false, recoveryRequired: true, operationId: "recover" });
    expect(getPendingTransaction(actor)).toMatchObject({ id: "recover" });
  });

  it("compensates a created token when a later actor write fails", async () => {
    const token = createdTokenChange(scene, { name: "Rollback token" });
    const flag = flagChange(actor, "coins", 10);
    const save = actor.setFlag.getMockImplementation();
    actor.setFlag.mockImplementation(async (scope, key, value) => {
      if (key === "coins" && value === 10) throw new Error("actor write failed");
      return save(scope, key, value);
    });
    const result = await runTransaction(actor, { label: "token rollback", changes: [token, flag] });
    expect(result).toMatchObject({ success: false, recoveryRequired: false });
    expect(scene.tokens.has(token.id)).toBe(false);
    expect(getPendingTransaction(actor)).toBeNull();
  });

  it("treats a create acknowledgment lost after the document is written as committed", async () => {
    const token = createdTokenChange(scene, { name: "Lost acknowledgment" });
    scene.createEmbeddedDocuments.mockImplementationOnce(async (_type, data) => {
      data.forEach((entry) => scene.tokens.set(entry._id, makeToken({ ...entry, _stats: { modifiedTime: 2 }, ownership: { default: 0 } }, scene)));
      throw new Error("create response lost");
    });
    const result = await runTransaction(actor, { label: "lost token acknowledgment", changes: [token] });
    expect(result).toMatchObject({ success: true });
    expect(scene.tokens.has(token.id)).toBe(true);
    expect(getPendingTransaction(actor)).toBeNull();
  });

  it("retains a recoverable journal when token deletion compensation fails", async () => {
    const token = createdTokenChange(scene, { name: "Delete recovery" });
    let created;
    scene.createEmbeddedDocuments.mockImplementationOnce(async (_type, data) => {
      created = makeToken({ ...data[0], _stats: { modifiedTime: 3 }, ownership: { default: 0 } }, scene);
      scene.tokens.set(data[0]._id, created);
      created.delete.mockRejectedValueOnce(new Error("token delete failed"));
      return [created];
    });
    const flag = flagChange(actor, "coins", 10);
    const save = actor.setFlag.getMockImplementation();
    actor.setFlag.mockImplementation(async (scope, key, value) => {
      if (key === "coins" && value === 10) throw new Error("actor write failed");
      return save(scope, key, value);
    });
    const result = await runTransaction(actor, { label: "token delete recovery", changes: [token, flag] });
    expect(result).toMatchObject({ success: false, recoveryRequired: true });
    expect(getPendingTransaction(actor)).toMatchObject({ changes: [token, flag] });
    created.delete.mockImplementation(async () => { scene.tokens.delete(token.id); });
    const recovered = await recoverTransaction(actor);
    expect(recovered).toMatchObject({ success: true, outcome: "restored", operationId: result.operationId });
    expect(scene.tokens.has(token.id)).toBe(false);
    expect(getPendingTransaction(actor)).toBeNull();
  });
});
