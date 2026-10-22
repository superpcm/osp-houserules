import { requiresTwoHands } from '../combat/weapon-policy.js';
import { focusKindForItem } from '../spells/spell-rules.js';

const tagsFor = (item) => {
  const raw = item?.system?.tags ?? [];
  const values = Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/);
  return new Set(values.map(tag => String(tag).toLowerCase()).filter(Boolean));
};

/** Return the number of hands an equipped item occupies. */
export function handCost(item) {
  if (!item) return 0;
  const tags = tagsFor(item);
  if (item.type === 'weapon') return requiresTwoHands(item) ? 2 : 1;
  if (item.type === 'armor' && (item.system?.type === 'shield' || String(item.name ?? '').toLowerCase().includes('shield'))) return 1;
  if (item.name === 'Sack, Large') return 2;
  if (item.name === 'Sack, Small') return 1;
  if (tags.has('two-handed') || tags.has('twohanded')) return 2;
  if (focusKindForItem(item) === 'wand' || focusKindForItem(item) === 'staff') return 1;
  if (tags.has('hand-held') || tags.has('handheld') || tags.has('one-handed') || tags.has('onehanded')) return 1;
  return 0;
}

export function heldItems(items = [], excludeId = null) {
  const collection = items?.contents ?? items;
  return Array.from(collection ?? []).filter(item => item?.system?.equipped && item.id !== excludeId && handCost(item) > 0);
}

export function handsUsed(items = [], excludeId = null) {
  return heldItems(items, excludeId).reduce((total, item) => total + handCost(item), 0);
}

export function canHold(items = [], item, excludeId = null) {
  const cost = handCost(item);
  return cost > 0 && handsUsed(items, excludeId) + cost <= 2;
}
