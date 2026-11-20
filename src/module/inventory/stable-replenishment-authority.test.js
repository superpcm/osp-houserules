import { beforeEach, expect, it, vi } from 'vitest';
import { emptyStable } from './stable.js';
import { initStableRestocking, restockDueStables } from './stable-replenishment.js';
import { registerInventoryAuthority, requestInventoryMutation } from './inventory-authority.js';
import { runTransaction, snapshotJournal } from './transaction-journal.js';

vi.mock('./inventory-authority.js', async original => ({ ...await original(), registerInventoryAuthority: vi.fn(), requestInventoryMutation: vi.fn(async () => ({ success: true })) }));
vi.mock('./transaction-journal.js', async original => ({ ...await original(), runTransaction: vi.fn(async (_actor, plan) => ({ success: true, plan })), snapshotJournal: vi.fn(document => document.flags) }));

let data; let document; let handler;
beforeEach(() => {
  vi.clearAllMocks(); delete globalThis.__ospStableReplenishmentHook;
  data = { ...emptyStable('Oak Yard'), accessible: false, stocking: { profileId: 'livery', size: 'small', enabled: true, intervalDays: 2, lastRestockedWorldTime: 10, minProducts: 1, maxProducts: 4, minQuantity: 3, maxQuantity: 3, minPricePercent: 80, maxPricePercent: 120 }, entries: [{ id: 'generated', managed: true, stock: 0, itemData: { name: 'Mule', type: 'livestock', system: { cost: 30, tags: ['livestock'] } } }, { id: 'manual', managed: false, stock: 7, customPrice: 4, itemData: { name: 'Saddle', type: 'tack', system: { cost: 20, tags: ['tack'] } } }], bookings: [{ id: 'stay', quantity: 1, checkedOut: false }] };
  data.entries.find(entry => entry.id === 'manual').itemData.type = 'item';
  document = { id: 'stable', name: data.name, flags: { 'osp-houserules': { stable: data } }, getFlag: (_scope, flag) => flag === 'stable' ? data : null };
  globalThis.game = { user: { id: 'gm', isGM: true }, users: Object.assign(new Map([['gm', { isGM: true }], ['player', { isGM: false }]]), { activeGM: { id: 'gm' } }), time: { worldTime: 10 }, journal: new Map([['stable', document]]) };
  globalThis.Hooks = { on: vi.fn() }; initStableRestocking(); handler = registerInventoryAuthority.mock.calls.find(call => call[0] === 'stableReplenish')[1];
});

it('denies player restocking and skips not-due automatic runs', async () => {
  expect((await handler({ stableId: 'stable', force: true }, { userId: 'player' })).success).toBe(false);
  expect((await handler({ stableId: 'stable', force: false }, { userId: 'gm' })).outcome).toBe('not-due');
  expect(runTransaction).not.toHaveBeenCalled();
});

it('restocks generated quantities while preserving access, bookings, manual entries, and prices', async () => {
  const result = await handler({ stableId: 'stable', force: true }, { userId: 'gm' }); expect(result.success).toBe(true); const change = runTransaction.mock.calls[0][1].changes[0];
  expect(change.after.flags.entries.find(entry => entry.id === 'generated').stock).toBe(3); expect(change.after.flags.entries.find(entry => entry.id === 'manual').stock).toBe(7); expect(change.after.flags.entries.find(entry => entry.id === 'manual').customPrice).toBe(4); expect(change.after.flags.accessible).toBe(false); expect(change.after.flags.bookings[0].id).toBe('stay'); expect(change.after.flags.bookings[0].quantity).toBe(1);
});

it('queues only due stables for the authority', async () => { game.time.worldTime = 3 * 86400; await restockDueStables(); expect(requestInventoryMutation).toHaveBeenCalledWith('stableReplenish', { stableId: 'stable', force: false }, null, expect.any(String)); });
