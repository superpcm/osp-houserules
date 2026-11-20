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
        [Symbol.iterator]: function* () { yield* list; },
        get: id => list.find(item => item.id === id),
        find: fn => list.find(fn),
        filter: fn => list.filter(fn),
        some: fn => list.some(fn),
        reduce: (fn, initial) => list.reduce(fn, initial),
      };
    },
    createEmbeddedDocuments: async (_type, data) => data.map(value => add({ ...structuredClone(value), _id: value._id || `generated-${++sequence}` })),
    updateEmbeddedDocuments: async (_type, updates) => Promise.all(updates.map(async update => {
      const item = list.find(candidate => candidate.id === update._id);
      if (!item) throw new Error(`Unknown item ${update._id}`);
      const changes = { ...update };
      delete changes._id;
      return item.update(changes);
    })),
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

  it('attaches a legacy Coin Purse to a full belt without disturbing its contents', async () => {
    const actor = makeActor([
      entry('belt', 'Belt', 'clothing', { equipped: true, lashSlots: 2 }),
      entry('pouch-a', 'Belt Pouch (S)', 'container', { lashable: true, slotCost: 1, containerId: 'belt', lashed: true }),
      entry('pouch-b', 'Belt Pouch (S)', 'container', { lashable: true, slotCost: 1, containerId: 'belt', lashed: true }),
      entry('purse', 'Coin Purse', 'container', { lashable: false, slotCost: 1, capacity: 4 }),
      entry('coins', 'Silver Coins', 'coin', { quantity: 10, containerId: 'purse' }),
    ]);
    const purse = actor.items.get('purse');
    await handlerFor(actor, purse).onItemToggle(eventFor(purse));
    expect(purse.system).toMatchObject({ lashed: true, containerId: 'belt', slotCost: 1 });
    expect(actor.items.get('coins').system).toMatchObject({ quantity: 10, containerId: 'purse' });
  });

  it('lashes legacy helmets to any container with an available lash slot', async () => {
    const actor = makeActor([
      entry('saddle', 'Saddle', 'container', { lashSlots: 2 }),
      entry('helmet', 'Helmet', 'armor', { type: 'helmet', lashable: false, equipped: true }),
    ]);
    const helmet = actor.items.get('helmet');
    await handlerFor(actor, helmet).onItemToggle(eventFor(helmet));
    expect(helmet.system).toMatchObject({ equipped: false, lashed: true, containerId: 'saddle' });
  });

  it('uses the lash control for a legacy helmet and skips containers without enough slots', async () => {
    const actor = makeActor([
      entry('full', 'Saddle', 'container', { lashSlots: 2 }),
      entry('rope', 'Rope', 'item', { containerId: 'full', lashed: true }),
      entry('outer', 'Backpack', 'container', { capacity: 20 }),
      entry('host', 'Pack Frame', 'container', { containerId: 'outer', lashSlots: 2 }),
      entry('helmet', 'Great helm', 'armor', { type: 'helmet', lashable: false, slotCost: 2 }),
    ]);
    const helmet = actor.items.get('helmet');
    await handlerFor(actor, helmet).onItemLashToggle(eventFor(helmet));
    expect(helmet.system).toMatchObject({ lashed: true, containerId: 'host', equipped: false });
    await actor.items.get('host').update({ 'system.lashSlots': 1 });
    await helmet.update({ 'system.lashed': false, 'system.containerId': null });
    await handlerFor(actor, helmet).onItemLashToggle(eventFor(helmet));
    expect(helmet.system).toMatchObject({ lashed: false, containerId: null });
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

  it('stows an equipped sling in a roomy Backpack when toggled off', async () => {
    const actor = makeActor([
      entry('pack', 'Backpack', 'container', { capacity: 10 }),
      entry('sling', 'Sling', 'weapon', { equipped: true, storedSize: 0.25, tags: ['missile'] }),
    ]);
    const sling = actor.items.get('sling');
    await handlerFor(actor, sling).onItemToggle(eventFor(sling));
    expect(sling.system).toMatchObject({ equipped: false, containerId: 'pack', lashed: false, storedSize: 0.25 });
  });

  it('uses positive-capacity worn clothing when the Backpack has no room', async () => {
    const actor = makeActor([
      entry('pack', 'Backpack', 'container', { capacity: 0.25 }),
      entry('load', 'Rope', 'item', { containerId: 'pack', storedSize: 0.25 }),
      entry('clothes', "Clothes, Adventurer's", 'clothing', { equipped: true, capacity: 2 }),
      entry('sling', 'Sling', 'weapon', { equipped: true, storedSize: 0.25, tags: ['missile'] }),
    ]);
    const sling = actor.items.get('sling');
    await handlerFor(actor, sling).onItemToggle(eventFor(sling));
    expect(sling.system).toMatchObject({ equipped: false, containerId: 'clothes', lashed: false, storedSize: 0.25 });
  });

  it('shows the no-storage path when all internal hosts reject the sling', async () => {
    const actor = makeActor([
      entry('pack', 'Backpack', 'container', { capacity: 0.25 }),
      entry('load', 'Rope', 'item', { containerId: 'pack', storedSize: 0.25 }),
      entry('clothes', "Clothes, Adventurer's", 'clothing', { equipped: true, capacity: 0.1 }),
      entry('sling', 'Sling', 'weapon', { equipped: true, storedSize: 0.25, tags: ['missile'] }),
    ]);
    const sling = actor.items.get('sling');
    const handler = handlerFor(actor, sling);
    let noStorageShown = false;
    handler._showNoStorageDialog = async () => { noStorageShown = true; };
    await handler.onItemToggle(eventFor(sling));
    expect(noStorageShown).toBe(true);
    expect(sling.system).toMatchObject({ equipped: true, containerId: null, lashed: false, storedSize: 0.25 });
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

  it('stores directly unequipped clothing in a top-level container', async () => {
    const actor = makeActor([
      entry('cloak', 'Cloak', 'clothing', { equipped: true, storedSize: 2 }),
      entry('pack', 'Backpack', 'container', { capacity: 10 }),
    ]);
    const cloak = actor.items.get('cloak');
    await handlerFor(actor, cloak).onItemToggle(eventFor(cloak));
    expect(cloak.system.equipped).toBe(false);
    expect(cloak.system.containerId).toBe('pack');
  });

  it('equips stored clothing at the top level of the gear page', async () => {
    const actor = makeActor([
      entry('cloak', 'Cloak', 'clothing', { containerId: 'pack' }),
      entry('pack', 'Backpack', 'container', { capacity: 10 }),
    ]);
    const cloak = actor.items.get('cloak');
    await handlerFor(actor, cloak).onItemToggle(eventFor(cloak));
    expect(cloak.system.equipped).toBe(true);
    expect(cloak.system.containerId).toBeNull();
  });

  it('rejects an occupied Clothes position until the previous outfit is stowed', async () => {
    const actor = makeActor([
      entry('old', "Clothes, Commoner's", 'clothing', { equipped: true, storedSize: 4 }),
      entry('new', "Clothes, Merchant's", 'clothing', { containerId: 'pack', storedSize: 4 }),
      entry('pack', 'Backpack', 'container', { capacity: 8 }),
    ]);
    const next = actor.items.get('new');
    await handlerFor(actor, next).onItemToggle(eventFor(next));
    expect(actor.items.get('old').system).toMatchObject({ equipped: true, containerId: null });
    expect(next.system).toMatchObject({ equipped: false, containerId: 'pack' });

    await handlerFor(actor, actor.items.get('old')).onItemToggle(eventFor(actor.items.get('old')));
    await handlerFor(actor, next).onItemToggle(eventFor(next));
    expect(actor.items.get('old').system).toMatchObject({ equipped: false, containerId: 'pack' });
    expect(next.system).toMatchObject({ equipped: true, containerId: null });
  });

  it('rejects a Clothes replacement when the old outfit has no storage', async () => {
    const actor = makeActor([
      entry('old', "Clothes, Commoner's", 'clothing', { equipped: true, storedSize: 4 }),
      entry('new', "Clothes, Merchant's", 'clothing', { containerId: 'pack', storedSize: 4 }),
      entry('pack', 'Backpack', 'container', { capacity: 1 }),
    ]);
    const next = actor.items.get('new');
    await handlerFor(actor, next).onItemToggle(eventFor(next));
    expect(actor.items.get('old').system).toMatchObject({ equipped: true, containerId: null });
    expect(next.system).toMatchObject({ equipped: false, containerId: 'pack' });
  });

  it('rejects a Clothes replacement when no container exists', async () => {
    const actor = makeActor([
      entry('old', "Clothes, Commoner's", 'clothing', { equipped: true, storedSize: 4 }),
      entry('new', "Clothes, Merchant's", 'clothing', { equipped: false }),
    ]);
    const next = actor.items.get('new');
    await handlerFor(actor, next).onItemToggle(eventFor(next));
    expect(actor.items.get('old').system).toMatchObject({ equipped: true, containerId: null });
    expect(next.system).toMatchObject({ equipped: false, containerId: null });
  });

  it('rejects blocked or undersized clothing storage without mutation', async () => {
    const actor = makeActor([
      entry('cloak', 'Cloak', 'clothing', { equipped: true, storedSize: 2 }),
      entry('blocked', 'Belt Pouch (S)', 'container', { capacity: 100 }),
      entry('small', 'Backpack', 'container', { capacity: 1 }),
    ]);
    const cloak = actor.items.get('cloak');
    await handlerFor(actor, cloak).onItemToggle(eventFor(cloak));
    expect(cloak.system).toMatchObject({ equipped: true, containerId: null });
  });

  it('keeps pocket contents from being lost when replacing Clothes', async () => {
    const actor = makeActor([
      entry('old', "Clothes, Commoner's", 'clothing', { equipped: true, capacity: 2 }),
      entry('pocket', 'Rope', 'item', { containerId: 'old' }),
      entry('new', "Clothes, Merchant's", 'clothing', { containerId: 'pack' }),
      entry('pack', 'Backpack', 'container', { capacity: 10 }),
    ]);
    const next = actor.items.get('new');
    await handlerFor(actor, next).onItemToggle(eventFor(next));
    expect(actor.items.get('old').system).toMatchObject({ equipped: true, containerId: null });
    expect(next.system).toMatchObject({ equipped: false, containerId: 'pack' });
    expect(actor.items.get('pocket').system.containerId).toBe('old');
  });

  it('lashes a legacy-named shield to a nested custom host and excludes its own subtree', async () => {
    const actor = makeActor([
      entry('outer', 'Backpack', 'container', { capacity: 20 }),
      entry('host', 'Shield Rack', 'container', { containerId: 'outer', lashSlots: 3, supportsShieldLashing: true }),
      entry('shield', 'Old Shield', 'armor', { type: 'medium', lashable: false, equipped: true, slotCost: 2 }),
    ]);
    const shield = actor.items.get('shield');
    await handlerFor(actor, shield).onItemLashToggle(eventFor(shield));
    expect(shield.system).toMatchObject({ lashed: true, containerId: 'host', equipped: false });
  });

  it('unequips a shield to Saddle but skips a full host and preserves slot costs', async () => {
    const actor = makeActor([
      entry('full', 'Saddle', 'container', { lashSlots: 2 }),
      entry('used', 'Rope', 'item', { containerId: 'full', lashed: true, slotCost: 1 }),
      entry('saddle', 'Saddle, Pack', 'container', { lashSlots: 3 }),
      entry('shield', 'Shield', 'armor', { type: 'shield', equipped: true, slotCost: 2 }),
    ]);
    const shield = actor.items.get('shield');
    await handlerFor(actor, shield)._unequipToBackpack(shield);
    expect(shield.system).toMatchObject({ lashed: true, containerId: 'saddle', equipped: false });
  });
});


it.each(['Staff', 'Spear', 'Javelin', 'Shortbow', 'Longbow', 'Sling, Staff'])('lashes legacy %s directly outside its Backpack', async name => {
  const actor = makeActor([
    entry('pack', 'Backpack', 'container', { capacity: 100, lashSlots: 4 }),
    entry('long', name, 'weapon', { containerId: 'pack', lashable: false, tags: ['missile', 'two-handed'] }),
  ]);
  const item = actor.items.get('long');
  await handlerFor(actor, item).onItemLashToggle(eventFor(item));
  expect(item.system).toMatchObject({ containerId: 'pack', lashed: true });
});

it('rejects direct lashing onto an inner bag stored inside a Backpack', async () => {
  const actor = makeActor([
    entry('pack', 'Backpack', 'container', { capacity: 100, lashSlots: 4 }),
    entry('inner', 'Field Bag', 'container', { containerId: 'pack', capacity: 100, lashSlots: 4 }),
    entry('long', 'Javelin', 'weapon', { containerId: 'inner', lashable: true }),
  ]);
  const item = actor.items.get('long');
  await handlerFor(actor, item).onItemLashToggle(eventFor(item));
  expect(item.system).toMatchObject({ containerId: 'inner', lashed: false });
});
