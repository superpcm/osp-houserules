import { describe, expect, it } from 'vitest';
import { auditClothingWear, clothingWearRejection, isBodyWearAccessory, isWornBodyAccessory, isWornClothing, resolveClothingWearCategory } from './clothing-wear.js';

const item = (id, name, system = {}, type = 'clothing') => ({ id, name, type, system: { quantity: 1, equipped: false, containerId: null, lashed: false, ...system } });

describe('clothing wear categories', () => {
  it('uses explicit canonical and legacy slots before name fallbacks', () => {
    expect(resolveClothingWearCategory(item('a', 'Renamed Tunic', { slot: 'base' }))).toBe('clothes');
    expect(resolveClothingWearCategory(item('b', 'Renamed Shoes', { slot: 'feet' }))).toBe('boots');
    expect(resolveClothingWearCategory(item('c', 'Mystery', { slot: 'custom' }))).toBeNull();
    expect(resolveClothingWearCategory(item('d', 'Winter Coat'))).toBe('outerwear');
  });

  it('keeps belt separate and excludes stored or lashed items', () => {
    const belt = item('belt', 'Belt', { equipped: true, slot: 'belt' });
    const stored = item('stored', 'Boots', { equipped: true, containerId: 'bag' });
    const lashed = item('lashed', 'Cloak', { equipped: true, lashed: true });
    expect(isWornClothing(belt)).toBe(true);
    expect(isWornClothing(stored)).toBe(false);
    expect(isWornClothing(lashed)).toBe(false);
    expect(auditClothingWear([belt, stored, lashed]).occupied).toBe(0);
  });

  it('rejects quantity and duplicate category wear without removing existing items', () => {
    const worn = item('old', 'Clothes, Commoner', { equipped: true });
    const incoming = item('new', 'Robes', { equipped: true, quantity: 2 });
    expect(clothingWearRejection(incoming, [worn])).toMatch(/quantity 1/);
    incoming.system.quantity = 1;
    expect(clothingWearRejection(incoming, [worn])).toMatch(/already occupies/);
    expect(worn.system.equipped).toBe(true);
  });

  it('audits duplicate positions and unknown worn clothing', () => {
    const a = item('a', 'Gloves', { equipped: true });
    const b = item('b', 'Gauntlets', { equipped: true });
    const unknown = item('u', 'Fancy Garment', { equipped: true });
    const audit = auditClothingWear([a, b, unknown]);
    expect(audit.occupied).toBe(1);
    expect(audit.hasConflicts).toBe(true);
    expect(audit.positions.find(position => position.id === 'gloves').items).toHaveLength(2);
    expect(audit.warningsById.u).toMatch(/recognized/);
  });

  it('classifies Holy Symbols as worn body accessories outside the six positions', () => {
    const symbol = item('symbol', 'Holy Symbol', { equipped: true, tags: ['religious', 'focus'] }, 'item');
    expect(isBodyWearAccessory(symbol)).toBe(true);
    expect(isWornBodyAccessory(symbol)).toBe(true);
    expect(auditClothingWear([symbol]).occupied).toBe(0);
    expect(isWornBodyAccessory({ ...symbol, system: { ...symbol.system, containerId: 'clothes' } })).toBe(false);
  });
});
