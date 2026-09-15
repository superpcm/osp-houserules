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

const CHANNEL = "system.osp-houserules";
const SETTING = "partyTreasury";
const COINS = { gold: "Gold Coins", silver: "Silver Coins", copper: "Copper Coins" };
const pending = new Map();
let queue = Promise.resolve();

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
  await game.settings.set(game.system.id, SETTING, ledger);
}

async function execute(request) {
  const user = game.users.get(request.userId);
  const actor = game.actors.get(request.actorId);
  if (!userMayUseActor(user, actor)) return { success: false, reason: "That character is not authorized to use the Party Treasury." };
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
    try { await save(plan.ledger); return { success: true }; }
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
      const entry = source.items.find((candidate) => candidate.entryId === request.entryId);
      const itemData = { ...entry.itemData, system: { ...entry.itemData.system, quantity: request.quantity } };
      addPlan = planDepositItem(destination, itemData, request.quantity, transferMeta);
    }
    if (!addPlan.success) return addPlan;

    const oldParty = structuredClone(ledger);
    try {
      if (fromParty) {
        await actor.setFlag(game.system.id, "bankLedger", addPlan.ledger);
        try { await save(removePlan.ledger); }
        catch (error) { await actor.setFlag(game.system.id, "bankLedger", personal); throw error; }
      } else {
        await save(addPlan.ledger);
        try { await actor.setFlag(game.system.id, "bankLedger", removePlan.ledger); }
        catch (error) { await save(oldParty); throw error; }
      }
      return { success: true };
    } catch (error) {
      console.error("[Party Treasury] account transfer failed", error);
      return { success: false, reason: "The transfer could not be completed; both accounts were restored." };
    }
  }

  if (request.action === "deposit") {
    const item = actor.items.get(request.itemId);
    if (!item) return { success: false, reason: "That inventory item is no longer available." };
    const quantity = request.quantity;
    const denomination = request.denomination;
    const plan = denomination
      ? planDepositCurrency(ledger, denomination, quantity, meta(user, actor, item.system.containerId ?? null))
      : planDepositItem(ledger, item.toObject(), quantity, meta(user, actor, item.system.containerId ?? null));
    if (!plan.success) return plan;
    try {
      const remaining = (item.system.quantity || 1) - quantity;
      if (remaining <= 0) await item.delete();
      else await item.update({ "system.quantity": remaining });
      await save(plan.ledger);
      return { success: true };
    } catch (error) {
      console.error("[Party Treasury] deposit failed", error);
      return { success: false, reason: "The Party Treasury could not complete that deposit." };
    }
  }

  if (request.action === "withdraw") {
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
    try {
      const unique = !request.denomination && plan.unique;
      const matching = !unique && actor.items.find((item) => item.name === itemData.name && item.type === itemData.type && item.system.containerId === container.id && item.system.storedSize === itemData.system.storedSize);
      if (matching) await matching.update({ "system.quantity": (matching.system.quantity || 0) + quantity });
      else await actor.createEmbeddedDocuments("Item", [itemData]);
      await save(plan.ledger);
      return { success: true };
    } catch (error) {
      console.error("[Party Treasury] withdrawal failed", error);
      return { success: false, reason: "The Party Treasury could not complete that withdrawal." };
    }
  }
  return { success: false, reason: "Unknown Party Treasury transaction." };
}

async function handleAsGm(message) {
  const result = await (queue = queue.catch(() => {}).then(() => execute(message)));
  if (message.requestId) game.socket.emit(CHANNEL, { type: "partyTreasuryResult", requestId: message.requestId, userId: message.userId, result });
  return result;
}

export function initPartyTreasury() {
  game.socket.on(CHANNEL, (message) => {
    if (message?.type === "partyTreasuryRequest" && game.user.id === game.users.activeGM?.id) void handleAsGm(message);
    if (message?.type === "partyTreasuryResult" && message.userId === game.user.id) {
      pending.get(message.requestId)?.(message.result);
      pending.delete(message.requestId);
    }
  });
}

export async function requestPartyTreasury(action, details) {
  const message = { type: "partyTreasuryRequest", requestId: foundry.utils.randomID(), userId: game.user.id, actorId: details.actorId, action, ...details };
  if (game.user.id === game.users.activeGM?.id) return handleAsGm(message);
  if (!game.users.activeGM) return { success: false, reason: "A GM must be connected to use the Party Treasury." };
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { pending.delete(message.requestId); resolve({ success: false, reason: "The Party Treasury did not respond. Please try again." }); }, 10000);
    pending.set(message.requestId, (result) => { clearTimeout(timeout); resolve(result); });
    game.socket.emit(CHANNEL, message);
  });
}

export async function dmSetPartyCurrency(denomination, value) {
  const plan = planSetCurrency(getPartyTreasury(), denomination, value, { actorType: "dm", actorId: game.user.id, characterName: "DM" });
  if (plan.success) await save(plan.ledger);
  return plan;
}

export async function dmAddPartyItem({ name, img, quantity, unique }) {
  const itemData = { type: "item", name, img: img || "icons/svg/item-bag.svg", system: { treasure: true, tags: unique ? ["unique"] : [], cost: 0, unitWeight: 0, storedSize: 0 } };
  const plan = planDepositItem(getPartyTreasury(), itemData, quantity, { actorType: "dm", actorId: game.user.id, characterName: "DM", action: "dm_edit" });
  if (plan.success) await save(plan.ledger);
  return plan;
}

export async function dmRemovePartyItem(entryId, quantity) {
  const plan = planWithdrawItem(getPartyTreasury(), entryId, quantity, { allowed: true }, { actorType: "dm", actorId: game.user.id, characterName: "DM", action: "dm_edit" });
  if (plan.success) await save(plan.ledger);
  return plan;
}
