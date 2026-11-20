import { describe, expect, it } from 'vitest';
import { repairWinterClothesProfile, WINTER_CLOTHES_DESCRIPTION, WINTER_CLOTHES_PROFILE_FLAG } from './winter-clothes-profile.js';

const clone = value => structuredClone(value);
function item(id, name, type = 'clothing', extra = {}) {
  const data = { _id: id, name, type, system: { description: 'old description', capacity: extra.capacity, storedSize: 8, cost: 7, weight: 2, quantity: 1, ...extra.system }, flags: extra.flags ?? {} };
  return { ...data, id, uuid: `Item.${id}`, get flags() { return data.flags; }, get name() { return data.name; }, get type() { return data.type; }, get system() { return data.system; }, toObject: () => clone(data), update: async changes => {
    for (const [path, value] of Object.entries(changes)) {
      const parts = path.split('.'); let target = data;
      while (parts.length > 1) target = target[parts.shift()] ??= {};
      if (parts[0] === 'system' && typeof value === 'object') target.system = { ...target.system, ...clone(value) };
      else target[parts[0]] = clone(value);
    }
    return this;
  } };
}
const collection = entries => ({ contents: entries, [Symbol.iterator]: function* () { yield* entries; } });
const actor = (id, items) => ({ id, uuid: `Actor.${id}`, items });
const game = ({ items = [], actors = [], scenes = [], packs = [], isGM = true } = {}) => ({ user: { isGM }, items: collection(items), actors: collection(actors), scenes: collection(scenes), packs: collection(packs) });

describe('winter clothes profile', () => {
  it('updates legacy, canonical, and magic-suffixed names across world, actors, tokens, and approved packs', async () => {
    const world = item('world', 'Winter Clothes', 'clothing', { capacity: undefined });
    const actorItem = item('actor-item', 'Clothes, Winter', 'clothing', { capacity: 1 });
    const tokenItem = item('token-item', 'Winter Clothes +1', 'clothing', { capacity: 2 });
    const wrongType = item('wrong', 'Winter Clothes', 'item', { capacity: 4 });
    const packItem = item('pack-item', 'Clothes, Winter -2', 'clothing', { capacity: undefined });
    const ignoredItem = item('ignored', 'Winter Clothes', 'clothing');
    const ignoredPack = { documentName: 'Actor', collection: 'osp-houserules.clothing', getDocuments: async () => [ignoredItem] };
    let configureCalls = 0;
    const pack = { documentName: 'Item', collection: 'osp-houserules.clothing', locked: true, getDocuments: async () => [packItem], configure: async ({ locked }) => { configureCalls++; pack.locked = locked; } };
    const tokenActor = actor('token-actor', collection([tokenItem]));
    const g = game({ items: [world, wrongType], actors: [actor('a', collection([actorItem])), tokenActor], scenes: [{ tokens: collection([{ actorLink: false, actor: tokenActor }]) }], packs: [pack, ignoredPack] });
    const result = await repairWinterClothesProfile({ gameRef: g });
    expect(result.count).toBe(4);
    expect(result.updated).toHaveLength(4);
    expect(result.packs).toEqual(['osp-houserules.clothing:Clothes, Winter -2']);
    expect(pack.locked).toBe(true); expect(configureCalls).toBe(2);
    for (const target of [world, actorItem, tokenItem, packItem]) {
      expect(target.name).toMatch(/^Clothes, Winter(?: [+-]\d+)?$/);
      expect(target.system).toMatchObject({ description: WINTER_CLOTHES_DESCRIPTION, capacity: 3, storedSize: 8, cost: 7, weight: 2, quantity: 1 });
      expect(target.flags['osp-houserules'][WINTER_CLOTHES_PROFILE_FLAG]).toMatchObject({ version: 1, priorName: expect.any(String), priorDescription: 'old description' });
    }
    expect(world.flags['osp-houserules'][WINTER_CLOTHES_PROFILE_FLAG].priorCapacity).toBeNull();
    expect(actorItem.flags['osp-houserules'][WINTER_CLOTHES_PROFILE_FLAG].priorCapacity).toBe(1);
    expect(wrongType.name).toBe('Winter Clothes');
  });

  it('is idempotent and preserves later customization', async () => {
    const target = item('target', 'Winter Clothes');
    const g = game({ items: [target] });
    const first = await repairWinterClothesProfile({ gameRef: g });
    target.system.description = 'custom description'; target.system.capacity = 99;
    const second = await repairWinterClothesProfile({ gameRef: g });
    expect(first.count).toBe(1); expect(second.count).toBe(0);
    expect(target.system).toMatchObject({ description: 'custom description', capacity: 99 });
  });

  it('does nothing for non-GMs', async () => {
    const target = item('target', 'Winter Clothes');
    const result = await repairWinterClothesProfile({ gameRef: game({ items: [target], isGM: false }) });
    expect(result.skipped).toBe('not-gm'); expect(target.name).toBe('Winter Clothes');
  });
});
