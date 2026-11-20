const SCOPE = 'osp-houserules';
const FLAG = 'storeCarts';
const writes = new Map();
const clone = value => structuredClone(value);
// Dots have path semantics in Foundry document updates, so UUIDs must be encoded
// before they are used as keys inside a persistent flag object.
const keyFor = (actor, storeId) => [actor.uuid ?? actor.id, storeId].map(value => encodeURIComponent(value).replace(/\./g, '%2E')).join(':');

export function loadStoreCart(actor, storeId, user = game.user) {
  const saved = user.getFlag(SCOPE, FLAG)?.[keyFor(actor, storeId)];
  return clone(saved && Array.isArray(saved.lines) ? saved : { lines: [], pending: null });
}

export function saveStoreCart(actor, storeId, cart, user = game.user) {
  const previous = writes.get(user.id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const carts = clone(user.getFlag(SCOPE, FLAG) ?? {});
    carts[keyFor(actor, storeId)] = clone({ ...cart, updatedAt: Date.now() });
    await user.setFlag(SCOPE, FLAG, carts);
  });
  writes.set(user.id, next);
  return next;
}

export function receiptForPending(actor, cart) {
  return cart.pending && (actor.getFlag(SCOPE, 'storeReceipts') ?? []).find(receipt => receipt.id === cart.pending.operationId);
}

export function cartLineQuote(quote) {
  return { revision: quote.revision, totalCp: quote.totalCp, lines: quote.lines.map(({ entryId, quantity, bundleQuantity, unitPriceCp, destination }) => ({ entryId, quantity, bundleQuantity, unitPriceCp, destination })) };
}
