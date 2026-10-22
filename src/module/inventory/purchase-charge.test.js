import { beforeEach, expect, it, vi } from 'vitest';
import { chargeItemCost } from './treasure-cost.js';
import { getPendingTransaction, recoverTransaction } from './transaction-journal.js';
let actor, fail, writes;
beforeEach(() => {
  writes = 0; fail = null;
  const items = new Map(); const flags = new Map();
  const write = async action => { const boundary = ++writes; if (fail === boundary) throw new Error('Injected payment write failure'); action(); };
  const item = data => ({ id: data._id, name: data.name, type: data.type, get system() { return data.system; }, toObject: () => structuredClone(data), update: async update => write(() => { if ('system.quantity' in update) data.system.quantity = update['system.quantity']; }), delete: async () => write(() => items.delete(data._id)) });
  actor = { id: 'buyer', uuid: 'Actor.buyer', isOwner: true, items, getFlag: (_scope, key) => flags.get(key) ?? null, setFlag: async (_scope, key, value) => { flags.set(key, structuredClone(value)); }, createEmbeddedDocuments: async (_type, entries) => write(() => entries.forEach(data => items.set(data._id, item(structuredClone(data))))) };
  for (const data of [{ _id: 'purse', name: 'Coin Purse', type: 'container', system: { quantity: 1 } }, { _id: 'gold', name: 'Gold Coins', type: 'coin', system: { quantity: 1, containerId: 'purse' } }]) items.set(data._id, item(data));
  globalThis.game = { user: { isGM: true }, actors: new Map([[actor.id, actor]]), settings: { get: vi.fn() } };
});
const value = () => [...actor.items.values()].filter(i => i.type === 'coin').reduce((sum, i) => sum + i.system.quantity * ({ 'Gold Coins': 100, 'Silver Coins': 10, 'Copper Coins': 1 }[i.name]), 0);
it('charges the selected quantity once and returns exact change', async () => {
  expect((await chargeItemCost({ name: 'Arrow', system: { cost: 0.5 } }, actor, 3)).success).toBe(true);
  expect(value()).toBe(85); expect(getPendingTransaction(actor)).toBeNull();
});
for (const boundary of [1, 2, 3]) it(`restores payment when write ${boundary} fails`, async () => {
  fail = boundary;
  expect((await chargeItemCost({ name: 'Arrow', system: { cost: 0.5 } }, actor, 3)).success).toBe(false);
  expect(value()).toBe(100); expect(getPendingTransaction(actor)).toBeNull();
  expect((await recoverTransaction(actor)).outcome).toBe('none');
});
it('rejects invalid quantities before payment', async () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) expect((await chargeItemCost({ name: 'Arrow', system: { cost: 1 } }, actor, quantity)).success).toBe(false);
  expect(value()).toBe(100); expect(writes).toBe(0);
});
