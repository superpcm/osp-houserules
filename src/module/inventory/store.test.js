import { describe, expect, it } from 'vitest';
import { entryFromItem, formatSp, normalizeStore, quoteStore, unitPriceCp } from './store.js';

const item = (overrides = {}) => ({ id: 'sword', uuid: 'Item.sword', name: 'Sword', type: 'weapon', img: 'sword.webp', system: { cost: 100, quantity: 1, tags: [], ...overrides } });
const arrows = (overrides = {}) => ({ id: 'arrows', uuid: 'Item.arrows', name: 'Arrows', type: 'ammunition', img: 'arrows.webp', system: { cost: 1, quantity: 1, tags: ['arrows'], ...overrides } });
const torches = (overrides = {}) => ({ id: 'torch', uuid: 'Item.torch', name: 'Torch', type: 'item', img: 'torch.webp', system: { cost: .2, quantity: 6, storedSize: .75, unitWeight: .5, tags: ['light-source'], ...overrides } });
const bolts = (overrides = {}) => ({ id: 'bolts', uuid: 'Item.bolts', name: 'Crossbow Bolt, Heavy', type: 'ammunition', img: 'bolt.webp', system: { cost: .5, quantity: 1, storedSize: .25, unitWeight: .15, tags: ['bolts'], ...overrides } });

describe('store catalog', () => {
  it.each([[74, '7 sp 4 cp'], [369, '36 sp 9 cp'], [18, '1 sp 8 cp'], [290, '29 sp'], [5, '5 cp'], [0, '0 sp'], [1000, '100 sp']])('formats %s copper as %s', (cp, expected) => {
    expect(formatSp(cp)).toBe(expected);
  });

  it('normalizes snapshots and preserves custom item fields while clearing placement state', () => {
    const entry = entryFromItem({ ...item(), flags: { custom: { mark: true } }, ownership: { player: 3 } });
    expect(entry.itemData).toMatchObject({ flags: { custom: { mark: true } }, system: { quantity: 1, containerId: null, equipped: false, lashed: false } });
    expect(entry.itemData.ownership).toBeUndefined();
  });

  it('quotes standard and custom prices with finite stock and hidden products', () => {
    const store = normalizeStore({ adjustment: 10, entries: [{ id: 'sword', itemData: item(), stock: 2 }, { id: 'hidden', itemData: item({ cost: 10 }), hidden: true }, { id: 'free', itemData: item({ cost: 0 }), customPrice: 0 }] });
    expect(unitPriceCp(store, store.entries[0])).toBe(1100);
    expect(quoteStore(store, [{ entryId: 'sword', quantity: 2 }])).toMatchObject({ success: true, totalCp: 2200 });
    expect(quoteStore(store, [{ entryId: 'sword', quantity: 3 }]).success).toBe(false);
    expect(quoteStore(store, [{ entryId: 'hidden', quantity: 1 }]).success).toBe(false);
    expect(unitPriceCp(store, store.entries[2])).toBe(0);
    const decimal = normalizeStore({ entries: [{ id: 'decimal', itemData: item(), customPrice: 1.5 }] });
    expect(unitPriceCp(decimal, decimal.entries[0])).toBe(15);
  });

  it('sells arrows as twenty-count bundles and upgrades legacy prices once', () => {
    const store = normalizeStore({ entries: [{ id: 'arrows', itemData: arrows(), stock: 3 }, { id: 'legacy', itemData: arrows(), customPrice: 2 }] });
    expect(store.entries[0].bundleQuantity).toBe(20);
    expect(unitPriceCp(store, store.entries[0])).toBe(200);
    expect(unitPriceCp(store, store.entries[1])).toBe(400);
    expect(normalizeStore(store).entries[1].customPrice).toBe(40);
    expect(quoteStore(store, [{ entryId: 'arrows', quantity: 2 }])).toMatchObject({ success: true, totalCp: 400, lines: [{ quantity: 2, bundleQuantity: 20, itemData: { system: { quantity: 20 } } }] });
  });

  it('sells torches as protected six-count bundles at six times the per-torch price', () => {
    const fresh = entryFromItem(torches()); fresh.id = 'torch'; fresh.stock = 4;
    const store = normalizeStore({ entries: [fresh, { id: 'legacy', itemData: torches(), customPrice: .3, stock: 12 }] });
    expect(store.entries[0]).toMatchObject({ bundleQuantity: 6, customPriceUnit: 'bundle', stock: 4, torchRemainder: 0 });
    expect(unitPriceCp(store, store.entries[0])).toBe(12);
    expect(store.entries[1].customPrice).toBeCloseTo(1.8);
    expect(unitPriceCp(store, store.entries[1])).toBe(18);
    const quote = quoteStore(store, [{ entryId: 'torch', quantity: 2 }]);
    expect(quote).toMatchObject({ success: true, totalCp: 24, lines: [{ quantity: 2, bundleQuantity: 6, itemData: { system: { quantity: 6 }, flags: { 'osp-houserules': { protectedTorchBundle: true } } } }] });
    expect(normalizeStore(store).entries[1].customPrice).toBeCloseTo(1.8);
  });

  it('sells light and heavy bolts as protected twenty-count bundles', () => {
    const light = entryFromItem(bolts({ name: 'Crossbow Bolt, Light', cost: .3, storedSize: .2, unitWeight: .1 })); light.id = 'light'; light.stock = 3;
    const heavy = entryFromItem(bolts()); heavy.id = 'heavy'; heavy.stock = 3;
    const store = normalizeStore({ entries: [light, heavy] });
    expect(unitPriceCp(store, store.entries[0])).toBe(60);
    expect(unitPriceCp(store, store.entries[1])).toBe(100);
    const quote = quoteStore(store, [{ entryId: 'heavy', quantity: 2 }]);
    expect(quote).toMatchObject({ success: true, totalCp: 200, lines: [{ quantity: 2, bundleQuantity: 20, itemData: { system: { quantity: 20 }, flags: { 'osp-houserules': { protectedBoltBundle: true } } } }] });
  });

  it('normalizes legacy bolt stock and per-bolt prices exactly once', () => {
    const raw = { entries: [{ id: 'legacy', itemData: bolts(), customPrice: .5, stock: 47 }] };
    const store = normalizeStore(raw);
    expect(store.entries[0]).toMatchObject({ customPrice: 10, stock: 2, boltRemainder: 7, bundleQuantity: 20 });
    expect(normalizeStore(store).entries[0]).toMatchObject({ customPrice: 10, stock: 2, boltRemainder: 7 });
  });
});


it('quotes repeated reads of the same legacy arrow entry without changing its price or source', () => {
  const raw = { name: 'Legacy shop', entries: [{ id: 'legacy', itemData: arrows({ cost: 0.2 }), customPrice: 0.3, stock: 3 }] };
  const before = structuredClone(raw);
  for (let read = 0; read < 3; read++) {
    const store = normalizeStore(raw);
    expect(store.entries[0].customPrice).toBe(6);
    expect(quoteStore(store, [{ entryId: 'legacy', quantity: 1 }]).totalCp).toBe(60);
    expect(quoteStore(normalizeStore(store), [{ entryId: 'legacy', quantity: 1 }]).totalCp).toBe(60);
  }
  expect(raw).toEqual(before);
});


it('keeps catalog products JSON-stable for persisted checkout journals', () => {
  const data = { name: 'Arrow', type: 'ammunition', system: { cost: 0.2, quantity: 1, storedSize: 0.25, tags: ['arrows'] } };
  const store = normalizeStore({ name: 'Catalog shop', entries: [{ id: 'arrows', itemData: data, stock: 3 }] });
  expect(JSON.parse(JSON.stringify(store))).toEqual(store);
  expect(store.entries[0].itemData.flags).toEqual({});
});
