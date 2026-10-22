import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../dice.js', () => ({ ospRoll: vi.fn() }));
import { ospRoll } from '../dice.js';
let api, authority, actor, settings, id;
const copy = value => structuredClone(value);
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); id = 0; settings = new Map();
  const gm = { id: 'gm', isGM: true, active: true }, player = { id: 'player', active: true }, stranger = { id: 'stranger', active: true };
  actor = { id: 'a', uuid: 'Actor.a', type: 'character', name: 'Test', system: { class: 'Mage', race: 'Human', level: 10, maxhitpoints: 37, hitpoints: 19, attributes: { con: { value: 18 } } }, flags: { lastKnownLevel: 9 },
    getFlag: (_, key) => actor.flags[key], testUserPermission: user => user.id === 'player',
    update: vi.fn(async changes => { for (const [key, value] of Object.entries(changes)) {
      if (key.startsWith('system.')) actor.system[key.slice(7)] = copy(value);
      if (key.startsWith('flags.osp-houserules.')) actor.flags[key.slice(21)] = copy(value);
    } }) };
  globalThis.game = { system: { id: 'osp-houserules' }, world: { id: 'world' }, user: gm,
    users: Object.assign(new Map([['gm', gm], ['player', player], ['stranger', stranger]]), { activeGM: gm, contents: [gm] }),
    actors: new Map([['a', actor]]), settings: { get: (_, key) => settings.get(key), set: async (_, key, value) => settings.set(key, copy(value)) } };
  globalThis.foundry = { utils: { randomID: () => `id-${++id}` } }; delete globalThis.ChatMessage; delete globalThis.window; delete globalThis.Hooks;
  const storage = new Map(); globalThis.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  api = await import('./level-up.js'); authority = await import('../progression/progression-authority.js'); api.registerLevelUpAuthority();
});
afterEach(() => { delete globalThis.window; delete globalThis.ChatMessage; delete globalThis.sessionStorage; });
async function prepare() { return authority.requestProgressionMutation('level.prepare', { actorId: 'a', targetLevel: actor.system.level }, `prepare-${++id}`); }
async function claim(level) { return authority.requestProgressionMutation('level.claim', { actorId: 'a', level, ownerId: 'gm' }, `claim-${++id}`); }
async function commit(level, token, hp, operationId = `commit-${++id}`) { return authority.requestProgressionMutation('level.commitHP', { actorId: 'a', level, claimToken: token, ownerId: 'gm', hp }, operationId); }
it.each([['Mage', 1], ['Fighter', 2], ['Dwarf', 3], ['Barbarian', 3]])('%s fixed level-10 HP omits CON and commits once', async (cls, gain) => {
  actor.system.class = cls; actor.system.race = cls === 'Dwarf' ? 'Dwarf' : 'Human';
  expect((await prepare()).success).toBe(true); const token = (await claim(10)).claimToken;
  expect((await commit(10, token, gain)).success).toBe(true); expect(actor.system.maxhitpoints).toBe(37 + gain); expect(actor.system.hitpoints).toBe(19);
  expect((await commit(10, token, gain)).replay).toBe(true); expect(actor.system.maxhitpoints).toBe(37 + gain); expect(actor.flags.lastKnownLevel).toBe(10);
});
it('rolls then adds fixed gains across the named-HD boundary', async () => {
  actor.flags.lastKnownLevel = 8; actor.system.level = 11; ospRoll.mockResolvedValue({ total: 7 });
  expect((await api.processLevelUp(actor)).success).toBe(true); expect(actor.system.maxhitpoints).toBe(46); expect(ospRoll).toHaveBeenCalledTimes(1); expect(ospRoll).toHaveBeenCalledWith('1d6+3', expect.any(Object));
});
it('cancellation retains completed levels and resumes only the unfinished level', async () => {
  actor.flags.lastKnownLevel = 1; actor.system.level = 3;
  ospRoll.mockResolvedValueOnce({ total: 5 }).mockResolvedValueOnce({ cancelled: true });
  expect((await api.processLevelUp(actor)).cancelled).toBe(true); expect(actor.system.maxhitpoints).toBe(42); expect(actor.flags.lastKnownLevel).toBe(2);
  ospRoll.mockResolvedValueOnce({ total: 4 }); expect((await api.resumeLevelUp(actor)).success).toBe(true); expect(actor.system.maxhitpoints).toBe(46); expect(ospRoll).toHaveBeenCalledTimes(3);
  await api.resumeLevelUp(actor); expect(ospRoll).toHaveBeenCalledTimes(3);
});
it('concurrent local callers produce one HP gain per level', async () => {
  actor.flags.lastKnownLevel = 1; actor.system.level = 2; ospRoll.mockResolvedValue({ total: 4 });
  const results = await Promise.all([api.processLevelUp(actor), api.processLevelUp(actor)]); expect(results.every(result => result.success)).toBe(true); expect(actor.system.maxhitpoints).toBe(41); expect(ospRoll).toHaveBeenCalledTimes(1);
});
it('lost actor acknowledgment preserves its committed HP and skill credit', async () => {
  actor.system.class = 'Assassin'; actor.system.level = 2; actor.flags.lastKnownLevel = 1; actor.flags.pendingSkillPoints = 3;
  await prepare(); const token = (await claim(2)).claimToken; const write = actor.update;
  actor.update = vi.fn(async (...args) => { await write(...args); throw new Error('lost ack'); });
  expect((await commit(2, token, 4)).success).toBe(true); expect(actor.flags.pendingSkillPoints).toBe(4); expect(actor.flags.skillPointFraction).toBe(0.5);
  expect((await commit(2, token, 4)).success).toBe(true); expect(actor.system.maxhitpoints).toBe(41); expect(actor.flags.pendingSkillPoints).toBe(4);
});
it.each([undefined, null, ''])('requires manual repair for missing HP %s', async hp => {
  actor.system.maxhitpoints = hp; await prepare(); const token = (await claim(10)).claimToken;
  expect(await commit(10, token, 1)).toMatchObject({ success: false, manualRepair: true }); expect(actor.system.maxhitpoints).toBe(hp); expect(actor.flags.lastKnownLevel).toBe(9);
});
it('does not allow supplied levels to manufacture historical gains or exceed racial caps', async () => {
  actor.flags.lastKnownLevel = 10; expect((await authority.requestProgressionMutation('level.prepare', { actorId: 'a', fromLevel: 1, targetLevel: 14 })).noop).toBe(true);
  actor.system.class = 'Warden'; actor.system.race = 'Hobbit'; actor.system.level = 6; actor.flags.lastKnownLevel = 6; expect((await api.processLevelUp(actor, { targetLevel: 14 })).noop).toBe(true); expect(actor.update).not.toHaveBeenCalled();
});
it('rejects out-of-order or invalid HP submissions without changing the balance', async () => {
  await prepare(); expect((await claim(11)).success).toBe(false); const token = (await claim(10)).claimToken;
  expect((await commit(10, token, 4)).success).toBe(false); expect(actor.system.maxhitpoints).toBe(37);
});
it('migrates historical HP and existing skill balances without awarding anything', async () => {
  actor.flags = { pendingSkillPoints: 7 }; const hp = actor.system.maxhitpoints;
  expect((await api.migrateLevelUpState(actor)).success).toBe(true); expect(actor.flags.lastKnownLevel).toBe(10); expect(actor.flags.pendingSkillPoints).toBe(7); expect(actor.system.maxhitpoints).toBe(hp); expect(ospRoll).not.toHaveBeenCalled();
});
it('allocates skills atomically with version, whitelist, cap, and replay guards', async () => {
  actor.system.class = 'Thief'; actor.system.climbSheer = 1; actor.flags.pendingSkillPoints = 4; actor.flags.skillPoolVersion = 0;
  const details = { actorId: 'a', allocationId: 'allocate', poolVersion: 0, allocation: { climbSheer: 2 } };
  expect((await authority.requestProgressionMutation('skill.allocate', details, 'allocate')).success).toBe(true); expect(actor.system.climbSheer).toBe('3'); expect(actor.flags.pendingSkillPoints).toBe(2);
  expect((await authority.requestProgressionMutation('skill.allocate', details, 'allocate')).success).toBe(true); expect(actor.flags.pendingSkillPoints).toBe(2);
  expect((await authority.requestProgressionMutation('skill.allocate', { ...details, allocationId: 'stale' }, 'stale')).success).toBe(false);
  expect((await authority.requestProgressionMutation('skill.allocate', { ...details, poolVersion: 1, allocationId: 'foreign', allocation: { evil: 1 } }, 'foreign')).success).toBe(false);
});

it('authenticates player requests, elects one owner, and rejects stale owner claims after handover', async () => {
  const player = game.users.get('player'), stranger = game.users.get('stranger');
  game.users.contents = [game.user, player, stranger];
  const hooks = new Map(), replies = [];
  globalThis.Hooks = { on: (event, callback) => hooks.set(event, callback) };
  globalThis.ChatMessage = { create: async data => { replies.push(data.flags['osp-houserules'].progressionAuthority); return data; } };
  authority.initProgressionAuthority();
  const send = async (user, action, details, operationId) => {
    hooks.get('createChatMessage')({ author: user, flags: { 'osp-houserules': { progressionAuthority: { type: 'request', envelope: { namespace: authority.PROGRESSION_SOCKET_NAMESPACE, type: 'request', userId: user.id, action, details, operationId } } } } }, {}, user.id);
    for (let i = 0; i < 150; i++) await Promise.resolve();
    return replies.find(reply => reply.operationId === operationId)?.result;
  };
  expect((await api.processLevelUp(actor)).success).toBe(false); expect(actor.update).not.toHaveBeenCalled();
  expect((await send(stranger, 'level.prepare', { actorId: 'a', targetLevel: 10 }, 'foreign-owner')).success).toBe(false);
  expect((await send(player, 'level.prepare', { actorId: 'a', targetLevel: 10 }, 'player-prepare')).success).toBe(true);
  const claimed = await send(player, 'level.claim', { actorId: 'a', level: 10, ownerId: player.id }, 'player-claim'); expect(claimed.success).toBe(true);
  player.active = false;
  expect((await send(player, 'level.commitHP', { actorId: 'a', level: 10, ownerId: player.id, claimToken: claimed.claimToken, hp: 1 }, 'stale-owner')).success).toBe(false); expect(actor.system.maxhitpoints).toBe(37);
  const replacement = await send(game.user, 'level.claim', { actorId: 'a', level: 10, ownerId: game.user.id }, 'replacement'); expect(replacement.success).toBe(true); expect(replacement.claimToken).not.toBe(claimed.claimToken);
  expect((await send(game.user, 'level.commitHP', { actorId: 'a', level: 10, ownerId: game.user.id, claimToken: replacement.claimToken, hp: 1 }, 'replacement-commit')).success).toBe(true); expect(actor.system.maxhitpoints).toBe(38);
});
