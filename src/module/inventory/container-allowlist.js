/**
 * @file Pure logic for the item-side "allowedContainers" restriction.
 * No Foundry globals — some items (oversized weapons, barding, a sword's own scabbard) are
 * restricted to a specific named list of containers (e.g. only Cart/Wagon) rather than any
 * container with enough capacity. Complements the container-side allowedTypes/blockedTypes/
 * allowedNames checks already in character-sheet.js, which gate by what the CONTAINER accepts.
 */
/** @type {Readonly<Record<string, string[]>>} */
const DEDICATED_HOLDER_ITEMS = Object.freeze({
  'Scabbard, Dagger': ['Dagger', 'Misericorde'],
  'Scabbard, Sword': ['Longsword', 'Broadsword', 'Bastard Sword', 'Khopesh', 'Shortsword', 'Rapier', 'Falchion'],
  'Sword Frog': ['Scabbard, Sword'],
  'Baldric': ['Zweihander', 'Greatsword'],
  'Axe Sling': ['Battle Axe', 'Battle Axe, 2-Handed'],
  'Warhammer Sling': ['Warhammer'],
  'Belt Loop': ['Hand Axe', 'Light Hammer', 'Warhammer', 'Waterskin', 'Mace', 'Morning Star', 'Flail', "Butcher's Cleaver"],
  'Flask/Potion Holder': ['Vial or Bottle', 'Oil Flask', 'Holy Water'],
  'Skin Sling': ['Waterskin', 'Wineskin'],
});

// Small items that may be carried in clothing with an actual storage capacity.
// Keep this check here (rather than bypassing the full container gate) so capacity,
// maxItems, and unrelated clothing restrictions still apply.
/** @typedef {{name?: string, type?: string, system?: any}} ItemData */
/** @typedef {{name?: string, type?: string, system?: any}} ContainerData */

const CLOTHING_CARRY_ITEMS = new Set(['Ink Vial', 'Holy Water']);

const STANDARD_PORTABLE_CONTAINER_NAMES = new Set([
  'Backpack', 'Belt Pouch (L)', 'Belt Pouch (S)', 'Cart', 'Chest, Large', 'Chest, Small',
  'Panniers', 'Sack, Large', 'Sack, Small', 'Saddlebags, Large', 'Saddlebags, Small',
  'Sidesack', 'Wagon',
]);

// Keep arbitrary names out of the portable profile while covering every current
// positive-capacity clothing entry in the catalog.
const POSITIVE_CAPACITY_CLOTHING_NAMES = new Set([
  'Cloak', 'Robes', "Clothes, Commoner's", "Clothes, Merchant's", "Clothes, Adventurer's",
  "Clothes, Nobleman's", 'Clothes, Winter', 'Coat, Winter',
]);

const POUCH_NAMES = new Set(['Belt Pouch (S)', 'Belt Pouch (L)']);
const POUCH_BLOCKED_NAMES = new Set([
  'Pole, Ten Foot', 'Crowbar', 'Torch', 'Hand Axe', 'Light Hammer',
  'Grappling Hook', 'Lantern, Bullseye', 'Lantern, Hooded', 'Mallet, Wooden',
  'Rations, Iron',
]);

// Apply shape restrictions to every garment with internal storage, including
// existing custom or magical clothing. The dormant maxItemSize is not enforced.
const CLOTHING_BLOCKED_NAMES = new Set(['Torch', 'Grappling Hook', 'Hammer, Small', 'Boots']);
const CLOTHING_BLOCKED_AMMUNITION_NAMES = new Set([
  'Arrow', 'Silver-tipped Arrow', 'Crossbow Bolt, Light', 'Crossbow Bolt, Heavy',
]);

/** @param {ContainerData} container */
const isLashedRolledGarment = container => ['Coat, Winter', 'Cloak'].includes(container?.name?.replace(/\s*[+-]\d+$/, '') ?? '')
  && container?.system?.lashed === true;

/** @param {ContainerData} container */
function isPositiveCapacityClothing(container) {
  return container?.type === 'clothing'
    && positiveCapacity(container) !== null;
}

/** @param {ItemData} itemData */
function isArrowOrBolt(itemData) {
  const tags = Array.isArray(itemData?.system?.tags) ? itemData.system.tags : [];
  return tags.includes('arrows') || tags.includes('bolts')
    || CLOTHING_BLOCKED_AMMUNITION_NAMES.has(baseItemName(itemData) || '');
}

/**
 * Return the derived storage warning for an item already in positive-capacity clothing.
 * Dagger and its dagger scabbard remain valid in Adventurer's Clothes; maxItemSize is
 * intentionally not consulted here.
 * @param {ItemData} itemData @param {ContainerData} container
 * @returns {string|null}
 */
export function clothingStorageRejection(itemData, container) {
  if (!isPositiveCapacityClothing(container)) return null;
  if (isLashedRolledGarment(container)) {
    return `${itemData.name} cannot be stored in ${container.name} while it is lashed to a Backpack.`;
  }
  const name = baseItemName(itemData) || '';
  if (CLOTHING_BLOCKED_NAMES.has(name)) {
    return `${itemData.name} is too bulky or awkward to store inside ${container.name}.`;
  }
  if (isArrowOrBolt(itemData)) {
    return `${itemData.name} belongs in a quiver or bolt case, not inside ${container.name}.`;
  }
  return null;
}

/**
 * Return the derived storage warning for an item already in a belt pouch.
 * This is intentionally pure: existing invalid contents remain in place until a user moves them.
 * @param {ItemData} itemData @param {ContainerData} container
 * @returns {string|null}
 */
export function pouchStorageRejection(itemData, container) {
  if (!container?.name || !POUCH_NAMES.has(container.name)) return null;
  const name = baseItemName(itemData) || '';
  if (name === 'Hammer, Small' && container.name === 'Belt Pouch (S)') {
    return `${itemData.name} is too bulky for a small belt pouch.`;
  }
  if (!POUCH_BLOCKED_NAMES.has(name)) return null;
  return `${itemData.name} is too long or bulky for a belt pouch.`;
}

/**
 * Audit pouch contents without changing item data. Includes nested pouches.
 * @param {any} items
 * @returns {Array<{item:any,container:any,reason:string}>}
 */
export function auditPouchContents(items) {
  /** @type {any} */
  const source = items && 'contents' in Object(items) ? items.contents : items;
  const all = [...(source ?? [])];
  const byId = new Map(all.map(item => [item?.id ?? item?._id, item]));
  return all.flatMap(item => {
    if (item?.system?.lashed) return [];
    const parent = byId.get(item?.system?.containerId);
    const reason = pouchStorageRejection(item, parent);
    return reason ? [{ item, container: parent, reason }] : [];
  });
}

/** Audit clothing contents without changing item data; lashed items are external. */
/** @param {any} items */
export function auditClothingContents(items) {
  /** @type {any} */
  const source = items && 'contents' in Object(items) ? items.contents : items;
  const all = [...(source ?? [])];
  const byId = new Map(all.map(item => [item?.id ?? item?._id, item]));
  return all.flatMap(item => {
    if (item?.system?.lashed) return [];
    const parent = byId.get(item?.system?.containerId);
    const reason = clothingStorageRejection(item, parent);
    return reason ? [{ item, container: parent, reason }] : [];
  });
}

/** @param {*} value */
function normalizedRestriction(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'gems' ? 'gem' : normalized;
}

/** Return whether an item matches a container allowedTypes/blockedTypes entry. */
/** @param {ItemData} itemData @param {*} restriction */
export function matchesContainerType(itemData, restriction) {
  const wanted = normalizedRestriction(restriction);
  if (!wanted) return false;
  const tags = itemData?.system?.tags || [];
  return [
    ...(Array.isArray(tags) ? tags : []),
    itemData?.system?.weaponType,
    itemData?.type,
  ].some((value) => normalizedRestriction(value) === wanted);
}

/** @param {ItemData} itemData */
function baseItemName(itemData) {
  return itemData?.name?.replace(/\s*[+-]\d+$/, '');
}

/** @param {ItemData} itemData @param {ContainerData} container */
function isGeneratedPotionForCanonicalHolder(itemData, container) {
  if (container?.name !== 'Flask/Potion Holder' || itemData?.type !== 'item') return false;
  const allowedNames = container.system?.allowedNames;
  if (!Array.isArray(allowedNames)
    || !['Vial or Bottle', 'Oil Flask', 'Holy Water'].every((name) => allowedNames.includes(name))) return false;
  if (!matchesContainerType(itemData, 'potion')) return false;
  const storedSize = Number(itemData.system?.storedSize);
  const rawCapacity = container.system?.capacity;
  const capacity = Number(rawCapacity && typeof rawCapacity === 'object'
    ? rawCapacity.max ?? rawCapacity.value
    : rawCapacity);
  return Number.isFinite(storedSize) && storedSize > 0
    && Number.isFinite(capacity) && capacity > 0 && storedSize <= capacity;
}

/** Match a container allowedNames whitelist, including schema-generated potions for the canonical holder. */
/** @param {ItemData} itemData @param {ContainerData} container */
export function matchesContainerAllowedNames(itemData, container) {
  const allowedNames = container?.system?.allowedNames;
  if (!Array.isArray(allowedNames) || allowedNames.length === 0) return true;
  const name = baseItemName(itemData);
  // Existing Belt Loops may still have the allowlist from before the cleaver was added.
  if (container.name === 'Belt Loop' && itemData?.type === 'weapon' && name === "Butcher's Cleaver") return true;
  return allowedNames.includes(name) || isGeneratedPotionForCanonicalHolder(itemData, container);
}

/** @param {ContainerData} container */
function positiveCapacity(container) {
  if (container?.type !== 'clothing') return null;
  const raw = container.system?.capacity;
  const value = raw && typeof raw === 'object' ? raw.max ?? raw.value : raw;
  const capacity = Number(value);
  return Number.isFinite(capacity) && capacity > 0 ? capacity : null;
}

/** @param {ContainerData} container */
function hasPositiveFiniteCapacity(container) {
  return positiveCapacity(container) !== null;
}

/** @param {*} allowedContainers */
function hasPortableStorageProfile(allowedContainers) {
  if (!Array.isArray(allowedContainers) || allowedContainers.length === 0) return true;
  return [...STANDARD_PORTABLE_CONTAINER_NAMES].every((name) => allowedContainers.includes(name))
    && allowedContainers.every((name) =>
      STANDARD_PORTABLE_CONTAINER_NAMES.has(name) || POSITIVE_CAPACITY_CLOTHING_NAMES.has(name));
}

/** @param {ItemData} itemData @param {ContainerData} container */
function isGenericClothingCarry(itemData, container) {
  const capacity = positiveCapacity(container);
  if (itemData?.type !== 'item' || capacity === null) return false;
  const storedSize = Number(itemData.system?.storedSize);
  if (!Number.isFinite(storedSize) || storedSize <= 0 || storedSize > capacity) return false;
  const tags = itemData.system?.tags || [];
  if (tags.includes('no-store') || tags.includes('slungable') || tags.includes('sling')) return false;
  return hasPortableStorageProfile(itemData.system?.allowedContainers);
}

/**
 * @param {{name:string, system:{allowedContainers?:string[]}}} itemData
 * @param {{name:string}} container
 * @returns {{allowed:boolean, reason:(string|null)}}
 */
export function checkAllowedContainers(itemData, container) {
  const allowedContainers = itemData?.system?.allowedContainers;
  const baseName = baseItemName(itemData);
  if (CLOTHING_CARRY_ITEMS.has(baseName || '') && hasPositiveFiniteCapacity(container)) {
    return { allowed: true, reason: null };
  }
  if (isGenericClothingCarry(itemData, container)) return { allowed: true, reason: null };
  if (!allowedContainers || allowedContainers.length === 0) return { allowed: true, reason: null };
  // Dedicated holders are exact named pairings. They take precedence over
  // legacy item-side allowlists that predate the holder catalog entry.
  if (DEDICATED_HOLDER_ITEMS[container?.name || '']?.includes(baseName || '')) {
    return { allowed: true, reason: null };
  }
  if (isGeneratedPotionForCanonicalHolder(itemData, container)) {
    return { allowed: true, reason: null };
  }
  if (allowedContainers.includes(container?.name)
    || (container?.name === "Traveler's Backpack" && allowedContainers.includes('Backpack'))) {
    return { allowed: true, reason: null };
  }
  return {
    allowed: false,
    reason: `${itemData.name} only fits in: ${allowedContainers.join(', ')}.`,
  };
}
