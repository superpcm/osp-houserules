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
  'Scabbard, Sword': ['Longsword', 'Broadsword', 'Bastard Sword', 'Khopesh', 'Shortsword', 'Rapier'],
  'Sword Frog': ['Scabbard, Sword'],
  'Baldric': ['Zweihander', 'Greatsword'],
  'Axe Sling': ['Battle Axe', 'Battle Axe, 2-Handed'],
  'Belt Loop': ['Hand Axe', 'Light Hammer', 'Warhammer', 'Waterskin', 'Mace', 'Morning Star', 'Flail'],
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
  "Clothes, Nobleman's",
]);

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
  return allowedNames.includes(baseItemName(itemData)) || isGeneratedPotionForCanonicalHolder(itemData, container);
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
  if (allowedContainers.includes(container?.name)) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: `${itemData.name} only fits in: ${allowedContainers.join(', ')}.`,
  };
}
