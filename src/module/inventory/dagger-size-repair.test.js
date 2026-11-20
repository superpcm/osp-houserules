import { describe, expect, it, vi } from 'vitest';
import { DAGGER_SIZE_REPAIR_FLAG, repairDaggerSizes } from './dagger-size-repair.js';
import { checkWithdrawTarget } from './container-capacity.js';

const makeItem = (name, type, storedSize, flags = {}) => {
  const value = { id: `${name}-${Math.random()}`, uuid: undefined, name, type,
    system: { storedSize, containerId: 'clothes', quantity: 1, equipped: true, customField: 'keep' },
    flags: { 'osp-houserules': flags } };
  value.update = vi.fn(async update => {
    value.system = { ...value.system, ...update.system };
    value.flags['osp-houserules'] = { ...value.flags['osp-houserules'], [DAGGER_SIZE_REPAIR_FLAG]: update[`flags.osp-houserules.${DAGGER_SIZE_REPAIR_FLAG}`] };
  });
  return value;
};

describe('dagger size repair', () => {
  it('accepts canonical dagger plus sheath in three bulk units of clothes', () => {
    const clothes = { id: 'clothes', name: "Adventurer's Clothes", type: 'container', system: { capacity: 3 } };
    const dagger = makeItem('Dagger', 'weapon', 2);
    const sheath = makeItem('Scabbard, Dagger', 'container', 0.5);
    sheath.system.containerId = clothes.id;
    dagger.system.containerId = sheath.id;
    expect(checkWithdrawTarget(dagger, clothes, [clothes, sheath, dagger]).allowed).toBe(true);
  });

  it('repairs world, actor, and unlinked token items once while preserving item data', async () => {
    const dagger = makeItem('Dagger', 'weapon', 3);
    const plusOne = makeItem('Dagger +1', 'weapon', 3);
    const sheath = makeItem('Scabbard, Dagger', 'container', 2);
    const custom = makeItem('Dagger', 'weapon', 4, { custom: true });
    const misericorde = makeItem('Misericorde', 'weapon', 3);
    const actor = { id: 'actor', items: [plusOne, sheath] };
    const duplicateActor = { id: 'actor', items: [plusOne, sheath] };
    const tokenActor = { id: 'token-actor', items: [custom] };
    const game = { user: { isGM: true }, items: [dagger, misericorde], actors: [actor],
      scenes: [{ tokens: [{ actor: duplicateActor, actorLink: true }, { actor: tokenActor, actorLink: false }] }], packs: [] };

    const result = await repairDaggerSizes({ gameRef: game });
    expect(result.repaired).toHaveLength(4);
    expect(dagger.system.storedSize).toBe(2);
    expect(plusOne.system.storedSize).toBe(2);
    expect(sheath.system.storedSize).toBe(0.5);
    expect(custom.system.storedSize).toBe(2);
    expect(misericorde.system.storedSize).toBe(3);
    expect(dagger.system.containerId).toBe('clothes');
    expect(dagger.system.customField).toBe('keep');
    expect((await repairDaggerSizes({ gameRef: game })).repaired).toHaveLength(0);
    expect(dagger.update).toHaveBeenCalledTimes(1);
  });

  it('is GM-only and restores locked target pack locks', async () => {
    const dagger = makeItem('Dagger -1', 'weapon', 3);
    const pack = { collection: 'osp-houserules.weapons', documentName: 'Item', locked: true,
      getDocuments: vi.fn(async () => [dagger]), configure: vi.fn(async ({ locked }) => { pack.locked = locked; }) };
    const ignored = { collection: 'other.pack', documentName: 'Item', locked: true, getDocuments: vi.fn() };
    const game = { user: { isGM: true }, items: [], actors: [], scenes: [], packs: [pack, ignored] };
    const result = await repairDaggerSizes({ gameRef: game });
    expect(result.packs).toEqual(['osp-houserules.weapons:Dagger -1']);
    expect(pack.locked).toBe(true);
    expect(pack.configure).toHaveBeenCalledWith({ locked: false });
    expect(pack.configure).toHaveBeenLastCalledWith({ locked: true });
    expect(ignored.getDocuments).not.toHaveBeenCalled();
    expect((await repairDaggerSizes({ gameRef: { ...game, user: { isGM: false } } })).skipped).toBe('not-gm');
  });
});
