import { describe, expect, it, vi } from 'vitest';
import { repairShovelLashing, SHOVEL_LASHING_FLAG } from './shovel-lashing-repair.js';

function shovel() {
  const item = { id: 'shovel', name: 'Shovel', type: 'item', system: { lashable: false, slotCost: 0, quantity: 2, containerId: 'pack', unitWeight: 5 }, flags: { 'osp-houserules': { equipmentCatalogRepairV1: true } } };
  item.update = vi.fn(async update => {
    for (const [path, value] of Object.entries(update)) {
      const parts = path.split('.');
      let target = item;
      for (const part of parts.slice(0, -1)) target = target[part] ??= {};
      target[parts.at(-1)] = value;
    }
  });
  return item;
}

describe('Shovel lashing repair', () => {
  it('repairs old actor and world copies once without changing their placement or quantity', async () => {
    const actorItem = shovel(), worldItem = shovel();
    const game = { user: { isGM: true }, items: [worldItem], actors: [{ items: [actorItem] }] };
    await repairShovelLashing(game);
    expect(actorItem.system).toEqual({ lashable: true, slotCost: 1, quantity: 2, containerId: 'pack', unitWeight: 5 });
    expect(worldItem.system.lashable).toBe(true);
    expect(actorItem.flags['osp-houserules'][SHOVEL_LASHING_FLAG].prior).toEqual({ lashable: false, slotCost: 0 });
    actorItem.system.slotCost = 2;
    await repairShovelLashing(game);
    expect(actorItem.system.slotCost).toBe(2);
    expect(actorItem.update).toHaveBeenCalledTimes(1);
  });
  it('preserves custom items and does not allow player writes', async () => {
    const item = shovel();
    await repairShovelLashing({ user: { isGM: false }, items: [item] });
    item.flags['osp-houserules'].custom = true;
    await repairShovelLashing({ user: { isGM: true }, items: [item] });
    expect(item.update).not.toHaveBeenCalled();
  });
});
