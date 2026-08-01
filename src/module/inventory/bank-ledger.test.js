import { describe, it, expect } from 'vitest';
import {
  emptyLedger,
  isTreasureEligible,
  isUniqueItem,
  planDepositItem,
  planWithdrawItem,
  planDepositCurrency,
  planWithdrawCurrency,
  planSetCurrency,
} from './bank-ledger.js';

function treasureItem(name, overrides = {}) {
  return { name, type: 'item', img: 'systems/osp-houserules/assets/images/treasure/ruby.webp', system: { treasure: true, quantity: 1, ...overrides } };
}

describe('isTreasureEligible', () => {
  it('is true only for type:"item" with system.treasure === true', () => {
    expect(isTreasureEligible(treasureItem('Ruby'))).toBe(true);
  });

  it('rejects non-item types even when treasure is true', () => {
    expect(isTreasureEligible({ type: 'weapon', system: { treasure: true } })).toBe(false);
  });

  it('rejects items with treasure false or missing', () => {
    expect(isTreasureEligible({ type: 'item', system: { treasure: false } })).toBe(false);
    expect(isTreasureEligible({ type: 'item', system: {} })).toBe(false);
  });
});

describe('isUniqueItem', () => {
  it('reads the unique tag defensively', () => {
    expect(isUniqueItem({ system: { tags: ['unique'] } })).toBe(true);
    expect(isUniqueItem({ system: { tags: [] } })).toBe(false);
    expect(isUniqueItem({ system: {} })).toBe(false);
    expect(isUniqueItem({})).toBe(false);
  });
});

describe('planDepositItem', () => {
  it('rejects a non-integer or non-positive quantity', () => {
    expect(planDepositItem(emptyLedger(), treasureItem('Ruby'), 0).success).toBe(false);
    expect(planDepositItem(emptyLedger(), treasureItem('Ruby'), 1.5).success).toBe(false);
    expect(planDepositItem(emptyLedger(), treasureItem('Ruby'), -1).success).toBe(false);
  });

  it('rejects a non-treasure item with no dialog-worthy state change', () => {
    const result = planDepositItem(emptyLedger(), { name: 'Torch', type: 'item', system: { treasure: false } }, 1);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/not treasure/);
  });

  it('creates a new entry for a fresh deposit', () => {
    const result = planDepositItem(emptyLedger(), treasureItem('Ruby'), 3, { actorType: 'player', actorId: 'u1' });
    expect(result.success).toBe(true);
    expect(result.ledger.items).toHaveLength(1);
    expect(result.ledger.items[0]).toMatchObject({ name: 'Ruby', quantity: 3, unique: false });
    expect(result.ledger.items[0].itemData._id).toBeUndefined();
    expect(result.logEntry).toMatchObject({ actor: 'player', actorId: 'u1', action: 'deposit', payloadType: 'item', quantity: 3 });
  });

  it('merges into an existing non-unique stack matched by name', () => {
    const first = planDepositItem(emptyLedger(), treasureItem('Ruby'), 2);
    const second = planDepositItem(first.ledger, treasureItem('Ruby'), 3);
    expect(second.ledger.items).toHaveLength(1);
    expect(second.ledger.items[0].quantity).toBe(5);
    expect(second.entryId).toBe(first.entryId);
  });

  it('never merges unique items, even when the name matches an existing stack', () => {
    const first = planDepositItem(emptyLedger(), treasureItem('Ruby'), 2);
    const unique = treasureItem('Ruby', { tags: ['unique'] });
    const second = planDepositItem(first.ledger, unique, 1);
    expect(second.success).toBe(true);
    expect(second.ledger.items).toHaveLength(2);
    expect(second.ledger.items.find((e) => e.entryId === second.entryId).unique).toBe(true);
  });

  it('rejects a unique item deposit with quantity other than 1', () => {
    const unique = treasureItem('Crown Jewel', { tags: ['unique'] });
    const result = planDepositItem(emptyLedger(), unique, 2);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/unique/);
  });

  it('never mutates the input ledger', () => {
    const ledger = emptyLedger();
    const snapshot = structuredClone(ledger);
    planDepositItem(ledger, treasureItem('Ruby'), 1);
    expect(ledger).toEqual(snapshot);
  });
});

describe('planWithdrawItem', () => {
  const ALLOWED = { allowed: true };

  function ledgerWithRuby(quantity = 5) {
    return planDepositItem(emptyLedger(), treasureItem('Ruby'), quantity).ledger;
  }

  it('fails immediately on a rejected containerCheck, without touching the ledger', () => {
    const ledger = ledgerWithRuby();
    const entryId = ledger.items[0].entryId;
    const check = { allowed: false, reasonType: 'type', reason: 'Backpack does not accept Weapons.' };
    const result = planWithdrawItem(ledger, entryId, 1, check);
    expect(result.success).toBe(false);
    expect(result.reasonType).toBe('type');
    expect(result.reason).toBe(check.reason);
  });

  it('fails when the entry no longer exists', () => {
    const result = planWithdrawItem(emptyLedger(), 'missing-id', 1, ALLOWED);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/no longer exists/);
  });

  it('fails when quantity is out of range', () => {
    const ledger = ledgerWithRuby(3);
    const entryId = ledger.items[0].entryId;
    expect(planWithdrawItem(ledger, entryId, 0, ALLOWED).success).toBe(false);
    expect(planWithdrawItem(ledger, entryId, 4, ALLOWED).success).toBe(false);
  });

  it('removes the row entirely on a full-stack withdrawal — never left at quantity 0', () => {
    const ledger = ledgerWithRuby(3);
    const entryId = ledger.items[0].entryId;
    const result = planWithdrawItem(ledger, entryId, 3, ALLOWED, { actorType: 'player', actorId: 'u1' });
    expect(result.success).toBe(true);
    expect(result.ledger.items).toHaveLength(0);
    expect(result.itemDataToCreate.name).toBe('Ruby');
  });

  it('decrements a partial withdrawal without removing the row', () => {
    const ledger = ledgerWithRuby(5);
    const entryId = ledger.items[0].entryId;
    const result = planWithdrawItem(ledger, entryId, 2, ALLOWED);
    expect(result.success).toBe(true);
    expect(result.ledger.items).toHaveLength(1);
    expect(result.ledger.items[0].quantity).toBe(3);
  });

  it('never mutates the input ledger', () => {
    const ledger = ledgerWithRuby(5);
    const snapshot = structuredClone(ledger);
    planWithdrawItem(ledger, ledger.items[0].entryId, 2, ALLOWED);
    expect(ledger).toEqual(snapshot);
  });
});

describe('currency deposit/withdraw', () => {
  it('rejects an unknown denomination', () => {
    expect(planDepositCurrency(emptyLedger(), 'platinum', 5).success).toBe(false);
    expect(planWithdrawCurrency(emptyLedger(), 'platinum', 5, { allowed: true }).success).toBe(false);
  });

  it('deposits add to the ledger balance and log a currency entry', () => {
    const result = planDepositCurrency(emptyLedger(), 'gold', 50, { actorType: 'player', actorId: 'u1' });
    expect(result.success).toBe(true);
    expect(result.ledger.currency.gold).toBe(50);
    expect(result.logEntry).toMatchObject({ payloadType: 'currency', denomination: 'gold', quantity: 50, action: 'deposit' });
  });

  it('withdrawal fails on a rejected containerCheck without changing the balance', () => {
    const deposited = planDepositCurrency(emptyLedger(), 'gold', 50).ledger;
    const result = planWithdrawCurrency(deposited, 'gold', 10, { allowed: false, reasonType: 'capacity', reason: 'Not enough space in Coin Purse.' });
    expect(result.success).toBe(false);
    expect(result.reasonType).toBe('capacity');
  });

  it('withdrawal fails when the ledger balance is insufficient', () => {
    const deposited = planDepositCurrency(emptyLedger(), 'gold', 5).ledger;
    const result = planWithdrawCurrency(deposited, 'gold', 10, { allowed: true });
    expect(result.success).toBe(false);
  });

  it('withdrawal subtracts from the balance on success', () => {
    const deposited = planDepositCurrency(emptyLedger(), 'gold', 50).ledger;
    const result = planWithdrawCurrency(deposited, 'gold', 20, { allowed: true });
    expect(result.success).toBe(true);
    expect(result.ledger.currency.gold).toBe(30);
  });
});

describe('planSetCurrency', () => {
  it('increases the balance and tags the log entry as a dm_edit deposit', () => {
    const result = planSetCurrency(emptyLedger(), 'silver', 40, { actorId: 'gm1' });
    expect(result.success).toBe(true);
    expect(result.ledger.currency.silver).toBe(40);
    expect(result.logEntry).toMatchObject({ action: 'dm_edit', payloadType: 'currency' });
  });

  it('decreases the balance without a container check', () => {
    const deposited = planDepositCurrency(emptyLedger(), 'copper', 100).ledger;
    const result = planSetCurrency(deposited, 'copper', 10, { actorId: 'gm1' });
    expect(result.success).toBe(true);
    expect(result.ledger.currency.copper).toBe(10);
  });

  it('is a no-op that still succeeds when the value is unchanged', () => {
    const deposited = planDepositCurrency(emptyLedger(), 'gold', 25).ledger;
    const result = planSetCurrency(deposited, 'gold', 25, { actorId: 'gm1' });
    expect(result.success).toBe(true);
    expect(result.logEntry).toBeNull();
  });

  it('rejects a negative or fractional target value', () => {
    expect(planSetCurrency(emptyLedger(), 'gold', -1, {}).success).toBe(false);
    expect(planSetCurrency(emptyLedger(), 'gold', 1.5, {}).success).toBe(false);
  });
});
