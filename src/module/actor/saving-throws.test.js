import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getBaseSavingThrows, getConSaveBonus, getWisMagicModifier, getSavingThrowModifiers, getSavingThrowTarget } from './saving-throws.js';
vi.mock('./character-creation-dialog.js', () => ({ createCharacterFromPrompt: vi.fn() }));
let OspActor;
beforeAll(async () => {
  vi.stubGlobal('Actor', class {});
  ({ OspActor } = await import('./actor.js'));
});
const read = (file) => JSON.parse(readFileSync(new URL(`../../../data/${file}`, import.meta.url), 'utf8'));
const tome = read('advanced_fantasy_players_tome_v1_3.json');
const house = read('ose_house_rules_v1_5.json');
const keys = ['death', 'wands', 'paralysis', 'breath', 'spells'];
const object = (row) => Object.fromEntries(keys.map((key, i) => [key, row[i]]));

describe('BR-09 authoritative save progression', () => {
  for (const profile of tome.class_profiles) {
    it(`matches every printed ${profile.name} level`, () => {
      const text = profile.rules_text.slice(profile.rules_text.indexOf(`${profile.name} Level Progression`));
      const rows = [...text.matchAll(/\d+\s*\[\s*[+−–-]?\d+\s*\]\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/g)].map(match => match.slice(1).map(Number));
      expect(rows).toHaveLength(Number(profile.maximum_level));
      rows.forEach((row, index) => expect(getBaseSavingThrows(profile.name, index + 1)).toEqual(object(row)));
      expect(getBaseSavingThrows(profile.name, 999)).toEqual(object(rows.at(-1)));
      expect(getBaseSavingThrows(profile.name, 0)).toEqual(object(rows[0]));
      expect(getBaseSavingThrows(profile.name, 2.9)).toEqual(object(rows[1]));
    });
  }
  for (const [name, profile] of Object.entries(house.custom_classes)) {
    it(`matches every approved ${name} replacement level`, () => {
      profile.progression.forEach(row => expect(getBaseSavingThrows(name, row[0])).toEqual(object(row.slice(4, 9))));
    });
  }
  it('handles Hobbit aliases, case, missing and invalid levels', () => {
    expect(getBaseSavingThrows(' Hobbit ', 8)).toEqual(getBaseSavingThrows('Halfling', 8));
    expect(getBaseSavingThrows('half_elf', 12)).toEqual(getBaseSavingThrows('Half-Elf', 12));
    expect(getBaseSavingThrows('unknown', Infinity)).toEqual(getBaseSavingThrows('Fighter', 1));
  });
});

const conCases = [[3,0],[6,0],[7,2],[10,2],[11,3],[14,3],[15,4],[17,4],[18,5]];
const wisCases = [[3,-3],[4,-2],[5,-2],[6,-1],[8,-1],[9,0],[12,0],[13,1],[15,1],[16,2],[17,2],[18,3]];
describe('BR-09 contextual modifiers', () => {
  it.each(conCases)('CON %i has resilience %i for every applicable race/category', (con, bonus) => {
    expect(getConSaveBonus(con)).toBe(bonus);
    for (const race of ['Dwarf', 'Hobbit', 'Halfling', 'Gnome']) {
      for (const saveType of keys) {
        const options = { className: 'Fighter', level: 1, race, con, wis: 10, saveType };
        const applicable = ['wands','spells'].includes(saveType);
        expect(getSavingThrowTarget(options)).toBe(getBaseSavingThrows('Fighter',1)[saveType] - (applicable ? bonus : 0));
      }
      expect(getSavingThrowTarget({ className:'Fighter',level:1,race,con,wis:10,saveType:'death',poison:true })).toBe(12 - (race === 'Gnome' ? 0 : bonus));
    }
  });
  it.each(wisCases)('WIS %i supplies magic modifier %i only in applicable context', (wis, bonus) => {
    expect(getWisMagicModifier(wis)).toBe(bonus);
    for (const saveType of keys) {
      const opts = { className:'Fighter', level:1, race:'Human', wis, saveType };
      const base = getBaseSavingThrows('Fighter',1)[saveType];
      expect(getSavingThrowTarget(opts)).toBe(base - (['wands','spells'].includes(saveType) ? bonus : 0));
      expect(getSavingThrowTarget({ ...opts, magical:true })).toBe(base - bonus);
    }
  });
  it('applies spell/device resistance across categories once, not to all magical effects', () => {
    const opts = { className:'Fighter',level:1,race:'Dwarf',con:18,wis:18,saveType:'paralysis' };
    expect(getSavingThrowTarget({ ...opts, magical:true })).toBe(11);
    for (const source of ['spell','wand','rod','staff']) expect(getSavingThrowTarget({ ...opts, source })).toBe(6);
    expect(getSavingThrowTarget({ ...opts,saveType:'spells',source:'spell' })).toBe(8);
  });
  it('does not stack racial resilience on demihuman class tables', () => {
    for (const className of ['Dwarf','Gnome','Hobbit']) {
      const opts = { className, level:1, race:className, con:18, wis:10, saveType:'spells' };
      expect(getSavingThrowTarget(opts)).toBe(getBaseSavingThrows(className,1).spells);
    }
  });
  it('uses magic item and situational bonuses/penalties once and clamps to approved minimum2', () => {
    const opts = { className:'Fighter',level:1,race:'Human',wis:10,saveType:'death' };
    expect(getSavingThrowTarget({ ...opts, magicItemBonus:2,situationalBonus:3 })).toBe(7);
    expect(getSavingThrowTarget({ ...opts, magicItemBonus:-2,situationalBonus:-3 })).toBe(17);
    expect(getSavingThrowTarget({ ...opts, magicItemBonus:100 })).toBe(2);
    expect(getSavingThrowTarget({ ...opts, magicItemBonus:'bad' })).toBe(12);
    expect(() => getSavingThrowTarget({ ...opts,saveType:'bad' })).toThrow();
  });
  it.each(conCases)('actor uses attributes CON %i, ignoring legacy abilities CON', (con, bonus) => {
    const actor = Object.create(OspActor.prototype);
    actor.system = { class:'Fighter',level:1,race:'Dwarf',attributes:{ con:{value:con},wis:{value:10} },abilities:{con:{value:3}},saves:{death:{custom:'preserved'}} };
    actor._calculateSavingThrows();
    expect(actor.system.saves.death).toEqual({value:12,poisonValue:12-bonus,custom:'preserved'});
    expect(actor.system.saves.wands.value).toBe(13-bonus);
    expect(actor.system.saves.spells.value).toBe(16-bonus);
    expect(actor.system.saves.paralysis.value).toBe(14);
    expect(actor.system.saves.breath.value).toBe(15);
  });
  it('exposes Gnome device resilience and handles minimum target', () => {
    const actor = Object.create(OspActor.prototype);
    actor.system = { class:'Fighter',level:14,race:'Gnome',attributes:{con:{value:18},wis:{value:18}} };
    actor._calculateSavingThrows();
    expect(actor.system.saves.resilienceBonus).toBe(5);
    expect(actor.system.saves.magicModifier).toBe(3);
    expect(actor.system.saves.spells.value).toBe(2);
    expect(actor.system.saves.death.poisonValue).toBe(4);
  });
});
