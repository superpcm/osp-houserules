import { capacityValue, storageFootprint } from './bulk.js';
import vehicleCatalogData from '../../../data/vehicles.json';
import tackCatalogData from '../../../data/tack.json';
import miscCatalogData from '../../../data/misc.json';
import gearCatalogData from '../../../data/gear.json';

export const VEHICLE_KINDS = [
  { id: 'none', label: 'Not a vehicle' }, { id: 'wagon', label: 'Wagon' },
  { id: 'cart', label: 'Cart' }, { id: 'handcart', label: 'Handcart' },
  { id: 'wheelbarrow', label: 'Wheelbarrow' },
];
export const VEHICLE_ATTACHMENT_KINDS = [
  { id: 'none', label: 'No vehicle attachment' }, { id: 'wagon-wheel', label: 'Wagon wheel' },
  { id: 'cart-wheel', label: 'Cart wheel' }, { id: 'wagon-axle', label: 'Wagon axle' },
  { id: 'cart-axle', label: 'Cart axle' }, { id: 'cover', label: 'Wagon cover' },
  { id: 'net', label: 'Cargo net' }, { id: 'ox-yoke', label: 'Ox yoke' },
  { id: 'tool', label: 'Tool' }, { id: 'rope', label: 'Rope' },
  { id: 'bedroll', label: 'Bedroll' }, { id: 'tent', label: 'Tent' },
  { id: 'bucket', label: 'Bucket' },
];

const kindSet = new Set(VEHICLE_KINDS.map(x => x.id));
const attachmentSet = new Set(VEHICLE_ATTACHMENT_KINDS.map(x => x.id));
const idOf = value => value?.id ?? value?._id ?? value;
const vehicleBulk = (item, items) => storageFootprint(item, items, { includeLashedEdges: true });
const nameType = item => `${item?.name}|${item?.type}`;
const catalogItems = [...vehicleCatalogData, ...tackCatalogData, ...miscCatalogData, ...gearCatalogData];
function catalogValue(item, key, allowed) {
  const matches = catalogItems.filter(entry => entry.name === item?.name && entry.type === item?.type);
  return matches.length === 1 && allowed.has(matches[0].system?.[key]) ? matches[0].system[key] : 'none';
}
const explicit = (item, key, allowed) => {
  if (!item?.system || item.system[key] == null) return undefined;
  return allowed.has(item.system[key]) ? item.system[key] : 'none';
};

export function getVehicleKind(item) {
  const value = explicit(item, 'vehicleKind', kindSet);
  return value !== undefined ? value : catalogValue(item, 'vehicleKind', kindSet);
}
export function getVehicleAttachmentKind(item) {
  const value = explicit(item, 'vehicleAttachmentKind', attachmentSet);
  return value !== undefined ? value : catalogValue(item, 'vehicleAttachmentKind', attachmentSet);
}

const slots = {
  wagon: ['left', 'right', 'underframe', 'tool-1', 'tool-2', 'tool-3', 'hook-1', 'hook-2', 'canopy', 'cargo-net'],
  cart: ['rear-rail', 'underframe', 'tool-1', 'tool-2', 'hook-1', 'hook-2', 'cargo-net'],
  handcart: ['rear-rail', 'underframe', 'tool-1', 'tool-2', 'hook-1', 'hook-2', 'cargo-net'],
  wheelbarrow: [],
};
const labels = { left: 'Left side', right: 'Right side', underframe: 'Underframe', 'rear-rail': 'Rear rail', canopy: 'Canopy', 'cargo-net': 'Cargo net' };
const option = (mode, position) => ({ mode, position, label: `${mode === 'installed' ? 'Install' : 'Lash'} at ${labels[position] ?? position}` });
const hostKind = host => getVehicleKind(host);
const attachment = item => item?.system?.vehicleAttachment;
const isVehicleAttachment = item => attachment(item) && item.system.containerId != null;

function positionsFor(kind, type, mode) {
  if (!slots[kind] || kind === 'wheelbarrow') return [];
  if (type === 'wagon-wheel' && kind === 'wagon' && mode === 'lashed') return ['left', 'right'];
  if (type === 'cart-wheel' && ['cart', 'handcart'].includes(kind) && mode === 'lashed') return ['rear-rail'];
  if (type === 'wagon-axle' && kind === 'wagon' && mode === 'lashed') return ['underframe'];
  if (type === 'cart-axle' && ['cart', 'handcart'].includes(kind) && mode === 'lashed') return ['underframe'];
  if (type === 'cover' && kind === 'wagon') return mode === 'lashed' ? ['left', 'right'] : mode === 'installed' ? ['canopy'] : [];
  if (type === 'net' && ['wagon', 'cart', 'handcart'].includes(kind)) return mode === 'lashed' ? ['hook-1', 'hook-2'] : ['cargo-net'];
  if (type === 'ox-yoke' && kind === 'wagon' && mode === 'lashed') return ['underframe'];
  if (type === 'tool' && kind !== 'wheelbarrow' && mode === 'lashed') return slots[kind].filter(x => x.startsWith('tool-'));
  if (type === 'rope' && kind !== 'wheelbarrow' && mode === 'lashed') return slots[kind].filter(x => x.startsWith('hook-'));
  if (['bedroll', 'tent'].includes(type)) return kind === 'wagon' && mode === 'lashed' ? ['left', 'right'] : ['wagon', 'cart', 'handcart'].includes(kind) && mode === 'lashed' ? (kind === 'wagon' ? ['left', 'right'] : ['rear-rail']) : [];
  if (type === 'bucket' && kind !== 'wheelbarrow' && mode === 'lashed') return slots[kind].filter(x => x.startsWith('hook-'));
  return [];
}

function reason(message) { return { allowed: false, reason: message }; }
function allItems(items) { return items?.contents ? [...items.contents] : [...(items ?? [])]; }
function siblingLimit(type, mode, position) {
  if (type === 'wagon-wheel') return 2;
  if (type === 'cart-wheel' || type === 'wagon-axle' || type === 'cart-axle' || type === 'ox-yoke' || type === 'cover' || type === 'net' || type === 'bucket') return 1;
  if (type === 'tool') return position.startsWith('tool-') ? 1 : 0;
  if (type === 'rope') return 1;
  if (type === 'bedroll' || type === 'tent') return 1;
  return 1;
}
function cycle(items, childId, hostId) {
  let current = hostId, seen = new Set();
  while (current != null) { if (current === childId || seen.has(current)) return true; seen.add(current); current = items.find(x => idOf(x) === current)?.system?.containerId; }
  return false;
}

export function checkVehicleAttachment(item, host, items, requested, { excludeId } = {}) {
  const list = allItems(items), kind = hostKind(host), type = getVehicleAttachmentKind(item), id = idOf(item), hostId = idOf(host);
  if (!attachmentSet.has(type) || type === 'none') return reason('Item is not a supported vehicle attachment');
  if (!['lashed', 'installed'].includes(requested?.mode) || typeof requested?.position !== 'string') return reason('Invalid vehicle attachment state');
  if (host?.type !== 'container' || getVehicleKind(host) === 'none' || host?.system?.containerId != null || Number(host?.system?.quantity ?? 1) !== 1) return reason('Host is not a root vehicle');
  if (id === hostId || cycle(list, id, hostId)) return reason('Vehicle attachment would create a containment cycle');
  if (Number(item?.system?.quantity ?? 1) !== 1) return reason('Vehicle attachments must have quantity 1');
  if (!positionsFor(kind, type, requested.mode).includes(requested.position)) return reason('Attachment is incompatible with that vehicle slot');
  const occupied = list.filter(other => idOf(other) !== excludeId && idOf(other) !== id && other.system?.containerId === hostId && other.system?.vehicleAttachment?.position === requested.position);
  if (occupied.length) return reason('Vehicle slot is occupied');
  const same = list.filter(other => idOf(other) !== excludeId && idOf(other) !== id && other.system?.containerId === hostId && other.system?.vehicleAttachment?.mode === requested.mode && getVehicleAttachmentKind(other) === type);
  const max = type === 'wagon-wheel' ? 2 : (['bedroll', 'tent'].includes(type) ? (kind === 'wagon' ? 2 : 1) : type === 'tool' ? slots[kind].filter(x => x.startsWith('tool-')).length : type === 'rope' ? slots[kind].filter(x => x.startsWith('hook-')).length : siblingLimit(type, requested.mode, requested.position));
  if (same.length >= max) return reason('Vehicle attachment limit exceeded');
  if (type === 'bucket' && list.some(other => idOf(other) !== id && other.system?.containerId === id)) return reason('Bucket must be empty before attachment');
  const projected = list.filter(other => other.system?.containerId === hostId && idOf(other) !== excludeId && idOf(other) !== id).reduce((sum, other) => sum + vehicleBulk(other, list), vehicleBulk(item, list));
  if (projected > capacityValue(host.system?.capacity)) return reason('Vehicle capacity exceeded');
  return { allowed: true, reason: null };
}

export function getVehicleAttachmentOptions(item, host, items, { excludeId } = {}) {
  const kind = hostKind(host), type = getVehicleAttachmentKind(item);
  return ['lashed', 'installed'].flatMap(mode => positionsFor(kind, type, mode).map(position => option(mode, position)))
    .filter(candidate => checkVehicleAttachment(item, host, items, candidate, { excludeId }).allowed);
}

export function validateVehicleAttachments(items, { baselineItems } = {}) {
  const list = allItems(items);
  const baselineList = allItems(baselineItems);
  const unchangedBaseline = (current, parent) => {
    const prior = baselineList.find(x => idOf(x) === idOf(current));
    if (!prior || JSON.stringify({ containerId: current.system?.containerId, attachment: current.system?.vehicleAttachment, quantity: current.system?.quantity, kind: getVehicleAttachmentKind(current) })
      !== JSON.stringify({ containerId: prior.system?.containerId, attachment: prior.system?.vehicleAttachment, quantity: prior.system?.quantity, kind: getVehicleAttachmentKind(prior) })) return false;
    const priorParent = baselineList.find(x => idOf(x) === prior.system?.containerId);
    // Grandfather only a pre-existing invalid fitting. An unchanged fitting must
    // not excuse a newly introduced conflict, filled bucket, or altered host.
    if (!priorParent || checkVehicleAttachment(prior, priorParent, baselineList, prior.system.vehicleAttachment, { excludeId: idOf(prior) }).allowed) return false;
    if (!parent) return true;
    const priorChildren = baselineList.filter(x => x.system?.containerId === idOf(parent));
    const currentBulk = list.filter(x => x.system?.containerId === idOf(parent)).reduce((sum, x) => sum + vehicleBulk(x, list), 0);
    const priorBulk = priorChildren.reduce((sum, x) => sum + vehicleBulk(x, baselineList), 0);
    return currentBulk <= priorBulk;
  };
  for (const candidate of list) {
    const seen = new Set(), candidateId = idOf(candidate);
    let parent = candidate.system?.containerId;
    while (parent != null) {
      if (parent === candidateId || seen.has(parent)) return reason('Containment cycle detected');
      seen.add(parent);
      parent = list.find(x => idOf(x) === parent)?.system?.containerId;
    }
  }
  for (const child of list.filter(x => x.system?.vehicleAttachment)) {
    const host = list.find(x => idOf(x) === child.system?.containerId);
    if (!host || getVehicleKind(host) === 'none') return reason('Vehicle attachment host is invalid');
    const stateResult = checkVehicleAttachment(child, host, list, child.system.vehicleAttachment, { excludeId: idOf(child) });
    if (!stateResult.allowed && !unchangedBaseline(child, host)) return stateResult;
  }
  for (const vehicle of list.filter(x => getVehicleKind(x) !== 'none')) {
    const children = list.filter(x => x.system?.containerId === idOf(vehicle));
    if (children.reduce((sum, x) => sum + vehicleBulk(x, list), 0) > capacityValue(vehicle.system?.capacity)) {
      const prior = baselineList.find(x => idOf(x) === idOf(vehicle));
      const priorBulk = baselineList.filter(x => x.system?.containerId === idOf(vehicle)).reduce((sum, x) => sum + vehicleBulk(x, baselineList), 0);
      if (!prior || children.reduce((sum, x) => sum + vehicleBulk(x, list), 0) > priorBulk) return reason('Vehicle capacity exceeded');
    }
    for (const child of children.filter(isVehicleAttachment)) {
      const state = attachment(child);
      const result = checkVehicleAttachment(child, vehicle, list, state, { excludeId: idOf(child) });
      if (!result.allowed && !unchangedBaseline(child, vehicle)) return result;
    }
  }
  return { allowed: true, reason: null };
}

export function vehicleDestination(hostId, value) { return `__vehicle__:${encodeURIComponent(JSON.stringify({ hostId, ...value }))}`; }
export function parseVehicleDestination(value) {
  if (typeof value !== 'string' || !value.startsWith('__vehicle__:')) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value.slice(12)));
    return typeof parsed?.hostId === 'string' && parsed.hostId && ['lashed', 'installed'].includes(parsed.mode)
      && typeof parsed.position === 'string' && parsed.position ? parsed : null;
  } catch { return null; }
}
export function readableVehicleAttachmentLabel(value) { return `${value?.mode === 'installed' ? 'Installed' : 'Lashed'} at ${labels[value?.position] ?? value?.position ?? 'vehicle'}`; }
