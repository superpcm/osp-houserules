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
export function usedBulk(container, items) {
  const total = (items?.contents ?? [...items]).filter(item => item.system?.containerId === (container.id ?? container._id) && !item.system?.lashed)
    .reduce((sum, item) => sum + storedBulk(item), 0);
  return Math.round(total * 1e10) / 1e10;
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
