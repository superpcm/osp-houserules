export const CATALOG_AVAILABILITIES = Object.freeze(['common', 'uncommon', 'rare', 'exceptional']);
const normalize = value => String(value ?? '').trim().toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const keyFor = item => `${normalize(item?.name)}|${normalize(item?.type)}`;
const catalogFiles = ['ammunition', 'archive', 'armor', 'clothing', 'gear', 'livestock', 'misc', 'tack', 'treasure', 'vehicles', 'weapons'];
const cache = new Map();

function readMetadata(item) {
  const system = item?.system ?? {};
  const availability = String(system.storeAvailability ?? '').toLowerCase();
  return { availability: CATALOG_AVAILABILITIES.includes(availability) ? availability : null, blacksmithEligible: typeof system.blacksmithEligible === 'boolean' ? system.blacksmithEligible : null };
}

/** Resolve item metadata from the item first, then one exact catalog match. */
export function resolveStockingMetadata(item, catalog = []) {
  const direct = readMetadata(item);
  let match = null;
  if (direct.availability === null || direct.blacksmithEligible === null) {
    const matches = (Array.isArray(catalog) ? catalog : []).filter(candidate => keyFor(candidate) === keyFor(item));
    if (matches.length === 1) match = matches[0];
  }
  const catalogMeta = readMetadata(match);
  return { availability: direct.availability ?? catalogMeta.availability, blacksmithEligible: direct.blacksmithEligible ?? catalogMeta.blacksmithEligible, availabilitySource: direct.availability ? 'item' : catalogMeta.availability ? 'catalog' : 'unclassified', blacksmithSource: direct.blacksmithEligible !== null ? 'item' : catalogMeta.blacksmithEligible !== null ? 'catalog' : 'unclassified' };
}

export function catalogDefaults(item) { return readMetadata(item); }

export function validateStockingMetadata(system = {}) {
  if (system.storeAvailability != null && system.storeAvailability !== '' && !CATALOG_AVAILABILITIES.includes(system.storeAvailability)) return 'Availability must be Common, Uncommon, Rare, Exceptional, or unclassified.';
  if (system.blacksmithEligible != null && typeof system.blacksmithEligible !== 'boolean') return 'Blacksmith eligibility must be Eligible, Excluded, or unset.';
  return null;
}

/** Load the bundled catalog unchanged; callers resolve metadata without writing world items. */
export async function loadStockingCatalog() {
  const sid = globalThis.game?.system?.id ?? 'osp-houserules';
  if (!cache.has(sid)) cache.set(sid, Promise.all(catalogFiles.map(async file => {
    const response = await fetch(`systems/${sid}/data/${file}.json`);
    if (!response.ok) throw new Error(`Unable to load ${file} stocking catalog.`);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error(`Invalid ${file} stocking catalog.`);
    for (const item of items) {
      const error = validateStockingMetadata(item.system);
      if (error) throw new Error(`${file}: ${item.name}: ${error}`);
    }
    return items;
  })).then(groups => groups.flat()).catch(error => { cache.delete(sid); throw error; }));
  return cache.get(sid);
}

export function isBlacksmithEligible(item, catalog = []) { return resolveStockingMetadata(item, catalog).blacksmithEligible === true; }
