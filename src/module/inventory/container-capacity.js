/**
 * @file Pure withdraw-target validation for Westford Bank. No Foundry globals — every function
 * takes an explicit `items` array instead of reaching into `actor.items`, so it can run against
 * plain fixtures in tests and against a live actor's EmbeddedCollection identically.
 *
 * This is a narrow, purpose-built port of the equivalent instance methods already living in
 * character-sheet.js (_isItemAllowedInContainer, _getUsedCapacity, _getEffectiveDropSize,
 * _getTotalNestedSize, _getNoStoreRejection, _skipCapacityCheck), not a refactor of that file.
 * character-sheet.js is the largest, most load-bearing file in the codebase, with ~15 existing
 * call sites into these methods intertwined with live drop-preview/lash/slung/tack special-
 * casing that a bank withdrawal never needs (a Bank withdraw target is always an ordinary
 * storage container the player already owns — never a sling mount, lash-only tack host, or
 * belt attachment). Duplicating the well-understood parts here avoids risking a regression in
 * that file's working drag-and-drop paths for a feature that's the only current beneficiary of
 * extracting them. The functions below are written as drop-in equivalents (same logic, same
 * order of checks, explicit `items` param) so a future refactor can point both call sites at
 * this module with no behavior change once this is proven out.
 */

import { checkAllowedContainers } from "./container-allowlist.js";

// Verbatim copy of OspActorSheetCharacter.BUILT_IN_BLOCKED_TYPES (character-sheet.js) — the
// fallback blocked-types table for well-known containers that pre-date the refresh macro.
export const BUILT_IN_BLOCKED_TYPES = {
  'Belt Pouch (S)': ['armor', 'container', 'clothing', 'sword', 'dagger', 'arrows', 'bolts'],
  'Belt Pouch (L)': ['armor', 'container', 'clothing', 'sword', 'dagger', 'arrows', 'bolts'],
  'Backpack':       ['slungable', 'sword'],
  'Sack, Small':    ['slungable'],
  'Sack, Large':    ['slungable'],
};

export function skipCapacityCheck(container) {
  return container.system?.hideCapacity === true;
}

/** Recursively sums storedSize of all items inside a container (by id), including deep descendants. */
export function getTotalNestedSize(containerId, items) {
  return items
    .filter((i) => i.system.containerId === containerId)
    .reduce((sum, child) => {
      const childSize = (parseFloat(child.system.storedSize) || 0) * (child.system.quantity || 1);
      return sum + childSize + (child.type === 'container' ? getTotalNestedSize(child.id, items) : 0);
    }, 0);
}

/** Effective size for an item being dropped in (may be a plain data object, not a live item). */
export function getEffectiveDropSize(itemData, items) {
  const ss = parseFloat(itemData.system?.storedSize);
  if (isNaN(ss) || ss < 0) {
    return (itemData.type === 'weapon' || itemData.type === 'armor') ? 9999 : 0;
  }
  const ownSize = ss * (parseFloat(itemData.system.quantity) || 1);
  if (itemData.type === 'container' && itemData._id) {
    return ownSize + getTotalNestedSize(itemData._id, items);
  }
  return ownSize;
}

/** Used capacity in a container, including nested contents of any sub-containers. */
export function getUsedCapacity(container, items) {
  return items
    .filter((item) => item.system.containerId === container.id && !item.system.lashed)
    .reduce((total, item) => {
      const ownSize = (parseFloat(item.system.storedSize) || 0) * (item.system.quantity || 1);
      const nestedSize = item.type === 'container' ? getTotalNestedSize(item.id, items) : 0;
      return total + ownSize + nestedSize;
    }, 0);
}

export function getAvailableSpace(container, items) {
  const maxCapacity = container.system?.capacity || 0;
  return maxCapacity - getUsedCapacity(container, items);
}

export function hasContainerSpace(container, itemData, items) {
  const capacity = parseFloat(container.system?.capacity);
  if (isNaN(capacity) || capacity <= 0) return false;
  return (getUsedCapacity(container, items) + getEffectiveDropSize(itemData, items)) <= capacity;
}

// Items tagged no-store can never go in any container; no-vehicle-store items additionally
// can't go in a vehicle-tagged container even though they could store elsewhere.
export function getNoStoreRejection(itemData, targetContainer) {
  const isStorageTarget = targetContainer && (targetContainer.type === "container" ||
    (targetContainer.type === "clothing" && targetContainer.system.capacity));
  if (isStorageTarget && (itemData.system?.tags || []).includes('no-store')) {
    return `${itemData.name} is too large to be stored in a container.`;
  }
  const isVehicleTarget = targetContainer && (targetContainer.system?.tags || []).includes('vehicle');
  if (isVehicleTarget && (itemData.system?.tags || []).includes('no-vehicle-store')) {
    return `${itemData.name} cannot be stowed inside ${targetContainer.name}.`;
  }
  return null;
}

/** Context-aware rejection message for a blockedTypes match. */
function blockedItemReason(itemData, container) {
  const tags = itemData.system?.tags || [];
  switch (itemData.type) {
    case 'armor':
      return `${itemData.name} must be worn or bundled separately — it cannot be stored in ${container.name}.`;
    case 'clothing':
      return `${itemData.name} must be worn, not stored in ${container.name}.`;
    case 'container':
      if (tags.includes('weapon-storage'))
        return `${itemData.name} belongs on a belt, not stored in ${container.name}.`;
      return `${container.name} cannot hold another container.`;
    case 'weapon':
      if (tags.includes('sword'))
        return `${itemData.name} is too long to fit in ${container.name} — swords belong in scabbards.`;
      if (tags.includes('dagger'))
        return `${itemData.name} belongs in a sheath, not stored in ${container.name}.`;
      if (tags.includes('slungable'))
        return `${itemData.name} must be slung, not stored in a container.`;
      return `${itemData.name} cannot be stored in ${container.name}.`;
    case 'ammunition':
      if (tags.includes('arrows'))
        return `${itemData.name} belongs in a quiver, not stored in ${container.name}.`;
      if (tags.includes('bolts'))
        return `${itemData.name} belongs in a bolt case, not stored in ${container.name}.`;
      return `${itemData.name} cannot be stored in ${container.name}.`;
    default:
      return `${itemData.name} cannot be stored in ${container.name}.`;
  }
}

/**
 * Full type-acceptance gate for a container — port of
 * OspActorSheetCharacter._isItemAllowedInContainer, minus the sling-container / lash-slot
 * branches (a Bank withdraw target is never a sling mount).
 * @returns {{allowed:boolean, reason:(string|null)}}
 */
export function isItemAllowedInContainer(itemData, container, items) {
  const allowlistCheck = checkAllowedContainers(itemData, container);
  if (!allowlistCheck.allowed) return allowlistCheck;

  const allowedNames = container.system?.allowedNames;
  if (allowedNames?.length > 0) {
    const baseName = itemData.name.replace(/\s*[+-]\d+$/, '');
    if (!allowedNames.includes(baseName)) {
      return { allowed: false, reason: `${container.name} only accepts: ${allowedNames.join(', ')}.` };
    }
  }

  const allowedTypes = container.system?.allowedTypes;
  if (allowedTypes?.length > 0) {
    const itemTags = itemData.system?.tags || [];
    const weaponType = itemData.system?.weaponType || '';
    const matches = allowedTypes.some((t) => itemTags.includes(t) || weaponType === t || itemData.type === t);
    if (!matches) return { allowed: false, reason: `${container.name} only accepts: ${allowedTypes.join(', ')}.` };
  }

  const blockedTypes = container.system?.blockedTypes ?? BUILT_IN_BLOCKED_TYPES[container.name];
  if (blockedTypes?.length > 0) {
    const itemTags = itemData.system?.tags || [];
    const weaponType = itemData.system?.weaponType || '';
    const matchedBlock = blockedTypes.find((t) => itemTags.includes(t) || weaponType === t || itemData.type === t);
    if (matchedBlock) return { allowed: false, reason: blockedItemReason(itemData, container) };
  }

  const allowedSizes = container.system?.allowedSizes || [];
  if (allowedSizes.length > 0 && !allowedSizes.includes(itemData.system?.size || '')) {
    return { allowed: false, reason: `${container.name} only accepts size: ${allowedSizes.join(', ')}.` };
  }

  const required = itemData.system?.containerSizeRequired || '';
  if (required) {
    const sizeRank = { small: 1, medium: 2, large: 3 };
    const containerSize = container.system?.containerSize || 'medium';
    if ((sizeRank[containerSize] || 2) < (sizeRank[required] || 1)) {
      return { allowed: false, reason: `${itemData.name} is too large to fit inside ${container.name}.` };
    }
  }

  const maxItems = container.system?.maxItems || 0;
  if (maxItems > 0) {
    const currentCount = items.filter((i) => i.system.containerId === container.id && !i.system.lashed).length;
    if (currentCount >= maxItems) {
      return { allowed: false, reason: `${container.name} is full (holds ${maxItems} item${maxItems > 1 ? 's' : ''} max).` };
    }
  }

  return { allowed: true, reason: null };
}

/**
 * The single entry point the Bank orchestrator calls: is this container a valid withdrawal
 * target for this item, and if not, is it a type problem or a capacity problem? `reasonType`
 * is what lets the UI show the spec's two distinct error messages.
 * @returns {{allowed:boolean, reason?:string, reasonType?:'type'|'capacity'}}
 */
export function checkWithdrawTarget(itemData, container, items) {
  const noStore = getNoStoreRejection(itemData, container);
  if (noStore) return { allowed: false, reasonType: 'type', reason: noStore };

  const typeCheck = isItemAllowedInContainer(itemData, container, items);
  if (!typeCheck.allowed) return { allowed: false, reasonType: 'type', reason: typeCheck.reason };

  if (!skipCapacityCheck(container) && !hasContainerSpace(container, itemData, items)) {
    const required = getEffectiveDropSize(itemData, items);
    const available = getAvailableSpace(container, items);
    return {
      allowed: false,
      reasonType: 'capacity',
      reason: `Not enough space in ${container.name}. Required: ${required}, Available: ${available}.`,
    };
  }

  return { allowed: true };
}
