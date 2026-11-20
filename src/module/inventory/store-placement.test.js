import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { vehicleDestination } from './vehicle-lashing.js';

let planStorePlacement, validateStorePlacement, CharacterSheet;
let serial = 0;
beforeAll(async () => {
  globalThis.foundry = { applications: { sheets: { ActorSheetV2: class {} }, api: { HandlebarsApplicationMixin: Base => Base } }, utils: { randomID: () => `planned-${++serial}`, duplicate: value => structuredClone(value) } };
  globalThis.Application = class {};
  globalThis.Dialog = class {};
  globalThis.ui = { notifications: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } };
  globalThis.game = { user: { isGM: false }, settings: { get: () => false }, system: { id: 'osp-houserules' }, items: [] };
  globalThis.TextEditor = { getDragEventData: () => ({ type: 'Item' }) };
  ({ OspActorSheetCharacter: CharacterSheet } = await import('../actor/sheets/character-sheet.js'));
  CharacterSheet._classProfiles = [];
  CharacterSheet._raceProfiles = [];
  ({ planStorePlacement, validateStorePlacement } = await import('./store-placement.js'));
});
beforeEach(() => { serial = 0; game.user.isGM = false; globalThis.Hooks = { call: () => true }; });
const item = (id, name, type = 'item', system = {}) => ({ _id: id, name, type, img: '', system: { quantity: 1, tags: [], storedSize: 1, containerId: null, equipped: false, lashed: false, ...system } });
function actor(data = []) {
  const items = data.map(data => ({ ...structuredClone(data), id: data._id, toObject() { const { toObject, id, ...snapshot } = this; return structuredClone(snapshot); } }));
  const collection = { contents: items, filter: fn => items.filter(fn), find: fn => items.find(fn), get: id => items.find(item => item.id === id), some: fn => items.some(fn), map: fn => items.map(fn), [Symbol.iterator]: function* () { yield* items; } };
  return { id: 'hero', uuid: 'Actor.hero', type: 'character', isOwner: true, system: { class: 'fighter' }, items: collection, getFlag: () => null,
    createEmbeddedDocuments: vi.fn(() => { throw new Error('Live inventory must not change during review.'); }), updateEmbeddedDocuments: vi.fn(() => { throw new Error('Live inventory must not change during review.'); }) };
}
const line = (entryId, data, destination = '', quantity = 1) => ({ entryId, itemData: data, quantity, destination });

it('delivers each purchased torch bundle as six protected torches inside a Backpack', async () => {
  const hero = actor([item('pack', 'Backpack', 'container', { capacity: 20, lashSlots: 4 })]);
  const torch = { _id: 'torch', name: 'Torch', type: 'item', img: '', flags: { 'osp-houserules': { protectedTorchBundle: true } }, system: { quantity: 6, tags: ['light-source'], storedSize: .75, unitWeight: .5, cost: .2, containerId: null, equipped: false, lashed: false } };
  const result = await planStorePlacement(hero, [line('torch', torch, 'pack', 1)]);
  expect(result.success).toBe(true);
  const delivered = result.draftState.items.find(candidate => candidate.name === 'Torch');
  expect(delivered.system).toMatchObject({ quantity: 6, containerId: 'pack', lashed: false, storedSize: .75, unitWeight: .5 });
  expect(delivered.toObject()).toMatchObject({ flags: { 'osp-houserules': { protectedTorchBundle: true } } });
});

it('delivers a protected twenty-bolt bundle internally and rolls back an over-capacity purchase', async () => {
  const hero = actor([item('pack', 'Backpack', 'container', { capacity: 5, lashSlots: 1 })]);
  const bolt = { _id: 'bolt', name: 'Crossbow Bolt, Heavy', type: 'ammunition', img: '', flags: { 'osp-houserules': { protectedBoltBundle: true } }, system: { quantity: 20, tags: ['bolts'], storedSize: .25, unitWeight: .15, cost: .5, containerId: null, equipped: false, lashed: false } };
  const one = await planStorePlacement(hero, [line('bolt', bolt, 'pack', 1)]);
  expect(one.success).toBe(true);
  expect(one.draftState.items.find(candidate => candidate.name === bolt.name).system).toMatchObject({ quantity: 20, containerId: 'pack', lashed: false });
  const before = hero.items.contents.map(candidate => candidate.toObject());
  const two = await planStorePlacement(hero, [line('bolt-a', bolt, 'pack', 1), line('bolt-b', bolt, 'pack', 1)]);
  expect(two.success).toBe(false);
  expect(hero.items.contents.map(candidate => candidate.toObject())).toEqual(before);
});

it('places goods in a backpack bought in the same cart, independent of line order', async () => {
  const hero = actor();
  const lines = [line('rope', item('rope', 'Rope'), 'cart:pack'), line('pack', item('pack', 'Backpack', 'container', { capacity: 8 }))];
  const result = await planStorePlacement(hero, lines);
  expect(result.success).toBe(true);
  const pack = result.draftState.items.find(item => item.name === 'Backpack');
  const rope = result.draftState.items.find(item => item.name === 'Rope');
  expect(rope.system.containerId).toBe(pack.id);
  expect(result.placements.find(line => line.entryId === 'rope').destination).toBe('cart:pack');
  expect(hero.items.contents).toHaveLength(0);
  expect(hero.createEmbeddedDocuments).not.toHaveBeenCalled();
});

it('keeps automatic purchased destinations stable between review and GM planning', async () => {
  const hero = actor();
  const lines = [line('pack', item('pack', 'Backpack', 'container', { capacity: 8 })), line('rope', item('rope', 'Rope'))];
  const review = await planStorePlacement(hero, lines);
  expect(review.success).toBe(true);
  expect(review.placements.find(line => line.entryId === 'rope').destination).toBe('cart:pack');
  const finalLines = lines.map(line => ({ ...line, destination: review.placements.find(placed => placed.entryId === line.entryId).destination }));
  const final = await planStorePlacement(hero, finalLines);
  expect(final.success).toBe(true);
  expect(final.draftState.items.find(item => item.name === 'Backpack').id).not.toBe(review.draftState.items.find(item => item.name === 'Backpack').id);
});

it('checks combined cart bulk rather than allowing each line to claim the same free space', async () => {
  const hero = actor([item('pack', 'Backpack', 'container', { capacity: 1, equipped: true })]);
  const before = hero.items.contents.map(item => item.toObject());
  const result = await planStorePlacement(hero, [line('rope', item('rope', 'Rope'), 'pack'), line('oil', item('oil', 'Oil'), 'pack')]);
  expect(result.success).toBe(false);
  expect(hero.items.contents.map(item => item.toObject())).toEqual(before);
});

it('rejects mutually nested purchased containers and preserves the character', async () => {
  const hero = actor();
  const result = await planStorePlacement(hero, [line('a', item('a', 'Small Bag', 'container', { capacity: 8 }), 'cart:b'), line('b', item('b', 'Large Bag', 'container', { capacity: 8 }), 'cart:a')]);
  expect(result.success).toBe(false);
  expect(result.reason).toMatch(/circle/);
  expect(hero.items.contents).toHaveLength(0);
});

it('rejects incompatible ammunition storage using the existing character rules', async () => {
  const hero = actor([item('quiver', 'Quiver', 'container', { capacity: 10, allowedTypes: ['arrows'], equipped: true })]);
  const result = await planStorePlacement(hero, [line('bolts', item('bolts', 'Bolts', 'ammunition', { tags: ['bolts'] }), 'quiver')]);
  expect(result.success).toBe(false);
});

it('requires an explicit choice before using an exterior vehicle fitting', async () => {
  const hero = actor([item('wagon', 'Wagon', 'container', { vehicleKind: 'wagon', capacity: 200 })]);
  const destination = vehicleDestination('wagon', { mode: 'lashed', position: 'left' });
  // Restrict the available candidate seam to an exterior position: auto-placement
  // must not silently choose it even though explicit placement is valid.
  const original = CharacterSheet.prototype._dropPlacementCandidates;
  CharacterSheet.prototype._dropPlacementCandidates = () => [{ id: destination }];
  try {
    const wheel = item('wheel', 'Spare Wheel, Wagon');
    expect((await planStorePlacement(hero, [line('wheel', wheel)])).success).toBe(false);
    const explicit = await planStorePlacement(hero, [line('wheel', wheel, destination)]);
    expect(explicit.success).toBe(true);
    expect(explicit.draftState.items.find(item => item.name === wheel.name).system.vehicleAttachment).toEqual({ mode: 'lashed', position: 'left' });
    expect(hero.items.contents).toHaveLength(1);
  } finally { CharacterSheet.prototype._dropPlacementCandidates = original; }
});

it('the real drop entry blocks directory purchases but retains GM grants and owned transfers', async () => {
  const sheet = Object.create(CharacterSheet.prototype);
  Object.defineProperty(sheet, 'actor', { value: actor() });
  Object.defineProperty(sheet, 'isEditable', { value: true });
  sheet._onDropItem = vi.fn(async () => true);
  const data = item('rope', 'Rope');
  globalThis.Item = { implementation: { fromDropData: async () => ({ actor: null, toObject: () => data }) } };
  expect(await sheet._onDrop({})).toBe(false);
  expect(sheet._onDropItem).not.toHaveBeenCalled();
  game.user.isGM = true;
  expect(await sheet._onDrop({})).toBe(true);
  game.user.isGM = false;
  Item.implementation.fromDropData = async () => ({ actor: actor(), toObject: () => data });
  expect(await sheet._onDrop({})).toBe(true);
});
