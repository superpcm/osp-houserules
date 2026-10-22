import { initBankLedgerAuthority } from "./bank-ledger-orchestrator.js";
import { initPartyTreasury } from "./party-treasury.js";
import { initStorehouse } from "./storehouse.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { depositCurrency, depositItem, dmDepositCatalogItem } from "./bank-ledger-orchestrator.js";
import { requestPartyTreasury } from "./party-treasury.js";
import { depositStorehouse, depositCatalogStorehouse } from "./storehouse.js";
import { JOURNAL_FLAG } from "./transaction-journal.js";

let actor, item, settings;
let sequence = 0;
function source(type = "coin", quantity = 1) {
  const document = {
    id: "source", parent: actor, actor, type,
    name: type === "coin" ? "Gold Coins" : "Ruby",
    system: { quantity, treasure: type === "item" },
    toObject() { return { _id: this.id, name: this.name, type: this.type, system: { ...this.system } }; },
    update: vi.fn(async (changes) => { document.system.quantity = changes["system.quantity"]; }),
    delete: vi.fn(async () => { actor.items.delete(document.id); }),
  };
  actor.items.set(document.id, document);
  return document;
}

beforeEach(() => {
  const flags = new Map();
  actor = {
    id: `actor-${++sequence}`, name: "Tester", type: "character", items: new Map(), ownership: { gm: 3 },
    getFlag: vi.fn((_scope, key) => flags.get(key)),
    setFlag: vi.fn(async (_scope, key, value) => { flags.set(key, value); }),
  };
  settings = new Map();
  const gm = { id: "gm", isGM: true };
  globalThis.game = {
    user: gm, users: Object.assign(new Map([[gm.id, gm]]), { activeGM: gm }),
    actors: new Map([[actor.id, actor]]), items: new Map(), system: { id: "osp-houserules" },
    settings: { get: (_scope, key) => settings.get(key), set: vi.fn(async (_scope, key, value) => { settings.set(key, value); }) },
    socket: { emit: vi.fn() },
  };
  const hooks = [];
  globalThis.Hooks = { on: (_event, callback) => hooks.push(callback) };
  globalThis.ChatMessage = { create: vi.fn(async data => {
    const document = { flags: data.flags };
    const payload = data.flags?.["osp-houserules"]?.inventoryAuthority;
    const creator = payload?.type === "result" ? game.users.activeGM.id : game.user.id;
    for (const callback of hooks) callback(document, {}, creator);
    return document;
  }) };
  delete globalThis.__ospInventoryChatHook;
  globalThis.foundry = { utils: { randomID: () => `id-${++sequence}` } };
  initBankLedgerAuthority(); initPartyTreasury(); initStorehouse();
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  actor.items.find = (predicate) => [...actor.items.values()].find(predicate);
});

const routes = [
  { name: "personal bank currency", type: "coin", run: (quantity) => depositCurrency(actor, "gold", quantity, item) },
  { name: "personal bank treasure", type: "item", run: (quantity) => depositItem(actor, item, quantity) },
  { name: "party treasury currency", type: "coin", run: (quantity) => requestPartyTreasury("deposit", { actorId: actor.id, itemId: item.id, denomination: "gold", quantity }) },
  { name: "party treasury treasure", type: "item", run: (quantity) => requestPartyTreasury("deposit", { actorId: actor.id, itemId: item.id, quantity }) },
  { name: "personal storehouse", type: "weapon", run: (quantity) => depositStorehouse(actor, item.id, quantity, false) },
  { name: "party storehouse", type: "weapon", run: (quantity) => depositStorehouse(actor, item.id, quantity, true) },
];

function unchanged() {
  expect(item.delete).not.toHaveBeenCalled();
  expect(item.update).not.toHaveBeenCalled();
  expect(actor.setFlag).not.toHaveBeenCalled();
  expect(game.settings.set.mock.calls.filter(([, key]) => key !== "inventoryOperationReceipts")).toHaveLength(0);
}

function ledgerWrites() {
  return actor.setFlag.mock.calls.filter(([, key]) => key !== JOURNAL_FLAG).length + game.settings.set.mock.calls.filter(([, key]) => key !== "inventoryOperationReceipts").length;
}

describe.each(routes)("BR-01 $name", ({ type, run }) => {
  it.each([0, -1, 0.5, 10, NaN, Infinity, "1"])("rejects requested quantity %s before mutation", async (quantity) => {
    item = source(type, 1);
    expect((await run(quantity)).success).toBe(false);
    unchanged();
  });
  it.each([0, -1, 0.5, undefined, NaN, "1"])("rejects invalid live quantity %s", async (quantity) => {
    item = source(type);
    item.system.quantity = quantity;
    expect((await run(1)).success).toBe(false);
    unchanged();
  });
  it("rejects a removed source", async () => {
    item = source(type);
    actor.items.delete(item.id);
    expect((await run(1)).success).toBe(false);
    unchanged();
  });
  it("rejects a foreign owner", async () => {
    item = source(type);
    item.parent = item.actor = { id: "other" };
    expect((await run(1)).success).toBe(false);
    unchanged();
  });
  it("rejects an ineligible live type", async () => {
    item = source(type);
    item.type = "container";
    expect((await run(1)).success).toBe(false);
    unchanged();
  });
  it("consumes only the requested part then the remainder", async () => {
    item = source(type, 3);
    expect((await run(1)).success).toBe(true);
    expect(item.update).toHaveBeenCalledWith({ "system.quantity": 2 });
    expect((await run(2)).success).toBe(true);
    expect(item.delete).toHaveBeenCalledTimes(1);
    const destination = type === "weapon"
      ? (actor.getFlag("osp-houserules", "storehouse") ?? settings.get("partyStorehouse"))
      : (actor.getFlag("osp-houserules", "bankLedger") ?? settings.get("partyTreasury"));
    expect(type === "coin" ? destination.currency.gold : destination.items[0].quantity).toBe(3);
  });
  it("re-reads depletion when two requests are queued", async () => {
    item = source(type, 3);
    const results = await Promise.all([run(2), run(2)]);
    expect(results.map((result) => result.success)).toEqual([true, true]);
    expect(item.update).toHaveBeenCalledTimes(1);
    expect(item.system.quantity).toBe(1);
    expect(item.delete).not.toHaveBeenCalled();
    expect(ledgerWrites()).toBe(1);
  });
  it("re-reads removal when two full-stack requests are queued", async () => {
    item = source(type, 1);
    const results = await Promise.all([run(1), run(1)]);
    expect(results.map((result) => result.success)).toEqual([true, true]);
    expect(item.delete).toHaveBeenCalledTimes(1);
    expect(ledgerWrites()).toBe(1);
  });
});

describe("BR-01 currency identity and catalog separation", () => {
  it.each([false, true])("rejects mismatched denomination (shared=%s)", async (shared) => {
    item = source("coin");
    item.name = "Silver Coins";
    const result = shared
      ? await requestPartyTreasury("deposit", { actorId: actor.id, itemId: item.id, denomination: "gold", quantity: 1 })
      : await depositCurrency(actor, "gold", 1, item);
    expect(result.success).toBe(false);
    unchanged();
  });
  it.each([false, true])("rejects an unknown source denomination (shared=%s)", async (shared) => {
    item = source("coin");
    item.name = "Platinum Coins";
    const result = shared
      ? await requestPartyTreasury("deposit", { actorId: actor.id, itemId: item.id, denomination: "gold", quantity: 1 })
      : await depositCurrency(actor, "gold", 1, item);
    expect(result.success).toBe(false);
    unchanged();
  });
  it("resolves a client reference to the authority’s live source document", async () => {
    const stale = source("coin", 10);
    item = source("coin", 1);
    expect((await depositCurrency(actor, "gold", 1, stale)).success).toBe(true);
    expect(item.delete).toHaveBeenCalledTimes(1);
    expect(stale.delete).not.toHaveBeenCalled();
    expect(stale.update).not.toHaveBeenCalled();
  });
  it("keeps GM catalog grants separate from inventory consumption", async () => {
    item = source("coin", 1);
    actor.items.delete(item.id);
    game.items.set(item.id, item);
    expect((await dmDepositCatalogItem(actor, item.toObject(), 10, "gold")).success).toBe(true);
    expect((await requestPartyTreasury("catalogDeposit", { actorId: actor.id, itemId: item.id, denomination: "gold", quantity: 10 })).success).toBe(true);
    item.type = "weapon";
    expect((await depositCatalogStorehouse(actor, item, 10, false)).success).toBe(true);
    expect((await depositCatalogStorehouse(actor, item, 10, true)).success).toBe(true);
    expect(item.delete).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    expect(actor.getFlag("osp-houserules", "bankLedger").currency.gold).toBe(10);
    expect(settings.get("partyTreasury").currency.gold).toBe(10);
    expect(actor.getFlag("osp-houserules", "storehouse").items[0].quantity).toBe(10);
    expect(settings.get("partyStorehouse").items[0].quantity).toBe(10);
  });
});
