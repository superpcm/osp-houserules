import { canStackItems } from './stack-identity.js';
/**
 * @file Foundry-facing orchestrator for Westford Bank. Resolves live actor flags/items into
 * plain data and calls the pure planners in bank-ledger.js. Inventory/ledger transfers persist
 * a recovery record before either write. Failed writes are reconciled against recorded states;
 * compensation is verified before reporting restoration. Unresolved records block further
 * operations and remain available in the GM ledgers view, including after a restart.
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
import { validateDepositSource } from "./deposit-source.js";
import { runTransaction, itemChange, createdItemChange, flagChange, transactionBlock } from "./transaction-journal.js";
import { requestInventoryMutation, registerInventoryAuthority, inventoryRequester, inventoryActorReference, resolveInventoryActor, inventoryWithdrawalAllowed } from "./inventory-authority.js";

const FLAG_SCOPE = "osp-houserules";
const FLAG_KEY = "bankLedger";

const DENOMINATION_TO_COIN_NAME = { gold: "Gold Coins", silver: "Silver Coins", copper: "Copper Coins" };
const DM_ACTIONS = new Set(["personalBankDmCurrency", "personalBankDmAddItem", "personalBankDmRemoveItem", "personalBankDmCatalogDeposit"]);

// Authority queue serializes planning; this lock also protects direct journal callers.
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
  return { actorType, actorId: inventoryRequester().id, containerId };
}

// Every mutating function below funnels its final flag write through here so a failure at this
// last step (same risk as any other write — a permission hiccup, a dropped connection to the
// GM client that relays the update, etc.) also comes back as an ordinary {success:false} result
// instead of an unhandled rejection the UI layer never sees.
async function commitLedger(actor, ledger) {
  const blocked = transactionBlock(actor);
  if (blocked) return blocked;
  const result = await runTransaction(actor, { authority: true, label: "Edit personal bank ledger", changes: [flagChange(actor, FLAG_KEY, ledger)] });
  return result.success ? null : result;
}

/**
 * Deposit `quantity` of a live, treasure-eligible embedded item into the actor's own ledger.
 * @param {import('../actor/actor.js').OspActor} actor
 * @param {Item} item - the live embedded item being deposited (owned by `actor`)
 * @param {number} quantity
 */
async function depositItemCore(actor, item, quantity) {
  return withActorLock(actor.id, async () => {
    const blocked = transactionBlock(actor);
    if (blocked) return blocked;
    const source = validateDepositSource(actor, item, quantity);
    if (!source.success) return source;
    const { item: liveItem, itemData } = source;
    const ledger = getLedger(actor);
    const meta = currentUserMeta('player', liveItem.system.containerId ?? null);
    const plan = planDepositItem(ledger, itemData, quantity, meta);
    if (!plan.success) return plan;

    const result = await runTransaction(actor, { authority: true, label: `Deposit ${quantity}× ${itemData.name} into Westford Bank`, changes: [
      itemChange(actor, liveItem, liveItem.system.quantity - quantity),
      flagChange(actor, FLAG_KEY, plan.ledger),
    ] });
    return result.success ? plan : result;
  });
}

/**
 * Withdraw `quantity` of a ledger item entry into `targetContainer`, an ordinary storage
 * container already owned by `actor`. Runs the type/capacity gate (checkWithdrawTarget) before
 * mutating anything — on failure, nothing changes and the caller gets {success:false, reasonType}.
 */
async function withdrawItemCore(actor, entryId, quantity, targetContainer) {
  return withActorLock(actor.id, async () => {
    const blocked = transactionBlock(actor);
    if (blocked) return blocked;
    if (!targetContainer || targetContainer.type !== "container") return { success: false, reason: "Destination container is unavailable." };
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
    // character-sheet.js's shared full-identity check. Unique entries are never merged.
    const matching = !plan.unique && actor.items.find((i) =>
      i.system.containerId === targetContainer.id && !i.system.equipped && !i.system.lashed && canStackItems(i, reconstructed));

    const inventoryChange = matching
      ? itemChange(actor, matching, (matching.system.quantity || 0) + quantity)
      : createdItemChange(actor, { ...plan.itemDataToCreate, system: { ...plan.itemDataToCreate.system, quantity, containerId: targetContainer.id } });
    const result = await runTransaction(actor, { authority: true, label: `Withdraw ${quantity}× ${entry.name} from Westford Bank`, changes: [inventoryChange, flagChange(actor, FLAG_KEY, plan.ledger)] });
    return result.success ? plan : result;
  });
}

/**
 * Deposit `quantity` coins of a denomination from a live coin item already in one of the
 * actor's containers.
 * @param {Item} sourceCoinItem - the live 'coin' item being dragged (owned by `actor`)
 */
async function depositCurrencyCore(actor, denomination, quantity, sourceCoinItem) {
  return withActorLock(actor.id, async () => {
    const blocked = transactionBlock(actor);
    if (blocked) return blocked;
    const source = validateDepositSource(actor, sourceCoinItem, quantity, { currency: true, denomination });
    if (!source.success) return source;
    const { item: liveItem, denomination: actualDenomination } = source;
    const ledger = getLedger(actor);
    const meta = currentUserMeta('player', liveItem.system.containerId ?? null);
    const plan = planDepositCurrency(ledger, actualDenomination, quantity, meta);
    if (!plan.success) return plan;

    const result = await runTransaction(actor, { authority: true, label: `Deposit ${quantity} ${actualDenomination} into Westford Bank`, changes: [
      itemChange(actor, liveItem, liveItem.system.quantity - quantity), flagChange(actor, FLAG_KEY, plan.ledger),
    ] });
    return result.success ? plan : result;
  });
}

/** Withdraw `quantity` coins of a denomination into `targetContainer`. */
async function withdrawCurrencyCore(actor, denomination, quantity, targetContainer) {
  return withActorLock(actor.id, async () => {
    const blocked = transactionBlock(actor);
    if (blocked) return blocked;
    if (!targetContainer || targetContainer.type !== "container") return { success: false, reason: "Destination container is unavailable." };
    const ledger = getLedger(actor);
    const template = COIN_TEMPLATES[DENOMINATION_TO_COIN_NAME[denomination]];
    if (!template) return { success: false, reason: `Unknown currency denomination: ${denomination}.` };

    const syntheticCoin = { type: 'coin', name: template.name, system: { ...template.system, quantity, containerId: targetContainer.id } };
    const containerCheck = checkWithdrawTarget(syntheticCoin, targetContainer, actor.items);
    const meta = currentUserMeta('player', targetContainer.id);
    const plan = planWithdrawCurrency(ledger, denomination, quantity, containerCheck, meta);
    if (!plan.success) return plan;

    const existing = actor.items.find((i) => i.system.containerId === targetContainer.id && !i.system.equipped && !i.system.lashed && canStackItems(i, { ...template, type: 'coin' }));
    const inventoryChange = existing
      ? itemChange(actor, existing, (existing.system.quantity || 0) + quantity)
      : createdItemChange(actor, { ...template, system: { ...template.system, quantity, containerId: targetContainer.id } });
    const result = await runTransaction(actor, { authority: true, label: `Withdraw ${quantity} ${denomination} from Westford Bank`, changes: [inventoryChange, flagChange(actor, FLAG_KEY, plan.ledger)] });
    return result.success ? plan : result;
  });
}

/** DM-only: set a target actor's ledger currency to an absolute value. No container involved. */
async function dmEditCurrencyCore(targetActor, denomination, newValue) {
  return withActorLock(targetActor.id, async () => {
    const ledger = getLedger(targetActor);
    const plan = planSetCurrency(ledger, denomination, newValue, { actorType: 'dm', actorId: inventoryRequester().id });
    if (!plan.success) return plan;
    const flagError = await commitLedger(targetActor, plan.ledger);
    return flagError ?? plan;
  });
}

/** DM-only: add a ledger item entry with no backing catalog item (name/qty/unique only). */
async function dmAddItemCore(targetActor, { name, img, quantity, unique }) {
  return withActorLock(targetActor.id, async () => {
    const ledger = getLedger(targetActor);
    const itemData = {
      type: 'item',
      name,
      img: img || 'icons/svg/item-bag.svg',
      system: { treasure: true, tags: unique ? ['unique'] : [], cost: 0, unitWeight: 0, storedSize: 0 },
    };
    const plan = planDepositItem(ledger, itemData, quantity, { actorType: 'dm', actorId: inventoryRequester().id });
    if (!plan.success) return plan;
    const flagError = await commitLedger(targetActor, plan.ledger);
    return flagError ?? plan;
  });
}

/** DM-only: remove `quantity` of an existing ledger item entry, no container check. */
async function dmRemoveItemCore(targetActor, entryId, quantity) {
  return withActorLock(targetActor.id, async () => {
    const ledger = getLedger(targetActor);
    const plan = planWithdrawItem(ledger, entryId, quantity, { allowed: true }, { actorType: 'dm', actorId: inventoryRequester().id });
    if (!plan.success) return plan;
    const flagError = await commitLedger(targetActor, plan.ledger);
    return flagError ?? plan;
  });
}

/** GM-only: copy a catalog coin or treasure item directly into a personal ledger. */
async function dmDepositCatalogItemCore(targetActor, itemData, quantity, denomination = null) {
  return withActorLock(targetActor.id, async () => {
    const ledger = getLedger(targetActor);
    const meta = { actorType: 'dm', actorId: inventoryRequester().id, characterId: targetActor.id, characterName: targetActor.name, action: 'gm_deposit' };
    const plan = denomination
      ? planDepositCurrency(ledger, denomination, quantity, meta)
      : planDepositItem(ledger, itemData, quantity, meta);
    if (!plan.success) return plan;
    const flagError = await commitLedger(targetActor, plan.ledger);
    return flagError ?? plan;
  });
}

export function depositItem(actor, item, quantity, operationId = null) {
  return requestInventoryMutation("personalBankDepositItem", { ...inventoryActorReference(actor), itemId: item.id, quantity }, null, operationId);
}
export function withdrawItem(actor, entryId, quantity, container, operationId = null) {
  return requestInventoryMutation("personalBankWithdrawItem", { ...inventoryActorReference(actor), entryId, quantity, containerId: container.id }, null, operationId);
}
export function depositCurrency(actor, denomination, quantity, item, operationId = null) {
  return requestInventoryMutation("personalBankDepositCurrency", { ...inventoryActorReference(actor), denomination, quantity, itemId: item.id }, null, operationId);
}
export function withdrawCurrency(actor, denomination, quantity, container, operationId = null) {
  return requestInventoryMutation("personalBankWithdrawCurrency", { ...inventoryActorReference(actor), denomination, quantity, containerId: container.id }, null, operationId);
}
export function dmEditCurrency(actor, denomination, newValue, operationId = null) {
  return requestInventoryMutation("personalBankDmCurrency", { ...inventoryActorReference(actor), denomination, newValue }, null, operationId);
}
export function dmAddItem(actor, data, operationId = null) {
  return requestInventoryMutation("personalBankDmAddItem", { ...data, ...inventoryActorReference(actor) }, null, operationId);
}
export function dmRemoveItem(actor, entryId, quantity, operationId = null) {
  return requestInventoryMutation("personalBankDmRemoveItem", { ...inventoryActorReference(actor), entryId, quantity }, null, operationId);
}
export function dmDepositCatalogItem(actor, itemData, quantity, denomination = null, operationId = null) {
  const itemId = itemData?._id ?? itemData?.id;
  return requestInventoryMutation("personalBankDmCatalogDeposit", { ...inventoryActorReference(actor), itemId, cost: itemData?.system?.cost, quantity, denomination }, null, operationId);
}

export function initBankLedgerAuthority() {
  const actions = {
    personalBankDepositItem: (actor, details) => depositItemCore(actor, find(actor, details.itemId), details.quantity),
    personalBankWithdrawItem: (actor, details) => withdrawItemCore(actor, details.entryId, details.quantity, find(actor, details.containerId)),
    personalBankDepositCurrency: (actor, details) => depositCurrencyCore(actor, details.denomination, details.quantity, find(actor, details.itemId)),
    personalBankWithdrawCurrency: (actor, details) => withdrawCurrencyCore(actor, details.denomination, details.quantity, find(actor, details.containerId)),
    personalBankDmCurrency: (actor, details) => dmEditCurrencyCore(actor, details.denomination, details.newValue),
    personalBankDmAddItem: (actor, details) => dmAddItemCore(actor, details),
    personalBankDmRemoveItem: (actor, details) => dmRemoveItemCore(actor, details.entryId, details.quantity),
    personalBankDmCatalogDeposit: (actor, details) => {
      const item = game.items?.get?.(details.itemId);
      if (!item) return { success: false, reason: "That catalog item is no longer available." };
      const itemData = item.toObject();
      if (details.cost !== undefined) itemData.system.cost = details.cost;
      return dmDepositCatalogItemCore(actor, itemData, details.quantity, details.denomination);
    },
  };
  const find = (actor, id) => actor.items.get?.(id) ?? actor.items.find(item => item.id === id);
  for (const [action, execute] of Object.entries(actions)) registerInventoryAuthority(action, async (details, message) => {
    const actor = await resolveInventoryActor(details), user = game.users.get(message.userId);
    const owner = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
    if (!actor || actor.type !== "character" || !user || (!user.isGM && (DM_ACTIONS.has(action) || (actor.ownership?.[user.id] ?? actor.ownership?.default ?? 0) < owner))) return { success: false, reason: "That character is not authorized to use this bank." };
    if ((action === "personalBankWithdrawItem" || action === "personalBankWithdrawCurrency") && !inventoryWithdrawalAllowed(user)) return { success: false, reason: "Store withdrawals are currently locked by the GM." };
    return execute(actor, details);
  });
}
