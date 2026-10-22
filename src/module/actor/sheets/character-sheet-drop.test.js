import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

let CharacterSheet;
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
});

describe('character sheet drop staging guards', () => {
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
  const collection = { get contents() { return list; }, get: id => list.find(item => item.id === id), find: fn => list.find(fn), filter: fn => list.filter(fn), some: fn => list.some(fn), map: fn => list.map(fn), values: () => list.values() };
  const write = async fn => { const current = ++boundary; if ((fault === current || fault instanceof Set && fault.has(current)) && !afterFault) throw new Error('Injected write failure'); const result = fn(); if ((fault === current || fault instanceof Set && fault.has(current)) && afterFault) throw new Error('Injected acknowledgement failure'); return result; };
  const actor = { id, uuid: `Actor.${id}`, type: 'character', name: id, isOwner: true, system: { class: 'fighter' }, get items() { return collection; }, getFlag: (_scope, key) => flags.get(key) ?? null, setFlag: async (_scope, key, value) => write(() => flags.set(key, clone(value))), createEmbeddedDocuments: async (_type, entries, options = {}) => write(() => entries.map(entry => add({ ...clone(entry), _id: options.keepId ? entry._id : foundry.utils.randomID() }))), deleteEmbeddedDocuments: async (_type, ids) => { for (const id of ids) await collection.get(id)?.delete(); }, updateEmbeddedDocuments: async (_type, entries) => { for (const entry of entries) await collection.get(entry._id).update(entry); } };
  function add(data) { const item = { actor, id: data._id, get name() { return data.name; }, get type() { return data.type; }, get img() { return data.img; }, get system() { return data.system; }, toObject: () => clone(data), update: async changes => write(() => { patch(data, changes); return item; }), delete: async () => write(() => list.splice(list.indexOf(item), 1)) }; list.push(item); return item; }
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
const snapshot = actor => actor.items.contents.map(item => item.toObject()).sort((a, b) => a._id.localeCompare(b._id));
const quantity = (actor, name) => actor.items.contents.filter(item => item.name === name).reduce((sum, item) => sum + item.system.quantity, 0);
beforeEach(() => { sequence = 0; boundary = 0; fault = null; afterFault = false; selected = 3; });
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

it('a populated container fits when the destination has room for its own bulk only', async () => {
  const f = fixture('container');
  await f.destination.items.get('bag').update({ 'system.capacity': 1 });
  boundary = 0;
  expect(await f.sheet._onDropItem(f.event, {})).toBe(true);
  const packed = f.destination.items.find(item => item.name === 'Sidesack');
  expect(f.sheet._getUsedCapacity(f.destination.items.get('bag'))).toBe(1);
  expect(f.sheet._getUsedCapacity(packed)).toBe(1);
  expect(quantity(f.destination, 'Copper Coins')).toBe(5);
  expect(f.source.items.contents).toHaveLength(0);
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
    ammunition: entry('target', 'Quiver', 'container', { capacity: 2, allowedTypes: ['arrows'] }),
    vehicle: entry('target', 'Cart', 'container', { capacity: 2, tags: ['vehicle'] }),
    sling: entry('target', 'Baldric', 'container', { capacity: 2, tags: ['sling'], allowedNames: ['Greatsword'] }),
    belt: entry('target', 'Belt', 'clothing', { equipped: true, lashSlots: 1 }),
  };
  const inputs = {
    tack: entry('incoming', 'Saddle, Pack', 'container', { tags: ['tack', 'pack animal'], tackSlot: 'saddle', lashSlots: 4 }),
    ammunition: entry('incoming', 'Arrows', 'ammunition', { tags: ['arrows'] }),
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
  const invalid = clone(inputs[route]); invalid.name = 'Incompatible entry';
  if (route === 'ammunition') invalid.system.tags = ['bolts'];
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
    dragItem={actor:null,toObject:()=>entry('new','Cloak','clothing',{storedSize:4})};
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
  dragItem={actor:null,toObject:()=>entry('new','Cloak','clothing')}; chooser(f,'__open_gear__');
  expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  expect(f.destination.items.find(item=>item.name==='Cloak').system).toMatchObject({equipped:true,containerId:null});
});
it('moves full stacks without requesting a routine quantity dialog',async()=>{
  const f=fixture('gift'); f.sheet._selectDropQuantity=CharacterSheet.prototype._selectDropQuantity;
  let dialogs=0; f.sheet.createDialog=()=>{dialogs++;throw Error('unexpected dialog');}; const calls=chooser(f);
  expect(await f.sheet._onDropItem(f.event,{})).toBe(true);
  expect(quantity(f.destination,'Arrows')).toBe(5); expect(f.source.items.contents).toHaveLength(0);
  expect(dialogs).toBe(0); expect(calls).toHaveLength(0);
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
