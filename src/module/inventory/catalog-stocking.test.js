import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CATALOG_AVAILABILITIES, resolveStockingMetadata, validateStockingMetadata } from './catalog-stocking.js';
import { eligibleStoreItem } from './store.js';
import { generateStoreStock, itemStockWeight } from './store-profiles.js';

const item = (name, type = 'item', system = {}) => ({ name, type, system });
const files = ['ammunition', 'archive', 'armor', 'clothing', 'gear', 'livestock', 'misc', 'tack', 'treasure', 'vehicles', 'weapons'];
const bundled = files.flatMap(file => JSON.parse(readFileSync(new URL(`../../../data/${file}.json`, import.meta.url), 'utf8')));

describe('stocking catalog metadata', () => {
  it('uses explicit item metadata before catalog matches', () => {
    const catalog = [item('Mystery Blade', 'weapon', { storeAvailability: 'rare', blacksmithEligible: true })];
    expect(resolveStockingMetadata(item('Mystery Blade', 'weapon', { storeAvailability: 'common', blacksmithEligible: false }), catalog)).toMatchObject({ availability: 'common', blacksmithEligible: false, availabilitySource: 'item' });
  });

  it('uses a unique catalog match and leaves unknown items unclassified', () => {
    const catalog = [item('Catalog Lantern', 'item', { storeAvailability: 'uncommon', blacksmithEligible: false })];
    expect(resolveStockingMetadata(item('Catalog Lantern'), catalog).availability).toBe('uncommon');
    expect(resolveStockingMetadata(item('Unknown Custom Item'), catalog).availability).toBeNull();
  });

  it('uses explicit catalog ratings independently of price', () => {
    const catalog = [item('Field plate', 'armor', { storeAvailability: 'exceptional', blacksmithEligible: true }), item('Torch', 'item', { storeAvailability: 'common', blacksmithEligible: false })];
    expect(resolveStockingMetadata(item('Field plate', 'armor', { cost: 1 }), catalog).availability).toBe('exceptional');
    expect(resolveStockingMetadata(item('Torch', 'item', { cost: 10000 }), catalog).availability).toBe('common');
    expect(resolveStockingMetadata(item('Leather', 'armor', { storeAvailability: 'common', blacksmithEligible: false })).blacksmithEligible).toBe(false);
    expect(resolveStockingMetadata(item('Banded mail', 'armor', { storeAvailability: 'uncommon', blacksmithEligible: true })).blacksmithEligible).toBe(true);
    expect(resolveStockingMetadata(item('Crossbow, Heavy', 'weapon', { storeAvailability: 'uncommon', blacksmithEligible: false })).blacksmithEligible).toBe(false);
  });

  it('leaves ambiguous matches unclassified and does not infer rarity from names, tags, or price', () => {
    const duplicates = [item('Tool', 'item', { storeAvailability: 'common' }), item('Tool', 'item', { storeAvailability: 'rare' })];
    expect(resolveStockingMetadata(item('Tool'), duplicates).availability).toBeNull();
    expect(resolveStockingMetadata(item('Rare exotic tool', 'item', { rarity: 'rare', tags: ['rare'], cost: 900 })).availability).toBeNull();
    expect(validateStockingMetadata({ storeAvailability: 'legendary' })).toContain('Availability');
    expect(validateStockingMetadata({ blacksmithEligible: 'false' })).toContain('Blacksmith');
  });

  it('classifies the entire eligible bundled catalog with valid deliberate metadata', () => {
    for (const entry of bundled.filter(eligibleStoreItem)) {
      expect(CATALOG_AVAILABILITIES, entry.name).toContain(entry.system.storeAvailability);
      expect(typeof entry.system.blacksmithEligible, entry.name).toBe('boolean');
      expect(validateStockingMetadata(entry.system), entry.name).toBeNull();
    }
    for (const [name, rating] of [["Healer's Kit", 'uncommon'], ['Field plate', 'exceptional'], ['Full plate', 'exceptional'], ['Barding, Scale', 'uncommon'], ['Barding, Plate', 'rare']]) expect(bundled.find(entry => entry.name === name).system.storeAvailability).toBe(rating);
    for (const name of ['Body Shield', 'Shield', 'Studded Leather', 'Backpack', 'Crossbow, Heavy', 'Club', 'Staff']) expect(bundled.find(entry => entry.name === name).system.blacksmithEligible, name).toBe(false);
    for (const name of ['Misericorde', 'Longsword', 'Crowbar', 'Lantern, Mount', 'Barding, Scale']) expect(bundled.find(entry => entry.name === name).system.blacksmithEligible, name).toBe(true);
  });

  it('never fills blacksmith inventories with inappropriate items across seeds or sizes', () => {
    const world = bundled.map((entry, i) => ({ ...entry, id: String(i), uuid: `Item.${i}` }));
    for (const size of ['small', 'medium', 'large']) for (let seed = 0; seed < 25; seed += 1) {
      const result = generateStoreStock(world, { profileId: 'blacksmith', settlement: 'city', size, seed, catalog: bundled });
      expect(result.success).toBe(true);
      expect(result.entries.length).toBeGreaterThan(0);
      for (const entry of result.entries) expect(entry.itemData.system.blacksmithEligible, entry.itemData.name).toBe(true);
    }
  });

  it('allows a store override to classify custom goods and Always Stock to bypass classification', () => {
    const custom = { ...item('Custom supply', 'item', { cost: 1 }), id: 'custom', uuid: 'Item.custom' };
    expect(generateStoreStock([custom], { catalog: [] }).unclassifiedProducts).toBe(1);
    const rated = generateStoreStock([custom], { catalog: [], rarityOverrides: { 'Item.custom': 'exceptional' } });
    expect(rated.entries).toHaveLength(1); expect(rated.unclassifiedProducts).toBe(0);
    expect(generateStoreStock([custom], { profileId: 'blacksmith', alwaysStock: ['Item.custom'], catalog: [] }).entries).toHaveLength(1);
  });

  it('uses the exact availability weights and Exceptional size adjustments', () => {
    const options = { profileId: 'general', size: 'medium', wealth: 'comfortable' };
    const weight = availability => itemStockWeight(item('Tool', 'item', { cost: 1, storeAvailability: availability }), options);
    expect(weight('common') / weight('uncommon')).toBeCloseTo(2);
    expect(weight('rare') / weight('uncommon')).toBeCloseTo(0.35);
    expect(weight('exceptional') / weight('uncommon')).toBeCloseTo(0.1);
    const exceptional = item('Tool', 'item', { cost: 1, storeAvailability: 'exceptional' });
    expect(itemStockWeight(exceptional, { ...options, size: 'small' }) / weight('exceptional')).toBeCloseTo(0.15);
    expect(itemStockWeight(exceptional, { ...options, size: 'large' }) / weight('exceptional')).toBeCloseTo(2);
  });
});
