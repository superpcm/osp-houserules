import { beforeEach, describe, expect, it, vi } from 'vitest';
const roll = vi.hoisted(() => vi.fn());
vi.mock('../dice.js', () => ({ ospRoll: roll }));
let Combat, combat, settings, actors, authority;
const sid = 'osp-houserules';
const clone = value => structuredClone(value);
const collection = values => { const all = [...values]; all.get = id => all.find(item => item.id === id); all.contents = all; return all; };
const apply = (doc, update) => {
  for (const [path, value] of Object.entries(update)) {
    if (path === '_id') continue;
    const parts = path.split('.'); let target = doc;
    for (const part of parts.slice(0, -1)) target = target[part] ??= {};
    target[parts.at(-1)] = clone(value);
  }
};
function member(id, { dex = 10, race = 'Human', hp = 10, speed = 0, owner = 'player', defeated = false, surprised = false } = {}) {
  const weapon = { id: `${id}-weapon`, type: 'weapon', name: 'Sword', system: { equipped: true, speedFactor: speed } };
  const spell = { id: `${id}-spell`, type: 'spell', name: 'Sleep', system: { lvl: 3 } };
  const actor = { id, uuid:`Actor.${id}`, system: { attributes: { dex: { value: dex } }, race, hitpoints: hp }, items: collection([weapon, spell]), testUserPermission: user => user.id === owner };
  return { id, name: id, actor, defeated, initiative: null, ospGroup: id === 'a' ? 'green' : 'red', flags: { [sid]: { surprised } }, testUserPermission: user => user.id === owner,
    getFlag(scope, key) { return this.flags[scope]?.[key]; }, async setFlag(scope,key,value) { this.flags[scope] ??= {}; this.flags[scope][key]=clone(value); if (this.failAck) { this.failAck=false; throw new Error('lost acknowledgement'); } } };
}
class BaseCombat {
  constructor(members) { this.id = 'battle'; this.round = 0; this.turn = null; this.flags = {}; this.combatants = collection(members); this.embeddedWrites = 0; this.documentWrites = 0; this.setupTurns(); }
  get combatant() { return this.turns[this.turn] ?? null; }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
  async setFlag(scope, key, value) { return this.update({ [`flags.${scope}.${key}`]: value }, { turnEvents: false }); }
  setupTurns() { this.turns = [...this.combatants].sort((a,b) => this._sortCombatants(a,b)); return this.turns; }
  async updateEmbeddedDocuments(_type, updates, options = {}) {
    this.embeddedWrites++; const currentId = this.combatant?.id;
    if (this.failBeforeEmbedded) { this.failBeforeEmbedded = false; throw new Error('before batch'); }
    for (const update of updates) {
      apply(this.combatants.get(update._id), update);
      if (this.failPartial) { this.failPartial = false; this.setupTurns(); throw new Error('partial batch'); }
    }
    this.setupTurns(); if (currentId) this.turn = this.turns.findIndex(c => c.id === currentId);
    if (this.failAfterEmbedded) { this.failAfterEmbedded = false; throw new Error('lost batch acknowledgment'); }
    return this.combatants;
  }
  async update(update, options = {}) {
    this.documentWrites++; const oldRound = this.round;
    if (this.failCommit && update[`flags.${sid}.initiativeOperation`]?.status === 'completed') { this.failCommit = false; throw new Error('before round commit'); }
    apply(this, update);
    if (this.failAfterCommit && update[`flags.${sid}.initiativeOperation`]?.status === 'completed') { this.failAfterCommit = false; throw new Error('lost round acknowledgment'); }
    if (this.round !== oldRound && options.turnEvents !== false) await this._onStartRound?.({ round: this.round, skipped: false });
    return this;
  }
  async _onStartRound() {} async _onEndRound() {} async _onEndTurn() {}
}
beforeEach(async () => {
  vi.resetModules(); roll.mockReset(); roll.mockImplementation(async () => ({ cancelled: false, total: 10, naturalD20: 10 }));
  settings = new Map([['initiative','individual'],['rerollInitiative','reroll']]);
  const gm = { id:'gm', isGM:true }, player = { id:'player', isGM:false }, stranger = { id:'stranger', isGM:false };
  const users = new Map([['gm',gm],['player',player],['stranger',stranger]]); users.activeGM = gm;
  vi.stubGlobal('game', { system: { id:sid }, user:gm, users, settings: { get: (_s,k) => settings.get(k), set: async (_s,k,v) => { settings.set(k,clone(v)); return v; } }, combats:new Map() });
  vi.stubGlobal('foundry', { documents: { Combat:BaseCombat }, utils: { randomID: () => crypto.randomUUID() } });
  vi.stubGlobal('Hooks', { callAll:vi.fn(), on:vi.fn() }); vi.stubGlobal('ui', { notifications: { warn:vi.fn() } });
  vi.stubGlobal('window',undefined); vi.stubGlobal('ChatMessage',undefined);
  const module = await import('./combat.js'); Combat = module.default; module.registerCombatInitiativeAuthority(); authority = await import('../progression/progression-authority.js');
  actors = [member('a'),member('b')]; combat = new Combat(actors); game.combats.set(combat.id,combat);
});

describe('BR15 real combat attack authority', () => {
  it('keeps allowances separate for each combatant', async () => {
    combat.round=1;
    await combat.reserveAttackForActor(actors[0].actor,{operationId:'a1'});
    await combat.settleAttackForActor(actors[0].actor,'a1',true);
    await combat.reserveAttackForActor(actors[1].actor,{operationId:'b1'});
    expect(combat.attackStateFor(actors[0]).spent).toBe(1);
    expect(combat.attackStateFor(actors[1]).spent).toBe(0);
  });
  it('serializes last-attack reservations and cancellation releases it', async () => {
    combat.round=1;
    const results=await Promise.allSettled([combat.reserveAttackForActor(actors[0].actor,{operationId:'a1'}),combat.reserveAttackForActor(actors[0].actor,{operationId:'a2'})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    await combat.settleAttackForActor(actors[0].actor,'a1',false);
    await combat.reserveAttackForActor(actors[0].actor,{operationId:'a3'});
    expect(combat.attackStateFor(actors[0]).spent).toBe(0);
  });
  it('commits idempotently and resets on a new round', async () => {
    combat.round=1;
    const stamp=await combat.reserveAttackForActor(actors[0].actor,{operationId:'a1'});
    await combat.settleAttackForActor(actors[0].actor,'a1',true,stamp);
    await combat.settleAttackForActor(actors[0].actor,'a1',true,stamp);
    expect(combat.attackStateFor(actors[0]).spent).toBe(1);
    const other = await combat.reserveAttackForActor(actors[1].actor,{operationId:'b1'});
    combat.round=2; expect(combat.attackStateFor(actors[0]).spent).toBe(0);
    await combat.settleAttackForActor(actors[0].actor,'a1',true,stamp); // prior durable receipt is harmless
    expect(combat.attackStateFor(actors[0]).spent).toBe(0);
    await expect(combat.settleAttackForActor(actors[1].actor,'b1',true,other)).rejects.toThrow();
  });
  it('does not let a player grant extra attacks', async () => {
    combat.round=1;
    const player=game.users.get('player');
    const handler = combat.applyAttackOperation.bind(combat);
    authority.registerProgressionAuthority('test.attack', handler);
    const request = {namespace:authority.PROGRESSION_SOCKET_NAMESPACE,type:'request',action:'test.attack',operationId:'player-extra',userId:player.id,details:{combatantId:'a',actorId:'a',kind:'reserve',round:1,sequence:0,extra:true}};
    // Authenticated transport is exercised by BR14; use its real handler via the original-requester context here.
    const listeners=new Map(); Hooks.on=(name,fn)=>listeners.set(name,fn);
    authority.initProgressionAuthority();
    globalThis.ChatMessage={create:vi.fn(async()=>({}))};
    listeners.get('createChatMessage')({author:player,flags:{[sid]:{[authority.PROGRESSION_CHAT_FLAG]:{type:'request',envelope:request}}}}, {}, player.id);
    await vi.waitFor(()=>expect(ChatMessage.create).toHaveBeenCalled());
    expect(ChatMessage.create.mock.calls[0][0].flags[sid][authority.PROGRESSION_CHAT_FLAG].result.success).toBe(false);
  });
  it('recognizes a lost flag acknowledgment without a second spend', async () => {
    combat.round=1; actors[0].failAck=true;
    await combat.reserveAttackForActor(actors[0].actor,{operationId:'a1'});
    actors[0].failAck=true; await combat.settleAttackForActor(actors[0].actor,'a1',true);
    expect(combat.attackStateFor(actors[0]).spent).toBe(1);
  });
  it('keeps the reserved combatant when the controlled shared-actor token changes',async()=>{
    combat.round=1; actors[1].actor=actors[0].actor; actors[0].tokenId='first';actors[1].tokenId='second';
    vi.stubGlobal('canvas',{tokens:{controlled:[{id:'second'}]}});
    const stamp=await combat.reserveAttackForActor(actors[0].actor,{operationId:'shared'});
    canvas.tokens.controlled=[{id:'first'}];
    await combat.settleAttackForActor(actors[0].actor,'shared',true,stamp);
    expect(combat.attackStateFor(actors[1]).spent).toBe(1);expect(combat.attackStateFor(actors[0]).spent).toBe(0);
  });

});
