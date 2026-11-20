import { beforeEach, describe, expect, it } from 'vitest';
import { emptyInn, getInnData, initInns, quoteInn } from './inn.js';
import { initInventoryAuthority, INVENTORY_SOCKET_NAMESPACE, recoverInventoryOperation, listInventoryOperations } from './inventory-authority.js';

let gm, player, hooks, results, actor, journal, sequence, settings, writes, failAt, failAfter;
async function write(fn) { const n = ++writes; if (n === failAt && !failAfter) throw new Error('Injected failure'); const value = fn(); if (n === failAt && failAfter) throw new Error('Injected acknowledgement failure'); return value; }
const copy = value => structuredClone(value);
function makeItem(data) { const value = copy({ ...data, _id: data._id ?? `item-${++sequence}` }); const item = { id: value._id, name: value.name, type: value.type, system: value.system, toObject: () => copy(value), update: async changes => write(() => { for (const [key, val] of Object.entries(changes)) value.system[key.split('.').at(-1)] = val; }), delete: async () => write(() => { actor.items = actor.items.filter(candidate => candidate.id !== value._id); }) }; return item; }
function makeJournal(data) { const flags = { 'osp-houserules': { inn: copy(data) } }; return { id: `journal-${++sequence}`, uuid: `JournalEntry.${sequence}`, name: data.name, flags, ownership: { default: 0 }, getFlag: (_s, key) => flags['osp-houserules']?.[key], update: async update => write(() => { if (update.name) journal.name = update.name; if (update.ownership) journal.ownership = copy(update.ownership); if (update['flags.osp-houserules.inn']) flags['osp-houserules'].inn = copy(update['flags.osp-houserules.inn']); }), setFlag: async (_s, key, value) => write(() => { flags['osp-houserules'][key] = copy(value); }) }; }
function send(user, action, details, operationId) { hooks[0]({ flags: { 'osp-houserules': { inventoryAuthority: { type: 'request', envelope: { namespace: INVENTORY_SOCKET_NAMESPACE, type: 'request', userId: user.id, action, details, operationId } } } } }, {}, user.id); }
async function perform(user, action, details, operationId) { send(user, action, details, operationId); for (let i = 0; i < 60; i++) { await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); const result = results.find(entry => entry.operationId === operationId)?.result; if (result) return result; } throw new Error('authority did not respond'); }

function setup() {
  settings = {}; writes = 0; failAt = null; failAfter = false;
  sequence = 0; hooks = []; results = []; gm = { id: 'gm', isGM: true }; player = { id: 'player', isGM: false };
  actor = { id: 'hero', uuid: 'Actor.hero', type: 'character', name: 'Hero', isOwner: true, ownership: { player: 3, default: 0 }, flags: { party: true }, items: [], getFlag: (_s, key) => actor.flags[key] ?? null, setFlag: async (_s, key, value) => write(() => { actor.flags[key] = copy(value); }), updateEmbeddedDocuments: async (_t, updates) => updates.forEach(update => actor.items.find(item => item.id === update._id)?.update(update)), createEmbeddedDocuments: async (_t, data) => write(() => { const created = data.map(makeItem); actor.items.push(...created); return created; }) };
  const purse = makeItem({ name: 'Purse', type: 'container', system: { quantity: 1, containerId: null } }); actor.items.push(purse); actor.items.push(makeItem({ name: 'Gold Coins', type: 'coin', system: { quantity: 2, containerId: purse.id } }));
  const data = { ...emptyInn('The Lantern'), accessible: false, revision: 0, offerings: [{ id: 'meal', name: 'Stew', kind: 'meal', priceCp: 4, quantity: 5, capacity: 1, enabled: true }, { id: 'room', name: 'Private room', kind: 'room', priceCp: 25, quantity: 1, capacity: 2, enabled: true }] };
  journal = makeJournal(data); globalThis.game = { user: gm, world: { id: 'inn-test' }, system: { id: 'osp-houserules' }, time: { worldTime: 100 }, users: Object.assign(new Map([[gm.id, gm], [player.id, player]]), { activeGM: gm }), actors: new Map([[actor.id, actor]]), journal: Object.assign(new Map([[journal.id, journal]]), { documentClass: {} }), settings: { get: (_s, key) => settings[key] ?? null, set: async (_s, key, value) => { settings[key] = copy(value); } } };
  globalThis.Hooks = { on: (_event, fn) => hooks.push(fn) }; globalThis.ChatMessage = { create: async data => { const payload = data.flags['osp-houserules'].inventoryAuthority; if (payload.type === 'result') results.push(payload); hooks.forEach(fn => fn({ flags: data.flags }, {}, payload.type === 'result' ? gm.id : game.user.id)); } }; globalThis.foundry = { utils: { randomID: () => `id-${++sequence}` } }; globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } }; globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }; delete globalThis.__ospInventoryChatHook; initInventoryAuthority(); initInns();
}
beforeEach(setup);

describe('inn authority integration', () => {
  it('rejects closed access, then charges a room and meal with stock and receipt updates', async () => {
    const closedQuote = quoteInn(getInnData(journal), [{ offeringId: 'meal', quantity: 1 }]);
    expect((await perform(player, 'innCheckout', { actorId: actor.id, actorUuid: actor.uuid, innId: journal.id, quote: closedQuote }, 'closed')).success).toBe(false);
    const open = getInnData(journal); open.accessible = true; const opened = await perform(gm, 'innSave', { id: journal.id, data: open, expectedRevision: 0 }, 'open'); expect(opened.success).toBe(true);
    const quote = quoteInn(getInnData(journal), [{ offeringId: 'meal', quantity: 1 }, { offeringId: 'room', quantity: 1, nights: 1, guestIds: [actor.id] }]);
    const bought = await perform(player, 'innCheckout', { actorId: actor.id, actorUuid: actor.uuid, innId: journal.id, quote }, 'buy'); expect(bought.success).toBe(true);
    expect(getInnData(journal).offerings.find(o => o.id === 'meal').quantity).toBe(4); expect(getInnData(journal).bookings).toHaveLength(1); expect(actor.getFlag('osp-houserules', 'innReceipts')).toHaveLength(1);
  });

  it('rejects non-party characters and a second checkout against the last room', async () => {
    const open = getInnData(journal); open.accessible = true; expect((await perform(gm, 'innSave', { id: journal.id, data: open, expectedRevision: 0 }, 'open')).success).toBe(true);
    const quote = quoteInn(getInnData(journal), [{ offeringId: 'room', quantity: 1, nights: 2, guestIds: [actor.id] }]); actor.flags.party = false;
    expect((await perform(player, 'innCheckout', { actorId: actor.id, actorUuid: actor.uuid, innId: journal.id, quote }, 'nonparty')).success).toBe(false);
    actor.flags.party = true; const first = await perform(player, 'innCheckout', { actorId: actor.id, actorUuid: actor.uuid, innId: journal.id, quote }, 'first'); expect(first.success).toBe(true);
    expect((await perform(player, 'innCheckout', { actorId: actor.id, actorUuid: actor.uuid, innId: journal.id, quote }, 'second')).success).toBe(false);
  });
});

const balance = () => actor.items.reduce((sum, item) => sum + (item.type === 'coin' ? ({ 'Gold Coins': 100, 'Silver Coins': 10, 'Copper Coins': 1 }[item.name] || 0) * item.system.quantity : 0), 0);
async function openInn() { const data = getInnData(journal); data.accessible = true; expect((await perform(gm, 'innSave', { id: journal.id, data, expectedRevision: data.revision }, `open-${data.revision}`)).success).toBe(true); }
function order(lines) { return { actorId: actor.id, actorUuid: actor.uuid, innId: journal.id, quote: quoteInn(getInnData(journal), lines) }; }

it('charges exactly once for a repeated operation and preserves the receipt', async () => {
  await openInn(); const details = order([{ offeringId: 'meal', quantity: 2 }]);
  expect((await perform(player, 'innCheckout', details, 'same')).success).toBe(true);
  expect(balance()).toBe(192); expect(getInnData(journal).offerings[0].quantity).toBe(3);
  results = []; expect((await perform(player, 'innCheckout', details, 'same')).success).toBe(true);
  expect(balance()).toBe(192); expect(actor.flags.innReceipts).toHaveLength(1);
});
it('preserves profile settings, prevents aggregate booking reductions, and expires stays independently', async () => {
  const current = getInnData(journal); current.accessible = true; current.offerings[1].quantity = 2;
  current.offerings.push({ id: 'bed', name: 'Bed', kind: 'bed', priceCp: 10, quantity: 2, capacity: 1, enabled: true });
  current.replenishment = { ...current.replenishment, enabled: true, minStock: 3, maxStock: 9, intervalDays: 2, supply: 'abundant', priceBounds: { meal: { minCp: 2, maxCp: 40 } } };
  expect((await perform(gm, 'innSave', { id: journal.id, data: current, expectedRevision: 0 }, 'configure')).success).toBe(true);
  expect(getInnData(journal).replenishment).toMatchObject({ intervalDays: 2, supply: 'abundant', minStock: 3, maxStock: 9 });
  const guest = { id: 'guest', type: 'character', name: 'Guest', getFlag: () => true }; game.actors.set(guest.id, guest);
  expect((await perform(player, 'innCheckout', order([{ offeringId: 'room', quantity: 1, nights: 1, guestIds: [actor.id] }, { offeringId: 'bed', quantity: 1, nights: 2, guestIds: ['guest'] }]), 'different-nights')).success).toBe(true);
  expect(getInnData(journal).bookings.map(b => b.endsAt)).toEqual([86500, 172900]);
  expect((await perform(player, 'innCheckout', order([{ offeringId: 'room', quantity: 1, nights: 1, guestIds: [actor.id] }]), 'second-room')).success).toBe(true);
  const next = getInnData(journal); next.offerings.find(o => o.id === 'room').quantity = 1;
  expect((await perform(gm, 'innSave', { id: journal.id, data: next, expectedRevision: next.revision }, 'reduce')).success).toBe(false);
  const stay = getInnData(journal).bookings[0];
  expect((await perform(gm, 'innEndBooking', { innId: journal.id, bookingId: stay.id }, 'early')).success).toBe(true);
  expect(getInnData(journal).bookings[0].checkedOut).toBe(true);
});
it('rejects forged totals, non-party guests and closed GM purchases without coin changes', async () => {
  const closed = order([{ offeringId: 'meal', quantity: 1 }]);
  expect((await perform(gm, 'innCheckout', closed, 'closed-gm')).success).toBe(false);
  await openInn(); const forged = order([{ offeringId: 'meal', quantity: 1 }]); forged.quote.totalCp = 0;
  expect((await perform(player, 'innCheckout', forged, 'forged')).success).toBe(false);
  const outsider = { id: 'outsider', name: 'Outsider', type: 'character', getFlag: () => false }; game.actors.set(outsider.id, outsider);
  expect((await perform(player, 'innCheckout', order([{ offeringId: 'room', quantity: 1, guestIds: ['outsider'] }]), 'outsider')).success).toBe(false);
  expect(balance()).toBe(200); expect(getInnData(journal).history).toEqual([]);
});

it('enforces service hours and charges the authoritative discounted special price', async () => {
  const configured = getInnData(journal); configured.accessible = true; configured.openingHours = { enabled: true, openMinute: 480, closeMinute: 600, override: 'auto' }; configured.todaySpecial = { offeringId: 'meal', discountPercent: 50 };
  expect((await perform(gm, 'innSave', { id: journal.id, data: configured, expectedRevision: 0 }, 'hours')).success).toBe(true);
  game.time.worldTime = 600;
  const closed = quoteInn(getInnData(journal), [{ offeringId: 'meal', quantity: 1 }]);
  expect(closed.totalCp).toBe(2);
  expect((await perform(player, 'innCheckout', { actorId: actor.id, actorUuid: actor.uuid, innId: journal.id, quote: closed }, 'closed-hours')).success).toBe(false);
  const override = getInnData(journal); override.openingHours.override = 'open'; expect((await perform(gm, 'innSave', { id: journal.id, data: override, expectedRevision: 1 }, 'override')).success).toBe(true);
  const bought = await perform(player, 'innCheckout', { actorId: actor.id, actorUuid: actor.uuid, innId: journal.id, quote: quoteInn(getInnData(journal), [{ offeringId: 'meal', quantity: 1 }]) }, 'discounted');
  expect(bought.success).toBe(true); expect(balance()).toBe(198);
});

for (const lost of [false, true]) it(`recovers checkout write failures without double charging (lost acknowledgement=${lost})`, async () => {
  for (let boundary = 1; boundary <= 9; boundary += 1) {
    setup(); await openInn(); const details = order([{ offeringId: 'meal', quantity: 1 }, { offeringId: 'room', quantity: 1, nights: 1, guestIds: [actor.id] }]);
    writes = 0; failAt = boundary; failAfter = lost;
    const result = await perform(player, 'innCheckout', details, `failure-${lost}-${boundary}`);
    failAt = null;
    if (result.recoveryRequired || listInventoryOperations().some(operation => operation.operationId === result.operationId)) await recoverInventoryOperation(result.operationId);
    const receipts = actor.flags.innReceipts || [];
    expect(receipts.length).toBeLessThanOrEqual(1);
    expect(balance()).toBe(receipts.length ? 171 : 200);
    expect(getInnData(journal).bookings).toHaveLength(receipts.length);
    expect(getInnData(journal).offerings[0].quantity).toBe(receipts.length ? 4 : 5);
  }
});


it('rechecks specialty claims at authority save after a preview becomes stale', async () => {
  const signature = { id: 'exclusive', kind: 'meal', name: 'The Wyvern’s Supper', description: 'Roast chicken with sage.', signature: true, specialtyKey: 'chicken-sage', sourceId: 'chicken-sage', managed: true, priceCp: 30, quantity: 6, capacity: 1 };
  const draft = getInnData(journal); draft.offerings.push(signature);
  const other = makeJournal({ ...emptyInn('Other Tavern'), offerings: [signature] }); game.journal.set(other.id, other);
  const result = await perform(gm, 'innSave', { id: journal.id, data: draft, expectedRevision: 0 }, 'stale-specialty');
  expect(result).toMatchObject({ success: false }); expect(result.reason).toMatch(/already served/);
  expect(getInnData(journal).offerings).toHaveLength(2);
  expect(getInnData(other).offerings[0]).toMatchObject({ specialtyKey: 'chicken-sage', signature: true });
});
