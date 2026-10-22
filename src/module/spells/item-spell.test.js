import { describe, expect, it } from 'vitest';
import { readItemSpell, itemSpellResource, assertItemSpellEligibility } from './item-spell.js';

describe('explicit item spell contract', () => {
  const scroll = () => ({ id: 'scroll', name: 'Any renamed item', type: 'item', system: { spellKey: 'remove_fear', spellClass: 'cleric', spellReversed: true, quantity: 1, tags: ['scroll'] } });
  it('resolves a fixed reversed link independently of the name and consumes quantity', () => {
    const item = scroll();
    expect(readItemSpell(item)).toMatchObject({ spellId: 'remove_fear', listKey: 'cleric', reverse: true, kind: 'scroll' });
    expect(itemSpellResource(item)).toMatchObject({ path: 'system.quantity', before: 1, after: 0 });
    expect(readItemSpell({ name: 'Scroll of Cause Fear', system: {} })).toBeNull();
  });
  it('handles legacy quantity objects and rejects invalid charges', () => {
    const item = scroll(); item.system.quantity = { value: 2 };
    expect(itemSpellResource(item).path).toBe('system.quantity.value');
    item.system.quantity = 1; item.system.spellSourceKind = 'wand'; item.system.charges = 0;
    expect(() => itemSpellResource(item)).toThrow('No charges');
    item.system.charges = 1.5;
    expect(() => itemSpellResource(item)).toThrow('No charges');
  });
  it('enforces default class lists and explicit item permissions', () => {
    const config = readItemSpell(scroll());
    expect(() => assertItemSpellEligibility({ profile: { id: 'cleric', spellcasting: { spellList: 'cleric' } } }, config)).not.toThrow();
    expect(() => assertItemSpellEligibility({ profile: { id: 'illusionist', spellcasting: { spellList: 'illusionist' } } }, config)).toThrow('not usable');
    expect(() => assertItemSpellEligibility({ profile: { id: 'fighter' } }, { ...config, allowedClasses: ['fighter'] })).not.toThrow();
  });
});
