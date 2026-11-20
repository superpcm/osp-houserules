const SADDLE_NAMES = new Set(['Saddlebags, Small', 'Saddlebags, Large', 'Panniers']);
const LONG_NAMES = new Set([
  'Pole, Ten Foot', 'Shovel', 'Sling, Staff', 'Yoke, Ox',
  'Longbow', 'Shortbow', 'Javelin', 'Battle Axe, 2-Handed', 'Rapier',
  'Bastard Sword', 'Broadsword', 'Longsword', 'Khopesh', 'Scimitar', 'Falchion',
]);
const stripMagic = value => String(value ?? '').replace(/\s*[+-]\d+$/, '');
const baseName = item => stripMagic(item?.name);
const isWholeTent = item => /^Tent, (1|2|4)-person$/.test(baseName(item));
const isTentPoles = item => (item?.system?.tags || []).includes('tent-poles') || /^Tent Poles, (1|2|4)-person$/.test(baseName(item));
const isForbidden = item => item?.type === 'livestock' || LONG_NAMES.has(baseName(item)) || isWholeTent(item) || isTentPoles(item);
const list = items => items?.contents ?? Array.from(items ?? []);
const ancestor = (container, items) => {
  const all = list(items); let current = container; const seen = new Set();
  while (current && !seen.has(current.id ?? current._id)) {
    const id = current.id ?? current._id; seen.add(id);
    if (SADDLE_NAMES.has(current.name)) return current;
    if (current.system?.lashed) return null;
    current = all.find(entry => (entry.id ?? entry._id) === current.system?.containerId) ?? null;
  }
  return null;
};
const containsForbidden = (id, all, seen = new Set(), root = true) => {
  if (!id || seen.has(id)) return null; seen.add(id);
  const child = all.find(entry => (entry.id ?? entry._id) === id);
  if (!root && child?.system?.lashed) return null;
  if (isForbidden(child)) return child;
  return all.reduce((found, entry) => found || (entry.system?.containerId === id ? containsForbidden(entry.id ?? entry._id, all, seen, false) : null), null);
};
export const isSaddleStorage = container => SADDLE_NAMES.has(String(container?.name ?? ''));
export function getSaddleStorageRejection(item, container, items = null) {
  const saddle = ancestor(container, items); if (!saddle) return null;
  if (!isForbidden(item)) {
    const all = list(items); const id = item?.id ?? item?._id;
    if (item?.type !== 'container' || !id) return null;
    const nested = containsForbidden(id, all); if (!nested) return null;
    return `${nested.name} cannot be stored inside ${saddle.name}.`;
  }
  if (item?.type === 'livestock') return `${item.name} cannot be stored inside ${saddle.name}.`;
  if (isTentPoles(item)) return `${item.name} must be carried outside ${saddle.name}.`;
  if (isWholeTent(item)) return `${item.name} must be separated into fabric and poles before ${saddle.name} storage.`;
  return `${item.name} is too long or bulky for ${saddle.name}.`;
}
export function auditSaddleContents(items) {
  const all = list(items); const byId = new Map(all.map(item => [item.id ?? item._id, item]));
  return all.flatMap(item => {
    if (item?.system?.lashed) return [];
    const parent = byId.get(item?.system?.containerId); const reason = getSaddleStorageRejection(item, parent, all);
    return reason ? [{ item, container: parent, reason }] : [];
  });
}
export const auditSaddlebagContents = auditSaddleContents;
