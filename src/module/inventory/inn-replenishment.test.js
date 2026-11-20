import { describe, expect, it } from 'vitest';
import { replenishInnOfferings } from './inn-replenishment.js';

const inn = {
  offerings: [
    { id: 'meal', sourceId: 'stew', kind: 'meal', priceCp: 20, quantity: 0, capacity: 1, managed: true },
    { id: 'drink', sourceId: 'ale', kind: 'drink', priceCp: 10, quantity: 99, capacity: 1, managed: true },
    { id: 'room-private', sourceId: 'room-private', kind: 'room', priceCp: 100, quantity: 4, capacity: 2, managed: true },
    { id: 'manual', sourceId: 'manual', kind: 'meal', priceCp: 30, quantity: 2, capacity: 1, managed: false },
  ],
  bookings: [{ id: 'booking', lines: [{ offeringId: 'room-private', quantity: 2 }] }],
};

describe('inn replenishment', () => {
  it('refills managed meals and drinks while preserving rooms, bookings, manual items, and prices', () => {
    const result = replenishInnOfferings(inn, { minStock: 4, maxStock: 8, seed: 'cycle' });
    expect(result.success).toBe(true);
    expect(result.offerings.find(entry => entry.id === 'meal').quantity).toBeGreaterThanOrEqual(4);
    expect(result.offerings.find(entry => entry.id === 'meal').quantity).toBeLessThanOrEqual(8);
    expect(result.offerings.find(entry => entry.id === 'drink').quantity).toBeGreaterThanOrEqual(4);
    expect(result.offerings.find(entry => entry.id === 'room-private')).toEqual(inn.offerings[2]);
    expect(result.offerings.find(entry => entry.id === 'manual')).toEqual(inn.offerings[3]);
  });

  it('is deterministic for a cycle and rejects invalid bounds', () => {
    const one = replenishInnOfferings(inn, { minStock: 2, maxStock: 5, seed: 11 });
    const two = replenishInnOfferings(inn, { minStock: 2, maxStock: 5, seed: 11 });
    expect(one).toEqual(two);
    expect(replenishInnOfferings(inn, { minStock: 8, maxStock: 2 }).success).toBe(false);
  });
  it('rerolls prices only when opted in and preserves identities and original price bases', () => {
    const original = structuredClone(inn); original.offerings[0].originalBasePriceCp = 20;
    const prices = new Set();
    for (let seed = 1; seed <= 20; seed += 1) {
      const plan = replenishInnOfferings(original, { seed, reprice: true, priceBounds: { meal: { minCp: 19, maxCp: 21 } } });
      const meal = plan.offerings[0]; prices.add(meal.priceCp);
      expect(meal.priceCp).toBeGreaterThanOrEqual(19); expect(meal.priceCp).toBeLessThanOrEqual(21); expect(meal.originalBasePriceCp).toBe(20); expect(meal.id).toBe('meal');
      expect(plan.offerings[2]).toEqual(original.offerings[2]); expect(plan.offerings[3]).toEqual(original.offerings[3]);
    }
    expect(prices.size).toBeGreaterThan(1); expect(original).toEqual({ ...inn, offerings: inn.offerings.map((entry, i) => i === 0 ? { ...entry, originalBasePriceCp: 20 } : entry) });
  });
});
