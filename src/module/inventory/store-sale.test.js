import { describe, expect, it } from 'vitest';
import { normalizeStore, entryFromItem } from './store.js';
import { quoteStoreSale, saveStoreSaleIntent, loadStoreSaleIntent, receiptForSaleIntent, __test } from './store-sale.js';

const item = (overrides = {}) => { const data = { id: 'sword-1', uuid: 'Item.sword', name: 'Sword', type: 'weapon', system: { cost: 100, quantity: 2, tags: [], equipped: false, lashed: false, ...overrides } }; return { ...data, toObject() { return structuredClone(data); } }; };
const arrows = (quantity = 1) => ({ id: 'arrows-1', uuid: 'Item.arrows', name: 'Arrows', type: 'ammunition', system: { quantity, tags: ['arrows'], cost: 1, equipped: false, lashed: false } });
const torches = (quantity = 1) => ({ id: 'torch-1', uuid: 'Item.torch', name: 'Torch', type: 'item', system: { quantity, tags: ['light-source'], cost: .2, equipped: false, lashed: false } });
const bolts = (quantity = 1) => ({ id: 'bolts-1', uuid: 'Item.bolts', name: 'Crossbow Bolt, Heavy', type: 'ammunition', system: { quantity, tags: ['bolts'], cost: .5, equipped: false, lashed: false } });

describe('store sales', () => {
  it('persists intents under encoded actor UUID keys and matches sale receipts', async () => {
    const user = { id: 'player', flags: {}, getFlag: (_s, key) => user.flags[key] ?? null, setFlag: async (_s, key, value) => { user.flags[key] = value; } };
    globalThis.game = { user };
    const actor = { uuid: 'Actor.Fung.Telt', id: 'actor' }; const intent = { operationId: 'sale-1', quote: { totalCp: 10 } };
    await saveStoreSaleIntent(actor, 'Journal.Store.1', intent);
    expect(loadStoreSaleIntent(actor, 'Journal.Store.1')).toMatchObject(intent);
    const receipt = { kind: 'sale', id: 'sale-1', storeId: 'Journal.Store.1' }; actor.getFlag = (_s, key) => key === 'storeReceipts' ? [receipt] : null;
    expect(receiptForSaleIntent(actor, { ...intent, storeId: 'Journal.Store.1' })).toEqual(receipt);
  });
  it('normalizes buyback settings with safe defaults', () => {
    expect(normalizeStore({ name: 'Town', buysFromPlayers: true }).buybackRate).toBe(50);
    expect(normalizeStore({ name: 'Town', buybackRate: 200, buybackTypes: ['weapon', 'bogus'] })).toMatchObject({ buybackRate: 100, buybackTypes: ['weapon'] });
  });

  it('quotes only configured live physical items and rejects zero offers', () => {
    const actor = { type: 'character', items: { contents: [item()] } };
    const store = normalizeStore({ accessible: true, buysFromPlayers: true, buybackRate: 50 });
    expect(quoteStoreSale(actor, store, [{ itemId: 'sword-1', quantity: 1 }])).toMatchObject({ success: true, totalCp: 500 });
    expect(quoteStoreSale(actor, normalizeStore({ accessible: true, buysFromPlayers: true, buybackRate: 0 }), [{ itemId: 'sword-1', quantity: 1 }]).success).toBe(false);
    expect(quoteStoreSale(actor, store, [{ itemId: 'sword-1', quantity: 3 }]).success).toBe(false);
  });
  it('converts sold arrows into bundle stock with a remainder carry', () => {
    const base = normalizeStore({ restockPurchases: true, entries: [{ id: 'arrows', sourceUuid: 'Item.arrows', itemData: arrows(1), stock: 0 }] });
    const first = __test.nextStore(base, { lines: [{ itemData: arrows(), quantity: 12 }] });
    expect(first.entries[0]).toMatchObject({ stock: 0, arrowRemainder: 12 });
    const second = __test.nextStore(first, { lines: [{ itemData: arrows(), quantity: 8 }] });
    expect(second.entries[0]).toMatchObject({ stock: 1, arrowRemainder: 0 });
  });
  it('merges sold bolts into an existing bundle row and carries twenty-round remainders', () => {
    const base = normalizeStore({ restockPurchases: true, entries: [{ id: 'bolts', sourceUuid: 'Item.bolts', itemData: bolts(), bundleQuantity: 20, stock: 2, boltRemainder: 7 }] });
    const next = __test.nextStore(base, { lines: [{ itemData: bolts(), quantity: 13 }] });
    expect(next.entries).toHaveLength(1);
    expect(next.entries[0]).toMatchObject({ stock: 3, boltRemainder: 0 });
  });
  it('merges sold torches into an existing bundle row without creating a duplicate', () => {
    const base = normalizeStore({ restockPurchases: true, entries: [{ id: 'torch', sourceUuid: 'Item.torch', itemData: torches(), bundleQuantity: 6, stock: 1, torchRemainder: 4 }] });
    const next = __test.nextStore(base, { lines: [{ itemData: torches(), quantity: 2 }] });
    expect(next.entries).toHaveLength(1);
    expect(next.entries[0]).toMatchObject({ stock: 2, torchRemainder: 0 });
  });
});

it('uses per-equipment buying preferences while preserving the normal offer fallback', () => {
  const actor = { type: 'character', items: { contents: [item()] } };
  const store = normalizeStore({ accessible: true, buysFromPlayers: true, buybackRate: 50, stocking: { buybackRates: { weapon: 75 } } });
  expect(quoteStoreSale(actor, store, [{ itemId: 'sword-1', quantity: 1 }])).toMatchObject({ success: true, totalCp: 750 });
  store.stocking.buybackRates.weapon = 0;
  expect(quoteStoreSale(actor, store, [{ itemId: 'sword-1', quantity: 1 }]).success).toBe(false);
  delete store.stocking.buybackRates.weapon;
  expect(quoteStoreSale(actor, store, [{ itemId: 'sword-1', quantity: 1 }]).totalCp).toBe(500);
});
