import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

let ItemHandler;
let sequence = 0;

beforeAll(async () => {
  globalThis.ui = { notifications: { error: () => {}, info: () => {}, warn: () => {} } };
  globalThis.game = { user: { isGM: false }, scenes: { active: null }, settings: { get: () => false } };
  globalThis.foundry = { utils: { randomID: () => `generated-${++sequence}`, duplicate: value => structuredClone(value) } };
  globalThis.Application = class {};
  globalThis.Dialog = class {};
  globalThis.TextEditor = { enrichHTML: async value => value };
  ({ ItemHandler } = await import('./item-handler.js'));
});

const entry = (id, name, type, system = {}) => ({
  _id: id, name, type, img: '',
  system: { quantity: 1, storedSize: 1, tags: [], containerId: null, equipped: false, lashed: false, ...system },
});

function makeActor(entries, type = 'character') {
  const list = [];
  const actor = {
    id: 'actor', type, isOwner: true, system: { class: 'fighter', attributes: { str: { value: 18 } } },
    get items() {
      return {
        contents: list,
        get: id => list.find(item => item.id === id),
        find: fn => list.find(fn),
        filter: fn => list.filter(fn),
        some: fn => list.some(fn),
        reduce: (fn, initial) => list.reduce(fn, initial),
      };
    },
    createEmbeddedDocuments: async (_type, data) => data.map(value => add({ ...structuredClone(value), _id: value._id || `generated-${++sequence}` })),
  };
  function add(data) {
    const live = {
      actor, id: data._id,
      get name() { return data.name; }, get type() { return data.type; }, get system() { return data.system; },
      get img() { return data.img; }, toObject: () => structuredClone(data),
      update: async changes => { for (const [path, value] of Object.entries(changes)) { const parts = path.split('.'); let target = data; while (parts.length > 1) target = target[parts.shift()]; target[parts[0]] = value; } return live; },
      delete: async () => { list.splice(list.indexOf(live), 1); },
    };
    list.push(live); return live;
  }
  entries.forEach(value => add(structuredClone(value)));
  actor.sheet = { render: () => {} };
  return actor;
}

const eventFor = item => ({ preventDefault: () => {}, stopPropagation: () => {}, currentTarget: item });
const handlerFor = (actor, item) => {
  const handler = new ItemHandler(null, actor, { loadProfileData: async () => ({ classes: [], races: [] }) });
  handler.getItemFromEvent = () => item;
  handler._checkWeaponPermission = async () => ({ allowed: true });
  handler._canEquipWeapon = () => ({ canEquip: true, reason: null });
  return handler;
};

const capacityHandlerFor = (actor, item) => {
  const handler = new ItemHandler(null, actor, { loadProfileData: async () => ({ classes: [], races: [] }) });
  handler.getItemFromEvent = () => item;
  handler._checkWeaponPermission = async () => ({ allowed: true });
  handler._getClassArmorPermissions = async () => ['Any'];
  return handler;
};

beforeEach(() => { sequence = 0; });

describe('BR20 ItemHandler placement paths', () => {
  it('equips and stows a sword through its scabbard', async () => {
    const actor = makeActor([
      entry('scabbard', 'Scabbard, Sword', 'container', { tags: ['scabbard'], capacity: 1 }),
      entry('sword', 'Longsword', 'weapon', { tags: ['sword'], containerId: 'scabbard' }),
      entry('bag', 'Backpack', 'container', { capacity: 10 }),
    ]);
    const sword = actor.items.get('sword');
    const handler = handlerFor(actor, sword);
    await handler.onItemToggle(eventFor(sword));
    expect(sword.system.equipped).toBe(true);
    await handler.onItemToggle(eventFor(sword));
    expect(sword.system.equipped).toBe(false);
    expect(sword.system.containerId).toBe('scabbard');
  });

  it('splits consumable ammunition when readied and merges it when stowed', async () => {
    const actor = makeActor([
      entry('bag', 'Backpack', 'container', { capacity: 20 }),
      entry('oil', 'Oil Flask', 'weapon', { quantity: { value: 3 }, tags: ['consumable'], containerId: 'bag' }),
    ]);
    const oil = actor.items.get('oil');
    const handler = handlerFor(actor, oil);
    await handler.onItemToggle(eventFor(oil));
    expect(oil.system.quantity).toBe(2);
    const readied = actor.items.contents.find(item => item.name === 'Oil Flask' && item.id !== 'oil');
    expect(readied.system.quantity).toBe(1);
    await handlerFor(actor, readied).onItemToggle(eventFor(readied));
    expect(actor.items.contents.find(item => item.id === 'oil').system.quantity).toBe(3);
  });

  it('attaches belt gear and equips a sling through ItemHandler', async () => {
    const actor = makeActor([
      entry('belt', 'Belt', 'clothing', { equipped: true, lashSlots: 3 }),
      entry('pouch', 'Pouch', 'container', { lashable: true, slotCost: 1 }),
      entry('sling', 'Baldric', 'container', { tags: ['sling'] }),
    ]);
    const pouch = actor.items.get('pouch');
    await handlerFor(actor, pouch).onItemToggle(eventFor(pouch));
    expect(pouch.system.lashed).toBe(true);
    expect(pouch.system.containerId).toBe('belt');
    const sling = actor.items.get('sling');
    await handlerFor(actor, sling).onItemToggle(eventFor(sling));
    expect(sling.system.equipped).toBe(true);
  });

  it('chooses a compatible container even when a blocked container has more capacity', () => {
    const actor = makeActor([
      entry('blocked', 'Large Chest', 'container', { capacity: 100, blockedTypes: ['weapon'] }),
      entry('compatible', 'Weapon Locker', 'container', { capacity: 4, allowedTypes: ['weapon'] }),
    ]);
    const weapon = entry('axe', 'Hand Axe', 'weapon', { storedSize: 1, tags: ['melee'] });
    const liveWeapon = makeActor([weapon]).items.get('axe');
    const handler = handlerFor(actor, liveWeapon);
    expect(handler._findContainerWithSpace(liveWeapon).id).toBe('compatible');
  });

  it('rejects a consumable merge into full storage without changing legacy quantity', async () => {
    const actor = makeActor([
      entry('bag', 'Backpack', 'container', { capacity: 2 }),
      entry('stored', 'Oil Flask', 'weapon', { quantity: 2, storedSize: 1, tags: ['consumable'], containerId: 'bag' }),
      entry('readied', 'Oil Flask', 'weapon', { quantity: { value: 3 }, storedSize: 1, tags: ['consumable'], equipped: true }),
    ]);
    const readied = actor.items.get('readied');
    const handler = handlerFor(actor, readied);
    let noStorageShown = false;
    handler._showNoStorageDialog = async () => { noStorageShown = true; };
    await handler.onItemToggle(eventFor(readied));
    expect(noStorageShown).toBe(true);
    expect(actor.items.get('stored').system.quantity).toBe(2);
    expect(actor.items.get('readied').system.quantity).toEqual({ value: 3 });
  });

  it('requires the weapon slot cost and an equipped clothing lash mount', () => {
    const actor = makeActor([
      entry('belt', 'Belt', 'clothing', { lashSlots: 2, equipped: false }),
      entry('pack', 'Pack Frame', 'container', { lashSlots: 2 }),
      entry('load', 'Tool', 'item', { containerId: 'pack', lashed: true, slotCost: 2 }),
    ]);
    const weapon = entry('axe', 'Hand Axe', 'weapon', { slotCost: 1, size: 'M' });
    const liveWeapon = makeActor([weapon]).items.get('axe');
    const handler = handlerFor(actor, liveWeapon);
    expect(handler._findStorageForWeapon(liveWeapon)).toBeNull();
    actor.items.get('belt').system.equipped = true;
    expect(handler._findStorageForWeapon(liveWeapon).container.id).toBe('belt');
  });

  it('blocks a consumable ready action when sword and wand use both hands', async () => {
    const actor = makeActor([
      entry('sword', 'Sword', 'weapon', { equipped: true }),
      entry('wand', 'Wand', 'item', { equipped: true, tags: ['wand'] }),
      entry('oil', 'Oil Flask', 'weapon', { quantity: { value: 3 }, tags: ['consumable'], containerId: 'bag' }),
    ]);
    const oil = actor.items.get('oil');
    const before = actor.items.contents.length;
    const handler = capacityHandlerFor(actor, oil);
    handler._showEquipWeaponDialog = async () => false;
    await handler.onItemToggle(eventFor(oil));
    expect(actor.items.contents.length).toBe(before);
    expect(oil.system.quantity).toEqual({ value: 3 });
    expect(oil.system.equipped).toBe(false);
  });

  it('blocks a generic wand or shield when both hands are occupied', async () => {
    const actor = makeActor([
      entry('sword', 'Sword', 'weapon', { equipped: true }),
      entry('dagger', 'Dagger', 'weapon', { equipped: true, size: 'S' }),
      entry('wand', 'Wand', 'item', { tags: ['wand'] }),
      entry('shield', 'Shield', 'armor', { type: 'shield' }),
    ]);
    const handler = capacityHandlerFor(actor, actor.items.get('wand'));
    handler._showEquipWeaponDialog = async () => false;
    await handler.onItemToggle(eventFor(actor.items.get('wand')));
    expect(actor.items.get('wand').system.equipped).toBe(false);
    const shield = actor.items.get('shield');
    const shieldHandler = capacityHandlerFor(actor, shield);
    shieldHandler._showEquipShieldDialog = async () => false;
    await shieldHandler.onItemToggle(eventFor(shield));
    expect(shield.system.equipped).toBe(false);
  });

  it('allows sword plus wand and ignores worn clothing for hand capacity', async () => {
    const actor = makeActor([
      entry('sword', 'Sword', 'weapon', { equipped: true }),
      entry('wand', 'Wand', 'item', { tags: ['wand'] }),
      entry('cloak', 'Cloak', 'clothing', { equipped: true }),
    ]);
    const wand = actor.items.get('wand');
    await capacityHandlerFor(actor, wand).onItemToggle(eventFor(wand));
    expect(wand.system.equipped).toBe(true);
  });
});
