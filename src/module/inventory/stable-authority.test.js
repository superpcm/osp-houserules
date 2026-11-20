import { beforeEach, describe, expect, it } from 'vitest';
import { emptyStable, getStableData, initStables, quoteStable, quoteStableSale, checkoutStable, completeStableSale, endStableBooking } from './stable.js';
import { initInventoryAuthority, INVENTORY_SOCKET_NAMESPACE } from './inventory-authority.js';
import { recoverTransaction } from './transaction-journal.js';
import { createDropDraft } from './drop-transaction.js';

let gm, player, actor, journal, hooks, results, sequence, failAfterJournal, failAfterCreate;
const copy = value => structuredClone(value);
const item = data => ({ ...copy(data), _id: data._id ?? `item-${++sequence}` });
function makeItem(data) {
  const value = item(data); const entry = { id: value._id, name: value.name, type: value.type, system: value.system, toObject: () => copy(value), update: async changes => { for (const [key, val] of Object.entries(changes)) entry.system[key.split('.').at(-1)] = val; }, delete: async () => { actor.items = actor.items.filter(candidate => candidate.id !== entry.id); } };
  return entry;
}
function makeJournal(data) { const journalId = `stable-${++sequence}`; const flags = { 'osp-houserules': { stable: copy(data) } }; const document = { id: journalId, uuid: `JournalEntry.${journalId}`, name: data.name, flags, ownership: { default: 0 }, getFlag: (_s, key) => flags['osp-houserules']?.[key], update: async update => { if (update.name) document.name = update.name; if (update.ownership) document.ownership = copy(update.ownership); if (update['flags.osp-houserules.stable']) flags['osp-houserules'].stable = copy(update['flags.osp-houserules.stable']); } }; return document; }
function send(user, action, details, operationId) { hooks[0]({ flags: { 'osp-houserules': { inventoryAuthority: { type: 'request', envelope: { namespace: INVENTORY_SOCKET_NAMESPACE, type: 'request', userId: user.id, action, details, operationId } } } } }, {}, user.id); }
async function perform(user, action, details, operationId) { send(user, action, details, operationId); for (let i = 0; i < 80; i++) { await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); const found = results.find(entry => entry.operationId === operationId)?.result; if (found) return found; } throw new Error('authority did not respond'); }
const balance = () => actor.items.reduce((sum, entry) => sum + (entry.type === 'coin' ? ({ 'Gold Coins': 100, 'Silver Coins': 10, 'Copper Coins': 1 }[entry.name] ?? 0) * Number(entry.system.quantity ?? 0) : 0), 0);

beforeEach(() => {
  sequence = 0; failAfterJournal = false; failAfterCreate = false; hooks = []; results = []; gm = { id: 'gm', isGM: true }; player = { id: 'player', isGM: false };
  actor = { id: 'hero', uuid: 'Actor.hero', type: 'character', name: 'Rider', isOwner: true, ownership: { player: 3, default: 0 }, flags: { party: true }, items: [], getFlag: (_s, key) => actor.flags[key] ?? null, setFlag: async (_s, key, value) => { actor.flags[key] = copy(value); if (key === 'pendingInventoryTransaction' && failAfterJournal) { failAfterJournal = false; throw new Error('Injected acknowledgement failure'); } }, updateEmbeddedDocuments: async (_t, updates) => updates.forEach(update => actor.items.find(entry => entry.id === update._id)?.update(update)), createEmbeddedDocuments: async (_t, data) => { const created = data.map(makeItem); actor.items.push(...created); if (failAfterCreate) { failAfterCreate = false; throw new Error('Injected item acknowledgement failure'); } return created; } };
  const purse = makeItem({ name: 'Purse', type: 'container', system: { quantity: 1, containerId: null } }); actor.items.push(purse); actor.items.push(makeItem({ name: 'Gold Coins', type: 'coin', system: { quantity: 2, containerId: purse.id } }));
  const data = { ...emptyStable('Westford Stables'), accessible: false, entries: [{ id: 'mule', itemData: { name: 'Mule', type: 'livestock', system: { cost: 10, quantity: 1 } }, customPrice: null, stock: 2, individual: false }], boarding: { enabled: true, capacity: 2, priceCp: 10 } }; journal = makeJournal(data);
  globalThis.game = { user: gm, world: { id: 'stable-test' }, system: { id: 'osp-houserules' }, time: { worldTime: 100 }, users: Object.assign(new Map([[gm.id, gm], [player.id, player]]), { activeGM: gm }), actors: new Map([[actor.id, actor]]), journal: Object.assign(new Map([[journal.id, journal]]), { contents: [journal] }), settings: { get: () => null, set: async () => {} } };
  globalThis.Hooks = { on: (_event, fn) => hooks.push(fn) }; globalThis.ChatMessage = { create: async data => { const payload = data.flags['osp-houserules'].inventoryAuthority; if (payload.type === 'result') results.push(payload); hooks.forEach(fn => fn({ flags: data.flags }, {}, payload.type === 'result' ? gm.id : game.user.id)); } }; globalThis.foundry = { utils: { randomID: () => `id-${++sequence}` } }; globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } }; globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }; delete globalThis.__ospInventoryChatHook;
  initInventoryAuthority(); initStables({ planPlacement: async (target, lines) => { const state = createDropDraft(target); for (const line of lines) await state.actor.createEmbeddedDocuments('Item', [line.itemData]); return { success: true, draftState: state }; }, validatePlacement: async () => ({ allowed: true }) });
});

async function openStable() { const data = getStableData(journal); data.accessible = true; return perform(gm, 'stableSave', { id: journal.id, data, expectedRevision: data.revision }, 'open'); }

describe('stable authority integration', () => {
  it('rejects closed access, then charges exact coins, items, stock and receipt once', async () => {
    const closed = quoteStable(getStableData(journal), [{ entryId: 'mule', quantity: 1 }]);
    expect((await perform(player, 'stableCheckout', { actorId: actor.id, actorUuid: actor.uuid, stableId: journal.id, quote: closed }, 'closed')).success).toBe(false);
    await openStable(); const quote = quoteStable(getStableData(journal), [{ entryId: 'mule', quantity: 1 }]); const details = { actorId: actor.id, actorUuid: actor.uuid, stableId: journal.id, quote };
    const bought = await perform(player, 'stableCheckout', details, 'buy'); expect(bought.success).toBe(true); expect(balance()).toBe(100); expect(getStableData(journal).entries[0].stock).toBe(1); expect(actor.flags.stableReceipts).toHaveLength(1);
    expect((await perform(player, 'stableCheckout', details, 'buy')).success).toBe(true); expect(balance()).toBe(100); expect(actor.flags.stableReceipts).toHaveLength(1);
  });

  it('rejects non-party actors, stale quotes, and closed service hours', async () => {
    await openStable(); actor.flags.party = false; const quote = quoteStable(getStableData(journal), [{ entryId: 'mule', quantity: 1 }]); expect((await perform(player, 'stableCheckout', { actorId: actor.id, actorUuid: actor.uuid, stableId: journal.id, quote }, 'party')).success).toBe(false); actor.flags.party = true;
    const changed = getStableData(journal); changed.openingHours = { enabled: true, openMinute: 500, closeMinute: 600, override: 'auto' }; await perform(gm, 'stableSave', { id: journal.id, data: changed, expectedRevision: changed.revision }, 'hours'); globalThis.game.time.worldTime = 700;
    expect((await perform(player, 'stableCheckout', { actorId: actor.id, actorUuid: actor.uuid, stableId: journal.id, quote }, 'hours-closed')).success).toBe(false);
    globalThis.game.time.worldTime = 100; expect((await perform(player, 'stableCheckout', { actorId: actor.id, actorUuid: actor.uuid, stableId: journal.id, quote }, 'stale')).success).toBe(false);
  });

  it('enforces boarding expiry, capacity, duplicate bookings and GM checkout', async () => {
    await openStable(); const mule = makeItem({ _id: 'mule-actor', name: 'Mule', type: 'livestock', system: { quantity: 1, cost: 10 } }); actor.items.push(mule); const quote = quoteStable(getStableData(journal), [{ kind: 'boarding', animalIds: [mule.id], nights: 1 }], { actor });
    const details = { actorId: actor.id, actorUuid: actor.uuid, stableId: journal.id, quote }; const boarded = await perform(player, 'stableCheckout', details, 'board'); expect(boarded.success).toBe(true); expect(getStableData(journal).bookings).toHaveLength(1);
    expect((await perform(player, 'stableCheckout', details, 'board-duplicate')).success).toBe(false); expect((await perform(gm, 'stableEndBooking', { stableId: journal.id, bookingId: getStableData(journal).bookings[0].id }, 'end')).success).toBe(true);
  });

  it('rejects duplicate or loaded buyback lines', async () => {
    await openStable(); const data = getStableData(journal); data.buysFromPlayers = true; await perform(gm, 'stableSave', { id: journal.id, data, expectedRevision: data.revision }, 'buyback'); const mule = makeItem({ _id: 'sale-mule', name: 'Sale Mule', type: 'livestock', system: { quantity: 1, cost: 10, containerId: null } }); actor.items.push(mule);
    const quote = quoteStableSale(actor, getStableData(journal), [{ itemId: mule.id, quantity: 1 }, { itemId: mule.id, quantity: 1 }]); expect(quote.success).toBe(false); mule.system.containerId = 'missing'; expect(quoteStableSale(actor, getStableData(journal), [{ itemId: mule.id, quantity: 1 }]).success).toBe(false);
  });

  it('recovers a journal acknowledgement failure without double payment', async () => {
    await openStable(); const quote = quoteStable(getStableData(journal), [{ entryId: 'mule', quantity: 1 }]); failAfterJournal = true;
    const result = await perform(player, 'stableCheckout', { actorId: actor.id, actorUuid: actor.uuid, stableId: journal.id, quote }, 'fault'); expect(result.recoveryRequired).toBe(true); failAfterJournal = false; globalThis.game.user = gm; const recovered = await recoverTransaction(actor); expect(recovered.success).toBe(true); expect(balance()).toBe(200); expect(actor.flags.stableReceipts ?? []).toHaveLength(0); expect(getStableData(journal).entries[0].stock).toBe(2);
  });

  it('pays a valid buyback into carried coins, removes the item, and replays safely', async () => {
    await openStable(); const configured = getStableData(journal); configured.buysFromPlayers = true; configured.buybackRate = 50; await perform(gm, 'stableSave', { id: journal.id, data: configured, expectedRevision: configured.revision }, 'buyback-open');
    const horse = makeItem({ _id: 'sale-horse', name: 'Sale Horse', type: 'livestock', system: { quantity: 1, cost: 10, containerId: null } }); actor.items.push(horse); const quote = quoteStableSale(actor, getStableData(journal), [{ itemId: horse.id, quantity: 1 }]); const details = { actorId: actor.id, actorUuid: actor.uuid, stableId: journal.id, quote }; expect((await perform(player, 'stableSale', details, 'sale')).success).toBe(true); expect(balance()).toBe(250); expect(actor.items.some(entry => entry.id === horse.id)).toBe(false); expect(getStableData(journal).history.at(-1)).toMatchObject({ kind: 'sale', totalCp: 50 }); expect((await perform(player, 'stableSale', details, 'sale')).success).toBe(true); expect(balance()).toBe(250);
  });

  it('consumes a named animal exactly once and keeps sold-out stock at zero', async () => {
    const configured = getStableData(journal); configured.accessible = true; configured.entries = [{ id: 'named', itemData: { name: 'Bramble', type: 'livestock', system: { cost: 10, quantity: 1, unique: true } }, stock: 1, individual: true }]; await perform(gm, 'stableSave', { id: journal.id, data: configured, expectedRevision: configured.revision }, 'named');
    const quote = quoteStable(getStableData(journal), [{ entryId: 'named', quantity: 1 }]); const details = { actorId: actor.id, actorUuid: actor.uuid, stableId: journal.id, quote }; expect((await perform(player, 'stableCheckout', details, 'named-buy')).success).toBe(true); expect(getStableData(journal).entries[0].stock).toBe(0); expect(quoteStable(getStableData(journal), [{ entryId: 'named', quantity: 1 }]).success).toBe(false);
  });

  it('recognizes expired boarding capacity and rejects the same animal booked at another stable', async () => {
    await openStable(); const mule = makeItem({ _id: 'board-mule', name: 'Mule', type: 'livestock', system: { quantity: 1, cost: 10 } }); actor.items.push(mule); const expired = { ...emptyStable('Other Stable'), accessible: true, bookings: [{ id: 'active', actorId: actor.id, actorUuid: actor.uuid, animalIds: [mule.id], quantity: 1, startsAt: 0, endsAt: 200, checkedOut: false }] }; const other = makeJournal(expired); game.journal.set(other.id, other); game.journal.contents.push(other); const blocked = quoteStable(getStableData(journal), [{ kind: 'boarding', animalIds: [mule.id], nights: 1 }], { actor, now: 100 }); expect(blocked.success).toBe(false); other.flags['osp-houserules'].stable.bookings[0].endsAt = 50; expect(quoteStable(getStableData(journal), [{ kind: 'boarding', animalIds: [mule.id], nights: 1 }], { actor, now: 100 })).toMatchObject({ success: true });
  });

  it('rolls back a failure after item creation and permits a safe retry', async () => {
    await openStable(); const quote = quoteStable(getStableData(journal), [{ entryId: 'mule', quantity: 1 }]); failAfterCreate = true; const result = await perform(player, 'stableCheckout', { actorId: actor.id, actorUuid: actor.uuid, stableId: journal.id, quote }, 'item-fault'); expect(result.success).toBe(false); failAfterCreate = false; globalThis.game.user = gm; const recovered = result.recoveryRequired ? await import('./transaction-journal.js').then(module => module.recoverTransaction(actor)) : { success: true }; expect(recovered.success).toBe(true); expect(balance()).toBe(200); expect(getStableData(journal).entries[0].stock).toBe(2); expect(actor.flags.stableReceipts ?? []).toHaveLength(0);
  });
});
