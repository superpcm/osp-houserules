import { describe, expect, it } from 'vitest';
import { presentLedgerItem } from './bank-ledger-display.js';

describe('presentLedgerItem', () => {
  it('formats a single item value in silver pieces', () => {
    const entry = { name: 'Diamond', quantity: 1, itemData: { system: { cost: 1000 } } };
    expect(presentLedgerItem(entry)).toMatchObject({
      valueLabel: '1,000 sp',
      valueTitle: 'Value: 1,000 sp',
    });
  });

  it('keeps per-item value visible and gives the stack total in the tooltip', () => {
    const entry = { name: 'Ruby', quantity: 3, itemData: { system: { cost: 125.5 } } };
    expect(presentLedgerItem(entry)).toMatchObject({
      valueLabel: '125.5 sp',
      valueTitle: '125.5 sp each · 376.5 sp total',
    });
  });

  it('falls back safely for a legacy entry with no stored value', () => {
    expect(presentLedgerItem({ name: 'Old Jewel', quantity: 1 })).toMatchObject({
      valueLabel: '0 sp',
      valueTitle: 'Value: 0 sp',
    });
  });
});
