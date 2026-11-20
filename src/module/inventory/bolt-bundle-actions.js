import { capacityValue, storedBulk, usedBulk } from './bulk.js';
import { createdItemChange, runTransaction, snapshotItem } from './transaction-journal.js';
import { BOLT_BUNDLE_FLAG, BOLT_BUNDLE_LIMIT, getBoltBundleValidationError, isBoltAmmo, isProtectedBoltBundle, SYSTEM_ID } from './bolt-bundle.js';
import { isBackpack } from './long-item-transport.js';
const itemsOf = actor => actor?.items?.contents ?? (Array.isArray(actor?.items) ? actor.items : [...(actor?.items ?? [])]);
const idOf = item => item?.id ?? item?._id;
const clone = value => structuredClone(value);
const qty = item => Number(item?.system?.quantity) || 0;
const current = (actor, id) => itemsOf(actor).find(item => idOf(item) === id);
const dataOf = item => clone(item?.toObject ? item.toObject() : item);
const change = (actor, item, after) => ({ kind: 'item', actorId: actor?.id, actorUuid: actor?.uuid, id: idOf(item), before: snapshotItem(item), after });
function flag(data, on) {
    const flags = { ...(data.flags || {}) };
    const scope = { ...(flags[SYSTEM_ID] || {}) };
    if (on)
        scope[BOLT_BUNDLE_FLAG] = true;
    else
        delete scope[BOLT_BUNDLE_FLAG];
    if (Object.keys(scope).length)
        flags[SYSTEM_ID] = scope;
    else
        delete flags[SYSTEM_ID];
    data.flags = flags;
    return data;
}
function unpackError(actor, item) {
    if (!item?.system?.lashed)
        return null;
    const parent = current(actor, item.system.containerId);
    if (!isBackpack(parent))
        return 'Protected bolt bundles may only be lashed to a Backpack.';
    return usedBulk(parent, itemsOf(actor)) + storedBulk(item) > capacityValue(parent.system?.capacity)
        ? `Not enough space in ${parent.name} to unpack this bundle.` : null;
}
export async function packBoltBundle(actor, item, { quantity } = {}) { const live = current(actor, idOf(item)) ?? item; if (!isBoltAmmo(live))
    return { success: false, reason: 'Only loose bolts can be bundled.' }; if (live.system?.equipped)
    return { success: false, reason: 'Unequip the bolts before bundling them.' }; if (isProtectedBoltBundle(live))
    return { success: false, reason: 'This item is already a bolt bundle.' }; if (live.system?.lashed)
    return { success: false, reason: 'Unlash bolts before bundling them.' }; const total = qty(live), requested = quantity == null ? total : Number(quantity); if (!Number.isInteger(requested) || requested < 1 || requested > Math.min(BOLT_BUNDLE_LIMIT, total))
    return { success: false, reason: `Choose 1-${Math.min(BOLT_BUNDLE_LIMIT, total)} bolts.` }; const before = snapshotItem(live), bundle = flag(dataOf(live), true); bundle.system = { ...bundle.system, quantity: requested, lashed: false }; delete bundle.id; delete bundle._id; const changes = []; if (requested === total) {
    const after = flag(clone(before), true);
    after.system = { ...after.system, quantity: requested, lashed: false };
    changes.push(change(actor, live, after));
}
else {
    const rest = clone(before);
    rest.system = { ...rest.system, quantity: total - requested };
    changes.push(change(actor, live, rest), createdItemChange(actor, bundle));
} const result = await runTransaction(actor, { label: `Pack ${requested} bolts into a bundle`, changes, validate: async () => { const fresh = current(actor, idOf(live)); return Boolean(fresh && isBoltAmmo(fresh) && !isProtectedBoltBundle(fresh) && !fresh.system?.lashed && qty(fresh) === total); } }); return result.success ? { ...result, success: true, reason: null, quantity: requested } : result; }
export async function unpackBoltBundle(actor, item) { const live = current(actor, idOf(item)) ?? item; if (!isProtectedBoltBundle(live))
    return { success: false, reason: 'This item is not a bolt bundle.' }; const error = getBoltBundleValidationError(live); if (error)
    return { success: false, reason: error }; const capacity = unpackError(actor, live); if (capacity)
    return { success: false, reason: capacity }; const before = snapshotItem(live), after = flag(clone(before), false); after.system = { ...after.system, lashed: false }; const result = await runTransaction(actor, { label: `Unpack ${qty(live)} bolts`, changes: [change(actor, live, after)], validate: async () => { const fresh = current(actor, idOf(live)); return Boolean(fresh && isProtectedBoltBundle(fresh) && !getBoltBundleValidationError(fresh) && !unpackError(actor, fresh)); } }); return result.success ? { ...result, success: true, reason: null, quantity: qty(live) } : result; }
