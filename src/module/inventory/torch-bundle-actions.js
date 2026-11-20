import { capacityValue, storedBulk, usedBulk } from './bulk.js';
import { createdItemChange, runTransaction, snapshotItem } from './transaction-journal.js';
import { getTorchBundleValidationError, isProtectedTorchBundle, isTorch, SYSTEM_ID, TORCH_BUNDLE_FLAG, TORCH_BUNDLE_LIMIT } from './torch-bundle.js';
import { isBackpack } from './long-item-transport.js';

const itemsOf = actor => actor?.items?.contents ?? (Array.isArray(actor?.items) ? actor.items : [...(actor?.items ?? [])]);
const itemId = item => item?.id ?? item?._id;
const clone = value => structuredClone(value);
const quantityOf = item => Number(item?.system?.quantity) || 0;
const itemData = item => clone(item?.toObject ? item.toObject() : item);
const currentItem = (actor, id) => itemsOf(actor).find(item => itemId(item) === id);
const itemChange = (actor, item, after) => ({ kind: 'item', actorId: actor?.id, actorUuid: actor?.uuid, id: itemId(item), before: snapshotItem(item), after });
function withFlag(data, enabled) {
  const flags = { ...(data.flags ?? {}) }; const scope = { ...(flags[SYSTEM_ID] ?? {}) };
  if (enabled) scope[TORCH_BUNDLE_FLAG] = true; else delete scope[TORCH_BUNDLE_FLAG];
  if (Object.keys(scope).length) flags[SYSTEM_ID] = scope; else delete flags[SYSTEM_ID];
  data.flags = flags; return data;
}
function unpackCapacityError(actor, item) {
  if (!item?.system?.lashed) return null;
  const parent = currentItem(actor, item.system.containerId);
  if (!isBackpack(parent)) return 'Protected torch bundles may only be lashed to a Backpack.';
  return usedBulk(parent, itemsOf(actor)) + storedBulk(item) > capacityValue(parent.system?.capacity)
    ? `Not enough space in ${parent.name} to unpack this bundle.` : null;
}
export async function packTorchBundle(actor, item, { quantity } = {}) {
  const live = currentItem(actor, itemId(item)) ?? item;
  if (!isTorch(live)) return { success: false, reason: 'Only loose torches can be bundled.' };
  if (live.system?.equipped) return { success: false, reason: 'Unequip the torch before bundling it.' };
  if (isProtectedTorchBundle(live)) return { success: false, reason: 'This item is already a torch bundle.' };
  if (live.system?.lashed) return { success: false, reason: 'Unlash torches before bundling them.' };
  const total = quantityOf(live); const requested = quantity == null ? total : Number(quantity);
  if (!Number.isInteger(requested) || requested < 1 || requested > Math.min(TORCH_BUNDLE_LIMIT, total)) return { success: false, reason: `Choose 1-${Math.min(TORCH_BUNDLE_LIMIT, total)} torches.` };
  const before = snapshotItem(live); const bundle = withFlag(itemData(live), true);
  bundle.system = { ...bundle.system, quantity: requested, lashed: false }; delete bundle.id; delete bundle._id;
  const changes = [];
  if (requested === total) { const after = withFlag(clone(before), true); after.system = { ...after.system, quantity: requested, lashed: false }; changes.push(itemChange(actor, live, after)); }
  else { const sourceAfter = clone(before); sourceAfter.system = { ...sourceAfter.system, quantity: total - requested }; changes.push(itemChange(actor, live, sourceAfter), createdItemChange(actor, bundle)); }
  const result = await runTransaction(actor, { label: `Pack ${requested} torches into a bundle`, changes, validate: async () => { const fresh = currentItem(actor, itemId(live)); return Boolean(fresh && isTorch(fresh) && !isProtectedTorchBundle(fresh) && !fresh.system?.lashed && quantityOf(fresh) === total); } });
  return result.success ? { ...result, success: true, reason: null, quantity: requested } : result;
}
export async function unpackTorchBundle(actor, item) {
  const live = currentItem(actor, itemId(item)) ?? item; if (!isProtectedTorchBundle(live)) return { success: false, reason: 'This item is not a torch bundle.' };
  const validation = getTorchBundleValidationError(live); if (validation) return { success: false, reason: validation };
  const capacityError = unpackCapacityError(actor, live); if (capacityError) return { success: false, reason: capacityError };
  const before = snapshotItem(live); const after = withFlag(clone(before), false); after.system = { ...after.system, lashed: false };
  const result = await runTransaction(actor, { label: `Unpack ${quantityOf(live)} torches`, changes: [itemChange(actor, live, after)], validate: async () => { const fresh = currentItem(actor, itemId(live)); return Boolean(fresh && isProtectedTorchBundle(fresh) && !getTorchBundleValidationError(fresh) && !unpackCapacityError(actor, fresh)); } });
  return result.success ? { ...result, success: true, reason: null, quantity: quantityOf(live) } : result;
}
