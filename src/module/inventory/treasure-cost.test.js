import { describe, it, expect, vi } from 'vitest';
import { planCostCharge, chargeItemCost, CONTAINER_SEARCH_ORDER } from './treasure-cost.js';

function container(id, coins) {
  return { id, coins };
}

function deltaFor(deltas, containerId, coinName) {
  const d = deltas.find((x) => x.containerId === containerId && x.coinName === coinName);
  return d ? d.delta : 0;
}

describe('CONTAINER_SEARCH_ORDER', () => {
  it('matches the actual data/gear.json container names, not the spec draft names', () => {
    expect(CONTAINER_SEARCH_ORDER).toEqual(['Coin Purse', 'Belt Pouch (L)', 'Belt Pouch (S)', 'Backpack', 'Sidesack']);
  });
});

describe('planCostCharge', () => {
  it('covers cost with silver alone in the first container — no conversion, no change', () => {
    const result = planCostCharge(5, [container('purse', { 'Silver Coins': 10 })]);
    expect(result.success).toBe(true);
    expect(result.deltas).toEqual([{ containerId: 'purse', coinName: 'Silver Coins', delta: -5 }]);
  });

  it('falls through to copper when silver alone cannot cover the cost', () => {
    // cost 5.3 sp = 53 pennies; 5 silver covers 50, remaining 3 pennies from copper
    const result = planCostCharge(5.3, [container('purse', { 'Silver Coins': 5, 'Copper Coins': 10 })]);
    expect(result.success).toBe(true);
    expect(deltaFor(result.deltas, 'purse', 'Silver Coins')).toBe(-5);
    expect(deltaFor(result.deltas, 'purse', 'Copper Coins')).toBe(-3);
  });

  it('breaks a gold coin when silver+copper are insufficient, returning change as silver', () => {
    // cost 12 sp = 120 pennies; 1 silver (10) covers part, remaining 110 needs a gold coin (100)...
    // use a cleaner case: cost 8 sp, container has 0 silver/copper and 1 gold (100 pennies)
    const result = planCostCharge(8, [container('purse', { 'Gold Coins': 1 })]);
    expect(result.success).toBe(true);
    expect(deltaFor(result.deltas, 'purse', 'Gold Coins')).toBe(-1);
    // change = 100 - 80 = 20 pennies = 2 silver, evenly divisible
    expect(deltaFor(result.deltas, 'purse', 'Silver Coins')).toBe(2);
    expect(deltaFor(result.deltas, 'purse', 'Copper Coins')).toBe(0);
  });

  it('returns non-divisible gold change as copper so the container reconciles exactly', () => {
    // cost 8.5 sp = 85 pennies; 1 gold = 100 pennies; change = 15 pennies = 1 silver + 5 copper
    const result = planCostCharge(8.5, [container('purse', { 'Gold Coins': 1 })]);
    expect(result.success).toBe(true);
    expect(deltaFor(result.deltas, 'purse', 'Gold Coins')).toBe(-1);
    expect(deltaFor(result.deltas, 'purse', 'Silver Coins')).toBe(1);
    expect(deltaFor(result.deltas, 'purse', 'Copper Coins')).toBe(5);
  });

  it('drains the first container and spills the remainder into the next', () => {
    const result = planCostCharge(12, [
      container('purse', { 'Silver Coins': 5 }), // covers 5 of 12
      container('pouchL', { 'Silver Coins': 7 }), // covers remaining 7
    ]);
    expect(result.success).toBe(true);
    expect(deltaFor(result.deltas, 'purse', 'Silver Coins')).toBe(-5);
    expect(deltaFor(result.deltas, 'pouchL', 'Silver Coins')).toBe(-7);
  });

  it('fails and reports the shortfall when all containers combined are insufficient', () => {
    const result = planCostCharge(50, [
      container('purse', { 'Silver Coins': 2 }),
      container('pouchL', { 'Copper Coins': 3 }),
    ]);
    expect(result.success).toBe(false);
    expect(result.shortfallPennies).toBe(500 - 23);
    expect(result.deltas).toEqual([]);
  });

  it('treats a zero-length container list as an immediate insufficient-funds failure', () => {
    const result = planCostCharge(1, []);
    expect(result.success).toBe(false);
    expect(result.shortfallPennies).toBe(10);
  });

  it('succeeds with zero deltas when cost is exactly 0', () => {
    const result = planCostCharge(0, [container('purse', { 'Silver Coins': 1 })]);
    expect(result.success).toBe(true);
    expect(result.deltas).toEqual([]);
  });

  it('exactly drains combined funds across containers with nothing left over', () => {
    const result = planCostCharge(10, [
      container('purse', { 'Silver Coins': 4 }),
      container('pouchL', { 'Silver Coins': 6 }),
    ]);
    expect(result.success).toBe(true);
    expect(deltaFor(result.deltas, 'purse', 'Silver Coins')).toBe(-4);
    expect(deltaFor(result.deltas, 'pouchL', 'Silver Coins')).toBe(-6);
  });

  it('respects container priority even when a later container is wealthier', () => {
    const result = planCostCharge(3, [
      container('purse', { 'Silver Coins': 3 }),
      container('backpack', { 'Gold Coins': 100 }),
    ]);
    expect(result.success).toBe(true);
    expect(deltaFor(result.deltas, 'purse', 'Silver Coins')).toBe(-3);
    expect(result.deltas.every((d) => d.containerId === 'purse')).toBe(true);
  });
});

function fakeActor(items) {
  return {
    items,
    updateEmbeddedDocuments: vi.fn(),
    createEmbeddedDocuments: vi.fn(),
  };
}

describe('chargeItemCost', () => {
  it('exempts coin items — dropping coins is receiving treasure, not buying an item', async () => {
    const actor = fakeActor([]);
    const result = await chargeItemCost({ type: 'coin', name: 'Gold Coins', system: { cost: 10 } }, actor);
    expect(result.success).toBe(true);
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('exempts gem/jewelry treasure items flagged system.treasure', async () => {
    const actor = fakeActor([]);
    const result = await chargeItemCost({ type: 'item', name: 'Ruby', system: { cost: 500, treasure: true } }, actor);
    expect(result.success).toBe(true);
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('treats a null/zero cost as free and skips charging entirely', async () => {
    const actor = fakeActor([]);
    const result = await chargeItemCost({ type: 'item', name: 'Torch', system: { cost: 0 } }, actor);
    expect(result.success).toBe(true);
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('deducts silver from the actor\'s Coin Purse and updates the embedded coin item', async () => {
    const purse = { id: 'purseId', type: 'container', name: 'Coin Purse' };
    const silver = { id: 'silverId', type: 'coin', name: 'Silver Coins', system: { quantity: 10, containerId: 'purseId' } };
    const actor = fakeActor([purse, silver]);

    const result = await chargeItemCost({ name: 'Backpack', system: { cost: 5 } }, actor);

    expect(result.success).toBe(true);
    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      { _id: 'silverId', 'system.quantity': 5 },
    ]);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('creates a fresh coin stack for change when the container holds none of that denomination', async () => {
    const purse = { id: 'purseId', type: 'container', name: 'Coin Purse' };
    const gold = { id: 'goldId', type: 'coin', name: 'Gold Coins', system: { quantity: 1, containerId: 'purseId' } };
    const actor = fakeActor([purse, gold]);

    const result = await chargeItemCost({ name: 'Item costing 8sp', system: { cost: 8 } }, actor);

    expect(result.success).toBe(true);
    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      { _id: 'goldId', 'system.quantity': 0 },
    ]);
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ name: 'Silver Coins', system: expect.objectContaining({ quantity: 2, containerId: 'purseId' }) }),
    ]);
  });

  it('fails with the shortfall in sp when total treasure across containers is insufficient', async () => {
    const purse = { id: 'purseId', type: 'container', name: 'Coin Purse' };
    const silver = { id: 'silverId', type: 'coin', name: 'Silver Coins', system: { quantity: 2, containerId: 'purseId' } };
    const actor = fakeActor([purse, silver]);

    const result = await chargeItemCost({ name: 'Plate Armor', system: { cost: 200 } }, actor);

    expect(result.success).toBe(false);
    expect(result.shortfallSp).toBe(198);
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
