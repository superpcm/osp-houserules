import { beforeEach, expect, it, vi } from 'vitest';
let service, actor, scene, authority, sequence, writes, hookCallbacks;
const copy = value => structuredClone(value);
const entry = (id, type = 'item', system = {}) => ({ _id: id, name: id, type, img: 'icons/svg/item-bag.svg', system: { quantity: 1, storedSize: 1, containerId: null, ...system } });
function patch(data, update) {
  for (const [key, value] of Object.entries(update)) {
    const parts = key.split('.'); let cursor = data;
    for (const p of parts.slice(0, -1)) cursor = cursor[p] ??= {};
    const last = parts.at(-1); if (last.startsWith('-=')) delete cursor[last.slice(2)]; else cursor[last] = copy(value);
  }
}
function docs(initial, owner, token = false) {
  const list = [];
  const collection = { get contents() { return list; }, get: id => list.find(d => d.id === id), values: () => list.values(), filter: fn => list.filter(fn), find: fn => list.find(fn) };
  collection.add = data => { data = copy(data); const doc = { id: data._id, uuid: data.uuid, get name() { return data.name; }, get type() { return data.type; }, get img() { return data.img; }, get system() { return data.system; }, get flags() { return data.flags; }, get actorId() { return data.actorId; }, get actor() { return data.actor; }, get x() { return data.x; }, get y() { return data.y; }, get width() { return data.width; }, get height() { return data.height; }, toObject: () => copy(data), update: async updates => { writes++; patch(data, updates); }, delete: async () => { writes++; list.splice(list.indexOf(doc), 1); } }; list.push(doc); return doc; };
  owner.createEmbeddedDocuments = async (_type, values) => { writes++; return values.map(data => collection.add({ ...(token ? { hidden: false } : {}), ...data })); };
  initial.forEach(collection.add); return collection;
}
beforeEach(async () => {
  vi.resetModules(); delete globalThis.__ospInventoryChatHook; sequence = 0; writes = 0;
  const flags = new Map(), settings = new Map(), hooks = new Map(); hookCallbacks = hooks;
  actor = { id: 'a', uuid: 'Actor.a', name: 'Hero', isOwner: true, testUserPermission: user => user.id !== 'other', getFlag: (_s, k) => flags.get(k), setFlag: async (_s, k, v) => { writes++; flags.set(k, copy(v)); } };
  actor.items = docs([entry('parent', 'container', { capacity: 20 }), entry('child', 'container', { containerId: 'parent', capacity: 10, custom: 'retained' }), entry('nested', 'item', { containerId: 'child', quantity: { value: 2 }, storedSize: 2 }), entry('other', 'item', { containerId: 'parent' }), entry('target', 'container', { capacity: 10 })], actor);
  scene = { id: 's', uuid: 'Scene.s', grid: { size: 100 }, dimensions: { sceneX: 0, sceneY: 0 }, testUserPermission: () => true };
  scene.tokens = docs([], scene, true);
  const gm = { id: 'gm', isGM: true }, outsider = { id: 'other', isGM: false }; const users = new Map([['gm', gm], ['other', outsider]]); users.activeGM = gm;
  const scenes = new Map([['s', scene]]); scenes.active = scene;
  vi.stubGlobal('game', { user: gm, users, scenes, actors: new Map([['a', actor]]), system: { id: 'osp-houserules' }, world: { id: 'test' }, settings: { get: (_s, k) => settings.get(k), set: async (_s, k, v) => { settings.set(k, copy(v)); return v; } } });
  vi.stubGlobal('foundry', { utils: { randomID: () => `id${++sequence}` } });
  vi.stubGlobal('fromUuid', async uuid => uuid === actor.uuid ? actor : uuid === scene.uuid ? scene : null);
  vi.stubGlobal('Hooks', { on: (name, fn) => hooks.set(name, fn) });
  vi.stubGlobal('ChatMessage', { create: vi.fn(async data => { const doc = { ...copy(data), author: game.user }; hooks.get('createChatMessage')?.(doc, {}, game.user.id); return doc; }) });
  service = await import('./item-removal.js'); authority = await import('./inventory-authority.js'); service.registerItemRemovalAuthority();
});
const command = (extra = {}) => ({ action: 'delete', itemId: 'parent', quantity: 1, destinations: [{ itemId: 'child', targetId: 'target' }, { itemId: 'other', targetId: 'target' }], expected: service.inventoryRemovalFingerprint(actor), ...extra });
const placeCharacterToken = (id = 'hero-token', extra = {}) => scene.tokens.add({ _id: id, actorId: actor.id, x: 100, y: 100, width: 1, height: 1, ...extra });
it('relocates direct children, retains nested IDs/customizations, then deletes only parent', async () => {
  expect((await service.removeInventoryItem(actor, command())).success).toBe(true);
  expect(actor.items.get('parent')).toBeUndefined();
  expect(actor.items.get('child').system).toMatchObject({ containerId: 'target', custom: 'retained' });
  expect(actor.items.get('nested').system).toMatchObject({ containerId: 'child', quantity: { value: 2 } });
});
it('drops contents into complete recoverable subtree payloads', async () => {
  placeCharacterToken();
  const result = await service.removeInventoryItem(actor, command({ sceneId: 's', destinations: [{ itemId: 'child', targetId: 'ground' }, { itemId: 'other', targetId: 'ground' }] }));
  expect(result.success).toBe(true); expect(actor.items.contents.map(i => i.id)).toEqual(['target']); expect(scene.tokens.contents).toHaveLength(3);
  const payload = scene.tokens.contents.map(t => t.flags?.['osp-houserules']).filter(Boolean).find(f => f.itemData._id === 'child');
  expect(payload.itemData.system.containerId).toBeNull(); expect(payload.containedItems[0]).toMatchObject({ _id: 'nested', system: { containerId: 'child', quantity: { value: 2 } } });
});
it('drops a whole populated parent once and replays safely', async () => {
  placeCharacterToken();
  const request = command({ action: 'drop', sceneId: 's' });
  expect((await service.removeInventoryItem(actor, request, 'repeat')).success).toBe(true);
  expect((await service.removeInventoryItem(actor, request, 'repeat')).success).toBe(true);
  expect(scene.tokens.contents).toHaveLength(2); expect(scene.tokens.contents.find(token => token.flags?.['osp-houserules']?.droppedItem).flags['osp-houserules'].containedItems).toHaveLength(3);
});
it('rejects aggregate capacity even when each child fits separately, without actor writes', async () => {
  await actor.items.get('target').update({ 'system.capacity': 1 }); writes = 0;
  const result = await service.removeInventoryItem(actor, command());
  expect(result.success).toBe(false); expect(writes).toBe(0); expect(actor.items.get('parent')).toBeDefined();
});
it('rejects stale inventory and invalid child selections before mutation', async () => {
  const request = command(); await actor.items.get('target').update({ 'system.capacity': 1 }); writes = 0;
  expect((await service.removeInventoryItem(actor, request)).success).toBe(false); expect(writes).toBe(0);
  expect(() => service.planItemRemoval(actor, command({ destinations: [] }))).toThrow(/every direct child/);
});
it('partial deletion changes only stack quantity; partial populated ground drops are rejected', async () => {
  await actor.items.get('parent').update({ 'system.quantity': { value: 2 } });
  expect((await service.removeInventoryItem(actor, command())).success).toBe(true);
  expect(actor.items.get('parent').system.quantity).toBe(1); expect(actor.items.get('child').system.containerId).toBe('parent');
  await actor.items.get('parent').update({ 'system.quantity': 2 });
  expect(() => service.planItemRemoval(actor, command({ action: 'drop', sceneId: 's' }), scene)).toThrow(/complete stack/);
});
it('repairs orphan roots explicitly while preserving their subtrees', async () => {
  await actor.items.get('child').update({ 'system.containerId': 'missing', 'system.lashed': true });
  expect((await service.removeInventoryItem(actor, command({ action: 'repair' }))).success).toBe(true);
  expect(actor.items.get('child').system).toMatchObject({ containerId: null, lashed: false, equipped: false });
  expect(actor.items.get('nested').system.containerId).toBe('child');
});
it('rejects containment cycles and nested destinations without mutations', async () => {
  expect(() => service.planItemRemoval(actor, command({ destinations: [{ itemId: 'child', targetId: 'child' }, { itemId: 'other', targetId: 'target' }] }))).toThrow(/outside/);
  await actor.items.get('parent').update({ 'system.containerId': 'child' }); writes = 0;
  expect((await service.removeInventoryItem(actor, command())).success).toBe(false); expect(writes).toBe(0);
});
it('ground failure restores inventory and creates no surviving tokens', async () => {
  scene.createEmbeddedDocuments = async () => { throw new Error('scene unavailable'); };
  const before = service.inventoryRemovalFingerprint(actor);
  const result = await service.removeInventoryItem(actor, command({ action: 'drop', sceneId: 's' }));
  expect(result.success).toBe(false); expect(result.recoveryRequired).toBe(false); expect(service.inventoryRemovalFingerprint(actor)).toBe(before); expect(scene.tokens.contents).toHaveLength(0);
});
it('places a dropped token east of a 2x2 source footprint', async () => {
  placeCharacterToken('large-token', { x: 1010, y: 510, width: 1, height: 1 });
  const result = await service.removeInventoryItem(actor, command({ action: 'drop', sceneId: 's' }));
  expect(result.success).toBe(true);
  const dropped = scene.tokens.contents.find(token => token.flags?.['osp-houserules']?.droppedItem);
  expect(dropped).toMatchObject({ x: 1200, y: 500 });
  actor.items = docs([entry('parent', 'container', { capacity: 20 }), entry('child', 'container', { containerId: 'parent', capacity: 10 }), entry('nested', 'item', { containerId: 'child' }), entry('other', 'item', { containerId: 'parent' }), entry('target', 'container', { capacity: 10 })], actor);
  scene.tokens = docs([], scene, true);
  placeCharacterToken('large-token', { x: 1010, y: 510, width: 2, height: 2 });
  const largeResult = await service.removeInventoryItem(actor, command({ action: 'drop', sceneId: 's' }));
  expect(largeResult.success).toBe(true);
  expect(scene.tokens.contents.find(token => token.flags?.['osp-houserules']?.droppedItem)).toMatchObject({ x: 1300, y: 500 });
});
it('refuses a missing or ambiguous source token before actor writes', async () => {
  writes = 0;
  const missing = await service.removeInventoryItem(actor, command({ action: 'drop', sceneId: 's' }));
  expect(missing.success).toBe(false); expect(writes).toBe(0);
  placeCharacterToken('one'); placeCharacterToken('two', { x: 300 }); writes = 0;
  const ambiguous = await service.removeInventoryItem(actor, command({ action: 'drop', sceneId: 's' }));
  expect(ambiguous.success).toBe(false); expect(ambiguous.reason).toMatch(/Choose which/); expect(writes).toBe(0);
  const wrong = await service.removeInventoryItem(actor, command({ action: 'drop', sceneId: 's', sourceTokenId: 'wrong' }));
  expect(wrong.success).toBe(false); expect(writes).toBe(0);
});
it('matches an unlinked actor by actorId and synthetic actors only by their exact token', async () => {
  placeCharacterToken('unlinked');
  const synthetic = { ...actor, items: actor.items, isToken: true, token: { id: 'synthetic-token' } };
  scene.tokens.add({ _id: 'other-copy', actorId: actor.id, x: 500, y: 500, width: 1, height: 1 });
  expect(() => service.planItemRemoval(synthetic, command({ action: 'drop', sceneId: 's' }), scene)).toThrow(/no placed token/);
  const result = await service.removeInventoryItem(actor, command({ action: 'drop', sceneId: 's', sourceTokenId: 'unlinked' }));
  expect(result.success).toBe(true);
});
it('rejects an authenticated outsider request without touching actor inventory', async () => {
  authority.initInventoryAuthority();
  hookCallbacks.get('createChatMessage')({ author: game.users.get('other'), flags: { 'osp-houserules': { inventoryAuthority: { type: 'request', envelope: { namespace: authority.INVENTORY_SOCKET_NAMESPACE, type: 'request', action: 'inventory.remove', operationId: 'forged', userId: 'other', details: { actorId: actor.id, actorUuid: actor.uuid, ...command() } } } } } }, {}, 'other');
  await vi.waitFor(() => expect(ChatMessage.create.mock.calls.some(([data]) => data.flags?.['osp-houserules']?.inventoryAuthority?.type === 'result')).toBe(true));
  const response = ChatMessage.create.mock.calls.find(([data]) => data.flags?.['osp-houserules']?.inventoryAuthority?.type === 'result')[0];
  expect(response.flags['osp-houserules'].inventoryAuthority.result.success).toBe(false); expect(writes).toBe(0);
});

for (const type of ['weapon', 'armor', 'item', 'container', 'coin', 'clothing', 'ammunition', 'livestock', 'spell', 'ability']) {
  it(`deletes ${type} through the authenticated removal service`, async () => {
    actor.items.add(entry('typed', type));
    expect((await service.removeInventoryItem(actor, command({ itemId: 'typed', destinations: [] }))).success).toBe(true);
    expect(actor.items.get('typed')).toBeUndefined(); expect(actor.items.get('nested')).toBeDefined();
  });
}
