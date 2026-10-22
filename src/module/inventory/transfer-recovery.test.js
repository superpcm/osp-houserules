import { initBankLedgerAuthority } from "./bank-ledger-orchestrator.js";
import { initPartyTreasury } from "./party-treasury.js";
import { initStorehouse } from "./storehouse.js";
import { COIN_TEMPLATES } from './treasure-cost.js';
import { beforeEach, describe, expect, it, vi } from "vitest";
import { depositItem, depositCurrency, withdrawItem, withdrawCurrency, dmEditCurrency } from "./bank-ledger-orchestrator.js";
import { requestPartyTreasury } from "./party-treasury.js";
import { depositStorehouse, withdrawStorehouse } from "./storehouse.js";
import { emptyLedger } from "./bank-ledger.js";
import { JOURNAL_FLAG, getPendingTransaction, recoverTransaction } from "./transaction-journal.js";

let actor, flags, settings, source, container, domainWrites, faults;
let serial = 0;
const copy = (value) => structuredClone(value);

async function write(stage, fn) {
  const fault = faults.get(stage);
  faults.delete(stage);
  if (fault === "before") throw new Error(`Injected ${stage} failure`);
  const result = await fn();
  if (fault === "after") throw new Error(`Injected ${stage} acknowledgement failure`);
  return result;
}
const domain = (fn) => {
  expect(flags.get(JOURNAL_FLAG)).toBeTruthy();
  return write(`domain${++domainWrites}`, fn);
};

function embedded(data) {
  const snapshot = copy(data);
  snapshot._id ??= `item-${++serial}`;
  const item = {
    id: snapshot._id, parent: actor, actor,
    get name() { return snapshot.name; }, get type() { return snapshot.type; }, get system() { return snapshot.system; },
    toObject: () => copy(snapshot),
    update: vi.fn(async (changes) => domain(() => {
      for (const [key, value] of Object.entries(changes)) {
        if (key === "system.quantity") snapshot.system.quantity = value;
        else if (key !== "_id") snapshot[key] = copy(value);
      }
      return item;
    })),
    delete: vi.fn(async () => domain(() => { actor.items.splice(actor.items.indexOf(item), 1); return item; })),
  };
  actor.items.push(item);
  return item;
}

beforeEach(() => {
  flags = new Map(); settings = new Map(); faults = new Map(); domainWrites = 0;
  const items = [];
  items.get = (id) => items.find((item) => item.id === id);
  actor = {
    id: `actor-${++serial}`, type: "character", name: "Tester", items,
    getFlag: (_scope, key) => flags.get(key),
    setFlag: vi.fn(async (_scope, key, value) => {
      const apply = () => { flags.set(key, copy(value)); return actor; };
      return key === JOURNAL_FLAG ? write(value ? "prepare" : "clear", apply) : domain(apply);
    }),
    createEmbeddedDocuments: vi.fn(async (_type, data, options) => domain(() => {
      expect(options.keepId).toBe(true);
      return data.map(embedded);
    })),
  };
  const gm = { id: "gm", isGM: true };
  globalThis.game = {
    user: gm, users: Object.assign(new Map([[gm.id, gm]]), { activeGM: gm }), actors: new Map([[actor.id, actor]]),
    system: { id: "osp-houserules" }, socket: { emit: vi.fn() },
    settings: {
      get: (_scope, key) => settings.get(key),
      set: vi.fn(async (_scope, key, value) => key === "inventoryOperationReceipts" ? settings.set(key, copy(value)) : domain(() => { settings.set(key, copy(value)); return value; })),
    },
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
  initBankLedgerAuthority(); initPartyTreasury(); initStorehouse();
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  globalThis.foundry = { utils: { randomID: () => `operation-${++serial}` } };
  container = embedded({ _id: "container", type: "container", name: "Chest", system: { capacity: 100 } });
});

function data(type, quantity) {
  if (type === "coin") return { ...copy(COIN_TEMPLATES["Gold Coins"]), system: { ...COIN_TEMPLATES["Gold Coins"].system, quantity, containerId: container.id } };
  return { type, name: type === "coin" ? "Gold Coins" : type === "item" ? "Ruby" : "Rope", system: { quantity, treasure: type === "item", storedSize: 0.01, containerId: container.id, tags: [], cost: 5, unitWeight: 1 } };
}
function seedLedger(type, quantity) {
  const ledger = emptyLedger();
  if (type === "coin") ledger.currency.gold = quantity;
  else ledger.items.push({ entryId: "entry", name: "Ruby", quantity, unique: false, itemData: data(type, quantity) });
  return ledger;
}
function seedStore(quantity) {
  return { items: [{ entryId: "entry", name: "Rope", type: "weapon", quantity, unique: false, itemData: data("weapon", quantity) }], log: [] };
}
function total() {
  const inventory = actor.items.filter((item) => item.type !== "container").reduce((sum, item) => sum + item.system.quantity, 0);
  const accounts = [flags.get("bankLedger"), settings.get("partyTreasury"), flags.get("storehouse"), settings.get("partyStorehouse")];
  return inventory + accounts.reduce((sum, account) => sum + (account?.items ?? []).reduce((n, entry) => n + entry.quantity, 0) + Object.values(account?.currency ?? {}).reduce((n, value) => n + value, 0), 0);
}
function state() {
  return {
    items: actor.items.map((item) => item.toObject()).sort((a, b) => a._id.localeCompare(b._id)),
    bank: flags.get("bankLedger") ?? null, store: flags.get("storehouse") ?? null,
    treasury: settings.get("partyTreasury") ?? null, partyStore: settings.get("partyStorehouse") ?? null,
  };
}

const families = [
  { name: "personal currency", type: "coin", shared: false, store: false },
  { name: "personal treasure", type: "item", shared: false, store: false },
  { name: "party currency", type: "coin", shared: true, store: false },
  { name: "party treasure", type: "item", shared: true, store: false },
  { name: "personal storehouse", type: "weapon", shared: false, store: true },
  { name: "party storehouse", type: "weapon", shared: true, store: true },
];
const routes = families.flatMap((family) => [
  ...[false, true].map((full) => ({ ...family, name: `${family.name} ${full ? "full" : "partial"} deposit`, mode: "deposit", full })),
  ...[false, true].map((merge) => ({ ...family, name: `${family.name} ${merge ? "merged" : "new"} withdrawal`, mode: "withdraw", merge })),
]);
for (const fromParty of [false, true]) for (const type of ["coin", "item"]) routes.push({ name: `${type} transfer ${fromParty ? "from" : "to"} party`, mode: "transfer", fromParty, type });

function prepare(route) {
  if (route.mode === "transfer") {
    flags.set("bankLedger", seedLedger(route.type, route.fromParty ? 0 : 3));
    settings.set("partyTreasury", seedLedger(route.type, route.fromParty ? 3 : 0));
    return () => requestPartyTreasury("transfer", { actorId: actor.id, sourceAccount: route.fromParty ? "party" : "personal", destinationAccount: route.fromParty ? "personal" : "party", payloadType: route.type === "coin" ? "currency" : "item", denomination: route.type === "coin" ? "gold" : undefined, entryId: "entry", quantity: 2 });
  }
  if (route.mode === "deposit") {
    source = embedded(data(route.type, 3));
    const quantity = route.full ? 3 : 1;
    return () => route.store
      ? depositStorehouse(actor, source.id, quantity, route.shared)
      : route.shared ? requestPartyTreasury("deposit", { actorId: actor.id, itemId: source.id, quantity, denomination: route.type === "coin" ? "gold" : undefined })
      : route.type === "coin" ? depositCurrency(actor, "gold", quantity, source) : depositItem(actor, source, quantity);
  }
  const destination = route.shared ? settings : flags;
  destination.set(route.store ? route.shared ? "partyStorehouse" : "storehouse" : route.shared ? "partyTreasury" : "bankLedger", route.store ? seedStore(3) : seedLedger(route.type, 3));
  if (route.merge) {
    const itemData = data(route.type, 2);
    // Coin withdrawals use canonical template size.
    if (route.type === "coin") itemData.system.storedSize = 0.04;
    source = embedded(itemData);
  }
  return () => route.store
    ? withdrawStorehouse(actor, "entry", 2, container.id, route.shared)
    : route.shared ? requestPartyTreasury("withdraw", { actorId: actor.id, entryId: "entry", quantity: 2, containerId: container.id, denomination: route.type === "coin" ? "gold" : undefined })
    : route.type === "coin" ? withdrawCurrency(actor, "gold", 2, container) : withdrawItem(actor, "entry", 2, container);
}

describe.each(routes)("BR-02 $name", (route) => {
  it("conserves goods on success and clears the journal after both writes", async () => {
    const run = prepare(route), conserved = total();
    expect((await run()).success).toBe(true);
    expect(total()).toBe(conserved);
    expect(getPendingTransaction(actor)).toBeFalsy();
    if (route.mode === "deposit" && route.full) expect(actor.items.get(source.id)).toBeUndefined();
    if (route.mode === "withdraw" && route.merge) expect(source.system.quantity).toBe(4);
  });
  it.each(["prepare", "domain1", "domain2"])("conserves and restores original state when %s rejects", async (stage) => {
    const run = prepare(route), before = copy(state()), conserved = total();
    faults.set(stage, "before");
    const result = await run();
    expect(result.success).toBe(false);
    expect(result.recoveryRequired).not.toBe(true);
    expect(state()).toEqual(before);
    expect(total()).toBe(conserved);
    expect(getPendingTransaction(actor)).toBeFalsy();
  });
  it("restores a first write which applied before rejecting", async () => {
    const run = prepare(route), before = copy(state());
    faults.set("domain1", "after");
    expect((await run()).success).toBe(false);
    expect(state()).toEqual(before);
    expect(getPendingTransaction(actor)).toBeFalsy();
  });
  it("keeps goods untouched if journal preparation applies before rejecting", async () => {
    const run = prepare(route), before = copy(state());
    faults.set("prepare", "after");
    expect((await run()).success).toBe(false);
    expect(domainWrites).toBe(0);
    expect(state()).toEqual(before);
    if (getPendingTransaction(actor)) expect(await recoverTransaction(actor)).toMatchObject({ success: true, outcome: "restored" });
    expect(getPendingTransaction(actor)).toBeFalsy();
  });
  it("confirms compensation which applied before its acknowledgement rejected", async () => {
    const run = prepare(route), before = copy(state());
    faults.set("domain2", "before"); faults.set("domain3", "after");
    const result = await run();
    expect(result.success).toBe(false);
    expect(result.recoveryRequired).not.toBe(true);
    expect(state()).toEqual(before);
    expect(getPendingTransaction(actor)).toBeFalsy();
  });
  it("confirms a completed second write despite a rejected acknowledgement", async () => {
    const run = prepare(route), conserved = total();
    faults.set("domain2", "after");
    expect((await run()).success).toBe(true);
    expect(total()).toBe(conserved);
    expect(getPendingTransaction(actor)).toBeFalsy();
  });
  it("retains failed compensation, blocks retries, and recovers from durable snapshots", async () => {
    const run = prepare(route), before = copy(state()), conserved = total();
    faults.set("domain2", "before"); faults.set("domain3", "before");
    const result = await run();
    expect(result).toMatchObject({ success: false, recoveryRequired: true });
    expect(result.reason).not.toMatch(/were restored|state restored/);
    const persisted = copy(getPendingTransaction(actor));
    expect(persisted).toBeTruthy();
    expect((await run()).recoveryRequired).toBe(true);
    // Recovery reads a serialized record, not a retained reference to the original plan.
    flags.set(JOURNAL_FLAG, copy(persisted));
    expect(await recoverTransaction(actor)).toMatchObject({ success: true, outcome: "restored" });
    expect(state()).toEqual(before);
    expect(total()).toBe(conserved);
    expect(getPendingTransaction(actor)).toBeFalsy();
    const writes = domainWrites;
    await recoverTransaction(actor);
    expect(domainWrites).toBe(writes);
  });
  it("retains cleanup failure and later finalizes the committed operation without replaying it", async () => {
    const run = prepare(route), conserved = total();
    faults.set("clear", "before");
    expect(await run()).toMatchObject({ success: false, recoveryRequired: true });
    expect(total()).toBe(conserved);
    const committed = copy(state());
    expect(getPendingTransaction(actor)).toBeTruthy();
    expect((await run()).recoveryRequired).toBe(true);
    expect(await recoverTransaction(actor)).toMatchObject({ success: true, outcome: "committed" });
    expect(state()).toEqual(committed);
    expect(getPendingTransaction(actor)).toBeFalsy();
  });
  it("confirms journal cleanup which applied before its acknowledgement rejected", async () => {
    const run = prepare(route), conserved = total();
    faults.set("clear", "after");
    expect((await run()).success).toBe(true);
    expect(total()).toBe(conserved);
    expect(getPendingTransaction(actor)).toBeFalsy();
  });
  it("retains a cleanup failure after compensation and later confirms restoration", async () => {
    const run = prepare(route), before = copy(state());
    faults.set("domain2", "before"); faults.set("clear", "before");
    expect(await run()).toMatchObject({ success: false, recoveryRequired: true });
    expect(state()).toEqual(before);
    expect(getPendingTransaction(actor)).toBeTruthy();
    const writes = domainWrites;
    expect(await recoverTransaction(actor)).toMatchObject({ success: true, outcome: "restored" });
    expect(domainWrites).toBe(writes);
    expect(getPendingTransaction(actor)).toBeFalsy();
  });
});

describe("BR-02 pending recovery protections", () => {
  it.each(families)("conserves goods when withdrawing into an empty $name stack", async (family) => {
    const run = prepare({ ...family, mode: "withdraw", merge: true });
    source.system.quantity = 0;
    const conserved = total();
    expect((await run()).success).toBe(true);
    expect(source.system.quantity).toBe(2);
    expect(total()).toBe(conserved);
  });
  it("allows only the GM to reconcile a persisted transaction", async () => {
    const run = prepare(routes[0]);
    faults.set("domain2", "before"); faults.set("domain3", "before");
    await run();
    const before = copy(state()), writes = domainWrites;
    game.user.isGM = false;
    expect(await recoverTransaction(actor)).toMatchObject({ success: false, recoveryRequired: true });
    expect(state()).toEqual(before);
    expect(domainWrites).toBe(writes);
    expect(getPendingTransaction(actor)).toBeTruthy();
  });
  it("recovers after reloading the journal module", async () => {
    const run = prepare(routes[1]), before = copy(state());
    faults.set("domain2", "before"); faults.set("domain3", "before");
    await run();
    flags.set(JOURNAL_FLAG, copy(getPendingTransaction(actor)));
    vi.resetModules();
    const reloaded = await import("./transaction-journal.js");
    expect(await reloaded.recoverTransaction(actor)).toMatchObject({ success: true, outcome: "restored" });
    expect(state()).toEqual(before);
  });
  it("protects pending records from manual bank edits", async () => {
    const run = prepare(routes[0]);
    faults.set("domain2", "before"); faults.set("domain3", "before");
    await run();
    expect((await dmEditCurrency(actor, "gold", 100)).recoveryRequired).toBe(true);
  });
  it("refuses recovery when an endpoint changed outside its recorded states", async () => {
    const run = prepare(routes[0]);
    faults.set("domain2", "before"); faults.set("domain3", "before");
    await run();
    const conflicting = seedLedger("coin", 99);
    flags.set("bankLedger", conflicting);
    const before = copy(state());
    expect(await recoverTransaction(actor)).toMatchObject({ success: false, recoveryRequired: true });
    expect(state()).toEqual(before);
    expect(getPendingTransaction(actor)).toBeTruthy();
  });
});
