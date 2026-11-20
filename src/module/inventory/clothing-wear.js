import { normalizeQuantity } from './encumbrance.js';
import { focusKindForItem } from '../spells/spell-rules.js';

export const CLOTHING_WEAR_POSITIONS = [
  { id: 'clothes', label: 'Base clothing' },
  { id: 'boots', label: 'Feet' },
  { id: 'gloves', label: 'Hands' },
  { id: 'bracers', label: 'Forearms' },
  { id: 'outerwear', label: 'Coat' },
  { id: 'cloak', label: 'Cloak' },
];

export const CLOTHING_WEAR_CATEGORIES = [
  ...CLOTHING_WEAR_POSITIONS,
  { id: 'belt', label: 'Belt' },
];

const ALIASES = new Map([
  ['base', 'clothes'], ['baseclothing', 'clothes'], ['clothing', 'clothes'],
  ['feet', 'boots'], ['footwear', 'boots'],
  ['hands', 'gloves'], ['gauntlets', 'gloves'],
  ['forearms', 'bracers'], ['coat', 'outerwear'],
]);

const NAME_RULES = [
  ['clothes', /\bclothes\b|\brobes?\b/i],
  ['boots', /\bboots?\b/i],
  ['gloves', /\bgloves?\b|\bgauntlets?\b/i],
  ['bracers', /\bbracers?\b/i],
  ['outerwear', /\bwinter[\s-]?coat\b|\bcoat\b/i],
  ['cloak', /\bcloaks?\b/i],
  ['belt', /\bbelts?\b/i],
];

const itemId = item => item?.id ?? item?._id ?? item?.uuid ?? null;
const itemName = item => String(item?.name ?? '').trim();

export function resolveClothingWearCategory(item) {
  if (!item || item.type !== 'clothing') return null;
  const explicit = String(item.system?.slot ?? '').trim().toLowerCase();
  if (explicit) return ALIASES.get(explicit) ?? (CLOTHING_WEAR_CATEGORIES.some(p => p.id === explicit) ? explicit : null);
  const name = itemName(item);
  const matches = NAME_RULES.filter(([, pattern]) => pattern.test(name)).map(([id]) => id);
  return new Set(matches).size === 1 ? matches[0] : null;
}

export function isWornClothing(item) {
  return item?.type === 'clothing' && Boolean(item.system?.equipped)
    && !item.system?.containerId && !item.system?.lashed;
}

/** Holy Symbols are body-worn accessories, not one of Clothing's six positions. */
export function isBodyWearAccessory(item) {
  return item?.type === 'item' && focusKindForItem(item) === 'holy-symbol';
}

export function isWornBodyAccessory(item) {
  return isBodyWearAccessory(item) && Boolean(item.system?.equipped)
    && !item.system?.containerId && !item.system?.lashed;
}

export function clothingWearRejection(item, items = [], { excludeId = null } = {}) {
  if (!item || item.type !== 'clothing') return null;
  const category = resolveClothingWearCategory(item);
  if (!category) return `${itemName(item) || 'This clothing'} has no recognized wear category.`;
  if (normalizeQuantity(item.system?.quantity) !== 1) return `${itemName(item) || 'This clothing'} must have quantity 1 to be worn.`;
  const duplicate = [...items].find(other => (excludeId == null || itemId(other) !== excludeId) && (itemId(item) == null || itemId(other) !== itemId(item))
    && isWornClothing(other) && resolveClothingWearCategory(other) === category);
  const label = CLOTHING_WEAR_CATEGORIES.find(position => position.id === category)?.label ?? category;
  return duplicate ? `Cannot wear ${itemName(item)} because ${itemName(duplicate)} already occupies the ${label.toLowerCase()} position.` : null;
}

export function auditClothingWear(items = []) {
  const positions = CLOTHING_WEAR_POSITIONS.map((position, index) => ({
    path: wearSegmentPath(index),
    ...position, occupied: false, conflict: false, items: [],
    tooltip: `${position.label} slot is empty.`,
  }));
  const byCategory = new Map(positions.map(position => [position.id, position]));
  const warningsById = {};
  const worn = [...items].filter(isWornClothing);
  for (const item of worn) {
    const id = itemId(item);
    const category = resolveClothingWearCategory(item);
    if (!category) {
      if (id != null) warningsById[id] = `${itemName(item)} has no recognized wear category.`;
      continue;
    }
    const reason = clothingWearRejection(item, items, { excludeId: id });
    if (reason && id != null) warningsById[id] = reason;
    const position = byCategory.get(category);
    if (!position) continue;
    position.items.push({ id, name: itemName(item) });
    position.occupied = true;
  }
  for (const position of positions) {
    position.conflict = position.items.length > 1 || position.items.some(entry => {
      const item = [...items].find(candidate => itemId(candidate) === entry.id);
      return normalizeQuantity(item?.system?.quantity) !== 1;
    });
    position.tooltip = position.occupied
      ? `${position.label}: ${position.items.map(entry => entry.name).join(', ')}${position.conflict ? ' (conflict)' : ''}.`
      : `${position.label} slot is empty.`;
  }
  const unknown = worn.filter(item => !resolveClothingWearCategory(item));
  const hasConflicts = positions.some(position => position.conflict) || unknown.length > 0;
  const occupied = positions.filter(position => position.occupied).length;
  const warnings = Object.values(warningsById);
  return {
    occupied,
    positions,
    hasConflicts,
    warningsById,
    tooltip: `${occupied} of ${positions.length} clothing positions occupied. ${positions.map(position => position.tooltip).join(' ')}${unknown.length ? ` Unclassified worn items: ${unknown.map(itemName).join(', ')}.` : ''}`,
    summary: warnings.length ? warnings.join(' ') : `${occupied} of ${positions.length} clothing positions occupied.`,
  };
}

/** Six equal 56-degree arcs, each separated by a four-degree gap. */
export function wearSegmentPath(index) {
  const point = degrees => { const radians = degrees * Math.PI / 180; return `${(28 + 26 * Math.cos(radians)).toFixed(3)} ${(28 + 26 * Math.sin(radians)).toFixed(3)}`; };
  const start = -90 + index * 60 + 2;
  return `M ${point(start)} A 26 26 0 0 1 ${point(start + 56)}`;
}
