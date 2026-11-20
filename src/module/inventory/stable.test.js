import { beforeEach, describe, expect, it } from 'vitest';
import { emptyStable, entryFromStableItem, getStableDocument, normalizeStable, quoteStable, quoteStableSale, stableItemKind, stableOpeningStatus } from './stable.js';

const item = (id, type, extra = {}) => ({ id, uuid: `Item.${id}`, name: id, type, system: { cost: 10, quantity: 1, ...extra } });
const actor = (items, flags = { party: true }) => ({ id: 'actor-1', uuid: 'Actor.actor-1', type: 'character', name: 'Rider', items, getFlag: (_scope, key) => key === 'party' ? flags.party : undefined, testUserPermission: () => true });

beforeEach(() => { globalThis.game = { time: { worldTime: 0 }, journal: { contents: [] }, user: { isGM: true } }; });

describe('stable model and classification', () => {
  it('classifies vehicles before tack and recognizes animals', () => {
    expect(stableItemKind(item('wagon', 'vehicle'))).toBe('vehicle');
    expect(stableItemKind(item('saddle', 'item', { tags: ['tack'] }))).toBe('tack');
    expect(stableItemKind(item('mule', 'livestock'))).toBe('animal');
  });

  it('marks named animals unique and preserves a sold-out stock value of zero', () => {
    const entry = entryFromStableItem(item('Bramble', 'livestock', { unique: true }));
    const stable = normalizeStable({ entries: [{ ...entry, stock: 0 }] });
    expect(stable.entries[0].individual).toBe(true);
    expect(stable.entries[0].itemData.system.unique).toBe(true);
    expect(stable.entries[0].stock).toBe(0);
  });

  it('rejects invalid stock instead of silently converting it to unlimited', () => {
    expect(normalizeStable({ entries: [{ id: 'bad', itemData: item('mule', 'livestock'), stock: -1 }] }).entries).toHaveLength(0);
    expect(normalizeStable({ entries: [{ id: 'bad', itemData: item('mule', 'livestock'), stock: Infinity }] }).entries).toHaveLength(0);
  });
});

describe('stable quotes', () => {
  it('rejects duplicate boarding lines and requires individual animals', () => {
    const mule = item('mule', 'livestock'); const rider = actor([mule]); const stable = { ...emptyStable(), boarding: { enabled: true, capacity: 1, priceCp: 10 } };
    expect(quoteStable(stable, [{ kind: 'boarding', animalIds: ['mule'], nights: 1 }, { kind: 'boarding', animalIds: ['mule'], nights: 1 }], { actor: rider })).toMatchObject({ success: false });
    expect(quoteStable(stable, [{ kind: 'boarding', animalIds: ['mule'], nights: 1 }], { actor: rider })).toMatchObject({ success: true });
  });

  it('keeps boarding capacity available after an expired stay', () => {
    const stable = { ...emptyStable(), boarding: { enabled: true, capacity: 1, priceCp: 10 }, bookings: [{ id: 'old', actorId: 'a', animalIds: ['m'], quantity: 1, endsAt: 10 }] };
    expect(stableOpeningStatus(stable, 10).open).toBe(true);
    expect(quoteStable(stable, [{ kind: 'boarding', animalIds: ['m'], nights: 1 }], { actor: actor([item('m', 'livestock')]), now: 10 })).toMatchObject({ success: true });
  });

  it('rejects duplicate sale lines and unsafe magic items', () => {
    const horse = item('horse', 'livestock'); const rider = actor([horse]); const stable = { ...emptyStable(), accessible: true, buysFromPlayers: true };
    expect(quoteStableSale(rider, stable, [{ itemId: 'horse', quantity: 1 }, { itemId: 'horse', quantity: 1 }])).toMatchObject({ success: false });
    horse.system.magic = true;
    expect(quoteStableSale(rider, stable, [{ itemId: 'horse', quantity: 1 }])).toMatchObject({ success: false });
  });
});

describe('document safety', () => {
  it('does not treat a store or inn journal as a stable', () => {
    const store = { id: 'same', flags: { 'osp-houserules': { store: { version: 1 } } } };
    globalThis.game.journal.contents = [store];
    expect(getStableDocument('same')).toBeNull();
  });
});
