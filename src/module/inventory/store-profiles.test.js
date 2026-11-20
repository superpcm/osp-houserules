import { describe, expect, it } from 'vitest';
import { category, itemStockWeight, generateStoreStock, profileDefaults, randomizeStorePrices, randomizeStoreStock, STOCK_PROFILES } from './store-profiles.js';

const item = (id, type = 'item', cost = 10, extra = {}) => ({ id, uuid: `Item.${id}`, name: id, type, img: '', system: { cost, tags: [], storeAvailability: 'common', blacksmithEligible: ['weapon', 'armor'].includes(type), ...extra } });
const entry = (id, stock = null, customPrice = null) => ({ id, sourceUuid: `Item.${id}`, itemData: item(id), stock, customPrice, hidden: false });

describe('store stock profiles', () => {
  it('maps all shared equipment categories', () => {
    expect(['weapon', 'armor', 'ammunition', 'container', 'clothing', 'item'].map(category)).toEqual(['Weapons', 'Armor', 'Ammunition', 'Containers', 'Clothing', 'Gear']);
  });
  it('randomizes deterministically without mutating entries and preserves limited stock by default', () => {
    const source = [entry('limited', 4), entry('unlimited')];
    const first = randomizeStoreStock(source, { seed: 42, minStock: 2, maxStock: 8 });
    const second = randomizeStoreStock(source, { seed: 42, minStock: 2, maxStock: 8 });
    expect(first).toEqual(second); expect(first.entries[0].stock).toBe(4); expect(first.entries[1].stock).toBeGreaterThanOrEqual(2); expect(source[0].stock).toBe(4);
    expect(randomizeStoreStock(source, { includeUnlimited: true, seed: 42, minStock: 2, maxStock: 8 }).entries[1].stock).toBeGreaterThanOrEqual(2);
    expect(randomizeStoreStock([entry('unlimited')], { seed: 42, minStock: 2, maxStock: 8 }).entries[0].stock).toBeGreaterThanOrEqual(2);
    expect(randomizeStoreStock([entry('a')], { seed: 'alpha', minStock: 1, maxStock: 8 }).entries[0].stock).not.toBe(randomizeStoreStock([entry('a')], { seed: 'beta', minStock: 1, maxStock: 8 }).entries[0].stock);
  });
  it('randomizes prices with caps and preserves custom prices by default', () => {
    const source = [entry('standard', null), entry('custom', null, 99)];
    const result = randomizeStorePrices(source, { seed: 4, minPricePercent: 50, maxPricePercent: 150, maxPriceSp: 2, roundingCp: 5 });
    expect(result.success).toBe(true); expect(result.entries[0].customPrice).toBeLessThanOrEqual(2); expect(result.entries[0].customPrice * 10 % 5).toBe(0); expect(result.entries[1].customPrice).toBe(99); expect(source[0].customPrice).toBeNull();
  });
  it('generates explicit profile entries and excludes magic by default', () => {
    const catalog = [item('sword', 'weapon'), item('potion', 'item', 4, { tags: ['potion'] }), item('wand', 'item', 50, { magic: true })];
    const result = generateStoreStock(catalog, { seed: 9, profileId: 'apothecary', settlement: 'village', size: 'small' });
    expect(result.success).toBe(true); expect(result.entries.every(entry => entry.itemData.name === 'potion')).toBe(true); expect(result.entries[0].sourceUuid).toBe('Item.potion');
    expect(STOCK_PROFILES.map(profile => profile.id)).toEqual(['general', 'outfitter', 'weaponsmith', 'blacksmith', 'armorer', 'apothecary']);
  });
  it('exposes editable location and size defaults for the creator', () => {
    expect(profileDefaults({ settlement: 'city', size: 'large' })).toMatchObject({ minProducts: 80, maxProducts: 120, minStock: 4, maxStock: 60, minPricePercent: 65, maxPricePercent: 105, settlement: 'city', size: 'large' });
  });
  it('returns clear failures for invalid guardrails', () => {
    expect(randomizeStoreStock([], { minStock: 10, maxStock: 1 }).success).toBe(false);
    expect(randomizeStorePrices([], { minPricePercent: -1 }).success).toBe(false);
    expect(randomizeStorePrices([entry('x')], { minPriceSp: 0.01, maxPriceSp: 0.04, roundingCp: 5 }).success).toBe(false);
    expect(randomizeStorePrices([entry('x')], { maxPriceSp: Number.NaN }).success).toBe(false);
  });
  it('uses settlement availability thresholds when choosing profile stock', () => {
    const catalog = [item('cheap', 'item', 50), item('dear', 'item', 200), item('rare', 'item', 2000)];
    const village = generateStoreStock(catalog, { seed: 3, settlement: 'village', size: 'large', profileId: 'general' });
    const city = generateStoreStock(catalog, { seed: 3, settlement: 'city', size: 'large', profileId: 'general' });
    expect(village.entries.every(candidate => candidate.itemData.system.cost <= 100)).toBe(true);
    expect(city.entries.some(candidate => candidate.itemData.system.cost > 100)).toBe(true);
  });
  it('samples without replacement with stable weighted profile differences', () => {
    const catalog = [...Array.from({ length: 24 }, (_, index) => item(`gear-${index}`)), ...Array.from({ length: 12 }, (_, index) => item(`weapon-${index}`, 'weapon')), ...Array.from({ length: 12 }, (_, index) => item(`armor-${index}`, 'armor'))];
    const same = generateStoreStock(catalog, { seed: 'weighted', profileId: 'general', settlement: 'city', size: 'large' });
    expect(generateStoreStock(catalog, { seed: 'weighted', profileId: 'general', settlement: 'city', size: 'large' })).toEqual(same);
    expect(new Set(same.entries.map(entry => entry.sourceUuid)).size).toBe(same.entries.length);
    let generalGear = 0; let generalSpecialty = 0;
    for (let seed = 1; seed <= 100; seed += 1) for (const entry of generateStoreStock(catalog, { seed, profileId: 'general', settlement: 'city', size: 'small' }).entries) entry.itemData.type === 'item' ? generalGear += 1 : generalSpecialty += 1;
    expect(generalGear).toBeGreaterThan(generalSpecialty);
  });
  it('supports always and never stock, including specialist bypasses, within explicit bounds', () => {
    const catalog = [item('sword', 'weapon', 10), item('potion', 'item', 10, { tags: ['potion'] }), item('never', 'item', 10)];
    const result = generateStoreStock(catalog, { seed: 4, profileId: 'apothecary', settlement: 'village', size: 'small', alwaysStock: ['Item.sword'], neverStock: ['Item.never'], minStock: 5, maxStock: 5, minPricePercent: 100, maxPricePercent: 100 });
    expect(result.success).toBe(true); expect(result.entries.some(entry => entry.sourceUuid === 'Item.sword' && entry.stock === 5)).toBe(true); expect(result.entries.some(entry => entry.sourceUuid === 'Item.never')).toBe(false); expect(result.entries.every(entry => entry.stock === 5)).toBe(true);
  });
  it('keeps legacy profile options neutral and applies environment shifts inside guardrails', () => {
    const catalog = [item('gear', 'item', 10), item('sword', 'weapon', 10)];
    const legacy = generateStoreStock(catalog, { seed: 2, profileId: 'general', settlement: 'town', size: 'small', minStock: 3, maxStock: 3, minPricePercent: 90, maxPricePercent: 90 });
    const event = generateStoreStock(catalog, { seed: 2, profileId: 'general', settlement: 'town', size: 'small', event: 'war', minStock: 3, maxStock: 3, minPricePercent: 90, maxPricePercent: 90 });
    expect(legacy.success).toBe(true); expect(event.success).toBe(true); expect(legacy.entries.every(entry => entry.stock === 3)).toBe(true); expect(event.entries.every(entry => entry.stock === 3)).toBe(true);
  });
  it('applies availability chance while protecting always-stocked entries', () => {
    const catalog = [item('gear'), item('sword', 'weapon')];
    const unavailable = generateStoreStock(catalog, { seed: 2, profileId: 'general', settlement: 'city', size: 'small', minStock: 1, maxStock: 5, unavailableChance: 100, alwaysStock: ['Item.sword'] });
    const available = generateStoreStock(catalog, { seed: 2, profileId: 'general', settlement: 'city', size: 'small', minStock: 1, maxStock: 5, unavailableChance: 0 });
    expect(unavailable.entries.find(entry => entry.sourceUuid === 'Item.sword').stock).toBeGreaterThan(0); expect(unavailable.entries.filter(entry => entry.sourceUuid !== 'Item.sword').every(entry => entry.stock === 0)).toBe(true); expect(available.entries.every(entry => entry.stock > 0)).toBe(true);
  });
  it('changes quantities with supply and demand while remaining inside bounds', () => {
    const catalog = [item('gear')]; let disrupted = 0; let abundant = 0;
    for (let seed = 1; seed <= 100; seed += 1) { disrupted += generateStoreStock(catalog, { seed, settlement: 'city', size: 'small', supply: 'disrupted', minStock: 1, maxStock: 20 }).entries[0].stock; abundant += generateStoreStock(catalog, { seed, settlement: 'city', size: 'small', supply: 'abundant', demand: 'civilian', minStock: 1, maxStock: 20 }).entries[0].stock; }
    expect(abundant).toBeGreaterThan(disrupted); expect(disrupted).toBeGreaterThanOrEqual(100); expect(abundant).toBeLessThanOrEqual(2000);
  });
  it('responds to economy affinities and wealth across many seeds', () => {
    const catalog = [item('mining pick', 'item', 10, { tags: ['mining'] }), ...Array.from({ length: 19 }, (_, index) => item(`plain gear ${index}`, 'item', 10)), item('expensive tool', 'item', 500), ...Array.from({ length: 19 }, (_, index) => item(`cheap tool ${index}`, 'item', 10))]; let miningPick = 0; let poorExpensive = 0; let wealthyExpensive = 0;
    for (let seed = 1; seed <= 100; seed += 1) { miningPick += generateStoreStock(catalog, { seed: `economy-${seed}`, settlement: 'city', size: 'small', economy: 'mining' }).entries.filter(entry => entry.itemData.name === 'mining pick').length; poorExpensive += generateStoreStock(catalog, { seed: `economy-${seed}`, settlement: 'city', size: 'small', wealth: 'poor' }).entries.filter(entry => entry.itemData.name === 'expensive tool').length; wealthyExpensive += generateStoreStock(catalog, { seed: `economy-${seed}`, settlement: 'city', size: 'small', wealth: 'wealthy' }).entries.filter(entry => entry.itemData.name === 'expensive tool').length; }
    expect(miningPick).toBeGreaterThan(30); expect(wealthyExpensive).toBeGreaterThan(poorExpensive);
  });
  it('deduplicates catalog UUIDs and rejects magic always-stock requests', () => {
    const duplicate = item('duplicate'); duplicate.uuid = 'Item.same'; const second = item('duplicate-copy'); second.uuid = 'Item.same';
    const result = generateStoreStock([duplicate, second], { seed: 1, settlement: 'city', size: 'large', alwaysStock: ['Item.same'] });
    expect(result.success).toBe(true); expect(result.entries.filter(entry => entry.sourceUuid === 'Item.same')).toHaveLength(1);
    const magic = item('magic wand', 'item', 10, { magic: true }); expect(generateStoreStock([magic], { alwaysStock: [magic.uuid], settlement: 'city' }).success).toBe(false);
  });
  it('changes category demand and event pricing without leaving explicit bounds', () => {
    const catalog = [item('sword', 'weapon', 10), item('mail', 'armor', 10), ...Array.from({ length: 12 }, (_, index) => item(`armor-${index}`, 'armor', 10)), ...Array.from({ length: 12 }, (_, index) => item(`weapon-${index}`, 'weapon', 10))]; let normalWeapons = 0; let warWeapons = 0; let normalPrice = 0; let warPrice = 0;
    for (let seed = 1; seed <= 100; seed += 1) { const normal = generateStoreStock(catalog, { seed, profileId: 'armorer', settlement: 'city', size: 'small', minProducts: 6, maxProducts: 10, minPricePercent: 50, maxPricePercent: 150 }); const war = generateStoreStock(catalog, { seed, profileId: 'armorer', settlement: 'city', size: 'small', minProducts: 6, maxProducts: 10, event: 'war', minPricePercent: 50, maxPricePercent: 150 }); normalWeapons += normal.entries.filter(entry => entry.itemData.type === 'weapon').length; warWeapons += war.entries.filter(entry => entry.itemData.type === 'weapon').length; normalPrice += normal.entries.reduce((sum, entry) => sum + entry.customPrice, 0); warPrice += war.entries.reduce((sum, entry) => sum + entry.customPrice, 0); }
    expect(warWeapons).toBeGreaterThan(normalWeapons); expect(warPrice).toBeGreaterThan(normalPrice); expect(warPrice / 100).toBeLessThanOrEqual(15 * 10);
  });
  it('uses explicit product bounds and reports catalog shortfalls', () => {
    const catalog = Array.from({ length: 100 }, (_, index) => item(`product-${index}`));
    for (let seed = 1; seed <= 20; seed += 1) {
      const result = generateStoreStock(catalog, { seed, size: 'large', minProducts: 40, maxProducts: 70, settlement: 'city' });
      expect(result.success).toBe(true); expect(result.requestedProducts).toBeGreaterThanOrEqual(40); expect(result.requestedProducts).toBeLessThanOrEqual(70); expect(result.generatedProducts).toBe(result.requestedProducts); expect(result.settings.minProducts).toBe(40); expect(result.settings.maxProducts).toBe(70);
    }
    const shortfall = generateStoreStock(catalog.slice(0, 3), { seed: 1, size: 'large', minProducts: 40, maxProducts: 40, settlement: 'city' });
    expect(shortfall).toMatchObject({ success: true, requestedProducts: 40, eligibleProducts: 3, generatedProducts: 3 });
  });
  it('rejects invalid product bounds and always-stock overflow', () => {
    const catalog = Array.from({ length: 4 }, (_, index) => item(`product-${index}`));
    expect(generateStoreStock(catalog, { minProducts: 0, maxProducts: 40 }).success).toBe(false);
    expect(generateStoreStock(catalog, { minProducts: 70, maxProducts: 40 }).success).toBe(false);
    expect(generateStoreStock(catalog, { minProducts: 1, maxProducts: 1, alwaysStock: ['Item.product-0', 'Item.product-1'] }).success).toBe(false);
  });
});

it('excludes enchanted bonus equipment and unique items from ordinary profiles', () => {
  const catalog = [item('ordinary', 'armor'), item('Chain mail +1', 'armor'), item('enchanted', 'weapon', 10, { bonus: 2 }), item('special', 'item', 10, { unique: true })];
  const result = generateStoreStock(catalog, { seed: 9, size: 'large', settlement: 'city' });
  expect(result.success).toBe(true);
  expect(result.entries.map(entry => entry.itemData.name)).toEqual(['ordinary']);
});

it('keeps general stores supply-focused even when weapon catalog variants vastly outnumber gear', () => {
  const catalog = [
    ...Array.from({ length: 30 }, (_, i) => item(`Rope ${i}`, 'item')),
    ...Array.from({ length: 150 }, (_, i) => item(`Spear ${i}`, 'weapon')),
    ...Array.from({ length: 30 }, (_, i) => item(`Mail ${i}`, 'armor')),
    ...Array.from({ length: 20 }, (_, i) => item(`Pack ${i}`, 'container')),
    ...Array.from({ length: 20 }, (_, i) => item(`Clothes ${i}`, 'clothing')),
  ];
  const counts = Object.fromEntries(['general', 'weaponsmith', 'blacksmith', 'armorer'].map(profile => [profile, { total: 0, weapon: 0, armor: 0, supplies: 0 }]));
  for (let i = 0; i < 150; i++) for (const profileId of Object.keys(counts)) {
    const result = generateStoreStock(catalog, { profileId, settlement: 'city', size: 'small', seed: `variety-${i}` });
    expect(result.success).toBe(true);
    for (const entry of result.entries) {
      const count = counts[profileId]; count.total++;
      if (entry.itemData.type === 'weapon') count.weapon++;
      else if (entry.itemData.type === 'armor') count.armor++;
      else count.supplies++;
    }
  }
  expect(counts.general.supplies / counts.general.total).toBeGreaterThan(0.65);
  expect(counts.weaponsmith.weapon / counts.weaponsmith.total).toBeGreaterThan(0.7);
  expect(counts.armorer.armor / counts.armorer.total).toBeGreaterThan(0.65);
  expect((counts.blacksmith.weapon + counts.blacksmith.armor) / counts.blacksmith.total).toBeGreaterThan(0.7);
});
it('makes common equipment more likely, specializes blacksmith tools, and expands breadth and depth with size', () => {
  const spear = item('Spear', 'weapon', 3), exotic = item('Khopesh', 'weapon', 60);
  expect(itemStockWeight(spear, { profileId: 'general' })).toBeGreaterThan(itemStockWeight(exotic, { profileId: 'general' }));
  expect(itemStockWeight(item('Shield', 'armor', 10), { profileId: 'general' })).toBeGreaterThan(itemStockWeight(item('Plate', 'armor', 600), { profileId: 'general' }));
  expect(itemStockWeight(item('Hammer'), { profileId: 'blacksmith' })).toBeGreaterThan(itemStockWeight(item('Rope'), { profileId: 'blacksmith' }));
  const catalog = Array.from({ length: 60 }, (_, i) => item(`Supply ${i}`));
  let smallCount = 0, largeCount = 0, smallQty = 0, largeQty = 0;
  for (let i = 0; i < 50; i++) for (const size of ['small', 'large']) {
    const result = generateStoreStock(catalog, { settlement: 'city', size, seed: `size-${i}`, unavailableChance: 0 });
    const qty = result.entries.reduce((sum, entry) => sum + entry.stock, 0);
    if (size === 'small') { smallCount += result.entries.length; smallQty += qty; }
    else { largeCount += result.entries.length; largeQty += qty; }
  }
  expect(largeCount).toBeGreaterThan(smallCount * 2);
  expect(largeQty / largeCount).toBeGreaterThan(smallQty / smallCount * 2);
});
