import { beforeEach, describe, expect, it, vi } from 'vitest';

let OspItem;
beforeEach(async () => {
  vi.stubGlobal('Item', class {
    static async createDocuments(data) { return data; }
    async _preCreate() { return undefined; }
    async _preUpdate() { return undefined; }
    prepareData() {}
  });
  ({ OspItem } = await import('./item.js'));
});

const actorWith = (items) => ({
  type: 'character',
  items,
});

const make = (id, name, type, system = {}) => ({ id, name, type, toObject: () => ({ id, name, type, system: { ...system } }), system: { equipped: false, tags: [], ...system } });

describe('OspItem hand-capacity document guards', () => {
  it('blocks direct equipping when two hands are already occupied', async () => {
    const sword = make('sword', 'Sword', 'weapon', { equipped: true });
    const wand = make('wand', 'Wand', 'item', { equipped: true, tags: ['wand'] });
    const flask = new OspItem();
    Object.assign(flask, make('flask', 'Oil Flask', 'weapon', { equipped: false, tags: ['consumable'] }));
    flask.parent = actorWith([sword, wand]);
    expect(await flask._preUpdate({ system: { equipped: true } }, {}, {})).toBe(false);
  });

  it('allows reducing an already-overfull legacy state', async () => {
    const sword = make('sword', 'Sword', 'weapon', { equipped: true });
    const wand = make('wand', 'Wand', 'item', { equipped: true, tags: ['wand'] });
    const flask = new OspItem();
    Object.assign(flask, make('flask', 'Oil Flask', 'weapon', { equipped: true, tags: ['consumable'] }));
    flask.parent = actorWith([sword, wand, flask]);
    expect(await flask._preUpdate({ system: { equipped: false } }, {}, {})).toBeUndefined();
  });

  it('rejects an over-capacity equipped batch before creation', async () => {
    const actor = actorWith([]);
    await expect(OspItem.createDocuments([
      { name: 'Sword', type: 'weapon', system: { equipped: true, tags: [] } },
      { name: 'Wand', type: 'item', system: { equipped: true, tags: ['wand'] } },
      { name: 'Oil Flask', type: 'weapon', system: { equipped: true, tags: ['consumable'] } },
    ], { parent: actor })).rejects.toThrow(/hand capacity/);
  });

  it('allows a two-hand equipped batch', async () => {
    const actor = actorWith([]);
    await expect(OspItem.createDocuments([
      { name: 'Sword', type: 'weapon', system: { equipped: true, tags: [] } },
      { name: 'Wand', type: 'item', system: { equipped: true, tags: ['wand'] } },
    ], { parent: actor })).resolves.toHaveLength(2);
  });
});
