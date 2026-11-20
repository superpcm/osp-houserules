export const SYSTEM_ID = 'osp-houserules';
export const ARROW_BUNDLE_FLAG = 'protectedArrowBundle';
export const ARROW_BUNDLE_LIMIT = 20;
export const ARROW_SALE_BUNDLE_QUANTITY = 20;
import { isBackpack } from './long-item-transport.js';

const clone = value => structuredClone(value);

export function isArrowAmmo(item) {
  return item?.type === 'ammunition' && (item?.system?.tags || []).includes('arrows');
}

export function isProtectedArrowBundle(item) {
  return item?.flags?.[SYSTEM_ID]?.[ARROW_BUNDLE_FLAG] === true;
}

/** Return true only for arrow-accepting quivers, never for bolt cases. */
export function isArrowQuiver(container) {
  if (!container || container.type !== 'container') return false;
  if (/bolt\s*case/i.test(String(container.name || ''))) return false;
  const allowed = container.system?.allowedTypes;
  const acceptsArrows = Array.isArray(allowed)
    ? allowed.some(type => String(type).toLowerCase() === 'arrows')
    : String(allowed || '').toLowerCase().split(/[,\s]+/).includes('arrows');
  return acceptsArrows && /quiver/i.test(String(container.name || ''));
}

/** Normalize an arrow item for placement, removing only our protection marker in a quiver. */
export function prepareArrowQuiverPlacement(itemData, container) {
  const result = clone(itemData);
  if (isArrowAmmo(result) && isArrowQuiver(container)) {
    const scopeFlags = result.flags?.[SYSTEM_ID];
    if (scopeFlags && Object.prototype.hasOwnProperty.call(scopeFlags, ARROW_BUNDLE_FLAG)) {
      delete scopeFlags[ARROW_BUNDLE_FLAG];
      if (!Object.keys(scopeFlags).length) delete result.flags[SYSTEM_ID];
      result.flags ??= {};
    }
  }
  return result;
}

/** Make a catalog/store sale copy: one standard twenty-arrow protected bundle. */
export function prepareArrowSaleBundle(itemData) {
  const result = clone(itemData);
  if (!isArrowAmmo(result)) return result;
  result.system = { ...(result.system || {}), quantity: ARROW_SALE_BUNDLE_QUANTITY };
  result.flags = { ...(result.flags || {}), [SYSTEM_ID]: { ...(result.flags?.[SYSTEM_ID] || {}), [ARROW_BUNDLE_FLAG]: true } };
  return result;
}

/** Idempotently unpack protected arrow items already stored inside quivers. */
export async function repairQuiverArrowBundles({ gameRef = globalThis.game } = {}) {
  if (!gameRef?.user?.isGM) return { success: false, repaired: 0, reason: 'GM permission is required.' };
  const asArray = collection => collection?.contents ?? (Array.isArray(collection)
    ? collection
    : typeof collection?.values === 'function' ? [...collection.values()] : [...(collection ?? [])]);
  const actors = new Map();
  for (const actor of asArray(gameRef.actors)) actors.set(actor.uuid ?? actor.id, actor);
  for (const scene of asArray(gameRef.scenes)) for (const token of asArray(scene.tokens)) {
    if (token.actor) actors.set(token.actor.uuid ?? token.actor.id, token.actor);
  }
  let repaired = 0;
  for (const actor of actors.values()) {
    const items = actor.items?.contents ?? actor.items ?? [];
    for (const item of items) {
      if (!isProtectedArrowBundle(item)) continue;
      const parent = items.find(candidate => candidate.id === item.system?.containerId);
      if (!isArrowQuiver(parent)) continue;
      const normalized = prepareArrowQuiverPlacement(item.toObject?.() ?? item, parent);
      const scopeFlags = item.flags?.[SYSTEM_ID] ?? {};
      const changes = Object.keys(scopeFlags).some(key => key !== ARROW_BUNDLE_FLAG)
        ? { [`flags.${SYSTEM_ID}.-=${ARROW_BUNDLE_FLAG}`]: null }
        : { [`flags.-=${SYSTEM_ID}`]: null };
      await item.update(changes);
      if (!isProtectedArrowBundle(item)) repaired += 1;
    }
  }
  return { success: true, repaired };
}

export function getArrowBundleValidationError(item) {
  if (!isProtectedArrowBundle(item)) return null;
  if (!isArrowAmmo(item)) return 'Protected arrow bundles must be arrow ammunition.';
  const quantity = Number(item?.system?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > ARROW_BUNDLE_LIMIT) {
    return `Protected arrow bundles must contain 1-${ARROW_BUNDLE_LIMIT} arrows.`;
  }
  return null;
}

export function getArrowBundleLashDecision(item, host) {
  if (!isProtectedArrowBundle(item)) return { allowed: null, reason: null };
  const validation = getArrowBundleValidationError(item);
  if (validation) return { allowed: false, reason: validation };
  if (isBackpack(host)) return { allowed: true, reason: null };
  return { allowed: false, reason: 'Protected arrow bundles may only be lashed to a Backpack.' };
}
