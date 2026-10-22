import { describe, expect, it } from 'vitest';
import {
  actionSpeed,
  assignInitiativeTieKeys,
  calculateInitiative,
  racialInitiativeBonus,
} from './initiative.js';

const weapon = (id, speedFactor) => ({ id, type: 'weapon', system: { speedFactor } });

describe('BR-14 initiative arithmetic', () => {
  it('keeps a uniform d20 hundredths roll in bounds and preserves fractions at minimum', () => {
    expect(calculateInitiative({ rawRollHundredths: 2099 }).initiativeHundredths).toBe(2099);
    expect(calculateInitiative({ rawRollHundredths: 100, dexMod: -2 }).initiativeHundredths).toBe(100);
    expect(calculateInitiative({ rawRollHundredths: 127, dexMod: -4 }).initiative).toBe(1.27);
    expect(calculateInitiative({ rawRollHundredths: 199, dexMod: -2 }).initiativeHundredths).toBe(199);
    expect(calculateInitiative({ rawRollHundredths: 105, dexMod: 1, race: 'Halfling', speed: 2 }).initiativeHundredths).toBe(105);
  });

  it('applies only the approved Hobbit/Halfling racial bonus', () => {
    expect(racialInitiativeBonus('hobbit')).toBe(1);
    expect(racialInitiativeBonus('Halfling')).toBe(1);
    expect(racialInitiativeBonus('Elf')).toBe(0);
  });
});

describe('BR-14 declared action speed', () => {
  it('uses the larger speed for two weapons and exact spell level', () => {
    const items = [weapon('slow', 8), weapon('fast', 2)];
    expect(actionSpeed({ selectedWeaponIds: ['slow', 'fast'] }, items)).toBe(8);
    expect(actionSpeed({ kind: 'spell', selectedSpellId: 'spell' }, [...items, { id: 'spell', type: 'spell', system: { lvl: 3 } }])).toBe(3);
    expect(actionSpeed({ kind: 'unarmed' }, items)).toBe(0);
  });

  it('rejects stale selected item IDs', () => {
    expect(() => actionSpeed({ selectedWeaponIds: ['missing'] }, [])).toThrow(/missing item/i);
    expect(() => actionSpeed({ kind: 'spell', selectedSpellId: 'spell' }, [])).toThrow(/missing item/i);
    expect(() => actionSpeed({ selectedWeaponIds: ['a', 'b', 'c'] }, [weapon('a', 1), weapon('b', 2), weapon('c', 3)])).toThrow(/wrong number/i);
    expect(() => actionSpeed({ kind: 'spell', selectedSpellId: 'spell', spellLevel: 99 }, [{ id: 'spell', type: 'spell', system: { lvl: 2 } }])).not.toThrow();
  });
});

describe('BR-14 exact ties', () => {
  it('adds unique separate tie keys without changing initiative', () => {
    const result = assignInitiativeTieKeys([
      { id: 'a', initiativeHundredths: 1205 },
      { id: 'b', initiativeHundredths: 1205 },
      { id: 'c', initiativeHundredths: 1100 },
    ], () => 0.25);
    expect(result.map(({ initiativeHundredths }) => initiativeHundredths)).toEqual([1205, 1205, 1100]);
    expect(new Set(result.slice(0, 2).map(({ tieKey }) => tieKey)).size).toBe(2);
    expect(result[2].tieKey).toBeNull();
  });
});

describe('declaration integrity', () => {
  it('uses the selected spell level despite client-supplied speed fields and ignores unused weapon selections', () => {
    expect(actionSpeed({kind:'spell',spellId:'spell',weaponIds:['sword'],spellLevel:0},[{id:'spell',type:'spell',system:{lvl:4}},weapon('sword',8)])).toBe(4);
  });
  it.each([{kind:'weapon',weaponIds:[]},{kind:'twoWeapon',weaponIds:['one']},{kind:'twoWeapon',weaponIds:['one','one']},{kind:'unknown'},{kind:'weapon',weaponIds:['one','two']}])('rejects malformed declared selections', declaration => {
    expect(()=>actionSpeed(declaration,[weapon('one',2),weapon('two',8)])).toThrow();
  });
  it('allows initiative above 20 after positive modifiers and preserves the original roll on recalculation', () => {
    const rawRollHundredths=2099;
    expect(calculateInitiative({rawRollHundredths,dexMod:3,race:'Hobbit'}).initiative).toBe(24.99);
    expect(calculateInitiative({rawRollHundredths,dexMod:3,race:'Hobbit',speed:8}).initiative).toBe(16.99);
  });
});
