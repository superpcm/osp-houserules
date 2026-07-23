/**
 * @file Pure logic for the item-side "allowedContainers" restriction.
 * No Foundry globals — some items (oversized weapons, barding, a sword's own scabbard) are
 * restricted to a specific named list of containers (e.g. only Cart/Wagon) rather than any
 * container with enough capacity. Complements the container-side allowedTypes/blockedTypes/
 * allowedNames checks already in character-sheet.js, which gate by what the CONTAINER accepts.
 */

/**
 * @param {{name:string, system:{allowedContainers?:string[]}}} itemData
 * @param {{name:string}} container
 * @returns {{allowed:boolean, reason:(string|null)}}
 */
export function checkAllowedContainers(itemData, container) {
  const allowedContainers = itemData?.system?.allowedContainers;
  if (!allowedContainers || allowedContainers.length === 0) return { allowed: true, reason: null };
  if (allowedContainers.includes(container?.name)) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: `${itemData.name} only fits in: ${allowedContainers.join(', ')}.`,
  };
}
