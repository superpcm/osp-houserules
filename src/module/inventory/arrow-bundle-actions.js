import {
  ARROW_BUNDLE_FLAG,
  ARROW_BUNDLE_LIMIT,
  getArrowBundleValidationError,
  isArrowAmmo,
  isProtectedArrowBundle,
} from './arrow-bundle.js';
import { capacityValue, storedBulk, usedBulk } from './bulk.js';
import { createdItemChange, runTransaction, snapshotItem } from './transaction-journal.js';
import { isBackpack } from './long-item-transport.js';

const SCOPE = 'osp-houserules';
const itemsOf = actor => actor?.items?.contents ?? (Array.isArray(actor?.items) ? actor.items : [...(actor?.items ?? [])]);
const itemId = item => item?.id ?? item?._id;
const clone = value => structuredClone(value);

const itemData = item => clone(item?.toObject ? item.toObject() : item);
const quantityOf = item => Number(item?.system?.quantity) || 0;
const flagPath = `flags.${SCOPE}.${ARROW_BUNDLE_FLAG}`;

function itemChange(actor, item, after) {
  return {
    kind: 'item',
    actorId: actor?.id ?? actor?.document?.id,
    actorUuid: actor?.uuid ?? actor?.document?.uuid,
    id: itemId(item),
    before: snapshotItem(item),
    after,
  };
}

function withProtectedFlag(data, protectedState) {
  const flags = { ...(data.flags ?? {}) };
  flags[SCOPE] = { ...(flags[SCOPE] ?? {}) };
  if (protectedState) flags[SCOPE][ARROW_BUNDLE_FLAG] = true;
  else delete flags[SCOPE][ARROW_BUNDLE_FLAG];
  if (!Object.keys(flags[SCOPE]).length) delete flags[SCOPE];
  data.flags = flags;
  return data;
}

function currentItem(actor, id) { return itemsOf(actor).find(item => itemId(item) === id); }

function unpackCapacityError(actor, item) {
  if (!item?.system?.lashed) return null;
  const parent = item.system?.containerId ? currentItem(actor, item.system.containerId) : null;
  if (!isBackpack(parent)) return 'Protected arrow bundles may only be lashed to a Backpack.';
  const capacity = capacityValue(parent.system?.capacity);
  const used = usedBulk(parent, itemsOf(actor));
  const required = storedBulk(item);
  return used + required > capacity ? `Not enough space in ${parent.name} to unpack this bundle.` : null;
}

/** Pack up to twenty arrows into a protected bundle, atomically splitting a stack when needed. */
export async function packArrowBundle(actor, item, { quantity } = {}) {
  const live = currentItem(actor, itemId(item)) ?? item;
  if (!isArrowAmmo(live)) return { success: false, reason: 'Only arrow ammunition can be protected.' };
  if (isProtectedArrowBundle(live)) return { success: false, reason: 'This item is already a protected arrow bundle.' };
  if (live.system?.lashed) return { success: false, reason: 'Unlash arrows before protecting them.' };
  const total = quantityOf(live);
  const requested = quantity == null ? total : Number(quantity);
  if (!Number.isInteger(requested) || requested < 1 || requested > Math.min(ARROW_BUNDLE_LIMIT, total)) {
    return { success: false, reason: `Choose 1-${Math.min(ARROW_BUNDLE_LIMIT, total)} arrows.` };
  }
  const sourceBefore = snapshotItem(live);
  const bundle = withProtectedFlag(itemData(live), true);
  bundle.system = { ...bundle.system, quantity: requested, lashed: false };
  delete bundle.id;
  delete bundle._id;
  const changes = [];
  if (requested === total) {
    const after = withProtectedFlag(clone(sourceBefore), true);
    after.system = { ...after.system, quantity: requested, lashed: false };
    changes.push(itemChange(actor, live, after));
  } else {
    const sourceAfter = clone(sourceBefore);
    sourceAfter.system = { ...sourceAfter.system, quantity: total - requested };
    changes.push(itemChange(actor, live, sourceAfter));
    changes.push(createdItemChange(actor, bundle));
  }
  const result = await runTransaction(actor, {
    label: `Pack ${requested} arrows into a protected bundle`,
    changes,
    validate: async () => {
      const fresh = currentItem(actor, itemId(live));
      return Boolean(fresh && isArrowAmmo(fresh) && !isProtectedArrowBundle(fresh) && !fresh.system?.lashed && quantityOf(fresh) === total);
    },
  });
  return result.success ? { ...result, success: true, reason: null, quantity: requested } : result;
}

/** Unpack a protected bundle in place; an externally lashed bundle must fit internally first. */
export async function unpackArrowBundle(actor, item) {
  const live = currentItem(actor, itemId(item)) ?? item;
  if (!isProtectedArrowBundle(live)) return { success: false, reason: 'This item is not a protected arrow bundle.' };
  const validation = getArrowBundleValidationError(live);
  if (validation) return { success: false, reason: validation };
  const capacityError = unpackCapacityError(actor, live);
  if (capacityError) return { success: false, reason: capacityError };
  const before = snapshotItem(live);
  const after = withProtectedFlag(clone(before), false);
  after.system = { ...after.system, lashed: false };
  const result = await runTransaction(actor, {
    label: `Unpack ${quantityOf(live)} protected arrows`,
    changes: [itemChange(actor, live, after)],
    validate: async () => {
      const fresh = currentItem(actor, itemId(live));
      return Boolean(fresh && isProtectedArrowBundle(fresh) && !getArrowBundleValidationError(fresh) && !unpackCapacityError(actor, fresh));
    },
  });
  return result.success ? { ...result, success: true, reason: null, quantity: quantityOf(live) } : result;
}

export { ARROW_BUNDLE_FLAG, ARROW_BUNDLE_LIMIT };
