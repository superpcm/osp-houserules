import { describe, expect, it } from 'vitest';
import { repairEquipmentSizes, STANDARD_RATIONS_DESCRIPTION } from './equipment-size-repair.js';

const clone = value => structuredClone(value);
function item(id, name, type, storedSize, extra = {}) {
  const data = { _id: id, name, type, system: { storedSize, quantity: 1, description: extra.description ?? '', containerId: extra.containerId ?? null, ...extra } };
  data.flags = extra.flags ?? {};
  return { ...data, id, uuid: `Item.${id}`, get flags() { return data.flags; }, toObject: () => clone(data), update: async changes => {
    for (const [path, value] of Object.entries(changes)) {
      const parts = path.split('.'); let target = data;
      while (parts.length > 1) target = target[parts.shift()] ??= {};
      if (parts[0] === 'system' && typeof value === 'object') target.system = { ...target.system, ...clone(value) };
      else target[parts[0]] = clone(value);
    }
    return this;
  }, get system() { return data.system; }, get name() { return data.name; }, get type() { return data.type; } };
}
function actor(id, items) {
  const actor = { id, uuid: `Actor.${id}`, name: id, items, isOwner: true };
  return actor;
}
const collection = entries => ({ contents: entries, [Symbol.iterator]: function* () { yield* entries; } });

describe('equipment size repair', () => {
  it('repairs canonical and existing equipment while preserving fields and idempotently skips receipts', async () => {
    const small = item('small', 'Belt Pouch (S)', 'container', 2, { capacity: 2, containerId: 'belt' });
    const winter = item('winter', 'Clothes, Winter', 'clothing', 0, { equipped: true });
    const standard = item('standard', 'Rations, Standard', 'item', 4, { description: 'Fresh, unpreserved food suitable for shorter trips. Tastier but bulkier than iron rations. Cannot be carried indefinitely without spoilage unless kept cool or magically preserved. Common among caravan travelers or short expeditions. One inventory unit is a seven-day bundle: quantity 1, storage size 4 for the complete bundle. Weight and price are per bundle.' });
    const gameRef = { user: { isGM: true }, items: collection([]), actors: collection([actor('a', collection([small, winter, standard]))]), scenes: collection([]), packs: collection([]) };
    const first = await repairEquipmentSizes({ gameRef });
    expect(first.repaired).toHaveLength(3);
    expect(small.system).toMatchObject({ storedSize: 1, capacity: 2, containerId: 'belt' });
    expect(winter.system).toMatchObject({ storedSize: 8, equipped: true });
    expect(standard.system).toMatchObject({ storedSize: 6, description: STANDARD_RATIONS_DESCRIPTION });
    const second = await repairEquipmentSizes({ gameRef });
    expect(second.repaired).toHaveLength(0);
  });

  it('repairs all target types and restores a locked pack after updates', async () => {
    const packItems = [item('chain', 'Barding, Chain mail', 'item', 20), item('tools', "Thieves' Tools", 'item', 1)];
    let configureCalls = 0;
    const pack = { documentName: 'Item', collection: 'osp-houserules.tack', locked: true, getDocuments: async () => packItems, configure: async ({ locked }) => { configureCalls++; pack.locked = locked; } };
    const gameRef = { user: { isGM: true }, items: collection([]), actors: collection([]), scenes: collection([]), packs: collection([pack]) };
    const result = await repairEquipmentSizes({ gameRef });
    expect(result.packs).toHaveLength(2);
    expect(packItems.map(i => i.system.storedSize)).toEqual([40, 2]);
    expect(pack.locked).toBe(true); expect(configureCalls).toBe(2);
  });

  it('restores a locked pack when an item update throws and leaves the next item untouched', async () => {
    const failing = item('failing', 'Barding, Chain mail', 'item', 20);
    failing.update = async () => { throw new Error('injected item update failure'); };
    const untouched = item('untouched', "Thieves' Tools", 'item', 1);
    let configureCalls = 0;
    const pack = { documentName: 'Item', collection: 'osp-houserules.tack', locked: true, getDocuments: async () => [failing, untouched], configure: async ({ locked }) => { configureCalls++; pack.locked = locked; } };
    const gameRef = { user: { isGM: true }, items: collection([]), actors: collection([]), scenes: collection([]), packs: collection([pack]) };
    await expect(repairEquipmentSizes({ gameRef })).rejects.toThrow('injected item update failure');
    expect(pack.locked).toBe(true);
    expect(configureCalls).toBe(2);
    expect(untouched.system.storedSize).toBe(1);
  });

  it('does nothing for non-GMs', async () => {
    const gameRef = { user: { isGM: false }, items: collection([]), actors: collection([]), scenes: collection([]), packs: collection([]) };
    expect((await repairEquipmentSizes({ gameRef })).skipped).toBe('not-gm');
  });
});
