import { beforeEach, expect, it, vi } from 'vitest';
import { emptyInn } from './inn.js';
import { initInnReplenishment, restockDueInns } from './inn-replenishment.js';
import { registerInventoryAuthority, requestInventoryMutation } from './inventory-authority.js';
import { runTransaction } from './transaction-journal.js';
vi.mock('./inventory-authority.js', async original => ({ ...await original(), registerInventoryAuthority: vi.fn(), requestInventoryMutation: vi.fn(async () => ({ success: true })) }));
vi.mock('./transaction-journal.js', async original => ({ ...await original(), runTransaction: vi.fn(async () => ({ success: true })) }));
let data, handler;
beforeEach(() => {
  vi.clearAllMocks(); delete globalThis.__ospInnReplenishmentHook;
  data = { ...emptyInn('Lantern'), accessible: false, replenishment: { enabled: true, intervalDays: 2, lastReplenishedWorldTime: 10, minStock: 4, maxStock: 4 }, offerings: [{ id: 'meal', name: 'Stew', kind: 'meal', priceCp: 20, quantity: 0, capacity: 1, managed: true, enabled: true }] };
  const inn = { id: 'inn', name: data.name, flags: { 'osp-houserules': { inn: data } }, getFlag: (_scope, flag) => flag === 'inn' ? data : null };
  const shop = { id: 'shop', flags: { 'osp-houserules': { store: { version: 1, replenishment: data.replenishment } } } };
  globalThis.game = { user: { id: 'gm', isGM: true }, users: Object.assign(new Map([['gm', { isGM: true }], ['player', { isGM: false }]]), { activeGM: { id: 'gm' } }), time: { worldTime: 10 }, journal: new Map([['inn', inn], ['shop', shop]]) };
  globalThis.Hooks = { on: vi.fn() };
  initInnReplenishment(); handler = registerInventoryAuthority.mock.calls.find(call => call[0] === 'innReplenish')[1];
});
it('scans only due inns and never treats shops as inns', async () => {
  await restockDueInns(); expect(requestInventoryMutation).not.toHaveBeenCalled();
  game.time.worldTime += 10 * 86400;
  await restockDueInns(); expect(requestInventoryMutation).toHaveBeenCalledTimes(1);
  expect(requestInventoryMutation.mock.calls[0].slice(0, 2)).toEqual(['innReplenish', { innId: 'inn', force: false }]);
});
it('denies player replenishment and not-due automatic runs without writes', async () => {
  expect((await handler({ innId: 'inn', force: true }, { userId: 'player' })).success).toBe(false);
  expect((await handler({ innId: 'inn', force: false }, { userId: 'gm' })).outcome).toBe('not-due');
  expect(runTransaction).not.toHaveBeenCalled();
});
it('refills saved managed quantities atomically without changing access or original data', async () => {
  expect((await handler({ innId: 'inn', force: true }, { userId: 'gm' })).success).toBe(true);
  const change = runTransaction.mock.calls[0][1].changes[0];
  expect(change.after.flags.offerings[0].quantity).toBe(4);
  expect(change.after.flags.accessible).toBe(false);
  expect(change.after.flags.replenishment.lastReplenishedWorldTime).toBe(10);
  expect(data.offerings[0].quantity).toBe(0);
});
