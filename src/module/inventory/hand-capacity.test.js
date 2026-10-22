import { describe, expect, it } from 'vitest';
import { canHold, handCost, handsUsed } from './hand-capacity.js';

const item = (id, name, type, system = {}) => ({ id, name, type, system: { equipped: true, tags: [], ...system } });

describe('shared hand capacity', () => {
  it('counts weapons, shields, sacks, and physical wand foci', () => {
    expect(handCost(item('sword', 'Bastard Sword', 'weapon', { tags: ['two-handed'] }))).toBe(2);
    expect(handCost(item('shield', 'Shield', 'armor', { type: 'shield' }))).toBe(1);
    expect(handCost(item('sack', 'Sack, Large', 'container'))).toBe(2);
    expect(handCost(item('wand', 'Wand', 'item', { tags: ['wand'] }))).toBe(1);
    expect(handCost(item('symbol', 'Holy Symbol', 'item', { tags: ['holy-symbol'] }))).toBe(0);
  });

  it('allows sword plus wand but rejects a third held item', () => {
    const held = [item('sword', 'Sword', 'weapon'), item('wand', 'Wand', 'item', { tags: ['wand'] })];
    expect(handsUsed(held)).toBe(2);
    expect(canHold(held, item('oil', 'Oil Flask', 'weapon', { tags: ['consumable'] }))).toBe(false);
  });

  it('ignores worn clothing and nested non-held items', () => {
    expect(handsUsed([
      item('cloak', 'Cloak', 'clothing'),
      item('oil', 'Oil Flask', 'weapon', { equipped: false, containerId: 'cloak' }),
    ])).toBe(0);
  });
});
