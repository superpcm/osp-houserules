import { describe, expect, it, beforeEach, vi } from "vitest";
import { initInventoryAuthority, registerInventoryAuthority, requestInventoryMutation, INVENTORY_SOCKET_NAMESPACE, RECEIPTS_SETTING } from "./inventory-authority.js";

describe("BR-06 lifecycle transport boundary", () => {
  let callbacks, settings, gm, player, handler;
  beforeEach(() => {
    callbacks = [];
    settings = new Map();
    gm = { id: "gm", isGM: true };
    player = { id: "player", isGM: false };
    globalThis.game = { user: gm, users: Object.assign(new Map([[gm.id, gm], [player.id, player]]), { activeGM: gm }), system: { id: "osp-houserules" }, world: { id: "br06" }, settings: { get: (_scope, key) => settings.get(key), set: async (_scope, key, value) => settings.set(key, structuredClone(value)) } };
    globalThis.Hooks = { on: (_event, callback) => callbacks.push(callback) };
    globalThis.ChatMessage = { create: vi.fn(async data => { const doc = { flags: data.flags }; callbacks[0]?.(doc, {}, game.user.id); return doc; }) };
    delete globalThis.__ospInventoryChatHook;
    initInventoryAuthority();
    handler = vi.fn(async () => ({ success: true }));
    registerInventoryAuthority("known", handler);
  });
  it("rejects a forged requester identity before creating a receipt", async () => {
    callbacks[0]({ flags: { "osp-houserules": { inventoryAuthority: { type: "request", envelope: { namespace: INVENTORY_SOCKET_NAMESPACE, type: "request", userId: player.id, action: "known", details: {}, operationId: "forged" } } } } }, {}, gm.id);
    for (let i = 0; i < 100; i++) await Promise.resolve();
    expect(settings.has(RECEIPTS_SETTING)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
  it("rejects malformed details before receipt creation", async () => {
    callbacks[0]({ flags: { "osp-houserules": { inventoryAuthority: { type: "request", envelope: { namespace: INVENTORY_SOCKET_NAMESPACE, type: "request", userId: gm.id, action: "known", details: null, operationId: "bad-details" } } } } }, {}, gm.id);
    for (let i = 0; i < 100; i++) await Promise.resolve();
    expect(settings.has(RECEIPTS_SETTING)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
  it("continues with a valid operation after malformed requests", async () => {
    callbacks[0]({ flags: { "osp-houserules": { inventoryAuthority: { type: "request", envelope: { namespace: INVENTORY_SOCKET_NAMESPACE, type: "request", userId: gm.id, action: "known", details: null, operationId: "malformed-first" } } } } }, {}, gm.id);
    for (let i = 0; i < 100; i++) await Promise.resolve();
    expect(settings.has(RECEIPTS_SETTING)).toBe(false);
    const result = await requestInventoryMutation("known", {});
    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it("rejects forged GM and owner identities regardless of author and options", async () => {
    const owner = { id: "owner" }; game.users.set(owner.id, owner);
    for (const claimed of [gm.id, owner.id]) {
      callbacks[0]({ author: gm, flags: { "osp-houserules": { inventoryAuthority: { type: "request", envelope: { namespace: INVENTORY_SOCKET_NAMESPACE, type: "request", userId: claimed, action: "known", details: {}, operationId: `forged-${claimed}` } } } } }, { userId: claimed }, player.id);
    }
    for (let i = 0; i < 100; i++) await Promise.resolve();
    expect(handler).not.toHaveBeenCalled(); expect(settings.has(RECEIPTS_SETTING)).toBe(false);
  });
  it("accepts acknowledgments only from the active GM for the matching pending request", async () => {
    game.user = player;
    const operation = requestInventoryMutation("known", {}, null, "ack-boundary");
    for (let i = 0; i < 100; i++) await Promise.resolve();
    let finished = false; void operation.then(() => { finished = true; });
    const payload = { type: "result", userId: player.id, operationId: "ack-boundary", fingerprint: JSON.stringify({ action: "known", details: {}, userId: player.id }), result: { success: true, operationId: "ack-boundary" } };
    const deliver = (value, creator) => callbacks[0]({ author: gm, flags: { "osp-houserules": { inventoryAuthority: value } } }, { userId: gm.id }, creator);
    deliver(payload, player.id);
    deliver({ ...payload, fingerprint: "wrong" }, gm.id);
    deliver({ ...payload, operationId: "other" }, gm.id);
    const otherGM = { id: "other-gm", isGM: true }; game.users.set(otherGM.id, otherGM);
    deliver(payload, otherGM.id);
    deliver({ ...payload, result: { success: "true" } }, gm.id);
    for (let i = 0; i < 100; i++) await Promise.resolve();
    expect(finished).toBe(false);
    deliver(payload, gm.id);
    expect(await operation).toEqual(payload.result);
  });
  it("fails closed without document transport and does not register a raw socket executor", async () => {
    game.socket = { on: vi.fn(), emit: vi.fn() };
    delete globalThis.ChatMessage;
    expect(await requestInventoryMutation("known", {}, null, "no-transport")).toMatchObject({ success: false, retryable: true });
    expect(game.socket.on).not.toHaveBeenCalled(); expect(game.socket.emit).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled(); expect(settings.has(RECEIPTS_SETTING)).toBe(false);
  });
  it("replicates only status fields in result messages", async () => {
    registerInventoryAuthority("status-only", async () => ({ success: true, ledger: { secret: "private snapshot" }, itemDataToCreate: { name: "unidentified truth" } }));
    expect(await requestInventoryMutation("status-only", {}, null, "status-only")).toEqual({ success: true, operationId: "status-only" });
    const result = ChatMessage.create.mock.calls.map(([data]) => data.flags["osp-houserules"].inventoryAuthority).find(payload => payload.type === "result");
    expect(result.result).toEqual({ success: true, operationId: "status-only" });
  });
});
