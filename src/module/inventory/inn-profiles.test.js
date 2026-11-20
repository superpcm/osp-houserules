import { describe, expect, it } from 'vitest';
import { generateInnOfferings, replenishInnOfferings, specialtyIdentity, normalizeSpecialtyName } from './inn-profiles.js';

describe('inn profiles', () => {
  it('generates deterministic, stable room offerings with size capacities', () => {
    const first = generateInnOfferings({ type: 'both', size: 'medium', seed: 'westford' });
    const second = generateInnOfferings({ type: 'both', size: 'medium', seed: 'westford' });
    expect(first.success).toBe(true);
    expect(first.offerings).toEqual(second.offerings);
    expect(first.offerings.filter(entry => entry.kind === 'room').map(entry => [entry.id, entry.quantity, entry.capacity])).toEqual([
      ['room-private', 4, 2], ['room-large', 2, 4],
    ]);
    expect(first.offerings.find(entry => entry.id === 'bed-common')).toMatchObject({ quantity: 8, capacity: 1 });
    expect(first.offerings.find(entry => entry.id === 'stabling')).toMatchObject({ quantity: 6, capacity: 1 });
  });

  it('stocks a full cellar independently of food across tavern profiles', () => {
    for (const type of ['tavern', 'both']) for (const size of ['small', 'medium', 'large']) for (const quality of ['modest', 'comfortable', 'fine']) for (let seed = 0; seed < 10; seed += 1) {
      const result = generateInnOfferings({ type, size, quality, seed });
      const drinks = result.offerings.filter(entry => entry.kind === 'drink');
      expect(drinks).toHaveLength(Math.min(15, { small: 10, medium: 12, large: 14 }[size] + (quality === 'fine' ? 1 : 0)));
      expect(new Set(drinks.map(entry => entry.sourceId)).size).toBe(drinks.length);
      for (const core of ['ale', 'dark-ale', 'stout', 'cider', 'wine', 'mead', 'brandy', 'tea']) expect(drinks.some(entry => entry.sourceId === core)).toBe(true);
      expect(result.offerings.some(entry => entry.kind === 'meal' && entry.signature)).toBe(true);
    }
  });

  it('prices everyday food in copper and reserves silver for substantial suppers', () => {
    const result = generateInnOfferings({ type: 'tavern', size: 'large', quality: 'comfortable', settlement: 'town' });
    const prices = Object.fromEntries(Array.from({ length: 20 }, (_, seed) => generateInnOfferings({ type: 'tavern', size: 'large', quality: 'comfortable', settlement: 'town', seed }).offerings).flat().filter(entry => entry.kind === 'meal').map(entry => [entry.sourceId, entry.priceCp]));
    expect(prices).toMatchObject({ stew: 7, 'bread-cheese': 5, porridge: 3, 'meat-pie': 8, roast: 15, 'fine-supper': 50 });
    for (const entry of result.offerings.filter(entry => entry.signature)) {
      expect(entry.priceCp).toBeLessThanOrEqual(32);
      expect(Number.isInteger(entry.priceCp)).toBe(true);
    }
  });

  it('keeps taverns free of lodging and inns free of alcohol', () => {
    const tavern = generateInnOfferings({ type: 'tavern', size: 'large' });
    const inn = generateInnOfferings({ type: 'inn', size: 'large' });
    expect(tavern.offerings.every(entry => ['meal', 'drink'].includes(entry.kind))).toBe(true);
    expect(inn.offerings.every(entry => entry.kind === 'meal' || ['tea', 'milk', 'honey-milk', 'fruit-juice', 'berry-shrub', 'mint-tea', 'spiced-cocoa', 'spring-water', 'apple-press', 'ginger-tonic', 'hazel-nut-milk'].includes(entry.sourceId) || ['room', 'bed', 'stabling'].includes(entry.kind))).toBe(true);
    expect(inn.offerings.some(entry => entry.kind === 'drink')).toBe(true);
    expect(inn.offerings.some(entry => ['ale', 'wine', 'cider', 'coffee'].includes(entry.sourceId))).toBe(false);
  });

  it('adds a deterministic signature meal with varied local flavor', () => {
    const names = new Set();
    for (let seed = 0; seed < 30; seed += 1) {
      const result = generateInnOfferings({ type: 'tavern', size: 'small', seed });
      const signatures = result.offerings.filter(entry => entry.kind === 'meal' && entry.signature === true);
      expect(signatures.length).toBeGreaterThanOrEqual(1);
      expect(signatures[0].description).toMatch(/(barley|beef|potatoes|chicken|beans|noodles|fish|rabbit|eggs|venison|mushrooms|oat|fowl|mushrooms|loaf|apple|roots|pork)/i);
      names.add(signatures[0].name);
    }
    expect(names.size).toBeGreaterThanOrEqual(4);
  });

  it('keeps flavorful names and descriptions stable during replenishment', () => {
    const generated = generateInnOfferings({ type: 'both', size: 'large', seed: 'flavor-test' });
    const replenished = replenishInnOfferings({ offerings: generated.offerings }, { seed: 'later', minStock: 2, maxStock: 8, supply: 'reliable' });
    expect(replenished.success).toBe(true);
    for (const before of generated.offerings) {
      const after = replenished.offerings.find(entry => entry.id === before.id);
      expect(after).toMatchObject({ id: before.id, name: before.name, description: before.description });
      if (before.kind === 'meal') expect(after.signature).toBe(before.signature);
    }
  });

  it('applies quality and settlement factors without using item prices as rarity', () => {
    const modestVillage = generateInnOfferings({ type: 'tavern', seed: 4, quality: 'modest', settlement: 'village' });
    const fineCity = generateInnOfferings({ type: 'tavern', seed: 4, quality: 'fine', settlement: 'city' });
    const modestAle = modestVillage.offerings[0];
    const fineAle = fineCity.offerings.find(entry => entry.sourceId === modestAle.sourceId);
    expect(fineAle.priceCp).toBeGreaterThan(modestAle.priceCp);
    expect(modestVillage.settings.priceBounds.meal.maxCp).toBe(10000);
  });

  it('rejects invalid stock and interval bounds', () => {
    expect(generateInnOfferings({ minStock: 0 }).success).toBe(false);
    expect(generateInnOfferings({ intervalDays: 366 }).success).toBe(false);
    expect(generateInnOfferings({ priceBounds: { meal: { minCp: 20, maxCp: 10 } } }).success).toBe(false);
    for (const options of [{ supply: 'unknown' }, { size: 'huge' }, { minStock: true }, { minStock: null }, { maxStock: [8] }, { intervalDays: -1 }]) expect(generateInnOfferings(options).success).toBe(false);
  });

  it('keeps all offerings enabled when automation is off and honors explicit price and quantity guardrails', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const result = generateInnOfferings({ seed, enabled: false, type: 'both', size: 'small', supply: 'abundant', minStock: 3, maxStock: 5, priceBounds: { meal: { minCp: 12, maxCp: 12 }, drink: { minCp: 4, maxCp: 4 } } });
      expect(result.offerings.every(entry => entry.enabled)).toBe(true);
      for (const entry of result.offerings.filter(entry => ['meal', 'drink'].includes(entry.kind))) { expect(entry.quantity).toBeGreaterThanOrEqual(3); expect(entry.quantity).toBeLessThanOrEqual(5); expect(entry.priceCp).toBe(entry.kind === 'meal' ? 12 : 4); }
      expect(result.offerings.some(entry => entry.kind === 'meal')).toBe(true); expect(result.offerings.some(entry => entry.kind === 'drink')).toBe(true);
    }
  });

  it('assigns reserved, stable specialty identities without sharing signature recipes', () => {
    const reserved = [];
    const allKeys = new Set(); const allNames = new Set();
    for (let index = 0; index < 40; index += 1) {
      const result = generateInnOfferings({ type: 'tavern', size: 'small', seed: index % 3, reservedSpecialtyKeys: reserved });
      expect(result.success).toBe(true);
      const signature = result.offerings.find(entry => entry.signature === true);
      const key = specialtyIdentity(signature);
      expect(key).toBeTruthy();
      expect(allKeys.has(key)).toBe(false);
      expect(allNames.has(normalizeSpecialtyName(signature.name))).toBe(false);
      allKeys.add(key); allNames.add(normalizeSpecialtyName(signature.name)); reserved.push(key);
    }
    expect(allKeys.size).toBe(40);
  });

  it('is deterministic for the same context and excludes legacy reserved signatures', () => {
    const options = { type: 'both', size: 'large', seed: 'same-context', reservedSpecialtyKeys: ['mara-millers-pot'], reservedSpecialtyNames: ['The Silver Stag supper — hearth-smoked'] };
    const first = generateInnOfferings(options); const second = generateInnOfferings(options);
    expect(first).toEqual(second);
    expect(first.settings).not.toHaveProperty('reservedSpecialtyKeys');
    for (const signature of first.offerings.filter(entry => entry.signature === true)) {
      expect(signature.specialtyKey.startsWith('mara-millers-pot::')).toBe(false);
      expect(normalizeSpecialtyName(signature.name)).not.toBe(normalizeSpecialtyName(options.reservedSpecialtyNames[0]));
    }
  });

  it('reports exhaustion instead of reusing an exclusive specialty', () => {
    const first = generateInnOfferings({ type: 'tavern', size: 'small', seed: 1 });
    const keys = new Set();
    for (let i = 0; i < 200; i += 1) {
      const result = generateInnOfferings({ type: 'tavern', size: 'small', seed: i, reservedSpecialtyKeys: [...keys] });
      if (!result.success) { expect(result.reason).toMatch(/No unreserved signature offerings/); return; }
      keys.add(specialtyIdentity(result.offerings.find(entry => entry.signature === true)));
    }
    expect(keys.size).toBeGreaterThan(40);
    expect(first.success).toBe(true);
  });
});
