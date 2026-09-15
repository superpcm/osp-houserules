const COIN_NAME_TO_DENOMINATION = {
  'Gold Coins': 'gold',
  'Silver Coins': 'silver',
  'Copper Coins': 'copper',
};

/**
 * Resolve and validate a prospective vault deposit. During dragover, browsers normally hide the
 * dataTransfer payload, so draggedItem is the synchronously-tracked embedded Item fallback.
 */
export function getBankDepositCandidate(actor, data, draggedItem = null) {
  const actorUuid = actor.uuid ?? `Actor.${actor.id}`;
  const prefix = `${actorUuid}.Item.`;
  let item = null;

  if (data?.type === 'Item' && data.uuid?.startsWith(prefix)) {
    item = actor.items.get(data.uuid.slice(prefix.length)) ?? null;
  }

  if (!item && draggedItem?.actor?.id === actor.id) item = draggedItem;

  const catalogItem = !item && globalThis.game?.user?.isGM && draggedItem && !draggedItem.actor ? draggedItem : null;
  if (catalogItem) {
    if (catalogItem.type === 'coin') {
      const denomination = COIN_NAME_TO_DENOMINATION[catalogItem.name];
      return denomination
        ? { valid: true, item: catalogItem, denomination, catalog: true }
        : { valid: false, reason: `${catalogItem.name} isn't a recognized coin denomination.` };
    }
    if (catalogItem.type === 'item' && catalogItem.system.treasure === true) return { valid: true, item: catalogItem, catalog: true };
    return { valid: false, reason: `${catalogItem.name} is not treasure and cannot be deposited.` };
  }

  if (!item) {
    if (data?.type && data.type !== 'Item') {
      return { valid: false, reason: 'Drop a coin stack or treasure item.' };
    }
    if (data?.uuid && !data.uuid.startsWith(prefix)) {
      return { valid: false, reason: 'You can only deposit items from your own inventory.' };
    }
    return { valid: false, reason: 'That inventory item is no longer available.' };
  }

  if (item.type === 'coin') {
    const denomination = COIN_NAME_TO_DENOMINATION[item.name];
    return denomination
      ? { valid: true, item, denomination }
      : { valid: false, reason: `${item.name} isn't a recognized coin denomination.` };
  }
  if (item.type === 'item' && item.system.treasure === true) return { valid: true, item };
  return { valid: false, reason: `${item.name} is not treasure and cannot be deposited.` };
}
