import { beforeEach, expect, it, vi } from 'vitest';
import house from '../../../data/ose_house_rules_v1_5.json';
const mocks = vi.hoisted(() => ({ roll: vi.fn(), recover: vi.fn() }));
vi.mock('../dice.js', () => ({ ospRoll: mocks.roll }));
vi.mock('../actor/noncombat-prompts.js', async original => ({ ...await original(), recoverPrivateDie: mocks.recover }));
let actor, service, authority, critical, hooks, failWrite, failAck, failCard;
const copy = value => structuredClone(value);
function apply(target, updates) { for (const [key, value] of Object.entries(updates)) { const parts = key.split('.'); let cursor = target; for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {}; cursor[parts.at(-1)] = copy(value); } }
beforeEach(async () => {
  vi.resetModules(); failWrite = false; failAck = false; failCard = false;
  mocks.roll.mockReset().mockResolvedValue({ total: 2 }); mocks.recover.mockReset().mockResolvedValue({ actual: 20 });
  actor = { type: 'character', id: 'a', uuid: 'Actor.a', name: 'Hero', system: { hitpoints: 5, maxhitpoints: 10, class: 'Fighter', race: 'Human', level: 1, attributes: { con: { value: 3 }, str: { value: 18 } } }, flags: {}, items: [{ type: 'item', name: "Healer's Kit", system: { quantity: { value: 1 } } }], testUserPermission: user => ['gm', 'owner'].includes(user.id), getFlag(scope, name) { return this.flags[scope]?.[name]; }, async update(data) { const commit = Object.hasOwn(data, 'flags.osp-houserules.healthLastOperation'); if (commit && failWrite) { failWrite = false; throw new Error('write failed'); } apply(this, data); if (commit && failAck) { failAck = false; throw new Error('lost ack'); } return this; } };
  const gm = { id: 'gm', isGM: true }, owner = { id: 'owner', isGM: false }, other = { id: 'other', isGM: false };
  const users = new Map([['gm', gm], ['owner', owner], ['other', other]]); users.activeGM = gm;
  const settings = new Map(); hooks = new Map();
  vi.stubGlobal('game', { user: gm, users, actors: new Map([['a', actor]]), system: { id: 'osp-houserules' }, world: { id: 'test' }, combat: { id: 'combat', round: 4 }, messages: [], settings: { get: (_scope, key) => settings.get(key), set: async (_scope, key, value) => settings.set(key, copy(value)) } });
  vi.stubGlobal('fromUuid', async uuid => uuid === actor.uuid ? actor : null);
  vi.stubGlobal('Hooks', { on: (name, fn) => hooks.set(name, fn) });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => house })));
  vi.stubGlobal('ui', { notifications: { warn: vi.fn() } });
  vi.stubGlobal('ChatMessage', { getSpeaker: () => ({}), applyRollMode: vi.fn((card, mode) => { if (mode === 'gmroll') card.whisper = ['gm']; }), create: vi.fn(async data => { if (failCard && data.flags?.['osp-houserules']?.healthOperation) { failCard = false; throw new Error('card failed'); } const message = { ...copy(data), author: game.user }; game.messages.push(message); hooks.get('createChatMessage')?.(message, {}, game.user.id); return message; }) });
  service = await import('./health-authority.js'); authority = await import('../progression/progression-authority.js'); critical = await import('./critical-authority.js'); service.registerHealthAuthority(); critical.registerCriticalAuthority(); authority.initProgressionAuthority();
});
const state = () => actor.getFlag('osp-houserules', 'healthState');
const damage = (amount, id) => service.changeHealth(actor, { action: 'damage', amount }, id);
const setHP = (value, id) => service.changeHealth(actor, { action: 'setHP', value }, id);
async function down(id = 'down') { mocks.roll.mockResolvedValueOnce({ total: 20 }).mockResolvedValueOnce({ total: 1 }); return damage(5, id); }

it('keeps negative HP and marks death without a zero save', async () => { expect((await damage(6)).success).toBe(true); expect(actor.system.hitpoints).toBe(-1); expect(state().dead).toBe(true); expect(mocks.roll).not.toHaveBeenCalled(); });
it('resolves exactly zero with separate death and duration dice', async () => { expect((await down()).success).toBe(true); expect(state()).toMatchObject({ hp: 0, zeroIncapacitated: true, dead: false, bleed: { remaining: 2, lastRound: 4, combatId: 'combat' } }); expect(mocks.roll.mock.calls.map(call => call[0])).toEqual(['1d20', '1d4']); });
it('natural 1 fails the death save and does not roll a timer', async () => { mocks.roll.mockResolvedValue({ total: 1 }); await damage(5); expect(state().dead).toBe(true); expect(mocks.roll).toHaveBeenCalledOnce(); });
it('undo restores full HP and condition/timer state and can only run once', async () => { await down(); expect((await service.changeHealth(actor, { action: 'undo' })).success).toBe(true); expect(actor.system.hitpoints).toBe(5); expect(state().bleed).toBeNull(); expect(state().conditions.prone).toBe(false); expect((await service.changeHealth(actor, { action: 'undo' })).success).toBe(false); });
it('rejects undo after an unrelated manual HP edit', async () => { await damage(1); actor.system.hitpoints = 3; expect((await service.changeHealth(actor, { action: 'undo' })).success).toBe(false); expect(actor.system.hitpoints).toBe(3); });
it('duplicate operation IDs do not repeat dice or damage', async () => { const result = await down(); expect(await damage(5, 'down')).toEqual(result); expect(mocks.roll).toHaveBeenCalledTimes(2); });
it('recovers an unapplied commit without repeating dice', async () => { failWrite = true; expect((await down()).recoveryRequired).toBe(true); expect(actor.system.hitpoints).toBe(5); expect((await authority.recoverProgressionOperation('down')).success).toBe(true); expect(actor.system.hitpoints).toBe(0); expect(mocks.roll).toHaveBeenCalledTimes(2); });
it('acknowledges a committed HP write despite a lost response', async () => { failAck = true; expect((await damage(2)).success).toBe(true); expect(actor.system.hitpoints).toBe(3); });
it('recovers a failed result card without applying damage again', async () => { failCard = true; expect((await damage(2, 'card')).recoveryRequired).toBe(true); expect(actor.system.hitpoints).toBe(3); expect((await authority.recoverProgressionOperation('card')).success).toBe(true); expect(actor.system.hitpoints).toBe(3); });
it('interrupted death die requires recording the actual result before continuing', async () => { mocks.roll.mockRejectedValueOnce(new Error('interrupted')).mockResolvedValueOnce({ total: 1 }); expect((await damage(5, 'interrupted')).recoveryRequired).toBe(true); expect(actor.system.hitpoints).toBe(5); expect((await authority.recoverProgressionOperation('interrupted')).success).toBe(true); expect(mocks.recover).toHaveBeenCalledOnce(); expect(state().bleed.remaining).toBe(2); });
it('stabilizes without HP gain and retains incapacitation until natural healing', async () => { await down(); await service.changeHealth(actor, { action: 'stabilize', confirmed: true }); expect(state()).toMatchObject({ hp: 0, zeroIncapacitated: true, stabilized: true, bleed: null }); mocks.roll.mockResolvedValue({ total: 1 }); await service.changeHealth(actor, { action: 'naturalHealing', confirmed: true }); expect(state()).toMatchObject({ hp: 1, zeroIncapacitated: false, conditions: { prone: true } }); });
it('requires kit availability and prevents ordinary revival', async () => { await down(); actor.items[0].system.quantity.value = 0; expect((await service.changeHealth(actor, { action: 'stabilize', confirmed: true })).success).toBe(false); await damage(1); expect((await service.changeHealth(actor, { action: 'heal', amount: 5, magical: true })).success).toBe(false); expect(actor.system.hitpoints).toBe(-1); });
it('magical healing clears zero bleed but preserves independent injury incapacitation', async () => { await down(); await service.changeHealth(actor, { action: 'condition', name: 'incapacitated', value: true }); await service.changeHealth(actor, { action: 'heal', amount: 3, magical: true }); expect(state()).toMatchObject({ hp: 3, zeroIncapacitated: false, bleed: null, conditions: { incapacitated: true } }); });
it('expires at end of round 6 and ignores duplicate or backward rounds', async () => { await down(); for (const round of [4, 5, 5, 3]) await service.changeHealth(actor, { action: 'advanceRound', combatId: 'combat', round }); expect(state().bleed.remaining).toBe(1); await service.changeHealth(actor, { action: 'advanceRound', combatId: 'combat', round: 6 }); expect(state().dead).toBe(true); });
it('does not reroll a resolved zero save through the legacy resolution button', async () => { await down(); expect((await service.changeHealth(actor, { action: 'zeroResult' })).success).toBe(false); expect(mocks.roll).toHaveBeenCalledTimes(2); });
it('supports the monster HP schema without a character death save', async () => { actor.type = 'monster'; delete actor.system.hitpoints; delete actor.system.maxhitpoints; actor.system.hp = { value: 5, max: 10 }; await damage(5); expect(actor.system.hp.value).toBe(0); expect(mocks.roll).not.toHaveBeenCalled(); });
it('allows an owner request to correct HP through the active GM authority', async () => { actor.flags['osp-houserules'] = { healthState: { conditions: { incapacitated: true } } }; hooks.get('createChatMessage')({ author: game.users.get('owner'), flags: { 'osp-houserules': { progressionAuthority: { type: 'request', envelope: { namespace: authority.PROGRESSION_SOCKET_NAMESPACE, type: 'request', action: 'health.mutate', operationId: 'owner-hp', userId: 'owner', details: { actorUuid: actor.uuid, command: { action: 'setHP', value: 7 } } } } } } }, {}, 'owner'); await vi.waitFor(() => expect(actor.system.hitpoints).toBe(7)); expect(state()).toMatchObject({ hp: 7, conditions: { incapacitated: true }, dead: false }); });
it('allows GM HP correction on another actor and rejects malformed values', async () => { expect((await setHP(0, 'gm-zero')).success).toBe(true); expect(actor.system.hitpoints).toBe(0); expect(mocks.roll).toHaveBeenCalledOnce(); for (const value of [11, 1.5, null, true, []]) expect((await setHP(value, `invalid-${String(value)}`)).success).toBe(false); });
it('rejects a forged health mutation against another owner', async () => { hooks.get('createChatMessage')({ author: game.users.get('other'), flags: { 'osp-houserules': { progressionAuthority: { type: 'request', envelope: { namespace: authority.PROGRESSION_SOCKET_NAMESPACE, type: 'request', action: 'health.mutate', operationId: 'forged', userId: 'other', details: { actorUuid: actor.uuid, command: { action: 'damage', amount: 5 } } } } } } }, {}, 'other'); await vi.waitFor(() => expect(game.messages.some(m => m.flags?.['osp-houserules']?.progressionAuthority?.operationId === 'forged')).toBe(true)); expect(actor.system.hitpoints).toBe(5); expect(mocks.roll).not.toHaveBeenCalled(); });
it('critical hit follows the source injury table and clamps the melee bonus', async () => { mocks.roll.mockResolvedValueOnce({ total: 99 }).mockResolvedValueOnce({ total: 99 }); const result = await critical.rollCritical(actor, 'hit', 'critical'); expect(result.injury.adjusted).toBe(100); expect(result.injury.injury).toMatch(/head/); expect(await critical.rollCritical(actor, 'hit', 'critical')).toEqual(result); expect(mocks.roll).toHaveBeenCalledTimes(2); expect(actor.system.hitpoints).toBe(5); });
it('critical 87 marks damage rerolls and critical misses return full effects', async () => { mocks.roll.mockResolvedValueOnce({ total: 87 }).mockResolvedValueOnce({ total: 100 }); expect((await critical.rollCritical(actor, 'hit')).rerollOnes).toBe(true); expect((await critical.rollCritical(actor, 'miss')).entry.effect).toMatch(/critically/); });

it('keeps private health and injury details out of shared authority receipts', async () => {
  await game.settings.set('core', 'rollMode', 'gmroll');
  await damage(1, 'private-health');
  mocks.roll.mockResolvedValueOnce({ total: 99 }).mockResolvedValueOnce({ total: 99 });
  await critical.rollCritical(actor, 'hit', 'private-critical');
  const cards = game.messages.filter(m => m.flags?.['osp-houserules']?.healthOperation || m.flags?.['osp-houserules']?.criticalOperation);
  expect(cards).toHaveLength(2);
  expect(cards.every(card => card.whisper?.includes('gm'))).toBe(true);
  const receipts = game.settings.get('osp-houserules', 'progressionOperationReceipts');
  expect(receipts['private-health'].result).not.toHaveProperty('afterHP');
  expect(receipts['private-critical'].result).not.toHaveProperty('injury');
});

it('round hook deduplicates linked tokens but advances independent synthetic actors sharing an ID', async () => {
  await down();
  const second = { ...actor, uuid: 'Scene.s.Token.two.Actor.a', flags: copy(actor.flags), system: copy(actor.system) };
  actor.uuid = 'Scene.s.Token.one.Actor.a';
  globalThis.fromUuid = async uuid => [actor, second].find(entry => entry.uuid === uuid);
  service.registerHealthRoundHook();
  const combat = { id: 'combat', round: 6, combatants: [{ actor }, { actor }, { actor: second }] };
  hooks.get('updateCombat')(combat, { round: 6 });
  await vi.waitFor(() => {
    expect(actor.getFlag('osp-houserules', 'healthState').bleed.remaining).toBe(1);
    expect(second.getFlag('osp-houserules', 'healthState').bleed.remaining).toBe(1);
    expect(second.getFlag('osp-houserules', 'healthPending')).toBeNull();
  });
  hooks.get('updateCombat')(combat, { round: 6 });
  expect(actor.getFlag('osp-houserules', 'healthState').bleed.remaining).toBe(1);
  expect(second.getFlag('osp-houserules', 'healthState').bleed.remaining).toBe(1);
});
