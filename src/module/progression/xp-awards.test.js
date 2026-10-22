import { beforeEach, afterEach, expect, it, vi } from 'vitest';
let api, authority, actors, settings, serial;
const copy = value => structuredClone(value);
function actor(id, strength = 10) {
  const value = { id, uuid: `Actor.${id}`, type: 'character', name: id,
    system: { xp: 0, level: 1, class: 'Fighter', race: 'Human', attributes: { str: { value: strength } }, maxhitpoints: 8 },
    flags: { party: true } };
  value.getFlag = (_, key) => value.flags[key];
  value.update = vi.fn(async changes => { for (const [key, change] of Object.entries(changes)) {
    if (key.startsWith('system.')) value.system[key.slice(7)] = copy(change);
    if (key.startsWith('flags.osp-houserules.')) value.flags[key.slice(21)] = copy(change);
  } });
  actors.set(id, value); return value;
}
const refs = values => values.map(value => ({ actorId: value.id, actorUuid: value.uuid }));
beforeEach(async () => {
  vi.resetModules(); serial = 0; actors = new Map(); settings = new Map([['partyXPRemainder', 0], ['xpAwardLedger', {}]]);
  const gm = { id: 'gm', isGM: true }, player = { id: 'player' };
  globalThis.game = { system: { id: 'osp-houserules' }, world: { id: 'test' }, user: gm,
    users: Object.assign(new Map([['gm', gm], ['player', player]]), { activeGM: gm }), actors,
    settings: { get: (_, key) => settings.get(key), set: async (_, key, value) => settings.set(key, copy(value)) } };
  globalThis.foundry = { utils: { randomID: () => `id-${++serial}` } };
  delete globalThis.ChatMessage; delete globalThis.window; delete globalThis.Hooks;
  api = await import('./xp-awards.js'); authority = await import('./progression-authority.js');
});
afterEach(() => { delete globalThis.ChatMessage; delete globalThis.window; });
it('carries remainder before splitting, rounds modifiers half up, and saves no individual fraction', async () => {
  const values = [actor('a', 13), actor('b'), actor('c')];
  const first = await api.awardXP({ amount: 100, actorRefs: refs(values), awardId: 'one' });
  expect(first.success).toBe(true); expect(values.map(value => value.system.xp)).toEqual([35, 33, 33]); expect(settings.get('partyXPRemainder')).toBe(1);
  const second = await api.awardXP({ amount: 2, actorRefs: refs(values), awardId: 'two' });
  expect(second.success).toBe(true); expect(values.map(value => value.system.xp)).toEqual([36, 34, 34]); expect(settings.get('partyXPRemainder')).toBe(0);
  expect(api.calculateXPAward({ amount: 10, actors: [values[0]] }).entries[0].awarded).toBe(11);
});
it('direct awards give full per-actor amount without changing remainder', async () => {
  settings.set('partyXPRemainder', 2); const values = [actor('a'), actor('b')];
  expect((await api.awardXP({ amount: 100, party: false, actorRefs: refs(values), awardId: 'direct' })).success).toBe(true);
  expect(values.map(value => value.system.xp)).toEqual([100, 100]); expect(settings.get('partyXPRemainder')).toBe(2);
});
it('deduplicates double clicks and rejects a changed payload for the same ID', async () => {
  const value = actor('a'); const request = { amount: 10, actorRefs: refs([value, value]), awardId: 'same' };
  await Promise.all([api.awardXP(request), api.awardXP(request)]); expect(value.system.xp).toBe(10); expect(value.update).toHaveBeenCalledTimes(1);
  expect((await api.awardXP({ ...request, amount: 11 })).success).toBe(false); expect(value.system.xp).toBe(10);
});
it('resumes a partial award using saved modifiers without applying the first actor twice', async () => {
  const a = actor('a'), b = actor('b'); const update = b.update; b.update = vi.fn(async () => { throw new Error('disconnect'); });
  expect((await api.awardXP({ amount: 20, actorRefs: refs([a, b]), awardId: 'partial' })).recoveryRequired).toBe(true);
  expect(a.system.xp).toBe(10); b.system.attributes.str.value = 18; b.update = update;
  expect((await api.recoverXPAward('partial')).success).toBe(true); expect([a.system.xp, b.system.xp]).toEqual([10, 10]); expect(a.update).toHaveBeenCalledTimes(1);
});
it('recognizes an atomic actor write when its acknowledgment is lost', async () => {
  const a = actor('a'); const update = a.update; a.update = vi.fn(async (...args) => { await update(...args); throw new Error('lost ack'); });
  expect((await api.awardXP({ amount: 10, actorRefs: refs([a]), awardId: 'lost' })).success).toBe(true);
  expect((await api.awardXP({ amount: 10, actorRefs: refs([a]), awardId: 'lost' })).success).toBe(true); expect(a.system.xp).toBe(10);
});
it('rejects XP equality without a receipt and blocks newer awards until recovery', async () => {
  const a = actor('a'), b = actor('b'); const update = b.update; b.update = async () => { throw new Error('offline'); };
  await api.awardXP({ amount: 20, actorRefs: refs([a, b]), awardId: 'partial' }); b.system.xp = 10; b.update = update;
  expect((await api.recoverXPAward('partial')).success).toBe(false);
  expect((await api.awardXP({ amount: 1, actorRefs: refs([a]), awardId: 'new' })).success).toBe(false); expect(a.system.xp).toBe(10);
});
it('undo restores XP and remainder once, with immutable progression snapshots', async () => {
  const values = [actor('a'), actor('b')]; await api.awardXP({ amount: 3, actorRefs: refs(values), awardId: 'undo' });
  expect((await api.undoXPAward('undo')).success).toBe(true); expect(values.map(value => value.system.xp)).toEqual([0, 0]); expect(settings.get('partyXPRemainder')).toBe(0);
  expect((await api.undoXPAward('undo')).success).toBe(true); expect(values[0].update).toHaveBeenCalledTimes(2);
});
it('resumes partial undo without rejecting or rewriting an already restored actor', async () => {
  const a = actor('a'), b = actor('b'); await api.awardXP({ amount: 20, actorRefs: refs([a, b]), awardId: 'undo' });
  const update = b.update; b.update = async () => { throw new Error('disconnect'); };
  expect((await api.undoXPAward('undo')).recoveryRequired).toBe(true); expect(a.system.xp).toBe(0);
  b.update = update; expect((await authority.recoverProgressionOperation('undo-undo')).success).toBe(true); expect(b.system.xp).toBe(0); expect(a.update).toHaveBeenCalledTimes(2);
});
it.each(['maxhitpoints', 'climbSheer'])('blocks automatic undo after %s changes', async field => {
  const a = actor('a'); await api.awardXP({ amount: 10, actorRefs: refs([a]), awardId: 'advanced' }); a.system[field] = 42;
  expect(await api.undoXPAward('advanced')).toMatchObject({ success: false, manualRepair: true }); expect(a.system.xp).toBe(10);
});
it('refuses foreign UUIDs, nonparty group awards, malformed XP and unsafe amounts', async () => {
  const a = actor('a'); expect((await api.awardXP({ amount: 10, actorRefs: [{ actorId: a.id, actorUuid: 'Actor.foreign' }], awardId: 'foreign' })).success).toBe(false);
  a.flags.party = false; expect((await api.awardXP({ amount: 10, actorRefs: refs([a]), awardId: 'nonparty' })).success).toBe(false);
  a.flags.party = true; a.system.xp = 'bad'; expect((await api.awardXP({ amount: 10, actorRefs: refs([a]), awardId: 'bad' })).success).toBe(false);
  expect(() => api.calculateXPAward({ amount: Number.MAX_SAFE_INTEGER, remainder: 1, actors: [actor('b')] })).toThrow();
});
