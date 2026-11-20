import { beforeEach, describe, expect, it } from 'vitest';
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
beforeEach(setup);
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

describe('store authority', () => {
  it.each([false, true])('recovers every money, item, receipt and stock write boundary (after acknowledgement=%s)', async after => {
    let details = await openForRecovery();
    expect((await perform(player, 'storeCheckout', details, 'baseline')).success).toBe(true);
    const boundaries = writes;
    expect(boundaries).toBeGreaterThanOrEqual(5);
    for (let failed = 1; failed <= boundaries; failed++) {
      setup(); details = await openForRecovery(); failAt = failed; failAfter = after;
      const result = await perform(player, 'storeCheckout', details, 'faulted-checkout');
      failAt = null;
      if (result.recoveryRequired || listInventoryOperations().length) {
        expect((await recoverInventoryOperation('faulted-checkout')).success, `recover write ${failed}`).toBe(true);
      }
      const received = actor.items.filter(item => item.name === 'Blade').reduce((sum, item) => sum + item.system.quantity, 0);
      const receipts = actor.getFlag('osp-houserules', 'storeReceipts') || [];
      if (received) {
        expect(received).toBe(1); expect(valueCp(actor)).toBe(100);
        expect(getStoreData(journal).entries[0].stock).toBe(0);
        expect(receipts).toHaveLength(1); expect(getStoreData(journal).history).toEqual(receipts);
      } else {
        expect(valueCp(actor)).toBe(200); expect(getStoreData(journal).entries[0].stock).toBe(1);
        expect(receipts).toHaveLength(0); expect(getStoreData(journal).history).toHaveLength(0);
      }
      expect(actor.getFlag('osp-houserules', 'pendingInventoryTransaction')).toBeNull();
    }
  });

  it('preserves coins, stock and receipts when carried funds are insufficient', async () => {
    const details = await openForRecovery();
    await actor.items.find(item => item.type === 'coin').update({ 'system.quantity': 0 });
    const before = actor.items.map(item => item.toObject());
    expect((await perform(player, 'storeCheckout', details, 'poor-checkout')).success).toBe(false);
    expect(actor.items.map(item => item.toObject())).toEqual(before);
    expect(getStoreData(journal).entries[0].stock).toBe(1);
    expect(getStoreData(journal).history).toHaveLength(0);
  });

  it('rejects an old editor save after a sale rather than replacing updated stock and history', async () => {
    const details = await openForRecovery();
    const draft = getStoreData(journal);
    expect((await perform(player, 'storeCheckout', details, 'sale-before-edit')).success).toBe(true);
    expect((await perform(gm, 'storeSave', { id: journal.id, data: draft, expectedRevision: draft.revision }, 'stale-editor')).success).toBe(false);
    expect(getStoreData(journal).entries[0].stock).toBe(0);
    expect(getStoreData(journal).history).toHaveLength(1);
  });
  it('denies player store edits and enforces accessible ownership on checkout', async () => {
    send(player, 'storeSave', { id: journal.id, data: getStoreData(journal), expectedRevision: 0 }, 'player-save'); await drain();
    expect(results.find(result => result.operationId === 'player-save').result.success).toBe(false);
    const quote = quoteStore(getStoreData(journal), [{ entryId: 'blade', quantity: 1 }]); currentLines = quote.lines;
    send(player, 'storeCheckout', { actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote }, 'closed-checkout'); await drain();
    expect(results.find(result => result.operationId === 'closed-checkout').result.success).toBe(false);
  });

  it('allows GM access, charges once, and decrements finite stock', async () => {
    const data = getStoreData(journal); data.accessible = true; send(gm, 'storeSave', { id: journal.id, data, expectedRevision: 0 }, 'open-store'); await drain();
    const quote = quoteStore(getStoreData(journal), [{ entryId: 'blade', quantity: 1 }]); currentLines = quote.lines;
    send(player, 'storeCheckout', { actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote }, 'buy-once'); await drain(); await drain();
    expect(results.find(result => result.operationId === 'buy-once').result.success).toBe(true);
    expect(getStoreData(journal).entries[0].stock).toBe(0);
    const receiptCount = actor.getFlag('osp-houserules', 'storeReceipts').length;
    send(player, 'storeCheckout', { actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote }, 'buy-once'); await drain();
    expect(results.filter(result => result.operationId === 'buy-once').at(-1).result.success).toBe(true);
    expect(actor.getFlag('osp-houserules', 'storeReceipts')).toHaveLength(receiptCount);
    send(player, 'storeCheckout', { actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote }, 'buy-twice'); await drain();
    expect(results.find(result => result.operationId === 'buy-twice').result.success).toBe(false);
  });

  it('rejects tampered prices and wrong-party or wrong-actor requests without mutation', async () => {
    const data = getStoreData(journal); data.accessible = true; send(gm, 'storeSave', { id: journal.id, data, expectedRevision: 0 }, 'open-guard'); await drain();
    const quote = quoteStore(getStoreData(journal), [{ entryId: 'blade', quantity: 1 }]); currentLines = quote.lines;
    const beforeCoins = actor.items.map(item => item.toObject());
    const tampered = { ...quote, lines: quote.lines.map(line => ({ ...line, unitPriceCp: 1 })) };
    send(player, 'storeCheckout', { actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote: tampered }, 'tampered-price'); await drain();
    expect(results.find(result => result.operationId === 'tampered-price').result.success).toBe(false);
    expect(actor.items.map(item => item.toObject())).toEqual(beforeCoins);
    actor.flags.party = false;
    send(player, 'storeCheckout', { actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote }, 'non-party'); await drain();
    expect(results.find(result => result.operationId === 'non-party').result.success).toBe(false);
    actor.flags.party = true; actor.ownership = { player: 0, default: 0 }; actor.isOwner = true;
    send(player, 'storeCheckout', { actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote }, 'wrong-owner'); await drain();
    expect(results.find(result => result.operationId === 'wrong-owner').result.success).toBe(false);
  });

  it('serializes two checkout requests against the last stock unit', async () => {
    const data = getStoreData(journal); data.accessible = true; send(gm, 'storeSave', { id: journal.id, data, expectedRevision: 0 }, 'open-race'); await drain();
    const quote = quoteStore(getStoreData(journal), [{ entryId: 'blade', quantity: 1 }]); currentLines = quote.lines;
    send(player, 'storeCheckout', { actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote }, 'race-one');
    send(player, 'storeCheckout', { actorId: actor.id, actorUuid: actor.uuid, storeId: journal.id, quote }, 'race-two'); await drain(); await drain();
    const outcomes = ['race-one', 'race-two'].map(id => results.find(result => result.operationId === id)?.result.success);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(getStoreData(journal).entries[0].stock).toBe(0);
    expect(actor.getFlag('osp-houserules', 'storeReceipts')).toHaveLength(1);
  });
});
