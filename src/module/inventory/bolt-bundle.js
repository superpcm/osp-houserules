export const SYSTEM_ID = 'osp-houserules';
export const BOLT_BUNDLE_FLAG = 'protectedBoltBundle';
export const BOLT_BUNDLE_LIMIT = 20;
export const BOLT_SALE_BUNDLE_QUANTITY = 20;
import { isBackpack } from './long-item-transport.js';

export function isBoltAmmo(item) { return item?.type === 'ammunition' && (item?.system?.tags || []).includes('bolts'); }
export function isProtectedBoltBundle(item) { return item?.flags?.[SYSTEM_ID]?.[BOLT_BUNDLE_FLAG] === true; }
export function isBoltCase(container) {
  if (!container || container.type !== 'container') return false;
  const allowed = container.system?.allowedTypes;
  const accepts = Array.isArray(allowed) ? allowed.some(v => String(v).toLowerCase() === 'bolts') : String(allowed || '').toLowerCase().split(/[,\s]+/).includes('bolts');
  return accepts && /bolt\s*case/i.test(String(container.name || ''));
}
export function prepareBoltCasePlacement(itemData, container) {
  const result = structuredClone(itemData);
  if (isProtectedBoltBundle(result) && isBoltCase(container)) {
    const scope = result.flags?.[SYSTEM_ID];
    if (scope) { delete scope[BOLT_BUNDLE_FLAG]; if (!Object.keys(scope).length) delete result.flags[SYSTEM_ID]; }
  }
  return result;
}
export function prepareBoltSaleBundle(itemData) {
  const result = structuredClone(itemData);
  if (!isBoltAmmo(result)) return result;
  result.system = { ...(result.system || {}), quantity: BOLT_SALE_BUNDLE_QUANTITY, containerId: null, equipped: false, lashed: false };
  result.flags = { ...(result.flags || {}), [SYSTEM_ID]: { ...(result.flags?.[SYSTEM_ID] || {}), [BOLT_BUNDLE_FLAG]: true } };
  return result;
}
export function getBoltBundleValidationError(item) {
  if (!isProtectedBoltBundle(item)) return null;
  if (!isBoltAmmo(item)) return 'Protected bolt bundles must be bolt ammunition.';
  const q = Number(item?.system?.quantity);
  if (!Number.isInteger(q) || q < 1 || q > BOLT_BUNDLE_LIMIT) return `Protected bolt bundles must contain 1-${BOLT_BUNDLE_LIMIT} bolts.`;
  if (item?.system?.equipped) return 'Unpack the bolt bundle before use.';
  return null;
}
export function getBoltBundleLashDecision(item, host) {
  if (!isProtectedBoltBundle(item)) return { allowed: null, reason: null };
  const error = getBoltBundleValidationError(item); if (error) return { allowed: false, reason: error };
  return isBackpack(host) ? { allowed: true, reason: null } : { allowed: false, reason: 'Protected bolt bundles may only be lashed to a Backpack.' };
}
