import { describe, expect, it } from 'vitest';
import { focusKindForItem, isEligibleFocusItem, spellFocusPolicy } from './spell-rules.js';

describe('inventory focus eligibility', () => {
  it.each([
    ['Magic-User', ['Wand', 'Staff']], ['Illusionist', ['Wand', 'Staff']],
    ['Mage', ['Wand', 'Staff']], ['Cleric', ['Holy Symbol']], ['Paladin', ['Holy Symbol']],
    ['Druid', ['Mistletoe']], ['Bard', ['Instrument']], ['Ranger', ['Animal Totem']],
  ])('limits %s to its allowed focus items', (className, allowed) => {
    const names = ['Wand', 'Staff', 'Holy Symbol', 'Mistletoe', 'Instrument', 'Animal Totem', 'Oil Flask', 'Dagger', 'Staff Sling', 'Spellbook'];
    const policy = spellFocusPolicy(className);
    expect(names.filter(name => isEligibleFocusItem({ name, type: 'item' }, policy))).toEqual(allowed);
  });

  it('recognizes renamed items through specific tags and explicit metadata', () => {
    expect(focusKindForItem({ name: 'Ash branch', type: 'weapon', system: { tags: ['staff'] } })).toBe('staff');
    expect(focusKindForItem({ name: 'My flute', type: 'item', system: { tags: ['instrument'] } })).toBe('instrument');
    expect(focusKindForItem({ name: 'Silver oak', type: 'item', flags: { 'osp-houserules': { focusKind: 'holy-symbol' } } })).toBe('holy-symbol');
    expect(focusKindForItem({ name: 'Carved wolf', type: 'item', system: { focus_kind: 'animal-totem' } })).toBe('ranger-token');
    expect(focusKindForItem({ name: 'Ordinary object', type: 'item', system: { tags: ['focus'] } })).toBeUndefined();
    expect(focusKindForItem({ name: 'Wand', type: 'spell' })).toBeUndefined();
  });
});
