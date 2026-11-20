import { describe, expect, it } from 'vitest';
import { applyRestockPlan, __test } from './store-restocking.js';

const entry = (id, stock, price = null) => ({ id, sourceUuid: `Item.${id}`, itemData: { name: id, type: 'item', system: { cost: 10 } }, stock, customPrice: price, hidden: false });
const generated = (id, stock, price = 2) => ({ id: `generated-${id}`, sourceUuid: `Item.${id}`, itemData: { name: id, type: 'item', system: { cost: 10 } }, stock, customPrice: price, hidden: false });

describe('store restocking', () => {
  it('restocks managed sources, preserves manual entries, and preserves custom prices', () => {
    const result = applyRestockPlan([entry('managed', 0, 9), entry('manual', 4, 7)], [generated('managed', 6, 2), generated('new', 3, 1)], { managedSources: ['Item.managed'], repriceOnRestock: false }, 'seed:1');
    expect(result.success).toBe(true); expect(result.entries).toHaveLength(3); expect(result.entries.find(item => item.sourceUuid === 'Item.managed')).toMatchObject({ stock: 6, customPrice: 9 }); expect(result.entries.find(item => item.sourceUuid === 'Item.manual').stock).toBe(4); expect(result.managedSources).toContain('Item.new');
  });
  it('depletes managed products no longer selected while retaining their history links', () => {
    const result = applyRestockPlan([entry('old', 4)], [], { managedSources: ['Item.old'] }, 'seed:1');
    expect(result.entries[0].stock).toBe(0); expect(result.managedSources).toContain('Item.old');
  });
  it('does not reroll a cycle that is not due and validates intervals', () => {
    expect(__test.due({ enabled: false, restockDays: 7 }, 1000000)).toBe(false); expect(__test.due({ enabled: true, restockDays: 7, lastRestockWorldTime: 0 }, 7 * 86400 - 1)).toBe(false); expect(__test.due({ enabled: true, restockDays: 7, lastRestockWorldTime: 0 }, 7 * 86400)).toBe(true);
    expect(__test.validRestockDays({ restockDays: 1 })).toBe(true); expect(__test.validRestockDays({ restockDays: 365 })).toBe(true); expect(__test.validRestockDays({ restockDays: 0 })).toBe(false); expect(__test.validRestockDays({ restockDays: 366 })).toBe(false); expect(__test.validRestockDays({ restockDays: 7.5 })).toBe(false);
  });
  it('enforces the product limit', () => {
    const current = Array.from({ length: 200 }, (_, index) => entry(`manual-${index}`, 1));
    expect(applyRestockPlan(current, [generated('new', 1)], { managedSources: [] }, 'seed').success).toBe(false);
  });
});


it('never adopts a manually stocked source merely because the profile also selected it', () => {
  const first = applyRestockPlan([entry('manual', 4, 7)], [generated('manual', 9, 2)], {});
  expect(first.managedSources).toEqual([]);
  const next = applyRestockPlan(first.entries, [generated('manual', 1, 1)], first);
  expect(next.entries[0]).toMatchObject({ stock: 4, customPrice: 7 });
});
