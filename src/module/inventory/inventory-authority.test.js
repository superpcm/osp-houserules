import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { registerInventoryAuthority, requestInventoryMutation, initInventoryAuthority, RECEIPTS_SETTING, recoverInventoryOperation, INVENTORY_SOCKET_NAMESPACE } from "./inventory-authority.js";
import { initBankLedgerAuthority, depositCurrency, dmAddItem, getLedger } from "./bank-ledger-orchestrator.js";
import { initStorehouse, depositStorehouse, getPersonalStorehouse } from "./storehouse.js";
import { initPartyTreasury, dmAddPartyItem, requestPartyTreasury, getPartyTreasury } from "./party-treasury.js";
import { JOURNAL_FLAG } from "./transaction-journal.js";
let sequence = 0, gm, player, owner2, settings, listeners, hooks, chatRequests, chatResults, actor;
const copy = x => structuredClone(x);
function makeActor(id) {
  const flags = new Map([["party", true]]), items = [];
  items.get = id => items.find(item => item.id === id);
  const actor = { id, name: id, type: "character", ownership: { player: 3, owner2: 3 }, items,
    getFlag: (_scope, key) => flags.get(key), setFlag: async (_scope, key, value) => flags.set(key, copy(value)),
    createEmbeddedDocuments: async (_type, data) => data.map(value => addItem(actor, value)) };
  game.actors.set(id, actor); return actor;
}
function addItem(actor, data) {
  const value = copy(data); value._id ??= `item-${++sequence}`;
  const item = { id: value._id, parent: actor, actor, get type() { return value.type; }, get name() { return value.name; }, get system() { return value.system; }, toObject: () => copy(value),
    update: async changes => { for (const [key, val] of Object.entries(changes)) { if (key === "system.quantity") value.system.quantity = val; } },
    delete: async () => actor.items.splice(actor.items.indexOf(item), 1) };
  actor.items.push(item); return item;
}
function send(user, action, details, operationId) {
  hooks[0]({ flags: { "osp-houserules": { inventoryAuthority: { type: "request", envelope: { namespace: INVENTORY_SOCKET_NAMESPACE, type: "request", userId: user.id, action, details, operationId } } } } }, {}, user.id);
}
async function drain() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
beforeEach(() => {
  gm = { id: "gm", isGM: true }; player = { id: "player" }; owner2 = { id: "owner2" };
  settings = new Map(); listeners = []; hooks = []; chatRequests = []; chatResults = [];
  globalThis.game = { user: gm, world: { id: `world-${++sequence}` }, system: { id: "osp-houserules" }, users: Object.assign(new Map([[gm.id, gm], [player.id, player], [owner2.id, owner2]]), { activeGM: gm }), actors: new Map(), items: new Map(),
    settings: { get: (_scope, key) => settings.get(key), set: async (_scope, key, value) => { settings.set(key, copy(value)); } },
    socket: { on: (_channel, callback) => listeners.push(callback), emit: vi.fn() } };
  globalThis.Hooks = { on: (_event, callback) => hooks.push(callback) };
  globalThis.ChatMessage = { create: vi.fn(async data => {
    const document = { flags: data.flags };
    const payload = data.flags?.["osp-houserules"]?.inventoryAuthority;
    if (payload?.type === "request") chatRequests.push(payload.envelope);
    if (payload?.type === "result") chatResults.push(payload);
    const creator = payload?.type === "result" ? game.users.activeGM?.id ?? game.user.id : game.user.id;
    for (const callback of hooks) callback(document, {}, creator);
    return document;
  }) };
  globalThis.foundry = { utils: { randomID: () => `id-${++sequence}` } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  const storage = new Map(); globalThis.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  delete globalThis.__ospInventoryChatHook;
  initInventoryAuthority(); initBankLedgerAuthority(); initStorehouse(); initPartyTreasury(); actor = makeActor(`actor-${sequence}`);
});

function permissionFixture() {
  const treasure = { name: "Gem", type: "item", system: { quantity: 4, treasure: true, cost: 1, storedSize: 0, unitWeight: 0 } };
  const gear = { name: "Rope", type: "weapon", system: { quantity: 4, storedSize: 1, unitWeight: 1 } };
  const coin = addItem(actor, { name: "Gold Coins", type: "coin", system: { quantity: 10 } });
  const item = addItem(actor, treasure), weapon = addItem(actor, gear);
  const box = addItem(actor, { name: "Chest", type: "container", system: { capacity: 100 } });
  const ledger = { currency: { gold: 10, silver: 0, copper: 0 }, items: [{ entryId: "gem", name: "Gem", quantity: 4, unique: false, itemData: treasure }], log: [] };
  const store = { items: [{ entryId: "rope", name: "Rope", quantity: 4, unique: false, itemData: gear }], log: [] };
  game.items.set("catalog-gear", { toObject: () => copy(gear) });
  game.items.set("catalog-gem", { toObject: () => copy(treasure) });
  settings.set("partyTreasury", copy(ledger)); settings.set("partyStorehouse", copy(store));
  return actor.setFlag("osp-houserules", "bankLedger", ledger).then(() => actor.setFlag("osp-houserules", "storehouse", store)).then(() => ({ coin, item, weapon, box }));
}
function domainSnapshot() {
  return copy({ inventory: actor.items.map(item => item.toObject()), bank: getLedger(actor), locker: getPersonalStorehouse(actor), treasury: getPartyTreasury(), stores: settings.get("partyStorehouse") });
}
const boundaryActions = [
  ["personalBankDepositItem", f => ({ itemId: f.item.id, quantity: 1 })],
  ["personalBankDepositCurrency", f => ({ itemId: f.coin.id, denomination: "gold", quantity: 1 })],
  ["personalBankWithdrawItem", f => ({ entryId: "gem", quantity: 1, containerId: f.box.id })],
  ["personalBankWithdrawCurrency", f => ({ denomination: "gold", quantity: 1, containerId: f.box.id })],
  ["personalStorehouseDeposit", f => ({ itemId: f.weapon.id, quantity: 1 })],
  ["personalStorehouseWithdraw", f => ({ entryId: "rope", quantity: 1, containerId: f.box.id })],
  ["storehouse", f => ({ action: "deposit", itemId: f.weapon.id, quantity: 1 })],
  ["storehouse", f => ({ action: "withdraw", entryId: "rope", quantity: 1, containerId: f.box.id })],
  ["partyTreasury", f => ({ action: "deposit", itemId: f.coin.id, denomination: "gold", quantity: 1 })],
  ["partyTreasury", f => ({ action: "withdraw", denomination: "gold", quantity: 1, containerId: f.box.id })],
  ["partyTreasury", f => ({ action: "withdraw", entryId: "gem", quantity: 1, containerId: f.box.id })],
  ["partyTreasury", () => ({ action: "transfer", sourceAccount: "party", destinationAccount: "personal", payloadType: "currency", denomination: "gold", quantity: 1 })],
  ["personalBankDmCurrency", () => ({ denomination: "gold", newValue: 12 }), true],
  ["personalBankDmAddItem", () => ({ name: "Grant", quantity: 1 }), true],
  ["personalBankDmRemoveItem", () => ({ entryId: "gem", quantity: 1 }), true],
  ["personalBankDmCatalogDeposit", () => ({ itemId: "catalog-gem", quantity: 1 }), true],
  ["personalStorehouseCatalogDeposit", () => ({ itemId: "catalog-gear", quantity: 1 }), true],
  ["storehouse", () => ({ action: "catalogDeposit", itemId: "catalog-gear", quantity: 1 }), true],
  ["partyTreasury", () => ({ action: "catalogDeposit", itemId: "catalog-gem", quantity: 1 }), true],
  ["partyTreasuryDmCurrency", () => ({ denomination: "gold", value: 12 }), true],
  ["partyTreasuryDmAdd", () => ({ name: "Grant", quantity: 1 }), true],
  ["partyTreasuryDmRemove", () => ({ entryId: "gem", quantity: 1 }), true],
];
describe("BR-06 mutation permissions", () => {
  it.each(["owner", "observer", "unrelated", "gm"])("checks every bank/store/treasury operation for %s", async role => {
    actor.ownership = { player: role === "owner" ? 3 : role === "observer" ? 2 : 0 };
    const user = role === "gm" ? gm : player;
    for (const [action, details, gmOnly] of boundaryActions) {
      actor.items.splice(0); const fixture = await permissionFixture();
      const before = domainSnapshot(), id = `matrix-${++sequence}`;
      send(user, action, { actorId: actor.id, ...details(fixture) }, id);
      await drain(); await drain();
      const allowed = role === "gm" || role === "owner" && !gmOnly;
      expect(chatResults.find(result => result.operationId === id)?.result.success, `${role}: ${action}`).toBe(allowed);
      if (!allowed) expect(domainSnapshot(), `${role}: ${action} must not write domain state`).toEqual(before);
    }
  });
  it("requires party membership for shared operations independently of actor ownership", async () => {
    const f = await permissionFixture(); await actor.setFlag("osp-houserules", "party", false);
    for (const [action, details] of [["storehouse", { action: "deposit", itemId: f.weapon.id, quantity: 1 }], ["partyTreasury", { action: "deposit", itemId: f.coin.id, denomination: "gold", quantity: 1 }]]) {
      const before = domainSnapshot(), id = `non-party-${++sequence}`;
      send(player, action, { actorId: actor.id, ...details }, id); await drain();
      expect(chatResults.find(result => result.operationId === id).result.success).toBe(false);
      expect(domainSnapshot()).toEqual(before);
    }
    send(player, "personalBankDepositCurrency", { actorId: actor.id, itemId: f.coin.id, denomination: "gold", quantity: 1 }, "non-party-personal"); await drain();
    expect(chatResults.find(result => result.operationId === "non-party-personal").result.success).toBe(true);
  });
  it.each([false, true])("checks Store Lock on every inventory withdrawal (GM=%s)", async isGM => {
    settings.set("storeLock", true); settings.set("playerLock", true);
    const user = isGM ? gm : player;
    for (const [action, details] of [2, 3, 5, 7, 9, 10].map(index => boundaryActions[index])) {
      actor.items.splice(0); const fixture = await permissionFixture();
      const before = domainSnapshot(), id = `locked-${++sequence}`;
      send(user, action, { actorId: actor.id, ...details(fixture) }, id); await drain(); await drain();
      expect(chatResults.find(result => result.operationId === id)?.result.success, action).toBe(isGM);
      if (!isGM) expect(domainSnapshot()).toEqual(before);
    }
  });
  it("allows deposits and account transfers under store/player locks", async () => {
    const f = await permissionFixture(); settings.set("storeLock", true); settings.set("playerLock", true);
    send(player, "personalBankDepositCurrency", { actorId: actor.id, itemId: f.coin.id, denomination: "gold", quantity: 1 }, "locked-deposit");
    send(player, "partyTreasury", { actorId: actor.id, action: "transfer", sourceAccount: "party", destinationAccount: "personal", payloadType: "currency", denomination: "gold", quantity: 1 }, "locked-transfer");
    await drain(); await drain();
    expect(chatResults.find(result => result.operationId === "locked-deposit").result.success).toBe(true);
    expect(chatResults.find(result => result.operationId === "locked-transfer").result.success).toBe(true);
  });
});
afterEach(() => { vi.useRealTimers(); delete globalThis.window; });
describe("BR-05 authority", () => {
  it("serializes player/GM and two-owner edits with live reads across all accounts", async () => {
    const coin = addItem(actor, { name: "Gold Coins", type: "coin", system: { quantity: 5 } });
    const weapon = addItem(actor, { name: "Rope", type: "weapon", system: { quantity: 5 } });
    send(player, "personalBankDepositCurrency", { actorId: actor.id, itemId: coin.id, denomination: "gold", quantity: 2 }, "player-bank");
    send(owner2, "partyTreasury", { actorId: actor.id, action: "deposit", itemId: coin.id, denomination: "gold", quantity: 3 }, "owner-party");
    const gmEdit = dmAddItem(actor, { name: "Ruby", quantity: 1 });
    send(player, "personalStorehouseDeposit", { actorId: actor.id, itemId: weapon.id, quantity: 2 }, "player-store");
    send(owner2, "storehouse", { actorId: actor.id, action: "deposit", itemId: weapon.id, quantity: 3 }, "owner-store");
    await gmEdit; await drain();
    expect(getLedger(actor).currency.gold).toBe(2); expect(getPartyTreasury().currency.gold).toBe(3);
    expect(getLedger(actor).items[0].quantity).toBe(1); expect(getPersonalStorehouse(actor).items[0].quantity).toBe(2);
    expect(settings.get("partyStorehouse").items[0].quantity).toBe(3);
    expect(actor.items).toHaveLength(0); expect(getLedger(actor).log[0].actorId).toBe(player.id);
  });
  it("coalesces double clicks and replays persisted results after GM handover", async () => {
    const data = { name: "Ruby", quantity: 2 };
    const results = await Promise.all([dmAddItem(actor, data), dmAddItem(actor, data)]);
    expect(results[0].operationId).toBe(results[1].operationId); expect(getLedger(actor).items[0].quantity).toBe(2);
    const id = results[0].operationId;
    const nextGm = { id: "gm2", isGM: true }; game.users.set(nextGm.id, nextGm); game.users.activeGM = nextGm; game.user = nextGm;
    // Receipt belongs to original requester. Replay the original wire envelope.
    send(gm, "personalBankDmAddItem", { actorId: actor.id, ...data }, id); await drain();
    expect(getLedger(actor).items[0].quantity).toBe(2);
    expect(chatResults.at(-1).result.success).toBe(true);
    expect((await dmAddItem(actor, data)).success).toBe(true); expect(getLedger(actor).items[0].quantity).toBe(4);
  });
  it("resolves exact token actor UUIDs and refuses a missing endpoint", async () => {
    actor.uuid = `Actor.${actor.id}`;
    const token = makeActor("token"); game.actors.delete(token.id);
    token.id = actor.id; token.uuid = `Scene.scene.Token.token.Actor.${actor.id}`;
    const coin = addItem(token, { name: "Gold Coins", type: "coin", system: { quantity: 5 } });
    globalThis.fromUuid = async uuid => uuid === token.uuid ? token : null;
    expect((await depositCurrency(token, "gold", 2, coin)).success).toBe(true);
    expect(getLedger(token).currency.gold).toBe(2); expect(getLedger(actor).currency.gold).toBe(0);
    globalThis.fromUuid = async () => null;
    expect((await depositCurrency(token, "gold", 1, coin)).success).toBe(false);
    expect(coin.system.quantity).toBe(3); delete globalThis.fromUuid;
  });
  it("two owners cannot both withdraw the same shared quantity", async () => {
    const weapon = addItem(actor, { name: "Rope", type: "weapon", system: { quantity: 3, storedSize: 1 } });
    const container = addItem(actor, { name: "Chest", type: "container", system: { capacity: 100 } });
    expect((await depositStorehouse(actor, weapon.id, 3, true)).success).toBe(true);
    const entryId = settings.get("partyStorehouse").items[0].entryId;
    const details = { actorId: actor.id, action: "withdraw", entryId, quantity: 2, containerId: container.id };
    send(player, "storehouse", details, "withdraw-player"); send(owner2, "storehouse", details, "withdraw-owner"); await drain();
    expect(settings.get("partyStorehouse").items[0].quantity).toBe(1);
    expect(actor.items.find(item => item.type === "weapon").system.quantity).toBe(2);
    const results = chatResults.map(message => message.result.success);
    expect(results.slice(-2)).toEqual([true, false]);
  });
  it("a cancelled operation cannot erase a later successful transaction", async () => {
    const coin = addItem(actor, { name: "Gold Coins", type: "coin", system: { quantity: 5 } });
    const setFlag = actor.setFlag; let fail = true;
    actor.setFlag = async (scope, key, value) => { if (key === "bankLedger" && fail) { fail = false; throw new Error("write rejected"); } return setFlag(scope,key,value); };
    expect((await depositCurrency(actor, "gold", 2, coin, "cancelled")).success).toBe(false);
    expect((await depositCurrency(actor, "gold", 3, coin, "later")).success).toBe(true);
    expect((await depositCurrency(actor, "gold", 2, coin, "cancelled")).success).toBe(false);
    expect(getLedger(actor).currency.gold).toBe(3); expect(coin.system.quantity).toBe(2);
  });
  it("rejects mismatched payloads and requester IDs without writes", async () => {
    await dmAddPartyItem({ name: "Ruby", quantity: 1 }, "stable");
    expect((await dmAddPartyItem({ name: "Ruby", quantity: 2 }, "stable")).success).toBe(false);
    send(player, "partyTreasuryDmAdd", { name: "Ruby", quantity: 1 }, "stable"); await drain();
    expect(getPartyTreasury().items[0].quantity).toBe(1);
  });
  it("denies foreign personal locker, bank and player DM requests", async () => {
    actor.ownership = {}; const weapon = addItem(actor, { name: "Rope", type: "weapon", system: { quantity: 1 } });
    send(player, "personalStorehouseDeposit", { actorId: actor.id, itemId: weapon.id, quantity: 1 }, "foreign-store");
    send(player, "personalBankDmAddItem", { actorId: actor.id, name: "Ruby", quantity: 1 }, "forged-dm");
    send(player, "personalBankWithdrawCurrency", { actorId: actor.id, denomination: "gold", quantity: 1, containerId: "container" }, "foreign-bank");
    await drain(); expect(actor.items).toHaveLength(1); expect(getPersonalStorehouse(actor).items).toHaveLength(0); expect(getLedger(actor).items).toHaveLength(0);
  });
  it("retains IDs through timeout/reconnect and handles a delayed old acknowledgment safely", async () => {
    vi.useFakeTimers(); game.user = player;
    registerInventoryAuthority("test", async () => ({ success: true }));
    const first = requestInventoryMutation("test", { quantity: 1 });
    await drain();
    const envelope = chatRequests.at(-1);
    await vi.advanceTimersByTimeAsync(10001); const timed = await first; expect(timed.retryable).toBe(true);
    const retried = requestInventoryMutation("test", { quantity: 1 });
    await drain();
    expect(chatRequests.at(-1).operationId).toBe(envelope.operationId);
    hooks[0]({ flags: { "osp-houserules": { inventoryAuthority: { type: "result", userId: player.id, operationId: envelope.operationId, fingerprint: JSON.stringify({ action: "test", details: { quantity: 1 }, userId: player.id }), result: { success: true, operationId: envelope.operationId } } } } }, {}, game.users.activeGM.id);
    expect((await retried).success).toBe(true);
    // Same intent after an acknowledged completion is a new deliberate operation.
    const later = requestInventoryMutation("test", { quantity: 1 });
    await drain();
    const next = chatRequests.at(-1); expect(next.operationId).not.toBe(envelope.operationId);
    hooks[0]({ flags: { "osp-houserules": { inventoryAuthority: { type: "result", userId: player.id, operationId: next.operationId, fingerprint: JSON.stringify({ action: "test", details: { quantity: 1 }, userId: player.id }), result: { success: true } } } } }, {}, game.users.activeGM.id); await later;
  });
  it("ignores unrelated system socket messages", async () => {
    vi.useFakeTimers();
    registerInventoryAuthority("socket-test", async () => ({ success: true }));
    game.user = player;
    const request = requestInventoryMutation("socket-test", { quantity: 1 }, null, "socket-filter");
    await drain();
    const emittedBefore = game.socket.emit.mock.calls.length;
    hooks[0]({ flags: { "osp-houserules": { inventoryAuthority: { type: "request", envelope: { namespace: "other-system", type: "request", userId: player.id, action: "socket-test", details: { quantity: 99 }, operationId: "foreign-request" } } } } }, {}, player.id);
    hooks[0]({ flags: { "osp-houserules": { inventoryAuthority: { type: "result", userId: player.id, operationId: "socket-filter", result: { success: true } } } } }, {}, game.users.activeGM.id);
    expect(game.socket.emit.mock.calls.length).toBe(emittedBefore);
    expect((await vi.advanceTimersByTimeAsync(10001), await request).retryable).toBe(true);
  });
  it("fences handover mid-write, blocks later edits, and recovers without replay", async () => {
    const coin = addItem(actor, { name: "Gold Coins", type: "coin", system: { quantity: 5 } });
    const update = coin.update; coin.update = async changes => { await update(changes); game.users.activeGM = { id: "next-gm", isGM: true }; game.users.set("next-gm", game.users.activeGM); };
    const result = await depositCurrency(actor, "gold", 2, coin, "handover");
    expect(result.recoveryRequired).toBe(true); expect(coin.system.quantity).toBe(3); expect(getLedger(actor).currency.gold).toBe(0);
    game.user = game.users.activeGM; game.users.set(game.user.id, game.user);
    expect((await dmAddPartyItem({ name: "Ruby", quantity: 1 })).recoveryRequired).toBe(true);
    coin.update = update;
    expect(await recoverInventoryOperation("handover")).toMatchObject({ success: true, outcome: "restored" });
    expect(coin.system.quantity).toBe(5); expect(actor.getFlag(game.system.id, JOURNAL_FLAG)).toBeNull();
    send(gm, "personalBankDepositCurrency", { actorId: actor.id, denomination: "gold", quantity: 2, itemId: coin.id }, "handover"); await drain();
    expect(coin.system.quantity).toBe(5); expect(getLedger(actor).currency.gold).toBe(0);
    expect((await dmAddPartyItem({ name: "Ruby", quantity: 1 })).success).toBe(true);
  });
  it("recovers a lost completion receipt from snapshots without duplicating a committed edit", async () => {
    const write = game.settings.set; let writes = 0;
    game.settings.set = async (scope, key, value) => { if (key === RECEIPTS_SETTING && ++writes === 3) throw new Error("lost receipt"); return write(scope, key, value); };
    expect((await dmAddPartyItem({ name: "Ruby", quantity: 1 }, "lost")).recoveryRequired).toBe(true);
    game.settings.set = write;
    expect(await recoverInventoryOperation("lost")).toMatchObject({ success: true, outcome: "committed" });
    expect((await dmAddPartyItem({ name: "Ruby", quantity: 1 }, "lost")).success).toBe(true);
    expect(getPartyTreasury().items[0].quantity).toBe(1);
  });
  it("elects one executor across two tabs logged in as the same GM", async () => {
    let held = false, writes = 0;
    globalThis.window = { addEventListener: () => {} };
    Object.defineProperty(globalThis.navigator, "locks", { configurable: true, value: { request: async (_name, _options, callback) => {
      if (held) return callback(null);
      held = true; try { return await callback({ name: "lease" }); } finally { held = false; }
    } } });
    registerInventoryAuthority("tab-test", async () => { writes++; return { success: true }; });
    expect((await requestInventoryMutation("tab-test", { quantity: 1 }, null, "tab-first")).success).toBe(true);
    vi.resetModules(); const secondTab = await import("./inventory-authority.js");
    secondTab.registerInventoryAuthority("tab-test", async () => { throw new Error("second tab must not execute"); });
    delete globalThis.__ospInventoryChatHook;
    secondTab.initInventoryAuthority();
    expect((await secondTab.requestInventoryMutation("tab-test", { quantity: 1 }, null, "tab-second")).success).toBe(true);
    expect(writes).toBe(2);
    // Release the first tab lease by dropping active-GM status.
    game.users.activeGM = null;
    await requestInventoryMutation("tab-test", {}, null, "tab-release");
    delete globalThis.navigator.locks;
  });
  it("replays completed receipts after reconnect/module reload", async () => {
    const result = await dmAddPartyItem({ name: "Ruby", quantity: 1 }, "reload");
    vi.resetModules();
    const reloaded = await import("./inventory-authority.js");
    delete globalThis.__ospInventoryChatHook;
    reloaded.registerInventoryAuthority("partyTreasuryDmAdd", () => { throw new Error("must not execute replay"); });
    expect(await reloaded.requestInventoryMutation("partyTreasuryDmAdd", { name: "Ruby", quantity: 1 }, null, "reload")).toEqual(result);
    expect(getPartyTreasury().items[0].quantity).toBe(1);
  });

});
