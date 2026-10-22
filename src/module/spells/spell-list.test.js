import { describe, expect, it } from 'vitest';
import { filterSpellList, preparationStepCommand } from './spell-list.js';

const spells = [
  { id: 'light', name: 'Light', level: 1 },
  { id: 'sleep', name: 'Sleep', level: 1 },
  { id: 'fireball', name: 'Fireball', level: 3 }
];

describe('spell list filtering', () => {
  it('shows only known spells in the arcane spellbook view', () => {
    expect(filterSpellList(spells, { known: { light: true, fireball: true } }).map(spell => spell.id)).toEqual(['light', 'fireball']);
  });

  it('shows unknown spells in the arcane library view', () => {
    expect(filterSpellList(spells, { view: 'library', known: { light: true } }).map(spell => spell.id)).toEqual(['sleep', 'fireball']);
  });

  it('shows no library spells when every spell is already known', () => {
    expect(filterSpellList(spells, { view: 'library', known: { light: true, sleep: true, fireball: true } })).toEqual([]);
  });

  it('does not mutate known spell state while filtering', () => {
    const known = { light: true };
    filterSpellList(spells, { view: 'library', known });
    expect(known).toEqual({ light: true });
  });

  it('keeps all divine spells while applying search and level filters', () => {
    expect(filterSpellList(spells, { mode: 'divine', search: 'fire', level: 3 }).map(spell => spell.id)).toEqual(['fireball']);
  });
});

describe('preparation step commands', () => {
  it('calculates a normal increment', () => {
    expect(preparationStepCommand({ spellId: 'light', currentCount: 1, delta: 1 })).toEqual({ action: 'prepare', spellId: 'light', reverse: false, count: 2 });
  });

  it('calculates a reversed decrement and clamps at zero', () => {
    expect(preparationStepCommand({ spellId: 'light', reverse: true, currentCount: 0, delta: -1 })).toEqual({ action: 'prepare', spellId: 'light', reverse: true, count: 0 });
  });
});
