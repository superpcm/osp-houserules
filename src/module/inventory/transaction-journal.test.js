import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  JOURNAL_FLAG, createdItemChange, flagChange, getPendingTransaction, itemChange,
  recoverTransaction, runTransaction, settingChange, transactionBlock,
} from "./transaction-journal.js";

function makeItem(data) {
  const value = structuredClone(data);
  return {
    id: value._id, name: value.name, type: value.type,
    get system() { return value.system; },
    toObject: () => structuredClone(value),
    update: vi.fn(async (changes) => { value.system.quantity = changes["system.quantity"]; }),
    delete: vi.fn(async () => { actor.items.delete(value._id); }),
  };
}

let actor;
beforeEach(() => {
  const flags = new Map();
  const items = new Map();
  actor = {
    id: "a1", name: "Archer", items,
    getFlag: vi.fn((_scope, key) => flags.get(key) ?? null),
    setFlag: vi.fn(async (_scope, key, value) => { if (value === null) flags.delete(key); else flags.set(key, structuredClone(value)); }),
    createEmbeddedDocuments: vi.fn(async (_type, data) => { for (const entry of data) items.set(entry._id, makeItem(entry)); }),
  };
  globalThis.game = { system: { id: "osp-houserules" }, user: { isGM: true }, actors: new Map([[actor.id, actor]]), settings: { get: vi.fn(() => null), set: vi.fn(async () => {}) } };
});

describe("transaction journal", () => {
  it("journals, applies, verifies, and clears a successful flag transaction", async () => {
    const change = flagChange(actor, "coins", 10);
    const result = await runTransaction(actor, { label: "credit", changes: [change] });
    expect(result.success).toBe(true);
    expect(getPendingTransaction(actor)).toBeNull();
    expect(actor.getFlag("osp-houserules", "coins")).toBe(10);
  });

  it("restores earlier changes when a later write fails", async () => {
    const first = flagChange(actor, "one", 1);
    const second = flagChange(actor, "two", 2);
    const save = actor.setFlag.getMockImplementation();
    actor.setFlag.mockImplementation(async (scope, key, value) => {
      if (key === "two") throw new Error("second write failed");
      return save(scope, key, value);
    });
    const result = await runTransaction(actor, { label: "fault", changes: [first, second] });
    expect(result.success).toBe(false);
    expect(result.recoveryRequired).toBe(false);
    expect(actor.getFlag("osp-houserules", "one")).toBeNull();
    expect(actor.getFlag("osp-houserules", "two")).toBeNull();
    expect(getPendingTransaction(actor)).toBeNull();
    expect(actor.setFlag).toHaveBeenCalledWith("osp-houserules", "one", 1);
    expect(actor.setFlag).toHaveBeenCalledWith("osp-houserules", "one", null);
  });

  it("rejects stale plans before creating a journal or mutating endpoints", async () => {
    const change = flagChange(actor, "coins", 10);
    await actor.setFlag("osp-houserules", "coins", 2);
    actor.setFlag.mockClear();
    const result = await runTransaction(actor, { label: "stale plan", changes: [change] });
    expect(result.success).toBe(false);
    expect(actor.setFlag).not.toHaveBeenCalled();
    expect(actor.getFlag("osp-houserules", "coins")).toBe(2);
  });

  it("ignores changing document statistics while verifying quantity updates", async () => {
    const source = makeItem({ _id: "stack", name: "Ruby", type: "item", system: { quantity: 2 } });
    actor.items.set(source.id, source);
    const toObject = source.toObject;
    let revision = 0;
    source.toObject = () => ({ ...toObject(), _stats: { modifiedTime: ++revision } });
    expect((await runTransaction(actor, { label: "statistics", changes: [itemChange(actor, source, 1)] })).success).toBe(true);
    expect(source.system.quantity).toBe(1);
    expect(getPendingTransaction(actor)).toBeNull();
  });

  it("accepts Foundry defaults on newly created documents without replaying creation", async () => {
    actor.createEmbeddedDocuments.mockImplementation(async (_type, data) => {
      for (const entry of data) actor.items.set(entry._id, makeItem({ ...entry, _stats: { modifiedTime: 1 }, ownership: { default: 0 }, system: { ...entry.system, equipped: false } }));
    });
    const descriptor = createdItemChange(actor, { _id: "old-catalog-id", name: "Gem", type: "item", system: { quantity: 1 } });
    expect(descriptor.id).not.toBe("old-catalog-id");
    expect((await runTransaction(actor, { label: "defaults", changes: [descriptor] })).success).toBe(true);
    expect(actor.items.get(descriptor.id).system.quantity).toBe(1);
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
  });

  it("refuses unknown drift during recovery and retains the durable record", async () => {
    const change = flagChange(actor, "coins", 10);
    await actor.setFlag("osp-houserules", JOURNAL_FLAG, { version: 1, id: "op1", label: "drift", createdAt: 1, changes: [change] });
    const journal = actor.getFlag("osp-houserules", JOURNAL_FLAG);
    actor.getFlag.mockImplementation((_scope, key) => key === "coins" ? 5 : journal);
    const result = await recoverTransaction(actor);
    expect(result.success).toBe(false);
    expect(result.recoveryRequired).toBe(true);
  });

  it("blocks another actor when a shared setting is journaled", async () => {
    const other = { id: "a2", name: "Mage", getFlag: vi.fn((_s, key) => key === JOURNAL_FLAG ? { id: "op2", changes: [settingChange("partyTreasury", 3)] } : null) };
    game.actors.set(other.id, other);
    const blocked = transactionBlock(actor, [settingChange("partyTreasury", 4)]);
    expect(blocked).toMatchObject({ success: false, recoveryRequired: true, operationId: "op2" });
  });

  it("creates stable item descriptors", () => {
    const descriptor = createdItemChange(actor, { name: "Gem", type: "item", system: { quantity: 1 } });
    expect(descriptor).toMatchObject({ kind: "item", before: null, after: { name: "Gem", type: "item", system: { quantity: 1 } } });
    expect(descriptor.id).toBe(descriptor.after._id);
  });

  it("resolves every cross-actor descriptor independently and restores both endpoints on failure", async () => {
    const otherFlags = new Map();
    const other = {
      id: "a2", uuid: "Actor.a2", name: "Mage",
      getFlag: vi.fn((_scope, key) => otherFlags.get(key) ?? null),
      setFlag: vi.fn(async (_scope, key, value) => {
        if (key === "other" && value === 2) throw new Error("cross-actor write failed");
        if (value === null) otherFlags.delete(key); else otherFlags.set(key, structuredClone(value));
      }),
    };
    game.actors.set(other.id, other);
    const first = flagChange(actor, "one", 1);
    const second = flagChange(other, "other", 2);
    const result = await runTransaction(actor, { label: "cross actor", changes: [first, second] });
    expect(result).toMatchObject({ success: false, recoveryRequired: false });
    expect(actor.getFlag("osp-houserules", "one")).toBeNull();
    expect(other.getFlag("osp-houserules", "other")).toBeNull();
    expect(getPendingTransaction(actor)).toBeNull();
  });

  it("runs validation after acquiring all endpoint locks and before journal preparation", async () => {
    const validate = vi.fn(async () => false);
    const result = await runTransaction(actor, {
      label: "validated",
      changes: [flagChange(actor, "coins", 10)],
      validate,
    });
    expect(result).toMatchObject({ success: false, recoveryRequired: false });
    expect(validate).toHaveBeenCalledTimes(1);
    expect(actor.setFlag).not.toHaveBeenCalled();
  });

  it("blocks an actor touched by another pending cross-actor record without requiring a setting", async () => {
    const bFlags = new Map();
    const b = { id: "b", uuid: "Actor.b", name: "B", getFlag: vi.fn((_s, k) => bFlags.get(k) ?? null), setFlag: vi.fn() };
    const c = { id: "c", uuid: "Actor.c", name: "C", getFlag: vi.fn(() => null), setFlag: vi.fn() };
    game.actors.set(b.id, b);
    game.actors.set(c.id, c);
    const touched = flagChange(b, "coins", 2);
    await actor.setFlag("osp-houserules", JOURNAL_FLAG, { id: "pending", changes: [touched] });
    expect(transactionBlock(b)).toMatchObject({ success: false, recoveryRequired: true, operationId: "pending" });
    expect(transactionBlock(c, [touched])).toMatchObject({ success: false, recoveryRequired: true, operationId: "pending" });
  });

  it("refuses a same-id endpoint when its recorded UUID is unavailable", async () => {
    const other = { id: "a2", uuid: "Actor.world", name: "World Actor", getFlag: vi.fn(() => null), setFlag: vi.fn() };
    game.actors.set(other.id, other);
    const change = { ...flagChange(other, "coins", 3), actorUuid: "Token.missing" };
    const result = await runTransaction(actor, { label: "missing endpoint", changes: [change] });
    expect(result).toMatchObject({ success: false, recoveryRequired: false });
    expect(result.reason).toMatch(/endpoint|unavailable/i);
    expect(other.setFlag).not.toHaveBeenCalled();
  });

  it("keeps recovery pending when a recorded UUID endpoint cannot be resolved", async () => {
    const record = { id: "missing", changes: [{ kind: "flag", actorId: "a2", actorUuid: "Token.missing", key: "coins", before: null, after: 3 }] };
    await actor.setFlag("osp-houserules", JOURNAL_FLAG, record);
    const result = await recoverTransaction(actor);
    expect(result).toMatchObject({ success: false, recoveryRequired: true, operationId: "missing" });
    expect(getPendingTransaction(actor)).toMatchObject({ id: "missing" });
  });
});
