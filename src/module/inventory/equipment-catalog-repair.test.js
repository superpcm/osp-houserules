import { afterEach, describe, expect, it, vi } from 'vitest';
import { repairEquipmentCatalog, REPAIR_FLAG } from './equipment-catalog-repair.js';

afterEach(() => vi.restoreAllMocks());

describe('equipment catalog repair', () => {
  it('does not permit player writes', async () => {
    const create = vi.fn();
    const result = await repairEquipmentCatalog({
      gameRef: { user: { id: 'player', isGM: false }, users: { activeGM: { id: 'gm-1' } }, items: [], actors: [], folders: [] },
      itemClass: { create },
    });
    expect(result.skipped).toBe('not-gm');
    expect(create).not.toHaveBeenCalled();
  });

  it('lets another GM repair fields without creating duplicate world entries', async () => {
    const acid = { name: 'Acid', type: 'item', system: { cost: 0, unitWeight: 0, storedSize: 1 }, flags: {}, update: vi.fn() };
    const create = vi.fn();
    const result = await repairEquipmentCatalog({ gameRef: { user: { id: 'gm-2', isGM: true }, users: { activeGM: { id: 'gm-1' } }, items: [], actors: [{ items: [acid] }] }, itemClass: { create } });
    expect(result.repaired).toEqual(['Acid']);
    expect(acid.update).toHaveBeenCalledWith(expect.objectContaining({ system: { cost: 25, unitWeight: 1, storedSize: 0.5 } }));
    expect(create).not.toHaveBeenCalled();
  });

  it('repairs only requested fields and preserves actor inventory state', async () => {
    const shovel = { name: 'Shovel', type: 'item', system: { cost: 0, unitWeight: 0, storedSize: 0, quantity: 4, containerId: 'pack' }, flags: {}, update: vi.fn(async update => {
      Object.assign(shovel.system, update.system);
      const receipt = update[`flags.osp-houserules.${REPAIR_FLAG}`];
      shovel.flags['osp-houserules'] = { ...(shovel.flags['osp-houserules'] ?? {}), [REPAIR_FLAG]: receipt };
    }) };
    const acid = { name: 'Acid', type: 'item', system: { cost: 0, unitWeight: 0, storedSize: 0, quantity: 2 }, flags: { 'osp-houserules': { custom: true } }, update: vi.fn() };
    const falchion = { name: 'Falchion', type: 'weapon', system: { cost: 15, unitWeight: 6, storedSize: 12 }, flags: {}, update: vi.fn() };
    const gameRef = { user: { id: 'gm', isGM: true }, users: { activeGM: { id: 'gm' } }, items: [falchion], actors: [{ items: [shovel, acid] }], folders: [] };
    const result = await repairEquipmentCatalog({ gameRef, itemClass: { create: vi.fn() } });
    expect(result.repaired).toEqual(['Shovel']);
    expect(shovel.update).toHaveBeenCalledWith(expect.objectContaining({ system: { cost: 1, unitWeight: 5, storedSize: 6 } }));
    expect(shovel.system.quantity).toBe(4);
    expect(acid.update).not.toHaveBeenCalled();
    expect(falchion.update).not.toHaveBeenCalled();
  });

  it('creates missing world entries once in existing folders', async () => {
    const worldItems = [];
    const create = vi.fn(async data => { const item = { ...data, id: data.name }; worldItems.push(item); return item; });
    const gameRef = { user: { id: 'gm', isGM: true }, users: { activeGM: { id: 'gm' } }, items: worldItems, actors: [], folders: [{ type: 'Item', name: 'Weapons', id: 'weapons' }, { type: 'Item', name: 'Adventuring Gear', id: 'gear' }] };
    const result = await repairEquipmentCatalog({ gameRef, itemClass: { create } });
    expect(result.created).toHaveLength(3);
    expect(create.mock.calls.map(([data]) => [data.name, data.folder])).toEqual(expect.arrayContaining([['Falchion', 'weapons'], ['Acid', 'gear'], ['Shovel', 'gear']]));
    expect(worldItems.find(item => item.name === 'Acid').flags['osp-houserules'][REPAIR_FLAG].created).toBe(true);
    const second = await repairEquipmentCatalog({ gameRef, itemClass: { create } });
    expect(second.created).toHaveLength(0);
  });

  it('is idempotent after recording the repair marker', async () => {
    const shovel = { name: 'Shovel', type: 'item', system: { cost: 0, unitWeight: 0, storedSize: 0 }, flags: { 'osp-houserules': { other: true } }, update: vi.fn(async update => {
      Object.assign(shovel.system, update.system);
      const receipt = update[`flags.osp-houserules.${REPAIR_FLAG}`];
      shovel.flags['osp-houserules'] = { ...(shovel.flags['osp-houserules'] ?? {}), [REPAIR_FLAG]: receipt };
    }) };
    const gameRef = { user: { id: 'gm', isGM: true }, users: { activeGM: { id: 'gm' } }, items: [shovel], actors: [], folders: [] };
    const itemClass = { create: vi.fn() };
    const result = await repairEquipmentCatalog({ gameRef, itemClass });
    shovel.system.cost = 7;
    const second = await repairEquipmentCatalog({ gameRef, itemClass });
    expect(shovel.system.cost).toBe(7);
    expect(shovel.update).toHaveBeenCalledTimes(1);
    expect(itemClass.create).toHaveBeenCalledTimes(4);
    expect(result.repaired).toEqual(['Shovel']);
    expect(second.repaired).toEqual([]);
  });
});
