/** Shared storage validation: parent capacity includes eligible descendant bulk recursively. */
import { storedBulk, storageFootprint, usedBulk, capacityValue } from './bulk.js';
import { checkAllowedContainers, matchesContainerAllowedNames, matchesContainerType, pouchStorageRejection, clothingStorageRejection } from "./container-allowlist.js";
import { isBackpack, isBackpackInternalForbidden, getBackpackStorageRejection } from './long-item-transport.js';
import { getSackStorageRejection } from './sack-storage.js';
import { getSaddleStorageRejection } from './saddlebag-storage.js';

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
  const root = (items?.contents ?? [...items]).find(item => (item.id ?? item._id) === containerId);
  return root ? Math.max(0, storageFootprint(root, items) - storedBulk(root)) : 0;
}

/** Effective size for an item being dropped in (may be a plain data object, not a live item). */
export function getEffectiveDropSize(itemData, items) {
  const own = storedBulk(itemData, { invalidPenalty: true });
  if (!items || !itemData?.id && !itemData?._id) return own;
  const all = items?.contents ?? [...items];
  const existing = all.find(item => (item.id ?? item._id) === (itemData.id ?? itemData._id));
  return existing ? storageFootprint(itemData, all) : own;
}

/** Only the immediate child's own bulk consumes this container's capacity. */
export function getUsedCapacity(container, items) { return usedBulk(container, items); }

export function getAvailableSpace(container, items) {
  const maxCapacity = capacityValue(container.system?.capacity);
  return maxCapacity - getUsedCapacity(container, items);
}

function isCountedDescendant(container, itemData, items) {
  const targetId = container?.id ?? container?._id;
  const itemId = itemData?.id ?? itemData?._id;
  if (!targetId || !itemId || targetId === itemId) return false;
  const all = items?.contents ?? [...(items ?? [])];
  const byId = new Map(all.map(item => [item.id ?? item._id, item]));
  const seen = new Set(); let current = byId.get(itemId);
  while (current?.system?.containerId && !seen.has(current.id ?? current._id)) {
    const currentId = current.id ?? current._id; seen.add(currentId);
    if (current.system.lashed) return false;
    if (current.system.containerId === targetId) return true;
    current = byId.get(current.system.containerId);
  }
  return false;
}

function capacityAdmission(container, itemData, items) {
  const all = items?.contents ?? [...(items ?? [])];
  const itemId = itemData?.id ?? itemData?._id;
  const existing = itemId && all.find(item => (item.id ?? item._id) === itemId);
  const incoming = getEffectiveDropSize(itemData, all);
  const original = existing ? storageFootprint(existing, all) : 0;
  const seen = new Set();
  let node = container;
  let isTarget = true;
  while (node) {
    const nodeId = node.id ?? node._id;
    if (!nodeId || seen.has(nodeId) || nodeId === itemId) {
      return { allowed: false, reason: 'An item cannot be placed inside itself or its own contents.' };
    }
    seen.add(nodeId);
    const capacity = capacityValue(node.system?.capacity);
    if (isTarget && !skipCapacityCheck(node) && capacity <= 0) {
      return { allowed: false, reason: `Container "${node.name}" has invalid capacity.` };
    }
    if (!skipCapacityCheck(node) && capacity > 0) {
      const used = getUsedCapacity(node, all);
      const priorContribution = existing && isCountedDescendant(node, existing, all) ? original : 0;
      const projected = used - priorContribution + incoming;
      if (projected > capacity && projected > used) {
        return {
          allowed: false,
          container: node,
          required: incoming,
          available: Math.max(0, capacity - used + priorContribution),
          reason: `Not enough space in ${node.name}. Required: ${incoming}, Available: ${Math.max(0, capacity - used + priorContribution)}.`,
        };
      }
    }
    // A lashed edge is intentionally outside the host's capacity tree.
    if (node.system?.lashed) break;
    node = all.find(item => (item.id ?? item._id) === node.system?.containerId) ?? null;
    isTarget = false;
  }
  return { allowed: true, incoming };
}

export function hasContainerSpace(container, itemData, items) {
  return capacityAdmission(container, itemData, items).allowed;
}

// Items tagged no-store can never go in any container; no-vehicle-store items additionally
// can't go in a vehicle-tagged container even though they could store elsewhere.
export function getNoStoreRejection(itemData, targetContainer) {
  if (targetContainer && ['ability', 'spell'].includes(itemData.type)) return 'Abilities and spells are not physical container contents.';
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
  if (['ability', 'spell'].includes(itemData.type)) return { allowed: false, reason: 'Abilities and spells are not physical container contents.' };
  if (!(container?.type === 'container' || container?.type === 'clothing' && capacityValue(container.system?.capacity) > 0)) return { allowed: false, reason: 'Choose a storage container.' };
  const backpackRejection = getBackpackStorageRejection(itemData, container, items);
  if (backpackRejection) return { allowed: false, reason: backpackRejection };
  const sackRejection = getSackStorageRejection(itemData, container, items);
  if (sackRejection) return { allowed: false, reason: sackRejection };
  const saddleRejection = getSaddleStorageRejection(itemData, container, items);
  if (saddleRejection) return { allowed: false, reason: saddleRejection };
  if (itemData.type === 'container' && (itemData.system?.tags || []).includes('tack')) return { allowed: false, reason: `${itemData.name} must be attached directly to a compatible animal.` };
  if (itemData.type === 'container' && (itemData.system?.tags || []).includes('sling')) return { allowed: false, reason: `${itemData.name} cannot be stored in a container.` };
  if ((Number(container.system?.lashSlots) || 0) > 0 && ['Saddle', 'Saddle, Pack'].includes(container.name)) return { allowed: false, reason: `${container.name} holds lashed items only.` };
  const pouchRejection = pouchStorageRejection(itemData, container);
  if (pouchRejection) return { allowed: false, reason: pouchRejection };
  const clothingRejection = clothingStorageRejection(itemData, container);
  if (clothingRejection) return { allowed: false, reason: clothingRejection };
  const allowlistCheck = checkAllowedContainers(itemData, container);
  if (!allowlistCheck.allowed) return allowlistCheck;

  const allowedNames = container.system?.allowedNames;
  if (allowedNames?.length > 0) {
    if (!matchesContainerAllowedNames(itemData, container)) {
      return { allowed: false, reason: `${container.name} only accepts: ${allowedNames.join(', ')}.` };
    }
  }

  const allowedTypes = container.system?.allowedTypes;
  if (allowedTypes?.length > 0) {
    const matches = allowedTypes.some((t) => matchesContainerType(itemData, t));
    if (!matches) return { allowed: false, reason: `${container.name} only accepts: ${allowedTypes.join(', ')}.` };
  }

  const blockedTypes = container.system?.blockedTypes ?? (isBackpack(container)
    ? BUILT_IN_BLOCKED_TYPES.Backpack
    : BUILT_IN_BLOCKED_TYPES[container.name]);
  if (blockedTypes?.length > 0) {
    const matchedBlock = blockedTypes.find((t) => matchesContainerType(itemData, t));
    if (matchedBlock) return { allowed: false, reason: blockedItemReason(itemData, container) };
  }

  const allowedSizes = container.system?.allowedSizes || [];
  if (allowedSizes.length > 0 && !allowedSizes.includes(itemData.system?.size || '')) {
    return { allowed: false, reason: `${container.name} only accepts size: ${allowedSizes.join(', ')}.` };
  }

  const required = itemData.system?.containerSizeRequired || '';
  if (required) {
    const sizeRank = { small: 1, medium: 2, large: 3 };
    const containerSize = container.system?.containerSize
      || ((container.system?.tags || []).includes('vehicle') ? 'large' : 'medium');
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

  const capacityCheck = capacityAdmission(container, itemData, items);
  if (!capacityCheck.allowed) {
    const required = capacityCheck.required ?? getEffectiveDropSize(itemData, items);
    const available = capacityCheck.available ?? getAvailableSpace(container, items);
    return {
      allowed: false,
      reasonType: 'capacity',
      reason: capacityCheck.reason ?? `Not enough space in ${container.name}. Required: ${required}, Available: ${available}.`,
    };
  }

  return { allowed: true };
}
