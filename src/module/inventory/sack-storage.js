const SACK_NAMES = new Set(['Sack, Small', 'Sack, Large', 'Sidesack']);
const stripMagic = value => String(value ?? '').replace(/\s*[+-]\d+$/, '');
const baseName = item => stripMagic(item?.name);
const isTentPoles = item => (item?.system?.tags || []).includes('tent-poles') || /^Tent Poles, (1|2|4)-person$/.test(baseName(item));
const isWholeTent = item => /^Tent, (1|2|4)-person$/.test(baseName(item));
const isForbidden = item => item?.type === 'livestock'
  || ['Pole, Ten Foot', 'Shovel', 'Sling, Staff', 'Yoke, Ox', 'Battle Axe, 2-Handed'].includes(baseName(item))
  || isWholeTent(item) || isTentPoles(item);
const containsForbidden = (id, all, seen = new Set(), root = true) => {
  if (!id || seen.has(id)) return null;
  seen.add(id);
  const child = all.find(entry => (entry?.id ?? entry?._id) === id);
  if (!root && child?.system?.lashed) return null;
  if (isForbidden(child)) return child;
  return all.reduce((found, entry) => found || ((entry?.system?.containerId === id) ? containsForbidden(entry.id ?? entry._id, all, seen, false) : null), null);
};

export const isSack = container => SACK_NAMES.has(String(container?.name ?? ''));

const sackAncestor = (container, items) => {
  const all = items?.contents ?? Array.from(items ?? []);
  let current = container;
  const seen = new Set();
  while (current && !seen.has(current.id ?? current._id)) {
    const id = current.id ?? current._id;
    seen.add(id);
    if (isSack(current)) return current;
    if (current.system?.lashed) return null;
    current = all.find(entry => (entry?.id ?? entry?._id) === current.system?.containerId) ?? null;
  }
  return null;
};

/** Return a pure rejection for an item stored inside a sack-family container. */
export function getSackStorageRejection(item, container, items = null) {
  const sack = sackAncestor(container, items);
  if (!sack) return null;
  if (!isForbidden(item)) {
    const all = items?.contents ?? Array.from(items ?? []);
    const id = item?.id ?? item?._id;
    if (item?.type !== 'container' || !id) return null;
    const nested = containsForbidden(id, all);
    if (!nested) return null;
    return `${nested.name} cannot be stored inside ${sack.name}.`;
  }
  if (item.type === 'livestock') return `${item.name} cannot be stored inside ${sack.name}.`;
  if (isTentPoles(item)) return `${item.name} must be carried outside ${sack.name}.`;
  if (isWholeTent(item)) return `${item.name} must be separated into fabric and poles before ${sack.name} storage.`;
  return `${item.name} is too long or bulky for ${sack.name}.`;
}

/** Audit existing sack contents without moving or mutating them. */
export function auditSackContents(items) {
  const all = [...(items && 'contents' in Object(items) ? items.contents : (items ?? []))];
  const byId = new Map(all.map(item => [item?.id ?? item?._id, item]));
  return all.flatMap(item => {
    if (item?.system?.lashed) return [];
    const parent = byId.get(item?.system?.containerId);
    const reason = getSackStorageRejection(item, parent, all);
    return reason ? [{ item, container: parent, reason }] : [];
  });
}

export const sackStorageNames = SACK_NAMES;
