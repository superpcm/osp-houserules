import { describe, expect, it } from 'vitest';
import { isSpellbookItem, spellbookAssignments, spellbookName, spellbookVolumeForKey } from './spellbook-names.js';

describe('spellbook identity and names', () => {
  it('recognizes a newly named inventory book before any spells are recorded', () => {
    const item = { id: 'green', name: 'Green Grimoire', type: 'item', system: { quantity: 1 }, flags: { 'osp-houserules': { spellbook: true } } };
    expect(isSpellbookItem(item)).toBe(true);
    expect(spellbookName({ items: [item], bookNames: { 'green-1': 'Old name' } }, { books: {} }, 'green-1')).toBe('Green Grimoire');
    item.name = 'Blue Grimoire';
    expect(spellbookName({ items: [item] }, { books: {} }, 'green-1')).toBe('Blue Grimoire');
  });
  it('recognizes persisted renamed books without prefix collisions', () => {
    const books = { 'book-1-1': { spellIds: ['sleep'] } };
    expect(isSpellbookItem({ id: 'book-1', type: 'item', name: 'Fung Telt\'s Grimoire' }, books)).toBe(true);
    expect(isSpellbookItem({ id: 'book', type: 'item', name: 'Pack' }, books)).toBe(false);
    expect(isSpellbookItem({ id: 'book-10', type: 'item', name: 'Pack' }, books)).toBe(false);
    expect(spellbookVolumeForKey('book-1-1', 'book-1')).toBe(1);
  });

  it('prefers a saved name and falls back to the current inventory name', () => {
    const context = { items: [{ id: 'book-a', name: 'Renamed Spellbook' }] };
    expect(spellbookName({ ...context, bookNames: { 'book-a-1': 'Fung Telt\'s Grimoire' } }, { books: { 'book-a-1': { name: 'Legacy Name' } } }, 'book-a-1')).toBe("Fung Telt's Grimoire");
    expect(spellbookName({ ...context, bookNames: { 'book-a-1': '' } }, { books: { 'book-a-1': { name: 'Legacy Name' } } }, 'book-a-1')).toBe('Renamed Spellbook — volume 1');
    expect(spellbookName(context, { books: {} }, 'book-a-1')).toBe('Renamed Spellbook — volume 1');
  });

  it('returns all current and historical books that record a spell', () => {
    const context = {
      items: [{ id: 'book-a', name: 'Field Book' }],
      bookIds: ['book-a-1'],
      bookNames: { 'book-a-1': 'Field Book' }
    };
    const state = { books: {
      'book-a-1': { available: true, spellIds: ['sleep'] },
      'book-b-1': { available: false, spellIds: ['sleep'], name: 'Lost Book' },
      'book-c-1': { available: true, spellIds: ['light'] }
    } };
    expect(spellbookAssignments(context, state, 'sleep')).toEqual([
      { key: 'book-a-1', name: 'Field Book', available: true, current: true },
      { key: 'book-b-1', name: 'Lost Book', available: false, current: false }
    ]);
  });

  it('returns no assignment for an unknown or unrecorded spell', () => {
    const context = { items: [], bookIds: [] };
    const state = { books: { 'book-a-1': { available: true, spellIds: ['sleep'] } } };
    expect(spellbookAssignments(context, state, 'light')).toEqual([]);
    expect(spellbookAssignments(context, state, '')).toEqual([]);
  });
});
