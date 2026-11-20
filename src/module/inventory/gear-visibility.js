import { physicalItemTypes } from './containment.js';
import { normalizeQuantity, unitWeightPounds } from './encumbrance.js';

export const GEAR_VISIBILITY_AUDIT_VERSION = 1;

const itemId = item => item?.id ?? item?._id ?? null;
const auditViewFields = new Set([
  'id', '_id', 'uuid', 'name', 'type', 'img', 'system', 'sort',
  'displayWeight', 'displayQuantity', 'displayUnitWeight', 'displayCapacity', 'unitWeight', 'itemId',
  '_gearSection', 'collapsed', 'storageCollapsed', 'lashedCollapsed',
  'containedItems', 'lashedItems', 'storedItems', 'subContainers', 'storedWeapon', 'storedItem',
  'hasContents', 'capacityLabel', 'capacityPercentage', 'remainingCapacity', 'usedCapacity',
  'maxCapacity', 'totalWeight', 'isProtectedBundle', 'isConsumableWeapon',
  'pouchStorageWarning', 'pouchContentsWarning', 'clothingStorageWarning', 'gearVisibilityWarning',
  'clothingWearWarning', 'containedAmmunition', 'hasStoredContent', 'isExpanded',
  'isFirstLashedAttachment', 'isLastLashedAttachment', 'isSack', 'isSpellFocus',
  'lashSlotPercentage', 'lashSlots', 'slingCapacityPercentage', 'slingUsedCapacity',
  'usedLashSlots', 'vehicleAttachmentLabel', '_isUnarmedPlaceholder'
]);
const auditSkipFields = new Set(['actor', 'parent', 'collection', 'apps', '_sheet', '_source', 'documentName']);

const plainClone = value => {
  if (value == null || typeof value !== 'object') return value;
  if (typeof value.toObject === 'function') return value.toObject(false);
  if (Array.isArray(value)) return value.map(plainClone);
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'function') result[key] = plainClone(entry);
  }
  return result;
};

export function cloneGearAuditView(value, seen = new WeakMap()) {
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (typeof value.toObject === 'function') {
    const base = value.toObject(false);
    if (base == null || typeof base !== 'object') return base;
    const result = {};
    seen.set(value, result);
    for (const key of auditViewFields) {
      if (key in base) result[key] = ['collapsed', 'storageCollapsed', 'lashedCollapsed'].includes(key)
        ? false
        : cloneGearAuditView(base[key], seen);
      else if (key in value && typeof value[key] !== 'function') result[key] = ['collapsed', 'storageCollapsed', 'lashedCollapsed'].includes(key)
        ? false
        : cloneGearAuditView(value[key], seen);
    }
    return result;
  }
  if (Array.isArray(value)) {
    const result = [];
    seen.set(value, result);
    value.forEach(entry => result.push(cloneGearAuditView(entry, seen)));
    return result;
  }
  const result = {};
  seen.set(value, result);
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'function' || auditSkipFields.has(key)) continue;
    result[key] = ['collapsed', 'storageCollapsed', 'lashedCollapsed'].includes(key)
      ? false
      : cloneGearAuditView(entry, seen);
  }
  return result;
}

// Preserve Foundry schema/field instances; only inventory presentation trees need
// detached expansion. Cloning the entire sheet context breaks form helpers.
export function createGearAuditContext(context) {
  const audit = { ...context, gearAuditOnly: true, bodyCollapsed: false, slungCollapsed: false };
  const seen = new WeakMap();
  for (const key of ['clothing', 'bodyClothing', 'items', 'containers', 'topLevelGearItems',
    'slungItems', 'vehicles', 'livestock', 'weapons', 'allWeapons', 'armor',
    'allShields', 'wornArmor', 'equippedWeapons', 'unequippedWeapons']) {
    if (Array.isArray(context[key])) audit[key] = cloneGearAuditView(context[key], seen);
  }
  return audit;
}

const relevantSource = item => {
  const source = typeof item?.toObject === 'function' ? item.toObject(false) : item;
  return {
    id: itemId(item),
    name: source?.name ?? item?.name ?? '',
    type: source?.type ?? item?.type ?? '',
    img: source?.img ?? item?.img ?? '',
    system: plainClone(source?.system ?? item?.system ?? {})
  };
};

export function gearSourceSignature(items = []) {
  return JSON.stringify(items
    .filter(item => physicalItemTypes.has(item?.type))
    .map(relevantSource)
    .sort((a, b) => String(a.id).localeCompare(String(b.id))));
}

export function computeMissingGearItems(items = [], coveredIds = new Set(), combatIds = new Set()) {
  return items.filter(item => {
    const id = itemId(item);
    return physicalItemTypes.has(item?.type) && id && !coveredIds.has(id) && !combatIds.has(id);
  });
}

export function gearFallbackView(item, reason = 'Not shown in a standard Gear group; displayed here so it cannot be hidden.') {
  const view = plainClone(item);
  const quantity = normalizeQuantity(item?.system?.quantity);
  view.id = itemId(item);
  view._id = view.id;
  view._gearSection = 'item';
  view.displayWeight = Math.round(unitWeightPounds(item) * quantity * 100) / 100;
  view.displayQuantity = quantity;
  view.displayUnitWeight = Math.round(unitWeightPounds(item) * 100) / 100;
  view.gearVisibilityWarning = reason;
  return view;
}

export function gearVisibilityWarning(item, parentName = null) {
  if (item?.system?.containerId) {
    return `This item was not shown in its recorded parent${parentName ? ` (${parentName})` : ''}; it is displayed here so it cannot be hidden.`;
  }
  if (item?.system?.lashed) {
    return `This item was not shown in its recorded lash host${parentName ? ` (${parentName})` : ''}; it is displayed here so it cannot be hidden.`;
  }
  return 'This item was not shown in a standard Gear group; it is displayed here so it cannot be hidden.';
}

export function parseGearAuditItemIds(html, knownIds = new Set()) {
  if (typeof DOMParser === 'undefined') {
    const covered = new Set();
    const rowPattern = /<(?:li|div)\b[^>]*>/gi;
    const rowClasses = /(?:^|\s)(?:item-entry|slung-item|lashed-attachment|lashed-item|lashed-stored-item|lashed-sub-stored-item|lashed-deep-stored-item|vehicle-entry|livestock-entry)(?:\s|$)/;
    const idPattern = /\bdata-item-id=["']([^"']+)["']/i;
    for (const match of String(html ?? '').matchAll(rowPattern)) {
      const tag = match[0];
      const classes = tag.match(/\bclass=["']([^"']*)["']/i)?.[1] || '';
      const id = tag.match(idPattern)?.[1];
      if (id && rowClasses.test(classes) && knownIds.has(id)) covered.add(id);
    }
    return covered;
  }
  const document = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const covered = new Set();
  for (const row of document.querySelectorAll('.item-entry[data-item-id], .slung-item[data-item-id], .lashed-attachment[data-item-id], .lashed-item[data-item-id], .lashed-stored-item[data-item-id], .lashed-sub-stored-item[data-item-id], .lashed-deep-stored-item[data-item-id], .vehicle-entry[data-item-id], .livestock-entry[data-item-id]')) {
    const id = row.getAttribute('data-item-id');
    if (id && knownIds.has(id)) covered.add(id);
  }
  return covered;
}

export async function auditRenderedGear({ context, items = [], cache = null, revision = '' }) {
  const signature = `${gearSourceSignature(items)}|${revision}`;
  if (cache?.version === GEAR_VISIBILITY_AUDIT_VERSION
      && cache?.signature === signature
      && cache?.warning == null
      && cache.coveredIds instanceof Set) return cache;
  const knownIds = new Set(items.map(itemId).filter(Boolean));
  try {
    const renderTemplate = globalThis.foundry?.applications?.handlebars?.renderTemplate;
    if (typeof renderTemplate !== 'function') throw new Error('Foundry template renderer unavailable');
    const auditContext = createGearAuditContext(context);
    const html = await renderTemplate('systems/osp-houserules/templates/actors/character-sheet.html', auditContext);
    return { version: GEAR_VISIBILITY_AUDIT_VERSION, signature, coveredIds: parseGearAuditItemIds(html, knownIds), warning: null };
  } catch (error) {
    return {
      version: GEAR_VISIBILITY_AUDIT_VERSION,
      signature,
      coveredIds: new Set(),
      warning: `Gear visibility audit unavailable: ${error?.message || 'template render failed'}`
    };
  }
}
