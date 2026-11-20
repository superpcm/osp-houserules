import { describe, expect, it } from 'vitest';
import { replenishStableStock, shouldRestockStable } from './stable-replenishment.js';

const stable = { id: 'stable-1', entries: [{ id: 'generated', managed: true, stock: 1, itemData: { name: 'Mule', type: 'livestock', system: { cost: 10, tags: ['livestock'] } } }, { id: 'manual', managed: false, stock: 7, customPrice: 4, itemData: { system: { cost: 2 } } }, { id: 'named', managed: true, individual: true, stock: 2, itemData: { system: { cost: 20 } } }], stocking: { profileId: 'livery', size: 'small', minQuantity: 3, maxQuantity: 3, minProducts: 1, maxProducts: 4, minPricePercent: 80, maxPricePercent: 120, enabled: true, intervalDays: 7, lastRestockedWorldTime: 0 } };

describe('stable replenishment', () => {
  it('keeps randomized prices finite, honors bounds, and preserves GM prices and Never Stock', () => {
    const input = structuredClone(stable); input.entries[0].generatedPrice = true; input.entries[0].customPrice = 10;
    const result = replenishStableStock(input, { randomizePrices: true, minPricePercent: 125, maxPricePercent: 125 });
    expect(result.entries[0].customPrice).toBe(12.5);
    const rounded = structuredClone(input); rounded.entries[0].itemData.system.cost = 1;
    expect(replenishStableStock(rounded, { randomizePrices: true, minPricePercent: 117, maxPricePercent: 117 }).entries[0].customPrice).toBe(1.2);
    input.entries[0].generatedPrice = false; input.entries[0].customPrice = 77;
    expect(replenishStableStock(input, { randomizePrices: true }).entries[0].customPrice).toBe(77);
    input.entries[0].sourceUuid = 'Item.mule';
    expect(replenishStableStock(input, { neverStock: ['Item.mule'] }).entries[0].stock).toBe(0);
  });
  it('refills generated entries while preserving manual and named stock', () => {
    const result = replenishStableStock(stable, { seed: 'restock' });
    expect(result.success).toBe(true); expect(result.entries.find(entry => entry.id === 'generated').stock).toBe(3); expect(result.entries.find(entry => entry.id === 'manual').stock).toBe(7); expect(result.entries.find(entry => entry.id === 'named').stock).toBe(2);
  });
  it('recognizes due intervals in in-game seconds', () => { expect(shouldRestockStable(stable, 7 * 86400)).toBe(true); expect(shouldRestockStable(stable, 6 * 86400)).toBe(false); });
});
