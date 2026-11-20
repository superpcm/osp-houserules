import { capacityValue, storedBulk, usedBulk } from './bulk.js';
import { lashSlotUsage } from './shield-lashing.js';
import { createdItemChange, runTransaction, snapshotItem } from './transaction-journal.js';
import { isCompleteTent, separateTentData } from './tent-components.js';
import { isBackpack } from './long-item-transport.js';

const itemsOf = actor => actor?.items?.contents ?? (Array.isArray(actor?.items) ? actor.items : [...(actor?.items ?? [])]);
const itemId = item => item?.id ?? item?._id;
const clone = value => structuredClone(value);
const currentItem = (actor, id) => itemsOf(actor).find(item => itemId(item) === id);
const itemChange = (actor, item, after) => ({ kind:'item', actorId:actor?.id ?? actor?.document?.id, actorUuid:actor?.uuid ?? actor?.document?.uuid, id:itemId(item), before:snapshotItem(item), after });

function backpackRoute(actor, source) {
  const all = itemsOf(actor); let current = source; let backpack = null; let externallyLashed = false; const seen = new Set();
  while (current?.system?.containerId) {
    if (seen.has(itemId(current))) return { invalid: true };
    seen.add(itemId(current));
    const parent = all.find(item => itemId(item) === current.system.containerId);
    if (!parent) return { invalid: true };
    if (current.system?.lashed) externallyLashed = true;
    if (isBackpack(parent)) { backpack = parent; break; }
    current = parent;
  }
  return { backpack, externallyLashed };
}

function validateRoute(actor, source, fabric, poles, quantity) {
  const route = backpackRoute(actor, source);
  if (route.invalid) return 'The tent has invalid containment.';
  if (!route.backpack) return null;
  const pack = route.backpack; const all = itemsOf(actor);
  const fabricParent = route.externallyLashed ? itemId(pack) : (source.system?.containerId ?? null);
  const projectedFabric = { ...fabric, _id: 'preview-fabric', system: { ...fabric.system, containerId: fabricParent, lashed: false } };
  const projectedPoles = { ...poles, _id: 'preview-poles', system: { ...poles.system, containerId: itemId(pack), lashed: true, slotCost: 1 } };
  const projected = all.filter(item => itemId(item) !== itemId(source));
  const remaining = Number(source.system?.quantity) - quantity;
  if (remaining > 0) projected.push({ ...source, id: itemId(source), system: { ...source.system, quantity: remaining } });
  projected.push(projectedFabric, projectedPoles);
  if (usedBulk(pack, projected) > capacityValue(pack.system?.capacity)) return `Not enough internal space in ${pack.name} for the tent fabric.`;
  const occupied = lashSlotUsage(projected, itemId(pack), 'preview-poles', pack);
  const free = (Number(pack.system?.lashSlots) || 0) - occupied;
  if (free < quantity) return `Not enough lash slots in ${pack.name} for ${quantity} tent pole bundle${quantity === 1 ? '' : 's'}.`;
  return null;
}

export async function separateTentComponents(actor, item, { quantity = 1 } = {}) {
  const live = currentItem(actor, itemId(item)) ?? item;
  if (!isCompleteTent(live)) return { success:false, reason:'Only a complete tent can be separated.' };
  let data;
  try { data = separateTentData(live, Number(quantity)); } catch (error) { return { success:false, reason:error.message }; }
  const route = backpackRoute(actor, live);
  const routeError = validateRoute(actor, live, data.fabric, data.poles, Number(quantity));
  if (routeError) return { success:false, reason:routeError };
  const total = Number(live.system?.quantity) || 0; const requested = Number(quantity);
  const sourceBefore = snapshotItem(live); const changes = [];
  const sourceAfter = clone(sourceBefore);
  if (requested === total) changes.push(itemChange(actor, live, { ...data.fabric, _id: itemId(live) }));
  else { sourceAfter.system = { ...sourceAfter.system, quantity: total - requested }; changes.push(itemChange(actor, live, sourceAfter)); }
  const fabric = clone(data.fabric); const poles = clone(data.poles);
  if (route.backpack) {
    fabric.system = { ...fabric.system, containerId: route.externallyLashed ? itemId(route.backpack) : (live.system?.containerId ?? null), lashed:false };
    poles.system = { ...poles.system, containerId:itemId(route.backpack), lashed:true, slotCost:1 };
  } else {
    fabric.system = { ...fabric.system, containerId:live.system?.containerId ?? null, lashed:Boolean(live.system?.lashed) };
    poles.system = { ...poles.system, containerId:live.system?.containerId ?? null, lashed:Boolean(live.system?.lashed) };
  }
  if (requested === total) changes[0].after = { ...fabric, _id:itemId(live) };
  else changes.push(createdItemChange(actor, fabric));
  changes.push(createdItemChange(actor, poles));
  const result = await runTransaction(actor, { label:`Separate ${requested} tent${requested === 1 ? '' : 's'} into fabric and poles`, changes, validate: async () => {
    const fresh = currentItem(actor, itemId(live));
    return Boolean(fresh && JSON.stringify(snapshotItem(fresh)) === JSON.stringify(sourceBefore)
      && !validateRoute(actor, fresh, data.fabric, data.poles, requested));
  }});
  return result.success ? { ...result, success:true, reason:null, quantity:requested } : result;
}
