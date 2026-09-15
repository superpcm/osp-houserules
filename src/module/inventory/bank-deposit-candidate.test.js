import { afterEach, describe, expect, it } from 'vitest';
import { getBankDepositCandidate } from './bank-deposit-candidate.js';

function actorWith(item) {
  return {
    id: 'actor-1',
    uuid: 'Actor.actor-1',
    items: { get: (id) => id === item.id ? item : null },
  };
}

function embeddedItem(overrides = {}) {
  return {
    id: 'item-1',
    name: 'Diamond',
    type: 'item',
    actor: { id: 'actor-1' },
    system: { treasure: true },
    ...overrides,
  };
}

describe('getBankDepositCandidate', () => {
  afterEach(() => { delete globalThis.game; });

  it('accepts tracked treasure while dragover payload data is hidden', () => {
    const item = embeddedItem();
    expect(getBankDepositCandidate(actorWith(item), {}, item)).toMatchObject({ valid: true, item });
  });

  it('accepts tracked recognized coins while dragover payload data is hidden', () => {
    const item = embeddedItem({ name: 'Silver Coins', type: 'coin', system: { quantity: 15 } });
    expect(getBankDepositCandidate(actorWith(item), {}, item)).toMatchObject({
      valid: true,
      item,
      denomination: 'silver',
    });
  });

  it('rejects an item tracked from a different actor', () => {
    const item = embeddedItem({ actor: { id: 'someone-else' } });
    expect(getBankDepositCandidate(actorWith(item), {}, item).valid).toBe(false);
  });

  it('still resolves the normal Foundry payload once it is readable at drop time', () => {
    const item = embeddedItem();
    const data = { type: 'Item', uuid: 'Actor.actor-1.Item.item-1' };
    expect(getBankDepositCandidate(actorWith(item), data)).toMatchObject({ valid: true, item });
  });

  it('lets a GM copy eligible treasure from the Items directory', () => {
    globalThis.game = { user: { isGM: true } };
    const item = embeddedItem({ actor: null });
    expect(getBankDepositCandidate(actorWith(item), {}, item)).toMatchObject({ valid: true, item, catalog: true });
  });

  it('does not let a player deposit directly from the Items directory', () => {
    globalThis.game = { user: { isGM: false } };
    const item = embeddedItem({ actor: null });
    expect(getBankDepositCandidate(actorWith(item), {}, item).valid).toBe(false);
  });
});
