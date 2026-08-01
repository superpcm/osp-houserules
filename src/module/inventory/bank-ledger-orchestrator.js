/**
 * @file Foundry-facing orchestrator for Westford Bank. Resolves live actor flags/items into
 * plain data, calls the pure planners in bank-ledger.js, and only on a successful plan touches
 * any document. Foundry gives no way to write the ledger flag and mutate an embedded item as one
 * atomic transaction, so each function deliberately mutates the *real* inventory item first
 * (delete/update on deposit, create/update on withdrawal) and only commits the ledger flag
 * (actor.setFlag, via commitLedger()) once that has confirmed succeeded — if either step throws,
 * it's caught and turned into an ordinary {success:false, reason} result instead of an unhandled
 * rejection. This ordering picks the safer failure mode: a failure between the two steps leaves
 * the tangible item where it already was rather than crediting/debiting the ledger for something
 * that never actually moved.
 *
 * Every exported function here returns the same {success, reason?, reasonType?, ...} shape the
 * pure planners return — it does NOT call ui.notifications itself (same convention as
 * treasure-cost.js's chargeItemCost: the caller decides how to surface a failure).
 */

import {
  emptyLedger,
  planDepositItem,
  planWithdrawItem,
  planDepositCurrency,
  planWithdrawCurrency,
  planSetCurrency,
} from "./bank-ledger.js";
import { checkWithdrawTarget } from "./container-capacity.js";
import { COIN_TEMPLATES } from "./treasure-cost.js";

const FLAG_SCOPE = "osp-houserules";
const FLAG_KEY = "bankLedger";

const DENOMINATION_TO_COIN_NAME = { gold: "Gold Coins", silver: "Silver Coins", copper: "Copper Coins" };

// Serializes calls against the same actor within one client — correctly guards against
// double-click/double-drop races from a single browser tab. It does NOT coordinate across two
// different clients (e.g. the DM's browser and a player's editing the same ledger at the same
// instant): Foundry has no cross-client transaction primitive and this repo has no socket layer
// to add one. Given this is a small-group tabletop app, that collision is rare and low-severity
// (last-write-wins on the bankLedger flag, identical to any other concurrent actor.update).
const actorLocks = new Map();
function withActorLock(actorId, fn) {
  const prior = actorLocks.get(actorId) ?? Promise.resolve();
  const settled = prior.catch(() => {});
  const run = settled.then(fn);
  actorLocks.set(actorId, run.catch(() => {}));
  return run;
}

export function getLedger(actor) {
  return actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? emptyLedger();
}

function currentUserMeta(actorType, containerId = null) {
  return { actorType, actorId: game.user.id, containerId };
}

// Every mutating function below funnels its final flag write through here so a failure at this
// last step (same risk as any other write — a permission hiccup, a dropped connection to the
// GM client that relays the update, etc.) also comes back as an ordinary {success:false} result
// instead of an unhandled rejection the UI layer never sees.
async function commitLedger(actor, ledger, failureReason) {
  try {
    await actor.setFlag(FLAG_SCOPE, FLAG_KEY, ledger);
    return null;
  } catch (err) {
    console.error('[Westford Bank] failed to save the ledger', err);
    return { success: false, reason: failureReason };
  }
}

/**
 * Deposit `quantity` of a live, treasure-eligible embedded item into the actor's own ledger.
 * @param {import('../actor/actor.js').OspActor} actor
 * @param {Item} item - the live embedded item being deposited (owned by `actor`)
 * @param {number} quantity
 */
export async function depositItem(actor, item, quantity) {
  return withActorLock(actor.id, async () => {
    const itemData = item.toObject();
    const ledger = getLedger(actor);
    const meta = currentUserMeta('player', item.system.containerId ?? null);
    const plan = planDepositItem(ledger, itemData, quantity, meta);
    if (!plan.success) return plan;

    // Mutate the real inventory item before committing the ledger flag — if this throws, the
    // ledger is never touched, so a failure here can't credit the bank with treasure that never
    // actually left the player's inventory.
    try {
      const remaining = (itemData.system.quantity || 1) - quantity;
      if (remaining <= 0) await item.delete();
      else await item.update({ 'system.quantity': remaining });
    } catch (err) {
      console.error('[Westford Bank] depositItem: failed to update the source item', err);
      return { success: false, reason: `Failed to remove ${itemData.name} from your inventory — deposit cancelled.` };
    }

    const flagError = await commitLedger(actor, plan.ledger, `${itemData.name} was removed from your inventory but the ledger failed to save — tell your DM.`);
    return flagError ?? plan;
  });
}

/**
 * Withdraw `quantity` of a ledger item entry into `targetContainer`, an ordinary storage
 * container already owned by `actor`. Runs the type/capacity gate (checkWithdrawTarget) before
 * mutating anything — on failure, nothing changes and the caller gets {success:false, reasonType}.
 */
export async function withdrawItem(actor, entryId, quantity, targetContainer) {
  return withActorLock(actor.id, async () => {
    const ledger = getLedger(actor);
    const entry = ledger.items.find((e) => e.entryId === entryId);
    if (!entry) return { success: false, reason: 'That ledger entry no longer exists.' };

    const reconstructed = {
      ...entry.itemData,
      system: { ...entry.itemData.system, containerId: targetContainer.id, quantity },
    };
    const containerCheck = checkWithdrawTarget(reconstructed, targetContainer, actor.items);
    const meta = currentUserMeta('player', targetContainer.id);
    const plan = planWithdrawItem(ledger, entryId, quantity, containerCheck, meta);
    if (!plan.success) return plan;

    // Merge into an existing matching stack in the target container — mirrors
    // character-sheet.js's _handleStackedItemDrop matching-stack lookup (name+type+containerId+
    // storedSize). Unique entries are never merged, even on a name match.
    const matching = !plan.unique && actor.items.find((i) =>
      i.name === entry.name && i.type === reconstructed.type &&
      i.system.containerId === targetContainer.id && i.system.storedSize === reconstructed.system.storedSize);

    // Create/update the real destination item before committing the ledger flag — if this
    // throws, the ledger is never touched, so a failure here can't make banked treasure vanish
    // without it actually reaching the player's inventory (the bug this fixes: previously the
    // flag was written first, so a failure here silently left the bank debited with nothing to
    // show for it and no error surfaced, since the rejection was never caught by the caller).
    try {
      if (matching) {
        await matching.update({ 'system.quantity': (matching.system.quantity || 1) + quantity });
      } else {
        await actor.createEmbeddedDocuments('Item', [
          { ...plan.itemDataToCreate, system: { ...plan.itemDataToCreate.system, quantity, containerId: targetContainer.id } },
        ]);
      }
    } catch (err) {
      console.error('[Westford Bank] withdrawItem: failed to create/update the destination item', err);
      return { success: false, reason: `Failed to place ${entry.name} into ${targetContainer.name} — withdrawal cancelled.` };
    }

    const flagError = await commitLedger(actor, plan.ledger, `${entry.name} was placed into ${targetContainer.name} but the ledger failed to save — tell your DM.`);
    return flagError ?? plan;
  });
}

/**
 * Deposit `quantity` coins of a denomination from a live coin item already in one of the
 * actor's containers.
 * @param {Item} sourceCoinItem - the live 'coin' item being dragged (owned by `actor`)
 */
export async function depositCurrency(actor, denomination, quantity, sourceCoinItem) {
  return withActorLock(actor.id, async () => {
    const ledger = getLedger(actor);
    const meta = currentUserMeta('player', sourceCoinItem.system.containerId ?? null);
    const plan = planDepositCurrency(ledger, denomination, quantity, meta);
    if (!plan.success) return plan;

    try {
      const remaining = (sourceCoinItem.system.quantity || 0) - quantity;
      if (remaining <= 0) await sourceCoinItem.delete();
      else await sourceCoinItem.update({ 'system.quantity': remaining });
    } catch (err) {
      console.error('[Westford Bank] depositCurrency: failed to update the source coin item', err);
      return { success: false, reason: `Failed to remove ${denomination} coins from your inventory — deposit cancelled.` };
    }

    const flagError = await commitLedger(actor, plan.ledger, `${denomination} coins were removed from your inventory but the ledger failed to save — tell your DM.`);
    return flagError ?? plan;
  });
}

/** Withdraw `quantity` coins of a denomination into `targetContainer`. */
export async function withdrawCurrency(actor, denomination, quantity, targetContainer) {
  return withActorLock(actor.id, async () => {
    const ledger = getLedger(actor);
    const template = COIN_TEMPLATES[DENOMINATION_TO_COIN_NAME[denomination]];
    if (!template) return { success: false, reason: `Unknown currency denomination: ${denomination}.` };

    const syntheticCoin = { type: 'coin', name: template.name, system: { ...template.system, quantity, containerId: targetContainer.id } };
    const containerCheck = checkWithdrawTarget(syntheticCoin, targetContainer, actor.items);
    const meta = currentUserMeta('player', targetContainer.id);
    const plan = planWithdrawCurrency(ledger, denomination, quantity, containerCheck, meta);
    if (!plan.success) return plan;

    // Create/update the real destination coin item before committing the ledger flag — see the
    // identical comment in withdrawItem above for why this ordering matters.
    try {
      const existing = actor.items.find((i) => i.type === 'coin' && i.name === template.name && i.system.containerId === targetContainer.id);
      if (existing) {
        await existing.update({ 'system.quantity': (existing.system.quantity || 0) + quantity });
      } else {
        await actor.createEmbeddedDocuments('Item', [
          { ...template, system: { ...template.system, quantity, containerId: targetContainer.id } },
        ]);
      }
    } catch (err) {
      console.error('[Westford Bank] withdrawCurrency: failed to create/update the destination coin item', err);
      return { success: false, reason: `Failed to place ${denomination} coins into ${targetContainer.name} — withdrawal cancelled.` };
    }

    const flagError = await commitLedger(actor, plan.ledger, `${denomination} coins were placed into ${targetContainer.name} but the ledger failed to save — tell your DM.`);
    return flagError ?? plan;
  });
}

/** DM-only: set a target actor's ledger currency to an absolute value. No container involved. */
export async function dmEditCurrency(targetActor, denomination, newValue) {
  return withActorLock(targetActor.id, async () => {
    const ledger = getLedger(targetActor);
    const plan = planSetCurrency(ledger, denomination, newValue, { actorType: 'dm', actorId: game.user.id });
    if (!plan.success) return plan;
    const flagError = await commitLedger(targetActor, plan.ledger, 'Failed to save the ledger — try again.');
    return flagError ?? plan;
  });
}

/** DM-only: add a ledger item entry with no backing catalog item (name/qty/unique only). */
export async function dmAddItem(targetActor, { name, img, quantity, unique }) {
  return withActorLock(targetActor.id, async () => {
    const ledger = getLedger(targetActor);
    const itemData = {
      type: 'item',
      name,
      img: img || 'icons/svg/item-bag.svg',
      system: { treasure: true, tags: unique ? ['unique'] : [], cost: 0, unitWeight: 0, storedSize: 0 },
    };
    const plan = planDepositItem(ledger, itemData, quantity, { actorType: 'dm', actorId: game.user.id });
    if (!plan.success) return plan;
    const flagError = await commitLedger(targetActor, plan.ledger, 'Failed to save the ledger — try again.');
    return flagError ?? plan;
  });
}

/** DM-only: remove `quantity` of an existing ledger item entry, no container check. */
export async function dmRemoveItem(targetActor, entryId, quantity) {
  return withActorLock(targetActor.id, async () => {
    const ledger = getLedger(targetActor);
    const plan = planWithdrawItem(ledger, entryId, quantity, { allowed: true }, { actorType: 'dm', actorId: game.user.id });
    if (!plan.success) return plan;
    const flagError = await commitLedger(targetActor, plan.ledger, 'Failed to save the ledger — try again.');
    return flagError ?? plan;
  });
}
