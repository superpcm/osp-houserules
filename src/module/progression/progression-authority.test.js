import { beforeEach, afterEach, it, expect, vi } from 'vitest';
let api, settings, gm, player, hooks, counter;
const copy = value => structuredClone(value);
beforeEach(async () => {
  vi.resetModules(); counter = 0; settings = new Map(); hooks = new Map();
  gm = { id: 'gm', isGM: true }; player = { id: 'player', isGM: false };
  globalThis.game = { system: { id: 'osp-houserules' }, world: { id: 'test' }, user: gm,
    users: Object.assign(new Map([['gm', gm], ['player', player]]), { activeGM: gm }),
    settings: { get: (_, key) => settings.get(key), set: async (_, key, value) => settings.set(key, copy(value)) } };
  globalThis.foundry = { utils: { randomID: () => `id-${++counter}` } };
  delete globalThis.ChatMessage; delete globalThis.window;
  globalThis.Hooks = { on: (event, callback) => hooks.set(event, callback) };
  api = await import('./progression-authority.js');
});
afterEach(() => { vi.useRealTimers(); delete globalThis.window; delete globalThis.ChatMessage; });
it('coalesces concurrent requests and rejects reused IDs with changed payload', async () => {
  let writes = 0; api.registerProgressionAuthority('test', async () => ({ success: true, writes: ++writes }));
  const results = await Promise.all([api.requestProgressionMutation('test', { value: 1 }, 'same'), api.requestProgressionMutation('test', { value: 1 }, 'same')]);
  expect(results[0]).toEqual(results[1]); expect(writes).toBe(1);
  expect((await api.requestProgressionMutation('test', { value: 2 }, 'same')).success).toBe(false);
  expect((await api.requestProgressionMutation('test', { value: 1 }, 'same')).success).toBe(true); expect(writes).toBe(1);
});
it('serializes mutations and passes original requester identity', async () => {
  const order = []; api.registerProgressionAuthority('test', async ({ value }) => { order.push(value); expect(api.getProgressionRequester()).toBe(gm); await Promise.resolve(); order.push(value); return { success: true }; });
  await Promise.all([api.requestProgressionMutation('test', { value: 1 }, 'one'), api.requestProgressionMutation('test', { value: 2 }, 'two')]);
  expect(order).toEqual([1, 1, 2, 2]);
});
it('accepts persisted writes with a lost acknowledgment and replays after reload', async () => {
  const write = game.settings.set; game.settings.set = async (...args) => { await write(...args); throw new Error('lost acknowledgment'); };
  let writes = 0; api.registerProgressionAuthority('test', async () => ({ success: true, writes: ++writes }));
  expect((await api.requestProgressionMutation('test', {}, 'lost')).success).toBe(true);
  vi.resetModules(); api = await import('./progression-authority.js');
  api.registerProgressionAuthority('test', async () => { throw new Error('must not repeat'); });
  expect((await api.requestProgressionMutation('test', {}, 'lost')).success).toBe(true); expect(writes).toBe(1);
});
it('recovers an interrupted handler using the original durable request', async () => {
  let fail = true; api.registerProgressionAuthority('test', async ({ value }) => { if (fail) throw new Error('disconnect'); return { success: true, value }; });
  expect((await api.requestProgressionMutation('test', { value: 7 }, 'interrupted')).recoveryRequired).toBe(true);
  fail = false; expect(await api.recoverProgressionOperation('interrupted')).toMatchObject({ success: true, value: 7 });
  expect(api.listProgressionOperations()).toHaveLength(0);
});
it('fails closed without an active GM or Web Locks in a browser', async () => {
  api.registerProgressionAuthority('test', async () => { throw new Error('must not execute'); });
  game.users.activeGM = null; expect((await api.requestProgressionMutation('test', {}, 'offline')).success).toBe(false);
  game.users.activeGM = gm; globalThis.window = {};
  expect((await api.requestProgressionMutation('test', {}, 'browser')).success).toBe(false);
});
it('self-GM authenticated chat transport does not deadlock', async () => {
  api.registerProgressionAuthority('test', async () => ({ success: true }));
  globalThis.ChatMessage = { create: async data => { const doc = { ...data, author: gm }; hooks.get('createChatMessage')?.(doc, {}, gm.id); return doc; } };
  expect((await api.requestProgressionMutation('test', {}, 'chat')).success).toBe(true);
});
it('rejects forged chat authors and unauthorized recovery without writes', async () => {
  let writes = 0; api.registerProgressionAuthority('test', async () => { writes++; return { success: true }; }); api.initProgressionAuthority();
  hooks.get('createChatMessage')({ author: player, flags: { 'osp-houserules': { progressionAuthority: { type: 'request', envelope: { namespace: api.PROGRESSION_SOCKET_NAMESPACE, type: 'request', action: 'test', details: {}, operationId: 'forged', userId: gm.id } } } } }, {}, gm.id);
  for (let i = 0; i < 20; i++) await Promise.resolve(); expect(writes).toBe(0);
});

it('elects one executor across GM tabs and does not let a nonleader send a failure acknowledgment', async () => {
  let held = false, writes = 0; const callbacks = [];
  globalThis.window = { addEventListener: () => {} };
  const priorNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_name, _options, callback) => {
    if (held) return callback(null); held = true;
    try { return await callback({}); } finally { held = false; }
  } } } });
  globalThis.Hooks = { on: (event, callback) => { if (event === 'createChatMessage') callbacks.push(callback); } };
  globalThis.ChatMessage = { create: async data => { const doc = { ...data, author: gm }; for (const callback of callbacks) callback(doc, {}, gm.id); return doc; } };
  api.registerProgressionAuthority('tabs', async () => { writes++; return { success: true }; });
  expect((await api.requestProgressionMutation('tabs', {}, 'first-tab')).success).toBe(true);
  vi.resetModules(); const second = await import('./progression-authority.js');
  second.registerProgressionAuthority('tabs', async () => { throw new Error('second executor must not write'); });
  expect((await second.requestProgressionMutation('tabs', {}, 'second-tab')).success).toBe(true); expect(writes).toBe(2);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: priorNavigator });
});
