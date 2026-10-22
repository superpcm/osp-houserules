const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function spellbookVolumeKey(itemId, volume) {
  return `${itemId}-${volume}`;
}

export function spellbookVolumeForKey(key, itemId) {
  if (typeof key !== 'string' || typeof itemId !== 'string' || !itemId) return null;
  const match = key.match(new RegExp(`^${escapeRegExp(itemId)}-([0-9]+)$`));
  if (!match) return null;
  const volume = Number(match[1]);
  return Number.isSafeInteger(volume) && volume > 0 ? volume : null;
}

export function isPersistedSpellbookItem(item, books = {}) {
  if (!item || item.type !== 'item') return false;
  return Object.keys(books).some(key => spellbookVolumeForKey(key, item.id) !== null);
}

export function isSpellbookItem(item, books = {}) {
  return item?.type === 'item' && (item.name === 'Spellbook' || item.flags?.['osp-houserules']?.spellbook === true || isPersistedSpellbookItem(item, books));
}

export function spellbookName(context, state, key) {
  const item = context.items.find(candidate => spellbookVolumeForKey(key, candidate.id) !== null);
  const volume = spellbookVolumeForKey(key, item?.id ?? '');
  if (item?.flags?.['osp-houserules']?.spellbook === true && Number(item.system?.quantity ?? 1) === 1) return item.name;
  const custom = Object.hasOwn(context.bookNames ?? {}, key) ? context.bookNames[key] : state?.books?.[key]?.name;
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return `${item?.name ?? 'Missing Spellbook'} — volume ${volume ?? key}`;
}

/**
 * Return every volume that records a spell, including books that are no
 * longer available in the actor's current inventory. Historical records are
 * deliberately retained so the UI never offers a misleading reassignment.
 */
export function spellbookAssignments(context, state, spellId) {
  if (!spellId || !state?.books) return [];
  const currentBookIds = new Set(context?.bookIds ?? []);
  const nameContext = { ...(context ?? {}), items: context?.items ?? [], bookNames: context?.bookNames ?? {} };
  return Object.entries(state.books)
    .filter(([, book]) => Array.isArray(book?.spellIds) && book.spellIds.includes(spellId))
    .map(([key, book]) => ({
      key,
      name: spellbookName(nameContext, state, key),
      available: Boolean(book.available),
      current: currentBookIds.has(key)
    }));
}
