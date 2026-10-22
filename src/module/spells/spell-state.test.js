import { describe, expect, it } from 'vitest';
import { bookPages, readSpellState, spellStateUpdate, transitionSpellState } from './spell-state.js';

const spells = {
  sleep: { id: 'sleep', level: 1 },
  light: { id: 'light', level: 1, reversed: { name: 'Darkness' } },
  fireball: { id: 'fireball', level: 3 },
};
const context = (overrides = {}) => ({
  level: 3,
  slots: { 1: 2, 2: 1, 3: 1 },
  spells,
  mode: 'arcane',
  bookIds: ['book-a'],
  itemIds: ['staff-a', 'backpack-a'],
  int: 18,
  wis: 10,
  gm: false,
  ...overrides,
});

describe('spell state transitions', () => {
  it('migrates and preserves legacy known, prepared, used, and unknown IDs', () => {
    const actor = {
      flags: { 'osp-houserules': { knownSpells: { sleep: true, lost_spell: true }, memorizedSpells: { sleep: 1, lost_spell: 2 } } },
      system: { spellSlots: { 1: { used: 1 } } },
    };
    const state = readSpellState(actor);
    expect(state.known).toEqual({ sleep: true, lost_spell: true });
    expect(state.prepared).toEqual({ 'sleep::normal': 1, 'lost_spell::normal': 2 });
    expect(state.used).toEqual({ 1: 1 });
    expect(spellStateUpdate(state)).toMatchObject({
      'flags.osp-houserules.knownSpells': state.known,
      'flags.osp-houserules.memorizedSpells': { sleep: 1, lost_spell: 2 },
      'system.spellSlots.1.used': 1,
    });
  });

  it('casts atomically in the pure transition and leaves the input unchanged', () => {
    const original = { version: 1, known: { sleep: true }, prepared: { 'sleep::normal': 1 }, used: { 1: 0 }, books: {}, focus: {}, restReady: true, operations: {} };
    const next = transitionSpellState(original, { action: 'cast', spellId: 'sleep' }, context());
    expect(next.prepared).toEqual({ 'sleep::normal': 0 });
    expect(next.used).toEqual({ 1: 1 });
    expect(next.restReady).toBe(false);
    expect(original).toEqual({ version: 1, known: { sleep: true }, prepared: { 'sleep::normal': 1 }, used: { 1: 0 }, books: {}, focus: {}, restReady: true, operations: {} });
  });

  it('allows an already prepared spell to be cast after its book becomes unavailable', () => {
    const original = { version: 1, known: { sleep: true }, prepared: { 'sleep::normal': 1 }, used: { 1: 0 }, books: { 'book-a': { available: false, spellIds: ['sleep'] } }, focus: {}, restReady: true, operations: {} };
    expect(transitionSpellState(original, { action: 'cast', spellId: 'sleep' }, context())).toMatchObject({ used: { 1: 1 } });
  });

  it('requires an available spellbook for arcane preparation and supports duplicate reverse forms', () => {
    let state = { version: 1, known: { light: true }, prepared: {}, used: { 1: 0 }, books: { 'book-a': { available: true, spellIds: ['light'] } }, focus: {}, restReady: true, operations: {} };
    state = transitionSpellState(state, { action: 'prepare', spellId: 'light', reverse: false, count: 1 }, context());
    state = transitionSpellState(state, { action: 'prepare', spellId: 'light', reverse: true, count: 1 }, context());
    expect(state.prepared).toEqual({ 'light::normal': 1, 'light::reverse': 1 });
    expect(() => transitionSpellState({ ...state, books: {} }, { action: 'prepare', spellId: 'light', count: 1 }, context({ bookIds: [] }))).toThrow();
  });

  it('uses inventory presence instead of a legacy manual availability flag', () => {
    const state = { version: 1, known: { light: true }, prepared: {}, used: { 1: 0 }, books: { 'book-a': { available: false, spellIds: ['light'] } }, focus: {}, restReady: true, operations: {} };
    const command = { action: 'prepare', spellId: 'light', count: 1 };
    expect(transitionSpellState(state, command, context()).prepared['light::normal']).toBe(1);
    expect(() => transitionSpellState(state, command, context({ bookIds: [] }))).toThrow('available spellbook');
  });

  it('keeps automatic Read Magic known but requires a linked page before preparation', () => {
    const readMagic = { id: 'read_magic', level: 1 };
    const readContext = context({ spells: { ...spells, read_magic: readMagic } });
    let state = { version: 1, known: { read_magic: true }, prepared: {}, used: { 1: 0 }, books: { 'book-a': { available: true, spellIds: [] } }, focus: {}, restReady: true, operations: {} };
    expect(() => transitionSpellState(state, { action: 'prepare', spellId: 'read_magic', count: 1 }, readContext)).toThrow();
    state = transitionSpellState(state, { action: 'link', spellId: 'read_magic', bookId: 'book-a' }, readContext);
    expect(state.books['book-a'].spellIds).toEqual(['read_magic']);
    expect(transitionSpellState(state, { action: 'prepare', spellId: 'read_magic', count: 1 }, readContext).prepared['read_magic::normal']).toBe(1);
  });

  it('lets divine casters choose the reversed form at casting time', () => {
    const original = { version: 1, known: { light: true }, prepared: { 'light::normal': 1 }, used: { 1: 0 }, books: {}, focus: {}, restReady: true, operations: {} };
    const next = transitionSpellState(original, { action: 'cast', spellId: 'light', reverse: true }, context({ mode: 'divine' }));
    expect(next.prepared['light::normal']).toBe(0);
  });

  it('locks a failed copying attempt for the current level, then permits the next level', () => {
    const initial = { version: 1, known: {}, prepared: {}, used: {}, books: { 'book-a': { available: true, spellIds: [] } }, focus: {}, restReady: false, copyFailures: {}, operations: {} };
    const failed = transitionSpellState(initial, { action: 'copy', spellId: 'fireball', bookId: 'book-a', sourceConfirmed: true, percentile: 100 }, context());
    expect(failed.copyFailures).toEqual({ fireball: 3 });
    expect(() => transitionSpellState(failed, { action: 'copy', spellId: 'fireball', bookId: 'book-a', sourceConfirmed: true, percentile: 1 }, context())).toThrow();
    const retried = transitionSpellState(failed, { action: 'copy', spellId: 'fireball', bookId: 'book-a', sourceConfirmed: true, percentile: 1 }, context({ level: 4 }));
    expect(retried.known.fireball).toBe(true);
  });

  it('enforces the 100-page limit using spell level pages', () => {
    const fullBook = { available: true, spellIds: Array.from({ length: 33 }, (_, index) => `x${index}`) };
    const manySpells = Object.fromEntries(fullBook.spellIds.map((id) => [id, { id, level: 3 }]));
    expect(() => transitionSpellState({ version: 1, known: {}, prepared: {}, used: {}, books: { 'book-a': fullBook }, focus: {}, restReady: false, copyFailures: {}, operations: {} }, { action: 'grant', spellId: 'fireball', bookId: 'book-a' }, context({ spells: { ...spells, ...manySpells }, gm: true }))).toThrow();
  });

  it('requires actual inventory items for focus and book controls and mirrors one update object', () => {
    let state = { version: 1, known: {}, prepared: {}, used: {}, books: {}, focus: {}, restReady: false, operations: {} };
    state = transitionSpellState(state, { action: 'focus', itemId: 'staff-a', focusClass: 'magicuser' }, context({ focusPolicy: { classKey: 'magicuser', choices: ['wand', 'staff'] }, focusIds: ['staff-a'], items: [{ id: 'staff-a', type: 'weapon', name: 'Staff' }] }));
    state = transitionSpellState(state, { action: 'book', bookId: 'book-a', available: true }, context());
    expect(state.focus).toEqual({ kind: 'staff', itemId: 'staff-a', available: true, classKey: 'magicuser' });
    expect(state.books['book-a']).toMatchObject({ available: true });
    expect(Object.keys(spellStateUpdate(state)).filter((key) => key.startsWith('flags.osp-houserules.') || key.startsWith('system.spellSlots.'))).toContain('flags.osp-houserules.spellcastingState');
    expect(() => transitionSpellState(state, { action: 'focus', itemId: 'missing', available: true }, context())).toThrow();
  });

  it('stores an explicit physical focus kind while keeping book preparation requirements', () => {
    const focusContext = context({ focusPolicy: { classKey: 'magicuser', choices: ['spellbook', 'wand', 'staff'] }, focusIds: ['wand-a'], itemIds: ['wand-a'], items: [{ id: 'wand-a', type: 'item', name: 'Wand' }] });
    let state = { version: 1, known: { sleep: true }, prepared: {}, used: { 1: 0 }, books: { 'book-a': { available: true, spellIds: ['sleep'] } }, focus: {}, restReady: true, operations: {} };
    state = transitionSpellState(state, { action: 'focus', focusKind: 'wand', itemId: 'wand-a', available: true, focusClass: 'magicuser' }, focusContext);
    expect(state.focus).toEqual({ kind: 'wand', itemId: 'wand-a', available: true, classKey: 'magicuser' });
    expect(() => transitionSpellState(state, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'magicuser' }, focusContext)).toThrow();
    expect(() => transitionSpellState({ ...state, books: {} }, { action: 'prepare', spellId: 'sleep', count: 1 }, context({ bookIds: [] }))).toThrow();
  });

});


describe('inventory spellbook page counts', () => {
  it('treats a newly owned book without saved spell state as empty', () => {
    expect(bookPages(undefined, context())).toBe(0);
    expect(bookPages({}, context())).toBe(0);
  });
  it('still counts pages in an existing book', () => {
    expect(bookPages({ spellIds: ['sleep', 'fireball'] }, context())).toBe(4);
  });
});


describe('first spell in an owned inventory book', () => {
  const fresh = () => ({ known: { sleep: true }, books: {}, copyFailures: {}, operations: {} });
  it.each(['grant', 'link', 'copy'])('initializes an owned book during %s', action => {
    const original = fresh();
    const next = transitionSpellState(original, { action, spellId: 'sleep', bookId: 'book-a', sourceConfirmed: true, percentile: 1 }, context({ gm: true }));
    expect(next.books['book-a'].spellIds).toEqual(['sleep']);
    expect(original.books).toEqual({});
  });
  it.each(['grant', 'link', 'copy'])('rejects an absent book during %s', action => {
    expect(() => transitionSpellState(fresh(), { action, spellId: 'sleep', bookId: 'missing', sourceConfirmed: true, percentile: 1 }, context({ gm: true }))).toThrow('The spellbook is unavailable.');
  });
});
