import { capacityValue } from './bulk.js';

export const physicalItemTypes = new Set(['weapon', 'armor', 'item', 'container', 'coin', 'clothing', 'ammunition', 'livestock']);
export const inventoryItems = actor => actor.items.contents ?? [...actor.items.values()];
const idOf = item => item.id ?? item._id;
export function canBeParent(item) {
  return item?.type === 'container' || item?.type === 'livestock' || item?.type === 'clothing' && (capacityValue(item.system?.capacity) > 0 || Number(item.system?.lashSlots) > 0);
}
export function orphanedItems(items) {
  const index = new Map(items.map(item => [idOf(item), item]));
  return items.filter(item => item.system?.containerId && !canBeParent(index.get(item.system.containerId)));
}
export function assertNoContainmentCycles(items) {
  const index = new Map(items.map(item => [idOf(item), item]));
  for (const item of items) {
    const seen = new Set(); let current = item;
    while (current) {
      const id = idOf(current);
      if (seen.has(id)) throw new Error('Circular inventory links require GM correction before moving or deleting items.');
      seen.add(id); current = index.get(current.system?.containerId);
    }
  }
}
export function containedSubtree(items, rootId) {
  assertNoContainmentCycles(items);
  const result = [];
  const walk = id => { for (const child of items.filter(item => item.system?.containerId === id)) { result.push(child); walk(idOf(child)); } };
  walk(rootId); return result;
}
