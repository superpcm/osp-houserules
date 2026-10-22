import { beforeEach, describe, expect, it, vi } from 'vitest';
import house from '../../../data/ose_house_rules_v1_5.json';
const mocks = vi.hoisted(() => ({ roll: vi.fn(), confirm: vi.fn(), recover: vi.fn() }));
vi.mock('../dice.js', () => ({ ospRoll: mocks.roll }));
vi.mock('./noncombat-prompts.js', async importOriginal => ({ ...await importOriginal(), confirmPrivateCheck: mocks.confirm, recoverPrivateDie: mocks.recover }));
let actor, hooks, service, authority, failComplete, failAck;
const clone = value => structuredClone(value);
const journals = () => game.messages.filter(message => message.flags?.['osp-houserules']?.noncombatCheck);
const dataOf = message => message.flags['osp-houserules'].noncombatCheck;

beforeEach(async () => {
  vi.resetModules();
  mocks.roll.mockReset().mockResolvedValue({ total: 2, cancelled: false });
  mocks.confirm.mockReset().mockResolvedValue({ victimLevel: 6, modifier: -25 });
  mocks.recover.mockReset().mockResolvedValue({ actual: 2 });
  failComplete = false; failAck = false;
  actor = { type: 'character', uuid: 'Actor.a1', name: 'Scout', system: { class: 'Thief', race: 'Elf', level: 3, listeningAtDoors: 1, pickPockets: 5, findTraps: 4, openLocks: 3, climbSheer: 3, moveSilently: 3, hideShadows: 2, attributes: { int: { value: 18 }, wis: { value: 16 } } }, items: [], testUserPermission: user => ['gm', 'owner'].includes(user.id) };
  const gm = { id: 'gm', isGM: true }, owner = { id: 'owner', isGM: false }, stranger = { id: 'stranger', isGM: false };
  const users = new Map([['gm', gm], ['owner', owner], ['stranger', stranger]]); users.activeGM = gm;
  const settings = new Map(); hooks = new Map();
  vi.stubGlobal('game', { system: { id: 'osp-houserules' }, world: { id: 'test' }, user: gm, users, messages: [], settings: { get: (_scope, key) => settings.get(key), set: async (_scope, key, value) => settings.set(key, clone(value)) } });
  vi.stubGlobal('fromUuid', vi.fn(async uuid => uuid === actor.uuid ? actor : null));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => house })));
  vi.stubGlobal('Hooks', { on: (name, callback) => hooks.set(name, callback) });
  vi.stubGlobal('ChatMessage', { create: vi.fn(async input => {
    const message = { ...clone(input), author: game.user, async update(update) {
      const value = update['flags.osp-houserules.noncombatCheck'];
      if (failComplete && value?.stage === 'complete') { failComplete = false; throw new Error('secret die 2, victim level 6'); }
      this.content = update.content; this.flags['osp-houserules'].noncombatCheck = clone(value);
      if (failAck && value?.stage === 'complete') { failAck = false; throw new Error('lost acknowledgment'); }
      return this;
    } };
    game.messages.push(message); hooks.get('createChatMessage')?.(message, {}, game.user.id); return message;
  }) });
  service = await import('./noncombat.js'); authority = await import('../progression/progression-authority.js'); service.registerNoncombatAuthority(); authority.initProgressionAuthority();
});

async function forged(userId, checkId, extra = {}) {
  const operationId = `test-${userId}`;
  hooks.get('createChatMessage')({ author: game.users.get(userId), flags: { 'osp-houserules': { progressionAuthority: { type: 'request', envelope: { namespace: authority.PROGRESSION_SOCKET_NAMESPACE, type: 'request', action: 'noncombat.check', operationId, userId, details: { actorUuid: actor.uuid, checkId, ...extra } } } } } }, {}, userId);
  await vi.waitFor(() => expect(game.messages.some(message => message.flags?.['osp-houserules']?.progressionAuthority?.operationId === operationId)).toBe(true));
  return game.messages.find(message => message.flags?.['osp-houserules']?.progressionAuthority?.operationId === operationId).flags['osp-houserules'].progressionAuthority.result;
}

describe('BR-17 private checks', () => {
  it('uses actual stored training and privately supplied victim level, publishing no dice in receipts', async () => {
    const result = await service.requestNoncombatCheck(actor.uuid, 'pickPockets', 'pockets');
    expect(result).toEqual({ success: true, private: true, operationId: 'pockets' });
    expect(dataOf(journals()[0])).toMatchObject({ target: 3, roll: 2, context: { victimLevel: 6 }, outcome: { success: true }, stage: 'complete' });
    expect(journals()[0].whisper).toEqual(['gm']);
    const receipt = game.settings.get('osp-houserules', authority.RECEIPTS_SETTING).pockets;
    expect(receipt.details).toEqual({ actorUuid: actor.uuid, checkId: 'pickPockets' });
    expect(receipt.result).toEqual(result);
    expect(mocks.roll).toHaveBeenCalledWith('1d6', expect.objectContaining({ strictIntegers: true }));
  });
  it('records natural-6 detection privately even at zero chance', async () => {
    mocks.confirm.mockResolvedValue({ victimLevel: 30, modifier: 0 }); mocks.roll.mockResolvedValue({ total: 6 });
    await service.requestNoncombatCheck(actor.uuid, 'pickPockets');
    expect(dataOf(journals()[0])).toMatchObject({ target: 0, outcome: { success: false, noticed: true } });
    expect(journals()[0].content).toContain('theft noticed');
  });
  it('authenticates owner requests and rejects strangers before prompts or dice', async () => {
    expect((await forged('stranger', 'pickPockets')).success).toBe(false);
    expect(mocks.confirm).not.toHaveBeenCalled(); expect(mocks.roll).not.toHaveBeenCalled();
    expect((await forged('owner', 'pickPockets')).success).toBe(true);
    expect(journals()[0].whisper).toEqual(['gm']);
  });
  it('rejects client-supplied victim levels and hidden modifiers', async () => {
    expect((await forged('owner', 'pickPockets', { victimLevel: 0 })).success).toBe(false);
    expect(mocks.roll).not.toHaveBeenCalled();
  });
  it('reuses completed and simultaneous operation IDs without another die', async () => {
    const [a, b] = await Promise.all([service.requestNoncombatCheck(actor.uuid, 'pickPockets', 'same'), service.requestNoncombatCheck(actor.uuid, 'pickPockets', 'same')]);
    expect(a).toEqual(b); expect(await service.requestNoncombatCheck(actor.uuid, 'pickPockets', 'same')).toEqual(a);
    expect(mocks.roll).toHaveBeenCalledOnce(); expect(journals()).toHaveLength(1);
  });
  it('persists rolling stage before dice and recovers an interrupted result without rerolling', async () => {
    mocks.roll.mockImplementation(async () => { expect(dataOf(journals()[0]).stage).toBe('rolling'); return { total: 2 }; });
    failComplete = true;
    const result = await service.requestNoncombatCheck(actor.uuid, 'pickPockets', 'interrupted');
    expect(result.recoveryRequired).toBe(true); expect(result.reason).not.toContain('victim');
    expect((await authority.recoverProgressionOperation('interrupted')).success).toBe(true);
    expect(mocks.recover).toHaveBeenCalledOnce(); expect(mocks.roll).toHaveBeenCalledOnce();
    expect(dataOf(journals()[0]).stage).toBe('complete');
  });
  it('handles a lost write acknowledgment without rerolling', async () => {
    failAck = true;
    expect((await service.requestNoncombatCheck(actor.uuid, 'pickPockets')).success).toBe(true);
    expect(mocks.roll).toHaveBeenCalledOnce(); expect(journals()).toHaveLength(1);
  });
  it('keeps recovery pending when the GM declines to resolve an interrupted die', async () => {
    failComplete = true; await service.requestNoncombatCheck(actor.uuid, 'pickPockets', 'pending');
    mocks.recover.mockResolvedValue(null);
    expect((await authority.recoverProgressionOperation('pending')).targetRecoveryRequired).toBe(true);
    expect(mocks.roll).toHaveBeenCalledOnce();
  });
  it('requires a durable private journal before any roll', async () => {
    ChatMessage.create.mockImplementation(async input => {
      if (input.flags?.['osp-houserules']?.noncombatCheck) throw new Error('private storage unavailable');
      const message = { ...input, author: game.user }; game.messages.push(message); hooks.get('createChatMessage')?.(message, {}, game.user.id); return message;
    });
    expect((await service.requestNoncombatCheck(actor.uuid, 'pickPockets')).recoveryRequired).toBe(true);
    expect(mocks.roll).not.toHaveBeenCalled();
  });
  it('cancels before dice if the GM does not confirm prerequisites', async () => {
    mocks.confirm.mockResolvedValue(null);
    expect((await service.requestNoncombatCheck(actor.uuid, 'pickPockets')).success).toBe(false);
    expect(mocks.roll).not.toHaveBeenCalled(); expect(journals()).toHaveLength(0);
  });
  it('fetches the source table and adds full INT for Mage checks', async () => {
    actor.system.class = 'Mage'; actor.system.level = 1;
    await service.requestNoncombatCheck(actor.uuid, 'detectMagic');
    expect(dataOf(journals()[0]).target).toBe(93);
    expect(fetch).toHaveBeenCalledWith('systems/osp-houserules/data/ose_house_rules_v1_5.json');
    expect(mocks.roll).toHaveBeenCalledWith('1d100', expect.any(Object));
  });
  it('adds full WIS before private tracking modifiers', async () => {
    actor.system.class = 'Ranger'; actor.system.level = 10;
    await service.requestNoncombatCheck(actor.uuid, 'tracking');
    expect(dataOf(journals()[0]).target).toBe(101);
  });
  it('requires an available physical Disguise Kit and never invents successful disguise', async () => {
    actor.system.class = 'Assassin';
    expect(service.eligibleNoncombatCheck(actor, 'disguise')).toBeNull();
    actor.items = [{ type: 'spell', name: 'Disguise Kit', system: { quantity: 1 } }];
    expect(service.eligibleNoncombatCheck(actor, 'disguise')).toBeNull();
    actor.items[0].type = 'item'; actor.items[0].system.quantity = { value: 1 };
    expect((await service.requestNoncombatCheck(actor.uuid, 'disguise')).success).toBe(true);
    expect(mocks.roll).not.toHaveBeenCalled();
    expect(journals()[0].content).not.toContain('Success');
    actor.items[0].system.quantity = { value: 0 }; expect(service.eligibleNoncombatCheck(actor, 'disguise')).toBeNull();
  });
  it('separates class eligibility and racial checks', () => {
    for (const cls of ['Assassin', 'Barbarian', 'Mage', 'Ranger']) { actor.system.class = cls; expect(service.eligibleNoncombatCheck(actor, 'pickPockets')).toBeNull(); expect(service.eligibleNoncombatCheck(actor, 'findSecretDoor')).toBeTruthy(); }
    actor.system.class = 'Thief'; expect(service.eligibleNoncombatCheck(actor, 'hideshadows')).toBe('hideshadows');
    expect(service.eligibleNoncombatCheck(actor, 'assassination')).toBeNull();
    expect(service.eligibleNoncombatCheck(actor, 'detectConstructionTricks')).toBeNull();
    actor.system.race = 'Dwarf'; expect(service.eligibleNoncombatCheck(actor, 'detectConstructionTricks')).toBeTruthy();
  });
  it('uses effective hearing for both aliases without altering training', () => {
    expect(service.noncombatTarget(actor, 'listeningatdoors')).toBe(2);
    expect(service.noncombatTarget(actor, 'hearnoise')).toBe(2);
    expect(actor.system.listeningAtDoors).toBe(1);
    actor.system.race = 'Half-Elf'; expect(service.noncombatTarget(actor, 'listeningatdoors')).toBe(1);
    actor.system.listeningAtDoors = 3; expect(service.noncombatTarget(actor, 'listeningatdoors')).toBe(3);
    expect(service.noncombatTarget(actor, 'detectroomtraps')).toBe(1);
  });
  it('excludes shields/helmets and applies the worst equipped body armor penalty', () => {
    actor.items = [{ type: 'armor', name: 'Shield', system: { type: 'shield', equipped: true } }];
    expect(service.noncombatTarget(actor, 'movesilently')).toBe(3);
    actor.items.push({ type: 'armor', name: 'Padded', system: { type: 'light', equipped: true } }, { type: 'armor', name: 'Chainmail', system: { type: 'heavy', equipped: true } });
    expect(service.noncombatTarget(actor, 'movesilently')).toBe(2);
    expect(service.noncombatTarget(actor, 'findtraps')).toBe(4);
    expect(service.noncombatTarget(actor, 'openlocks')).toBe(3);
  });
});
