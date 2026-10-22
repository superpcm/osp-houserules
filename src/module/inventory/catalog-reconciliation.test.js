import { describe, expect, it, beforeEach, vi } from 'vitest';
import { pureBuildReconciliationPlan } from './catalog-reconciliation.js';

const item = (overrides = {}) => ({ id: 'i1', name: 'Sword', type: 'weapon', system: { unitWeight: 3, storedSize: 6, quantity: 4, equipped: true, ...overrides } });
const catalog = [{ name: 'Sword', type: 'weapon', system: { unitWeight: 4, storedSize: 8 } }];

describe('catalog reconciliation plan', () => {
  it('matches exact name and type and limits changes to catalog fields', () => {
    const [row] = pureBuildReconciliationPlan([item()], catalog);
    expect(row.classification).toBe('review');
    expect(row.newFields).toEqual({ 'system.unitWeight': 4, 'system.storedSize': 8 });
    expect(row.oldFields).toEqual({ 'system.unitWeight': 3, 'system.storedSize': 6 });
  });
  it('preserves explicitly custom items', () => {
    const [row] = pureBuildReconciliationPlan([{ ...item(), flags: { 'osp-houserules': { custom: true } } }], catalog);
    expect(row.classification).toBe('custom');
  });
  it('does not use image paths or renamed entries as matches', () => {
    expect(pureBuildReconciliationPlan([{ ...item(), name: 'Renamed Sword', img: 'sword.webp' }], [{ ...catalog[0], img: 'sword.webp' }])[0].classification).toBe('unmatched');
  });
  it('marks duplicate catalog identities ambiguous', () => {
    expect(pureBuildReconciliationPlan([item()], [...catalog, ...catalog])[0].classification).toBe('ambiguous');
  });
  it('does not treat an explicit zero as missing', () => {
    const [row] = pureBuildReconciliationPlan([item({ unitWeight: 0 })], [{ name: 'Sword', type: 'weapon', system: { unitWeight: 2 } }]);
    expect(row.oldFields['system.unitWeight']).toBe(0);
  });
});

describe('BR-13 durable reconciliation', () => {
  let api, authority, value, settings, gm, serial;
  beforeEach(async () => {
    vi.resetModules(); settings = new Map(); serial = 0; gm = { id: 'gm', isGM: true };
    value = { id: 'item', name: 'Sword', type: 'weapon', system: { weight: 40, storedSize: 6, quantity: 7, cost: 123, equipped: true, containerId: 'bag' }, flags: {},
      update: vi.fn(async changes => {
        for (const [key, val] of Object.entries(changes.system || {})) { if (key.startsWith('-=')) delete value.system[key.slice(2)]; else value.system[key] = structuredClone(val); }
        if (changes.flags) for (const [scope, flags] of Object.entries(changes.flags)) value.flags[scope] = { ...value.flags[scope], ...structuredClone(flags) };
      }) };
    globalThis.game = { system: { id: 'osp-houserules' }, world: { id: 'test' }, user: gm, users: Object.assign(new Map([['gm', gm], ['player', { id: 'player' }]]), { activeGM: gm }), items: new Map([['item', value]]), actors: new Map(), settings: { get: (_, key) => settings.get(key), set: async (_, key, data) => settings.set(key, structuredClone(data)) } };
    globalThis.fetch = vi.fn(async path => ({ ok: true, json: async () => path.endsWith('weapons.json') ? catalog : [] }));
    globalThis.foundry = { utils: { randomID: () => `id-${++serial}` } }; delete globalThis.ChatMessage; delete globalThis.window; delete globalThis.Hooks;
    api = await import('./catalog-reconciliation.js'); authority = await import('../progression/progression-authority.js'); api.registerCatalogReconciliationAuthority();
  });
  const selection = value => ({ itemId: value.id, expectedOldFields: api.existingCatalogFields(value), newFields: { 'system.cost': 0 }, catalogIdentity: 'Another item|weapon' });
  it('loads trusted exact values, converts legacy schema and preserves all inventory state', async () => {
    const before = structuredClone(value.system);
    expect((await api.executeSelectedReconciliation(selection(value), 'apply')).success).toBe(true);
    expect(value.system).toEqual({ unitWeight: 4, storedSize: 8, quantity: 7, cost: 123, equipped: true, containerId: 'bag' });
    const receipt = value.flags['osp-houserules'].catalogReconciliations[0];
    expect((await api.undoCatalogReconciliation(receipt)).success).toBe(true); expect(value.system).toEqual(before);
    expect((await api.undoCatalogReconciliation(receipt)).success).toBe(true); expect(value.update).toHaveBeenCalledTimes(2);
  });
  it('recovers an applied update after lost actor acknowledgment without writing twice', async () => {
    const update = value.update; value.update = vi.fn(async (...args) => { await update(...args); throw new Error('lost ack'); });
    expect((await api.executeSelectedReconciliation(selection(value), 'lost')).success).toBe(true);
    const receipt = value.flags['osp-houserules'].catalogReconciliations[0];
    expect((await authority.recoverProgressionOperation('lost')).success).toBe(true); expect(receipt.newFields['system.unitWeight']).toBe(4); expect(value.update).toHaveBeenCalledTimes(1);
  });
  it('resumes a rejected write from the original request and blocks stale review', async () => {
    const update = value.update; value.update = vi.fn(async () => { throw new Error('offline'); });
    expect((await api.executeSelectedReconciliation(selection(value), 'partial')).recoveryRequired).toBe(true); value.update = update;
    expect((await authority.recoverProgressionOperation('partial')).success).toBe(true);
    const stale = selection(value); value.system.unitWeight = 9;
    expect((await api.executeSelectedReconciliation(stale, 'stale')).success).toBe(false); expect(value.system.unitWeight).toBe(9);
  });
  it('resolves actor-owned items and refuses explicit custom or active-effect items', async () => {
    game.items.delete('item'); game.actors.set('actor', { id: 'actor', items: new Map([['item', value]]) });
    expect((await api.executeSelectedReconciliation({ ...selection(value), actorId: 'actor' }, 'actor')).success).toBe(true);
    value.flags['osp-houserules'].custom = true;
    expect((await api.executeSelectedReconciliation({ ...selection(value), actorId: 'actor' }, 'custom')).success).toBe(false);
    value.flags['osp-houserules'].custom = false; value.effects = [{}];
    expect((await api.executeSelectedReconciliation({ ...selection(value), actorId: 'actor' }, 'effects')).success).toBe(false);
  });
  it('blocks changed-value undo and forged receipts', async () => {
    await api.executeSelectedReconciliation(selection(value), 'apply'); const receipt = value.flags['osp-houserules'].catalogReconciliations[0]; value.system.unitWeight = 99;
    expect((await api.undoCatalogReconciliation(receipt)).success).toBe(false); expect(value.system.unitWeight).toBe(99);
    expect((await api.undoCatalogReconciliation({ ...receipt, operationId: 'forged', oldFields: { 'system.cost': 0 } })).success).toBe(false); expect(value.system.cost).toBe(123);
  });
  it('authenticates the original GM rather than the executing client', async () => {
    let callback; const results = [];
    globalThis.Hooks = { on: (event, handler) => { if (event === 'createChatMessage') callback = handler; } };
    globalThis.ChatMessage = { create: async data => { results.push(data.flags['osp-houserules'].progressionAuthority.result); } }; authority.initProgressionAuthority();
    const player = game.users.get('player');
    callback({ author: player, flags: { 'osp-houserules': { progressionAuthority: { type: 'request', envelope: { namespace: authority.PROGRESSION_SOCKET_NAMESPACE, type: 'request', action: 'catalog.reconcile', userId: player.id, operationId: 'forbidden', details: selection(value) } } } } }, {}, player.id);
    for (let index = 0; index < 100; index++) await Promise.resolve(); expect(results[0].success).toBe(false); expect(value.update).not.toHaveBeenCalled();
  });
});
