import { canStackItems } from './stack-identity.js';
/**
 * @file Charges an item's gp-equivalent cost against a character's stored coinage before the
 * item is added to the sheet. Coins are Foundry "coin" items (Copper/Silver/Gold Coins) owned
 * by the actor and linked to a container via system.containerId — there is no scalar
 * container.gold/silver/copper field, so a container's balance is derived by summing whatever
 * coin item quantities currently live there.
 *
 * Coin costs (see data/treasure.json) are already denominated on one scale: Gold Coins=10,
 * Silver Coins=1, Copper Coins=0.1 "sp" per coin, matching item system.cost values (also in
 * that scale) exactly. Internally everything is converted to integer "pennies" (1 penny =
 * 1 Copper Coin = 0.1 sp) to avoid float rounding.
 */

import { createDropDraft, diffDropDraft, unchangedDropInventory, validDropQuantity } from './drop-transaction.js';
import { runTransaction } from './transaction-journal.js';

export const CONTAINER_SEARCH_ORDER = ['Coin Purse', 'Belt Pouch (L)', 'Belt Pouch (S)', 'Backpack', 'Sidesack'];

const PENNIES_PER_COIN = { 'Copper Coins': 1, 'Silver Coins': 10, 'Gold Coins': 100 };
const COIN_NAMES = Object.keys(PENNIES_PER_COIN);

// Mirrors data/treasure.json — needed to create a fresh coin stack when change must be
// returned into a container that doesn't already hold that denomination.
export const COIN_TEMPLATES = {
  'Copper Coins': { name: 'Copper Coins', type: 'coin', img: 'systems/osp-houserules/assets/images/treasure/copper-coins.webp', system: { cost: 0.1, unitWeight: 0.02, storedSize: 0.04, equipped: false, lashable: false, lashed: false, tags: ['coins'] } },
  'Silver Coins': { name: 'Silver Coins', type: 'coin', img: 'systems/osp-houserules/assets/images/treasure/silver-coins.webp', system: { cost: 1, unitWeight: 0.02, storedSize: 0.04, equipped: false, lashable: false, lashed: false, tags: ['coins'] } },
  'Gold Coins': { name: 'Gold Coins', type: 'coin', img: 'systems/osp-houserules/assets/images/treasure/gold-coins.webp', system: { cost: 10, unitWeight: 0.04, storedSize: 0.04, equipped: false, lashable: false, lashed: false, tags: ['coins'] } },
};

/**
 * Pure planner — no Foundry globals. Computes, but does not apply, the coin-quantity deltas
 * needed to pay costSp by draining containers in the given order.
 *
 * @param {number} costSp - item cost in sp-equivalent units (may carry copper-scale fractions).
 * @param {Array<{id:string, coins:Record<string, number>}>} containers - candidate containers,
 *   pre-filtered/ordered by CONTAINER_SEARCH_ORDER (and, within a tier, whatever stable order
 *   the caller prefers when more than one container shares a priority name). `coins` maps a
 *   coin item name to the quantity currently stored in that container.
 * @returns {{success:boolean, shortfallPennies:number, deltas:Array<{containerId:string, coinName:string, delta:number}>}}
 *   `delta` is the change to apply to that coin stack's quantity: negative when spent, positive
 *   when returned as change. Only meaningful when success is true.
 */
export function planCostCharge(costSp, containers) {
  let remainingPennies = Math.round(costSp * 10);
  const deltas = [];

  for (const container of containers) {
    if (remainingPennies <= 0) break;

    const available = { 'Copper Coins': 0, 'Silver Coins': 0, 'Gold Coins': 0, ...container.coins };
    // Net quantity change per coin type within this container; positive = spent (removed),
    // negative = change given back. Flipped to the caller's delta sign convention at the end.
    const spent = { 'Copper Coins': 0, 'Silver Coins': 0, 'Gold Coins': 0 };

    // 1. Silver first — whole coins only, up to what's needed.
    const silverToSpend = Math.min(available['Silver Coins'], Math.floor(remainingPennies / 10));
    spent['Silver Coins'] += silverToSpend;
    remainingPennies -= silverToSpend * 10;

    // 2. Copper covers any remainder directly — it's already the smallest unit, no breaking needed.
    if (remainingPennies > 0) {
      const copperToSpend = Math.min(available['Copper Coins'], remainingPennies);
      spent['Copper Coins'] += copperToSpend;
      remainingPennies -= copperToSpend;
    }

    // 3. Gold — break whole coins to cover the remainder. Change is returned as silver, falling
    //    back to copper for any part not evenly divisible into a silver coin, so the container
    //    reconciles to zero net loss/gain of value.
    if (remainingPennies > 0 && available['Gold Coins'] > 0) {
      const goldNeeded = Math.min(available['Gold Coins'], Math.ceil(remainingPennies / 100));
      const goldValue = goldNeeded * 100;
      spent['Gold Coins'] += goldNeeded;
      if (goldValue >= remainingPennies) {
        const change = goldValue - remainingPennies;
        remainingPennies = 0;
        spent['Silver Coins'] -= Math.floor(change / 10);
        spent['Copper Coins'] -= change % 10;
      } else {
        remainingPennies -= goldValue;
      }
    }

    for (const coinName of COIN_NAMES) {
      if (spent[coinName] !== 0) {
        deltas.push({ containerId: container.id, coinName, delta: -spent[coinName] });
      }
    }
  }

  if (remainingPennies > 0) {
    return { success: false, shortfallPennies: remainingPennies, deltas: [] };
  }
  return { success: true, shortfallPennies: 0, deltas };
}

/**
 * Foundry-facing orchestrator — resolves the actor's actual containers/coin items, runs the
 * pure planner, and applies the resulting changes to a DETACHED inventory draft. Callers
 * commit the resulting item changes with placement through the durable transaction journal.
 *
 * @param {{type:string, name:string, system:{cost?:number, treasure?:boolean}}} itemData
 * @param {import('../actor/actor.js').OspActor} actor
 * @returns {Promise<{success:boolean, shortfallSp?:number}>}
 */
export async function stageItemCost(itemData, actor) {
  // Coins and treasure (gems/jewelry, system.treasure) carry a "cost" field for their own
  // value, not a price to pay — dropping them onto the sheet is receiving treasure, not buying
  // an item, so they're exempt even though they'd otherwise match the "has a cost" gate.
  if (itemData?.type === 'coin' || itemData?.system?.treasure) return { success: true };

  const cost = itemData?.system?.cost;
  if (cost != null && (!Number.isFinite(cost) || cost < 0)) return { success: false, reason: 'Invalid purchase cost.' };
  if (!cost || cost <= 0) return { success: true };

  const containerItems = CONTAINER_SEARCH_ORDER.flatMap((name) =>
    actor.items.filter((i) => i.type === 'container' && i.name === name)
  );

  const containers = containerItems.map((c) => ({
    id: c.id,
    coins: Object.fromEntries(
      COIN_NAMES.map((coinName) => [
        coinName,
        actor.items.filter(i => i.type === 'coin' && i.name === coinName && i.system.containerId === c.id)
          .reduce((sum, coin) => sum + coin.system.quantity, 0),
      ])
    ),
  }));

  if (actor.items.filter(item => item.type === 'coin' && containerItems.some(container => item.system.containerId === container.id)).some(coin => !Number.isSafeInteger(coin.system.quantity) || coin.system.quantity < 0)) return { success: false, reason: 'Stored coin quantities must be whole numbers.' };

  const plan = planCostCharge(cost, containers);
  if (!plan.success) {
    return { success: false, shortfallSp: plan.shortfallPennies / 10 };
  }

  const updates = [];
  const creates = [];
  for (const { containerId, coinName, delta } of plan.deltas) {
    const candidates = actor.items.filter(item => item.type === 'coin' && item.name === coinName && item.system.containerId === containerId);
    if (delta < 0) {
      let remaining = -delta;
      for (const existing of candidates) {
        const spent = Math.min(existing.system.quantity, remaining);
        if (spent) updates.push({ _id: existing.id, 'system.quantity': existing.system.quantity - spent });
        remaining -= spent;
        if (!remaining) break;
      }
    } else if (delta > 0) {
      const template = COIN_TEMPLATES[coinName];
      const existing = candidates.find(item => canStackItems(item, template));
      if (existing) updates.push({ _id: existing.id, 'system.quantity': existing.system.quantity + delta });
      else creates.push({ ...template, system: { ...template.system, quantity: delta, containerId } });
    }
  }

  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
  if (creates.length) await actor.createEmbeddedDocuments('Item', creates);

  return { success: true };
}

/** Standalone charge. Sheet purchases stage this together with placement instead. */
export async function chargeItemCost(itemData, actor, quantity = itemData?.system?.quantity ?? 1) {
  if (!validDropQuantity(quantity)) return { success: false, reason: 'Invalid purchase quantity.' };
  const draft = createDropDraft(actor);
  const result = await stageItemCost({ ...itemData, system: { ...itemData.system, cost: Number(itemData.system?.cost ?? 0) * quantity } }, draft.actor);
  if (!result.success) return result;
  const changes = diffDropDraft(actor, draft);
  return changes.length ? runTransaction(actor, { label: `Payment: ${quantity} × ${itemData.name}`, changes, validate: () => unchangedDropInventory(draft) }) : result;
}
