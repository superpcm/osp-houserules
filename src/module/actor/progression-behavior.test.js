import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceClassHandler } from './sheets/handlers/race-class-handler.js';
vi.mock('./character-creation-dialog.js', () => ({ createCharacterFromPrompt: vi.fn() }));
let OspActor, CharacterSheet;
beforeAll(async () => {
  vi.stubGlobal('Actor', class { prepareDerivedData() {} });
  vi.stubGlobal('Application', class {});
  vi.stubGlobal('Dialog', class {});
  vi.stubGlobal('foundry', { applications: { sheets: { ActorSheetV2: class { async _prepareContext() { return {}; } } }, api: { HandlebarsApplicationMixin: Base => Base } }, appv1: { sheets: { ActorSheet: class {} } }, utils: { duplicate: value => structuredClone(value) } });
  ({ OspActor } = await import('./actor.js'));
  ({ OspActorSheetCharacter: CharacterSheet } = await import('./sheets/character-sheet.js'));
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ui', { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal('game', { user: { isGM: true }, settings: { get: () => 'gmroll' } });
  vi.stubGlobal('ChatMessage', { getSpeaker: () => ({}), applyRollMode: () => ({ whisper: ['gm'] }), create: vi.fn(async () => ({})) });
  vi.stubGlobal('DOMPurify', { sanitize: value => value });
  vi.stubGlobal('TextEditor', { enrichHTML: async value => value });
});
const actor = (name = 'Mage', race = 'Human', extra = {}) => {
  const doc = Object.create(OspActor.prototype);
  Object.assign(doc, { name: 'Test character', type: 'character', isOwner: true, items: [], system: {
    class: name, race, xp: 1e9, level: 1, maxhitpoints: 37, hitpoints: 19, attributes: { con: { value: 18 }, str: { value: 16 }, wis: { value: 13 }, int: { value: 16 } }, ...extra
  }, getFlag: () => undefined });
  doc.update = vi.fn(async changes => {
    for (const [key, value] of Object.entries(changes)) if (key.startsWith('system.')) doc.system[key.slice(7)] = value;
  });
  return doc;
};

describe('BR-11 actor, sheet and level-up behavior', () => {
  it('prepares capped levels repeatedly without losing XP or rolled HP', () => {
    const doc = actor('Warden', 'Hobbit');
    for (const method of ['_calculateEncumbrance','_calculateSavingThrows','_calculateArmorClass']) doc[method] = vi.fn();
    doc.prepareDerivedData();
    doc.prepareDerivedData();
    expect(doc.system.level).toBe(6);
    expect(doc.system.xp).toBe(1e9);
    expect(doc.system.maxhitpoints).toBe(37);
    expect(doc.system.hitpoints).toBe(19);
    expect(doc.system.nextLevelXP).toBe(32000);
    expect(doc.system.xpModifier).toBe(10);
    expect(doc.update).not.toHaveBeenCalled();
  });
  it('allows a standard Human to reach the approved class maximum', () => {
    const doc = actor('Fighter');
    doc._calculateLevel();
    expect(doc.system.level).toBe(14);
    expect(doc.system.xp).toBe(1e9);
  });
  for (const hp of [37, 0, undefined, null]) it(`sheet render preserves recorded HP ${hp} without writing progression flags`, async () => {
    const doc = actor('Mage', 'Human', { level: 10, maxhitpoints: hp });
    const sheet = Object.create(CharacterSheet.prototype);
    Object.assign(sheet, { actor: doc, loadProfileData: async () => ({ classes: [] }), _calculateOpenStuckDoorsTarget: () => 1 });
    const context = await sheet._prepareContext();
    expect(context.calculatedMaxHP).toBe(82);
    expect(doc.system.maxhitpoints).toBe(hp);
    expect(doc.system.hitpoints).toBe(19);
    expect(doc.update).not.toHaveBeenCalled();
  });
});

it('preserves existing referee-only Cleric on sheet opening', () => {
  const options = ['Cleric', 'Fighter'].map(value => ({ value, val() { return value; }, clone() { return { ...this, attr: vi.fn() }; } }));
  vi.stubGlobal('$', option => option);
  const select = { current: 'Cleric', entries: [], val(value) { if (value !== undefined) this.current = value; return this.current; }, empty() { this.entries = []; }, append(option) { this.entries.push(option); }, find(query) { return { length: this.entries.filter(entry => query.includes(`"${entry.value}"`)).length }; } };
  const handler = Object.create(RaceClassHandler.prototype);
  Object.assign(handler, { actor: actor('Cleric', 'Dwarf'), classSelect: select, raceSelect: { val: () => 'Dwarf' }, originalClassOptions: { each(fn) { options.forEach((option, index) => fn(index, option)); } } });
  handler.filterClassOptions(); expect(select.current).toBe('Cleric'); expect(select.entries.map(entry => entry.value)).toContain('Cleric'); expect(select.entries[0].attr).toHaveBeenCalledWith('title', expect.stringContaining('Referee-only'));
});
