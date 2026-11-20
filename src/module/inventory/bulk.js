import { normalizeQuantity, unitWeightPounds } from './encumbrance.js';

/** Catalog storedSize and capacity use the same numeric bulk unit. */
export function capacityValue(value) {
  const raw = value && typeof value === 'object' ? value.max ?? value.value : value;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
export function storedBulk(item, { invalidPenalty = false } = {}) {
  const value = item?.system?.storedSize;
  const number = Number(value);
  if (value === undefined || value === null || !Number.isFinite(number) || number < 0) {
    return invalidPenalty && ['weapon', 'armor'].includes(item?.type) ? 9999 : 0;
  }
  return number * normalizeQuantity(item?.system?.quantity);
}

const itemId = item => item?.id ?? item?._id;
const itemList = items => items?.contents ?? [...(items ?? [])];

/**
 * Return the bulk footprint of a node and all eligible descendants.  A lashed
 * edge is outside storage capacity (including everything attached below it),
 * while malformed cycles and duplicate ids are ignored safely.
 */
export function storageFootprint(item, items, { includeRoot = true, includeLashedEdges = false, blockedIds = [] } = {}) {
  const all = itemList(items);
  const byParent = new Map();
  for (const child of all) {
    const parent = child?.system?.containerId;
    if (!parent) continue;
    const list = byParent.get(parent) ?? [];
    list.push(child); byParent.set(parent, list);
  }
  const seen = new Set(blockedIds);
  const keyFor = (node, fallback) => itemId(node) ?? fallback;
  const walk = (node, key, root = false) => {
    const identity = keyFor(node, key);
    if (seen.has(identity)) return 0;
    seen.add(identity);
    let total = root && !includeRoot ? 0 : storedBulk(node);
    for (const child of byParent.get(identity) ?? []) {
      if ((!includeLashedEdges && child?.system?.lashed) || seen.has(keyFor(child, child))) continue;
      total += walk(child, child, false);
    }
    return total;
  };
  return roundBulk(walk(item, itemId(item) ?? item, true));
}

function roundBulk(total) { return Math.round(total * 1e10) / 1e10; }

export function usedBulk(container, items) {
  return storageFootprint(container, items, { includeRoot: false });
}
/** Inclusive descendant weight for a display subtotal, never added to personal load. */
export function contentsWeight(containerId, items) {
  const all = items?.contents ?? [...items], visited = new Set([containerId]);
  const walk = id => all.filter(item => item.system?.containerId === id).reduce((sum, item) => {
    const key = item.id ?? item._id;
    if (visited.has(key)) return sum;
    visited.add(key);
    const weight = unitWeightPounds(item);
    return sum + (Number.isFinite(weight) && weight > 0 ? weight * normalizeQuantity(item.system?.quantity) : 0) + walk(key);
  }, 0);
  return walk(containerId);
}
