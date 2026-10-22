import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLASS_PROGRESSION, getClassProgression, getMaximumLevel, getProgressionLevel,
  getNextProgressionXP, getProgressionXPModifier, getRaceClassPolicy,
  getLevelHitPointGain, isClassAvailableForRace
} from './progression.js';
import { getAttackBonus, getXPTable, getHitDieMax, calculateMaxHP,
  HIT_DICE_MAX, XP_TABLES, CLASS_XP_MAPPING, PRIME_REQUISITES } from './classes.js';
const read = name => JSON.parse(readFileSync(`data/${name}`, 'utf8'));
const tome = read('advanced_fantasy_players_tome_v1_3.json');
const house = read('ose_house_rules_v1_5.json');
const races = read('race_profiles.json').raceProfiles;
const parsed = profile => {
  const text = profile.rules_text.slice(profile.rules_text.indexOf(`${profile.name} Level Progression`));
  return [...text.matchAll(/(\d+)\s+([\d,]+)\s+(\d+d\d+(?:\+\d+\*?)?)\s+(\d+)\s*\[\s*([+−–-]?\d+)\s*\]/g)]
    .map(row => [Number(row[1]), Number(row[2].replaceAll(',', '')), row[3], Number(row[5])]);
};
const fixtures = [
  ...tome.class_profiles.map(profile => ({ name: profile.name === 'Halfling' ? 'Hobbit' : profile.name, profile, rows: parsed(profile) }))
    .filter(entry => getClassProgression(entry.name)),
  ...Object.entries(house.custom_classes).map(([name, profile]) => ({ name, profile, rows: profile.progression.map(row => [row[0], row[1], row[2], Number(row[3].match(/\[([+\d]+)\]/)[1])]) }))
];

describe('BR-11 exact source progression', () => {
  it('covers all supported classes with independently extracted source rows', () => {
    expect(fixtures).toHaveLength(Object.keys(CLASS_PROGRESSION).length);
  });
  for (const { name, rows, profile } of fixtures) {
    it(`${name}: every XP boundary, HD row, attack, fixed gain and class maximum`, () => {
      const runtime = getClassProgression(name);
      expect(rows).toHaveLength(Number(profile.maximum_level ?? runtime.maximumLevel));
      expect(runtime.maximumLevel).toBe(rows.length);
      const primes = profile.prime_requisites || String(profile.prime_requisite || '').match(/STR|INT|WIS|DEX|CON|CHA/g);
      expect([...runtime.primeRequisites].sort()).toEqual([...primes].sort());
      expect(runtime.xp).toEqual(rows.map(row => row[1]));
      expect(runtime.hitPoints).toEqual(rows.map(row => row[2]));
      expect(getHitDieMax(name)).toBe(Number(rows[0][2].match(/d(\d+)/)[1]));
      for (const [level, xp, hd, attack] of rows) {
        const race = ['Dwarf','Elf','Gnome','Hobbit','Half-Elf','Half-Orc'].includes(name) ? name : 'Human';
        expect(getProgressionLevel(name, xp, race)).toBe(level);
        expect(getProgressionLevel(name, xp + 1, race)).toBe(level);
        if (level > 1) expect(getProgressionLevel(name, xp - 1, race)).toBe(level - 1);
        expect(getAttackBonus(name, level, race)).toBe(attack);
        const fixed = value => Number(value.match(/\+(\d+)/)?.[1] || 0);
        expect(getLevelHitPointGain(name, level)).toBe(hd.includes('*') ? fixed(hd) - fixed(rows[level - 2][2]) : null);
      }
      expect(getProgressionLevel(name, 1e12)).toBe(rows.length);
      expect(getAttackBonus(name, 999)).toBe(rows.at(-1)[3]);
      expect(getLevelHitPointGain(name, rows.length + 1)).toBeNull();
    });
  }
  for (const race of races.filter(race => race.name !== 'Human')) {
    for (const entry of race.availableClasses.filter(entry => getClassProgression(entry.class))) {
      it(`${race.name}/${entry.class}: racial cap and referee restriction`, () => {
        const cap = Number(entry.maxLevel);
        const profile = getClassProgression(entry.class);
        expect(getMaximumLevel(entry.class, race.name)).toBe(cap);
        expect(getProgressionLevel(entry.class, profile.xp[cap - 1], race.name)).toBe(cap);
        expect(getProgressionLevel(entry.class, 1e12, race.name)).toBe(cap);
        expect(getNextProgressionXP(entry.class, cap, race.name)).toBe(profile.xp[cap - 1]);
        expect(getRaceClassPolicy(entry.class, race.name)).toMatchObject({ allowed: true, maximumLevel: cap,
          playerAllowed: !entry.npcOnlyAtRefereeOption, npcOnlyAtRefereeOption: entry.npcOnlyAtRefereeOption });
        expect(getAttackBonus(entry.class, 999, race.name)).toBe(profile.attack[cap - 1]);
      });
    }
  }
  it('applies each approved optional-class race exception and rejects other races', () => {
    const caps = { Mage: { Human: 14 }, 'Beast Master': { Human: 14, 'Half-Elf': 8 }, Warden: { Human: 14, 'Half-Elf': 11, Elf: 11, Hobbit: 6 } };
    for (const [name, allowed] of Object.entries(caps)) for (const race of races) {
      expect(isClassAvailableForRace(name, race.name)).toBe(race.name in allowed);
      expect(getMaximumLevel(name, race.name)).toBe(allowed[race.name] || 1);
      expect(getProgressionLevel(name, 1e12, race.name)).toBe(allowed[race.name] || 1);
    }
  });
  it('rejects banned/unknown classes and Drow; handles supported aliases', () => {
    for (const name of ['Acrobat','Drow','unknown']) expect(isClassAvailableForRace(name, 'Human')).toBe(false);
    expect(isClassAvailableForRace('Fighter', 'Drow')).toBe(false);
    expect(getAttackBonus(' beast_master ', 4)).toBe(0);
    expect(getAttackBonus('Beast Master', 13)).toBe(7);
    expect(getClassProgression('Halfling')).toBe(getClassProgression('Hobbit'));
    expect(getAttackBonus('Magic_User', 6.9)).toBe(2);
  });
  it('keeps public compatibility tables consistent with canonical classes', () => {
    for (const profile of Object.values(CLASS_PROGRESSION)) for (const key of [profile.id, profile.name.toLowerCase()]) {
      expect(HIT_DICE_MAX[key]).toBe(getHitDieMax(key));
      expect(XP_TABLES[CLASS_XP_MAPPING[key]]).toEqual(getXPTable(key));
      expect(PRIME_REQUISITES[key]).toEqual(profile.primeRequisites.map(value => value.toLowerCase()));
    }
  });
  it('limits display-only HP estimates to the applicable table and CON-bearing dice', () => {
    expect(calculateMaxHP('Mage', 10, 18)).toBe(82);
    expect(calculateMaxHP('Dwarf', 999, 18)).toBe(108);
    expect(calculateMaxHP('Warden', 999, 18, 'Hobbit')).toBe(66);
    expect(calculateMaxHP('Magic-User', 14, 3)).toBe(14);
    expect(calculateMaxHP('unknown', 20, 18)).toBe(0);
  });
});

describe('BR-11 class-specific prime-requisite XP rules', () => {
  it('applies every single-prime threshold', () => {
    for (const profile of Object.values(CLASS_PROGRESSION).filter(profile => profile.primeRequisites.length === 1)) {
      const key = profile.primeRequisites[0].toLowerCase();
      for (const [score, expected] of [[3,-20],[5,-20],[6,-10],[8,-10],[9,0],[12,0],[13,5],[15,5],[16,10],[18,10]])
        expect(getProgressionXPModifier(profile.name, { [key]: { value: score } })).toBe(expected);
    }
  });
  const expectations = {
    Barbarian: (a,b) => a >= 16 && b >= 16 ? 10 : a >= 13 || b >= 13 ? 5 : 0,
    Paladin: (a,b) => a >= 16 && b >= 16 ? 10 : a >= 13 || b >= 13 ? 5 : 0,
    'Beast Master': (a,b) => a >= 16 && b >= 16 ? 10 : a >= 13 || b >= 13 ? 5 : 0,
    Elf: (a,b) => a >= 16 && b >= 13 ? 10 : a >= 13 && b >= 13 ? 5 : 0,
    Gnome: (a,b) => a >= 13 && b >= 16 ? 10 : a >= 13 && b >= 13 ? 5 : 0,
    'Half-Elf': (a,b) => (a >= 16 && b >= 13) || (b >= 16 && a >= 13) ? 10 : a >= 13 && b >= 13 ? 5 : 0,
    Hobbit: (a,b) => a >= 13 && b >= 13 ? 10 : a >= 13 || b >= 13 ? 5 : 0,
    'Half-Orc': (a,b) => a >= 16 && b >= 16 ? 10 : a >= 13 && b >= 13 ? 5 : 0,
    Mage: (a,b) => a >= 16 && b >= 13 ? 10 : a >= 13 && b >= 13 ? 5 : 0
  };
  for (const [name, expected] of Object.entries(expectations)) it(`${name}: asymmetric and threshold combinations`, () => {
    const [first, second] = getClassProgression(name).primeRequisites.map(value => value.toLowerCase());
    for (const a of [5,8,12,13,15,16,18]) for (const b of [5,8,12,13,15,16,18])
      expect(getProgressionXPModifier(name, { [first]: { value: a }, [second]: { value: b } })).toBe(expected(a,b));
  });
});
