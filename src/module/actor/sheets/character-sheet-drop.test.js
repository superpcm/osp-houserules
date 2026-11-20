import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

let CharacterSheet;
let ItemHandler;
let backpackLashDecision;
let getLashSlotCost;
let sequence = 0;
beforeAll(async () => {
  globalThis.foundry = {
    applications: { sheets: { ActorSheetV2: class { async _onDrop() {} } }, api: { HandlebarsApplicationMixin: Base => Base } },
    utils: { randomID: () => `generated-${++sequence}`, duplicate: (value) => structuredClone(value) },
  };
  globalThis.TextEditor = { getDragEventData: () => ({ type: 'Item' }) };
  globalThis.Application = class {};
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, settings: { get: () => null } };
  globalThis.ui = { notifications: { warn: () => {}, error: () => {}, info: () => {} } };
  globalThis.Dialog = class {};
  globalThis.Item = { implementation: { fromDropData: async () => null } };
  ({ OspActorSheetCharacter: CharacterSheet } = await import('./character-sheet.js'));
  ({ ItemHandler } = await import('./handlers/item-handler.js'));
  ({ backpackLashDecision } = await import('../../inventory/long-item-transport.js'));
  ({ getLashSlotCost } = await import('../../inventory/lash-slot-cost.js'));
});

describe('character sheet drop staging guards', () => {
  it('enforces Warhammer Sling physical single-item capacity without stack bypasses', () => {
    const slingData = entry('sling', 'Warhammer Sling', 'container', {
      capacity: 8, maxItems: 1, tags: ['weapon-storage', 'sling', 'slungable'],
      allowedNames: ['Warhammer'],
    });
    const warhammer = entry('hammer', 'Warhammer', 'weapon', { storedSize: 8, containerId: 'sling' });

    const emptySheet = Object.create(CharacterSheet.prototype);
    emptySheet.actor = makeActor('warhammer-empty', [slingData]);
    const emptySling = emptySheet.actor.items.get('sling');
    expect(emptySheet._isItemAllowedInContainer({ ...warhammer, _id: 'incoming' }, emptySling)).toEqual({ allowed: true, reason: null });
    expect(emptySheet._isItemAllowedInContainer({ ...warhammer, _id: 'incoming', system: { ...warhammer.system, quantity: 2 } }, emptySling).allowed).toBe(false);

    const occupiedSheet = Object.create(CharacterSheet.prototype);
    occupiedSheet.actor = makeActor('warhammer-occupied', [slingData, warhammer]);
    const occupiedSling = occupiedSheet.actor.items.get('sling');
    expect(occupiedSheet._isItemAllowedInContainer({ ...warhammer, _id: 'incoming' }, occupiedSling).allowed).toBe(false);
    expect(occupiedSheet._isItemAllowedInContainer({ ...warhammer, _id: 'hammer' }, occupiedSling)).toEqual({ allowed: true, reason: null });
  });

  it('keeps handle drags out of Foundry Item drag and placement paths', async () => {
    const sheet = Object.create(CharacterSheet.prototype);
    sheet._gearDragItemId = null;
    const target = { closest: () => ({}) };
    expect(await sheet._onDragStart({ type: 'dragstart', target, dataTransfer: { types: [] } })).toBe(false);
    expect(sheet._gearDragItemId).toBeNull();
    sheet._onDropItem = () => { throw Error('Reorder entered Item placement'); };
    expect(await sheet._onDrop({ type: 'drop', target, dataTransfer: { types: ['application/x-osp-gear-order'] } })).toBe(false);
  });

  it('keeps a worn belt in top-level gear instead of the Body group', () => {
    const sheet = Object.create(CharacterSheet.prototype);
    const clothing = [
      entry('belt', 'Utility Strap', 'clothing', { equipped: true, slot: 'belt' }),
      entry('cloak', 'Cloak', 'clothing', { equipped: true, slot: 'cloak' }),
      entry('stored', 'Spare Clothes', 'clothing', { equipped: false }),
    ];
    const bodyClothing = clothing.filter(item => sheet._isBodyClothing(item));
    const topLevelGearItems = clothing.filter(item => !bodyClothing.some(bodyItem => bodyItem._id === item._id));
    expect(bodyClothing.map(item => item._id)).toEqual(['cloak']);
    expect(topLevelGearItems.map(item => item._id)).toEqual(['belt', 'stored']);
  });

  it('rejects renamed clothing drops when their explicit wear category is occupied', () => {
    const sheet = Object.create(CharacterSheet.prototype);
    sheet.actor = {
      items: [entry('old', 'Renamed Tunic', 'clothing', { equipped: true, slot: 'clothes' })],
    };
    const incoming = entry('new', 'Wizard Garment', 'clothing', { slot: 'base', quantity: 1 });
    expect(sheet._canWearOpenSpace(incoming)).toBe(false);
    expect(sheet._canWearOpenSpace({ ...incoming, system: { ...incoming.system, slot: 'boots' } })).toBe(true);
  });

  it('rejects a drop before resolving or mutating an actor the user does not own', async () => {
    const sheet = Object.create(CharacterSheet.prototype);
    sheet.actor = { isOwner: false };
    const result = await sheet._onDropItem({ target: { closest: () => null } }, { type: 'Item' });
    expect(result).toBe(false);
  });

  it('returns the selected stack quantity to the caller for final validation', async () => {
    const sheet = Object.create(CharacterSheet.prototype);
    const item = { name: 'Arrows', system: { quantity: 4 } };
    expect(await sheet._selectDropQuantity(item, 4, false)).toBe(4);
    expect(await sheet._selectDropQuantity({ name: 'Arrows', system: { quantity: 2 } }, 4, false)).toBe(2);
  });
});

it('keeps legacy helmet lash preview and commit consistent for container hosts', async () => {
  const destination = makeActor('helmet-test', [
    entry('outer', 'Pack Frame', 'container', { capacity: 20 }),
    entry('pack', 'Saddle Bag', 'container', { containerId: 'outer', capacity: 20, lashSlots: 2 }),
    entry('preview-helmet', 'Helmet', 'armor', { type: 'helmet', lashable: false, slotCost: 1 }),
    entry('belt', 'Belt', 'clothing', { equipped: true, lashSlots: 2 }),
  ]);
  const source = makeActor('helmet-source', [entry('helmet', 'Helmet', 'armor', { type: 'helmet', lashable: false, slotCost: 1 })]);
  globalThis.game.actors = new Map([[destination.id, destination], [source.id, source]]);
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = destination; sheet._gearDragItemId = 'preview-helmet';
  sheet._isStoreLocked = () => false;
  dragItem = source.items.get('helmet');
  const pack = destination.items.get('pack');
  expect((await sheet._getContainerDropValidity(pack)).valid).toBe(true);
  expect((await sheet._getContainerDropValidity(destination.items.get('belt'))).valid).toBe(false);
  sheet._dropPlacementTarget = 'belt';
  const event = { target: { closest: () => null } };
  expect(await sheet._onDropItem(event, {})).toBe(false);
  expect(source.items.get('helmet').system.containerId).toBeNull();
});

it('rejects a legacy helmet when the target lash slots cannot cover its slot cost', async () => {
  const destination = makeActor('helmet-full', [
    entry('pack', 'Saddle Bag', 'container', { lashSlots: 2 }),
    entry('rope', 'Rope', 'item', { containerId: 'pack', lashed: true, slotCost: 1 }),
    entry('helmet', 'Great helm', 'armor', { type: 'helmet', lashable: false, slotCost: 2 }),
  ]);
  globalThis.game.actors = new Map([[destination.id, destination]]);
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = destination; sheet._gearDragItemId = 'helmet';
  sheet._isStoreLocked = () => false;
  dragItem = destination.items.get('helmet');
  expect((await sheet._getContainerDropValidity(destination.items.get('pack'))).valid).toBe(false);
});

let boundary, fault, afterFault, selected, dragItem;
const clone = value => structuredClone(value);
function patch(object, changes) {
  for (const [key, value] of Object.entries(changes)) {
    const path = key.split('.'); let target = object;
    for (const part of path.slice(0, -1)) target = target[part] ??= {};
    const leaf = path.at(-1);
    if (leaf.startsWith('-=')) delete target[leaf.slice(2)]; else target[leaf] = clone(value);
  }
}
function makeActor(id, entries) {
  const list = []; const flags = new Map();
  const collection = { [Symbol.iterator]: () => list.values(), get contents() { return list; }, get: id => list.find(item => item.id === id), find: fn => list.find(fn), filter: fn => list.filter(fn), some: fn => list.some(fn), map: fn => list.map(fn), values: () => list.values() };
  const write = async fn => { const current = ++boundary; if ((fault === current || fault instanceof Set && fault.has(current)) && !afterFault) throw new Error('Injected write failure'); const result = fn(); if ((fault === current || fault instanceof Set && fault.has(current)) && afterFault) throw new Error('Injected acknowledgement failure'); return result; };
  const actor = { id, uuid: `Actor.${id}`, type: 'character', name: id, isOwner: true, system: { class: 'fighter' }, get items() { return collection; }, getFlag: (_scope, key) => flags.get(key) ?? null, setFlag: async (_scope, key, value) => write(() => flags.set(key, clone(value))), createEmbeddedDocuments: async (_type, entries, options = {}) => write(() => entries.map(entry => add({ ...clone(entry), _id: options.keepId ? entry._id : foundry.utils.randomID() }))), deleteEmbeddedDocuments: async (_type, ids) => { for (const id of ids) await collection.get(id)?.delete(); }, updateEmbeddedDocuments: async (_type, entries) => { for (const entry of entries) await collection.get(entry._id).update(entry); } };
  function add(data) { const item = { actor, id: data._id, get name() { return data.name; }, get type() { return data.type; }, get img() { return data.img; }, get system() { return data.system; }, get flags() { return data.flags; }, toObject: () => clone(data), update: async changes => write(() => { patch(data, changes); return item; }), delete: async () => write(() => list.splice(list.indexOf(item), 1)) }; list.push(item); return item; }
  entries.forEach(entry => add(clone(entry))); return actor;
}
const entry = (id, name, type, system = {}) => ({ _id: id, name, type, img: '', system: { quantity: 1, storedSize: 1, tags: [], containerId: null, equipped: false, lashed: false, ...system } });
const bag = id => entry(id, 'Backpack', 'container', { capacity: 100, containerSize: 'large', lashSlots: 4 });
function fixture(kind = 'purchase') {
  const destination = makeActor('buyer', [bag('bag'), entry('purse', 'Coin Purse', 'container', { capacity: 100 }), entry('silver', 'Silver Coins', 'coin', { quantity: 20, cost: 1, storedSize: 0.04, containerId: 'purse' })]);
  let source = null; let target = 'bag';
  const ammo = entry('incoming', 'Arrows', 'ammunition', { quantity: kind === 'purchase' ? 1 : 5, cost: 2 });
  if (kind === 'purchase') dragItem = { actor: null, toObject: () => clone(ammo) };
  else if (kind === 'container') { source = makeActor('giver', [entry('incoming', 'Sidesack', 'container', { capacity: 40, containerSize: 'small', cost: 2 }), entry('nested', 'Coin Purse', 'container', { containerId: 'incoming', capacity: 10 }), entry('content', 'Copper Coins', 'coin', { quantity: 5, storedSize: 0.04, containerId: 'nested' })]); dragItem = source.items.get('incoming'); selected = 1; }
  else if (kind === 'livestock') { source = makeActor('giver', [entry('incoming', 'Mule', 'livestock', { tags: ['pack animal'], cost: 20 }), entry('saddle', 'Saddle, Pack', 'container', { tags: ['tack'], tackSlot: 'saddle', containerId: 'incoming', capacity: 20 }), entry('content', 'Rope', 'item', { quantity: 3, containerId: 'saddle' })]); dragItem = source.items.get('incoming'); target = null; selected = 1; }
  else if (kind === 'internal') { destination.items.contents.push(...[]); const data = entry('incoming', 'Arrows', 'ammunition', { quantity: 5, cost: 2, containerId: 'purse' }); source = destination; const incoming = makeActor('temporary', [data]).items.get('incoming'); incoming.actor = destination; destination.items.contents.push(incoming); dragItem = incoming; }
  else { source = makeActor('giver', [ammo]); dragItem = source.items.get('incoming'); if (kind === 'merge') destination.items.contents.push(makeActor('temporary', [entry('existing', 'Arrows', 'ammunition', { quantity: 2, containerId: 'bag', cost: 2 })]).items.get('existing')); }
  const actors = new Map([[destination.id, destination], ...(source ? [[source.id, source]] : [])]);
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors, scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => [...actors.values()].find(actor => actor.uuid === uuid);
  globalThis.Item.implementation.fromDropData = async () => dragItem;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = destination; sheet.handlers = new Map(); sheet._selectDropQuantity = async () => selected; sheet.loadProfileData = async () => ({ classes: [] });
  const event = { target: { closest: selector => selector.includes('[data-item-id]') && target ? { dataset: { itemId: target } } : null } };
  return { destination, source, sheet, event, actors };
}

describe('empty Gear automatic shield and helmet placement', () => {
  it('equips a shield or helmet when the corresponding Gear slot is available', async () => {
    for (const armor of [
      { name: 'Shield', type: 'shield' },
      { name: 'Helmet', type: 'helmet' },
    ]) {
      const f = fixture('internal');
      const item = dragItem;
      await item.update({ name: armor.name, type: 'armor', 'system.type': armor.type, 'system.quantity': 1, 'system.lashable': false });
      selected = 1;
      f.event.target.closest = () => null;
      expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
      expect(item.system).toMatchObject({ equipped: true, containerId: null, lashed: false });
    }
  });

  it('lashes a shield or helmet before ordinary storage when Gear equipment is occupied', async () => {
    for (const armor of [
      { name: 'Shield', type: 'shield', worn: { name: 'Worn Shield', type: 'shield' } },
      { name: 'Helmet', type: 'helmet', worn: { name: 'Worn Helmet', type: 'helmet' } },
    ]) {
      const f = fixture('internal');
      const item = dragItem;
      await item.update({ name: armor.name, type: 'armor', 'system.type': armor.type, 'system.quantity': 1, 'system.lashable': false });
      await f.destination.createEmbeddedDocuments('Item', [entry(`worn-${armor.type}`, armor.worn.name, 'armor', { type: armor.worn.type, equipped: true })]);
      selected = 1;
      f.event.target.closest = () => null;
      expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
      expect(item.system).toMatchObject({ equipped: false, containerId: 'bag', lashed: true });
    }
  });

  it('falls back to a compatible container when no lash host is available', async () => {
    const f = fixture('internal');
    const item = dragItem;
    await item.update({ name: 'Helmet', type: 'armor', 'system.type': 'helmet', 'system.quantity': 1, 'system.lashable': false });
    await f.destination.createEmbeddedDocuments('Item', [entry('worn-helmet', 'Worn Helmet', 'armor', { type: 'helmet', equipped: true })]);
    await f.destination.items.get('bag').update({ 'system.lashSlots': 0 });
    selected = 1;
    f.event.target.closest = () => null;
    expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
    expect(item.system).toMatchObject({ equipped: false, containerId: 'bag', lashed: false });
  });

  it('rejects an unfittable empty Gear armor drop atomically without opening the chooser', async () => {
    const f = fixture('purchase');
    dragItem = { actor: null, toObject: () => entry('incoming-shield', 'Shield', 'armor', { type: 'shield', storedSize: 50, cost: 7 }) };
    globalThis.Item.implementation.fromDropData = async () => dragItem;
    await f.destination.items.get('bag').update({ 'system.capacity': 0, 'system.lashSlots': 0 });
    await f.destination.items.get('purse').update({ 'system.capacity': 0, 'system.lashSlots': 0 });
    await f.destination.createEmbeddedDocuments('Item', [entry('worn-shield', 'Worn Shield', 'armor', { type: 'shield', equipped: true })]);
    const before = snapshot(f.destination);
    let chooserOpened = false;
    f.sheet._showDropPlacementDialog = async () => { chooserOpened = true; return null; };
    const errors = [];
    const previousError = ui.notifications.error;
    ui.notifications.error = message => errors.push(message);
    f.event.target.closest = () => null;
    expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
    ui.notifications.error = previousError;
    expect(chooserOpened).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/cannot be equipped, lashed, or stored/);
    expect(snapshot(f.destination)).toEqual(before);
  });
});

describe('Gear context-menu destinations', () => {
  it('offers Sling for a storable bow when the current back-slot combination allows it', () => {
    const f = fixture('internal');
    const bow = makeActor('temporary', [entry('bow', 'Shortbow', 'weapon', {
      tags: ['slungable'], containerId: 'bag', storedSize: 2,
    })]).items.get('bow');
    bow.actor = f.destination;
    f.destination.items.contents.push(bow);
    f.sheet._checkBackSlotCompatibility = () => ({ allowed: true });
    const candidates = f.sheet._gearMoveCandidates(bow);
    expect(candidates).toContainEqual({ id: '__slung__', mode: 'sling', label: 'Sling' });
  });

  it('offers storage and lash choices for compatible hosts', () => {
    const f = fixture('internal');
    const belt = makeActor('temporary', [entry('belt', 'Belt', 'clothing', { equipped: true, lashSlots: 2 })]).items.get('belt');
    belt.actor = f.destination;
    f.destination.items.contents.push(belt);
    const item = f.destination.items.get('incoming');
    const candidates = f.sheet._gearMoveCandidates(item);
    expect(candidates.some(candidate => candidate.label === 'Store in Backpack')).toBe(true);
    expect(candidates.some(candidate => candidate.label === 'Lash to Belt')).toBe(false);
  });

  it('moves a bow to Sling through the real placement pipeline without a live probe mutation', async () => {
    const f = fixture('internal');
    const item = dragItem;
    await item.update({ name: 'Shortbow', type: 'weapon', 'system.tags': ['slungable'], 'system.quantity': 1, 'system.equipped': false });
    item.toDragData = () => ({ type: 'Item' });
    f.sheet.element = { closest: () => null };
    f.sheet._selectDropQuantity = async () => item.system.quantity;
    const candidate = { id: '__slung__', mode: 'sling', label: 'Sling' };
    const before = snapshot(f.destination);
    expect(await f.sheet._moveGearItemToDestination(item, candidate, { probe: true })).toBe(true);
    expect(snapshot(f.destination)).toEqual(before);
    expect(await f.sheet._moveGearItemToDestination(item, candidate)).toBe(true);
    expect(item.system).toMatchObject({ quantity: 1, containerId: null, equipped: false, lashed: false });
    expect(f.sheet._gearMoveCandidates(item).some(choice => choice.mode === 'sling')).toBe(false);
  });

  it('does not prompt during gear-menu probes, then prompts once for the real stack move', async () => {
    const f = fixture('internal');
    const item = f.destination.items.get('incoming');
    item.toDragData = () => ({ type: 'Item' });
    f.sheet.element = { closest: () => null };
    let prompts = 0;
    f.sheet._selectDropQuantity = CharacterSheet.prototype._selectDropQuantity;
    f.sheet.createDialog = function (dialog) {
      expect(this).toBe(f.sheet);
      prompts += 1;
      dialog.buttons.accept.callback({ find: () => ({ val: () => '2' }) });
      return { render: () => {} };
    };
    const candidate = { id: 'bag', mode: 'store', label: 'Store in Backpack' };
    expect(await f.sheet._moveGearItemToDestination(item, candidate, { probe: true })).toBe(true);
    expect(prompts).toBe(0);
    expect(await f.sheet._moveGearItemToDestination(item, candidate)).toBe(true);
    expect(prompts).toBe(1);
    expect(item.system.quantity).toBe(3);
    expect(quantity(f.destination, 'Arrows')).toBe(5);
  });

  it('slings a carrier while preserving its contents and their identities', async () => {
    const f = fixture('internal');
    const item = dragItem;
    await item.update({ name: 'Skin Sling', type: 'container', 'system.tags': ['sling'], 'system.quantity': 1, 'system.capacity': 4 });
    const [child] = await f.destination.createEmbeddedDocuments('Item', [entry('skin-child', 'Waterskin', 'item', { containerId: item.id, quantity: 1 })], { keepId: true });
    const childBefore = child.toObject();
    item.toDragData = () => ({ type: 'Item' });
    f.sheet.element = { closest: () => null };
    f.sheet._selectDropQuantity = async () => item.system.quantity;
    expect(await f.sheet._moveGearItemToDestination(item, { id: '__slung__', mode: 'sling', label: 'Sling' })).toBe(true);
    expect(item.system).toMatchObject({ containerId: null, equipped: true, lashed: false });
    expect(child.toObject()).toEqual(childBefore);
  });

  it('omits and rejects Sling when a worn Backpack conflicts with a Quiver', async () => {
    const f = fixture('internal');
    const item = dragItem;
    await item.update({ name: 'Quiver', type: 'container', 'system.tags': ['slungable'], 'system.quantity': 1 });
    await f.destination.items.get('bag').update({ 'system.equipped': true });
    item.toDragData = () => ({ type: 'Item' });
    f.sheet.element = { closest: () => null };
    f.sheet._selectDropQuantity = async () => item.system.quantity;
    const before = snapshot(f.destination);
    expect(f.sheet._gearMoveCandidates(item).some(choice => choice.mode === 'sling')).toBe(false);
    expect(await f.sheet._moveGearItemToDestination(item, { id: '__slung__', mode: 'sling', label: 'Sling' }, { probe: true })).toBe(false);
    expect(snapshot(f.destination)).toEqual(before);
  });

  it('omits the item itself and its descendant containers', () => {
    const f = fixture('internal');
    const child = makeActor('temporary', [entry('child', 'Nested Bag', 'container', { containerId: 'incoming', capacity: 10 })]).items.get('child');
    child.actor = f.destination;
    f.destination.items.contents.push(child);
    const candidates = f.sheet._gearMoveCandidates(f.destination.items.get('incoming'));
    expect(candidates.every(candidate => !['incoming', 'child'].includes(candidate.id))).toBe(true);
  });

  it('dry-runs an invalid lash choice without mutating the item', async () => {
    const f = fixture('internal');
    const belt = makeActor('temporary', [entry('belt', 'Belt', 'clothing', { equipped: true, lashSlots: 1 })]).items.get('belt');
    belt.actor = f.destination;
    f.destination.items.contents.push(belt);
    const item = f.destination.items.get('incoming');
    item.toDragData = () => ({ type: 'Item' });
    dragItem = item;
    f.sheet.element = { closest: () => null };
    f.sheet._isStoreLocked = () => false;
    const before = snapshot(f.destination);
    const result = await f.sheet._moveGearItemToDestination(item, { id: 'belt', mode: 'lash', label: 'Lash to Belt' }, { probe: true });
    expect(result).toBe(false);
    expect(snapshot(f.destination)).toEqual(before);
  });

});
const snapshot = actor => actor.items.contents.map(item => item.toObject()).sort((a, b) => a._id.localeCompare(b._id));
const quantity = (actor, name) => actor.items.contents.filter(item => item.name === name).reduce((sum, item) => sum + item.system.quantity, 0);
beforeEach(() => { sequence = 0; boundary = 0; fault = null; afterFault = false; selected = 3; });
for (const kind of ['purchase', 'gift']) for (const type of ['shield', 'helmet']) {
  it(`equips an incoming ${type} from ${kind} without a chooser and conserves inventory/payment`, async () => {
    const f = fixture(kind);
    const name = `Incoming ${type}`;
    if (f.source) await dragItem.update({ name, type: 'armor', 'system.type': type, 'system.quantity': 1, 'system.lashable': false });
    else dragItem = { actor: null, toObject: () => entry('incoming', name, 'armor', { type, quantity: 1, cost: 2, lashable: false }) };
    selected = 1;
    f.event.target.closest = () => null;
    let chooserOpened = false;
    f.sheet._showDropPlacementDialog = async () => { chooserOpened = true; return null; };
    expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
    expect(chooserOpened).toBe(false);
    const delivered = f.destination.items.contents.find(item => item.name === name);
    expect(delivered.system).toMatchObject({ equipped: true, lashed: false, containerId: null, quantity: 1 });
    if (f.source) expect(f.source.items.contents).toHaveLength(0);
    expect(quantity(f.destination, 'Silver Coins')).toBe(kind === 'purchase' ? 18 : 20);
  });
}

it('automatically lashes a shield when both hands are occupied without moving the held weapon', async () => {
  const f = fixture('internal');
  const shield = dragItem;
  await shield.update({ name: 'Shield', type: 'armor', 'system.type': 'shield', 'system.quantity': 1 });
  const [held] = await f.destination.createEmbeddedDocuments('Item', [entry('held', 'Greatsword', 'weapon', { equipped: true, tags: ['two-handed'] })]);
  const before = held.toObject();
  selected = 1; f.event.target.closest = () => null;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(shield.system).toMatchObject({ equipped: false, lashed: true, containerId: 'bag' });
  expect(held.toObject()).toEqual(before);
});

it('automatically stores a class-restricted shield instead of equipping or lashing it to a sidesack', async () => {
  const f = fixture('internal');
  const shield = dragItem;
  await shield.update({ name: 'Shield', type: 'armor', 'system.type': 'shield', 'system.quantity': 1 });
  await f.destination.items.get('bag').update({ 'system.lashSlots': 0 });
  await f.destination.createEmbeddedDocuments('Item', [entry('side', 'Sidesack', 'container', { lashSlots: 1 })]);
  f.sheet.loadProfileData = async () => ({ classes: [{ id: 'fighter', armorPermissions: ['No armour'] }] });
  selected = 1; f.event.target.closest = () => null;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(shield.system).toMatchObject({ equipped: false, lashed: false, containerId: 'bag' });
});

for (const type of ['shield', 'helmet']) it(`stores a conflicting ${type} inside a nested lashed container when root storage is full`, async () => {
  const f = fixture('internal');
  const item = dragItem;
  await item.update({ name: `Spare ${type}`, type: 'armor', 'system.type': type, 'system.quantity': 1, 'system.storedSize': 8 });
  await f.destination.createEmbeddedDocuments('Item', [entry('worn', `Worn ${type}`, 'armor', { type, equipped: true })]);
  await f.destination.items.get('bag').update({ 'system.lashSlots': 0, 'system.capacity': 0 });
  await f.destination.items.get('purse').update({ 'system.capacity': 0 });
  const [nested] = await f.destination.createEmbeddedDocuments('Item', [entry('nested', 'Cargo Sack', 'container', { containerId: 'bag', lashed: true, capacity: 20, containerSize: 'large' })]);
  selected = 1; f.event.target.closest = () => null;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(item.system).toMatchObject({ equipped: false, lashed: false, containerId: nested.id });
});

for (const type of ['shield', 'helmet']) it(`rejects an unfittable gifted ${type} with an error and preserves both actors`, async () => {
  const f = fixture('gift');
  await dragItem.update({ name: `Gift ${type}`, type: 'armor', 'system.type': type, 'system.quantity': 1 });
  await f.destination.createEmbeddedDocuments('Item', [entry('worn', `Worn ${type}`, 'armor', { type, equipped: true })]);
  await f.destination.items.get('bag').update({ 'system.lashSlots': 0, 'system.capacity': 0 });
  await f.destination.items.get('purse').update({ 'system.capacity': 0 });
  selected = 1; f.event.target.closest = () => null;
  const before = [snapshot(f.destination), snapshot(f.source)];
  const errors = []; let chooserOpened = false;
  f.sheet._showDropPlacementDialog = async () => { chooserOpened = true; return null; };
  const previousError = ui.notifications.error;
  ui.notifications.error = error => errors.push(error);
  try { expect(await f.sheet._onDropItem(f.event, {})).toBe(false); }
  finally { ui.notifications.error = previousError; }
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatch(/cannot be equipped, lashed, or stored/);
  expect(chooserOpened).toBe(false);
  expect([snapshot(f.destination), snapshot(f.source)]).toEqual(before);
});

for (const [name, properties] of [
  ['Backpack', {}], ['Saddle', {}], ['Saddle, Pack', {}],
  ['Reinforced Cargo Frame', { supportsShieldLashing: true, containerId: 'bag' }],
]) it(`lashes a legacy shield to ${name} through preview and committed drop`, async () => {
  const f = fixture('internal');
  const shield = dragItem;
  await shield.update({ name: 'Painted Guard', type: 'armor', 'system.type': 'shield', 'system.quantity': 1,
    'system.storedSize': 20, 'system.containerSizeRequired': 'large', 'system.lashable': false, 'system.slotCost': 2 });
  const [host] = await f.destination.createEmbeddedDocuments('Item', [entry('shield-host', name, 'container', { lashSlots: 2, capacity: 0, ...properties })]);
  selected = 1;
  f.sheet._gearDragItemId = shield.id;
  f.event.target.closest = selector => selector.includes('[data-item-id]') ? { dataset: { itemId: host.id } } : null;
  expect((await f.sheet._getContainerDropValidity(host)).valid).toBe(true);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(shield.system).toMatchObject({ containerId: host.id, lashed: true, equipped: false });
});

for (const [name, type, properties] of [
  ['Sidesack', 'container', {}], ['Small Pouch', 'container', {}],
  ['Belt', 'clothing', { equipped: true, supportsShieldLashing: true }],
  ['Backpack', 'container', { supportsShieldLashing: false }],
  ['Saddle', 'container', { lashSlots: 1 }],
]) it(`rejects unsuitable or undersized shield lash host ${name} without mutation`, async () => {
  const f = fixture('internal');
  const shield = dragItem;
  await shield.update({ name: 'Legacy Shield', type: 'armor', 'system.type': 'shield', 'system.quantity': 1,
    'system.lashable': false, 'system.slotCost': 2 });
  const [host] = await f.destination.createEmbeddedDocuments('Item', [entry('shield-host', name, type, { lashSlots: 2, capacity: 0, ...properties })]);
  selected = 1;
  f.sheet._gearDragItemId = shield.id;
  f.event.target.closest = selector => selector.includes('[data-item-id]') ? { dataset: { itemId: host.id } } : null;
  f.sheet._showDropPlacementDialog = async () => null;
  const before = snapshot(f.destination);
  expect((await f.sheet._getContainerDropValidity(host)).valid).toBe(false);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  expect(snapshot(f.destination)).toEqual(before);
});

it('rejects a shield on an occupied saddle lash slot', async () => {
  const f = fixture('internal');
  const shield = dragItem;
  await shield.update({ name: 'Shield', type: 'armor', 'system.type': 'shield', 'system.quantity': 1, 'system.lashable': false });
  const [host] = await f.destination.createEmbeddedDocuments('Item', [entry('shield-host', 'Saddle', 'container', { lashSlots: 1 })]);
  await f.destination.createEmbeddedDocuments('Item', [entry('load', 'Bedroll', 'item', { containerId: host.id, lashed: true })]);
  selected = 1;
  f.sheet._gearDragItemId = shield.id;
  f.event.target.closest = selector => selector.includes('[data-item-id]') ? { dataset: { itemId: host.id } } : null;
  f.sheet._showDropPlacementDialog = async () => null;
  expect((await f.sheet._getContainerDropValidity(host)).valid).toBe(false);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  expect(shield.system.lashed).toBe(false);
});

it('commits a legacy helmet drop onto the nested container accepted by its preview', async () => {
  const f = fixture('internal');
  const helmet = dragItem;
  await helmet.update({ name: 'Helmet', type: 'armor', 'system.type': 'helmet', 'system.quantity': 1, 'system.lashable': false });
  const [host] = await f.destination.createEmbeddedDocuments('Item', [entry('nested-host', 'Pack Frame', 'container', { containerId: 'bag', lashSlots: 2 })]);
  selected = 1;
  f.sheet._gearDragItemId = helmet.id;
  f.event.target.closest = selector => selector.includes('[data-item-id]') ? { dataset: { itemId: host.id } } : null;
  expect((await f.sheet._getContainerDropValidity(host)).valid).toBe(true);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(helmet.system).toMatchObject({ containerId: host.id, lashed: true, equipped: false });
});
it('validates incompatible tack before any live write or charge', async () => {
  const f = fixture();
  f.destination.items.contents.push(makeActor('temporary', [entry('pony', 'Pony', 'livestock', { tags: ['rideable'], animalSize: 'small' })]).items.get('pony'));
  dragItem = { actor: null, toObject: () => entry('tack', 'Barding', 'armor', { tags: ['tack'], animalType: 'horse', cost: 10 }) };
  selected = 1;
  f.event.target.closest = selector => selector.includes('[data-item-id]') ? { dataset: { itemId: 'pony' } } : null;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect(boundary).toBe(0); expect(quantity(f.destination, 'Silver Coins')).toBe(20);
});
it('charges a catalog purchase for selected quantity exactly once', async () => {
  const f = fixture(); expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(quantity(f.destination, 'Arrows')).toBe(3); expect(quantity(f.destination, 'Silver Coins')).toBe(14);
});
it('prompts for catalog repeatable supplies and places the selected quantity', async () => {
  const f = fixture();
  dragItem = { actor: null, toObject: () => entry('catalog-piton', 'Piton', 'item', { quantity: 1, cost: 1 }) };
  let prompt;
  f.sheet._selectDropQuantity = async (data, max, ask, options) => { prompt = { name: data.name, max, ask, unitLabel: options.unitLabel }; return 7; };
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(prompt).toEqual({ name: 'Piton', max: Infinity, ask: true, unitLabel: 'items' });
  expect(quantity(f.destination, 'Piton')).toBe(7);
});
it('sells catalog torches as protected six-torch bundles at six times the unit price', async () => {
  const f = fixture();
  await f.destination.items.get('silver').update({ 'system.quantity': 100 });
  await f.destination.createEmbeddedDocuments('Item', [entry('copper', 'Copper Coins', 'coin', { quantity: 100, cost: 0.1, storedSize: 0.04, containerId: 'purse' })]);
  dragItem = { actor: null, toObject: () => entry('catalog-torch', 'Torch', 'item', {
    quantity: 6, cost: 0.2, storedSize: 0.75, unitWeight: 0.5, tags: ['light-source', 'melee']
  }) };
  selected = 2;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  const torches = f.destination.items.contents.filter(item => item.name === 'Torch');
  expect(torches.map(item => item.system.quantity)).toEqual([6, 6]);
  expect(torches.every(item => item.flags?.['osp-houserules']?.protectedTorchBundle === true)).toBe(true);
  expect(quantity(f.destination, 'Silver Coins')).toBe(98);
  expect(quantity(f.destination, 'Copper Coins')).toBe(96);
});
for (const kind of ['gift', 'merge', 'internal']) it(`conserves a partial ${kind} without charging`, async () => {
  const f = fixture(kind); expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(quantity(f.destination, 'Silver Coins')).toBe(20);
  if (kind === 'internal') expect(quantity(f.destination, 'Arrows')).toBe(5);
  else { expect(quantity(f.source, 'Arrows')).toBe(2); expect(quantity(f.destination, 'Arrows')).toBe(kind === 'merge' ? 5 : 3); }
});
for (const kind of ['container', 'livestock']) it(`moves ${kind} descendants with remapped parents`, async () => {
  const f = fixture(kind); expect(await f.sheet._onDropItem(f.event, {})).toBe(true); expect(f.source.items.contents).toHaveLength(0);
  const copied = f.destination.items.contents.filter(item => !['bag', 'purse', 'silver'].includes(item.id)); expect(copied).toHaveLength(3);
  for (const item of copied.filter(item => item.system.containerId)) expect(f.destination.items.get(item.system.containerId)).toBeTruthy();
  expect(quantity(f.destination, 'Silver Coins')).toBe(20);
});
it('cancellation and invalid quantities leave both inventories unchanged', async () => {
  for (const value of [null, 0, -1, 1.5, 6, NaN]) { const f = fixture('gift'); selected = value; const before = [snapshot(f.destination), snapshot(f.source)]; expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect([snapshot(f.destination), snapshot(f.source)]).toEqual(before); expect(boundary).toBe(0); }
});
it('rejects stale source or destination after quantity selection', async () => {
  for (const endpoint of ['source', 'destination']) { const f = fixture('gift'); f.sheet._selectDropQuantity = async () => { await (endpoint === 'source' ? f.source.items.get('incoming') : f.destination.items.get('bag')).update({ 'system.quantity': 7 }); return 3; }; expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect(quantity(f.destination, 'Arrows')).toBe(0); expect(quantity(f.destination, 'Silver Coins')).toBe(20); }
});
for (const kind of ['purchase', 'gift', 'merge', 'container', 'livestock']) {
  for (const acknowledged of [false, true]) it(`recovers every ${kind} write boundary (${acknowledged ? 'after' : 'before'} write)`, async () => {
    let f = fixture(kind); expect(await f.sheet._onDropItem(f.event, {})).toBe(true); const count = boundary;
    for (let failed = 1; failed <= count; failed++) {
      sequence = 0; boundary = 0; f = fixture(kind); const before = [...f.actors.values()].map(snapshot); fault = failed; afterFault = acknowledged;
      const success = await f.sheet._onDropItem(f.event, {}); fault = null;
      const { getPendingTransaction, recoverTransaction } = await import('../../inventory/transaction-journal.js');
      if (getPendingTransaction(f.destination)) { game.user.isGM = true; expect((await recoverTransaction(f.destination)).success).toBe(true); }
      if (success || quantity(f.destination, kind === 'purchase' || kind === 'gift' || kind === 'merge' ? 'Arrows' : kind === 'container' ? 'Sidesack' : 'Mule') > (kind === 'merge' ? 2 : 0)) {
        expect(quantity(f.destination, 'Silver Coins')).toBe(kind === 'purchase' ? 14 : 20);
        if (f.source) expect(quantity(f.source, kind === 'gift' || kind === 'merge' ? 'Arrows' : kind === 'container' ? 'Sidesack' : 'Mule')).toBe(kind === 'gift' || kind === 'merge' ? 2 : 0);
      } else expect([...f.actors.values()].map(snapshot)).toEqual(before);
      expect(getPendingTransaction(f.destination)).toBeNull();
    }
  });
}

it('moves a partial coin stack without minting or charging coins', async () => {
  const f = fixture('gift'); const coin = f.source.items.get('incoming');
  const data = coin.toObject(); data.type = 'coin'; data.name = 'Silver Coins'; data.system.storedSize = 0.04;
  const source = makeActor('giver', [data]); f.actors.set('giver', source); dragItem = source.items.get('incoming');
  f.event.target.closest = selector => selector.includes('[data-item-id]') ? { dataset: { itemId: 'purse' } } : null;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(quantity(source, 'Silver Coins')).toBe(2); expect(quantity(f.destination, 'Silver Coins')).toBe(23);
});
it('moves the entire source stack exactly once', async () => {
  const f = fixture('merge'); selected = 5;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(f.source.items.contents).toHaveLength(0); expect(quantity(f.destination, 'Arrows')).toBe(7);
});
it('keeps populated livestock separate from an existing herd', async () => {
  const f = fixture('livestock'); const existing = makeActor('temporary', [entry('existing', 'Mule', 'livestock', { quantity: 2 })]).items.get('existing'); f.destination.items.contents.push(existing);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  const saddle = f.destination.items.find(item => item.name === 'Saddle, Pack');
  expect(saddle.system.containerId).not.toBe('existing'); expect(f.destination.items.get(saddle.system.containerId).name).toBe('Mule');
  expect(quantity(f.destination, 'Mule')).toBe(3);
});
it('rejects a populated container that exceeds destination capacity', async () => {
  const f = fixture('container'); await f.destination.items.get('bag').update({ 'system.capacity': 0.5 }); boundary = 0;
  const before = [snapshot(f.source), snapshot(f.destination)];
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect([snapshot(f.source), snapshot(f.destination)]).toEqual(before); expect(boundary).toBe(0);
});

function tentDropFixture({ quantity: tentQuantity = 1, internal = true, capacity = 20, lashSlots = 4 } = {}) {
  const tent = entry('tent', 'Tent, 1-person', 'item', {
    quantity: tentQuantity, storedSize: 10, unitWeight: 10, cost: 5, tags: ['shelter']
  });
  const destination = makeActor('tent-destination', [bag('bag'), entry('purse', 'Coin Purse', 'container', { capacity: 20 }), entry('silver', 'Silver Coins', 'coin', { quantity: 20, cost: 1, storedSize: 0.04, containerId: 'purse' }), ...(internal ? [tent] : [])]);
  const source = internal ? destination : null;
  destination.items.get('bag').update({ 'system.capacity': capacity, 'system.lashSlots': lashSlots });
  boundary = 0;
  dragItem = internal ? destination.items.get('tent') : { actor: null, toObject: () => clone(tent) };
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors: new Map([[destination.id, destination]]), scenes: [], settings: { get: () => false } };
  globalThis.Item.implementation.fromDropData = async () => dragItem;
  const sheet = Object.create(CharacterSheet.prototype);
  sheet.actor = destination; sheet.handlers = new Map(); sheet._isStoreLocked = () => false;
  sheet._selectDropQuantity = async () => tentQuantity > 1 ? 1 : 1;
  return { destination, source, sheet, event: { target: { closest: () => null } } };
}

it('separates an owned tent through _onDropItem, preserving a partial whole stack', async () => {
  const f = tentDropFixture({ quantity: 2 });
  const errors = []; const warnings = []; const previousError = ui.notifications.error; const previousWarn = ui.notifications.warn; ui.notifications.error = message => errors.push(message); ui.notifications.warn = message => warnings.push(message);
  f.sheet.createDialog = dialog => { if (!dialog.buttons.separate) throw new Error(`No separation candidate: ${dialog.content}`); dialog.buttons.separate.callback({ find: () => ({ val: () => 'bag' }) }); return { render: () => {} }; };
  const result = await f.sheet._onDropItem(f.event, {}); ui.notifications.error = previousError; ui.notifications.warn = previousWarn;
  expect(result, [...errors, ...warnings].join('; ')).toBe(true);
  expect(quantity(f.destination, 'Tent, 1-person')).toBe(1);
  expect(quantity(f.destination, 'Tent Fabric, 1-person')).toBe(1);
  expect(quantity(f.destination, 'Tent Poles, 1-person')).toBe(1);
  expect(f.destination.items.contents.find(item => item.name === 'Tent Fabric, 1-person').system.containerId).toBe('bag');
  expect(f.destination.items.contents.find(item => item.name === 'Tent Poles, 1-person').system).toMatchObject({ containerId: 'bag', lashed: true });
});

it('separates a non-GM catalog tent purchase and charges five silver once', async () => {
  const f = tentDropFixture({ internal: false });
  f.sheet.createDialog = dialog => { if (!dialog.buttons.separate) throw new Error(`No separation candidate: ${dialog.content}`); dialog.buttons.separate.callback({ find: () => ({ val: () => 'bag' }) }); return { render: () => {} }; };
  const errors = []; const warnings = []; const previousError = ui.notifications.error; const previousWarn = ui.notifications.warn; ui.notifications.error = message => errors.push(message); ui.notifications.warn = message => warnings.push(message);
  const result = await f.sheet._onDropItem(f.event, {}); ui.notifications.error = previousError; ui.notifications.warn = previousWarn;
  expect(result, [...errors, ...warnings].join('; ')).toBe(true);
  expect(quantity(f.destination, 'Silver Coins')).toBe(15);
  expect(quantity(f.destination, 'Tent Fabric, 1-person')).toBe(1);
  expect(quantity(f.destination, 'Tent Poles, 1-person')).toBe(1);
});

it('cancels a tent separation without writes and shows no candidates when full', async () => {
  const f = tentDropFixture({ internal: false, capacity: 5, lashSlots: 0 });
  let dialogContent = '';
  f.sheet.createDialog = dialog => { dialogContent = dialog.content; dialog.buttons.cancel.callback(); return { render: () => {} }; };
  const before = snapshot(f.destination);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  expect(dialogContent).toMatch(/No Backpack currently has both enough internal capacity and a free lash slot/);
  expect(snapshot(f.destination)).toEqual(before);
  expect(boundary).toBe(0);
});

it('shows no separation candidate when all four Backpack lash slots are occupied', async () => {
  const f = tentDropFixture({ internal: false, capacity: 20, lashSlots: 4 });
  await f.destination.createEmbeddedDocuments('Item', [1, 2, 3, 4].map(index => entry(`lash-${index}`, `Load ${index}`, 'item', { containerId: 'bag', lashed: true, slotCost: 1 })));
  boundary = 0;
  let dialogContent = '';
  f.sheet.createDialog = dialog => { dialogContent = dialog.content; dialog.buttons.cancel.callback(); return { render: () => {} }; };
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  expect(dialogContent).toMatch(/No Backpack currently has both enough internal capacity and a free lash slot/);
  expect(f.destination.items.contents.some(item => item.name.startsWith('Tent '))).toBe(false);
  expect(boundary).toBe(0);
});

it('rejects a stale owned tent after the separation choice without committing components', async () => {
  const f = tentDropFixture();
  f.sheet.createDialog = ({ buttons }) => {
    f.destination.items.get('tent').update({ 'system.quantity': 2 });
    buttons.separate.callback({ find: () => ({ val: () => 'bag' }) });
    return { render: () => {} };
  };
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  expect(f.destination.items.contents.some(item => item.name === 'Tent Fabric, 1-person')).toBe(false);
  expect(f.destination.items.contents.some(item => item.name === 'Tent Poles, 1-person')).toBe(false);
});

it('rejects a stale Backpack after the separation choice without committing components', async () => {
  const f = tentDropFixture();
  f.sheet.createDialog = ({ buttons }) => {
    f.destination.items.get('bag').update({ 'system.capacity': 0 });
    buttons.separate?.callback({ find: () => ({ val: () => 'bag' }) });
    buttons.cancel?.callback();
    return { render: () => {} };
  };
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  expect(f.destination.items.contents.some(item => item.name === 'Tent Fabric, 1-person')).toBe(false);
  expect(f.destination.items.contents.some(item => item.name === 'Tent Poles, 1-person')).toBe(false);
});
it('dialog close cancels quantity selection', async () => {
  const original = globalThis.Dialog;
  globalThis.Dialog = class { constructor(data) { this.data = data; } render() { this.data.close(); } };
  const sheet = Object.create(CharacterSheet.prototype);
  expect(await sheet._selectDropQuantity(entry('incoming', 'Arrows', 'ammunition', { quantity: 5 }), 5, true)).toBeNull();
  globalThis.Dialog = original;
});
it('pending compensation is visible, blocks replay, and recovers safely', async () => {
  const f = fixture(); fault = new Set([3, 4]);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  const { getPendingTransaction, recoverTransaction } = await import('../../inventory/transaction-journal.js');
  expect(getPendingTransaction(f.destination)).toBeTruthy(); const stopped = boundary;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect(boundary).toBe(stopped);
  fault = null; game.user.isGM = true;
  expect((await recoverTransaction(f.destination)).outcome).toBe('restored');
  expect(quantity(f.destination, 'Silver Coins')).toBe(20); expect(quantity(f.destination, 'Arrows')).toBe(0);
});
it('carrier provisioning and payment recover together at every boundary', async () => {
  const setup = () => {
    const f = fixture(); selected = 1;
    f.destination.items.contents.push(makeActor('temporary', [entry('belt', 'Belt', 'clothing', { equipped: true, lashSlots: 6 })]).items.get('belt'));
    dragItem = { actor: null, toObject: () => entry('incoming', 'Dagger', 'weapon', { tags: ['dagger'], cost: 2, size: 'S', melee: true, damage: '1d4' }) };
    f.event.target.closest = () => null; return f;
  };
  let f = setup(); expect(await f.sheet._onDropItem(f.event, {})).toBe(true); const total = boundary;
  expect(quantity(f.destination, 'Dagger')).toBe(1); expect(quantity(f.destination, 'Scabbard, Dagger')).toBe(1); expect(quantity(f.destination, 'Silver Coins')).toBe(18);
  for (const after of [false, true]) for (let failed = 1; failed <= total; failed++) {
    sequence = 0; boundary = 0; f = setup(); const before = snapshot(f.destination); fault = failed; afterFault = after;
    await f.sheet._onDropItem(f.event, {}); fault = null;
    const { getPendingTransaction, recoverTransaction } = await import('../../inventory/transaction-journal.js');
    if (getPendingTransaction(f.destination)) { game.user.isGM = true; expect((await recoverTransaction(f.destination)).success).toBe(true); }
    if (quantity(f.destination, 'Dagger')) { expect(quantity(f.destination, 'Scabbard, Dagger')).toBe(1); expect(quantity(f.destination, 'Silver Coins')).toBe(18); }
    else expect(snapshot(f.destination)).toEqual(before);
  }
});

it('a GM catalog grant creates the selected quantity without payment', async () => {
  const f = fixture(); game.user.isGM = true;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(quantity(f.destination, 'Arrows')).toBe(3); expect(quantity(f.destination, 'Silver Coins')).toBe(20);
});
it('an unaffordable purchase discards placement and preserves coins', async () => {
  const f = fixture(); selected = 11; const before = snapshot(f.destination);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  expect(snapshot(f.destination)).toEqual(before); expect(boundary).toBe(0);
});
it('the store lock blocks purchases while permitting owned gifts', async () => {
  let f = fixture(); game.settings.get = () => true;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect(boundary).toBe(0);
  f = fixture('gift'); game.settings.get = () => true;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true); expect(quantity(f.destination, 'Silver Coins')).toBe(20);
});

it('rejects malformed descendant quantities without writing', async () => {
  const f = fixture('container'); await f.source.items.get('content').update({ 'system.quantity': 1.5 }); boundary = 0;
  const before = [snapshot(f.destination), snapshot(f.source)];
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect([snapshot(f.destination), snapshot(f.source)]).toEqual(before); expect(boundary).toBe(0);
});
it('rejects a malformed destination stack before any live mutation', async () => {
  const f = fixture('merge'); await f.destination.items.get('existing').update({ 'system.quantity': 1.5 }); boundary = 0;
  const before = [snapshot(f.destination), snapshot(f.source)];
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect([snapshot(f.destination), snapshot(f.source)]).toEqual(before); expect(boundary).toBe(0);
});
it('merging into an empty destination stack never adds an extra unit', async () => {
  const f = fixture('merge'); await f.destination.items.get('existing').update({ 'system.quantity': 0 }); boundary = 0;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(quantity(f.destination, 'Arrows')).toBe(3); expect(quantity(f.source, 'Arrows')).toBe(2);
});

it('an internal populated container keeps its identity and descendants when a matching container exists', async () => {
  const f = fixture(); selected = 1;
  const incoming = makeActor('temporary', [entry('incoming', 'Sidesack', 'container', { capacity: 40, containerSize: 'small' })]).items.get('incoming'); incoming.actor = f.destination;
  f.destination.items.contents.push(incoming, makeActor('temporary', [entry('existing', 'Sidesack', 'container', { containerId: 'bag', capacity: 40, containerSize: 'small' })]).items.get('existing'), makeActor('temporary', [entry('content', 'Rope', 'item', { containerId: 'incoming' })]).items.get('content'));
  dragItem = incoming;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(f.destination.items.get('incoming').system.containerId).toBe('bag');
  expect(f.destination.items.get('content').system.containerId).toBe('incoming');
  expect(quantity(f.destination, 'Sidesack')).toBe(2);
});

for (const property of ['cost', 'magicBonus', 'custom', 'flags']) it(`keeps same-name transferred stacks separate for ${property} differences`, async () => {
  const f = fixture('merge'); const existing = f.destination.items.get('existing'); const incoming = f.source.items.get('incoming');
  const key = property === 'flags' ? 'flags' : `system.${property}`;
  await existing.update({ [key]: property === 'flags' ? { module: { blessing: 1 } } : 1 });
  await incoming.update({ [key]: property === 'flags' ? { module: { blessing: 2 } } : 2 });
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(existing.system.quantity).toBe(2); const added = f.destination.items.find(item => item.name === 'Arrows' && item.id !== 'existing');
  expect(added.system.quantity).toBe(3); expect(incoming.system.quantity).toBe(2);
  if (property === 'flags') expect(added.toObject().flags).toEqual({ module: { blessing: 2 } }); else expect(added.system[property]).toBe(2);
});
it('never merges unique inventory copies when either side is unique', async () => {
  for (const side of ['source', 'destination', 'both']) {
    const f = fixture('merge'); selected = 1;
    if (side !== 'destination') await f.source.items.get('incoming').update({ 'system.tags': ['unique'] });
    if (side !== 'source') await f.destination.items.get('existing').update({ 'system.tags': ['unique'] });
    expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
    expect(f.destination.items.get('existing').system.quantity).toBe(2);
    expect(f.destination.items.filter(item => item.name === 'Arrows')).toHaveLength(2);
  }
});

it('stows only equivalent consumable weapons and preserves the complete moved quantity', async () => {
  const { ItemHandler } = await import('./handlers/item-handler.js');
  for (const different of [false, true]) {
    const stored = entry('stored', 'Dart', 'weapon', { quantity: 2, containerId: 'bag', tags: ['consumable'], magicBonus: 1 });
    const readied = entry('readied', 'Dart', 'weapon', { quantity: 3, equipped: true, tags: ['consumable'], magicBonus: different ? 2 : 1 });
    const owner = makeActor('stower', [bag('bag'), stored, readied]);
    const handler = new ItemHandler(null, owner, {}); handler.getItemFromEvent = () => owner.items.get('readied');
    await handler.onItemToggle({ preventDefault: () => {}, stopPropagation: () => {} });
    expect(quantity(owner, 'Dart')).toBe(5);
    if (different) { expect(owner.items.get('stored').system.quantity).toBe(2); expect(owner.items.get('readied').system.magicBonus).toBe(2); }
    else { expect(owner.items.get('stored').system.quantity).toBe(5); expect(owner.items.get('readied')).toBeUndefined(); }
  }
});

it('manually equips Coat, Winter alongside Adventurer\'s Clothes', async () => {
  const owner = makeActor('outerwear', [
    entry('clothes', "Clothes, Adventurer's", 'clothing', { equipped: true, capacity: 3 }),
    entry('coat', 'Coat, Winter', 'clothing', { containerId: 'bag', capacity: 2, slot: 'outerwear' }),
    bag('bag'),
  ]);
  const handler = new ItemHandler(null, owner, {});
  handler.getItemFromEvent = () => owner.items.get('coat');
  await handler.onItemToggle({ preventDefault() {}, stopPropagation() {} });
  expect(owner.items.get('clothes').system.equipped).toBe(true);
  expect(owner.items.get('coat').system).toMatchObject({ equipped: true, containerId: null, lashed: false });
});

it('rejects a second equipped outerwear item without changing either item', async () => {
  const owner = makeActor('outerwear-conflict', [
    entry('first', 'Coat, Winter', 'clothing', { equipped: true, capacity: 2, slot: 'outerwear' }),
    entry('second', 'Coat, Winter', 'clothing', { equipped: false, containerId: 'bag', capacity: 2, slot: 'outerwear' }),
    bag('bag'),
  ]);
  const handler = new ItemHandler(null, owner, {});
  handler.getItemFromEvent = () => owner.items.get('second');
  await handler.onItemToggle({ preventDefault() {}, stopPropagation() {} });
  expect(owner.items.get('first').system.equipped).toBe(true);
  expect(owner.items.get('second').system).toMatchObject({ equipped: false, containerId: 'bag' });
});

it('wears an incoming cloak on open Gear space when its slot is free', async () => {
  const f = fixture('gift');
  dragItem = { actor: null, toObject: () => entry('cloak', 'Cloak', 'clothing', { storedSize: 4, capacity: 2 }) };
  f.event.target.closest = () => null;
  selected = 1;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  const cloak = f.destination.items.find(item => item.name === 'Cloak');
  expect(cloak.system.equipped).toBe(true);
  expect(cloak.system.containerId).toBeNull();
});

it('wears Coat, Winter over Adventurer\'s Clothes on open Gear space', async () => {
  const f = fixture('gift');
  selected = 1;
  addOwned(f, [entry('clothes', "Clothes, Adventurer's", 'clothing', { equipped: true, capacity: 3 })]);
  dragItem = { actor: null, toObject: () => entry('coat', 'Coat, Winter', 'clothing', {
    storedSize: 5, capacity: 2, slot: 'outerwear',
  }) };
  pointAt(f);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(f.destination.items.get('clothes').system.equipped).toBe(true);
  expect(f.destination.items.find(item => item.name === 'Coat, Winter').system).toMatchObject({
    equipped: true, containerId: null, lashed: false,
  });
});

it('offers a placement chooser for an occupied wearable slot and Cancel leaves snapshots unchanged', async () => {
  const f = fixture('gift');
  f.destination.items.contents.push(makeActor('temporary', [entry('worn-cloak', 'Cloak', 'clothing', { equipped: true, capacity: 2, storedSize: 4 })]).items.get('worn-cloak'));
  dragItem = { actor: null, toObject: () => entry('incoming-cloak', 'Cloak', 'clothing', { storedSize: 4, capacity: 2 }) };
  f.event.target.closest = () => null;
  f.sheet.createDialog = config => ({ render: () => config.buttons.cancel.callback() });
  const before = snapshot(f.destination);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  expect(snapshot(f.destination)).toEqual(before);
  expect(boundary).toBe(0);
});

it('a populated container requires room for its recursive bulk footprint', async () => {
  const f = fixture('container');
  await f.destination.items.get('bag').update({ 'system.capacity': 1 });
  const sourceCount = f.source.items.contents.length;
  boundary = 0;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  expect(f.destination.items.find(item => item.name === 'Sidesack')).toBeUndefined();
  expect(f.source.items.contents).toHaveLength(sourceCount);
});
it('a hidden-capacity nested host never propagates its contents to the outer container', () => {
  const f = fixture('internal');
  const host = { id: 'host', type: 'container', system: { containerId: 'bag', storedSize: 2, quantity: 1, hideCapacity: true } };
  expect(f.sheet._getHiddenCapacityParentRejection({ type: 'item', system: { storedSize: 999, quantity: 1 } }, host, false)).toBeNull();
});

// Each physical template type traverses the real staged catalog/transfer entry point.
for (const type of ['weapon', 'armor', 'item', 'container', 'coin', 'clothing', 'ammunition', 'livestock']) {
  for (const route of ['catalog', 'move']) it(`BR20 ${type}: ${route} preserves custom data and quantity`, async () => {
    const f = fixture(route === 'catalog' ? 'purchase' : 'gift'); selected = 1;
    await f.destination.items.get('bag').update({ name: 'Storage Chest', 'system.blockedTypes': [] });
    const data = entry('incoming', `Fixture ${type}`, type, { quantity: 1, cost: 1, custom: { inscription: 'preserve' } });
    if (route === 'catalog') dragItem = { actor: null, toObject: () => clone(data) };
    else {
      const source = makeActor('typed-source', [data]); f.actors.set(source.id, source); dragItem = source.items.get('incoming');
    }
    boundary = 0;
    expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
    const added = f.destination.items.find(item => item.name === data.name);
    expect(added.type).toBe(type); expect(added.system.quantity).toBe(1);
    expect(added.system.custom).toEqual({ inscription: 'preserve' });
    if (route === 'move') expect(dragItem.actor.items.get('incoming')).toBeUndefined();
  });
}
for (const type of ['spell', 'ability']) it(`BR20 ${type}: rejects physical storage without writes`, async () => {
  const f = fixture(); selected = 1;
  dragItem = { actor: null, toObject: () => entry('incoming', 'Nonphysical', type) };
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect(boundary).toBe(0);
});
it('BR20 rejects existing and newly introduced container cycles without writes', async () => {
  const f = fixture('internal'); selected = 1;
  await f.destination.items.get('purse').update({ 'system.containerId': 'bag' });
  dragItem = f.destination.items.get('bag');
  f.event.target.closest = selector => selector.includes('[data-item-id]') ? { dataset: { itemId: 'purse' } } : null;
  boundary = 0;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect(boundary).toBe(0);
  await f.destination.items.get('bag').update({ 'system.containerId': 'purse' }); boundary = 0;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect(boundary).toBe(0);
});

for (const route of ['tack', 'ammunition', 'vehicle', 'sling', 'belt']) it(`BR20 commits the ${route} destination route and rejects invalid admission`, async () => {
  const f = fixture(); selected = 1;
  const targets = {
    tack: entry('target', 'Mule', 'livestock', { tags: ['pack animal'], animalSize: 'large' }),
    ammunition: entry('target', 'Bolt Case', 'container', { capacity: 6, allowedTypes: ['bolts'] }),
    vehicle: entry('target', 'Cart', 'container', { capacity: 2, tags: ['vehicle'] }),
    sling: entry('target', 'Baldric', 'container', { capacity: 2, tags: ['sling'], allowedNames: ['Greatsword'] }),
    belt: entry('target', 'Belt', 'clothing', { equipped: true, lashSlots: 1 }),
  };
  const inputs = {
    tack: entry('incoming', 'Saddle, Pack', 'container', { tags: ['tack', 'pack animal'], tackSlot: 'saddle', lashSlots: 4 }),
    ammunition: entry('incoming', 'Crossbow Bolt, Light', 'ammunition', { tags: ['bolts'], storedSize: .2, unitWeight: .1, cost: .3 }),
    vehicle: entry('incoming', 'Crate', 'item', { storedSize: 2 }),
    sling: entry('incoming', 'Greatsword', 'weapon', { tags: ['sword'], allowedContainers: ['Baldric'] }),
    belt: entry('incoming', 'Belt Pouch (S)', 'container', { capacity: 2, lashable: true, slotCost: 1 }),
  };
  f.destination.items.contents.push(makeActor('temporary', [targets[route]]).items.get('target'));
  f.event.target.closest = selector => selector.includes('[data-item-id]') ? { dataset: { itemId: 'target' } } : null;
  dragItem = { actor: null, toObject: () => clone(inputs[route]) };
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  const added = f.destination.items.find(item => item.name === inputs[route].name);
  expect(added.system.containerId).toBe('target');
  if (route === 'belt') expect(added.system.lashed).toBe(true);
  if (route === 'ammunition') { expect(added.system.quantity).toBe(20); expect(added.flags?.['osp-houserules']?.protectedBoltBundle).not.toBe(true); }
  const invalid = clone(inputs[route]); invalid.name = 'Incompatible entry';
  if (route === 'ammunition') invalid.system.tags = ['arrows'];
  if (route === 'vehicle') invalid.system.tags = ['no-vehicle-store'];
  dragItem = { actor: null, toObject: () => invalid }; boundary = 0;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false); expect(boundary).toBe(0);
});

it('BR20 preserves normalized object quantities through a partial transfer', async () => {
  const f = fixture('gift'); selected = 2;
  await f.source.items.get('incoming').update({ 'system.quantity': { value: 5 } });
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(quantity(f.source, 'Arrows')).toBe(3); expect(quantity(f.destination, 'Arrows')).toBe(2);
});
it('BR20 lash fallback counts slot costs and rejects oversize or unworn mounts', () => {
  const f = fixture();
  f.destination.items.contents.length = 0;
  f.destination.items.contents.push(...makeActor('temporary', [
    entry('belt', 'Belt', 'clothing', { lashSlots: 2, equipped: false }),
    entry('mount', 'Lash Host', 'container', { lashSlots: 3 }),
    entry('attached', 'Bundle', 'item', { containerId: 'mount', lashed: true, slotCost: 2 }),
  ]).items.contents);
  expect(f.sheet._findContainerWithLashSlot(entry('incoming', 'Large Bundle', 'item', { slotCost: 2 }))).toBeNull();
  expect(f.sheet._findContainerWithLashSlot(entry('incoming', 'Small Bundle', 'item', { slotCost: 1 })).id).toBe('mount');
});

// Destination-aware placement: exercise the real staged planner and commit boundary.
const addOwned = (f, entries) => {
  const added = makeActor('temporary', entries).items.contents;
  for (const item of added) item.actor = f.destination;
  f.destination.items.contents.push(...added);
  return added;
};
const pointAt = (f, id = null) => { f.event.target.closest = selector => id && selector.includes('[data-item-id]') ? {dataset:{itemId:id}} : null; };
const chooser = (f, choose = null) => {
  const calls = [];
  f.sheet._showDropPlacementDialog = async (_item, reason, candidates) => { calls.push({reason,candidates}); return choose; };
  return calls;
};
it('offers ordinary stow and compatible vehicle attachment choices for a direct vehicle drop', async () => {
  const f = fixture(); selected = 1;
  addOwned(f, [entry('cart', 'Cart', 'container', { capacity: 10, tags: ['vehicle'] })]);
  pointAt(f, 'cart');
  dragItem = { actor: null, toObject: () => entry('wheel', 'Spare Wheel, Cart', 'item', { storedSize: 1, vehicleAttachmentKind: 'cart-wheel' }) };
  const calls = chooser(f);
  const virtual = '__vehicle__:';
  calls.push;
  f.sheet._showDropPlacementDialog = async (_item, _reason, candidates) => {
    calls.push({ candidates });
    return candidates.find(candidate => candidate.id.startsWith(virtual))?.id || 'cart';
  };
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  const added = f.destination.items.find(item => item.name === 'Spare Wheel, Cart');
  expect(added.system).toMatchObject({ containerId: 'cart', lashed: false, vehicleAttachment: { mode: 'lashed', position: 'rear-rail' } });
});
it.each(['Cloak','Boots','Belt','Bracers','Gloves','Robes','Clothes, Commoner\'s'])('silently wears %s in a free slot', async name => {
  const f=fixture(); selected=1; pointAt(f); const calls=chooser(f);
  dragItem={actor:null,toObject:()=>entry('new',name,'clothing')};
  expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  expect(calls).toHaveLength(0);
  expect(f.destination.items.find(item=>item.name===name).system).toMatchObject({equipped:true,containerId:null});
});
it('stores a second cloak in the chosen container without replacing the worn cloak',async()=>{
  const f=fixture(); selected=1; pointAt(f);
  addOwned(f,[entry('old','Cloak','clothing',{equipped:true})]);
  dragItem={actor:null,toObject:()=>entry('new','Cloak','clothing')};
  const calls=chooser(f,'bag');
  expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  expect(calls).toHaveLength(1); expect(calls[0].candidates.some(c=>c.id==='bag')).toBe(true);
  expect(calls[0].candidates.some(c=>c.id==='__open_gear__')).toBe(false);
  expect(f.destination.items.get('old').system.equipped).toBe(true);
  expect(f.destination.items.find(item=>item.name==='Cloak'&&item.id!=='old').system).toMatchObject({equipped:false,containerId:'bag'});
});
it('stores worn clothing without losing its contents, then wears it again on open Gear',async()=>{
  const f=fixture('internal'); selected=1;
  const [cloak]=addOwned(f,[entry('cloak','Cloak','clothing',{equipped:true,capacity:5}),entry('pocket','Tinder Box','item',{containerId:'cloak'})]);
  dragItem=cloak; const calls=chooser(f);
  expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  expect(cloak.system).toMatchObject({equipped:false,containerId:'bag'});
  expect(f.destination.items.get('pocket').system.containerId).toBe('cloak');
  pointAt(f); expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  expect(cloak.system).toMatchObject({equipped:true,containerId:null});
  expect(f.destination.items.get('pocket').system.containerId).toBe('cloak');
  expect(calls).toHaveLength(0);
});
it('rejects full or incompatible explicit storage with a chooser and zero writes on Cancel',async()=>{
  for(const blocked of [false,true]){
    const f=fixture('gift'); selected=1;
    dragItem={actor:null,toObject:()=>entry('new','Robes','clothing',{storedSize:4})};
    await f.destination.items.get('bag').update(blocked?{'system.blockedTypes':['clothing']}:{'system.capacity':1});
    boundary=0; const before=snapshot(f.destination); const calls=chooser(f);
    expect(await f.sheet._onDropItem(f.event,{})).toBe(false);
    expect(calls).toHaveLength(1); expect(calls[0].candidates.some(c=>c.id==='bag')).toBe(false);
    expect(calls[0].candidates.some(c=>c.id==='__open_gear__')).toBe(true);
    expect(snapshot(f.destination)).toEqual(before); expect(boundary).toBe(0);
  }
});
it('uses the wearable alternative after an invalid container drop',async()=>{
  const f=fixture(); selected=1; await f.destination.items.get('bag').update({'system.blockedTypes':['clothing']}); boundary=0;
  dragItem={actor:null,toObject:()=>entry('new','Robes','clothing')}; chooser(f,'__open_gear__');
  expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  expect(f.destination.items.find(item=>item.name==='Robes').system).toMatchObject({equipped:true,containerId:null});
});
it('prompts before moving a stack and accepts the full-stack choice',async()=>{
  const f=fixture('gift'); let dialogs=0;
  f.sheet._selectDropQuantity=async (_item, _available, prompt)=>{ dialogs += prompt ? 1 : 0; return 5; };
  const calls=chooser(f);
  expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  expect(quantity(f.destination,'Arrows')).toBe(5); expect(f.source.items.contents).toHaveLength(0);
  expect(dialogs).toBe(1); expect(calls).toHaveLength(0);
});
it('does not create loose cargo when a chest is dropped on open Gear',async()=>{
  const f=fixture(); selected=1; pointAt(f); dragItem={actor:null,toObject:()=>entry('chest','Chest','container',{capacity:20})};
  const calls=chooser(f); const before=snapshot(f.destination);
  expect(await f.sheet._onDropItem(f.event,{})).toBe(false); expect(calls).toHaveLength(1);
  expect(calls[0].candidates.some(c=>c.id==='__open_gear__')).toBe(false);
  expect(snapshot(f.destination)).toEqual(before); expect(boundary).toBe(0);
});
it('offers storage instead of allowing a wand to exceed the hand budget',async()=>{
  const f=fixture(); selected=1; pointAt(f); addOwned(f,[entry('held-a','Sword','weapon',{equipped:true}),entry('held-b','Dagger','weapon',{equipped:true})]);
  dragItem={actor:null,toObject:()=>entry('wand','Wand','item',{tags:['wand']})}; const calls=chooser(f);
  expect(await f.sheet._onDropItem(f.event,{})).toBe(false); expect(calls).toHaveLength(1);
  expect(calls[0].candidates.some(c=>c.id==='__open_gear__')).toBe(false); expect(calls[0].reason).toMatch(/hands/i); expect(boundary).toBe(0);
});
it('offers a compatible animal after tack is dropped on open Gear',async()=>{
  const f=fixture(); selected=1; pointAt(f); addOwned(f,[entry('mule','Mule','livestock',{tags:['pack animal'],animalSize:'large'})]);
  dragItem={actor:null,toObject:()=>entry('saddle','Saddle, Pack','container',{tags:['tack','pack animal'],tackSlot:'saddle',lashSlots:4})}; const calls=chooser(f,'mule');
  expect(await f.sheet._onDropItem(f.event,{})).toBe(true); expect(calls[0].candidates.some(c=>c.id==='mule')).toBe(true);
  expect(f.destination.items.find(item=>item.name==='Saddle, Pack').system.containerId).toBe('mule');
});
it('rejects a cloak dragged into its own pocket without breaking links',async()=>{
  const f=fixture('internal'); selected=1; const [cloak]=addOwned(f,[entry('cloak','Cloak','clothing',{equipped:true,capacity:5}),entry('child','Tinder Box','item',{containerId:'cloak'})]);
  dragItem=cloak; pointAt(f,'child'); const calls=chooser(f); const before=snapshot(f.destination);
  expect(await f.sheet._onDropItem(f.event,{})).toBe(false); expect(calls).toHaveLength(1);
  expect(snapshot(f.destination)).toEqual(before); expect(boundary).toBe(0);
});

it('moves a vehicle attachment back to ordinary cargo and frees its position',async()=>{
 const f=fixture();selected=1;
 addOwned(f,[entry('wagon','Wagon','container',{capacity:200,tags:['vehicle']}),entry('wheel','Spare Wheel, Wagon','item',{containerId:'wagon',vehicleAttachment:{mode:'lashed',position:'left'},vehicleAttachmentKind:'wagon-wheel'})]);
 dragItem=f.destination.items.get('wheel');pointAt(f,'bag');
 expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
 expect(f.destination.items.get('wheel').system).toMatchObject({containerId:'bag',lashed:false});
 expect(f.destination.items.get('wheel').system.vehicleAttachment).toBeFalsy();
 const {getVehicleAttachmentOptions}=await import('../../inventory/vehicle-lashing.js');
 expect(getVehicleAttachmentOptions(entry('new','Spare Wheel, Wagon','item'),f.destination.items.get('wagon'),f.destination.items.contents).some(x=>x.position==='left')).toBe(true);
});
it('cancelled direct vehicle attachment selection makes no inventory or coin writes',async()=>{
 const f=fixture();selected=1;addOwned(f,[entry('wagon','Wagon','container',{capacity:200,tags:['vehicle']})]);pointAt(f,'wagon');
 dragItem={actor:null,toObject:()=>entry('wheel','Spare Wheel, Wagon','item',{cost:10})};
 const before=snapshot(f.destination);boundary=0;f.sheet._showDropPlacementDialog=async()=>null;
 expect(await f.sheet._onDropItem(f.event,{})).toBe(false);expect(snapshot(f.destination)).toEqual(before);expect(boundary).toBe(0);
});

it.each(['internal', 'gift', 'purchase'])('lashes only one wheel from a two-item %s stack', async kind => {
 const f=fixture(); selected=2; const messages=[]; ui.notifications.error=message=>messages.push(message);
 addOwned(f,[entry('wagon','Wagon','container',{capacity:200,tags:['vehicle']})]);
 const wheels=entry('wheels','Spare Wheel, Wagon','item',{quantity:2,cost:3});
 let source;
 if(kind==='internal') { wheels.system.containerId='wagon'; addOwned(f,[wheels]); source=f.destination; dragItem=source.items.get('wheels'); }
 else if(kind==='gift') { source=makeActor('wheel-giver',[wheels]); f.actors.set(source.id,source); dragItem=source.items.get('wheels'); }
 else dragItem={actor:null,toObject:()=>clone(wheels)};
 pointAt(f,'wagon');
 const {parseVehicleDestination}=await import('../../inventory/vehicle-lashing.js');
 f.sheet._showDropPlacementDialog=async(_item,reason,candidates)=>{messages.push(JSON.stringify({reason,candidates}));return candidates.find(candidate=>parseVehicleDestination(candidate.id)?.position==='left')?.id;};
 expect(await f.sheet._onDropItem(f.event,{}),messages.join("; ")).toBe(true);
 const attached=f.destination.items.filter(item=>item.system.vehicleAttachment);
 expect(attached).toHaveLength(1);
 expect(attached[0].system).toMatchObject({quantity:1,containerId:'wagon',vehicleAttachment:{mode:'lashed',position:'left'}});
 expect(quantity(f.destination,'Silver Coins')).toBe(kind==='purchase'?17:20);
 if(source) expect(source.items.get('wheels').system.quantity).toBe(1);
 if(kind==='internal') {
  selected=1; dragItem=source.items.get('wheels');
  f.sheet._showDropPlacementDialog=async(_item,_reason,candidates)=>candidates.find(candidate=>parseVehicleDestination(candidate.id)?.position==='right')?.id;
  expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  expect(f.destination.items.filter(item=>item.system.vehicleAttachment).map(item=>item.system.quantity)).toEqual([1,1]);
  expect(quantity(f.destination,'Spare Wheel, Wagon')).toBe(2);
 }
});

it('rejects both back-slot equip directions without mutating a conflicting inventory', async () => {
  for (const [wornName, incomingName] of [['Backpack', 'Quiver'], ['Quiver', 'Backpack']]) {
    const actor = makeActor(`back-${wornName}`, [
      entry('worn', wornName, 'container', { equipped: true, capacity: 20 }),
      entry('incoming', incomingName, 'container', { containerId: 'worn', equipped: false, capacity: 20 }),
    ]);
    const item = actor.items.get('incoming');
    const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor;
    const handler = new ItemHandler(null, actor, sheet);
    handler.getItemFromEvent = () => item;
    const before = snapshot(actor);
    const errors = [];
    const previousError = ui.notifications.error;
    ui.notifications.error = message => errors.push(message);
    await handler.onItemToggle({ preventDefault() {}, stopPropagation() {} });
    ui.notifications.error = previousError;
    expect(snapshot(actor)).toEqual(before);
    expect(errors[0]).toMatch(/already worn/);
  }
});

it('allows a Hip Quiver equip when no back-slot conflict exists', async () => {
  const actor = makeActor('hip-quiver', [entry('hip', 'Quiver, Hip', 'container', { capacity: 12, equipped: false })]);
  const item = actor.items.get('hip');
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor;
  const handler = new ItemHandler(null, actor, sheet);
  handler.getItemFromEvent = () => item;
  await handler.onItemToggle({ preventDefault() {}, stopPropagation() {} });
  expect(item.system).toMatchObject({ equipped: true, containerId: null });
});

it('allows a legacy standard Quiver to lash to a Backpack at exactly one slot', () => {
  const backpack = entry('pack', 'Backpack', 'container', { lashSlots: 4 });
  const quiver = entry('quiver', 'Quiver +1', 'container', { lashable: false, slotCost: 2 });
  expect(backpackLashDecision(quiver, backpack)).toMatchObject({ allowed: true });
  expect(getLashSlotCost(quiver, backpack)).toBe(1);
  expect(getLashSlotCost(quiver, { name: 'Belt', type: 'clothing' })).toBe(2);
  expect(getLashSlotCost(entry('hip', 'Quiver, Hip', 'container', { slotCost: 2 }), backpack)).toBe(2);
});

it('manually lashes a legacy Quiver to a Backpack instead of routing it to the belt', async () => {
  const actor = makeActor('manual-quiver-lash', [
    entry('pack', 'Backpack', 'container', { lashSlots: 4 }),
    entry('belt', 'Belt', 'clothing', { equipped: true, lashSlots: 6 }),
    entry('quiver', 'Quiver', 'container', { lashable: false, slotCost: 2 }),
  ]);
  const quiver = actor.items.get('quiver');
  const handler = new ItemHandler(null, actor, null);
  handler.getItemFromEvent = () => quiver;
  await handler.onItemLashToggle({ preventDefault() {}, stopPropagation() {} });
  expect(quiver.system).toMatchObject({ containerId: 'pack', lashed: true });
  expect(actor.items.get('belt').system.containerId).toBeNull();
});

it('manually rejects a legacy Quiver when every Backpack lash slot is occupied', async () => {
  const actor = makeActor('manual-full-quiver-lash', [
    entry('pack', 'Backpack', 'container', { lashSlots: 4 }),
    entry('load-1', 'Rope', 'item', { containerId: 'pack', lashed: true, slotCost: 1 }),
    entry('load-2', 'Torch', 'item', { containerId: 'pack', lashed: true, slotCost: 1 }),
    entry('load-3', 'Crowbar', 'item', { containerId: 'pack', lashed: true, slotCost: 1 }),
    entry('load-4', 'Shovel', 'item', { containerId: 'pack', lashed: true, slotCost: 1 }),
    entry('quiver', 'Quiver', 'container', { lashable: false, slotCost: 2 }),
  ]);
  const quiver = actor.items.get('quiver');
  const handler = new ItemHandler(null, actor, null);
  handler.getItemFromEvent = () => quiver;
  boundary = 0;
  await handler.onItemLashToggle({ preventDefault() {}, stopPropagation() {} });
  expect(boundary).toBe(0);
  expect(quiver.system).toMatchObject({ containerId: null, lashed: false });
});

it('opens the unlash choice for a Quiver on a Backpack instead of storing it internally', async () => {
  const actor = makeActor('manual-quiver-unlash', [
    entry('pack', 'Backpack', 'container', { capacity: 20, lashSlots: 4 }),
    entry('quiver', 'Quiver', 'container', { containerId: 'pack', lashed: true, lashable: false, slotCost: 2 }),
  ]);
  const quiver = actor.items.get('quiver');
  const handler = new ItemHandler(null, actor, null);
  handler.getItemFromEvent = () => quiver;
  let dialogItem = null;
  handler._showUnlashContainerDialog = async item => { dialogItem = item; return false; };
  await handler.onItemLashToggle({ preventDefault() {}, stopPropagation() {} });
  expect(dialogItem).toBe(quiver);
  expect(quiver.system).toMatchObject({ containerId: 'pack', lashed: true });
});

it('offers and commits a legacy Quiver lash through the real Backpack drop path', async () => {
  const actor = makeActor('legacy-quiver-drop', [
    entry('pack', 'Backpack', 'container', { lashSlots: 4 }),
    entry('quiver', 'Quiver', 'container', { lashable: false, slotCost: 2 }),
  ]);
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors: new Map([[actor.id, actor]]), scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
  const quiver = actor.items.get('quiver');
  dragItem = quiver;
  globalThis.Item.implementation.fromDropData = async () => quiver;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor; sheet.handlers = new Map();
  sheet._selectDropQuantity = async () => 1; sheet.loadProfileData = async () => ({ classes: [] });
  sheet._gearDragItemId = quiver.id;
  expect(sheet._gearMoveCandidates(quiver)).toContainEqual({ id: 'pack', mode: 'lash', label: 'Lash to Backpack' });
  const event = { target: { closest: () => ({ dataset: { itemId: 'pack' } }) } };
  expect(await sheet._onDropItem(event, {})).toBe(true);
  expect(quiver.system).toMatchObject({ containerId: 'pack', lashed: true, lashable: false, slotCost: 2 });
});

it('rejects a Quiver lash on a full Backpack without changing the item', async () => {
  const actor = makeActor('full-quiver-drop', [
    entry('pack', 'Backpack', 'container', { lashSlots: 4 }),
    entry('load-1', 'Rope', 'item', { containerId: 'pack', lashed: true, slotCost: 1 }),
    entry('load-2', 'Torch', 'item', { containerId: 'pack', lashed: true, slotCost: 1 }),
    entry('load-3', 'Crowbar', 'item', { containerId: 'pack', lashed: true, slotCost: 1 }),
    entry('load-4', 'Shovel', 'item', { containerId: 'pack', lashed: true, slotCost: 1 }),
    entry('quiver', 'Quiver', 'container', { lashable: false, slotCost: 2 }),
  ]);
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors: new Map([[actor.id, actor]]), scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
  const quiver = actor.items.get('quiver'); dragItem = quiver;
  globalThis.Item.implementation.fromDropData = async () => quiver;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor; sheet.handlers = new Map();
  sheet._selectDropQuantity = async () => 1; sheet.loadProfileData = async () => ({ classes: [] });
  const before = snapshot(actor);
  const event = { target: { closest: () => ({ dataset: { itemId: 'pack' } }) } };
  expect(await sheet._onDropItem(event, {})).toBe(false);
  expect(snapshot(actor)).toEqual(before);
});

it('moves a populated Quiver externally while preserving its arrows and identity', async () => {
  const actor = makeActor('populated-quiver-drop', [
    entry('pack', 'Backpack', 'container', { lashSlots: 4 }),
    entry('quiver', 'Quiver', 'container', { lashable: false, slotCost: 0, capacity: 5, allowedTypes: ['arrows'] }),
    entry('loaded', 'Arrows', 'ammunition', { quantity: 3, storedSize: 0.25, tags: ['arrows'], containerId: 'quiver' }),
  ]);
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors: new Map([[actor.id, actor]]), scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
  const quiver = actor.items.get('quiver'); const loaded = actor.items.get('loaded');
  dragItem = quiver; globalThis.Item.implementation.fromDropData = async () => quiver;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor; sheet.handlers = new Map();
  sheet._selectDropQuantity = async () => 1; sheet.loadProfileData = async () => ({ classes: [] });
  const move = { target: { closest: () => ({ dataset: { itemId: 'pack' } }) } };
  expect(await sheet._onDropItem(move, {})).toBe(true);
  expect(quiver.id).toBe('quiver');
  expect(loaded.system.containerId).toBe('quiver');
  expect(quiver.system).toMatchObject({ containerId: 'pack', lashed: true });
});

it('moves only the requested partial arrow quantity into a full-capacity Hip Quiver stack', async () => {
  const f = fixture('gift');
  const hip = entry('hip', 'Quiver, Hip', 'container', { capacity: 12, allowedTypes: ['arrows'], equipped: true });
  const existing = entry('hip-arrows', 'Arrows', 'ammunition', { quantity: 10, storedSize: 1, tags: ['arrows'], containerId: 'hip' });
  addOwned(f, [hip, existing]);
  dragItem = f.source.items.get('incoming');
  await dragItem.update({ name: 'Arrows', system: { quantity: 20, storedSize: 1, tags: ['arrows'] } });
  // Target the existing nested arrow row, as the live slung Quiver DOM does.
  // The planner must resolve its parent Quiver rather than a generic container.
  pointAt(f, 'hip-arrows');
  f.sheet._selectDropQuantity = async () => 2;
  const calls = chooser(f);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(calls).toHaveLength(0);
  expect(f.destination.items.get('hip-arrows').system.quantity).toBe(12);
  expect(f.source.items.get('incoming').system.quantity).toBe(18);
});

it('cancels or rejects an explicit full Quiver target without a fallback chooser', async () => {
  const f = fixture('gift');
  const hip = entry('hip', 'Quiver, Hip', 'container', { capacity: 12, allowedTypes: ['arrows'], equipped: true });
  addOwned(f, [hip, entry('hip-arrows', 'Arrows', 'ammunition', { quantity: 12, storedSize: 1, tags: ['arrows'], containerId: 'hip' })]);
  dragItem = f.source.items.get('incoming');
  await dragItem.update({ name: 'Arrows', system: { quantity: 20, storedSize: 1, tags: ['arrows'] } });
  pointAt(f, 'hip');
  const before = [snapshot(f.destination), snapshot(f.source)];
  const calls = chooser(f, 'bag');
  const errors = [];
  const previousError = ui.notifications.error;
  ui.notifications.error = message => errors.push(message);
  f.sheet._selectDropQuantity = async () => 1;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  ui.notifications.error = previousError;
  expect(calls).toHaveLength(0);
  expect(errors[0]).toMatch(/room|space|full/i);
  expect([snapshot(f.destination), snapshot(f.source)]).toEqual(before);
});

it('slung back-slot probe rejects Backpack plus Quiver without throwing', () => {
  const f = fixture('internal');
  const backpack = f.destination.items.get('bag');
  backpack.system.equipped = true;
  const quiver = addOwned(f, [entry('quiver', 'Quiver', 'container', { equipped: false, tags: ['slungable'] })])[0];
  f.sheet._gearDragItemId = quiver.id;
  expect(f.sheet._getSlungDropValidity()).toMatchObject({ valid: false });
});

it('rejects a dagger and scabbard bundle that exceeds clothing capacity atomically', async () => {
  const destination = makeActor('clothing-buyer', [
    entry('clothes', "Adventurer's Clothes", 'clothing', { equipped: true, capacity: 3 }),
  ]);
  const source = makeActor('clothing-giver', [
    entry('sheath', 'Scabbard, Dagger', 'container', { storedSize: 2 }),
    entry('dagger', 'Dagger', 'weapon', { containerId: 'sheath', storedSize: 3, tags: ['dagger'] }),
  ]);
  const actors = new Map([[destination.id, destination], [source.id, source]]);
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors, scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => [...actors.values()].find(actor => actor.uuid === uuid);
  dragItem = source.items.get('dagger');
  globalThis.Item.implementation.fromDropData = async () => dragItem;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = destination; sheet.handlers = new Map();
  sheet._selectDropQuantity = async () => 1; sheet.loadProfileData = async () => ({ classes: [] });
  const event = { target: { closest: () => ({ dataset: { itemId: 'clothes' } }) } };
  const before = [snapshot(destination), snapshot(source)]; boundary = 0;
  expect(await sheet._onDropItem(event, {})).toBe(false);
  expect([snapshot(destination), snapshot(source)]).toEqual(before);
  expect(boundary).toBe(0);
});

it('predicts and commits a dagger bundle into clothing with enough capacity', async () => {
  const destination = makeActor('clothing-buyer', [
    entry('clothes', "Adventurer's Clothes", 'clothing', { equipped: true, capacity: 5 }),
  ]);
  const source = makeActor('clothing-giver', [
    entry('sheath', 'Scabbard, Dagger', 'container', { storedSize: 2 }),
    entry('dagger', 'Dagger', 'weapon', { containerId: 'sheath', storedSize: 3, tags: ['dagger'] }),
  ]);
  const actors = new Map([[destination.id, destination], [source.id, source]]);
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors, scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => [...actors.values()].find(actor => actor.uuid === uuid);
  dragItem = source.items.get('dagger');
  globalThis.Item.implementation.fromDropData = async () => dragItem;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = destination; sheet.handlers = new Map();
  sheet._selectDropQuantity = async () => 1; sheet.loadProfileData = async () => ({ classes: [] });
  const clothes = destination.items.get('clothes');
  expect(await sheet._predictSwordDaggerPlacement(dragItem, dragItem.toObject(), clothes)).toMatchObject({ valid: true });
  const event = { target: { closest: () => ({ dataset: { itemId: 'clothes' } }) } };
  expect(await sheet._onDropItem(event, {})).toBe(true);
  expect(destination.items.find(item => item.name === 'Scabbard, Dagger').system.containerId).toBe('clothes');
  expect(destination.items.find(item => item.name === 'Dagger').system.containerId).toBeTruthy();
});

it('moves an existing same-actor dagger and sheath into canonical clothes without duplicating either item', async () => {
  const actor = makeActor('same-actor-dagger', [
    entry('cloak', 'Cloak', 'clothing', { equipped: true, capacity: 20 }),
    entry('clothes', "Adventurer's Clothes", 'clothing', { equipped: true, capacity: 3 }),
    entry('sheath', 'Scabbard, Dagger', 'container', {
      containerId: 'cloak', storedSize: 0.5, maxItems: 1, tags: ['weapon-storage', 'scabbard'],
    }),
    entry('dagger', 'Dagger', 'weapon', { containerId: 'sheath', storedSize: 2, tags: ['dagger'] }),
  ]);
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors: new Map([[actor.id, actor]]), scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
  const dagger = actor.items.get('dagger');
  dragItem = dagger;
  globalThis.Item.implementation.fromDropData = async () => dagger;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor; sheet.handlers = new Map();
  sheet._selectDropQuantity = async () => 1; sheet.loadProfileData = async () => ({ classes: [] });
  const event = { target: { closest: () => ({ dataset: { itemId: 'clothes' } }) } };
  expect(await sheet._onDropItem(event, {})).toBe(true);
  expect(actor.items.contents.map(item => item.id).sort()).toEqual(['cloak', 'clothes', 'dagger', 'sheath']);
  expect(actor.items.get('sheath').system.containerId).toBe('clothes');
  expect(actor.items.get('dagger').system.containerId).toBe('sheath');
  expect(actor.items.get('sheath').system.storedSize + actor.items.get('dagger').system.storedSize).toBe(2.5);
});

it('preflights existing sheaths, ancestors, custom bulk, and same-clothes reorders', async () => {
  const run = async (destinationEntries, sourceEntries, expectValid, usePredictor = false) => {
    const destination = makeActor('preflight-buyer', destinationEntries);
    const source = sourceEntries ? makeActor('preflight-giver', sourceEntries) : destination;
    const actors = new Map([[destination.id, destination], [source.id, source]]);
    globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors, scenes: [], settings: { get: () => false } };
    const dagger = source.items.get('dagger');
    const clothes = destination.items.get('clothes');
    const sheet = Object.create(CharacterSheet.prototype); sheet.actor = destination;
    const result = usePredictor
      ? await sheet._predictSwordDaggerPlacement(dagger, dagger.toObject(), clothes)
      : sheet._preflightDaggerClothingPlacement(dagger, dagger.toObject(), clothes);
    expect(result.valid).toBe(expectValid);
  };
  await run([
    entry('clothes', "Adventurer's Clothes", 'clothing', { capacity: 5 }),
    entry('target-sheath', 'Scabbard, Dagger', 'container', { containerId: 'clothes', storedSize: 2 }),
    entry('target-load', 'Dagger', 'weapon', { containerId: 'target-sheath', storedSize: 2, tags: ['dagger'] }),
  ], [entry('dagger', 'Dagger', 'weapon', { storedSize: 3, tags: ['dagger'] })], false, true);
  await run([
    entry('outer', 'Pack', 'container', { capacity: 4 }),
    entry('clothes', "Adventurer's Clothes", 'clothing', { capacity: 5, containerId: 'outer' }),
  ], [entry('sheath', 'Scabbard, Dagger', 'container', { storedSize: 2 }), entry('dagger', 'Dagger', 'weapon', { containerId: 'sheath', storedSize: 3, tags: ['dagger'] })], false);
  await run([
    entry('clothes', "Adventurer's Clothes", 'clothing', { capacity: 5 }),
    entry('sheath', 'Scabbard, Dagger', 'container', { storedSize: 6 }),
    entry('dagger', 'Dagger', 'weapon', { containerId: 'sheath', storedSize: 3, tags: ['dagger'] }),
  ], null, false);
  await run([
    entry('clothes', "Adventurer's Clothes", 'clothing', { capacity: 5 }),
    entry('sheath', 'Scabbard, Dagger', 'container', { containerId: 'clothes', storedSize: 2, maxItems: 1 }),
    entry('dagger', 'Dagger', 'weapon', { containerId: 'sheath', storedSize: 3, tags: ['dagger'] }),
  ], null, true);
});


it('rejects an actual Javelin lash drop onto a bag stored inside a Backpack without writes', async () => {
  const actor = makeActor('nested-long-lash', [
    bag('pack'), entry('inner', 'Field Bag', 'container', { containerId: 'pack', capacity: 100, lashSlots: 4 }),
    entry('javelin', 'Javelin', 'weapon', { storedSize: 10, lashable: true }),
  ]);
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors: new Map([[actor.id, actor]]), scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
  dragItem = actor.items.get('javelin');
  globalThis.Item.implementation.fromDropData = async () => dragItem;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor; sheet.handlers = new Map();
  sheet._selectDropQuantity = async () => 1; sheet._dropPlacementTarget = 'inner'; sheet._gearMoveMode = 'lash';
  sheet._gearDragItemId = 'javelin';
  expect((await sheet._getContainerDropValidity(actor.items.get('inner'))).valid).toBe(false);
  expect(sheet._gearMoveCandidates(dragItem).some(candidate => candidate.id === 'inner' && candidate.mode === 'lash')).toBe(false);
  const before = snapshot(actor); boundary = 0;
  expect(await sheet._onDropItem({ target: { closest: () => null } }, {})).toBe(false);
  expect(snapshot(actor)).toEqual(before); expect(boundary).toBe(0);
});


it.each(['Staff', 'Spear', 'Javelin', 'Shortbow', 'Longbow', 'Sling, Staff'])('offers %s external Backpack lashing in the Move menu', name => {
  const actor = makeActor('move-long', [bag('pack'), entry('long', name, 'weapon', { lashable: false })]);
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor;
  const candidates = sheet._gearMoveCandidates(actor.items.get('long'));
  expect(candidates).toContainEqual({ id: 'pack', mode: 'lash', label: 'Lash to Backpack' });
  expect(candidates.some(candidate => candidate.id === 'pack' && candidate.mode === 'store')).toBe(false);
});


it('defaults the Pack prompt to twenty without changing a larger loose stack', async () => {
  const actor = makeActor('pack-prompt', [entry('arrows', 'Arrow', 'ammunition', { quantity: 30, storedSize: 0.25, tags: ['arrows'] })]);
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor;
  let prompt;
  sheet._selectDropQuantity = async (data, maximum, requested) => { prompt = { quantity: data.system.quantity, maximum, requested }; return null; };
  expect(sheet._gearMoveCandidates(actor.items.get('arrows'))).toContainEqual({ id: '__pack__', mode: 'pack', label: 'Pack protected bundle' });
  expect(await sheet._moveGearItemToDestination(actor.items.get('arrows'), { mode: 'pack' })).toBe(false);
  expect(prompt).toEqual({ quantity: 20, maximum: 20, requested: true });
  expect(actor.items.get('arrows').system.quantity).toBe(30);
});


it('previews protected arrow lashing independently of internal capacity and rejects full lash points', async () => {
  const bundle = entry('bundle', 'Arrow', 'ammunition', { quantity: 20, storedSize: 0.25, tags: ['arrows'] });
  bundle.flags = { 'osp-houserules': { protectedArrowBundle: true } };
  const actor = makeActor('bundle-hover', [entry('pack', 'Backpack', 'container', { capacity: 4, lashSlots: 1 }), bundle]);
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors: new Map([[actor.id, actor]]), scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor; sheet.handlers = new Map();
  sheet._isStoreLocked = () => false; sheet._selectDropQuantity = async () => 20;
  sheet._gearDragItemId = 'bundle';
  expect((await sheet._getContainerDropValidity(actor.items.get('pack'))).valid).toBe(true);
  dragItem = actor.items.get('bundle'); globalThis.Item.implementation.fromDropData = async () => dragItem;
  sheet._dropPlacementTarget = 'pack'; sheet._gearMoveMode = 'lash';
  expect(await sheet._onDropItem({ target: { closest: () => null } }, {})).toBe(true);
  const secondData = structuredClone(bundle); secondData._id = 'second-bundle';
  const [second] = await actor.createEmbeddedDocuments('Item', [secondData], { keepId: true });
  sheet._gearDragItemId = second.id;
  expect((await sheet._getContainerDropValidity(actor.items.get('pack'))).valid).toBe(false);
});


function quiverArrow(id, quantity, containerId, protectedState = false) {
  const data = entry(id, 'Arrow', 'ammunition', { quantity, containerId, storedSize: 0.25, unitWeight: 0.1, cost: 0.2, tags: ['arrows'] });
  data.flags = protectedState ? { 'osp-houserules': { protectedArrowBundle: true } } : {};
  return data;
}
function quiverLoadSheet(actor, item, targetId) {
  globalThis.game = { user: { isGM: true }, system: { id: 'osp-houserules' }, actors: new Map([[actor.id, actor]]), scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
  dragItem = item; globalThis.Item.implementation.fromDropData = async () => dragItem;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor; sheet.handlers = new Map();
  sheet._dropPlacementTarget = targetId; sheet._gearMoveMode = targetId ? 'store' : undefined; sheet._forceStorageDestination = Boolean(targetId);
  sheet._isStoreLocked = () => false; sheet._showDropPlacementDialog = async () => null;
  return sheet;
}

function boltCaseBolt(id, quantity, containerId, protectedState = false, lashed = false) {
  const data = entry(id, 'Crossbow Bolt, Light', 'ammunition', { quantity, containerId, storedSize: 0.2, unitWeight: 0.1, cost: 0.3, tags: ['bolts'], lashed });
  data.flags = protectedState ? { 'osp-houserules': { protectedBoltBundle: true } } : {};
  return data;
}

it('partially unpacks a protected bolt bundle into a Bolt Case and preserves the lashed remainder', async () => {
  const actor = makeActor('partial-bolt-case-load', [bag('pack'), entry('case', 'Bolt Case', 'container', { capacity: 2, allowedTypes: ['bolts'] }), boltCaseBolt('bundle', 20, 'pack', true, true)]);
  const sheet = quiverLoadSheet(actor, actor.items.get('bundle'), 'case'); let prompt;
  sheet._selectDropQuantity = async (data, max, ask) => { prompt = { quantity: data.system.quantity, max, ask }; return 10; };
  expect(await sheet._onDropItem({ target: { closest: () => null } }, {})).toBe(true);
  expect(prompt).toEqual({ quantity: 10, max: 10, ask: true });
  expect(actor.items.get('bundle').system).toMatchObject({ quantity: 10, containerId: 'pack', lashed: true });
  expect(actor.items.get('bundle').flags['osp-houserules'].protectedBoltBundle).toBe(true);
  const loose = actor.items.filter(item => item.system.containerId === 'case');
  expect(loose).toHaveLength(1);
  expect(loose[0].system.quantity).toBe(10);
  expect(loose[0].flags?.['osp-houserules']?.protectedBoltBundle).not.toBe(true);
  expect(actor.items.filter(item => item.type === 'ammunition').reduce((sum, item) => sum + item.system.quantity, 0)).toBe(20);
});

it('loads twelve loose arrows from a protected twenty-arrow bundle and preserves eight protected', async () => {
  const actor = makeActor('partial-quiver-load', [bag('pack'), entry('hip', 'Quiver, Hip', 'container', { capacity: 3, allowedTypes: ['arrows'] }), quiverArrow('bundle',20,'pack',true)]);
  const sheet = quiverLoadSheet(actor,actor.items.get('bundle'),'hip'); let prompt;
  sheet._selectDropQuantity = async (data,max,ask) => { prompt={quantity:data.system.quantity,max,ask};return 12; };
  sheet._gearDragItemId = 'bundle';
  expect(sheet._gearMoveCandidates(actor.items.get('bundle')).some(c=>c.id==='hip'&&c.mode==='store')).toBe(true);
  expect((await sheet._getContainerDropValidity(actor.items.get('hip'))).valid).toBe(true);
  expect(await sheet._onDropItem({target:{closest:()=>null}},{})).toBe(true);
  expect(prompt).toEqual({quantity:12,max:12,ask:true});
  expect(actor.items.get('bundle').system.quantity).toBe(8);
  expect(actor.items.get('bundle').flags['osp-houserules'].protectedArrowBundle).toBe(true);
  const loaded=actor.items.filter(i=>i.system.containerId==='hip');
  expect(loaded.reduce((n,i)=>n+i.system.quantity,0)).toBe(12);
  expect(loaded.every(i=>i.flags?.['osp-houserules']?.protectedArrowBundle!==true)).toBe(true);
  expect(actor.items.filter(i=>i.type==='ammunition').reduce((n,i)=>n+i.system.quantity,0)).toBe(20);
});

it('uses remaining capacity on a nested arrow row and merges unpacked arrows without losing the bundle remainder', async () => {
  const actor=makeActor('nested-quiver-load',[bag('pack'),entry('hip','Quiver, Hip','container',{capacity:3,allowedTypes:['arrows']}),quiverArrow('loaded',8,'hip'),quiverArrow('bundle',20,'pack',true)]);
  const sheet=quiverLoadSheet(actor,actor.items.get('bundle'),null);let maximum;
  sheet._selectDropQuantity=async(_data,max)=>{maximum=max;return 4;};
  expect(await sheet._onDropItem({target:{closest:()=>({dataset:{itemId:'loaded'}})}},{})).toBe(true);
  expect(maximum).toBe(4);
  expect(actor.items.get('bundle').system.quantity).toBe(16);
  expect(actor.items.get('bundle').flags['osp-houserules'].protectedArrowBundle).toBe(true);
  expect(actor.items.filter(i=>i.system.containerId==='hip').reduce((n,i)=>n+i.system.quantity,0)).toBe(12);
  expect(actor.items.filter(i=>i.type==='ammunition').reduce((n,i)=>n+i.system.quantity,0)).toBe(28);
});

it('purchases twenty protected catalog arrows for twenty times the unit price, while an undersized Hip purchase makes no changes', async () => {
  const catalog=quiverArrow('catalog',1,null);const source={actor:null,toObject:()=>structuredClone(catalog)};
  const makeBuyer=id=>makeActor(id,[bag('pack'),entry('hip','Quiver, Hip','container',{capacity:3,allowedTypes:['arrows']}),entry('silver','Silver Coins','coin',{quantity:100,cost:1,storedSize:0.04,containerId:'pack'})]);
  let actor=makeBuyer('catalog-bundle-buyer');let sheet=quiverLoadSheet(actor,source,'pack');game.user.isGM=false;sheet._selectDropQuantity=async ()=>1;
  expect(await sheet._onDropItem({target:{closest:()=>null}},{})).toBe(true);
  const purchased=actor.items.find(i=>i.type==='ammunition');
  expect(purchased.system).toMatchObject({quantity:20,containerId:'pack',lashed:false,storedSize:0.25});
  expect(purchased.flags['osp-houserules'].protectedArrowBundle).toBe(true);
  expect(actor.items.get('silver').system.quantity).toBe(96);
  actor=makeBuyer('catalog-hip-buyer');sheet=quiverLoadSheet(actor,source,'hip');game.user.isGM=false;sheet._selectDropQuantity=async data=>data.system.quantity;
  const before=snapshot(actor);expect(await sheet._onDropItem({target:{closest:()=>null}},{})).toBe(false);expect(snapshot(actor)).toEqual(before);
});

it('materializes two catalog arrow selections as separate protected bundles', async () => {
  const actor = makeActor('two-bundle-buyer', [bag('pack'), entry('silver', 'Silver Coins', 'coin', { quantity: 100, cost: 1, storedSize: 0.04, containerId: 'pack' })]);
  const source = { actor: null, toObject: () => quiverArrow('catalog-two', 1, null) };
  const sheet = quiverLoadSheet(actor, source, 'pack');
  game.user.isGM = false;
  let prompt;
  sheet._selectDropQuantity = async (_data, max, ask, options) => { prompt = { max, ask, unitLabel: options?.unitLabel }; return 2; };
  expect(await sheet._onDropItem({ target: { closest: () => null } }, {})).toBe(true);
  expect(prompt).toEqual({ max: 1000, ask: true, unitLabel: '20-arrow bundles' });
  const bundles = actor.items.filter(item => item.name === 'Arrow');
  expect(bundles).toHaveLength(2);
  expect(bundles.map(item => item.system.quantity)).toEqual([20, 20]);
  expect(bundles.every(item => item.flags['osp-houserules'].protectedArrowBundle)).toBe(true);
  expect(actor.items.get('silver').system.quantity).toBe(92);
});

it('prompts when moving a protected arrow bundle outside a quiver and preserves the remainder', async () => {
  const actor = makeActor('protected-move', [bag('pack'), quiverArrow('bundle', 20, 'pack', true)]);
  const bundle = actor.items.get('bundle');
  const sheet = quiverLoadSheet(actor, bundle, 'pack');
  sheet._gearMoveMode = 'lash';
  sheet._forceStorageDestination = false;
  let prompted = false;
  sheet._selectDropQuantity = async (_data, max, ask) => { prompted = ask && max === 20; return 3; };
  expect(await sheet._onDropItem({ target: { closest: () => null } }, {})).toBe(true);
  expect(prompted).toBe(true);
  expect(actor.items.get('bundle').system.quantity).toBe(17);
  const moved = actor.items.find(item => item.id !== 'bundle' && item.name === 'Arrow');
  expect(moved).toMatchObject({ system: { quantity: 3, containerId: 'pack', lashed: true } });
  expect(moved.flags['osp-houserules'].protectedArrowBundle).toBe(true);
});

it('rejects an over-capacity catalog quantity atomically', async () => {
  const f = fixture();
  await f.destination.items.get('bag').update({ 'system.capacity': 1 });
  boundary = 0;
  dragItem = { actor: null, toObject: () => entry('catalog-piton', 'Piton', 'item', { quantity: 1, storedSize: 1, cost: 1 }) };
  selected = 2;
  const before = snapshot(f.destination);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
  expect(snapshot(f.destination)).toEqual(before);
  expect(boundary).toBe(0);
});

it('rejects two catalog arrow bundles when only one Backpack lash slot is free', async () => {
  const actor = makeActor('two-bundle-lash-full', [
    entry('pack', 'Backpack', 'container', { capacity: 100, containerSize: 'large', lashSlots: 1 }),
    entry('lash-load', 'Rope', 'item', { containerId: 'pack', lashed: true, slotCost: 1 }),
  ]);
  const source = { actor: null, toObject: () => quiverArrow('catalog-lash', 1, null) };
  const sheet = quiverLoadSheet(actor, source, 'pack');
  sheet._gearMoveMode = 'lash'; sheet._forceStorageDestination = false;
  sheet._selectDropQuantity = async () => 2;
  const before = snapshot(actor);
  expect(await sheet._onDropItem({ target: { closest: () => null } }, {})).toBe(false);
  expect(snapshot(actor)).toEqual(before);
});

it.each([6, 7])('offers a legacy Coin Purse on a belt already using %i of six slots', used => {
  const actor = makeActor('free-purse-menu', [
    entry('belt', 'Belt', 'clothing', { equipped: true, lashSlots: 6 }),
    entry('load', 'Belt Pouch (L)', 'container', { containerId: 'belt', lashed: true, slotCost: used }),
    entry('free', 'Coin Purse', 'container', { slotCost: 1, lashable: false }),
  ]);
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor;
  expect(sheet._gearMoveCandidates(actor.items.get('free'))).toContainEqual({ id: 'belt', mode: 'lash', label: 'Lash to Belt' });
});

it.each([17, null])('prompts for catalog coin quantity %s without spending existing coins', async amount => {
  const f = fixture();
  game.user.isGM = true;
  dragItem = {actor:null,toObject:()=>entry('catalog-coins','Silver Coins','coin',{quantity:1,cost:1,storedSize:0.04})};
  f.event.target.closest = selector => selector.includes('[data-item-id]') ? {dataset:{itemId:'purse'}} : null;
  let prompt;
  f.sheet._selectDropQuantity = async (_item,max,ask,options) => {prompt={max,ask,unitLabel:options.unitLabel};return amount;};
  const before=snapshot(f.destination);
  expect(await f.sheet._onDropItem(f.event,{})).toBe(amount!==null);
  expect(prompt).toEqual({max:Infinity,ask:true,unitLabel:'coins'});
  expect(quantity(f.destination,'Silver Coins')).toBe(amount===null?20:37);
  if(amount===null){expect(snapshot(f.destination)).toEqual(before);expect(boundary).toBe(0);}
});

it.each(['Mess Kit', "Healer's Kit", 'Mallet, Wooden', 'Waterskin', 'Wineskin'])('lashes legacy %s through the real Backpack drop path at one slot', async name => {
  const actor = makeActor('legacy-quiver-drop', [
    entry('pack', 'Backpack', 'container', { lashSlots: 4 }),
    entry('quiver', name, 'item', { lashable: false, slotCost: 2 }),
  ]);
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors: new Map([[actor.id, actor]]), scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
  const quiver = actor.items.get('quiver');
  dragItem = quiver;
  globalThis.Item.implementation.fromDropData = async () => quiver;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor; sheet.handlers = new Map();
  sheet._selectDropQuantity = async () => 1; sheet.loadProfileData = async () => ({ classes: [] });
  sheet._gearDragItemId = quiver.id;
  expect(sheet._gearMoveCandidates(quiver)).toContainEqual({ id: 'pack', mode: 'lash', label: 'Lash to Backpack' });
  const event = { target: { closest: () => ({ dataset: { itemId: 'pack' } }) } };
  expect(await sheet._onDropItem(event, {})).toBe(true);
  expect(getLashSlotCost(quiver, actor.items.get('pack'))).toBe(1);
  expect(quiver.system).toMatchObject({ containerId: 'pack', lashed: true, lashable: false, slotCost: 2 });
});


function torchDropFixture(protectedState = true, full = false) {
  const torch = entry('torch', 'Torch', 'item', { quantity: 6, storedSize: .75, unitWeight: .5, lashable: false, slotCost: protectedState ? 2 : 0 });
  if (protectedState) torch.flags = { 'osp-houserules': { protectedTorchBundle: true } };
  const actor = makeActor('torch-drop', [entry('pack', 'Backpack', 'container', { capacity: 20, lashSlots: 4 }), entry('belt', 'Belt', 'clothing', { equipped: true, lashSlots: 6 }), torch,
    ...(full ? Array.from({length:4},(_,i)=>entry('load'+i,'Load '+i,'item',{containerId:'pack',lashed:true,slotCost:1})) : [])]);
  globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors: new Map([[actor.id, actor]]), scenes: [], settings: { get: () => false } };
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
  const item = actor.items.get('torch'); dragItem = item; globalThis.Item.implementation.fromDropData = async () => item;
  const sheet = Object.create(CharacterSheet.prototype); sheet.actor = actor; sheet.handlers = new Map(); sheet._gearDragItemId = item.id;
  sheet._selectDropQuantity = async () => 6; sheet.loadProfileData = async () => ({ classes: [] }); sheet._dropPlacementTarget = 'pack';
  return {actor,item,sheet,event:{target:{closest:()=>null}}};
}
it('offers and lashes a six-torch bundle only to a Backpack at one slot', async () => {
  const f = torchDropFixture(); const candidates=f.sheet._gearMoveCandidates(f.item);
  expect(candidates).toContainEqual({id:'pack',mode:'lash',label:'Lash to Backpack'});
  expect(candidates.some(c=>c.id==='belt'&&c.mode==='lash')).toBe(false);
  f.sheet._gearMoveMode='lash'; expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  expect(f.item.system).toMatchObject({quantity:6,storedSize:.75,unitWeight:.5,containerId:'pack',lashed:true});
  expect(getLashSlotCost(f.item,f.actor.items.get('pack'))).toBe(1);
});
it('keeps loose torches allowed inside a Backpack', async () => {
  const f=torchDropFixture(false); f.sheet._forceStorageDestination=true; f.sheet._gearMoveMode='store';
  expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  expect(f.item.system).toMatchObject({containerId:'pack',lashed:false,quantity:6});
});
it('rejects an explicit torch bundle lash to a full Backpack without mutation', async () => {
  const f=torchDropFixture(true,true);const before=snapshot(f.actor);f.sheet._gearMoveMode='lash';
  expect(await f.sheet._onDropItem(f.event,{})).toBe(false);expect(snapshot(f.actor)).toEqual(before);
});
it('blocks torch bundle equip and roll controls until unpacked', async () => {
  const f=torchDropFixture();const handler=new ItemHandler(null,f.actor,f.sheet);handler.getItemFromEvent=()=>f.item;
  const before=snapshot(f.actor);const event={preventDefault(){},stopPropagation(){}};
  await handler.onItemToggle(event);await handler.onItemRoll(event);expect(snapshot(f.actor)).toEqual(before);
});

it('purchases two separate twenty-bolt bundles at the unchanged light-bolt price', async () => {
  const f=fixture();selected=2;
  dragItem={actor:null,toObject:()=>entry('catalog-bolt','Crossbow Bolt, Light','ammunition',{quantity:1,cost:.3,storedSize:.2,unitWeight:.1,tags:['bolts']})};
  expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  const bolts=f.destination.items.filter(item=>item.name==='Crossbow Bolt, Light');
  expect(bolts.map(item=>item.system.quantity)).toEqual([20,20]);
  expect(bolts.every(item=>item.flags?.['osp-houserules']?.protectedBoltBundle)).toBe(true);
  expect(bolts.reduce((n,item)=>n+item.system.quantity*item.system.storedSize,0)).toBe(8);
  expect(bolts.reduce((n,item)=>n+item.system.quantity*item.system.unitWeight,0)).toBe(4);
  expect(quantity(f.destination,'Silver Coins')).toBe(8);
});

function rolledCoatFixture({worn=false,pockets=false,loads=0,name='Coat, Winter',storedSize=5,unitWeight=4,slotCost=0}={}) {
 const entries=[entry('pack','Backpack','container',{capacity:20,lashSlots:4}),entry('clothes',"Clothes, Adventurer's",'clothing',{equipped:true,capacity:3}),entry('coat',name,'clothing',{storedSize,unitWeight,capacity:2,slot:'outerwear',quantity:1,containerId:worn?null:'pack',equipped:worn,lashable:true,slotCost})];
 if(pockets)entries.push(entry('pocket','Tinder Box','item',{storedSize:1,containerId:'coat'}));
 for(let i=0;i<loads;i++)entries.push(entry('load'+i,'Load '+i,'item',{storedSize:0,unitWeight:0,containerId:'pack',lashed:true,slotCost:1}));
 const actor=makeActor('rolled-coat',entries);globalThis.game={user:{isGM:false},system:{id:'osp-houserules'},actors:new Map([[actor.id,actor]]),scenes:[],settings:{get:()=>false}};
 globalThis.fromUuid=async uuid=>uuid===actor.uuid?actor:null;const coat=actor.items.get('coat');dragItem=coat;globalThis.Item.implementation.fromDropData=async()=>coat;
 const sheet=Object.create(CharacterSheet.prototype);sheet.actor=actor;sheet.handlers=new Map();sheet._selectDropQuantity=async()=>1;sheet.loadProfileData=async()=>({classes:[]});sheet._dropPlacementTarget='pack';sheet._gearMoveMode='lash';
 return{actor,coat,sheet,event:{target:{closest:()=>null}}};
}
it('lashes an existing empty winter coat for two slots without changing its dimensions',async()=>{
 const f=rolledCoatFixture({loads:1});expect(await f.sheet._onDropItem(f.event,{})).toBe(true);expect(f.coat.system).toMatchObject({lashed:true,equipped:false,containerId:'pack',storedSize:5,unitWeight:4});expect(getLashSlotCost(f.coat,f.actor.items.get('pack'))).toBe(2);
});
it.each([{worn:true},{pockets:true},{loads:3}])('rejects ineligible winter coat lashing atomically: %j',async options=>{
 const f=rolledCoatFixture(options);const before=snapshot(f.actor);expect(await f.sheet._onDropItem(f.event,{})).toBe(false);expect(snapshot(f.actor)).toEqual(before);
});
it('lashes an empty Cloak for one slot without changing its dimensions',async()=>{
 const f=rolledCoatFixture({name:'Cloak',storedSize:4,unitWeight:3,slotCost:2});expect(await f.sheet._onDropItem(f.event,{})).toBe(true);expect(f.coat.system).toMatchObject({lashed:true,equipped:false,containerId:'pack',storedSize:4,unitWeight:3});expect(getLashSlotCost(f.coat,f.actor.items.get('pack'))).toBe(1);
});
it.each([{worn:true},{pockets:true},{loads:4}])('rejects ineligible Cloak lashing atomically: %j',async options=>{
 const f=rolledCoatFixture({name:'Cloak',storedSize:4,unitWeight:3,slotCost:2,...options});const before=snapshot(f.actor);expect(await f.sheet._onDropItem(f.event,{})).toBe(false);expect(snapshot(f.actor)).toEqual(before);
});
it('preserves explicit internal storage of a filled winter coat',async()=>{
 const f=rolledCoatFixture({worn:true,pockets:true});f.sheet._forceStorageDestination=true;f.sheet._gearMoveMode='store';expect(await f.sheet._onDropItem(f.event,{})).toBe(true);expect(f.coat.system).toMatchObject({containerId:'pack',equipped:false,lashed:false});expect(f.actor.items.get('pocket').system.containerId).toBe('coat');const{usedBulk}=await import('../../inventory/bulk.js');expect(usedBulk(f.actor.items.get('pack'),f.actor.items.contents)).toBe(6);
});

it('unrolls and detaches a lashed cloak when the equip button is used',async()=>{
 const f=rolledCoatFixture();await f.coat.update({name:'Cloak','system.lashed':true,'system.storedSize':4,'system.unitWeight':3,'system.slot':'cloak'});
 const handler=new ItemHandler(null,f.actor,f.sheet);handler.getItemFromEvent=()=>f.coat;
 await handler.onItemToggle({preventDefault(){},stopPropagation(){}});
 expect(f.coat.system).toMatchObject({equipped:true,lashed:false,containerId:null,storedSize:4,unitWeight:3});expect(f.actor.items.get('clothes').system.equipped).toBe(true);
});

describe('virtual Body clothing destination', () => {
  function bodyFixture(name = 'Cloak', slot = 'cloak') {
    const actor = makeActor('body-drop', [
      entry('pack', 'Backpack', 'container', { capacity: 20 }),
      entry('incoming', name, 'clothing', { slot, containerId: 'pack', equipped: false }),
    ]);
    globalThis.game = { user: { isGM: false }, system: { id: 'osp-houserules' }, actors: new Map([[actor.id, actor]]), scenes: [], settings: { get: () => false } };
    globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
    const item = actor.items.get('incoming'); dragItem = item;
    globalThis.Item.implementation.fromDropData = async () => item;
    const sheet = Object.create(CharacterSheet.prototype);
    sheet.actor = actor; sheet.handlers = new Map(); sheet._gearDragItemId = item.id;
    sheet._selectDropQuantity = async () => 1; sheet._dropPlacementTarget = '__body__';
    return { actor, item, sheet, event: { target: { closest: () => null } } };
  }

  it.each([
    ['Cloak', 'cloak'], ['Coat, Winter', 'outerwear'], ['Boots', 'boots'],
  ])('equips %s through the body destination', async (name, slot) => {
    const f = bodyFixture(name, slot);
    expect(await f.sheet._getBodyDropValidity()).toEqual({ valid: true });
    expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
    expect(f.item.system).toMatchObject({ equipped: true, containerId: null, lashed: false });
  });

  it('equips a Holy Symbol through Body without consuming a clothing position', async () => {
    const f = bodyFixture('Holy Symbol', null);
    await f.item.update({ type: 'item', name: 'Holy Symbol', 'system.tags': ['religious', 'focus'] });
    expect(f.sheet._isBodyClothing(f.item)).toBe(false);
    expect(await f.sheet._getBodyDropValidity()).toEqual({ valid: true });
    expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
    expect(f.item.system).toMatchObject({ equipped: true, containerId: null, lashed: false });
  });

  it('rejects a duplicate clothing slot without mutating either item', async () => {
    const f = bodyFixture();
    await f.actor.createEmbeddedDocuments('Item', [entry('worn', 'Cloak', 'clothing', { slot: 'cloak', equipped: true })]);
    const before = snapshot(f.actor);
    expect((await f.sheet._getBodyDropValidity()).valid).toBe(false);
    expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
    expect(snapshot(f.actor)).toEqual(before);
  });

  it('rejects non-clothing drops without mutation', async () => {
    const f = bodyFixture();
    await f.item.update({ type: 'item', name: 'Rope' });
    const before = snapshot(f.actor);
    expect((await f.sheet._getBodyDropValidity()).valid).toBe(false);
    expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
    expect(snapshot(f.actor)).toEqual(before);
  });

  it('treats an actual Body header drop as authoritative without opening the chooser', async () => {
    const f = bodyFixture();
    f.sheet._dropPlacementTarget = null;
    await f.item.update({ type: 'item', name: 'Rope' });
    const header = { classList: { contains: className => className === 'body-section-header' } };
    f.event.target.closest = selector => selector === '.body-section-header' ? header : null;
    let chooserOpened = false;
    f.sheet._showDropPlacementDialog = async () => { chooserOpened = true; return null; };
    const before = snapshot(f.actor);
    expect(await f.sheet._onDropItem(f.event, {})).toBe(false);
    expect(chooserOpened).toBe(false);
    expect(snapshot(f.actor)).toEqual(before);
  });

  it('persists body collapse per actor with an expanded default', async () => {
    const f = bodyFixture();
    expect(f.actor.getFlag('osp-houserules', 'body-collapsed') ?? false).toBe(false);
    f.sheet.isEditable = true;
    await f.sheet._onBodyToggle({ preventDefault() {}, stopPropagation() {} });
    expect(f.actor.getFlag('osp-houserules', 'body-collapsed')).toBe(true);
    await f.sheet._onBodyToggle({ preventDefault() {}, stopPropagation() {} });
    expect(f.actor.getFlag('osp-houserules', 'body-collapsed')).toBe(false);
  });
});

it('offers a coin destination that fits part of a stack and preserves the remainder', async () => {
  const f = fixture('move');
  const actor = makeActor('coin-menu', [
    entry('sack', 'Sidesack', 'container', { capacity: 10 }),
    entry('purse', 'Coin Purse', 'container', { capacity: 4, allowedTypes: ['coin'] }),
    entry('silver', 'Silver Coins', 'coin', { quantity: 110, storedSize: 0.04, containerId: 'sack' }),
    entry('gold', 'Gold Coins', 'coin', { quantity: 45, storedSize: 0.04, containerId: 'purse' }),
  ]);
  f.actors.set(actor.id, actor);
  f.sheet.actor = actor;
  f.sheet._dropPlacementTarget = 'purse';
  f.sheet._forceStorageDestination = true;
  f.sheet._gearMoveMode = 'store';
  dragItem = actor.items.get('silver');
  expect(f.sheet._gearMoveCandidates(dragItem)).toContainEqual({
    id: 'purse', mode: 'store', label: 'Store in Coin Purse',
  });
  f.sheet._selectDropQuantity = async (data, maximum, prompt) => {
    expect(maximum).toBe(55);
    expect(data.system.quantity).toBe(55);
    return prompt ? 30 : maximum;
  };
  expect(await f.sheet._onDropItem(f.event, {}, { probe: true })).toBe(true);
  expect(actor.items.get('silver').system.quantity).toBe(110);
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  expect(actor.items.get('silver').system.quantity).toBe(80);
  const moved = actor.items.find(item => item.name === 'Silver Coins' && item.system.containerId === 'purse');
  expect(moved?.system.quantity).toBe(30);
});
