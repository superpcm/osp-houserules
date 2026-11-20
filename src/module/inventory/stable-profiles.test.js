import { describe, expect, it } from 'vitest';
import { generateStableStock, normalizeStableProfile, validateStableProfile, eligibleStableProfileItem, __test } from './stable-profiles.js';
import bundledTack from '../../../data/tack.json';
import bundledVehicles from '../../../data/vehicles.json';
import bundledLivestock from '../../../data/livestock.json';

const item = (name, type, availability = null, cost = 10, tags = []) => ({ id: name.toLowerCase().replace(/\s+/g, '-'), uuid: `Compendium.test.${name}`, name, type, system: { cost, tags, storeAvailability: availability } });
const catalog = [
  item('Mule', 'livestock', null, 30, ['livestock']), item('Chicken', 'livestock', null, 0.2, ['livestock']), item('Horse, War', 'livestock', null, 400, ['livestock']),
  item('Saddle', 'item', 'common', 25, ['tack']), item('Cart', 'container', 'common', 115, ['vehicle', 'tack']), item('Backpack', 'container', 'common', 5, ['container']),
];

describe('stable stock profiles', () => {
  it('uses unique bundled defaults, direct metadata, and explicit overrides in that order', () => {
    const saddle = { ...bundledTack.find(item => item.name === 'Saddle'), uuid: 'Item.saddle' }; saddle.system = { ...saddle.system, storeAvailability: null };
    expect(__test.metadataFor(saddle).availability).toBe('common');
    saddle.system.storeAvailability = 'exceptional'; expect(__test.metadataFor(saddle).availability).toBe('exceptional');
    expect(eligibleStableProfileItem(saddle, { profileId: 'saddler', availabilityOverrides: { 'Item.saddle': 'rare' } })).toBe(true);
    saddle.system.storeAvailability = null; expect(__test.metadataFor(saddle, [saddle, saddle]).availability).toBeNull();
    expect(generateStableStock([saddle], { availabilityOverrides: { 'Item.saddle': 'legendary' } }).success).toBe(false);
  });
  it('keeps Never Stock authoritative over Always Stock and permits deliberate specialty exceptions', () => {
    const chicken = catalog.find(item => item.name === 'Chicken');
    const settings = { profileId: 'breeder', minProducts: 1, maxProducts: 1, alwaysStock: [chicken.uuid] };
    expect(generateStableStock(catalog, settings).entries[0].itemData.name).toBe('Chicken');
    expect(generateStableStock(catalog, { ...settings, neverStock: [chicken.uuid] }).entries.some(entry => entry.itemData.name === 'Chicken')).toBe(false);
  });
  it('never broadens specialist stock to fill a catalog shortfall across varied seeds', () => {
    const full = [...bundledLivestock, ...bundledTack, ...bundledVehicles].map((item, i) => ({ ...item, uuid: 'Item.catalog' + i }));
    for (let seed = 0; seed < 30; seed += 1) {
      const breeder = generateStableStock(full, { profileId: 'breeder', minProducts: 20, maxProducts: 20, seed });
      expect(breeder.entries.length).toBe(4); expect(breeder.entries.every(entry => ['Horse, Draft', 'Horse, Riding', 'Horse, War', 'Pony'].includes(entry.itemData.name))).toBe(true);
      const wainwright = generateStableStock(full, { profileId: 'wainwright', minProducts: 20, maxProducts: 20, seed });
      expect(wainwright.entries.map(entry => entry.itemData.name).sort()).toEqual(['Cargo Net', 'Cart', 'Handcart', 'Harness, Draft', 'Harness, Team', 'Wagon', 'Wagon Cover', 'Wagon, Heavy Freight', 'Wagon, Open', 'Wheelbarrow', 'Yoke, Ox']);
    }
    expect(__test.availabilityWeight).toEqual({ common: 2, uncommon: 1, rare: 0.35, exceptional: 0.1 });
    expect(__test.sizeExceptional).toEqual({ small: 0.15, medium: 1, large: 2 });
  });
  it('uses deterministic profile-appropriate stock and honest shortfalls', () => {
    const a = generateStableStock(catalog, { profileId: 'breeder', size: 'medium', minProducts: 4, maxProducts: 4, seed: 'same' });
    const b = generateStableStock(catalog, { profileId: 'breeder', size: 'medium', minProducts: 4, maxProducts: 4, seed: 'same' });
    expect(a.success).toBe(true); expect(a.entries).toEqual(b.entries); expect(a.entries.every(entry => /horse|mule|chicken/i.test(entry.itemData.name))).toBe(true); expect(a.shortfall).toBeGreaterThan(0);
  });
  it('keeps availability independent from price', () => {
    const first = generateStableStock([item('Horse, War', 'livestock', null, 1)], { profileId: 'breeder', minProducts: 1, maxProducts: 1, seed: 1 });
    const second = generateStableStock([item('Horse, War', 'livestock', null, 99999)], { profileId: 'breeder', minProducts: 1, maxProducts: 1, seed: 1 });
    expect(first.entries[0].itemData.name).toBe(second.entries[0].itemData.name); expect(first.entries[0].customPrice).not.toBe(second.entries[0].customPrice);
    const rounded = generateStableStock([item('Horse, War', 'livestock', 'rare', 1)], { profileId: 'breeder', minProducts: 1, maxProducts: 1, minPricePercent: 117, maxPricePercent: 117 });
    expect(rounded.entries[0].customPrice).toBe(1.2);
  });
  it('supports manual overrides and validates guardrails', () => {
    const manual = { id: 'manual', sourceUuid: 'manual', itemData: item('Custom Goat', 'livestock', null), managed: false, stock: 7, customPrice: 22 };
    const result = generateStableStock(catalog, { profileId: 'combined', minProducts: 1, maxProducts: 1, alwaysStock: ['Compendium.test.Cart'] }, [manual]);
    expect(result.entries.some(entry => entry.id === 'manual')).toBe(true);
    expect(validateStableProfile({ minProducts: 0 })).toContain('Product bounds');
    expect(normalizeStableProfile({ size: 'large' }).maxProducts).toBe(20);
  });
  it('classifies every bundled animal for automatic livestock stock', () => {
    const catalogItems = bundledLivestock.map((entry, index) => ({ ...entry, id: `animal-${index}`, uuid: `Compendium.animals.${index}` }));
    const result = generateStableStock(catalogItems, { profileId: 'combined', minProducts: 14, maxProducts: 14, seed: 'all-animals' });
    expect(result.success).toBe(true); expect(result.unclassifiedCount).toBe(0); expect(result.shortfall).toBe(0); expect(result.generatedCount).toBe(14);
  });
  it('excludes unsafe automatic and always stock entries', () => {
    const magic = item('Cursed Bridle', 'tack', 'common', 50, ['tack']); magic.system.magic = true;
    const result = generateStableStock([magic], { profileId: 'saddler', minProducts: 1, maxProducts: 1, alwaysStock: [] });
    expect(result.generatedCount).toBe(0); expect(generateStableStock([magic], { profileId: 'saddler', minProducts: 1, maxProducts: 1, alwaysStock: [magic.uuid] }).success).toBe(false);
  });
});
