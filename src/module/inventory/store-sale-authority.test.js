import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initStoreRestocking } from './store-restocking.js';
import { initStoreSales, quoteStoreSale } from './store-sale.js';
vi.mock('./catalog-stocking.js', async importOriginal => ({ ...await importOriginal(), loadStockingCatalog: vi.fn(async () => []) }));
vi.mock('./store-placement.js', () => ({ validateStorePlacement: () => ({ allowed: true }) }));
import { initStores, quoteStore, checkoutStore, getStoreData } from './store.js';
import { initInventoryAuthority, INVENTORY_SOCKET_NAMESPACE, recoverInventoryOperation, listInventoryOperations } from './inventory-authority.js';
import { createDropDraft } from './drop-transaction.js';

let gm, player, hooks, results, actor, journal, sequence;
let writes, failAt, failAfter;
const copy = value => structuredClone(value);
async function write(fn) {
  const boundary = ++writes;
  if (failAt === boundary && !failAfter) throw new Error('Injected write failure');
  const result = fn();
  if (failAt === boundary && failAfter) throw new Error('Injected acknowledgement failure');
  return result;
}
function patch(data, updates) {
  for (const [key, value] of Object.entries(updates)) {
    const path = key.split('.'); let target = data;
    for (const part of path.slice(0, -1)) target = target[part] ??= {};
    const leaf = path.at(-1);
    if (leaf.startsWith('-=')) delete target[leaf.slice(2)]; else target[leaf] = copy(value);
  }
}
function addItem(data) {
  const value = copy({ ...data, _id: data._id ?? `item-${++sequence}` });
  const item = { id: value._id, name: value.name, type: value.type, system: value.system, toObject: () => copy(value), update: async changes => write(() => patch(value, changes)), delete: async () => write(() => actor.items.splice(actor.items.indexOf(item), 1)) };
  actor.items.push(item); return item;
}
function makeJournal(data) {
  const flags = { 'osp-houserules': { store: copy(data) } };
  return { id: `journal-${++sequence}`, uuid: `JournalEntry.journal-${sequence}`, name: data.name, ownership: { default: data.accessible ? 2 : 0 }, flags, getFlag: (_scope, key) => flags['osp-houserules']?.[key], setFlag: async (_scope, key, value) => write(() => { flags['osp-houserules'][key] = copy(value); }), update: async update => write(() => { if (update.name != null) journal.name = update.name; if (update.ownership) journal.ownership = copy(update.ownership); if (update['flags.osp-houserules.store'] !== undefined) flags['osp-houserules'].store = copy(update['flags.osp-houserules.store']); }) };
}
function send(user, action, details, operationId) { hooks[0]({ flags: { 'osp-houserules': { inventoryAuthority: { type: 'request', envelope: { namespace: INVENTORY_SOCKET_NAMESPACE, type: 'request', userId: user.id, action, details, operationId } } } } }, {}, user.id); }
async function drain() { for (let i = 0; i < 60; i++) await Promise.resolve(); }

function setup() {
  writes = 0; failAt = null; failAfter = false;
  sequence = 0; gm = { id: 'gm', isGM: true }; player = { id: 'player', isGM: false }; hooks = []; results = [];
  actor = { id: 'hero', uuid: 'Actor.hero', type: 'character', name: 'Hero', isOwner: true, ownership: { player: 3, default: 0 }, items: [], getFlag: (_s, k) => actor.flags?.[k] ?? null, setFlag: async (_s, k, v) => write(() => { actor.flags ??= {}; actor.flags[k] = copy(v); }), createEmbeddedDocuments: async (_t, data) => write(() => data.map(addItem)), updateEmbeddedDocuments: async (_t, updates) => Promise.all(updates.map(u => actor.items.find(i => i.id === u._id)?.update(u))) };
  actor.flags = { party: true }; addItem({ name: 'Coin Purse', type: 'container', system: { quantity: 1, containerId: null } }); addItem({ name: 'Gold Coins', type: 'coin', system: { quantity: 2, containerId: actor.items[0].id } });
  const storeData = { version: 1, revision: 0, name: 'Armorer', description: '', img: '', accessible: false, adjustment: 0, entries: [{ id: 'blade', itemData: { name: 'Blade', type: 'weapon', img: 'blade.webp', system: { cost: 10, tags: [], quantity: 1, storedSize: 1 } }, customPrice: null, stock: 1, hidden: false }], history: [] };
  journal = makeJournal(storeData); globalThis.game = { user: gm, world: { id: 'store-test' }, system: { id: 'osp-houserules' }, users: Object.assign(new Map([[gm.id, gm], [player.id, player]]), { activeGM: gm }), actors: new Map([[actor.id, actor]]), journal: Object.assign(new Map([[journal.id, journal]]), { documentClass: { create: async data => { const doc = makeJournal(data.flags['osp-houserules'].store); journal = doc; globalThis.game.journal.set(doc.id, doc); return doc; } } }), settings: { values: {}, get: (_s, k) => globalThis.game.settings.values[k], set: async (_s, k, v) => { globalThis.game.settings.values[k] = copy(v); } } };
  globalThis.Hooks = { on: (_e, fn) => hooks.push(fn) }; globalThis.ChatMessage = { create: async data => { const payload = data.flags['osp-houserules'].inventoryAuthority; if (payload.type === 'result') results.push(payload); hooks.forEach(fn => fn({ flags: data.flags }, {}, payload.type === 'result' ? gm.id : game.user.id)); } }; globalThis.foundry = { utils: { randomID: () => `id-${++sequence}` } }; globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } }; globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }; delete globalThis.__ospInventoryChatHook; initInventoryAuthority(); initStores({ planPlacement: async target => { const state = createDropDraft(target); for (const line of currentLines) await state.actor.createEmbeddedDocuments('Item', [{ ...copy(line.itemData), system: { ...line.itemData.system, quantity: line.quantity } }]); return { success: true, draftState: state }; }, validatePlacement: () => ({ allowed: true }) });
}
function setupSale() {
  setup(); initStoreSales();
  const data = getStoreData(journal);
  Object.assign(data, { accessible: true, buysFromPlayers: true, buybackRate: 50, restockPurchases: true });
  journal.flags['osp-houserules'].store = data;
  addItem({ _id: 'sale-item', name: 'Spare Spear', type: 'weapon', flags: { custom: { mark: 'retained' } }, system: { quantity: 3, cost: 10, tags: [], storedSize: 1, weight: 1, containerId: null, equipped: false, lashed: false } });
}
beforeEach(setupSale);
let currentLines = [];

async function perform(user, action, details, id) {
  send(user, action, details, id);
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setImmediate(resolve));
    const result = results.filter(entry => entry.operationId === id).at(-1)?.result;
    if (result) return result;
  }
  throw new Error(`Authority did not answer ${id}`);
}
const valueCp = target => target.items.filter(item => item.type === 'coin').reduce((sum, item) => sum + item.system.quantity * ({ 'Gold Coins': 100, 'Silver Coins': 10, 'Copper Coins': 1 }[item.name]), 0);
async function openForRecovery() {
  const data = getStoreData(journal); data.accessible = true;
  expect((await perform(gm, 'storeSave', { id: journal.id, data, expectedRevision: 0 }, 'open-recovery')).success).toBe(true);
  const quote = quoteStore(getStoreData(journal), [{ entryId: 'blade', quantity: 1 }]); currentLines = quote.lines;
  writes = 0;
  return { actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote };
}

describe('store sale authority', () => {
  const quoteSale = (quantity = 1) => quoteStoreSale(actor, getStoreData(journal), [{ itemId: 'sale-item', quantity }]);
  const detailsFor = quote => ({ actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote });
  it('atomically removes quantities, credits carried coins, restocks and records a sale receipt once', async () => {
    const before = valueCp(actor), details = detailsFor(quoteSale(2));
    expect(details.quote.success).toBe(true);
    const result = await perform(player, 'storeSale', details, 'sale-once');
    expect(result.success).toBe(true);
    expect(actor.items.find(item => item.id === 'sale-item').system.quantity).toBe(1);
    expect(valueCp(actor)).toBe(before + 100);
    expect(actor.flags.storeReceipts).toHaveLength(1);
    expect(actor.flags.storeReceipts[0]).toMatchObject({ kind: 'sale', totalCp: 100, beforeCp: before, afterCp: before + 100 });
    const next = getStoreData(journal);
    expect(next.history).toHaveLength(1);
    expect(next.entries.at(-1)).toMatchObject({ stock: 2, itemData: { name: 'Spare Spear', system: { quantity: 1, containerId: null } } });
    expect(next.entries.at(-1).itemData._id).toBeUndefined();
    expect((await perform(player, 'storeSale', details, 'sale-once')).success).toBe(true);
    expect(valueCp(actor)).toBe(before + 100); expect(actor.flags.storeReceipts).toHaveLength(1);
  });
  it('rejects closed, disabled, non-party and non-owned sales without changes', async () => {
    for (const kind of ['closed', 'disabled', 'party', 'owner']) {
      setupSale(); const details = detailsFor(quoteSale()), before = valueCp(actor);
      if (kind === 'closed') journal.flags['osp-houserules'].store.accessible = false;
      if (kind === 'disabled') journal.flags['osp-houserules'].store.buysFromPlayers = false;
      if (kind === 'party') actor.flags.party = false;
      if (kind === 'owner') actor.ownership.player = 0;
      expect((await perform(player, 'storeSale', details, `denied-${kind}`)).success).toBe(false);
      expect(valueCp(actor)).toBe(before); expect(actor.items.find(item => item.id === 'sale-item').system.quantity).toBe(3);
      expect(getStoreData(journal).history).toHaveLength(0);
    }
  });
  it('rejects forged values, stale revisions, changed items and invalid quantities', async () => {
    for (const kind of ['price', 'revision', 'fingerprint', 'quantity', 'changed']) {
      setupSale(); const details = detailsFor(quoteSale()); const before = valueCp(actor);
      if (kind === 'price') details.quote.totalCp = 100000;
      if (kind === 'revision') details.quote.revision--;
      if (kind === 'fingerprint') details.quote.actorFingerprint = 'forged';
      if (kind === 'quantity') details.quote.lines[0].quantity = 4;
      if (kind === 'changed') actor.items.find(item => item.id === 'sale-item').system.cost++;
      expect((await perform(player, 'storeSale', details, `stale-${kind}`)).success).toBe(false);
      expect(valueCp(actor)).toBe(before); expect(actor.items.find(item => item.id === 'sale-item').system.quantity).toBe(3);
    }
  });
  it('rejects filled parents and coin destinations on vehicles', async () => {
    addItem({ name: 'Hidden Goods', type: 'item', system: { quantity: 1, containerId: 'sale-item', cost: 1 } });
    expect(quoteSale().success).toBe(false);
    setupSale();
    const purse = actor.items.find(item => item.type === 'container');
    addItem({ _id: 'wagon', name: 'Wagon', type: 'vehicle', system: { quantity: 1 } });
    purse.system.containerId = 'wagon';
    const before = valueCp(actor);
    expect((await perform(player, 'storeSale', detailsFor(quoteSale()), 'un-carried')).success).toBe(false);
    expect(valueCp(actor)).toBe(before);
  });
  it.each([false, true])('recovers every sale write boundary (lost acknowledgement=%s)', async after => {
    const original = detailsFor(quoteSale());
    expect((await perform(player, 'storeSale', original, 'sale-baseline')).success).toBe(true);
    const boundaries = writes;
    expect(boundaries).toBeGreaterThanOrEqual(4);
    for (let boundary = 1; boundary <= boundaries; boundary++) {
      setupSale(); const details = detailsFor(quoteSale()), before = valueCp(actor);
      writes = 0; failAt = boundary; failAfter = after;
      const result = await perform(player, 'storeSale', details, `sale-fault-${after}-${boundary}`);
      failAt = null;
      if (result.recoveryRequired) expect((await recoverInventoryOperation(result.operationId)).success).toBe(true);
      expect(listInventoryOperations()).toHaveLength(0);
      const receipt = actor.flags.storeReceipts?.find(value => value.id === result.operationId);
      if (receipt) {
        expect(actor.items.find(item => item.id === 'sale-item').system.quantity).toBe(2);
        expect(valueCp(actor)).toBe(before + 50); expect(getStoreData(journal).history).toHaveLength(1);
      } else {
        expect(actor.items.find(item => item.id === 'sale-item').system.quantity).toBe(3);
        expect(valueCp(actor)).toBe(before); expect(getStoreData(journal).history).toHaveLength(0);
      }
    }
  });
});

describe('ongoing store restock authority', () => {
  function configure() {
    initStoreRestocking(); game.time = { worldTime: 100 };
    game.items = [{ id: 'torch', uuid: 'Item.torch', name: 'Torch', type: 'item', system: { cost: 1, tags: [], storeAvailability: 'common' } }];
    const data = journal.flags['osp-houserules'].store;
    data.accessible = false;
    data.stocking = { enabled: true, profileId: 'general', settlement: 'town', size: 'small', seed: 'test', restockDays: 7, lastRestockWorldTime: 100, managedSources: [], minStock: 5, maxStock: 5, unavailableChance: 0 };
  }
  it('due-gates automatic runs, permits manual GM restocking and preserves closure and manual stock', async () => {
    configure();
    expect((await perform(gm, 'storeRestock', { storeId: journal.id, force: false }, 'not-due')).outcome).toBe('not-due');
    expect(getStoreData(journal).revision).toBe(0);
    const details = { storeId: journal.id, force: true };
    expect((await perform(gm, 'storeRestock', details, 'restock-now')).success).toBe(true);
    const next = getStoreData(journal);
    expect(next).toMatchObject({ accessible: false, revision: 1 });
    expect(journal.ownership.default).toBe(0);
    expect(next.entries.find(entry => entry.id === 'blade').stock).toBe(1);
    expect(next.entries.find(entry => entry.sourceUuid === 'Item.torch').stock).toBe(5);
    expect(next.stocking.managedSources).toEqual(['Item.torch']);
    expect((await perform(gm, 'storeRestock', details, 'restock-now')).success).toBe(true);
    expect(getStoreData(journal).revision).toBe(1);
  });
  it('restocks on game-time interval, without charging characters or changing receipts', async () => {
    configure(); game.time.worldTime += 7 * 86400;
    const before = valueCp(actor);
    expect((await perform(gm, 'storeRestock', { storeId: journal.id, force: false }, 'due-restock')).success).toBe(true);
    expect(getStoreData(journal).stocking.lastRestockWorldTime).toBe(game.time.worldTime);
    expect(valueCp(actor)).toBe(before); expect(getStoreData(journal).history).toHaveLength(0);
  });
  it('uses saved environment and item rules on restocking without touching manual goods or closure', async () => {
    configure();
    const data = journal.flags['osp-houserules'].store;
    data.entries[0].sourceUuid = 'Item.manual';
    data.entries.push({ id: 'managed-dagger', sourceUuid: 'Item.dagger', itemData: { name: 'Dagger', type: 'weapon', system: { cost: 3 } }, stock: 4, customPrice: 8, hidden: false });
    game.items.push({ id: 'dagger', uuid: 'Item.dagger', name: 'Dagger', type: 'weapon', system: { cost: 3, tags: [] } });
    Object.assign(data.stocking, { economy: 'mining', wealth: 'poor', supply: 'disrupted', demand: 'military', event: 'war', alwaysStock: ['Item.torch'], neverStock: ['Item.dagger', 'Item.manual'], buybackRates: { weapon: 75 }, managedSources: ['Item.dagger'] });
    expect((await perform(gm, 'storeRestock', { storeId: journal.id, force: true }, 'environment-restock')).success).toBe(true);
    const next = getStoreData(journal);
    expect(next.entries.find(entry => entry.id === 'blade')).toMatchObject({ stock: 1, customPrice: null });
    expect(next.entries.find(entry => entry.id === 'managed-dagger')).toMatchObject({ stock: 0, customPrice: 8 });
    expect(next.entries.find(entry => entry.sourceUuid === 'Item.torch').stock).toBe(5);
    expect(next.stocking).toMatchObject({ economy: 'mining', wealth: 'poor', buybackRates: { weapon: 75 } });
    expect(next.accessible).toBe(false);
  });
  it('uses saved editable product counts during ongoing restocking', async () => {
    configure();
    game.items = Array.from({ length: 90 }, (_, index) => ({ id: `supply-${index}`, uuid: `Item.supply-${index}`, name: `Supply ${index}`, type: 'item', system: { cost: 1, tags: [], storeAvailability: 'common' } }));
    Object.assign(journal.flags['osp-houserules'].store.stocking, { minProducts: 40, maxProducts: 40 });
    expect((await perform(gm, 'storeRestock', { storeId: journal.id, force: true }, 'editable-count-restock')).success).toBe(true);
    const next = getStoreData(journal);
    expect(next.entries).toHaveLength(41);
    expect(next.stocking.managedSources).toHaveLength(40);
    expect(next.entries.find(entry => entry.id === 'blade').stock).toBe(1);
    expect(next.accessible).toBe(false);
  });
  it('denies player restocking and invalid intervals', async () => {
    configure();
    expect((await perform(player, 'storeRestock', { storeId: journal.id, force: true }, 'player-restock')).success).toBe(false);
    journal.flags['osp-houserules'].store.stocking.restockDays = 0;
    expect((await perform(gm, 'storeRestock', { storeId: journal.id, force: true }, 'invalid-restock')).success).toBe(false);
    expect(getStoreData(journal).revision).toBe(0);
  });
});

it('revalidates buying-rate overrides at authority and rejects an offer after preferences change', async () => {
  const data = journal.flags['osp-houserules'].store;
  data.stocking = { buybackRates: { weapon: 75 } };
  const quote = quoteStoreSale(actor, getStoreData(journal), [{ itemId: 'sale-item', quantity: 1 }]);
  expect(quote.totalCp).toBe(75);
  data.stocking.buybackRates.weapon = 50;
  const before = valueCp(actor);
  expect((await perform(player, 'storeSale', { actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote }, 'changed-buying-preference')).success).toBe(false);
  expect(valueCp(actor)).toBe(before);
  expect(actor.items.find(item => item.id === 'sale-item').system.quantity).toBe(3);
});
it('persists profile variables through store authority and refuses malformed settings', async () => {
  const data = getStoreData(journal);
  data.stocking = { profileId: 'blacksmith', minProducts: 40, maxProducts: 70, restockDays: 7, enabled: true, economy: 'mining', wealth: 'wealthy', supply: 'abundant', demand: 'military', event: 'war', alwaysStock: [], neverStock: [], rarityOverrides: { 'Item%2Etorch': 'rare' }, buybackRates: { weapon: 75 } };
  expect((await perform(gm, 'storeSave', { id: journal.id, data, expectedRevision: 0 }, 'save-profile-variables')).success).toBe(true);
  expect(getStoreData(journal).stocking).toEqual(data.stocking);
  const invalid = getStoreData(journal); invalid.stocking.demand = 'invalid';
  expect((await perform(gm, 'storeSave', { id: journal.id, data: invalid, expectedRevision: 1 }, 'invalid-variables')).success).toBe(false);
  expect(getStoreData(journal).stocking.demand).toBe('military');
});
