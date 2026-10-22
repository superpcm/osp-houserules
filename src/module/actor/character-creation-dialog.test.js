import houseRules from '../../../data/ose_house_rules_v1_5.json';
import { BACKGROUNDS } from './character-creation-dialog.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
const { ospRoll } = vi.hoisted(() => ({ ospRoll: vi.fn() }));
vi.mock('../dice.js', () => ({ ospRoll }));
import { applyRacialModifiers, allowedCreationClasses, buildCreationItems, buildCreationActorData, createCharacterFromPrompt, extraLanguageCount, firstLevelHitPointsFromProfile, profileLanguages, rollAbilityPool } from './character-creation-dialog.js';

const races = JSON.parse(fs.readFileSync('data/race_profiles.json', 'utf8')).raceProfiles;
const classes = JSON.parse(fs.readFileSync('data/class_profiles.json', 'utf8')).classProfiles;
const scores = { str: 12, int: 12, wis: 12, dex: 12, con: 12, cha: 12 };

describe('BR-08 character creation', () => {
  beforeEach(() => ospRoll.mockReset());
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    ['Dwarf', { con: 1, cha: -1 }], ['Elf', { dex: 1, con: -1 }], ['Gnome', {}], ['Half-Elf', {}],
    ['Hobbit', { dex: 1, str: -1 }], ['Half-Orc', { str: 1, con: 1, cha: -2 }], ['Human', { con: 1, cha: 1 }]
  ])('applies %s modifiers once', (race, mods) => {
    const result = applyRacialModifiers(scores, race);
    for (const [key, value] of Object.entries(mods)) expect(result[key]).toBe(12 + value);
  });
  it('caps at 18 without a lower clamp', () => {
    expect(applyRacialModifiers({ ...scores, con: 18, cha: 18 }, 'Human')).toMatchObject({ con: 18, cha: 18 });
    expect(applyRacialModifiers({ ...scores, cha: 3 }, 'Half-Orc').cha).toBe(1);
  });
  it('supports all six race-as-class paths, separate Human classes, and excludes Drow', () => {
    for (const race of ['Dwarf', 'Elf', 'Gnome', 'Half-Elf', 'Hobbit', 'Half-Orc']) expect(allowedCreationClasses(race, scores, { races, classes })).toContain(race);
    expect(allowedCreationClasses('Human', scores, { races, classes }).length).toBeGreaterThan(0);
    expect(allowedCreationClasses('Human', scores, { races, classes })).not.toContain('Drow');
    expect(allowedCreationClasses('Drow', scores, { races, classes })).toEqual([]);
  });
  it('checks requirements after modifiers', () => {
    expect(allowedCreationClasses('Gnome', { ...scores, int: 8, con: 8 }, { races, classes })).not.toContain('Illusionist');
    expect(allowedCreationClasses('Gnome', { ...scores, int: 9, con: 9 }, { races, classes })).toContain('Illusionist');
  });
  it.each(['Dwarf', 'Elf', 'Gnome', 'Half-Elf', 'Hobbit', 'Half-Orc', 'Human'])('supports separate %s/Fighter creation', race => {
    const adjusted = applyRacialModifiers(scores, race);
    const allowed = allowedCreationClasses(race, adjusted, { races, classes });
    expect(allowed).toContain('Fighter');
    expect(allowed).not.toContain('Drow');
    for (const other of ['Dwarf', 'Elf', 'Gnome', 'Half-Elf', 'Hobbit', 'Half-Orc']) {
      if (other !== race) expect(allowed).not.toContain(other);
    }
  });
  it('uses racial adjustments at the requirement boundary', () => {
    expect(allowedCreationClasses('Dwarf', applyRacialModifiers({ ...scores, con: 8 }, 'Dwarf'), { races, classes })).toContain('Dwarf');
    expect(allowedCreationClasses('Dwarf', applyRacialModifiers({ ...scores, con: 7 }, 'Dwarf'), { races, classes })).toEqual([]);
  });
  it.each(['Elf', 'Gnome', 'Half-Elf', 'Half-Orc', 'Mage'])('uses profile hit die for %s', (name) => {
    const profile = classes.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    expect(firstLevelHitPointsFromProfile(profile, 10)).toBe(Number(profile.hitDie.match(/d(\d+)/)[1]));
  });
  it('includes negative CON at first level', () => expect(firstLevelHitPointsFromProfile(classes.find((entry) => entry.name === 'Fighter'), 3)).toBe(5));
  it('drops the lowest die locally and cancels without partial pool', async () => {
    ospRoll.mockResolvedValue({ cancelled: false, total: 99, dice: [{ results: [1, 6, 4, 3] }] });
    expect((await rollAbilityPool())[0].total).toBe(13);
    expect(ospRoll.mock.calls.map(([formula]) => formula)).toEqual(Array(6).fill('4d6'));
    ospRoll.mockReset(); ospRoll.mockResolvedValueOnce({ cancelled: true });
    expect(await rollAbilityPool()).toBeNull();
  });
  it.each([0, 2, 5])('discards the complete attempt when roll %s is cancelled', async index => {
    for (let i = 0; i < index; i++) ospRoll.mockResolvedValueOnce({ dice: [{ results: [6, 5, 4, 1] }] });
    ospRoll.mockResolvedValueOnce({ cancelled: true });
    expect(await rollAbilityPool()).toBeNull();
    expect(ospRoll).toHaveBeenCalledTimes(index + 1);
  });
  it('labels six generated rolls in the approved ability order', async () => {
    ospRoll.mockResolvedValue({ dice: [{ results: [6, 6, 6, 1] }] });
    await rollAbilityPool();
    expect(ospRoll.mock.calls.map(([, options]) => options.label)).toEqual(['Strength', 'Intelligence', 'Wisdom', 'Dexterity', 'Constitution', 'Charisma']);
  });
  it.each([13, 14, 15])('INT %s grants one language', (score) => expect(extraLanguageCount(score)).toBe(1));
  it.each([16, 17])('INT %s grants two languages', (score) => expect(extraLanguageCount(score)).toBe(2));
  it('grants three at 18 and none below 13', () => { expect(extraLanguageCount(18)).toBe(3); expect(extraLanguageCount(12)).toBe(0); });
  it('deduplicates languages, omits Alignment, and normalizes Hobbit aliases', () => expect(profileLanguages({ languages: ['Alignment', 'Common', 'Hobbit', 'Hobbitish'] }, { languages: ['Common', 'Gnomish'] })).toEqual(['Trade Tongue', 'Hobbiton', 'Gnomish']));
  it.each([[100, 100, 0], [110, 90, 2], [120, 90, 3], [180, 90, 9]])('exchanges %s silver into purse capacity', async (value, silverExpected, goldExpected) => {
    const catalogs = { 'clothing.json': ["Clothes, Commoner's", 'Boots', 'Belt'].map((name) => ({ name, type: 'clothing', system: {} })), 'gear.json': [{ name: 'Coin Purse', type: 'container', system: { capacity: 4 } }], 'treasure.json': [{ name: 'Silver Coins', type: 'coin', system: { storedSize: 0.04, cost: 1 } }, { name: 'Gold Coins', type: 'coin', system: { storedSize: 0.04, cost: 10 } }] };
    vi.stubGlobal('foundry', { utils: { deepClone: (v) => structuredClone(v), randomID: () => 'purse123456789012' } });
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({ json: () => Promise.resolve(catalogs[url.split('/').pop()]) })));
    const items = await buildCreationItems(value); const purse = items.find((i) => i.name === 'Coin Purse'); const silver = items.find((i) => i.name === 'Silver Coins'); const gold = items.find((i) => i.name === 'Gold Coins');
    expect(silver?.system.quantity || 0).toBe(silverExpected); expect(gold?.system.quantity || 0).toBe(goldExpected); expect((silver?.system.quantity || 0) + (gold?.system.quantity || 0)).toBeLessThanOrEqual(100); expect((silver?.system.containerId || gold?.system.containerId)).toBe(purse._id); expect(items.filter((i) => i.system.equipped)).toHaveLength(4);
  });
  it.each(Array.from({ length: 16 }, (_unused, index) => 30 + 10 * index))('preserves the full %s-silver starting value using the fewest exchanges', async value => {
    const catalogs = Object.fromEntries(['clothing.json', 'gear.json', 'treasure.json'].map(file =>
      [file, JSON.parse(fs.readFileSync(`data/${file}`, 'utf8'))]));
    vi.stubGlobal('foundry', { utils: { deepClone: structuredClone, randomID: () => 'purse123456789012' } });
    vi.stubGlobal('fetch', vi.fn(url => Promise.resolve({ json: async () => catalogs[url.split('/').pop()] })));
    const items = await buildCreationItems(value);
    const purse = items.find(item => item.name === 'Coin Purse');
    const coins = items.filter(item => item.type === 'coin');
    const gold = coins.find(item => item.name === 'Gold Coins')?.system.quantity || 0;
    expect(coins.reduce((sum, item) => sum + item.system.quantity * item.system.cost, 0)).toBe(value);
    expect(coins.reduce((sum, item) => sum + item.system.quantity, 0)).toBeLessThanOrEqual(100);
    expect(coins.reduce((sum, item) => sum + item.system.quantity * item.system.storedSize, 0)).toBeLessThanOrEqual(purse.system.capacity);
    expect(coins.every(item => item.system.quantity > 0 && item.system.containerId === purse._id)).toBe(true);
    if (gold) expect(value - 9 * (gold - 1)).toBeGreaterThan(100);
    else expect(value).toBeLessThanOrEqual(100);
    expect(catalogs['treasure.json'].find(item => item.name === 'Silver Coins').system.quantity).toBe(0);
  });
  it('does not create an actor when the creation prompt is cancelled', async () => {
    const create = vi.fn();
    expect(await createCharacterFromPrompt({ name: 'Cancelled' }, { prompt: async () => null, create })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
  it.each(['Normal', 'Dimvision'])('persists %s creation once with source metadata and embedded links', async vision => {
    const result = { attributes: { con: { value: 13 } }, race: 'Human', class: 'Fighter',
      alignment: 'Neutral', background: 'Farmer', languages: ['Common'], vision,
      hitpoints: 9, maxhitpoints: 9, items: [{ _id: 'purse123456789012', name: 'Coin Purse' },
        { name: 'Silver Coins', system: { containerId: 'purse123456789012', quantity: 80 } }] };
    const source = { name: 'Example', ownership: { player: 3 }, system: { details: { notes: 'keep' } },
      flags: { unrelated: { keep: true }, 'osp-houserules': { keep: true } }, items: [{ name: 'Existing' }] };
    const create = vi.fn(data => data);
    const data = await createCharacterFromPrompt(source, { prompt: async () => result, create });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toMatchObject({ osprSkipDialog: true, keepEmbeddedIds: true });
    expect(data.system).toMatchObject({ hitpoints: 9, maxhitpoints: 9, level: 1, xp: 0, details: { notes: 'keep' } });
    expect(data.flags['osp-houserules']).toMatchObject({ keep: true, lastKnownLevel: 1, pendingSkillPoints: 0, skillPointFraction: 0, skillPoolVersion: 0, levelUpState: { status: 'complete', fromLevel: 1, targetLevel: 1 } });
    expect(data.ownership).toEqual(source.ownership);
    expect(data.system.languages).toBe('Trade Tongue');
    expect(data.items).toHaveLength(3);
    expect(data.items[2].system.containerId).toBe(data.items[1]._id);
    expect(data.prototypeToken.sight).toMatchObject({ enabled: true, range: 0, visionMode: 'basic', brightness: vision === 'Dimvision' ? 1 : 0 });
    expect(buildCreationActorData(source, result)).toEqual(data);
  });
});


it('BR-17 background choices cover every house-rule occupation exactly once', () => {
  expect(BACKGROUNDS).toHaveLength(100);
  expect([...BACKGROUNDS].sort()).toEqual(houseRules.occupations.map(entry => entry.occupation).sort());
  expect(houseRules.occupations.map(entry => entry.roll)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
});
