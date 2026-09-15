/** Westford Storehouse storage and GM-coordinated shared transactions. */
import { checkWithdrawTarget } from "./container-capacity.js";

const SCOPE = "osp-houserules";
const PERSONAL_FLAG = "storehouse";
const PARTY_SETTING = "partyStorehouse";
const CHANNEL = "system.osp-houserules-storehouse";
const ALLOWED_TYPES = new Set(["weapon", "armor", "ammunition", "item", "clothing"]);
const pending = new Map();
let queue = Promise.resolve();

export const emptyStorehouse = () => ({ items: [], log: [] });
export const getPersonalStorehouse = (actor) => actor.getFlag(SCOPE, PERSONAL_FLAG) ?? emptyStorehouse();
export const getPartyStorehouse = () => game.settings.get(game.system.id, PARTY_SETTING) ?? emptyStorehouse();

export function isStorehouseEligible(item) {
  if (!item || !ALLOWED_TYPES.has(item.type)) return false;
  if (item.type === "item" && item.system?.treasure === true) return false;
  return item.type !== "coin";
}

function cleanItemData(itemData) {
  const { _id, ...rest } = itemData;
  return { ...rest, system: { ...rest.system, containerId: null, lashed: false, equipped: false } };
}

function unique(itemData) { return (itemData.system?.tags ?? []).includes("unique"); }
function clone(value) { return structuredClone(value); }
function id() { return foundry.utils.randomID(); }
function audit(user, actor, action, entry, quantity) {
  return { timestamp: Date.now(), userId: user.id, characterId: actor.id, characterName: actor.name, action, itemName: entry.name, quantity };
}

function addToStore(store, itemData, quantity, user, actor, action = "deposit") {
  if (!Number.isInteger(quantity) || quantity < 1) return { success: false, reason: "Quantity must be a positive whole number." };
  if (!isStorehouseEligible(itemData)) return { success: false, reason: `${itemData.name} belongs in Westford Bank or cannot be stored here.` };
  const next = clone(store);
  const isUnique = unique(itemData);
  const existing = !isUnique && next.items.find((entry) => entry.name === itemData.name && entry.type === itemData.type);
  if (existing) existing.quantity += quantity;
  else next.items.push({ entryId: id(), name: itemData.name, type: itemData.type, img: itemData.img, quantity, unique: isUnique, itemData: cleanItemData(itemData) });
  next.log.push(audit(user, actor, action, itemData, quantity));
  return { success: true, store: next };
}

function removeFromStore(store, entryId, quantity, user, actor, action = "withdraw") {
  const entry = store.items.find((candidate) => candidate.entryId === entryId);
  if (!entry) return { success: false, reason: "That stored item is no longer available." };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > entry.quantity) return { success: false, reason: `Quantity must be between 1 and ${entry.quantity}.` };
  const next = clone(store);
  const nextEntry = next.items.find((candidate) => candidate.entryId === entryId);
  if (quantity === nextEntry.quantity) next.items = next.items.filter((candidate) => candidate.entryId !== entryId);
  else nextEntry.quantity -= quantity;
  next.log.push(audit(user, actor, action, entry, quantity));
  return { success: true, store: next, itemData: clone(entry.itemData), unique: entry.unique };
}

async function savePersonal(actor, store) { await actor.setFlag(SCOPE, PERSONAL_FLAG, store); }
async function saveParty(store) { await game.settings.set(game.system.id, PARTY_SETTING, store); }

async function deposit(actor, itemId, quantity, shared, user) {
  const item = actor.items.get(itemId);
  if (!item) return { success: false, reason: "That inventory item is no longer available." };
  const plan = addToStore(shared ? getPartyStorehouse() : getPersonalStorehouse(actor), item.toObject(), quantity, user, actor);
  if (!plan.success) return plan;
  try {
    const remaining = (item.system.quantity || 1) - quantity;
    if (remaining <= 0) await item.delete(); else await item.update({ "system.quantity": remaining });
    if (shared) await saveParty(plan.store); else await savePersonal(actor, plan.store);
    return { success: true };
  } catch (error) {
    console.error("[Westford Storehouse] deposit failed", error);
    return { success: false, reason: "The item could not be deposited." };
  }
}

async function withdraw(actor, entryId, quantity, containerId, shared, user) {
  const store = shared ? getPartyStorehouse() : getPersonalStorehouse(actor);
  const entry = store.items.find((candidate) => candidate.entryId === entryId);
  const container = actor.items.get(containerId);
  if (!entry || !container) return { success: false, reason: "The stored item or destination is no longer available." };
  const itemData = { ...entry.itemData, system: { ...entry.itemData.system, quantity, containerId } };
  const check = checkWithdrawTarget(itemData, container, actor.items);
  if (!check.allowed) return { success: false, reason: check.reason };
  const plan = removeFromStore(store, entryId, quantity, user, actor);
  if (!plan.success) return plan;
  try {
    const matching = !plan.unique && actor.items.find((item) => item.name === itemData.name && item.type === itemData.type && item.system.containerId === containerId && item.system.storedSize === itemData.system.storedSize);
    if (matching) await matching.update({ "system.quantity": (matching.system.quantity || 0) + quantity });
    else await actor.createEmbeddedDocuments("Item", [itemData]);
    if (shared) await saveParty(plan.store); else await savePersonal(actor, plan.store);
    return { success: true };
  } catch (error) {
    console.error("[Westford Storehouse] withdrawal failed", error);
    return { success: false, reason: "The item could not be withdrawn." };
  }
}

function mayUse(user, actor) {
  if (!user || !actor || actor.type !== "character") return false;
  if (user.isGM) return true;
  return actor.getFlag(game.system.id, "party") === true && (actor.ownership[user.id] ?? actor.ownership.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
}

async function execute(message) {
  const user = game.users.get(message.userId);
  const actor = game.actors.get(message.actorId);
  if (!mayUse(user, actor)) return { success: false, reason: "That character is not authorized to use Party Stores." };
  if (message.action === "catalogDeposit") {
    if (!user.isGM) return { success: false, reason: "Only the GM can store items directly from the Items directory." };
    const item = game.items.get(message.itemId);
    if (!item) return { success: false, reason: "That catalog item is no longer available." };
    const plan = addToStore(getPartyStorehouse(), item.toObject(), message.quantity, user, actor, "gm_deposit");
    if (!plan.success) return plan;
    try { await saveParty(plan.store); return { success: true }; }
    catch (error) { console.error("[Westford Storehouse] catalog deposit failed", error); return { success: false, reason: "The catalog item could not be added to Party Stores." }; }
  }
  if (message.action === "deposit") return deposit(actor, message.itemId, message.quantity, true, user);
  if (message.action === "withdraw") return withdraw(actor, message.entryId, message.quantity, message.containerId, true, user);
  return { success: false, reason: "Unknown storehouse transaction." };
}

export function initStorehouse() {
  game.socket.on(CHANNEL, (message) => {
    if (message?.type === "request" && game.user.id === game.users.activeGM?.id) {
      void (queue = queue.catch(() => {}).then(() => execute(message))).then((result) => game.socket.emit(CHANNEL, { type: "result", requestId: message.requestId, userId: message.userId, result }));
    }
    if (message?.type === "result" && message.userId === game.user.id) { pending.get(message.requestId)?.(message.result); pending.delete(message.requestId); }
  });
}

async function requestShared(action, details) {
  const message = { type: "request", requestId: foundry.utils.randomID(), userId: game.user.id, actorId: details.actorId, action, ...details };
  if (game.user.id === game.users.activeGM?.id) return (queue = queue.catch(() => {}).then(() => execute(message)));
  if (!game.users.activeGM) return { success: false, reason: "A GM must be connected to use Party Stores." };
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(message.requestId); resolve({ success: false, reason: "Party Stores did not respond. Please try again." }); }, 10000);
    pending.set(message.requestId, (result) => { clearTimeout(timer); resolve(result); });
    game.socket.emit(CHANNEL, message);
  });
}

export function depositStorehouse(actor, itemId, quantity, shared) {
  return shared ? requestShared("deposit", { actorId: actor.id, itemId, quantity }) : deposit(actor, itemId, quantity, false, game.user);
}
export function withdrawStorehouse(actor, entryId, quantity, containerId, shared) {
  return shared ? requestShared("withdraw", { actorId: actor.id, entryId, quantity, containerId }) : withdraw(actor, entryId, quantity, containerId, false, game.user);
}

export async function depositCatalogStorehouse(actor, item, quantity, shared) {
  if (shared) return requestShared("catalogDeposit", { actorId: actor.id, itemId: item.id, quantity });
  if (!game.user.isGM) return { success: false, reason: "Only the GM can store items directly from the Items directory." };
  const plan = addToStore(getPersonalStorehouse(actor), item.toObject(), quantity, game.user, actor, "gm_deposit");
  if (!plan.success) return plan;
  try { await savePersonal(actor, plan.store); return { success: true }; }
  catch (error) { console.error("[Westford Storehouse] catalog deposit failed", error); return { success: false, reason: "The catalog item could not be added to this locker." }; }
}
