import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { baseSpellSlots, beginningSpellAllowance, bonusSpellSlots, canCastClassSpellsAtLevel, canRetryCopy, copyingChance, externalFocusPolicy, focusKindForItem, isEligibleFocusItem, matchesPhysicalFocusKind, physicalFocusItemTypes, spellBookPages, spellClassKey, spellFocusPolicy, spellFormKey, spellMode, wildMagicOutcome } from './spell-rules.js';

const root = path.resolve(process.cwd());
const classData = JSON.parse(fs.readFileSync(path.join(root, 'data/class_profiles.json'), 'utf8'));
const houseRules = JSON.parse(fs.readFileSync(path.join(root, 'data/ose_house_rules_v1_5.json'), 'utf8'));
const profile = (id) => classData.classProfiles.find((candidate) => candidate.id === id);
const actorSystem = (level, scores = {}) => ({ level, attributes: { int: { value: scores.INT ?? 10 }, wis: { value: scores.WIS ?? 10 } } });

describe('spell tab unlock levels', () => {
  const classProfile = name => classData.classProfiles.find(candidate => spellClassKey(candidate) === spellClassKey(name));
  it.each([
    ['Bard', 2], ['Cleric', 2], ['Drow', 3], ['Half-Elf', 2], ['Paladin', 9], ['Ranger', 8],
  ])('hides %s until level %i, then shows it', (name, firstLevel) => {
    const selected = classProfile(name);
    expect(canCastClassSpellsAtLevel(actorSystem(firstLevel - 1), selected)).toBe(false);
    expect(canCastClassSpellsAtLevel(actorSystem(firstLevel), selected)).toBe(true);
  });
  it.each(['Druid', 'Elf', 'Gnome', 'Illusionist', 'Magic-User', 'Mage'])('shows %s at level 1', name => {
    expect(canCastClassSpellsAtLevel(actorSystem(1), classProfile(name))).toBe(true);
  });
  it('preserves Wisdom-based earlier spell access', () => {
    expect(canCastClassSpellsAtLevel(actorSystem(1, { WIS: 15 }), classProfile('Cleric'))).toBe(true);
    expect(canCastClassSpellsAtLevel(actorSystem(8, { WIS: 16 }), classProfile('Paladin'))).toBe(true);
    expect(canCastClassSpellsAtLevel(actorSystem(7, { WIS: 16 }), classProfile('Ranger'))).toBe(true);
  });
  it('keeps noncasters and unavailable profiles hidden', () => {
    expect(canCastClassSpellsAtLevel(actorSystem(10), classProfile('Fighter'))).toBe(false);
    expect(canCastClassSpellsAtLevel(actorSystem(1), undefined)).toBe(false);
  });
});

describe('spell rules', () => {
  it('uses actor system level and applies cleric WIS gate', () => {
    expect(baseSpellSlots(actorSystem(1, { WIS: 14 }), profile('cleric'))).toEqual({});
    expect(baseSpellSlots(actorSystem(1, { WIS: 15 }), profile('cleric'))).toEqual({ '1': 1 });
    expect(baseSpellSlots(actorSystem(2), profile('cleric'))).toEqual({ '1': 1 });
  });

  it('gives Paladin and Ranger only the first row during WIS early access', () => {
    expect(baseSpellSlots(actorSystem(6, { WIS: 18 }), profile('paladin'))).toEqual({ '1': 1 });
    expect(baseSpellSlots(actorSystem(9, { WIS: 18 }), profile('paladin'))).toEqual({ '1': 1 });
    expect(baseSpellSlots(actorSystem(5, { WIS: 18 }), profile('ranger'))).toEqual({ '1': 1 });
    expect(baseSpellSlots(actorSystem(10, { WIS: 18 }), profile('ranger'))).toEqual({ '1': 2, '2': 1 });
  });

  it('adds bonuses only to unlocked levels and honors configured exclusions', () => {
    expect(bonusSpellSlots(actorSystem(3, { INT: 18 }), profile('magic_user'), houseRules.spells)).toEqual({ '1': 3, '2': 2 });
    expect(bonusSpellSlots(actorSystem(1, { INT: 18 }), profile('illusionist'), houseRules.spells)).toEqual({ '1': 2 });
    expect(bonusSpellSlots(actorSystem(2, { WIS: 18 }), profile('bard'), houseRules.spells)).toEqual({ '1': 1 });
    expect(bonusSpellSlots(actorSystem(1, { INT: 12 }), profile('magic_user'), houseRules.spells)).toEqual({ '1': 1 });
  });

  it('identifies modes and stable form keys', () => {
    expect(spellClassKey('Magic-User')).toBe('magicuser');
    expect(spellMode(profile('magic_user'))).toBe('arcane');
    expect(spellMode(profile('cleric'))).toBe('divine');
    expect(spellMode(profile('mage'))).toBe('external');
    expect(spellFormKey('sleep')).toBe('sleep::normal');
    expect(spellFormKey('sleep', true)).toBe('sleep::reverse');
  });

  it('validates wild magic, spellbook pages, and copying retry rules', () => {
    expect(wildMagicOutcome(1)).toBe('Bane');
    expect(wildMagicOutcome(20)).toBe('Boon');
    expect(wildMagicOutcome(10)).toBe('Normal');
    expect(() => wildMagicOutcome(1.5)).toThrow();
    expect(spellBookPages({ name: 'Read Magic', level: 1 })).toBe(1);
    expect(() => spellBookPages({ level: 0 })).toThrow();
    expect([3, 4, 6, 8, 10, 13, 15, 17, 18].map(copyingChance)).toEqual([20, 30, 35, 40, 50, 70, 75, 85, 90]);
    expect([3, 4, 6, 8, 10, 13, 15, 17, 18].map(beginningSpellAllowance)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5]);
    expect(canRetryCopy(4, 3)).toBe(true);
    expect(canRetryCopy(3, 3)).toBe(false);
    expect(canRetryCopy(3, undefined)).toBe(true);
    expect(() => copyingChance(2)).toThrow();
    expect(() => canRetryCopy(0, 1)).toThrow();
  });

  it('maps every spellcasting class to its approved focus and preserves racial exemptions', () => {
    expect(spellFocusPolicy(profile('magic_user'))).toMatchObject({ kind: 'physical-focus', choices: ['wand', 'staff'], label: 'a Wand or Staff' });
    expect(spellFocusPolicy(profile('illusionist'))).toMatchObject({ kind: 'physical-focus', choices: ['wand', 'staff'], label: 'a Wand or Staff' });
    expect(spellFocusPolicy(profile('mage'))).toMatchObject({ kind: 'physical-focus', choices: ['wand', 'staff'], label: 'a Wand or Staff' });
    expect(spellFocusPolicy(profile('cleric')).label).toBe('a Holy Symbol');
    expect(spellFocusPolicy(profile('paladin')).label).toBe('a Holy Symbol');
    expect(spellFocusPolicy(profile('druid')).label).toBe('a sprig of mistletoe');
    expect(spellFocusPolicy(profile('bard')).label).toBe('their instrument');
    expect(spellFocusPolicy(profile('ranger')).kind).toBe('ranger-token');
    for (const id of ['elf', 'gnome', 'half_elf', 'drow']) expect(spellFocusPolicy(profile(id)).exempt).toBe(true);
    expect(spellFocusPolicy(profile('magic_user'), { system: { race: 'Elf' } }).exempt).toBe(false);
  });

  it('distinguishes source-as-focus, racial innate exemption, and manual innate adjudication', () => {
    expect(externalFocusPolicy({ sourceKind: 'scroll' })).toMatchObject({ kind: 'source', exempt: false });
    expect(externalFocusPolicy({ sourceKind: 'item' })).toMatchObject({ kind: 'source', exempt: false });
    expect(externalFocusPolicy({ sourceKind: 'innate', sourceRacial: true })).toMatchObject({ kind: 'innate', exempt: true });
    expect(externalFocusPolicy({ sourceKind: 'innate', sourceRacial: false }).exempt).toBe(false);
    expect(physicalFocusItemTypes()).not.toEqual(expect.arrayContaining(['spell', 'ability']));
    expect(matchesPhysicalFocusKind({ type: 'item' }, 'wand')).toBe(false);
    expect(matchesPhysicalFocusKind({ type: 'weapon', system: { tags: ['focus', 'mage'] } }, 'staff')).toBe(true);
    expect(matchesPhysicalFocusKind({ type: 'weapon', name: 'Staff' }, 'staff')).toBe(true);
    expect(matchesPhysicalFocusKind({ type: 'spell' }, 'staff')).toBe(false);
  });

  it('classifies only explicit or canonical focus inventory items', () => {
    expect(focusKindForItem({ type: 'item', name: 'Wand', img: 'wand.webp' })).toBe('wand');
    expect(focusKindForItem({ type: 'weapon', name: 'Staff Sling', system: { tags: ['focus', 'mage'] } })).toBeUndefined();
    expect(focusKindForItem({ type: 'item', name: 'Holy Symbol', system: { tags: ['religious', 'focus'] } })).toBe('holy-symbol');
    expect(focusKindForItem({ type: 'item', name: 'Animal Totem', system: { tags: ['focus', 'ranger'] } })).toBe('ranger-token');
    expect(focusKindForItem({ type: 'item', name: 'Book', system: { tags: ['focus'] } })).toBeUndefined();
    expect(isEligibleFocusItem({ type: 'item', name: 'Mistletoe' }, { kind: 'mistletoe' })).toBe(true);
    expect(isEligibleFocusItem({ type: 'item', name: 'Mistletoe' }, { kind: 'bard' })).toBe(false);
  });
});
