import { expect, it } from 'vitest';
import { loadStoreCart, saveStoreCart, receiptForPending, cartLineQuote } from './store-cart.js';

it('persists independent carts by character and store and clears only the completed cart', async () => {
  let flags = {};
  const user = { id: 'cart-user', getFlag: (_scope, key) => flags[key], setFlag: async (_scope, key, value) => { flags[key] = structuredClone(value); } };
  const a = { id: 'a', uuid: 'Actor.a' }, b = { id: 'b', uuid: 'Actor.b' };
  await Promise.all([saveStoreCart(a, 'one', { lines: [{ entryId: 'rope', quantity: 2 }], pending: null }, user), saveStoreCart(b, 'one', { lines: [{ entryId: 'oil', quantity: 1 }], pending: null }, user)]);
  await saveStoreCart(a, 'two', { lines: [{ entryId: 'pack', quantity: 1 }], pending: null }, user);
  await saveStoreCart(a, 'one', { lines: [], pending: null }, user);
  expect(loadStoreCart(a, 'one', user).lines).toEqual([]);
  expect(loadStoreCart(b, 'one', user).lines[0].entryId).toBe('oil');
  expect(loadStoreCart(a, 'two', user).lines[0].entryId).toBe('pack');
});
it('reconciles a lost checkout acknowledgement against its durable actor receipt', () => {
  const receipt = { id: 'purchase-1', totalCp: 15 };
  const actor = { getFlag: () => [receipt] };
  expect(receiptForPending(actor, { pending: { operationId: 'purchase-1' } })).toEqual(receipt);
  expect(receiptForPending(actor, { pending: { operationId: 'other' } })).toBeUndefined();
  const quote = cartLineQuote({ revision: 2, totalCp: 15, lines: [{ entryId: 'rope', quantity: 1, unitPriceCp: 15, destination: 'pack', itemData: { secret: 'not sent' } }] });
  expect(quote.lines[0]).not.toHaveProperty('itemData');
});
