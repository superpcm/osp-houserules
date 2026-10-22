import { canStackItems, isUniqueStackItem } from './stack-identity.js';
/** Westford Storehouse storage and GM-coordinated shared transactions. */
import { checkWithdrawTarget } from "./container-capacity.js";
import { validateDepositSource } from "./deposit-source.js";
import { runTransaction, itemChange, createdItemChange, flagChange, settingChange, transactionBlock } from "./transaction-journal.js";
import { requestInventoryMutation, registerInventoryAuthority, resolveInventoryActor, inventoryActorReference, inventoryWithdrawalAllowed } from "./inventory-authority.js";

const SCOPE = "osp-houserules";
const PERSONAL_FLAG = "storehouse";
const PARTY_SETTING = "partyStorehouse";
const ALLOWED_TYPES = new Set(["weapon", "armor", "ammunition", "item", "clothing"]);
const actorLocks = new Map();

function withActorLock(actorId, fn) {
  const prior = actorLocks.get(actorId) ?? Promise.resolve();
  const run = prior.catch(() => {}).then(fn);
  actorLocks.set(actorId, run.catch(() => {}));
  return run;
}

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

function unique(itemData) { return isUniqueStackItem(itemData); }
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
  if (isUnique && quantity !== 1) return { success: false, reason: "Unique items can only be stored one at a time." };
  const existing = !isUnique && next.items.find((entry) => !entry.unique && canStackItems(entry.itemData, itemData));
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
  return { success: true, store: next, itemData: clone(entry.itemData), unique: entry.unique || unique(entry.itemData) };
}

async function savePersonal(actor, store) { return runTransaction(actor, { authority: true, label: "Catalog grant to personal locker", changes: [flagChange(actor, PERSONAL_FLAG, store)] }); }
async function saveParty(store) { return runTransaction(null, { authority: true, label: "Catalog grant to Party Stores", changes: [settingChange(PARTY_SETTING, store)] }); }

async function deposit(actor, itemId, quantity, shared, user) {
  return withActorLock(actor.id, async () => {
    const blocked = transactionBlock(actor, shared ? [{ kind: "setting", key: PARTY_SETTING }] : []);
    if (blocked) return blocked;
    const item = actor.items.get(itemId);
    if (!item) return { success: false, reason: "That inventory item is no longer available." };
    const source = validateDepositSource(actor, item, quantity, { requireTreasure: false });
    if (!source.success) return source;
    const plan = addToStore(shared ? getPartyStorehouse() : getPersonalStorehouse(actor), source.itemData, quantity, user, actor);
    if (!plan.success) return plan;
    return runTransaction(actor, { authority: true, label: `Store ${quantity}× ${item.name} in ${shared ? "Party Stores" : "personal locker"}`, changes: [
      itemChange(actor, source.item, source.item.system.quantity - quantity),
      shared ? settingChange(PARTY_SETTING, plan.store) : flagChange(actor, PERSONAL_FLAG, plan.store),
    ] });
  });
}

async function withdraw(actor, entryId, quantity, containerId, shared, user) {
  const blocked = transactionBlock(actor, shared ? [{ kind: "setting", key: PARTY_SETTING }] : []);
  if (blocked) return blocked;
  const store = shared ? getPartyStorehouse() : getPersonalStorehouse(actor);
  const entry = store.items.find((candidate) => candidate.entryId === entryId);
  const container = actor.items.get(containerId);
  if (!entry || !container) return { success: false, reason: "The stored item or destination is no longer available." };
  const itemData = { ...entry.itemData, system: { ...entry.itemData.system, quantity, containerId } };
  const check = checkWithdrawTarget(itemData, container, actor.items);
  if (!check.allowed) return { success: false, reason: check.reason };
  const plan = removeFromStore(store, entryId, quantity, user, actor);
  if (!plan.success) return plan;
  if (plan.unique && !unique(itemData)) itemData.system.tags = [...(itemData.system.tags ?? []), 'unique'];
  const matching = !plan.unique && actor.items.find((item) => item.system.containerId === containerId && !item.system.equipped && !item.system.lashed && canStackItems(item, itemData));
  const inventoryChange = matching
    ? itemChange(actor, matching, (matching.system.quantity || 0) + quantity)
    : createdItemChange(actor, itemData);
  return runTransaction(actor, { authority: true, label: `Retrieve ${quantity}× ${itemData.name} from ${shared ? "Party Stores" : "personal locker"}`, changes: [
    inventoryChange, shared ? settingChange(PARTY_SETTING, plan.store) : flagChange(actor, PERSONAL_FLAG, plan.store),
  ] });
}

function mayUse(user, actor) {
  if (!user || !actor || actor.type !== "character") return false;
  if (user.isGM) return true;
  return actor.getFlag(game.system.id, "party") === true && (actor.ownership[user.id] ?? actor.ownership.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
}
function mayUsePersonal(user, actor) {
  if (!user || !actor || actor.type !== "character") return false;
  if (user.isGM) return true;
  return (actor.ownership[user.id] ?? actor.ownership.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
}

async function execute(message) {
  const user = game.users.get(message.userId);
  const actor = await resolveInventoryActor(message);
  if (!mayUse(user, actor)) return { success: false, reason: "That character is not authorized to use Party Stores." };
  if (message.action === "withdraw" && !inventoryWithdrawalAllowed(user)) return { success: false, reason: "Store withdrawals are currently locked by the GM." };
  const blocked = transactionBlock(actor, [{ kind: "setting", key: PARTY_SETTING }]);
  if (blocked) return blocked;
  if (message.action === "catalogDeposit") {
    if (!user.isGM) return { success: false, reason: "Only the GM can store items directly from the Items directory." };
    const item = game.items.get(message.itemId);
    if (!item) return { success: false, reason: "That catalog item is no longer available." };
    const plan = addToStore(getPartyStorehouse(), item.toObject(), message.quantity, user, actor, "gm_deposit");
    if (!plan.success) return plan;
    try { return await saveParty(plan.store); }
    catch (error) { console.error("[Westford Storehouse] catalog deposit failed", error); return { success: false, reason: "The catalog item could not be added to Party Stores." }; }
  }
  if (message.action === "deposit") return deposit(actor, message.itemId, message.quantity, true, user);
  if (message.action === "withdraw") return withdraw(actor, message.entryId, message.quantity, message.containerId, true, user);
  return { success: false, reason: "Unknown storehouse transaction." };
}

export function initStorehouse() {
  registerInventoryAuthority("storehouse", (details, message) => execute({ ...details, userId: message.userId }));
  const actor = resolveInventoryActor;
  registerInventoryAuthority("personalStorehouseDeposit", async (details, message) => {
    const user = game.users.get(message.userId); const target = await actor(details);
    return mayUsePersonal(user, target) ? deposit(target, details.itemId, details.quantity, false, user) : { success: false, reason: "That character is not authorized to use this locker." };
  });
  registerInventoryAuthority("personalStorehouseWithdraw", async (details, message) => {
    const user = game.users.get(message.userId); const target = await actor(details);
    if (!inventoryWithdrawalAllowed(user)) return { success: false, reason: "Store withdrawals are currently locked by the GM." };
    return mayUsePersonal(user, target) ? withdraw(target, details.entryId, details.quantity, details.containerId, false, user) : { success: false, reason: "That character is not authorized to use this locker." };
  });
  registerInventoryAuthority("personalStorehouseCatalogDeposit", async (details, message) => {
    const target = await actor(details);
    const item = game.items?.get?.(details.itemId);
    const user = game.users.get(message.userId);
    if (!user?.isGM || !target || !item) return { success: false, reason: "The catalog item or personal locker is no longer available." };
    const blocked = transactionBlock(target);
    if (blocked) return blocked;
    const plan = addToStore(getPersonalStorehouse(target), item.toObject(), details.quantity, user, target, "gm_deposit");
    if (!plan.success) return plan;
    try { return await savePersonal(target, plan.store); }
    catch (_error) { return { success: false, reason: "The catalog item could not be added to this locker." }; }
  });
}

export function depositStorehouse(actor, itemId, quantity, shared, operationId = null) {
  return requestInventoryMutation(shared ? "storehouse" : "personalStorehouseDeposit", { ...inventoryActorReference(actor), itemId, quantity, ...(shared ? { action: "deposit" } : {}) }, null, operationId);
}
export function withdrawStorehouse(actor, entryId, quantity, containerId, shared, operationId = null) {
  return requestInventoryMutation(shared ? "storehouse" : "personalStorehouseWithdraw", { ...inventoryActorReference(actor), entryId, quantity, containerId, ...(shared ? { action: "withdraw" } : {}) }, null, operationId);
}
export function depositCatalogStorehouse(actor, item, quantity, shared, operationId = null) {
  return requestInventoryMutation(shared ? "storehouse" : "personalStorehouseCatalogDeposit", { ...inventoryActorReference(actor), itemId: item.id, quantity, ...(shared ? { action: "catalogDeposit" } : {}) }, null, operationId);
}
