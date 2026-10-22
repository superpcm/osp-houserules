import { beforeAll, describe, expect, it } from 'vitest';
import gear from '../../../data/gear.json';
import weapons from '../../../data/weapons.json';
import ammunition from '../../../data/ammunition.json';
import misc from '../../../data/misc.json';
import treasure from '../../../data/treasure.json';
import clothing from '../../../data/clothing.json';
import armor from '../../../data/armor.json';
import livestock from '../../../data/livestock.json';
import tack from '../../../data/tack.json';
import vehicles from '../../../data/vehicles.json';
import { MAGIC_CATEGORIES } from '../dialog/magic-item-schema.js';
import { checkWithdrawTarget } from './container-capacity.js';
import { matchesContainerType } from './container-allowlist.js';

let CharacterSheet;
beforeAll(async () => {
  globalThis.foundry = {
    applications: { sheets: { ActorSheetV2: class {} }, api: { HandlebarsApplicationMixin: Base => Base } },
    utils: { randomID: () => 'restriction-test', duplicate: value => structuredClone(value) },
  };
  globalThis.Application = class {};
  globalThis.TextEditor = { getDragEventData: () => ({ type: 'Item' }) };
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, settings: { get: () => null } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.Dialog = class {};
  globalThis.Item = { implementation: { fromDropData: async () => null } };
  ({ OspActorSheetCharacter: CharacterSheet } = await import('../actor/sheets/character-sheet.js'));
});

const catalogs = [gear, weapons, ammunition, misc, treasure, clothing, armor, livestock, tack, vehicles];
const typedCatalog = catalogs.flat().filter(entry => entry && typeof entry.name === 'string' && typeof entry.type === 'string');
const actorGate = (item, container, items = []) => {
  const sheet = Object.create(CharacterSheet.prototype);
  sheet.actor = { items };
  return sheet._isItemAllowedInContainer(item, container, items);
};

describe('catalog-wide container restriction parity', () => {
  it('accepts coin, gem, and jewelry entries in Coin Purse while preserving capacity', () => {
    const purse = { id: 'purse', ...gear.find(entry => entry.name === 'Coin Purse') };
    const candidates = [
      { name: 'Silver Coins', type: 'coin', system: { storedSize: 1, quantity: 1, tags: ['coins'] } },
      { name: 'Ruby', type: 'treasure', system: { storedSize: 1, quantity: 1, tags: ['gem'] } },
      { name: 'Gold Ring', type: 'treasure', system: { storedSize: 1, quantity: 1, tags: ['jewelry'] } },
    ];
    for (const item of candidates) {
      expect(checkWithdrawTarget(item, purse, []).allowed, item.name).toBe(true);
      expect(actorGate(item, purse).allowed, `actor ${item.name}`).toBe(true);
    }
    const full = [{ id: 'full', type: 'item', system: { containerId: purse.id, storedSize: 4, quantity: 1 } }];
    expect(checkWithdrawTarget(candidates[1], purse, full).allowed).toBe(false);
  });

  it('accepts legacy capitalized Coin Purse aliases and rejects unrelated types in both gates', () => {
    const purse = { id: 'legacy-purse', name: 'Coin Purse', type: 'container', system: {
      capacity: 4, allowedTypes: ['Coins', 'GEMS', 'Jewelry'],
    } };
    const gem = { name: 'Legacy Gem', type: 'treasure', system: { storedSize: 1, tags: ['gem'] } };
    const tool = { name: 'Tool', type: 'item', system: { storedSize: 1, tags: ['tool'] } };
    expect(checkWithdrawTarget(gem, purse, []).allowed).toBe(true);
    expect(actorGate(gem, purse).allowed).toBe(true);
    expect(checkWithdrawTarget(tool, purse, []).allowed).toBe(false);
    expect(actorGate(tool, purse).allowed).toBe(false);
  });

  it('rejects swords and slung items in current and legacy Sidesacks while allowing ordinary gear', () => {
    const ordinary = { name: 'Rope', type: 'item', system: { storedSize: 1, tags: ['tool'] } };
    for (const blockedTypes of [['sword', 'slungable'], ['Sword', 'Slungable']]) {
      const sidesack = { id: 'sidesack', name: 'Sidesack', type: 'container', system: { capacity: 12, blockedTypes } };
      for (const item of [
        { name: 'Longsword', type: 'weapon', system: { storedSize: 1, tags: ['sword'] } },
        { name: 'Longbow', type: 'weapon', system: { storedSize: 1, tags: ['slungable'] } },
      ]) {
        expect(checkWithdrawTarget(item, sidesack, []).allowed).toBe(false);
        expect(actorGate(item, sidesack).allowed).toBe(false);
      }
      expect(checkWithdrawTarget(ordinary, sidesack, []).allowed).toBe(true);
      expect(actorGate(ordinary, sidesack).allowed).toBe(true);
    }
  });

  it('accepts every generated potion schema tag in Flask/Potion Holder through both gates', () => {
    const holder = { id: 'potion-holder', ...gear.find(entry => entry.name === 'Flask/Potion Holder') };
    const potionTags = MAGIC_CATEGORIES.find(category => category.key === 'potion').tags;
    const potion = { name: 'Generated Potion', type: 'item', system: { storedSize: 1, tags: potionTags } };
    expect(checkWithdrawTarget(potion, holder, []).allowed).toBe(true);
    expect(actorGate(potion, holder).allowed).toBe(true);
    expect(checkWithdrawTarget({ ...potion, system: { ...potion.system, storedSize: 3 } }, holder, []).allowed).toBe(false);
    expect(checkWithdrawTarget({ ...potion, system: { ...potion.system, tags: [...potionTags, 'no-store'] } }, holder, []).allowed).toBe(false);
  });

  it('ensures every declared allowed container target exists and every allowedNames pair is compatible', () => {
    const names = new Set(typedCatalog.map(entry => entry.name));
    for (const item of typedCatalog) {
      for (const target of item.system?.allowedContainers || []) expect(names.has(target), `${item.name} -> ${target}`).toBe(true);
    }
    for (const holder of typedCatalog.filter(entry => entry.system?.allowedNames?.length)) {
      for (const name of holder.system.allowedNames) {
        const candidate = typedCatalog.find(entry => entry.name === name);
        if (candidate?.system?.allowedContainers) expect(candidate.system.allowedContainers).toContain(holder.name);
      }
    }
  });

  it('has a catalog or generated-schema example for every allowedTypes restriction', () => {
    const generated = MAGIC_CATEGORIES.flatMap(category => category.tags.map(tag => ({ type: 'item', system: { tags: [tag] } })));
    for (const holder of typedCatalog.filter(entry => entry.system?.allowedTypes?.length)) {
      for (const restriction of holder.system.allowedTypes) {
        const example = typedCatalog.concat(generated).find(item => matchesContainerType(item, restriction));
        expect(example, `${holder.name} requires ${restriction}`).toBeTruthy();
      }
    }
  });

  it('does not declare item-side targets that the target holder explicitly blocks', () => {
    const byName = new Map(typedCatalog.map(entry => [entry.name, entry]));
    for (const item of typedCatalog) {
      for (const target of item.system?.allowedContainers || []) {
        const holder = byName.get(target);
        if (!holder) continue;
        for (const blocked of holder.system?.blockedTypes || []) {
          expect(matchesContainerType(item, blocked), `${item.name} -> ${target} conflicts with ${blocked}`).toBe(false);
        }
      }
    }
  });

  it('keeps Signal Horn limited to its approved remaining containers', () => {
    const signalHorn = gear.find(entry => entry.name === 'Signal Horn');
    expect(signalHorn.system.allowedContainers).toEqual([
      'Belt Pouch (L)', 'Cart', 'Chest, Large', 'Panniers',
      'Saddlebags, Large', 'Saddlebags, Small', 'Wagon',
    ]);
    const chestSmall = { id: 'small-chest', name: 'Chest, Small', type: 'container', system: { capacity: 20 } };
    expect(checkWithdrawTarget(signalHorn, chestSmall, []).allowed).toBe(false);
  });
});
