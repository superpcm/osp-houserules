import { eligibleStoreItem, entryFromItem } from './store.js';
import { isUniqueStackItem } from './stack-identity.js';
import { profileEnvironmentDefaults, validateProfileEnvironment, profileRarityOverride } from './store-profile-rules.js';
import { resolveStockingMetadata } from './catalog-stocking.js';
import { isArrowAmmo, ARROW_BUNDLE_LIMIT } from './arrow-bundle.js';
import { isSaleBundle, saleBundleQuantity } from './sale-bundle.js';

/** Categories shared by the store picker and stock profiles. */
export function category(itemType) {
  return ({
    weapon: 'Weapons',
    armor: 'Armor',
    ammunition: 'Ammunition',
    container: 'Containers',
    clothing: 'Clothing',
    item: 'Gear',
  })[itemType] ?? 'Gear';
}

export const SETTLEMENTS = [
  { id: 'village', label: 'Village', availability: 0.58, maxBasePriceSp: 100, pricePercent: [85, 125] },
  { id: 'town', label: 'Town', availability: 0.78, maxBasePriceSp: 1000, pricePercent: [75, 115] },
  { id: 'city', label: 'City', availability: 1, maxBasePriceSp: Infinity, pricePercent: [65, 105] },
];

export const STORE_SIZES = [
  { id: 'small', label: 'Small', count: [20, 35], stock: [1, 8] },
  { id: 'medium', label: 'Medium', count: [40, 70], stock: [2, 20] },
  { id: 'large', label: 'Large', count: [80, 120], stock: [4, 60] },
];

export const STOCK_PROFILES = [
  { id: 'general', label: 'General Store', categories: ['Gear', 'Weapons', 'Armor', 'Ammunition', 'Containers', 'Clothing'], weights: { Gear: 3, Containers: 2, Clothing: 1.4, Ammunition: 1.2, Weapons: 0.7, Armor: 0.35 }, availability: 1 },
  { id: 'outfitter', label: 'Outfitter', categories: ['Gear', 'Containers', 'Clothing', 'Ammunition'], weights: { Gear: 1.8, Containers: 3.2, Clothing: 3, Ammunition: 1 }, availability: 1.12 },
  { id: 'weaponsmith', label: 'Weaponsmith', categories: ['Weapons', 'Ammunition', 'Armor'], weights: { Weapons: 4.5, Ammunition: 1.8, Armor: 0.35 }, availability: 1.2 },
  { id: 'blacksmith', label: 'Blacksmith', categories: ['Gear', 'Weapons', 'Armor', 'Containers'], weights: { Gear: 0.7, Weapons: 3.4, Armor: 2.6, Containers: 0.8 }, availability: 1.08 },
  { id: 'armorer', label: 'Armorer', categories: ['Armor', 'Weapons'], weights: { Armor: 4.5, Weapons: 1.1 }, availability: 1.08 },
  { id: 'apothecary', label: 'Apothecary', categories: ['Gear'], weights: { Gear: 2.2 }, availability: 0.9 },
];

const clone = value => structuredClone(value);
const byId = (list, id, fallback) => list.find(value => value.id === id) ?? fallback;
const integer = value => Number.isSafeInteger(Number(value)) ? Number(value) : null;
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const providedFinite = (options, key) => options[key] == null ? null : finite(options[key]);

/** Editable defaults shown by the creator when a profile/location changes. */
export function profileDefaults({ profileId = 'general', settlement = 'town', size = 'medium', ...environment } = {}) {
  const profile = byId(STOCK_PROFILES, profileId, STOCK_PROFILES[0]);
  const place = byId(SETTLEMENTS, settlement, SETTLEMENTS[1]);
  const storeSize = byId(STORE_SIZES, size, STORE_SIZES[1]);
  return {
    profileId: profile.id,
    settlement: place.id,
    size: storeSize.id,
    minProducts: storeSize.count[0],
    maxProducts: storeSize.count[1],
    minStock: storeSize.stock[0],
    maxStock: storeSize.stock[1],
    minPricePercent: place.pricePercent[0],
    maxPricePercent: place.pricePercent[1],
    unavailableChance: Math.max(0, Math.round((1 - place.availability * profile.availability) * 35)),
    minPriceSp: null,
    maxPriceSp: null,
    maxBasePriceSp: place.maxBasePriceSp,
    roundingCp: 1,
    ...profileEnvironmentDefaults(environment),
  };
}

function guardrails(options = {}, { prices = false } = {}) {
  const minStock = integer(options.minStock ?? 1);
  const maxStock = integer(options.maxStock ?? 20);
  const minPricePercent = finite(options.minPricePercent ?? 80);
  const maxPricePercent = finite(options.maxPricePercent ?? 120);
  const minPriceSp = providedFinite(options, 'minPriceSp');
  const maxPriceSp = providedFinite(options, 'maxPriceSp');
  const roundingCp = integer(options.roundingCp ?? 1);
  if (minStock == null || maxStock == null || minStock < 0 || maxStock < 0 || minStock > 10000 || maxStock > 10000 || minStock > maxStock) return { success: false, reason: 'Stock minimum and maximum must be whole numbers from 0 to 10,000.' };
  if (!Number.isInteger(options.unavailableChance == null ? 0 : Number(options.unavailableChance)) || Number(options.unavailableChance) < 0 || Number(options.unavailableChance) > 100) return { success: false, reason: 'Unavailable chance must be a whole-number percentage from 0 to 100.' };
  if (prices && (minPricePercent == null || maxPricePercent == null || minPricePercent < 0 || maxPricePercent < 0 || minPricePercent > 1000 || maxPricePercent > 1000 || minPricePercent > maxPricePercent)) return { success: false, reason: 'Price percentages must be between 0 and 1,000, with minimum no greater than maximum.' };
  if (prices && ((options.minPriceSp != null && minPriceSp == null) || (options.maxPriceSp != null && maxPriceSp == null))) return { success: false, reason: 'Price caps must be finite nonnegative numbers.' };
  if (prices && (minPriceSp != null && (minPriceSp < 0) || maxPriceSp != null && (maxPriceSp < 0) || minPriceSp != null && maxPriceSp != null && minPriceSp > maxPriceSp)) return { success: false, reason: 'Price caps must be nonnegative, with minimum no greater than maximum.' };
  if (prices && (roundingCp == null || roundingCp < 1)) return { success: false, reason: 'Price rounding must be a whole number of copper pieces of at least 1.' };
  if (prices && minPriceSp != null && maxPriceSp != null && Math.ceil(minPriceSp * 10 / roundingCp) > Math.floor(maxPriceSp * 10 / roundingCp)) return { success: false, reason: 'Price caps cannot contain a value at the selected copper rounding.' };
  return { success: true, minStock, maxStock, unavailableChance: Number(options.unavailableChance ?? 0), minPricePercent, maxPricePercent, minPriceSp, maxPriceSp, roundingCp, includeUnlimited: options.includeUnlimited !== false, preserveLimited: options.preserveLimited !== false, preserveCustomPrices: options.preserveCustomPrices !== false };
}

function random(seed) {
  let state = typeof seed === 'string' ? 2166136261 : (Number(seed) || 1) >>> 0;
  if (typeof seed === 'string') for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
function stableId(entry, index) { return String(entry.id ?? entry.sourceUuid ?? entry.itemData?.name ?? `entry-${index}`).replace(/[^a-zA-Z0-9_-]/g, '-'); }
function randomInt(rng, min, max) { return min + Math.floor(rng() * (max - min + 1)); }
function eligibleProfileItem(item, profile, allowMagic, catalog, options = {}) {
  if (!eligibleStoreItem(item)) return false;
  if (!allowMagic) {
    const tags = item.system?.tags ?? [];
    if (isUniqueStackItem(item) || item.system?.magic || Number(item.system?.bonus) || /(?:^|\s)[+−-]\d+\b/.test(item.name ?? '') || tags.some(tag => /magic|magical|unique/i.test(String(tag))) || /\b(wand|scroll|magic|magical)\b/i.test(item.name ?? '')) return false;
  }
  const metadata = resolveStockingMetadata(item, catalog);
  const override = profileRarityOverride(options, item?.uuid);
  if (override) metadata.availability = override;
  if (!metadata.availability) return false;
  if (profile.id === 'blacksmith' && metadata.blacksmithEligible !== true) return false;
  if (profile.id === 'apothecary') {
    const tags = item.system?.tags ?? [];
    return profile.categories.includes(category(item.type)) && (tags.some(tag => /heal|potion|herb|medicine|consum/i.test(String(tag))) || /potion|herb|antidote|medicine|healing/i.test(item.name ?? ''));
  }
  return profile.categories.includes(category(item.type));
}
function eligibleOrdinaryItem(item, allowMagic) {
  if (!eligibleStoreItem(item)) return false;
  if (allowMagic) return true;
  const tags = item.system?.tags ?? [];
  return !(isUniqueStackItem(item) || item.system?.magic || Number(item.system?.bonus) || /(?:^|\s)[+−-]\d+\b/.test(item.name ?? '') || tags.some(tag => /magic|magical|unique/i.test(String(tag))) || /\b(wand|scroll|magic|magical)\b/i.test(item.name ?? ''));
}

function rarityOf(item, options = {}) {
  const uuid = item?.uuid ?? item?.id;
  if (uuid && profileRarityOverride(options, uuid)) return profileRarityOverride(options, uuid);
  return resolveStockingMetadata(item, options.catalog).availability;
}
const rarityWeight = { common: 2, uncommon: 1, rare: 0.35, exceptional: 0.1 };
const economyAffinity = { farming: { Gear: 1.3, Clothing: 1.3, Weapons: 0.7, Armor: 0.6 }, mining: { Armor: 1.35, Weapons: 1.3, Containers: 1.2 }, hunting: { Weapons: 1.4, Ammunition: 1.5, Clothing: 1.15 }, trade: { Gear: 1.2, Containers: 1.2 }, frontier: { Weapons: 1.35, Ammunition: 1.3, Armor: 1.15 }, mixed: {} };
const demandAffinity = { adventuring: { Weapons: 1.35, Ammunition: 1.45, Containers: 1.2, Gear: 1.15 }, military: { Weapons: 1.5, Armor: 1.45, Ammunition: 1.4 }, civilian: { Gear: 1.25, Clothing: 1.35, Containers: 1.2 }, normal: {} };
const eventAffinity = { war: { Weapons: 1.6, Armor: 1.5, Ammunition: 1.55 }, shortage: { Gear: 0.55, Ammunition: 0.55, Clothing: 0.7 }, festival: { Clothing: 1.5, Gear: 1.35 }, trade_disruption: { Containers: 0.7, Gear: 0.7 }, none: {} };
const wealthFactor = { poor: { low: 1.5, high: 0.45 }, comfortable: { low: 1, high: 1 }, wealthy: { low: 0.7, high: 1.5 } };
const supplyFactor = { disrupted: { weight: 0.62, stock: 0.55 }, unreliable: { weight: 0.82, stock: 0.78 }, reliable: { weight: 1, stock: 1 }, abundant: { weight: 1.2, stock: 1.3 } };
function itemStockWeight(item, options = {}, profile = null) {
  profile ??= byId(STOCK_PROFILES, options.profileId, STOCK_PROFILES[0]);
  const type = category(item.type);
  const base = profile?.weights?.[type] ?? (profile?.categories?.includes(type) ? 1 : 0);
  if (!base) return 0;
  const cost = Math.max(0, finite(item.system?.cost) ?? 0);
  const economy = economyAffinity[options.economy ?? 'mixed']?.[type] ?? 1;
  const demand = demandAffinity[options.demand ?? 'normal']?.[type] ?? 1;
  const event = eventAffinity[options.event ?? 'none']?.[type] ?? 1;
  const wealth = wealthFactor[options.wealth ?? 'comfortable'] ?? wealthFactor.comfortable;
  const costFactor = cost <= 100 ? wealth.low : wealth.high;
  const text = `${item.name ?? ''} ${(item.system?.tags ?? []).join(' ')}`.toLowerCase();
  const affinity = options.economy === 'mining' && /pick|shovel|hammer|anvil|ore/.test(text) ? 1.8 : options.economy === 'hunting' && /bow|arrow|trap|snare|quiver/.test(text) ? 1.8 : options.economy === 'farming' && /hoe|seed|sickle|plow/.test(text) ? 1.8 : 1;
  const weaponCommonness = category(item.type) === 'Weapons' ? (/\b(sword|bow|spear|dagger|club|handaxe|axe|mace)\b/.test(text) ? 1.35 : /\b(plate|great|exotic|rapier|halberd)\b/.test(text) ? 0.45 : 0.8) : 1;
  const rarity = rarityOf(item, options);
  const sizeFactor = options.size === 'large' ? ({ common: 1, uncommon: 1.2, rare: 1.6, exceptional: 2 }[rarity]) : options.size === 'small' ? ({ common: 1.2, uncommon: 0.7, rare: 0.35, exceptional: 0.15 }[rarity]) : ({ exceptional: 1 }[rarity] ?? 1);
  const smithAffinity = profile.id !== 'blacksmith' ? 1 : type === 'Gear' ? (/pick|shovel|hammer|anvil|tongs|nail|chain|manacle|iron|steel|tool/.test(text) ? 4 : 0.2) : /bow|club|leather|padded/.test(text) ? 0.25 : 1.2;
  const everydayEquipment = profile.id === 'general' && ['Weapons', 'Armor'].includes(type) ? 1 / (1 + cost / 75) : 1;
  if (!rarity || !rarityWeight[rarity]) return 0;
  return Math.max(0.0001, base * economy * demand * event * affinity * smithAffinity * everydayEquipment * weaponCommonness * costFactor * rarityWeight[rarity] * sizeFactor);
}
function weightedSample(items, count, rng, options, profile) {
  const available = [...items]; const chosen = [];
  while (available.length && chosen.length < count) {
    const bucketCounts = available.reduce((counts, item) => counts.set(category(item.type), (counts.get(category(item.type)) ?? 0) + 1), new Map());
    const weighted = available.map(item => ({ item, weight: itemStockWeight(item, options, profile) / (bucketCounts.get(category(item.type)) || 1) })).filter(value => value.weight > 0);
    const total = weighted.reduce((sum, value) => sum + value.weight, 0);
    if (!total) break;
    let pick = rng() * total;
    const selected = weighted.find(value => (pick -= value.weight) < 0) ?? weighted.at(-1);
    chosen.push(selected.item);
    available.splice(available.indexOf(selected.item), 1);
  }
  return chosen;
}
function stockRange(options, rng, forcePositive = false) {
  const supply = supplyFactor[options.supply ?? 'reliable']?.stock ?? 1;
  const demand = ({ adventuring: 1.1, military: 1.15, civilian: 0.95, normal: 1 }[options.demand ?? 'normal'] ?? 1) * (options.event === 'war' ? 1.2 : options.event === 'shortage' ? 0.65 : options.event === 'festival' ? 1.1 : 1);
  const min = Number(options.minStock); const max = Number(options.maxStock);
  let value = Math.round(randomInt(rng, min, max) * supply * demand);
  value = Math.min(max, Math.max(min, value));
  return forcePositive ? Math.max(1, value) : value;
}

function randomizeStockEntries(entries, options, rng) {
  return entries.map((raw, index) => {
    const entry = clone(raw);
    const keep = options.preserveLimited !== false && entry.stock != null;
    if (!keep && (entry.stock != null || options.includeUnlimited !== false)) {
      entry.stock = rng() * 100 < options.unavailableChance ? 0 : randomInt(rng, options.minStock, options.maxStock);
    }
    return { ...entry, id: raw.id ?? stableId(raw, index) };
  });
}

function randomizePricesEntries(entries, options, rng) {
  return entries.map((raw, index) => {
    const entry = clone(raw);
    if (options.preserveCustomPrices !== false && entry.customPrice != null) return entry;
    const baseSp = Math.max(0, finite(entry.itemData?.system?.cost) ?? 0) * (isSaleBundle(entry.itemData) ? saleBundleQuantity(entry.itemData) : 1);
    let cp = Math.round(baseSp * 10 * (randomInt(rng, options.minPricePercent, options.maxPricePercent) / 100));
    if (options.minPriceSp != null) cp = Math.max(cp, Math.round(options.minPriceSp * 10));
    const minCp = options.minPriceSp == null ? 0 : Math.ceil(options.minPriceSp * 10 / options.roundingCp) * options.roundingCp;
    const maxCp = options.maxPriceSp == null ? Number.MAX_SAFE_INTEGER - (Number.MAX_SAFE_INTEGER % options.roundingCp) : Math.floor(options.maxPriceSp * 10 / options.roundingCp) * options.roundingCp;
    cp = Math.round(cp / options.roundingCp) * options.roundingCp;
    cp = Math.min(maxCp, Math.max(minCp, cp));
    entry.customPrice = cp / 10;
    return { ...entry, id: raw.id ?? stableId(raw, index) };
  });
}

export function randomizeStoreStock(entries = [], options = {}) {
  const valid = guardrails(options);
  if (!valid.success) return valid;
  if (!Array.isArray(entries)) return { success: false, reason: 'Store entries must be an array.' };
  const rng = random(options.seed ?? 1);
  return { success: true, entries: randomizeStockEntries(entries, valid, rng), settings: { ...valid } };
}

export function randomizeStorePrices(entries = [], options = {}) {
  const valid = guardrails(options, { prices: true });
  if (!valid.success) return valid;
  if (!Array.isArray(entries)) return { success: false, reason: 'Store entries must be an array.' };
  const rng = random(options.seed ?? 1);
  return { success: true, entries: randomizePricesEntries(entries, valid, rng), settings: { ...valid } };
}

export function generateStoreStock(catalog = [], options = {}) {
  if (!Array.isArray(catalog)) return { success: false, reason: 'Store catalog must be an array.' };
  const inputError = validateProfileEnvironment(options);
  if (inputError) return { success: false, reason: inputError };
  const profile = byId(options.profiles ?? STOCK_PROFILES, options.profileId, STOCK_PROFILES[0]);
  const settlement = byId(SETTLEMENTS, options.settlement, SETTLEMENTS[1]);
  const size = byId(STORE_SIZES, options.size, STORE_SIZES[1]);
  if (!profile || !settlement || !size) return { success: false, reason: 'Choose a valid stock profile, settlement, and store size.' };
  const defaults = profileDefaults({ profileId: profile.id, settlement: settlement.id, size: size.id });
  const settings = { ...defaults, ...options };
  const environmentError = validateProfileEnvironment(settings);
  if (environmentError) return { success: false, reason: environmentError };
  const valid = guardrails(settings, { prices: true });
  if (!valid.success) return valid;
  const minProducts = integer(settings.minProducts);
  const maxProducts = integer(settings.maxProducts);
  if (minProducts == null || maxProducts == null || minProducts < 1 || maxProducts < 1 || minProducts > 200 || maxProducts > 200 || minProducts > maxProducts) return { success: false, reason: 'Product minimum and maximum must be whole numbers from 1 to 200.' };
  const rng = random(settings.seed ?? 1);
  const requestedProducts = randomInt(rng, minProducts, maxProducts);
  const maxBasePriceSp = settings.maxBasePriceSp == null ? settlement.maxBasePriceSp : settings.maxBasePriceSp;
  const never = new Set(settings.neverStock ?? []);
  const alwaysIds = [...new Set(settings.alwaysStock ?? [])];
  const uniqueCatalog = [...new Map(catalog.map(item => [item.uuid ?? item.id, item]).filter(([id]) => id)).values()];
  const catalogForResolution = options.catalog ?? uniqueCatalog;
  const byUuid = new Map(uniqueCatalog.flatMap(item => [[item.uuid, item], [item.id, item]]).filter(([id]) => id));
  const alwaysItems = [];
  for (const uuid of alwaysIds) {
    const item = byUuid.get(uuid);
    if (!item || !eligibleOrdinaryItem(item, options.allowMagic === true)) return { success: false, reason: `Always-stocked item ${uuid} is missing or is not eligible ordinary equipment.` };
    if (!alwaysItems.includes(item)) alwaysItems.push(item);
  }
  if (alwaysItems.length > maxProducts) return { success: false, reason: 'Always-stocked products exceed the store maximum product count.' };
  if (alwaysItems.length && valid.maxStock < 1) return { success: false, reason: 'Always-stocked items require a maximum stock of at least 1.' };
  const unclassifiedProducts = uniqueCatalog.filter(item => !never.has(item.uuid) && !never.has(item.id) && !alwaysItems.includes(item) && eligibleOrdinaryItem(item, options.allowMagic === true) && !profileRarityOverride(settings, item?.uuid) && !resolveStockingMetadata(item, catalogForResolution).availability).length;
  const pool = uniqueCatalog.filter(item => !never.has(item.uuid) && !never.has(item.id) && !alwaysItems.includes(item) && (maxBasePriceSp === Infinity || finite(item.system?.cost) <= maxBasePriceSp) && eligibleProfileItem(item, profile, options.allowMagic === true, catalogForResolution, settings));
  const count = Math.min(pool.length, Math.max(0, requestedProducts - alwaysItems.length));
  const shuffled = weightedSample(pool, count, rng, settings, profile);
  const selected = [...alwaysItems, ...shuffled];
  const entries = selected.map((item, index) => {
    const raw = entryFromItem(item);
    return { ...raw, id: `profile-${settings.seed ?? 1}-${index}-${String(item.id ?? item.name).replace(/[^a-zA-Z0-9_-]/g, '-')}` };
  });
  const stocked = entries.map((entry, index) => {
    const always = index < alwaysItems.length;
    const unavailable = !always && rng() * 100 < valid.unavailableChance;
    return { ...entry, stock: unavailable ? 0 : stockRange({ ...settings, ...valid }, rng, always) };
  });
  const priced = stocked.map(entry => {
    const type = category(entry.itemData.type);
    const text = `${entry.itemData.name ?? ''} ${(entry.itemData.system?.tags ?? []).join(' ')}`.toLowerCase();
    const localSpecialty = settings.economy === 'mining' && /pick|shovel|hammer|anvil|ore/.test(text) || settings.economy === 'hunting' && /bow|arrow|trap|snare|quiver/.test(text) || settings.economy === 'farming' && /hoe|seed|sickle|plow/.test(text);
    const economyDiscount = localSpecialty ? 0.9 : 1 - Math.max(0, (economyAffinity[settings.economy]?.[type] ?? 1) - 1) * 0.15;
    const demandPremium = 1 + ((demandAffinity[settings.demand]?.[type] ?? 1) - 1) * 0.3;
    const supplyPremium = { disrupted: 1.15, unreliable: 1.07, reliable: 1, abundant: 0.9 }[settings.supply];
    const priceShift = economyDiscount * demandPremium * supplyPremium * (settings.wealth === 'wealthy' ? 1.08 : settings.wealth === 'poor' ? 0.94 : 1) * (settings.event === 'war' ? 1.1 : settings.event === 'shortage' ? 1.16 : settings.event === 'trade_disruption' ? 1.1 : settings.event === 'festival' ? 1.04 : 1);
    const bound = value => Math.max(valid.minPricePercent, Math.min(valid.maxPricePercent, Math.round(value)));
    const priceOptions = { ...valid, minPricePercent: bound(valid.minPricePercent * priceShift), maxPricePercent: bound(valid.maxPricePercent * priceShift), preserveCustomPrices: false };
    return randomizePricesEntries([entry], priceOptions, rng)[0];
  });
  return { success: true, entries: priced, requestedProducts, eligibleProducts: pool.length + alwaysItems.length, unclassifiedProducts, generatedProducts: priced.length, settings: { ...settings, profileId: profile.id, settlement: settlement.id, size: size.id, ...valid } };
}

export { itemStockWeight };

