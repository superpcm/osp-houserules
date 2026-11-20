import { COIN_TEMPLATES } from './treasure-cost.js';
import { canBeParent } from './containment.js';

export const STORE_COIN_VALUES = Object.freeze({ 'Copper Coins': 1, 'Silver Coins': 10, 'Gold Coins': 100 });
const COIN_NAMES = Object.keys(STORE_COIN_VALUES);
const clone = value => structuredClone(value);
const itemsOf = actor => actor?.items?.contents ?? (typeof actor?.items?.values === 'function' ? [...actor.items.values()] : [...(actor?.items ?? [])]);

function carriedCoinItems(actor) {
  const items = itemsOf(actor);
  const byId = new Map(items.map(item => [item.id, item]));
  const carried = [];
  for (const item of items) {
    if (item.type !== 'coin' || !Object.hasOwn(STORE_COIN_VALUES, item.name)) continue;
    if (!Number.isSafeInteger(item.system?.quantity) || item.system.quantity < 0) return { success: false, reason: 'Stored coin quantities must be whole numbers.' };
    const seen = new Set();
    let parentId = item.system?.containerId ?? null;
    if (!parentId) continue;
    let invalid = false;
    while (parentId) {
      if (seen.has(parentId)) return { success: false, reason: 'Circular containment prevents payment.' };
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!canBeParent(parent)) { invalid = true; break; }
      const tags = parent.system?.tags ?? [];
      if (['vehicle', 'livestock', 'mount'].includes(parent.type) || ['vehicle', 'livestock', 'mount'].includes(parent.system?.transportType) || tags.includes('vehicle') || tags.includes('livestock')) { invalid = true; break; }
      parentId = parent.system?.containerId ?? null;
    }
    if (!invalid) carried.push(item);
  }
  return { success: true, items: carried };
}

export function carriedFunds(actor) {
  const result = carriedCoinItems(actor);
  if (!result.success) return result;
  const quantities = Object.fromEntries(COIN_NAMES.map(name => [name, 0]));
  for (const item of result.items) quantities[item.name] += item.system.quantity;
  const totalCp = COIN_NAMES.reduce((sum, name) => sum + quantities[name] * STORE_COIN_VALUES[name], 0);
  if (!Number.isSafeInteger(totalCp)) return { success: false, reason: 'Carried coin total is unsafe.' };
  return { success: true, ...quantities, gold: quantities['Gold Coins'], silver: quantities['Silver Coins'], copper: quantities['Copper Coins'], totalCp, totalSp: totalCp / 10 };
}

function coinDeltas(actor, totalCp) {
  if (!Number.isSafeInteger(totalCp) || totalCp < 0) return { success: false, reason: 'Payment must be a nonnegative whole copper amount.' };
  const found = carriedCoinItems(actor);
  if (!found.success) return found;
  const byContainer = new Map();
  for (const item of found.items) {
    const containerId = item.system?.containerId ?? null;
    const list = byContainer.get(containerId) ?? [];
    list.push(item); byContainer.set(containerId, list);
  }
  const available = Object.fromEntries(COIN_NAMES.map(name => [name, found.items.filter(item => item.name === name).reduce((sum, item) => sum + item.system.quantity, 0)]));
  const availableCp = COIN_NAMES.reduce((sum, name) => sum + available[name] * STORE_COIN_VALUES[name], 0);
  if (availableCp < totalCp) return { success: false, reason: `Insufficient carried funds (shortfall ${totalCp - availableCp} cp).` };
  // Spend copper first, then silver, then gold. Any remainder is paid by one larger coin and
  // returned in smaller denominations to the same suitable purse/container.
  let remaining = totalCp;
  const spent = Object.fromEntries(COIN_NAMES.map(name => [name, 0]));
  for (const name of COIN_NAMES) {
    const use = Math.min(available[name], Math.floor(remaining / STORE_COIN_VALUES[name]));
    spent[name] = use; remaining -= use * STORE_COIN_VALUES[name];
  }
  if (remaining > 0) {
    for (const name of ['Silver Coins', 'Gold Coins']) {
      const extra = Math.min(available[name] - spent[name], 1);
      if (!extra) continue;
      spent[name] += extra; remaining -= extra * STORE_COIN_VALUES[name];
      if (remaining <= 0) break;
    }
  }
  const paidCp = COIN_NAMES.reduce((sum, name) => sum + spent[name] * STORE_COIN_VALUES[name], 0);
  const changeCp = paidCp - totalCp;
  const targetContainer = found.items.find(item => item.system?.containerId)?.system?.containerId ?? null;
  const returned = { 'Gold Coins': Math.floor(changeCp / 100), 'Silver Coins': Math.floor((changeCp % 100) / 10), 'Copper Coins': changeCp % 10 };
  return { success: true, spent, returned, targetContainer, paidCp, changeCp };
}

export async function stageStorePayment(draftActor, totalCp) {
  const plan = coinDeltas(draftActor, totalCp);
  if (!plan.success) return plan;
  if (plan.changeCp > 0 && plan.targetContainer == null) return { success: false, reason: 'Change requires a carried coin container.' };
  const items = itemsOf(draftActor);
  const carried = carriedCoinItems(draftActor);
  if (!carried.success) return carried;
  const carriedIds = new Set(carried.items.map(item => item.id));
  const updates = [];
  for (const name of COIN_NAMES) {
    let remaining = plan.spent[name];
    for (const item of items.filter(item => carriedIds.has(item.id) && item.name === name)) {
      if (!remaining) break;
      const quantity = Math.min(item.system.quantity, remaining);
      if (quantity) updates.push({ _id: item.id, 'system.quantity': item.system.quantity - quantity });
      remaining -= quantity;
    }
  }
  if (updates.length) await draftActor.updateEmbeddedDocuments('Item', updates);
  const creates = [];
  for (const name of COIN_NAMES) {
    const quantity = plan.returned[name];
    if (!quantity) continue;
    const existing = itemsOf(draftActor).find(item => item.type === 'coin' && item.name === name && (item.system?.containerId ?? null) === plan.targetContainer);
    if (existing) await draftActor.updateEmbeddedDocuments('Item', [{ _id: existing.id, 'system.quantity': existing.system.quantity + quantity }]);
    else creates.push({ ...clone(COIN_TEMPLATES[name]), system: { ...clone(COIN_TEMPLATES[name].system), quantity, containerId: plan.targetContainer } });
  }
  if (creates.length) await draftActor.createEmbeddedDocuments('Item', creates);
  return { success: true, payment: plan, change: plan.changeCp };
}

export const __test = { carriedCoinItems, coinDeltas };
