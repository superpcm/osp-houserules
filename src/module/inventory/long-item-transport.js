const BACKPACK_NAMES = new Set(['Backpack', "Traveler's Backpack"]);
const INTERNAL_FORBIDDEN = new Set([
  'Staff', 'Spear', 'Javelin', 'Shortbow', 'Longbow', 'Sling, Staff',
  'Pole Arm', 'Lance', 'Pole, Ten Foot', 'Shovel', 'Crowbar', 'Instrument',
  'Yoke, Ox', 'Tent, 1-person', 'Tent, 2-person', 'Tent, 4-person',
]);
const BACKPACK_LASH_ALLOWED = new Set([
  'Staff', 'Spear', 'Javelin', 'Shortbow', 'Longbow', 'Sling, Staff',
  'Shovel', 'Crowbar', 'Instrument', 'Tent, 1-person', 'Tent, 2-person',
  'Mess Kit', "Healer's Kit", 'Mallet, Wooden', 'Waterskin', 'Wineskin',
]);
const stripMagic = value => String(value ?? '').replace(/\s*[+-]\d+$/, '');
const baseName = item => stripMagic(item?.name);
export const isWinterCoat = item => baseName(item) === 'Coat, Winter';
export const isRollableGarment = item => ['Coat, Winter', 'Cloak'].includes(baseName(item));
export function rolledGarmentLashRejection(item, inventory = null) {
  const items = inventory ?? item?.actor?.items ?? null;
  const id = item?.id ?? item?._id;
  const children = list(items).filter(child => child?.system?.containerId === id);
  if (item?.system?.equipped) return `${item.name} must be unequipped before it can be lashed to a Backpack.`;
  if (children.length) return `${item.name} must have empty pockets before it can be lashed to a Backpack.`;
  return null;
}
export const winterCoatLashRejection = rolledGarmentLashRejection;
const tagsOf = item => Array.isArray(item?.system?.tags) ? item.system.tags : [];
const isTentFabric = item => tagsOf(item).includes('tent-fabric') || /^Tent Fabric, (1|2|4)-person$/.test(baseName(item));
const isTentPoles = item => tagsOf(item).includes('tent-poles') || /^Tent Poles, (1|2|4)-person$/.test(baseName(item));
const isWholeTent = item => /^Tent, (1|2|4)-person$/.test(baseName(item));
const isLivestock = item => item?.type === 'livestock';
const isOxYoke = item => baseName(item) === 'Yoke, Ox';
const isBackpackHost = (container, items) => {
  let current = container;
  const seen = new Set();
  while (current && !seen.has(current.id ?? current._id ?? current)) {
    const id = current.id ?? current._id ?? current;
    seen.add(id);
    if (isBackpack(current)) return true;
    if (current.system?.lashed) return false;
    const parentId = current.system?.containerId;
    current = list(items).find(candidate => (candidate.id ?? candidate._id) === parentId) ?? null;
  }
  return false;
};
export const isBackpack = container => BACKPACK_NAMES.has(String(container?.name ?? '').replace(/\s*[+-]\d+$/, ''));
export const isLongItem = item => INTERNAL_FORBIDDEN.has(baseName(item)) || isTentPoles(item);
const list = items => items?.contents ?? Array.from(items ?? []);
const containsBackpackForbidden = (item, items, seen = new Set()) => {
  if (!item) return false;
  const id = item.id ?? item._id ?? item;
  if (seen.has(id)) return false;
  seen.add(id);
  if (!isTentFabric(item) && (isLongItem(item) || isLivestock(item) || isOxYoke(item))) return true;
  return list(items).filter(child => child?.system?.containerId === id)
    .some(child => containsBackpackForbidden(child, items, seen));
};
export const isBackpackInternalForbidden = (item, container, items = null) => {
  if (!containsBackpackForbidden(item, items)) return false;
  return isBackpackHost(container, items);
};

/** Return the pure backpack-placement rejection, or null when the placement is valid. */
export function getBackpackStorageRejection(item, container, items = null) {
  if (!isBackpackHost(container, items)) return null;
  if (isLivestock(item)) return `${item.name} cannot be stored in or lashed to a Backpack.`;
  if (isOxYoke(item)) return `${item.name} cannot be stored in or lashed to a Backpack.`;
  if (isTentFabric(item)) return null;
  if (isTentPoles(item)) return `${item.name} must be carried outside the Backpack.`;
  if (isWholeTent(item)) return `${item.name} must be separated into fabric and poles before Backpack storage.`;
  if (isBackpackInternalForbidden(item, container, items)) {
    return `${item.name} cannot be stored inside a Backpack; lash it externally.`;
  }
  return null;
}

/** Audit nested backpack contents without moving or updating any item. */
export function auditBackpackContents(items) {
  const all = [...(items && 'contents' in Object(items) ? items.contents : (items ?? []))];
  const byId = new Map(all.map(item => [item?.id ?? item?._id, item]));
  return all.flatMap(item => {
    if (item?.system?.lashed) return [];
    const parent = byId.get(item?.system?.containerId);
    const reason = getBackpackStorageRejection(item, parent, all);
    // A deep wrapper is rejected at placement time, but the audit points at the
    // actual offending descendant so the sheet warning identifies what must move.
    if (item?.type === 'container' && !isLongItem(item)) return [];
    return reason ? [{ item, container: parent, reason }] : [];
  });
}

export function backpackLashDecision(item, container, inventory = null) {
  if (!isBackpack(container)) return { allowed: null, reason: null };
  const name = baseName(item);
  if (isRollableGarment(item)) {
    const reason = rolledGarmentLashRejection(item, inventory);
    if (reason) return { allowed: false, reason };
    return { allowed: true, reason: null };
  }
  if (isLivestock(item) || isOxYoke(item)) return { allowed: false, reason: `${item.name} cannot be lashed to a Backpack.` };
  if (isTentFabric(item)) return { allowed: false, reason: `${item.name} belongs inside the Backpack, not on a lash point.` };
  if (isTentPoles(item)) return { allowed: true, reason: null };
  // Standard quivers may be lashed externally to a Backpack, regardless of
  // stale per-item lashable/slotCost data on legacy actor items.
  if (name === 'Quiver') return { allowed: true, reason: null };
  if (isWholeTent(item) && (name === 'Tent, 4-person' || item?.system?.lashable === false)) {
    return { allowed: false, reason: `${item.name} cannot be lashed to a Backpack.` };
  }
  if (name === 'Pole, Ten Foot') return item?.flags?.['osp-houserules']?.disassembled === true
    ? { allowed: true, reason: null } : { allowed: false, reason: 'The ten-foot pole must be disassembled before it can be lashed to a Backpack.' };
  if (BACKPACK_LASH_ALLOWED.has(name)) return { allowed: true, reason: null };
  if (name === 'Pole Arm' || name === 'Lance') return { allowed: false, reason: `${item.name} is too unwieldy for Backpack lash points.` };
  return { allowed: null, reason: null };
}
