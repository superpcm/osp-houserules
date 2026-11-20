/** Stable and livestock stock generation. Pure module: no Foundry globals. */
import bundledLivestock from '../../../data/livestock.json';
import bundledTack from '../../../data/tack.json';
import bundledVehicles from '../../../data/vehicles.json';
import bundledMisc from '../../../data/misc.json';
import { isUniqueStackItem } from './stack-identity.js';

export const STABLE_PROFILES = Object.freeze([
  { id: 'livery', label: 'Livery Stable' },
  { id: 'livestock', label: 'Livestock Dealer' },
  { id: 'breeder', label: 'Horse Breeder' },
  { id: 'saddler', label: 'Saddler & Tack Shop' },
  { id: 'wainwright', label: 'Wainwright' },
  { id: 'combined', label: 'Stable & Outfitters' },
]);
export const SETTLEMENTS = Object.freeze(['village', 'town', 'city']);
export const STABLE_SIZES = Object.freeze(['small', 'medium', 'large']);
export const AVAILABILITIES = Object.freeze(['common', 'uncommon', 'rare', 'exceptional']);
const clone = value => structuredClone(value);
const integer = value => Number.isSafeInteger(Number(value)) ? Number(value) : null;
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const normalize = value => String(value ?? '').trim().toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const key = item => `${normalize(item?.name)}|${normalize(item?.type)}`;
const rngFor = seed => { let state = typeof seed === 'string' ? 2166136261 : (Number(seed) || 1) >>> 0; if (typeof seed === 'string') for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0; return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; }; };
const randomInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const shuffle = (items, rng) => { const result = [...items]; for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; };

const sizeDefaults = { small: { products: [4, 7], quantity: [1, 4] }, medium: { products: [8, 12], quantity: [2, 8] }, large: { products: [12, 20], quantity: [4, 16] } };
const animalAvailability = Object.freeze({
  chicken: 'common', 'dog guard': 'common', 'dog hunting': 'common', donkey: 'common', goat: 'common', 'hawk trained': 'uncommon', pig: 'common', sheep: 'common', ox: 'common', 'horse draft': 'uncommon', 'draft horse': 'uncommon', mule: 'uncommon', pony: 'uncommon', 'horse riding': 'uncommon', 'riding horse': 'uncommon', 'horse war': 'rare', 'war horse': 'rare',
});
const bundledDefaults = [...bundledLivestock.map(item => ({ ...item, system: { ...item.system, storeAvailability: animalAvailability[normalize(item.name)] ?? null } })), ...bundledTack, ...bundledVehicles, ...bundledMisc.filter(item => item.system?.tags?.includes('tack') || item.system?.tags?.includes('vehicle-parts'))];
const profileAllows = (profile, item) => {
  const name = normalize(item?.name); const tags = new Set((item?.system?.tags ?? []).map(normalize));
  const animal = item?.type === 'livestock';
  const vehicle = item?.type === 'container' && tags.has('vehicle');
  const parts = tags.has('vehicle parts');
  const tack = ['item', 'container', 'tack'].includes(item?.type) && tags.has('tack') && !vehicle;
  const horse = animal && (['horse draft', 'horse riding', 'horse war', 'war horse', 'draft horse', 'riding horse', 'pony'].includes(name) || tags.has('horse'));
  const working = horse || animal && (['donkey', 'mule'].includes(name) || tags.has('rideable') || tags.has('pack animal'));
  const profileRules = {
    livery: working || tack || vehicle,
    livestock: animal && !['hawk trained', 'horse war', 'war horse'].includes(name),
    breeder: horse,
    saddler: tack,
    wainwright: vehicle || parts || tack && (['harness draft', 'yoke'].includes(name) || item.system?.tackSlot === 'harness'),
    combined: animal || tack || vehicle || parts,
  };
  return profileRules[profile] === true;
};
const metadataFor = (item, catalog = bundledDefaults) => {
  const direct = item?.system ?? {};
  if (direct.storeAvailability != null && !AVAILABILITIES.includes(String(direct.storeAvailability).toLowerCase())) return { availability: null, blacksmithEligible: null };
  let availability = AVAILABILITIES.includes(String(direct.storeAvailability ?? '').toLowerCase()) ? String(direct.storeAvailability).toLowerCase() : null;
  let blacksmith = typeof direct.blacksmithEligible === 'boolean' ? direct.blacksmithEligible : null;
  if (!availability || blacksmith == null) {
    const matches = (Array.isArray(catalog) ? catalog : bundledDefaults).filter(candidate => key(candidate) === key(item));
    if (matches.length === 1) {
      const system = matches[0].system ?? {};
      availability ??= AVAILABILITIES.includes(String(system.storeAvailability ?? '').toLowerCase()) ? String(system.storeAvailability).toLowerCase() : null;
      blacksmith ??= typeof system.blacksmithEligible === 'boolean' ? system.blacksmithEligible : null;
    }
  }
  return { availability, blacksmithEligible: blacksmith };
};
const availabilityWeight = { common: 2, uncommon: 1, rare: 0.35, exceptional: 0.1 };
const sizeExceptional = { small: 0.15, medium: 1, large: 2 };
const availabilitySize = { common: 1, uncommon: 1, rare: 1, exceptional: 1 };
const sourceId = item => item?.uuid ?? item?.id ?? null;
const safeStockItem = item => {
  const type = String(item?.type ?? '').toLowerCase(); const tags = (item?.system?.tags ?? []).map(normalize);
  if (['coin', 'treasure'].includes(type) || item?.system?.treasure || item?.system?.magic || item?.system?.isMagic || Number(item?.system?.bonus) || isUniqueStackItem(item) || tags.some(tag => ['magic', 'magical', 'unique'].includes(tag))) return false;
  if (!Number.isFinite(Number(item?.system?.cost)) || Number(item.system.cost) < 0) return false;
  return type === 'livestock' || ['item', 'container', 'tack'].includes(type) && (tags.includes('tack') || tags.includes('vehicle') || tags.includes('vehicle parts'));
};
const weightedChoice = (items, rng, settings) => {
  const settlementAvailability = { village: { common: 1.2, uncommon: 0.8, rare: 0.4, exceptional: 0.15 }, town: { common: 1, uncommon: 1, rare: 1, exceptional: 1 }, city: { common: 0.9, uncommon: 1.2, rare: 1.5, exceptional: 2 } }[settings.settlement] ?? {};
  const weighted = items.map(item => { const metadata = metadataFor(item); const rarity = settings.availabilityOverrides?.[sourceId(item)] ?? settings.availabilityOverrides?.[encodeURIComponent(sourceId(item) ?? '')] ?? metadata.availability; const size = rarity === 'exceptional' ? sizeExceptional[settings.size] : availabilitySize[rarity] ?? 0; return { item, weight: (availabilityWeight[rarity] ?? 0) * size * (settlementAvailability[rarity] ?? 1) }; }).filter(value => value.weight > 0);
  const total = weighted.reduce((sum, value) => sum + value.weight, 0); if (!total) return null; let pick = rng() * total; return weighted.find(value => (pick -= value.weight) < 0)?.item ?? weighted.at(-1)?.item;
};
const cleanItem = item => { const data = item?.toObject ? item.toObject() : item; if (!data) return null; return { name: data.name, type: data.type, img: data.img, system: { ...(data.system ?? {}), quantity: 1, equipped: false, containerId: null, lashed: false }, flags: data.flags }; };
const entryFromItem = (item, index, settings, rng) => { const itemData = cleanItem(item); const base = Math.max(0, finite(itemData?.system?.cost) ?? 0); const percent = randomInt(rng, settings.minPricePercent, settings.maxPricePercent); return { id: `stable-${settings.seed ?? 1}-${index}-${String(item.id ?? item.name).replace(/[^a-z0-9_-]/gi, '-')}`, sourceUuid: sourceId(item), itemData, customPrice: Math.round(base * percent / 10) / 10, stock: randomInt(rng, settings.minQuantity, settings.maxQuantity), hidden: false, managed: true, customStock: false, individual: false, generatedPrice: true }; };

export function normalizeStableProfile(options = {}) {
  const size = STABLE_SIZES.includes(options.size) ? options.size : 'medium';
  const bounds = sizeDefaults[size];
  return { profileId: STABLE_PROFILES.some(profile => profile.id === options.profileId) ? options.profileId : 'livery', settlement: SETTLEMENTS.includes(options.settlement) ? options.settlement : 'town', size, minProducts: options.minProducts ?? bounds.products[0], maxProducts: options.maxProducts ?? bounds.products[1], minQuantity: options.minQuantity ?? bounds.quantity[0], maxQuantity: options.maxQuantity ?? bounds.quantity[1], minPricePercent: options.minPricePercent ?? 80, maxPricePercent: options.maxPricePercent ?? 120, preserveManual: options.preserveManual !== false, enabled: options.enabled === true, intervalDays: options.intervalDays ?? 7, lastRestockedWorldTime: options.lastRestockedWorldTime ?? null, randomizePrices: options.randomizePrices === true, seed: options.seed ?? 1, neverStock: Array.isArray(options.neverStock) ? [...new Set(options.neverStock)] : [], alwaysStock: Array.isArray(options.alwaysStock) ? [...new Set(options.alwaysStock)] : [], availabilityOverrides: options.availabilityOverrides ?? options.rarityOverrides ?? {} };
}
export function validateStableProfile(options = {}) { const s = normalizeStableProfile(options); if (options.profileId != null && !STABLE_PROFILES.some(p => p.id === options.profileId)) return 'Choose a valid stable profile.'; if (options.settlement != null && !SETTLEMENTS.includes(options.settlement) || options.size != null && !STABLE_SIZES.includes(options.size)) return 'Choose a valid settlement and stable size.'; if (![s.minProducts, s.maxProducts].every(Number.isInteger) || s.minProducts < 1 || s.maxProducts < s.minProducts || s.maxProducts > 200) return 'Product bounds must be whole numbers from 1 to 200.'; if (![s.minQuantity, s.maxQuantity].every(Number.isInteger) || s.minQuantity < 1 || s.maxQuantity < s.minQuantity || s.maxQuantity > 10000) return 'Quantity bounds must be whole numbers from 1 to 10,000.'; if (![s.minPricePercent, s.maxPricePercent].every(Number.isInteger) || s.minPricePercent < 0 || s.maxPricePercent < s.minPricePercent || s.maxPricePercent > 1000) return 'Price percentages must be whole numbers between 0 and 1,000.'; if (!Number.isInteger(s.intervalDays) || s.intervalDays < 1 || s.intervalDays > 365) return 'Restock interval must be a whole number from 1 to 365 days.'; if (Object.values(s.availabilityOverrides).some(value => !AVAILABILITIES.includes(String(value)))) return 'Availability overrides must be common, uncommon, rare, or exceptional.'; return null; }

export function eligibleStableProfileItem(item, options = {}) {
  const settings = normalizeStableProfile(options); const references = [sourceId(item), item?.id].filter(Boolean);
  if (!safeStockItem(item) || references.some(reference => settings.neverStock.includes(reference))) return false;
  if (references.some(reference => settings.alwaysStock.includes(reference))) return true;
  const availability = settings.availabilityOverrides[sourceId(item)] ?? settings.availabilityOverrides[encodeURIComponent(sourceId(item))] ?? metadataFor(item).availability;
  return Boolean(AVAILABILITIES.includes(availability) && profileAllows(settings.profileId, item));
}

export function generateStableStock(catalog = [], options = {}, existingEntries = []) {
  if (!Array.isArray(catalog)) return { success: false, reason: 'Stable catalog must be an array.' };
  const error = validateStableProfile(options); if (error) return { success: false, reason: error }; const settings = normalizeStableProfile(options);
  const rng = rngFor(settings.seed); const profile = settings.profileId; const allCatalog = catalog; const unique = [...new Map(catalog.map((item, index) => [sourceId(item) ?? `${key(item)}:${index}`, item]).filter(([k]) => k && k !== ' | ')).values()]; const bySource = new Map(unique.flatMap(item => [[sourceId(item), item], [item.id, item]]).filter(([id]) => id));
  const never = new Set(settings.neverStock); const excluded = item => never.has(sourceId(item)) || never.has(item.id); const always = []; for (const id of settings.alwaysStock) { const item = bySource.get(id); if (!item) return { success: false, reason: `Always-stocked item ${id} is missing.` }; if (excluded(item)) continue; if (!safeStockItem(item)) return { success: false, reason: `Always-stocked item ${id} is not safe stable stock.` }; if (!always.includes(item)) always.push(item); }
  if (always.length > settings.maxProducts) return { success: false, reason: 'Always-stocked products exceed the stable maximum product count.' };
  const protectedEntries = (Array.isArray(existingEntries) ? existingEntries : []).filter(entry => entry && (entry.individual === true || settings.preserveManual && (entry.managed !== true || entry.customStock === true || entry.manual === true)));
  const protectedSources = new Set(protectedEntries.map(entry => entry.sourceUuid).filter(Boolean));
  const eligible = unique.filter(item => { const id = sourceId(item); if (!id || excluded(item) || protectedSources.has(id) || always.includes(item) || !safeStockItem(item)) return false; const metadata = metadataFor(item); const override = settings.availabilityOverrides?.[id] ?? settings.availabilityOverrides?.[encodeURIComponent(id)]; if (override) metadata.availability = String(override); return Boolean(metadata.availability && profileAllows(profile, item)); });
  const unclassifiedCount = unique.filter(item => safeStockItem(item) && profileAllows(profile, item) && !excluded(item) && !always.includes(item) && !settings.availabilityOverrides?.[sourceId(item)] && !settings.availabilityOverrides?.[encodeURIComponent(sourceId(item))] && !metadataFor(item).availability).length;
  const requested = Math.max(always.length, randomInt(rng, settings.minProducts, settings.maxProducts)); const pool = eligible.filter(item => !always.includes(item)); const selected = always.filter(item => !protectedSources.has(sourceId(item))); while (pool.length && selected.length < requested) { const choice = weightedChoice(pool, rng, settings); if (!choice) break; selected.push(choice); pool.splice(pool.indexOf(choice), 1); }
  const generated = selected.map((item, index) => { const entry = entryFromItem(item, index, settings, rng); const previous = existingEntries.find(old => old.managed && !old.individual && old.sourceUuid === entry.sourceUuid); if (previous) { entry.id = previous.id; if (previous.generatedPrice === false && previous.customPrice != null) { entry.customPrice = previous.customPrice; entry.generatedPrice = false; } } return entry; });
  const entries = [...protectedEntries.map(clone), ...generated]; if (entries.length > 200) return { success: false, reason: 'The combined inventory exceeds 200 products. Reduce the target or remove protected stock.' };
  const generatedCount = generated.length; const eligibleCount = eligible.length + always.length; return { success: true, entries, generatedCount, targetCount: requested, eligibleCount, unclassifiedCount, shortfall: Math.max(0, requested - generatedCount), settings: clone(settings), ...(requested > generatedCount ? { reason: 'Catalog does not contain enough eligible classified stock for the requested product count.' } : {}) };
}

export const __test = { metadataFor, profileAllows, animalAvailability, availabilityWeight, sizeExceptional, sizeDefaults };
