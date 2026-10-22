import { describe, expect, it } from 'vitest';
import { calculatePersonalEncumbrance, isCarriedByMountOrVehicle, normalizeQuantity, unitWeightPounds } from './encumbrance.js';

const item = (id, weight, quantity = 1, extra = {}) => ({ id, type: extra.type, system: { unitWeight: weight, quantity, ...extra } });

describe('BR-13 encumbrance', () => {
  it('normalizes numeric, string, object, zero, and invalid quantities', () => {
    expect(normalizeQuantity(0)).toBe(0);
    expect(normalizeQuantity('2')).toBe(2);
    expect(normalizeQuantity({ value: 0 })).toBe(0);
    expect(normalizeQuantity(-1)).toBe(0);
    expect(normalizeQuantity('wat')).toBe(0);
    expect(normalizeQuantity(undefined)).toBe(1);
  });
  it('converts legacy coin-weight units only when pound unitWeight is absent', () => {
    expect(unitWeightPounds({ system: { weight: 400 } })).toBe(40);
    expect(unitWeightPounds({ system: { unitWeight: 0, weight: 400 } })).toBe(0);
  });
  it('uses exact thirds and race movement rates', () => {
    const base = { strength: 15, items: [item('a', 1, 5)] };
    expect(calculatePersonalEncumbrance(base).level).toBe('unencumbered');
    expect(calculatePersonalEncumbrance({ ...base, items: [item('a', 1, 75.01)] }).level).toBe('light');
    expect(calculatePersonalEncumbrance({ strength: 15, race: 'Dwarf', items: [item('a', 1, 100)] })).toMatchObject({ tactical: 20, dash: 40, explore: 60 });
    expect(calculatePersonalEncumbrance({ strength: 15, race: 'Human', items: [item('a', 1, 100)] }).tactical).toBe(30);
  });
  it('excludes mounts and nested mount cargo, while cycles and missing parents remain personal', () => {
    const mount = item('mount', 100, 1, { type: 'livestock' });
    const saddle = item('saddle', 4, 1, { containerId: 'mount' });
    const cargo = item('cargo', 9, 1, { containerId: 'saddle' });
    const cycleA = item('a', 2, 1, { containerId: 'b' });
    const cycleB = item('b', 3, 1, { containerId: 'a' });
    const missing = item('missing', 7, 1, { containerId: 'gone' });
    const all = [mount, saddle, cargo, cycleA, cycleB, missing];
    const byId = id => all.find(value => value.id === id);
    expect(isCarriedByMountOrVehicle(cargo, byId)).toBe(true);
    expect(calculatePersonalEncumbrance({ strength: 15, items: all, getParent: byId }).totalWeight).toBe(12);
  });
});

it.each([['Human', 40], ['Elf', 40], ['Half-Elf', 40], ['Half-Orc', 40], ['Hobbit', 30], ['Halfling', 30], ['Gnome', 30], ['Dwarf', 30], ['Unknown', 40]])('%s uses the approved base encounter/run/exploration rates', (race, speed) => {
  expect(calculatePersonalEncumbrance({ strength: 12, race, items: [] })).toMatchObject({ tactical: speed, dash: speed * 2, explore: speed * 3 });
});
it.each([[60, 'unencumbered', 40], [60.001, 'light', 30], [120, 'light', 30], [120.001, 'heavy', 20], [180, 'heavy', 20], [180.001, 'overloaded', 0]])('load %s stays on the approved boundary side', (load, level, speed) => {
  expect(calculatePersonalEncumbrance({ strength: 12, items: [item('load', load)] })).toMatchObject({ totalWeight: load, level, tactical: speed, dash: speed * 2, explore: speed * 3 });
});
it('zero stacks do not contribute weight and negative weights cannot cancel a load', () => {
  expect(calculatePersonalEncumbrance({ items: [item('zero', 10, 0), item('object-zero', 10, { value: 0 }), item('negative', -500), item('load', 10)] }).totalWeight).toBe(10);
});
it('floating-point additions at an exact threshold do not change the burden level', () => {
  const items = Array.from({ length: 600 }, (_, index) => item(`coin-${index}`, 0.1));
  expect(calculatePersonalEncumbrance({ strength: 12, items }).level).toBe('unencumbered');
});
it('changing STR changes thresholds while unloaded zero STR remains defined', () => {
  expect(calculatePersonalEncumbrance({ strength: 6, items: [item('load', 60)] }).level).toBe('light');
  expect(calculatePersonalEncumbrance({ strength: 12, items: [item('load', 60)] }).level).toBe('unencumbered');
  expect(calculatePersonalEncumbrance({ strength: 0, items: [item('load', 1)] })).toMatchObject({ maxWeight: 0, level: 'overloaded', tactical: 0 });
});
