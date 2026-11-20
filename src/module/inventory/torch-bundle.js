export const SYSTEM_ID = 'osp-houserules';
export const TORCH_BUNDLE_FLAG = 'protectedTorchBundle';
export const TORCH_BUNDLE_LIMIT = 6;
export const TORCH_SALE_BUNDLE_QUANTITY = 6;
import { isBackpack } from './long-item-transport.js';

export function isTorch(item) {
  return item?.type === 'item' && /^Torch(?:\s+[+-]\d+)?$/.test(String(item?.name ?? ''));
}

export function isProtectedTorchBundle(item) {
  return item?.flags?.[SYSTEM_ID]?.[TORCH_BUNDLE_FLAG] === true;
}

/** Prepare a catalog/store sale copy as one protected six-torch bundle. */
export function prepareTorchSaleBundle(itemData) {
  const result = structuredClone(itemData);
  if (!isTorch(result)) return result;
  result.system = { ...(result.system ?? {}), quantity: TORCH_SALE_BUNDLE_QUANTITY, containerId: null, equipped: false, lashed: false };
  result.flags = { ...(result.flags ?? {}), [SYSTEM_ID]: { ...(result.flags?.[SYSTEM_ID] ?? {}), [TORCH_BUNDLE_FLAG]: true } };
  return result;
}

export function getTorchBundleValidationError(item) {
  if (!isProtectedTorchBundle(item)) return null;
  if (!isTorch(item)) return 'Protected torch bundles must be Torch items.';
  const quantity = Number(item?.system?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > TORCH_BUNDLE_LIMIT) return `Protected torch bundles must contain 1-${TORCH_BUNDLE_LIMIT} torches.`;
  if (item?.system?.equipped) return 'Unpack the torch bundle before use.';
  return null;
}

export function getTorchBundleLashDecision(item, host) {
  if (!isProtectedTorchBundle(item)) return { allowed: null, reason: null };
  const validation = getTorchBundleValidationError(item);
  if (validation) return { allowed: false, reason: validation };
  if (isBackpack(host)) return { allowed: true, reason: null };
  return { allowed: false, reason: 'Protected torch bundles may only be lashed to a Backpack.' };
}
