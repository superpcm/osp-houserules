import { canStackItems, isUniqueStackItem } from './stack-identity.js';
/**
 * Shared Westford Bank account. The ledger lives in a hidden world setting and every mutation
 * is executed by the active GM, serializing changes from different player clients.
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
import { runTransaction, itemChange, createdItemChange, flagChange, settingChange, transactionBlock } from "./transaction-journal.js";
import { requestInventoryMutation, registerInventoryAuthority, resolveInventoryActor, inventoryWithdrawalAllowed } from "./inventory-authority.js";

const SETTING = "partyTreasury";
const COINS = { gold: "Gold Coins", silver: "Silver Coins", copper: "Copper Coins" };

export function getPartyTreasury() {
  return game.settings.get(game.system.id, SETTING) ?? emptyLedger();
}

function userMayUseActor(user, actor) {
  if (!user || !actor || actor.type !== "character") return false;
  if (user.isGM) return true;
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  return actor.getFlag(game.system.id, "party") === true && (actor.ownership[user.id] ?? actor.ownership.default ?? 0) >= owner;
}

function meta(user, actor, containerId = null) {
  return { actorType: user.isGM ? "dm" : "player", actorId: user.id, characterId: actor.id, characterName: actor.name, containerId };
}

async function save(ledger) {
  const result = await runTransaction(null, { authority: true, label: "Edit Party Treasury", changes: [settingChange(SETTING, ledger)] });
  if (!result.success) return result;
  return { success: true };
}

async function execute(request) {
  const user = game.users.get(request.userId);
  const actor = await resolveInventoryActor(request);
  if (!userMayUseActor(user, actor)) return { success: false, reason: "That character is not authorized to use the Party Treasury." };
  const blocked = transactionBlock(actor, [{ kind: "setting", key: SETTING }]);
  if (blocked) return blocked;
  const ledger = getPartyTreasury();

  if (request.action === "catalogDeposit") {
    if (!user.isGM) return { success: false, reason: "Only the GM can deposit directly from the Items directory." };
    const item = game.items.get(request.itemId);
    if (!item) return { success: false, reason: "That catalog item is no longer available." };
    const itemData = item.toObject();
    if (!request.denomination && request.cost !== undefined) itemData.system.cost = request.cost;
    const depositMeta = { ...meta(user, actor), action: "gm_deposit" };
    const plan = request.denomination
      ? planDepositCurrency(ledger, request.denomination, request.quantity, depositMeta)
      : planDepositItem(ledger, itemData, request.quantity, depositMeta);
    if (!plan.success) return plan;
    try { return await save(plan.ledger); }
    catch (error) {
      console.error("[Party Treasury] catalog deposit failed", error);
      return { success: false, reason: "The catalog item could not be added to the Party Treasury." };
    }
  }

  if (request.action === "transfer") {
    const personal = actor.getFlag(game.system.id, "bankLedger") ?? emptyLedger();
    const fromParty = request.sourceAccount === "party";
    if (fromParty === (request.destinationAccount === "party")) return { success: false, reason: "Choose the other bank account as the destination." };
    const source = fromParty ? ledger : personal;
    const destination = fromParty ? personal : ledger;
    const transferMeta = { ...meta(user, actor), action: fromParty ? "transfer_to_personal" : "transfer_to_party" };
    let removePlan;
    let addPlan;
    if (request.payloadType === "currency") {
      removePlan = planWithdrawCurrency(source, request.denomination, request.quantity, { allowed: true }, transferMeta);
      if (!removePlan.success) return removePlan;
      addPlan = planDepositCurrency(destination, request.denomination, request.quantity, transferMeta);
    } else {
      removePlan = planWithdrawItem(source, request.entryId, request.quantity, { allowed: true }, transferMeta);
      if (!removePlan.success) return removePlan;
      const itemData = { ...removePlan.itemDataToCreate, system: { ...removePlan.itemDataToCreate.system, quantity: request.quantity } };
      addPlan = planDepositItem(destination, itemData, request.quantity, transferMeta);
    }
    if (!addPlan.success) return addPlan;

    const changes = fromParty
      ? [flagChange(actor, "bankLedger", addPlan.ledger), settingChange(SETTING, removePlan.ledger)]
      : [settingChange(SETTING, addPlan.ledger), flagChange(actor, "bankLedger", removePlan.ledger)];
    return runTransaction(actor, { authority: true, label: `Transfer ${request.quantity} from ${fromParty ? "Party Treasury to personal bank" : "personal bank to Party Treasury"}`, changes });
  }

  if (request.action === "deposit") {
    const item = actor.items.get(request.itemId);
    if (!item) return { success: false, reason: "That inventory item is no longer available." };
    const quantity = request.quantity;
    const source = validateDepositSource(actor, item, quantity, { currency: Boolean(request.denomination), denomination: request.denomination ?? null });
    if (!source.success) return source;
    const denomination = source.denomination;
    const plan = denomination
      ? planDepositCurrency(ledger, denomination, quantity, meta(user, actor, source.item.system.containerId ?? null))
      : planDepositItem(ledger, source.itemData, quantity, meta(user, actor, source.item.system.containerId ?? null));
    if (!plan.success) return plan;
    return runTransaction(actor, { authority: true, label: `Deposit ${quantity}× ${item.name} into Party Treasury`, changes: [
      itemChange(actor, source.item, source.item.system.quantity - quantity), settingChange(SETTING, plan.ledger),
    ] });
  }

  if (request.action === "withdraw") {
    if (!inventoryWithdrawalAllowed(user)) return { success: false, reason: "Store withdrawals are currently locked by the GM." };
    const container = actor.items.get(request.containerId);
    if (!container || container.type !== "container") return { success: false, reason: "That destination container is no longer available." };
    const quantity = request.quantity;
    let plan;
    let itemData;
    if (request.denomination) {
      const template = COIN_TEMPLATES[COINS[request.denomination]];
      if (!template) return { success: false, reason: "Unknown currency denomination." };
      itemData = { ...template, system: { ...template.system, quantity, containerId: container.id } };
      plan = planWithdrawCurrency(ledger, request.denomination, quantity, checkWithdrawTarget(itemData, container, actor.items), meta(user, actor, container.id));
    } else {
      const entry = ledger.items.find((candidate) => candidate.entryId === request.entryId);
      if (!entry) return { success: false, reason: "That treasury entry no longer exists." };
      itemData = { ...entry.itemData, system: { ...entry.itemData.system, quantity, containerId: container.id } };
      plan = planWithdrawItem(ledger, request.entryId, quantity, checkWithdrawTarget(itemData, container, actor.items), meta(user, actor, container.id));
    }
    if (!plan.success) return plan;
    const unique = !request.denomination && plan.unique;
    if (unique && !isUniqueStackItem(itemData)) itemData.system.tags = [...(itemData.system.tags ?? []), 'unique'];
    const matching = !unique && actor.items.find((item) => item.system.containerId === container.id && !item.system.equipped && !item.system.lashed && canStackItems(item, itemData));
    const inventoryChange = matching
      ? itemChange(actor, matching, (matching.system.quantity || 0) + quantity)
      : createdItemChange(actor, itemData);
    return runTransaction(actor, { authority: true, label: `Withdraw ${quantity}× ${itemData.name} from Party Treasury`, changes: [inventoryChange, settingChange(SETTING, plan.ledger)] });
  }
  return { success: false, reason: "Unknown Party Treasury transaction." };
}

export function initPartyTreasury() {
  registerInventoryAuthority("partyTreasury", (details, message) => execute({ ...details, userId: message.userId }));
  registerInventoryAuthority("partyTreasuryDmCurrency", (details, message) => dmSetPartyCurrencyAtAuthority(details, message));
  registerInventoryAuthority("partyTreasuryDmAdd", (details, message) => dmAddPartyItemAtAuthority(details, message));
  registerInventoryAuthority("partyTreasuryDmRemove", (details, message) => dmRemovePartyItemAtAuthority(details, message));
}

async function dmSetPartyCurrencyAtAuthority(request, message) {
  const user = game.users.get(message.userId);
  if (!user?.isGM) return { success: false, reason: "Only the GM can edit the Party Treasury directly." };
  const blocked = transactionBlock(null, [{ kind: "setting", key: SETTING }]);
  if (blocked) return blocked;
  const plan = planSetCurrency(getPartyTreasury(), request.denomination, request.value, { actorType: "dm", actorId: user.id, characterName: "DM" });
  return plan.success ? save(plan.ledger) : plan;
}
async function dmAddPartyItemAtAuthority(request, message) {
  const user = game.users.get(message.userId);
  if (!user?.isGM) return { success: false, reason: "Only the GM can edit the Party Treasury directly." };
  const blocked = transactionBlock(null, [{ kind: "setting", key: SETTING }]);
  if (blocked) return blocked;
  const itemData = { type: "item", name: request.name, img: request.img || "icons/svg/item-bag.svg", system: { treasure: true, tags: request.unique ? ["unique"] : [], cost: 0, unitWeight: 0, storedSize: 0 } };
  const plan = planDepositItem(getPartyTreasury(), itemData, request.quantity, { actorType: "dm", actorId: user.id, characterName: "DM", action: "dm_edit" });
  return plan.success ? save(plan.ledger) : plan;
}
async function dmRemovePartyItemAtAuthority(request, message) {
  const user = game.users.get(message.userId);
  if (!user?.isGM) return { success: false, reason: "Only the GM can edit the Party Treasury directly." };
  const blocked = transactionBlock(null, [{ kind: "setting", key: SETTING }]);
  if (blocked) return blocked;
  const plan = planWithdrawItem(getPartyTreasury(), request.entryId, request.quantity, { allowed: true }, { actorType: "dm", actorId: user.id, characterName: "DM", action: "dm_edit" });
  return plan.success ? save(plan.ledger) : plan;
}

export async function requestPartyTreasury(action, details) {
  const payload = { ...details, actorId: details.actorId, action };
  return requestInventoryMutation("partyTreasury", payload, null, details.operationId);
}

export function dmSetPartyCurrency(denomination, value, operationId = null) {
  return requestInventoryMutation("partyTreasuryDmCurrency", { denomination, value }, null, operationId);
}
export function dmAddPartyItem(data, operationId = null) {
  return requestInventoryMutation("partyTreasuryDmAdd", data, null, operationId);
}
export function dmRemovePartyItem(entryId, quantity, operationId = null) {
  return requestInventoryMutation("partyTreasuryDmRemove", { entryId, quantity }, null, operationId);
}
