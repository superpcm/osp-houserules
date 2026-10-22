const DOCUMENT_FIELDS = new Set(['_id', 'id', 'uuid', '_stats', 'sort', 'folder', 'ownership', 'pack', 'parent']);
const DERIVED_SYSTEM_FIELDS = new Set(['quantity', 'containerId', 'equipped', 'lashed']);

function ordered(value, path = '') {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid numeric identity field');
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') throw new Error('Invalid identity field');
  if (Array.isArray(value)) return value.map((entry) => ordered(entry, path));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => {
    if (!path && DOCUMENT_FIELDS.has(key)) return false;
    if (path === 'system' && DERIVED_SYSTEM_FIELDS.has(key)) return false;
    return true;
  }).map((key) => [key, ordered(value[key], path ? `${path}.${key}` : key)]));
}

export function stackIdentity(item) {
  try {
    const snapshot = item?.toObject ? item.toObject() : item;
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.name || !snapshot.type || !snapshot.system || typeof snapshot.system !== 'object' || Array.isArray(snapshot.system)) return null;
    if (snapshot.system.tags != null && !Array.isArray(snapshot.system.tags)) return null;
    const identity = { ...snapshot, system: { ...snapshot.system } };
    // OspItem.prepareData derives these totals only for treasure items.
    if (snapshot.type === 'item' && snapshot.system.treasure === true) {
      delete identity.system.cumulativeCost; delete identity.system.cumulativeWeight;
    }
    return ordered(identity);
  } catch (_error) { return null; }
}

export function isUniqueStackItem(item) {
  const snapshot = item?.toObject ? item.toObject() : item;
  const system = snapshot?.system;
  const chargedSpellItem = system?.spellKey && system?.spellClass && system?.spellSourceKind !== 'scroll' && !system?.tags?.includes('scroll') && snapshot?.type !== 'scroll';
  return Boolean(chargedSpellItem || snapshot?.flags?.['osp-houserules']?.spellbook === true || snapshot?.system?.unique === true || Array.isArray(snapshot?.system?.tags) && snapshot.system.tags.includes('unique'));
}

export function canStackItems(first, second) {
  const left = stackIdentity(first);
  const right = stackIdentity(second);
  if (!left || !right || isUniqueStackItem(first) || isUniqueStackItem(second)) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}
