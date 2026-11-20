import { describe, expect, it, vi } from 'vitest';
import { storageFootprint } from './bulk.js';
import { repairSwordSizes, SWORD_SIZE_REPAIR_FLAG } from './sword-size-repair.js';
import gearCatalog from '../../../data/gear.json';
import weaponsCatalog from '../../../data/weapons.json';

const makeItem = (name, type, storedSize, flags = {}) => {
  const value = { id: `${name}-${Math.random()}`, uuid: undefined, name, type,
    system: { storedSize, containerId: 'frog', quantity: 1, customField: 'keep' },
    flags: { 'osp-houserules': flags } };
  value.update = vi.fn(async update => {
    value.system = { ...value.system, ...update.system };
    value.flags['osp-houserules'] = {
      ...value.flags['osp-houserules'],
      [SWORD_SIZE_REPAIR_FLAG]: update[`flags.osp-houserules.${SWORD_SIZE_REPAIR_FLAG}`],
    };
  });
  return value;
};

describe('sword size repair', () => {
  it('repairs canonical and custom sword carriers once across world, actors, and unlinked tokens', async () => {
    const scabbard = makeItem('Scabbard, Sword', 'container', 30);
    const frog = makeItem('Sword Frog', 'container', 2);
    const custom = makeItem('Sword Frog', 'container', 9, { custom: true });
    const baldric = makeItem('Baldric', 'container', 6, { custom: true });
    baldric.system.containerId = 'harness';
    baldric.system.slotCost = 1;
    baldric.system.contents = ['greatsword-id'];
    const beltLoop = makeItem('Belt Loop', 'container', 8, { custom: true });
    beltLoop.system.containerId = 'belt';
    beltLoop.system.slotCost = 2;
    beltLoop.system.contents = ['hand-axe-id'];
    const axeSling = makeItem('Axe Sling', 'container', 8);
    axeSling.system.containerId = 'harness';
    axeSling.system.contents = ['battle-axe-id'];
    const warhammerSling = makeItem('Warhammer Sling', 'container', 8);
    warhammerSling.system.containerId = 'harness';
    warhammerSling.system.contents = ['warhammer-id'];
    const weapon = makeItem('Longsword', 'weapon', 10);
    const greatsword = makeItem('Greatsword', 'weapon', 22);
    const zweihander = makeItem('Zweihander', 'weapon', 24);
    const actor = { id: 'actor', items: [frog, weapon, baldric, beltLoop, axeSling, warhammerSling, greatsword, zweihander] };
    const tokenActor = { id: 'token-actor', items: [custom] };
    const game = { user: { isGM: true }, items: [scabbard], actors: [actor],
      scenes: [{ tokens: [{ actor, actorLink: true }, { actor: tokenActor, actorLink: false }] }], packs: [] };
    const result = await repairSwordSizes({ gameRef: game });
    expect(result.repaired).toHaveLength(7);
    expect(scabbard.system.storedSize).toBe(2);
    expect(frog.system.storedSize).toBe(1);
    expect(custom.system.storedSize).toBe(1);
    expect(baldric.system.storedSize).toBe(3);
    expect(baldric.system.containerId).toBe('harness');
    expect(baldric.system.slotCost).toBe(1);
    expect(baldric.system.contents).toEqual(['greatsword-id']);
    expect(baldric.system.customField).toBe('keep');
    expect(baldric.flags['osp-houserules'][SWORD_SIZE_REPAIR_FLAG]).toEqual({ priorStoredSize: 6, repairedStoredSize: 3 });
    expect(beltLoop.system.storedSize).toBe(1);
    expect(beltLoop.system.containerId).toBe('belt');
    expect(beltLoop.system.slotCost).toBe(2);
    expect(beltLoop.system.contents).toEqual(['hand-axe-id']);
    expect(beltLoop.system.customField).toBe('keep');
    expect(beltLoop.flags['osp-houserules'][SWORD_SIZE_REPAIR_FLAG]).toEqual({ priorStoredSize: 8, repairedStoredSize: 1 });
    expect(axeSling.system.storedSize).toBe(3);
    expect(axeSling.system.containerId).toBe('harness');
    expect(axeSling.system.contents).toEqual(['battle-axe-id']);
    expect(warhammerSling.system.storedSize).toBe(3);
    expect(warhammerSling.system.containerId).toBe('harness');
    expect(warhammerSling.system.contents).toEqual(['warhammer-id']);
    expect(weapon.system.storedSize).toBe(10);
    expect(greatsword.system.storedSize).toBe(22);
    expect(zweihander.system.storedSize).toBe(24);
    expect(scabbard.system.customField).toBe('keep');
    expect((await repairSwordSizes({ gameRef: game })).repaired).toHaveLength(0);
    expect(frog.update).toHaveBeenCalledTimes(1);
    expect(baldric.update).toHaveBeenCalledTimes(1);
    expect(beltLoop.update).toHaveBeenCalledTimes(1);
    expect(axeSling.update).toHaveBeenCalledTimes(1);
    expect(warhammerSling.update).toHaveBeenCalledTimes(1);
  });

  it('repairs only the gear pack and restores its lock', async () => {
    const scabbard = makeItem('Scabbard, Sword', 'container', 30);
    const pack = { collection: 'osp-houserules.gear', documentName: 'Item', locked: true,
      getDocuments: vi.fn(async () => [scabbard]),
      configure: vi.fn(async ({ locked }) => { pack.locked = locked; }) };
    const weapons = { collection: 'osp-houserules.weapons', documentName: 'Item', locked: true,
      getDocuments: vi.fn() };
    const game = { user: { isGM: true }, items: [], actors: [], scenes: [], packs: [pack, weapons] };
    const result = await repairSwordSizes({ gameRef: game });
    expect(result.packs).toEqual(['osp-houserules.gear:Scabbard, Sword']);
    expect(pack.locked).toBe(true);
    expect(pack.configure).toHaveBeenNthCalledWith(1, { locked: false });
    expect(pack.configure).toHaveBeenLastCalledWith({ locked: true });
    expect(weapons.getDocuments).not.toHaveBeenCalled();
    expect((await repairSwordSizes({ gameRef: { ...game, user: { isGM: false } } })).skipped).toBe('not-gm');
  });

  it('restores a locked gear pack when an item update fails', async () => {
    const scabbard = makeItem('Scabbard, Sword', 'container', 30);
    scabbard.update = vi.fn(async () => { throw new Error('locked'); });
    const pack = { collection: 'osp-houserules.gear', documentName: 'Item', locked: true,
      getDocuments: vi.fn(async () => [scabbard]),
      configure: vi.fn(async ({ locked }) => { pack.locked = locked; }) };
    await repairSwordSizes({ gameRef: { user: { isGM: true }, items: [], actors: [], scenes: [], packs: [pack] } });
    expect(pack.locked).toBe(true);
    expect(pack.configure).toHaveBeenNthCalledWith(1, { locked: false });
    expect(pack.configure).toHaveBeenLastCalledWith({ locked: true });
  });

  it('yields canonical sword footprints without changing sword sizes', () => {
    const cases = [['Shortsword', 5, 8], ['Longsword', 10, 13], ['Bastard Sword', 12, 15]];
    for (const [name, swordSize, total] of cases) {
      const frog = { id: `${name}-frog`, type: 'container', system: { storedSize: 1, quantity: 1 } };
      const scabbard = { id: `${name}-scabbard`, type: 'container', system: { storedSize: 2, quantity: 1, containerId: frog.id } };
      const sword = { id: name, name, type: 'weapon', system: { storedSize: swordSize, quantity: 1, containerId: scabbard.id } };
      expect(storageFootprint(frog, [frog, scabbard, sword])).toBe(total);
      expect(sword.system.storedSize).toBe(swordSize);
    }
    const greatsword = { id: 'greatsword', name: 'Greatsword', type: 'weapon', system: { storedSize: 22, quantity: 1, containerId: 'greatsword-baldric' } };
    const greatswordBaldric = { id: 'greatsword-baldric', name: 'Baldric', type: 'container', system: { storedSize: 3, quantity: 1 } };
    expect(storageFootprint(greatswordBaldric, [greatswordBaldric, greatsword])).toBe(25);
    expect(greatsword.system.storedSize).toBe(22);
    const zweihander = { id: 'zweihander', name: 'Zweihander', type: 'weapon', system: { storedSize: 24, quantity: 1, containerId: 'zweihander-baldric' } };
    const zweihanderBaldric = { id: 'zweihander-baldric', name: 'Baldric', type: 'container', system: { storedSize: 3, quantity: 1 } };
    expect(storageFootprint(zweihanderBaldric, [zweihanderBaldric, zweihander])).toBe(27);
    expect(zweihander.system.storedSize).toBe(24);
  });

  it('yields axe footprints from the live catalogs without changing weapon sizes or belt slots', () => {
    const gearByName = new Map(gearCatalog.map(item => [item.name, item]));
    const weaponByName = new Map(weaponsCatalog.map(item => [item.name, item]));
    const cases = [
      ['Hand Axe', 'Belt Loop', 5],
      ['Light Hammer', 'Belt Loop', 5],
      ['Warhammer', 'Belt Loop', 9],
      ['Battle Axe', 'Axe Sling', 13],
      ['Battle Axe, 2-Handed', 'Axe Sling', 27],
      ['Warhammer', 'Warhammer Sling', 11],
    ];
    for (const [weaponName, carrierName, total] of cases) {
      const weaponCatalogItem = weaponByName.get(weaponName);
      const carrierCatalogItem = gearByName.get(carrierName);
      expect(weaponCatalogItem).toBeTruthy();
      expect(carrierCatalogItem).toBeTruthy();
      const carrier = { id: `${carrierName}-id`, name: carrierName, type: 'container', system: { ...carrierCatalogItem.system, quantity: 1 } };
      const weapon = { id: `${weaponName}-id`, name: weaponName, type: 'weapon', system: { ...weaponCatalogItem.system, quantity: 1, containerId: carrier.id } };
      expect(storageFootprint(carrier, [carrier, weapon])).toBe(total);
      expect(weapon.system.storedSize).toBe(weaponCatalogItem.system.storedSize);
    }
    expect(gearByName.get('Belt Loop').system.slotCost).toBe(2);
    expect(gearByName.get('Axe Sling').system.slotCost).toBeUndefined();
  });
});
