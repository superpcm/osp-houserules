import { describe, it, expect } from 'vitest';
import { auditPouchContents, auditClothingContents, checkAllowedContainers, clothingStorageRejection, matchesContainerAllowedNames, matchesContainerType, pouchStorageRejection } from './container-allowlist.js';
import { checkWithdrawTarget } from './container-capacity.js';
import gear from '../../../data/gear.json';
import weapons from '../../../data/weapons.json';
import ammunition from '../../../data/ammunition.json';
import misc from '../../../data/misc.json';
import treasure from '../../../data/treasure.json';
import clothing from '../../../data/clothing.json';

function item(name, allowedContainers) {
  return { name, system: { allowedContainers } };
}

const catalogScabbard = gear.find((entry) => entry.name === 'Scabbard, Sword');
const catalogSwordFrog = gear.find((entry) => entry.name === 'Sword Frog');
const catalogInkVial = gear.find((entry) => entry.name === 'Ink Vial');
const catalogHolyWater = gear.find((entry) => entry.name === 'Holy Water');
const catalogWarhammerSling = gear.find((entry) => entry.name === 'Warhammer Sling');
const catalogWinterCoat = clothing.find((entry) => entry.name === 'Coat, Winter');
const capacityClothing = clothing.filter((entry) => Number(entry.system?.capacity) > 0);
const standardPortableContainers = [
  'Backpack', 'Belt Pouch (L)', 'Belt Pouch (S)', 'Cart', 'Chest, Large', 'Chest, Small',
  'Panniers', 'Sack, Large', 'Sack, Small', 'Saddlebags, Large', 'Saddlebags, Small',
  'Sidesack', 'Wagon',
];
const canonicalScabbardSwords = ['Longsword', 'Broadsword', 'Bastard Sword', 'Khopesh', 'Shortsword', 'Rapier'];
const dedicatedHolderPairs = {
  'Scabbard, Dagger': ['Dagger', 'Misericorde'],
  'Scabbard, Sword': canonicalScabbardSwords,
  'Sword Frog': ['Scabbard, Sword'],
  Baldric: ['Zweihander', 'Greatsword'],
  'Axe Sling': ['Battle Axe', 'Battle Axe, 2-Handed'],
  'Warhammer Sling': ['Warhammer'],
  'Belt Loop': ['Hand Axe', 'Light Hammer', 'Warhammer', 'Waterskin', 'Mace', 'Morning Star', 'Flail'],
  'Flask/Potion Holder': ['Vial or Bottle', 'Oil Flask', 'Holy Water'],
  'Skin Sling': ['Waterskin', 'Wineskin'],
};

it('defines Coat, Winter as two-slot outerwear with internal capacity', () => {
  expect(catalogWinterCoat).toMatchObject({
    name: 'Coat, Winter',
    type: 'clothing',
    img: 'systems/osp-houserules/assets/thumbs/images/clothing/coat-winter_thumb.webp',
  });
  expect(catalogWinterCoat.system).toMatchObject({
    cost: 5,
    unitWeight: 4,
    storedSize: 5,
    quantity: 1,
    equipped: false,
    lashable: false,
    lashSlots: 0,
    capacity: 2,
    slot: 'outerwear',
    maxItemSize: 0.5,
    storeAvailability: 'common',
    blacksmithEligible: false,
  });
});

describe('checkAllowedContainers', () => {
  it('defines Warhammer Sling with the Axe Sling storage profile and Warhammer-only allowlist', () => {
    expect(catalogWarhammerSling).toMatchObject({
      name: 'Warhammer Sling',
      type: 'container',
      img: 'systems/osp-houserules/assets/thumbs/images/gear/warhammer-sling_thumb.webp',
    });
    expect(catalogWarhammerSling.system).toMatchObject({
      cost: 5,
      unitWeight: 1,
      storedSize: 3,
      capacity: 8,
      maxItems: 1,
      lashSlots: 0,
      allowedNames: ['Warhammer'],
      tags: ['weapon-storage', 'sling', 'slungable'],
    });
    expect(checkAllowedContainers(item('Warhammer +1', ['Cart']), { name: 'Warhammer Sling' })).toEqual({ allowed: true, reason: null });
    expect(checkAllowedContainers(item('Battle Axe', ['Cart']), { name: 'Warhammer Sling' }).allowed).toBe(false);
    expect(checkAllowedContainers(item('Light Hammer', ['Cart']), { name: 'Warhammer Sling' }).allowed).toBe(false);
  });

  it('blocks only the approved bulky or ammunition contents in positive-capacity clothing', () => {
    for (const holderData of capacityClothing) {
      const holder = { id: holderData.name, ...holderData };
      for (const name of ['Torch', 'Grappling Hook', 'Hammer, Small', 'Boots']) {
        expect(clothingStorageRejection({ name, type: 'item' }, holder), `${name} -> ${holder.name}`).toMatch(/bulky|awkward/);
      }
      for (const itemData of ammunition.filter((entry) => entry.system.tags?.includes('arrows') || entry.system.tags?.includes('bolts'))) {
        expect(clothingStorageRejection(itemData, holder), `${itemData.name} -> ${holder.name}`).toMatch(/quiver|bolt case/);
      }
    }
  });

  it('preserves the Adventurer clothes dagger and scabbard exception and leaves conditional items unchanged', () => {
    const holder = { id: 'adv', name: "Clothes, Adventurer's", type: 'clothing', system: { capacity: 3 } };
    expect(clothingStorageRejection({ name: 'Dagger', type: 'weapon', system: { storedSize: 2 } }, holder)).toBeNull();
    expect(clothingStorageRejection({ name: 'Scabbard, Dagger', type: 'container', system: { storedSize: 0.5 } }, holder)).toBeNull();
    for (const name of ['Dart', 'Wand', 'Wooden Stake', 'Manacles', 'Vial or Bottle', 'Thieves Tools', 'Sack, Small']) {
      expect(clothingStorageRejection({ name, type: 'item', system: { storedSize: 1 } }, holder), name).toBeNull();
    }
  });

  it('audits existing clothing violations without mutation and skips lashed items', () => {
    const cloak = { id: 'cloak', name: 'Cloak', type: 'clothing', system: { capacity: 2 } };
    const torch = { id: 'torch', name: 'Torch', type: 'item', system: { containerId: 'cloak', storedSize: 1 } };
    const lashed = { id: 'lashed', name: 'Torch', type: 'item', system: { containerId: 'cloak', storedSize: 1, lashed: true } };
    const all = [cloak, torch, lashed];
    const before = JSON.stringify(all);
    expect(auditClothingContents(all)).toEqual([{ item: torch, container: cloak, reason: expect.stringContaining('bulky') }]);
    expect(JSON.stringify(all)).toBe(before);
    expect(checkWithdrawTarget(torch, { id: 'pack', name: 'Backpack', type: 'container', system: { capacity: 10 } }, []).allowed).toBe(true);
  });

  it('keeps belt pouch capacities and rejects physically unsuitable contents', () => {
    const small = { id: 'small', name: 'Belt Pouch (S)', type: 'container', system: { capacity: 2 } };
    const large = { id: 'large', name: 'Belt Pouch (L)', type: 'container', system: { capacity: 4 } };
    const blocked = ['Pole, Ten Foot', 'Crowbar', 'Torch', 'Hand Axe', 'Light Hammer', 'Grappling Hook',
      'Lantern, Bullseye', 'Lantern, Hooded', 'Mallet, Wooden', 'Rations, Iron'];
    expect(small.system.capacity).toBe(2);
    expect(large.system.capacity).toBe(4);
    for (const name of blocked) {
      expect(pouchStorageRejection({ name }, small)).toMatch(/too long or bulky/);
      expect(pouchStorageRejection({ name: `${name} +1` }, large)).toMatch(/too long or bulky/);
    }
    expect(pouchStorageRejection({ name: 'Hammer, Small' }, small)).toMatch(/small belt pouch/);
    expect(pouchStorageRejection({ name: 'Hammer, Small' }, large)).toBeNull();
  });

  it('leaves ordinary pouch contents and other hosts unrestricted, and audits without mutation', () => {
    const pouch = { id: 'p', name: 'Belt Pouch (L)', type: 'container', system: { capacity: 4 } };
    const healing = { id: 'h', name: 'Healing Potion', type: 'item', system: { containerId: 'p', storedSize: 1 } };
    const tinder = { id: 't', name: 'Tinder Box', type: 'item', system: { containerId: 'p', storedSize: 1 } };
    const chalk = { id: 'c', name: 'Chalk', type: 'item', system: { containerId: 'p', storedSize: 1 } };
    const torch = { id: 'x', name: 'Torch', type: 'item', system: { containerId: 'p', storedSize: 1 } };
    const all = [pouch, healing, tinder, chalk, torch];
    const before = JSON.stringify(all);
    expect(pouchStorageRejection(healing, pouch)).toBeNull();
    expect(pouchStorageRejection(tinder, pouch)).toBeNull();
    expect(pouchStorageRejection(chalk, pouch)).toBeNull();
    expect(checkWithdrawTarget(torch, { name: 'Backpack', id: 'b', type: 'container', system: { capacity: 10 } }, []).allowed).toBe(true);
    expect(auditPouchContents(all)).toEqual([{ item: torch, container: pouch, reason: expect.stringContaining('too long or bulky') }]);
    expect(JSON.stringify(all)).toBe(before);
  });

  it('normalizes restriction tags and only aliases gems to gem', () => {
    expect(matchesContainerType({ type: 'treasure', system: { tags: ['gem'] } }, 'GEMS')).toBe(true);
    expect(matchesContainerType({ type: 'treasure', system: { tags: ['jewelry'] } }, 'gem')).toBe(false);
    expect(matchesContainerType({ type: 'weapon', system: { weaponType: 'Sword' } }, ' sword ')).toBe(true);
  });

  it('accepts generated potion-tag items in the canonical Flask/Potion Holder', () => {
    const holder = { name: 'Flask/Potion Holder', type: 'container', system: {
      capacity: { value: 2 }, allowedNames: ['Vial or Bottle', 'Oil Flask', 'Holy Water'],
    } };
    const potion = { name: 'Healing Potion', type: 'item', system: { tags: ['magic', 'potion'], storedSize: 1 } };
    expect(matchesContainerAllowedNames(potion, holder)).toBe(true);
    expect(checkAllowedContainers({ ...potion, system: { ...potion.system, allowedContainers: ['Cart'] } }, holder).allowed).toBe(true);
    expect(checkWithdrawTarget({ ...potion, system: { ...potion.system, tags: ['potion', 'no-store'] } }, holder, []).allowed).toBe(false);
  });

  it('keeps generated potion exceptions narrow and capacity-bound', () => {
    const holder = { name: 'Flask/Potion Holder', type: 'container', system: {
      capacity: 2, allowedNames: ['Vial or Bottle', 'Oil Flask', 'Holy Water'],
    } };
    const potion = { name: 'Healing Potion', type: 'item', system: { tags: ['potion'], storedSize: 1 } };
    expect(matchesContainerAllowedNames(potion, { ...holder, name: 'Custom Holder' })).toBe(false);
    expect(matchesContainerAllowedNames(potion, { ...holder, system: { ...holder.system, allowedNames: ['Vial or Bottle'] } })).toBe(false);
    expect(matchesContainerAllowedNames({ ...potion, system: { ...potion.system, storedSize: 3 } }, holder)).toBe(false);
    expect(matchesContainerAllowedNames({ ...potion, system: { ...potion.system, tags: ['consumable'] } }, holder)).toBe(false);
  });

  it('allows any container when the item has no allowedContainers restriction', () => {
    const result = checkAllowedContainers(item('Dagger', undefined), { name: 'Belt Pouch' });
    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('allows any container when allowedContainers is an empty list', () => {
    const result = checkAllowedContainers(item('Dagger', []), { name: 'Belt Pouch' });
    expect(result.allowed).toBe(true);
  });

  it('allows a container whose name is in the list', () => {
    const result = checkAllowedContainers(item('Zweihander', ['Cart', 'Wagon']), { name: 'Wagon' });
    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('blocks a container not in the list, with a clear message', () => {
    const result = checkAllowedContainers(item('Zweihander', ['Cart', 'Wagon']), { name: 'Backpack' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Zweihander only fits in: Cart, Wagon.');
  });

  it('is case/name-exact — a similarly named container is still blocked', () => {
    const result = checkAllowedContainers(item('Barding, Plate', ['Cart', 'Wagon', 'Sack, Large', 'Panniers']), { name: 'Sack, Small' });
    expect(result.allowed).toBe(false);
  });

  it('allows the canonical sword scabbard inside a Sword Frog with the legacy allowlist', () => {
    const result = checkAllowedContainers(
      item('Scabbard, Sword', ['Cart', 'Wagon', 'Sack, Large', 'Panniers']),
      { name: 'Sword Frog' },
    );
    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('still blocks the canonical sword scabbard from an unrelated container', () => {
    const result = checkAllowedContainers(
      item('Scabbard, Sword', ['Cart', 'Wagon', 'Sack, Large', 'Panniers']),
      { name: 'Backpack' },
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Scabbard, Sword only fits in: Cart, Wagon, Sack, Large, Panniers.');
  });

  it.each(canonicalScabbardSwords)('allows legacy %s snapshots in a Sword Scabbard', (name) => {
    const result = checkAllowedContainers(
      item(name, ['Cart', 'Wagon', 'Sack, Large', 'Panniers']),
      { name: 'Scabbard, Sword' },
    );
    expect(result).toEqual({ allowed: true, reason: null });
  });

  it.each(canonicalScabbardSwords)('allows magic-suffixed %s snapshots in a Sword Scabbard', (name) => {
    const result = checkAllowedContainers(
      item(`${name} +2`, ['Cart', 'Wagon', 'Sack, Large', 'Panniers']),
      { name: 'Scabbard, Sword' },
    );
    expect(result).toEqual({ allowed: true, reason: null });
  });

  for (const [holder, names] of Object.entries(dedicatedHolderPairs)) {
    it.each(names)(`allows legacy %s in its dedicated ${holder}`, (name) => {
      expect(checkAllowedContainers(item(`${name} +2`, ['Cart', 'Wagon', 'Sack, Large', 'Panniers']), { name: holder }))
        .toEqual({ allowed: true, reason: null });
    });
  }

  it('does not turn a dedicated holder into a generic allowedNames override', () => {
    expect(checkAllowedContainers(item('Scimitar +1', ['Cart', 'Wagon']), { name: 'Scabbard, Sword' }).allowed).toBe(false);
    expect(checkAllowedContainers(item('Greatsword +1', ['Cart', 'Wagon', 'Baldric']), { name: 'Scabbard, Sword' }).allowed).toBe(false);
  });

  it.each(['Greatsword', 'Zweihander'])('keeps oversized %s out of a Sword Scabbard', (name) => {
    const result = checkAllowedContainers(
      item(name, ['Cart', 'Wagon', 'Baldric']),
      { name: 'Scabbard, Sword' },
    );
    expect(result.allowed).toBe(false);
  });

  it('catalog includes Sword Frog as the scabbard carrier', () => {
    expect(catalogScabbard).toBeDefined();
    expect(catalogSwordFrog).toBeDefined();
    expect(catalogScabbard.system.allowedContainers).toContain('Sword Frog');
    expect(catalogSwordFrog.system.allowedNames).toContain('Scabbard, Sword');
  });

  it('allows Ink Vial in every catalog clothing item with positive capacity', () => {
    expect(catalogInkVial.system.allowedContainers).toEqual(expect.arrayContaining(capacityClothing.map((entry) => entry.name)));
    for (const holder of capacityClothing) {
      expect(checkWithdrawTarget(catalogInkVial, { id: holder.name, ...holder }, []).allowed, holder.name).toBe(true);
    }
  });

  it('allows Holy Water in every catalog clothing item with positive capacity', () => {
    expect(catalogHolyWater.system.allowedContainers).toBeUndefined();
    for (const holder of capacityClothing) {
      expect(checkWithdrawTarget(catalogHolyWater, { id: holder.name, ...holder }, []).allowed, holder.name).toBe(true);
    }
  });

  it('keeps clothing capacity and stack quantity checks active for vial and holy water', () => {
    for (const holderData of capacityClothing) {
      const holder = { id: holderData.name, ...holderData };
      const capacity = Number(holder.system.capacity);
      const exactFitContents = [{ id: 'existing', type: 'item', system: { containerId: holder.id, storedSize: capacity - 1, quantity: 1 } }];
      expect(checkWithdrawTarget(catalogInkVial, holder, exactFitContents).allowed, `${holder.name} exact fit`).toBe(true);
      expect(checkWithdrawTarget(catalogHolyWater, holder, exactFitContents).allowed, `${holder.name} exact fit`).toBe(true);

      const fullContents = [{ id: 'existing', type: 'item', system: { containerId: holder.id, storedSize: capacity, quantity: 1 } }];
      expect(checkWithdrawTarget(catalogInkVial, holder, fullContents).allowed, `${holder.name} full`).toBe(false);
      expect(checkWithdrawTarget(catalogHolyWater, holder, fullContents).allowed, `${holder.name} full`).toBe(false);

      const stacked = { ...catalogInkVial, system: { ...catalogInkVial.system, quantity: 2 } };
      expect(checkWithdrawTarget(stacked, holder, exactFitContents).allowed, `${holder.name} stack`).toBe(false);
    }
  });

  it('allows ordinary portable catalog items in clothing when their bulk fits', () => {
    const pocketedTool = {
      name: 'Pocketed Tool',
      type: 'item',
      system: { storedSize: 0.5, tags: ['tool'] },
    };
    for (const holderData of capacityClothing) {
      const holder = { id: holderData.name, ...holderData };
      expect(checkWithdrawTarget(pocketedTool, holder, []).allowed, holder.name).toBe(true);
    }
  });

  it('allows a legacy full-profile allowlist in clothing and rejects incomplete profiles', () => {
    const holder = { id: 'cloak', ...clothing.find((entry) => entry.name === 'Cloak') };
    const legacyPortable = { name: 'Legacy Tool', type: 'item', system: {
      storedSize: 1, allowedContainers: standardPortableContainers,
    } };
    expect(checkWithdrawTarget(legacyPortable, holder, []).allowed).toBe(true);
    for (const allowedContainers of [['Cart'], ['Chest, Large']]) {
      expect(checkWithdrawTarget({ ...legacyPortable, system: { ...legacyPortable.system, allowedContainers } }, holder, []).allowed)
        .toBe(false);
    }
  });

  it('keeps legacy Manacles capacity behavior while allowing the catalog clothing profile', () => {
    const holder = { id: 'cloak', ...clothing.find((entry) => entry.name === 'Cloak') };
    const manacles = gear.find((entry) => entry.name === 'Manacles');
    const legacyManacles = { ...manacles, system: { ...manacles.system, allowedContainers: standardPortableContainers } };
    expect(checkWithdrawTarget(legacyManacles, holder, []).allowed).toBe(true);
    expect(checkWithdrawTarget(legacyManacles, holder, [{ id: 'existing', type: 'item', system: {
      containerId: holder.id, storedSize: 1,
    } }]).allowed).toBe(false);
  });

  it('covers every unrestricted catalog item that fits positive-capacity clothing', () => {
    const catalogs = [...gear, ...misc, ...treasure];
    for (const holderData of capacityClothing) {
      const holder = { id: holderData.name, ...holderData };
      const capacity = Number(holder.system.capacity);
      for (const candidate of catalogs.filter((entry) => {
        const size = Number(entry.system?.storedSize);
        const quantity = Number(entry.system?.quantity) || 1;
        const tags = entry.system?.tags || [];
        return entry.type === 'item' && !entry.system?.allowedContainers
          && Number.isFinite(size) && size > 0 && size * quantity <= capacity
          && !tags.includes('no-store') && !tags.includes('slungable') && !tags.includes('sling')
          && !clothingStorageRejection(entry, holder);
      })) {
        expect(checkWithdrawTarget(candidate, holder, []).allowed, `${candidate.name} -> ${holder.name}`).toBe(true);
      }
    }
  });

  it('normalizes object clothing capacity and rejects an oversized item', () => {
    const holder = { id: 'pocketed-vest', name: 'Pocketed Vest', type: 'clothing', system: { capacity: { max: 1 } } };
    const itemData = { name: 'Small Tool', type: 'item', system: { storedSize: 1 } };
    expect(checkWithdrawTarget(itemData, holder, []).allowed).toBe(true);
    expect(checkWithdrawTarget({ ...itemData, system: { storedSize: 1.1 } }, holder, []).allowed).toBe(false);
  });

  it('preserves custom allowlists and item-side storage exclusions for clothing', () => {
    const holder = { id: 'cloak', ...clothing.find((entry) => entry.name === 'Cloak') };
    expect(checkWithdrawTarget({ name: 'Locked Gem', type: 'item', system: {
      storedSize: 0.1, allowedContainers: ['Locked Chest'],
    } }, holder, []).allowed).toBe(false);
    expect(checkWithdrawTarget({ name: 'Too Large', type: 'item', system: {
      storedSize: 3, tags: ['tool'],
    } }, holder, []).allowed).toBe(false);
  });

  it('keeps the catalog Manacles clothing profile aligned without widening larger kits', () => {
    const manacles = gear.find((entry) => entry.name === 'Manacles');
    const healerKit = gear.find((entry) => entry.name === "Healer's Kit");
    expect(manacles.system.allowedContainers).toEqual(expect.arrayContaining(capacityClothing.map((entry) => entry.name)));
    expect(healerKit.system.allowedContainers).not.toEqual(expect.arrayContaining(capacityClothing.map((entry) => entry.name)));
  });

  it('does not allow vial clothing exceptions for zero-capacity clothing or generic Cloak containers', () => {
    const zeroCapacity = { id: 'belt', name: 'Belt', type: 'clothing', system: { capacity: 0 } };
    const genericCloak = { id: 'cloak', name: 'Cloak', type: 'container', system: { capacity: 2 } };
    expect(checkAllowedContainers(catalogInkVial, zeroCapacity).allowed).toBe(false);
    expect(checkAllowedContainers(item('Restricted Vial', ['Cart']), genericCloak).allowed).toBe(false);
  });

  it('catalog restricts only legacy-container swords to the Sword Scabbard', () => {
    for (const name of ['Longsword', 'Broadsword', 'Bastard Sword', 'Khopesh']) {
      expect(weapons.find((entry) => entry.name === name).system.allowedContainers).toContain('Scabbard, Sword');
    }
    for (const name of ['Shortsword', 'Rapier']) {
      expect(weapons.find((entry) => entry.name === name).system.allowedContainers).toBeUndefined();
    }
  });

  it('accepts the catalog scabbard in an empty catalog Sword Frog', () => {
    const legacyScabbard = {
      ...catalogScabbard,
      system: { ...catalogScabbard.system, allowedContainers: ['Cart', 'Wagon', 'Sack, Large', 'Panniers'] },
    };
    const frog = { id: 'frog-1', ...catalogSwordFrog };
    const result = checkWithdrawTarget(legacyScabbard, frog, []);
    expect(result.allowed).toBe(true);
  });

  it('accepts the complete Sword Frog -> Scabbard -> Longsword chain', () => {
    const frog = { id: 'frog-1', ...catalogSwordFrog };
    const scabbard = { id: 'scabbard-1', ...catalogScabbard };
    const longsword = weapons.find((entry) => entry.name === 'Longsword');
    expect(checkWithdrawTarget(scabbard, frog, []).allowed).toBe(true);
    expect(checkWithdrawTarget(longsword, scabbard, []).allowed).toBe(true);
  });

  it.each(['Greatsword', 'Zweihander'])('rejects %s from a Sword Scabbard through the full gate', (name) => {
    const scabbard = { id: 'scabbard-1', ...catalogScabbard };
    const sword = weapons.find((entry) => entry.name === name);
    const result = checkWithdrawTarget(sword, scabbard, []);
    expect(result.allowed).toBe(false);
    expect(result.reasonType).toBe('type');
  });

  it('keeps the Backpack sword block in place', () => {
    const longsword = weapons.find((entry) => entry.name === 'Longsword');
    const backpack = { id: 'pack-1', name: 'Backpack', type: 'container', system: { capacity: 20 } };
    const result = checkWithdrawTarget(longsword, backpack, []);
    expect(result.allowed).toBe(false);
    expect(result.reasonType).toBe('type');
  });

  it('rejects a second scabbard when the Sword Frog is occupied', () => {
    const legacyScabbard = {
      ...catalogScabbard,
      system: { ...catalogScabbard.system, allowedContainers: ['Cart', 'Wagon', 'Sack, Large', 'Panniers'] },
    };
    const frog = { id: 'frog-1', ...catalogSwordFrog };
    const occupied = [{ id: 'scabbard-1', type: 'container', system: { containerId: frog.id, lashed: false } }];
    const result = checkWithdrawTarget(legacyScabbard, frog, occupied);
    expect(result.allowed).toBe(false);
    expect(result.reasonType).toBe('type');
    expect(result.reason).toMatch(/full/);
  });

  it('rejects a second item in every dedicated maxItems holder', () => {
    for (const holderName of Object.keys(dedicatedHolderPairs)) {
      const holder = { id: `holder-${holderName}`, ...gear.find((entry) => entry.name === holderName) };
      const itemName = dedicatedHolderPairs[holderName][0];
      const candidate = [...gear, ...weapons].find((entry) => entry.name === itemName);
      const occupied = [{ id: `occupied-${holderName}`, type: 'item', system: { containerId: holder.id, lashed: false } }];
      const result = checkWithdrawTarget(candidate, holder, occupied);
      expect(result.allowed, `${holderName} should reject a second item`).toBe(false);
      expect(result.reasonType).toBe('type');
      expect(result.reason).toMatch(/full/);
    }
  });

  it('keeps typed ammunition holders restricted to their matching ammunition', () => {
    const arrow = ammunition.find((entry) => entry.name === 'Arrow');
    const bolt = ammunition.find((entry) => entry.name === 'Crossbow Bolt, Light');
    for (const holderName of ['Quiver', 'Quiver, Hip']) {
      const holder = { id: holderName, ...gear.find((entry) => entry.name === holderName) };
      expect(checkWithdrawTarget(arrow, holder, []).allowed).toBe(true);
      expect(checkWithdrawTarget(bolt, holder, []).allowed).toBe(false);
    }
    const boltCase = { id: 'bolt-case', ...gear.find((entry) => entry.name === 'Bolt Case') };
    expect(checkWithdrawTarget(bolt, boltCase, []).allowed).toBe(true);
    expect(checkWithdrawTarget(arrow, boltCase, []).allowed).toBe(false);
  });

  it('keeps every catalog allowedNames candidate aligned with any item-side allowedContainers', () => {
    const catalogs = [...gear, ...weapons, ...misc, ...ammunition];
    for (const holder of catalogs.filter((entry) => entry.system?.allowedNames?.length)) {
      for (const candidateName of holder.system.allowedNames) {
        const candidate = catalogs.find((entry) => entry.name === candidateName);
        if (candidate?.system?.allowedContainers) {
          expect(candidate.system.allowedContainers, `${candidateName} -> ${holder.name}`).toContain(holder.name);
        }
      }
    }
  });

  it('keeps Signal Horn and bows free of contradictory container targets', () => {
    expect(gear.find((entry) => entry.name === 'Signal Horn').system.allowedContainers).toEqual([
      'Belt Pouch (L)', 'Cart', 'Chest, Large', 'Panniers',
      'Saddlebags, Large', 'Saddlebags, Small', 'Wagon',
    ]);
    for (const name of ['Longbow', 'Shortbow']) {
      expect(weapons.find((entry) => entry.name === name).system.allowedContainers).not.toContain('Sack, Large');
    }
  });
});

it('applies clothing shape restrictions to existing custom and magical garments', () => {
  for (const name of ['Cloak +1', 'Clothes, Winter']) {
    expect(clothingStorageRejection({ name: 'Torch', type: 'item' }, { name, type: 'clothing', system: { capacity: 2 } })).toBeTruthy();
  }
});
