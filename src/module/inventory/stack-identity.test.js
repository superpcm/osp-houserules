import { describe, expect, it } from 'vitest';
import { canStackItems, isUniqueStackItem, stackIdentity } from './stack-identity.js';

const base = (overrides = {}) => ({
  _id: 'a', id: 'a', uuid: 'Item.a', _stats: { modifiedTime: 1 }, sort: 2,
  name: 'Potion', type: 'item', img: 'potion.webp',
  system: { quantity: 2, containerId: 'bag', equipped: false, lashed: false, cost: 10, tags: ['magic'], effects: [{ key: 'heal', value: 2 }], ...overrides },
});

describe('canonical stack identity', () => {
  it('keeps named spellbooks separate even when their names match', () => {
    const book = { ...base(), name: 'Grimoire', flags: { 'osp-houserules': { spellbook: true } } };
    expect(canStackItems(book, { ...book, _id: 'b' })).toBe(false);
  });
  it('merges equivalent snapshots despite ids, stats, quantity, placement, and key order', () => {
    const first = base();
    const second = { type: 'item', name: 'Potion', img: 'potion.webp', system: { effects: [{ value: 2, key: 'heal' }], tags: ['magic'], cost: 10, lashed: true, equipped: true, containerId: 'other', quantity: 99 } };
    expect(canStackItems(first, second)).toBe(true);
    expect(stackIdentity(first)).toEqual(stackIdentity(second));
  });

  it.each([
    ['cost', { cost: 11 }], ['magic bonus', { magicBonus: 1 }], ['custom flag', { customFlag: 'x' }],
    ['effects', { effects: [{ key: 'heal', value: 3 }] }], ['unknown system data', { mystery: true }],
  ])('does not merge a %s difference', (_label, difference) => {
    expect(canStackItems(base(), base(difference))).toBe(false);
  });

  it('never merges either unique side, including legacy system.unique', () => {
    expect(isUniqueStackItem(base({ tags: ['unique'] }))).toBe(true);
    expect(canStackItems(base(), base({ tags: ['unique'] }))).toBe(false);
    expect(canStackItems(base(), base({ unique: true }))).toBe(false);
  });

  it('rejects malformed or missing snapshots and preserves unknown array order', () => {
    expect(canStackItems(null, base())).toBe(false);
    expect(canStackItems(base({ tags: ['a', 'b'] }), base({ tags: ['b', 'a'] }))).toBe(false);
  });
});


it('preserves full flags, descriptions, images, and top-level effect differences', () => {
  const original = { ...base(), flags: { module: { custom: 'first' } }, effects: [{ name: 'Blessed', changes: [{ key: 'attack', value: 1 }] }] };
  for (const change of [{ img: 'different.webp' }, { flags: { module: { custom: 'second' } } }, { effects: [{ name: 'Blessed', changes: [{ key: 'attack', value: 2 }] }] }, { system: { ...original.system, description: 'Other history' } }]) expect(canStackItems(original, { ...original, ...change })).toBe(false);
});
it('ignores only proven treasure-derived totals and retains similarly named custom fields elsewhere', () => {
  const first = base({ treasure: true, cumulativeCost: 20, cumulativeWeight: 2 });
  expect(canStackItems(first, base({ treasure: true, cumulativeCost: 990, cumulativeWeight: 99, quantity: 99 }))).toBe(true);
  expect(canStackItems(base({ cumulativeCost: 20 }), base({ cumulativeCost: 99 }))).toBe(false);
});
it('declines malformed identity fields safely', () => {
  for (const bad of [base({ tags: {} }), base({ cost: NaN }), base({ cost: Infinity }), { ...base(), system: [] }, { toObject: () => { throw new Error('stale'); } }]) expect(canStackItems(bad, base())).toBe(false);
});

it('keeps charged spell items separate so each retains its own charges', () => {
  const wand = { name: 'Wand of Light', type: 'item', system: { spellKey: 'light', spellClass: 'magic-user', spellSourceKind: 'wand', quantity: 1, charges: 3 } };
  expect(canStackItems(wand, structuredClone(wand))).toBe(false);
});
