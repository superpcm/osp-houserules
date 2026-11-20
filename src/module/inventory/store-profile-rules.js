export const ECONOMIES = [
  { id: 'mixed', label: 'Mixed' }, { id: 'farming', label: 'Farming' }, { id: 'mining', label: 'Mining' },
  { id: 'hunting', label: 'Hunting' }, { id: 'trade', label: 'Trade' }, { id: 'frontier', label: 'Frontier' },
];
export const MERCHANT_WEALTH = [{ id: 'poor', label: 'Poor' }, { id: 'comfortable', label: 'Comfortable' }, { id: 'wealthy', label: 'Wealthy' }];
export const SUPPLY_LEVELS = [{ id: 'disrupted', label: 'Disrupted' }, { id: 'unreliable', label: 'Unreliable' }, { id: 'reliable', label: 'Reliable' }, { id: 'abundant', label: 'Abundant' }];
export const DEMAND_LEVELS = [{ id: 'normal', label: 'Normal' }, { id: 'adventuring', label: 'Adventuring' }, { id: 'military', label: 'Military' }, { id: 'civilian', label: 'Civilian' }];
export const STORE_EVENTS = [{ id: 'none', label: 'None' }, { id: 'war', label: 'War' }, { id: 'shortage', label: 'Shortage' }, { id: 'festival', label: 'Festival' }, { id: 'trade_disruption', label: 'Trade Disruption' }];

export const NEUTRAL_PROFILE_ENVIRONMENT = Object.freeze({
  economy: 'mixed', wealth: 'comfortable', supply: 'reliable', demand: 'normal', event: 'none',
  alwaysStock: Object.freeze([]), neverStock: Object.freeze([]), rarityOverrides: Object.freeze({}), buybackRates: Object.freeze({}),
});

const clone = value => structuredClone(value);
const enums = { economy: ECONOMIES, wealth: MERCHANT_WEALTH, supply: SUPPLY_LEVELS, demand: DEMAND_LEVELS, event: STORE_EVENTS };
export const profileSourceKey = source => encodeURIComponent(source).replace(/\./g, '%2E');
export function profileSourceUuid(key) { try { return decodeURIComponent(key); } catch (_) { return key; } }
export function profileRarityOverride(options, uuid) { return options?.rarityOverrides?.[profileSourceKey(uuid)] ?? options?.rarityOverrides?.[uuid]; }

const physicalTypes = ['weapon', 'armor', 'ammunition', 'container', 'clothing', 'item'];
const isPlain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export function profileEnvironmentDefaults(options = {}) {
  const defaults = clone(NEUTRAL_PROFILE_ENVIRONMENT);
  if (!isPlain(options)) return defaults;
  for (const key of Object.keys(defaults)) if (options[key] !== undefined) defaults[key] = clone(options[key]);
  return defaults;
}

export function validateProfileEnvironment(options = {}) {
  if (!isPlain(options)) return 'Profile environment must be a plain object.';
  for (const key of ['minProducts', 'maxProducts']) {
    if (options[key] !== undefined && (!['number', 'string'].includes(typeof options[key]) || !Number.isSafeInteger(Number(options[key])) || Number(options[key]) < 1 || Number(options[key]) > 200)) return 'Product minimum and maximum must be whole numbers from 1 to 200.';
  }
  if (options.minProducts !== undefined && options.maxProducts !== undefined && Number(options.minProducts) > Number(options.maxProducts)) return 'Product minimum cannot exceed product maximum.';
  for (const [key, values] of Object.entries(enums)) if (options[key] !== undefined && !values.some(value => value.id === options[key])) return `Invalid ${key} profile value.`;
  for (const key of ['alwaysStock', 'neverStock']) {
    if (options[key] !== undefined && (!Array.isArray(options[key]) || options[key].length > 200 || options[key].some(id => typeof id !== 'string' || id.length === 0 || id.length > 200))) return `${key} must contain at most 200 source UUID strings.`;
  }
  if (Array.isArray(options.alwaysStock) && Array.isArray(options.neverStock) && options.alwaysStock.some(id => options.neverStock.includes(id))) return 'A source cannot be both always stocked and never stocked.';
  for (const key of ['rarityOverrides', 'buybackRates']) {
    if (options[key] !== undefined && (!isPlain(options[key]) || Object.keys(options[key]).length > 200)) return `${key} must be a plain object with at most 200 entries.`;
    if (options[key] !== undefined && Object.keys(options[key]).some(id => id.length === 0 || id.length > 200)) return `${key} contains an invalid source ID.`;
  }
  if (options.rarityOverrides && Object.values(options.rarityOverrides).some(value => !['common', 'uncommon', 'rare', 'exceptional'].includes(value))) return 'Rarity/availability overrides must be common, uncommon, rare, or exceptional.';
  if (options.buybackRates && Object.entries(options.buybackRates).some(([type, value]) => !physicalTypes.includes(type) || !['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)) return 'Buyback rates must be finite percentages from 0 to 100 for physical item types.';
  return null;
}

export function profileBuybackRate(store, type) {
  const percentage = value => ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Number(value))) : null;
  const overrides = store?.stocking?.buybackRates ?? {};
  return (Object.hasOwn(overrides, type) ? percentage(overrides[type]) : null) ?? percentage(store?.buybackRate) ?? 50;
}
