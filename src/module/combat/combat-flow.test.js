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
  const actor = { system: { attributes: { dex: { value: dex } }, race, hitpoints: hp }, items: collection([weapon, spell]), testUserPermission: user => user.id === owner };
  return { id, name: id, actor, defeated, initiative: null, ospGroup: id === 'a' ? 'green' : 'red', flags: { [sid]: { surprised } }, testUserPermission: user => user.id === owner,
    getFlag(scope, key) { return this.flags[scope]?.[key]; } };
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
  ({ default: Combat } = await import('./combat.js')); authority = await import('../progression/progression-authority.js');
  actors = [member('a'),member('b')]; combat = new Combat(actors); game.combats.set(combat.id,combat);
});
describe('BR14 actual combat lifecycle', () => {
  it('rolls DEX, Hobbit and weapon speed with hidden fractions, retaining 0HP combatants', async () => {
    actors[0].actor.system.attributes.dex.value=16; actors[0].actor.system.race='Hobbit'; actors[0].actor.items[0].system.speedFactor=4; actors[1].actor.system.hitpoints=0;
    await combat.startCombat();
    expect(combat.round).toBe(1); expect(Math.floor(actors[0].initiative)).toBe(9); expect(Math.floor(actors[1].initiative)).toBe(10);
    expect(actors[0].getFlag(sid,'initiativeState').rawHundredths).toBeGreaterThanOrEqual(1000);
  });
  it('a cancelled manual batch leaves rolls and round unchanged', async () => {
    roll.mockResolvedValueOnce({ total:12 }).mockResolvedValueOnce({ cancelled:true });
    const before=clone(actors.map(c=>c.flags)); await combat.startCombat();
    expect(combat.round).toBe(0); expect(combat.embeddedWrites).toBe(0); expect(actors.map(c=>c.flags)).toEqual(before);
  });
  it('opening surprise still rolls, skips the turn, clears next round and resets acted markers', async () => {
    actors[0].flags[sid].surprised=true; await combat.startCombat();
    expect(actors[0].initiative).not.toBeNull(); expect(combat.combatant.id).toBe('b');
    await combat.nextRound(); expect(combat.round).toBe(2); expect(actors[0].getFlag(sid,'surprised')).toBe(false);
    expect(actors.every(c=>c.getFlag(sid,'initiativeState').acted===false)).toBe(true); expect(roll).toHaveBeenCalledTimes(4);
  });
  it('cancelling next-round rolls preserves the current turn and every initiative', async () => {
    await combat.startCombat(); const before=clone({round:combat.round,turn:combat.turn,flags:combat.flags,states:actors.map(c=>c.flags),initiatives:actors.map(c=>c.initiative)}), writes=combat.embeddedWrites;
    roll.mockResolvedValueOnce({total:20}).mockResolvedValueOnce({cancelled:true}); await combat.nextRound();
    expect({round:combat.round,turn:combat.turn,flags:combat.flags,states:actors.map(c=>c.flags),initiatives:actors.map(c=>c.initiative)}).toEqual(before); expect(combat.embeddedWrites).toBe(writes);
  });
  it('explicit Defeated excludes rolls while zero HP does not', async () => {
    actors[0].defeated=true; actors[1].actor.system.hitpoints=0; await combat.startCombat();
    expect(roll).toHaveBeenCalledTimes(1); expect(actors[0].initiative).toBeNull(); expect(combat.combatant.id).toBe('b');
  });
  it('declarations recalculate the same roll, preserve the active combatant and never grant another turn', async () => {
    actors[0].actor.system.attributes.dex.value=18; await combat.startCombat(); expect(combat.combatant.id).toBe('a');
    await combat.nextTurn(); expect(combat.combatant.id).toBe('b'); expect(actors[0].getFlag(sid,'initiativeState').acted).toBe(true);
    const raw=actors[0].getFlag(sid,'initiativeState').rawHundredths, calls=roll.mock.calls.length;
    await combat.setDeclaration('a',{kind:'spell',spellId:'a-spell'});
    expect(actors[0].getFlag(sid,'initiativeState').rawHundredths).toBe(raw); expect(roll).toHaveBeenCalledTimes(calls); expect(combat.combatant.id).toBe('b');
    await combat.nextTurn(); expect(combat.round).toBe(2);
  });
  it('unacted combatants moved ahead of the current turn still receive their turn', async () => {
    actors[0].actor.system.attributes.dex.value=18; actors[1].actor.items[0].system.speedFactor=15;
    await combat.startCombat(); expect(combat.combatant.id).toBe('a');
    await combat.setDeclaration('b',{kind:'unarmed'}); expect(combat.combatant.id).toBe('a');
    await combat.nextTurn(); expect(combat.combatant.id).toBe('b'); expect(combat.round).toBe(1);
  });
  it.each(['failBeforeEmbedded','failPartial','failCommit'])('recovers %s using the staged rolls once', async failure => {
    combat[failure]=true; await expect(combat.startCombat()).rejects.toThrow();
    const raw=combat.initiativeOperation.updates.map(u=>u[`flags.${sid}.initiativeState`].rawHundredths), calls=roll.mock.calls.length;
    await combat.recoverInitiative(); expect(combat.round).toBe(1); expect(roll).toHaveBeenCalledTimes(calls);
    expect(actors.map(c=>c.getFlag(sid,'initiativeState').rawHundredths)).toEqual(raw);
  });
  it.each(['failAfterEmbedded','failAfterCommit'])('recognizes %s without a second roll', async failure => {
    combat[failure]=true; await combat.startCombat(); expect(combat.round).toBe(1); expect(roll).toHaveBeenCalledTimes(2);
  });
  it('does not reroll for repeated core start-round callbacks', async () => {
    await combat.startCombat(); await combat._onStartRound({round:1}); await combat._onStartRound({round:1});
    await combat.setDeclaration('a',{kind:'unarmed'}); expect(roll).toHaveBeenCalledTimes(2);
  });
  it('group and keep/reset modes remain usable after migration', async () => {
    settings.set('initiative','group'); actors[1].ospGroup='green'; await combat.startCombat();
    expect(actors[0].initiative).toBe(actors[1].initiative); expect(roll).toHaveBeenCalledTimes(1);
    settings.set('rerollInitiative','keep'); const value=actors[0].initiative; await combat.nextRound(); expect(actors[0].initiative).toBe(value); expect(roll).toHaveBeenCalledTimes(1);
    settings.set('rerollInitiative','reset'); await combat.nextRound(); expect(actors.every(c=>c.initiative===null)).toBe(true);
  });
  it('keep mode preserves exact-tie ordering across rounds', async () => {
    const random=vi.spyOn(Math,'random').mockReturnValue(0.25); await combat.startCombat(); random.mockRestore();
    const order=combat.turns.map(c=>c.id), keys=actors.map(c=>c.getFlag(sid,'initiativeState').tieKey);
    settings.set('rerollInitiative','keep'); await combat.nextRound();
    expect(actors.map(c=>c.getFlag(sid,'initiativeState').tieKey)).toEqual(keys); expect(combat.turns.map(c=>c.id)).toEqual(order);
  });
  it('round time uses the original turn index before rerolled initiative resorts combatants', async () => {
    roll.mockResolvedValueOnce({total:20}).mockResolvedValueOnce({total:1}); await combat.startCombat(); await combat.nextTurn(); expect(combat.turn).toBe(1);
    combat.getTimeDelta=vi.fn().mockReturnValue(6);
    roll.mockResolvedValueOnce({total:1}).mockResolvedValueOnce({total:20}); await combat.nextRound();
    expect(combat.getTimeDelta).toHaveBeenCalledWith(1,1,2,0);
  });
  it('server rejects stale or unowned declarations and non-GM state toggles before item writes', async () => {
    await combat.startCombat(); const writes=combat.embeddedWrites;
    game.user=game.users.get('stranger');
    await expect(combat.setDeclaration('a',{kind:'unarmed'})).rejects.toThrow();
    await expect(combat.markDefeated('a',true)).rejects.toThrow(); expect(combat.embeddedWrites).toBe(writes);
    game.user=game.users.get('gm'); await expect(combat.setDeclaration('a',{kind:'spell',spellId:'missing'})).rejects.toThrow(/missing/); expect(combat.embeddedWrites).toBe(writes);
  });
  it('authenticates the original requester on the GM transport, including owned declarations', async () => {
    await combat.startCombat(); const hook=Hooks.on.mock.calls.find(([name])=>name==='createChatMessage')[1];
    const messages=[]; globalThis.ChatMessage={ create:async message=>{ messages.push(message);return message; } };
    const send=async (userId,kind,extra) => {
      const operationId=crypto.randomUUID();
      hook({ author:{id:userId},flags:{[sid]:{progressionAuthority:{type:'request',envelope:{namespace:authority.PROGRESSION_SOCKET_NAMESPACE,type:'request',action:'combat.initiative',operationId,userId,details:{combatId:combat.id,fromRound:combat.round,kind,...extra}}}}}}, {}, userId);
      for(let i=0;i<150;i++) await Promise.resolve();
      return messages.find(message=>message.flags[sid].progressionAuthority.operationId===operationId)?.flags[sid].progressionAuthority.result;
    };
    const writes=combat.embeddedWrites;
    expect(await send('stranger','declaration',{id:'a',declaration:{kind:'unarmed'}})).toMatchObject({success:false});
    expect(await send('player','surprised',{id:'a',value:true})).toMatchObject({success:false});
    expect(combat.embeddedWrites).toBe(writes);
    const raw=actors[0].getFlag(sid,'initiativeState').rawHundredths;
    expect(await send('player','declaration',{id:'a',declaration:{kind:'spell',spellId:'a-spell'}})).toMatchObject({success:true});
    expect(actors[0].getFlag(sid,'initiativeState').rawHundredths).toBe(raw);
  });
  it('ties use separate unique keys and initiative remains unchanged', async () => {
    const random=vi.spyOn(Math,'random').mockReturnValue(0.25); await combat.startCombat(); random.mockRestore();
    expect(actors[0].initiative).toBe(10.25); expect(actors[1].initiative).toBe(10.25);
    expect(actors[0].getFlag(sid,'initiativeState').tieKey).not.toBe(actors[1].getFlag(sid,'initiativeState').tieKey);
  });
});
