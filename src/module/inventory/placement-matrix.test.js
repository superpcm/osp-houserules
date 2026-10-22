import { describe, expect, it } from 'vitest';
import {
  checkWithdrawTarget,
  getUsedCapacity,
  isItemAllowedInContainer,
} from './container-capacity.js';

const item = (name, type, system = {}) => ({
  id: `${name}-${type}`,
  name,
  type,
  system: { quantity: 1, storedSize: 1, tags: [], ...system },
});

const container = (name, system = {}) => ({
  id: `${name}-container`,
  name,
  type: 'container',
  system: { capacity: 20, ...system },
});

describe('BR20 shared placement admission', () => {
  it('checks all ten template item types through the same storage gate', () => {
    const target = container('General Chest', { allowedTypes: [
      'item', 'weapon', 'armor', 'ammunition', 'coin', 'container',
      'clothing', 'livestock', 'spell', 'ability',
    ] });
    const templates = [
      item('Rope', 'item'), item('Dagger', 'weapon'), item('Leather', 'armor'),
      item('Arrows', 'ammunition'), item('Gold', 'coin'), item('Pouch', 'container'),
      item('Cloak', 'clothing'), item('Mule', 'livestock'),
    ];

    for (const candidate of templates) {
      expect(isItemAllowedInContainer(candidate, target, [])).toMatchObject({ allowed: true });
      expect(checkWithdrawTarget(candidate, target, [])).toMatchObject({ allowed: true });
    }
    for (const candidate of [item('Magic Missile', 'spell'), item('Cleave', 'ability')]) {
      expect(checkWithdrawTarget(candidate, target, [])).toMatchObject({ allowed: false, reasonType: 'type' });
    }
  });

  it('keeps abilities and spells out of physical containers', () => {
    const physical = container('Backpack', { allowedTypes: ['item', 'weapon', 'armor', 'spell', 'ability'] });
    for (const candidate of [item('Magic Missile', 'spell'), item('Cleave', 'ability')]) {
      const result = checkWithdrawTarget(candidate, physical, []);
      expect(result.allowed).toBe(false);
      expect(result.reasonType).toBe('type');
    }
  });

  it('enforces ordinary catalog exceptions and explicit metadata', () => {
    const backpack = container('Backpack');
    const beltPouch = container('Belt Pouch (S)');
    const quiver = container('Quiver', { allowedTypes: ['arrows'], allowedNames: ['Arrows'] });
    expect(isItemAllowedInContainer(item('Rope', 'item'), backpack, [])).toMatchObject({ allowed: true });
    expect(isItemAllowedInContainer(item('Long Sword', 'weapon', { tags: ['sword'] }), backpack, [])).toMatchObject({ allowed: false });
    expect(isItemAllowedInContainer(item('Arrows', 'ammunition', { tags: ['arrows'] }), beltPouch, [])).toMatchObject({ allowed: false });
    expect(isItemAllowedInContainer(item('Arrows +1', 'ammunition', { tags: ['arrows'] }), quiver, [])).toMatchObject({ allowed: true });
    expect(isItemAllowedInContainer(item('Bolts', 'ammunition', { tags: ['bolts'] }), quiver, [])).toMatchObject({ allowed: false });
    expect(isItemAllowedInContainer(item('Gem', 'item', { allowedContainers: ['Locked Chest'] }), backpack, [])).toMatchObject({ allowed: false });
  });

  it('scales capacity by quantity while counting only immediate child bulk', () => {
    const target = container('Chest', { capacity: 6 });
    const nested = item('Nested Chest', 'container', { storedSize: 4, quantity: 1, containerId: 'child' });
    const child = item('Coins', 'coin', { storedSize: 99, quantity: 50, containerId: nested.id });
    const existing = item('Rope', 'item', { storedSize: 1, quantity: 2, containerId: target.id });
    expect(getUsedCapacity(target, [existing, nested, child])).toBe(2);
    expect(checkWithdrawTarget(item('Torches', 'item', { storedSize: 2, quantity: 2 }), target, [existing, nested, child])).toMatchObject({ allowed: true });
    expect(checkWithdrawTarget(item('Torches', 'item', { storedSize: 2, quantity: 3 }), target, [existing, nested, child])).toMatchObject({ allowed: false, reasonType: 'capacity' });
  });

  it('preserves explicit allowlist metadata when display names are unexpected', () => {
    const target = container('Custom Carrier', { allowedNames: ['Canonical Item'] });
    const renamed = item('Surprising Display Name', 'item', { customName: 'Canonical Item' });
    expect(isItemAllowedInContainer(renamed, target, [])).toMatchObject({ allowed: false });
    expect(isItemAllowedInContainer(item('Canonical Item', 'item', { custom: { label: 'kept' } }), target, [])).toMatchObject({ allowed: true });
  });
});
