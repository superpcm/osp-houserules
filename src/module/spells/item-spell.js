import { spellClassKey } from './spell-rules.js';

/** Explicit links written by the magic-item creator; names are never spell identifiers. */
export function readItemSpell(item) {
  const system = item?.system ?? {};
  if (typeof system.spellKey !== 'string' || !system.spellKey || typeof system.spellClass !== 'string' || !system.spellClass) return null;
  const tags = Array.isArray(system.tags) ? system.tags.map(value => String(value).toLowerCase()) : [];
  const kind = system.spellSourceKind || (tags.includes('scroll') || item.type === 'scroll' ? 'scroll' : tags.includes('staff') ? 'staff' : tags.includes('wand') || tags.includes('rod') ? 'wand' : 'item');
  const allowed = system.spellAllowedClasses;
  return { spellId: system.spellKey, listKey: system.spellClass, reverse: system.spellReversed === true, kind,
    allowedClasses: Array.isArray(allowed) ? allowed.map(spellClassKey) : typeof allowed === 'string' ? allowed.split(',').map(spellClassKey).filter(Boolean) : [] };
}

export function itemSpellResource(item, config = readItemSpell(item)) {
  if (!config || !['scroll', 'wand', 'staff', 'item'].includes(config.kind)) throw new Error('This item needs a valid linked spell.');
  const quantity = item.system?.quantity;
  const quantityValue = quantity && typeof quantity === 'object' ? quantity.value : quantity;
  if (!Number.isInteger(Number(quantityValue)) || Number(quantityValue) <= 0) throw new Error('No usable item remains.');
  if (config.kind !== 'scroll' && Number(quantityValue) !== 1) throw new Error('Separate charged items into individual inventory entries before casting.');
  const path = config.kind === 'scroll' ? (quantity && typeof quantity === 'object' ? 'system.quantity.value' : 'system.quantity') : 'system.charges';
  const before = Number(config.kind === 'scroll' ? quantityValue : item.system.charges);
  if (!Number.isInteger(before) || before <= 0) throw new Error('No charges remain, or charges have not been configured.');
  return { itemId: item.id, path, before, after: before - 1, config: JSON.stringify(config) };
}

export function assertItemSpellEligibility(context, config) {
  const key = spellClassKey(context.profile);
  if (config.allowedClasses.length) {
    if (!config.allowedClasses.includes(key)) throw new Error('This class cannot cast from this item.');
    return;
  }
  if (config.kind === 'item') return;
  const list = context.profile?.spellcasting?.spellList;
  if (list === config.listKey || key === 'mage' && ['magic-user', 'illusionist'].includes(config.listKey)) return;
  throw new Error('This spell source is not usable by this class.');
}
