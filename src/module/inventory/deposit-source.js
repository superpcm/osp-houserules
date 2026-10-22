import { isTreasureEligible } from "./bank-ledger.js";

const COIN_DENOMINATIONS = {
  "Gold Coins": "gold",
  "Silver Coins": "silver",
  "Copper Coins": "copper",
};

function liveItem(actor, source) {
  if (!actor || !source?.id || source.parent && source.parent !== actor || source.actor && source.actor !== actor) return null;
  const items = actor.items;
  const live = typeof items?.get === "function" ? items.get(source.id) : items?.find?.((item) => item.id === source.id);
  return live === source ? live : null;
}

function validQuantity(quantity, available) {
  return Number.isInteger(quantity) && quantity > 0 && Number.isInteger(available) && available > 0 && quantity <= available;
}

/** Validate and re-read an inventory-backed deposit source immediately before mutation. */
export function validateDepositSource(actor, source, quantity, { currency = false, denomination = null, requireTreasure = true } = {}) {
  const item = liveItem(actor, source);
  if (!item) return { success: false, reason: "That inventory item is no longer available." };
  const available = item.system?.quantity;
  if (!validQuantity(quantity, available)) return { success: false, reason: "Quantity must be a positive whole number and no greater than the live source quantity." };

  const itemData = item.toObject();
  if (currency) {
    const actualDenomination = COIN_DENOMINATIONS[item.name];
    if (item.type !== "coin" || !actualDenomination) return { success: false, reason: "That item is not a supported currency coin stack." };
    if (denomination != null && denomination !== actualDenomination) return { success: false, reason: "The requested denomination does not match the source coin item." };
    return { success: true, item, itemData, denomination: actualDenomination };
  }
  if (requireTreasure && !isTreasureEligible(itemData)) return { success: false, reason: `${item.name ?? "This item"} is not treasure and cannot be deposited.` };
  return { success: true, item, itemData };
}
