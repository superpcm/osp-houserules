import { beforeEach, describe, expect, it, vi } from 'vitest';

const roll = vi.hoisted(() => vi.fn());
vi.mock('../dice.js', () => ({ ospRoll: roll }));

const copy = value => structuredClone(value);
const profile = { id: 'magic_user', name: 'Magic-User', spellcasting: { type: 'class-specific', summary: 'arcane magic-user spells', startsAtLevel: 1, spellList: 'magic-user', spellProgression: { 1: { 1: 1 }, 2: { 1: 2 }, 3: { 1: 2, 2: 1 } } } };
const sleep = { id: 'sleep', name: 'Sleep', level: 1, description: 'Sleep.' };
const light = { id: 'light', name: 'Light', level: 1, reversed: { name: 'Darkness', description: 'Darkness.' }, description: 'Light.' };
const catalog = { spellLists: { 'magic-user': [sleep, light] } };
const house = { spells: { bonus_spells: { table: [] } } };

function apply(target, update) {
  for (const [path, value] of Object.entries(update)) {
    const parts = path.split('.'); let cursor = target;
    for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
    cursor[parts.at(-1)] = copy(value);
  }
}
function collection(items) { const result = [...items]; result.get = id => result.find(item => item.id === id); return result; }
function makeActor() {
  const flags = { 'osp-houserules': { knownSpells: {}, memorizedSpells: {} } };
  const items = collection([
    { id: 'book-a', name: 'Spellbook', type: 'item', system: { quantity: 1 } },
    { id: 'staff-a', name: 'Staff', type: 'weapon', system: { quantity: 1, equipped: true } },
    { id: 'scroll-a', name: 'Sleep Scroll', type: 'scroll', system: { quantity: 1 } },
    { id: 'wand-a', name: 'Sleep Wand', type: 'item', system: { quantity: 1, tags: ['wand'], equipped: true } },
    { id: 'staff-source', name: 'Sleep Staff', type: 'staff', system: { quantity: 1 } },
    { id: 'innate-a', name: 'Innate Sleep', type: 'ability', system: { quantity: 1 } },
  ]);
  return {
    uuid: 'Actor.test', id: 'test', system: { class: 'Magic-User', level: 2, attributes: { int: { value: 18 }, wis: { value: 10 } }, spellSlots: { 1: { used: 0 }, 2: { used: 0 } } }, items, flags,
    async updateEmbeddedDocuments(_type, updates) {
      if (this.failBeforeItem) { this.failBeforeItem = false; throw new Error('item update failed'); }
      for (const update of updates) { const item = this.items.get(update._id); const { _id, ...fields } = update; apply(item, fields); }
      if (this.failItemAck) { this.failItemAck = false; throw new Error('item acknowledgement lost'); }
      return updates;
    },
    testUserPermission: () => true,
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async update(update) {
      const resourceWrite = Object.keys(update).some(key => key === 'flags.osp-houserules.spellcastingState');
      if (resourceWrite && this.failBeforeResource) { this.failBeforeResource = false; throw new Error('write failed before apply'); }
      apply(this, update);
      if (resourceWrite && this.failResourceAck) { this.failResourceAck = false; throw new Error('lost resource acknowledgment'); }
      return this;
    },
  };
}

let actor;
let authorityHooks;
beforeEach(async () => {
  vi.resetModules(); roll.mockReset(); roll.mockResolvedValue({ cancelled: false, total: 10, naturalD20: 10 });
  actor = makeActor();
  const gm = { id: 'gm', isGM: true }; const player = { id: 'player', isGM: false };
  const users = new Map([['gm', gm], ['player', player]]); users.activeGM = gm;
  const settings = new Map();
  vi.stubGlobal('game', { system: { id: 'osp-houserules' }, world: { id: 'test' }, user: gm, users, messages: [], settings: { get: (_scope, key) => settings.get(key), set: async (_scope, key, value) => { settings.set(key, copy(value)); } } });
  vi.stubGlobal('fromUuid', async () => actor);
  vi.stubGlobal('fetch', vi.fn(async url => ({ ok: true, async json() { return url.includes('class_profiles') ? { classProfiles: [profile] } : url.includes('spells') ? catalog : house; } })));
  const hooks = new Map(); authorityHooks = hooks;
  vi.stubGlobal('ChatMessage', { getSpeaker: () => ({}), create: vi.fn(async data => {
    const document = { ...data, author: game.user, getFlag: (scope, key) => data.flags?.[scope]?.[key] };
    game.messages.push(document);
    hooks.get('createChatMessage')?.(document, {}, game.user.id);
    return document;
  }) });
  vi.stubGlobal('Hooks', { on: (name, callback) => hooks.set(name, callback) });
});

describe('BR16 spellcasting service', () => {
  it('exposes only eligible positive-quantity focuses and rejects arbitrary inventory objects', async () => {
    actor.items.push(
      { id: 'oil', name: 'Oil Flask', type: 'item', system: { quantity: 1 } },
      { id: 'sling', name: 'Staff Sling', type: 'weapon', system: { quantity: 1 } },
      { id: 'empty', name: 'Wand', type: 'item', system: { quantity: 0 } },
      { id: 'symbol', name: 'Holy Symbol', type: 'item', system: { quantity: 1 } },
    );
    const service = await import('./spellcasting.js'); service.registerSpellcastingAuthority();
    expect((await service.spellContext(actor)).focusIds).toEqual(['staff-a', 'wand-a']);
    for (const itemId of ['oil', 'sling', 'empty', 'symbol']) {
      expect((await service.changeSpellState(actor, { action: 'focus', itemId, focusClass: 'magicuser' })).success).toBe(false);
    }
    expect((await service.changeSpellState(actor, { action: 'focus', itemId: 'staff-a', focusClass: 'magicuser' })).success).toBe(true);
    expect(actor.getFlag('osp-houserules', 'spellcastingState').focus).toMatchObject({ kind: 'staff', available: true });
    actor.items.get('staff-a').system.quantity = 0;
    expect((await service.spellContext(actor)).focusIds).not.toContain('staff-a');
  });
  it('requires actor ownership for focus changes even when the requester is GM', async () => {
    actor.testUserPermission = () => false;
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js');
    registerSpellcastingAuthority();
    await expect(changeSpellState(actor, { action: 'focus', itemId: 'staff-a', available: true })).resolves.toMatchObject({ success: false });
    expect(actor.getFlag('osp-houserules', 'spellcastingState')).toBeUndefined();
  });

  it('keeps a registered volume available after its inventory name changes, until removed or depleted', async () => {
    const { registerSpellcastingAuthority, changeSpellState, spellContext } = await import('./spellcasting.js');
    registerSpellcastingAuthority();
    expect(await changeSpellState(actor, { action: 'book', bookId: 'book-a-1', available: true })).toMatchObject({ success: true });
    actor.items.get('book-a').name = "Fung Telt's Grimoire";
    expect((await spellContext(actor)).bookIds).toEqual(['book-a-1']);
    expect(actor.flags['osp-houserules'].spellcastingState.books['book-a-1'].name).toBeUndefined();
    actor.items.get('book-a').system.quantity = 0;
    expect((await spellContext(actor)).bookIds).toEqual([]);
  });

  it('rejects a forged player request attempting a GM focus override', async () => {
    const { registerSpellcastingAuthority } = await import('./spellcasting.js'); const authority = await import('../progression/progression-authority.js'); registerSpellcastingAuthority(); authority.initProgressionAuthority();
    authorityHooks.get('createChatMessage')({ author: game.users.get('player'), flags: { 'osp-houserules': { progressionAuthority: { type: 'request', envelope: { namespace: authority.PROGRESSION_SOCKET_NAMESPACE, type: 'request', action: 'spells.mutate', operationId: 'spoof-focus', userId: 'player', details: { actorUuid: actor.uuid, command: { action: 'external', spellId: 'sleep', listKey: 'magic-user', sourceId: 'scroll-a', sourceKind: 'scroll', sourceConfirmed: true, confirmed: true, gmOverride: true } } } } } } }, {}, 'player');
    await vi.waitFor(() => expect(ChatMessage.create).toHaveBeenCalled());
    const resultMessage = ChatMessage.create.mock.calls.map(call => call[0]).find(message => message.flags?.['osp-houserules']?.progressionAuthority?.type === 'result');
    expect(resultMessage.flags['osp-houserules'].progressionAuthority.result.success).toBe(false);
    expect(roll).not.toHaveBeenCalled();
  });

  it('uses one wild-magic die for a normal cast and applies the focused resource atomically', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js'); registerSpellcastingAuthority();
    expect((await changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'magicuser' })).success).toBe(true);
    expect((await changeSpellState(actor, { action: 'book', bookId: 'book-a-1', available: true })).success).toBe(true);
    expect((await changeSpellState(actor, { action: 'copy', spellId: 'sleep', bookId: 'book-a-1', sourceConfirmed: true })).success).toBe(true);
    expect((await changeSpellState(actor, { action: 'rest', confirmed: true })).success).toBe(true);
    expect((await changeSpellState(actor, { action: 'prepare', spellId: 'sleep', count: 1 })).success).toBe(true);
    const result = await changeSpellState(actor, { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true });
    expect(result).toMatchObject({ success: true, wild: 'Normal', roll: 10 });
    expect(roll).toHaveBeenCalledTimes(2); // copy d100 plus one casting d20
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
    expect(actor.flags['osp-houserules'].spellcastingState.prepared['sleep::normal']).toBe(0);
  });

  it('casts a prepared spell with an attested Wand without a containing book', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js'); registerSpellcastingAuthority();
    await changeSpellState(actor, { action: 'book', bookId: 'book-a-1', available: true });
    await changeSpellState(actor, { action: 'copy', spellId: 'sleep', bookId: 'book-a-1', sourceConfirmed: true });
    await changeSpellState(actor, { action: 'rest', confirmed: true });
    await changeSpellState(actor, { action: 'prepare', spellId: 'sleep', count: 1 });
    expect((await changeSpellState(actor, { action: 'focus', focusKind: 'wand', itemId: 'wand-a', available: true, focusClass: 'magicuser' })).success).toBe(true);
    actor.items.get('book-a').system.quantity = 0;
    const cast = await changeSpellState(actor, { action: 'cast', spellId: 'sleep', focusKind: 'wand', confirmed: true, focusHeldOrDisplayed: true });
    expect(cast).toMatchObject({ success: true });
  });

  it('rejects a saved Wand focus that points to a Spellbook item', async () => {
    const service = await preparedCaster();
    actor.flags['osp-houserules'].spellcastingState.focus = { kind: 'wand', itemId: 'book-a', available: true, classKey: 'magicuser' };
    const result = await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', confirmed: true, focusKind: 'wand', focusHeldOrDisplayed: true });
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Designate an available');
  });

  it('rejects a physical focus whose selected kind does not match its inventory type', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js'); registerSpellcastingAuthority();
    const result = await changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'innate-a', available: true, focusClass: 'magicuser' });
    expect(result.success).toBe(false);
    expect(result.reason).toContain('does not establish an eligible kind');
  });

  it('retains a failed write acknowledgement without consuming twice on retry', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js'); const authority = await import('../progression/progression-authority.js'); registerSpellcastingAuthority();
    await changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'magicuser' });
    await changeSpellState(actor, { action: 'book', bookId: 'book-a-1', available: true });
    await changeSpellState(actor, { action: 'copy', spellId: 'sleep', bookId: 'book-a-1', sourceConfirmed: true });
    await changeSpellState(actor, { action: 'rest', confirmed: true }); await changeSpellState(actor, { action: 'prepare', spellId: 'sleep', count: 1 });
    actor.failResourceAck = true;
    const command = { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true };
    const details = { actorUuid: actor.uuid, command };
    expect((await authority.requestProgressionMutation('spells.mutate', details, 'cast-retry')).success).toBe(true);
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
    expect((await authority.requestProgressionMutation('spells.mutate', details, 'cast-retry')).success).toBe(true);
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
  });

  it('reports natural 1 as Bane and natural 20 as Boon without automatic failure', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js'); registerSpellcastingAuthority();
    await changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'magicuser' }); await changeSpellState(actor, { action: 'book', bookId: 'book-a-1', available: true });
    await changeSpellState(actor, { action: 'copy', spellId: 'sleep', bookId: 'book-a-1', sourceConfirmed: true }); await changeSpellState(actor, { action: 'rest', confirmed: true }); await changeSpellState(actor, { action: 'prepare', spellId: 'sleep', count: 1 });
    roll.mockResolvedValueOnce({ cancelled: false, total: 1, naturalD20: 1 });
    expect(await changeSpellState(actor, { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true })).toMatchObject({ success: true, wild: 'Bane' });
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
  });

  it('handles an owned external source with one wild die and manual charge resolution', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js'); registerSpellcastingAuthority();
    await changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'magicuser' });
    roll.mockResolvedValueOnce({ cancelled: false, total: 20, naturalD20: 20 });
    const result = await changeSpellState(actor, { action: 'external', spellId: 'sleep', listKey: 'magic-user', sourceId: 'scroll-a', sourceKind: 'scroll', sourceConfirmed: true, confirmed: true, focusHeldOrDisplayed: true });
    expect(result).toMatchObject({ success: true, wild: 'Boon', roll: 20 });
    expect(actor.flags['osp-houserules'].spellcastingState.used).toEqual({ 1: 0, 2: 0 });
    const card = ChatMessage.create.mock.calls.map(call => call[0]).find(message => message.flags?.['osp-houserules']?.spellOperation);
    expect(card.content).toContain('deduct charges/uses manually');
  });

  it.each([
    ['scroll', 'scroll-a'], ['wand', 'wand-a'], ['staff', 'staff-source'],
  ])('uses one wild check for each owned external source kind (%s) without daily slot changes', async (sourceKind, sourceId) => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js'); registerSpellcastingAuthority();
    await changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'magicuser' });
    const before = copy(actor.system.spellSlots);
    const result = await changeSpellState(actor, { action: 'external', spellId: 'sleep', listKey: 'magic-user', sourceId, sourceKind, sourceConfirmed: true, confirmed: true, focusHeldOrDisplayed: true });
    expect(result.success).toBe(true); expect(actor.system.spellSlots).toEqual(before); expect(roll).toHaveBeenCalledTimes(1);
  });

  it('allows an explicitly attested racial innate source without a physical focus', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js'); registerSpellcastingAuthority();
    const result = await changeSpellState(actor, { action: 'external', spellId: 'sleep', listKey: 'magic-user', sourceId: 'innate-a', sourceKind: 'innate', sourceRacial: true, sourceConfirmed: true, confirmed: true, focusHeldOrDisplayed: false });
    expect(result.success).toBe(true);
  });

  it('rejects a reversed external form when the source spell has no reversal before rolling', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js'); registerSpellcastingAuthority();
    await changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'magicuser' });
    const result = await changeSpellState(actor, { action: 'external', spellId: 'sleep', reverse: true, listKey: 'magic-user', sourceId: 'scroll-a', sourceKind: 'scroll', sourceConfirmed: true, confirmed: true, focusHeldOrDisplayed: true });
    expect(result.success).toBe(false); expect(roll).not.toHaveBeenCalled();
  });

  it('rejects missing focus and obsolete GM overrides before rolling', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js'); registerSpellcastingAuthority();
    const denied = await changeSpellState(actor, { action: 'cast', spellId: 'sleep', confirmed: true });
    expect(denied.success).toBe(false); expect(roll).not.toHaveBeenCalled();
    const allowed = await changeSpellState(actor, { action: 'external', spellId: 'sleep', listKey: 'magic-user', sourceId: 'scroll-a', sourceKind: 'scroll', sourceConfirmed: true, confirmed: true, focusHeldOrDisplayed: true, gmOverride: true });
    expect(allowed.success).toBe(false); expect(roll).not.toHaveBeenCalled();
  });

  it('coalesces concurrent identical casts into one wild check and one resource spend', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js'); registerSpellcastingAuthority();
    await changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'magicuser' }); await changeSpellState(actor, { action: 'book', bookId: 'book-a-1', available: true });
    await changeSpellState(actor, { action: 'copy', spellId: 'sleep', bookId: 'book-a-1', sourceConfirmed: true }); await changeSpellState(actor, { action: 'rest', confirmed: true }); await changeSpellState(actor, { action: 'prepare', spellId: 'sleep', count: 1 });
    const command = { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true };
    const results = await Promise.all([changeSpellState(actor, command), changeSpellState(actor, command)]);
    expect(results[0]).toEqual(results[1]); expect(roll).toHaveBeenCalledTimes(2); expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
  });

  it('blocks a failed copy at the same level and permits the retry at the next level', async () => {
    const { registerSpellcastingAuthority } = await import('./spellcasting.js'); const authority = await import('../progression/progression-authority.js'); registerSpellcastingAuthority();
    const change = (command, id) => authority.requestProgressionMutation('spells.mutate', { actorUuid: actor.uuid, command }, id);
    await change({ action: 'book', bookId: 'book-a-1', available: true }, 'copy-book');
    roll.mockResolvedValueOnce({ cancelled: false, total: 100, naturalD20: null });
    const command = { action: 'copy', spellId: 'sleep', bookId: 'book-a-1', sourceConfirmed: true };
    expect((await change(command, 'copy-fail')).copied).toBe(false);
    expect((await change(command, 'copy-same-level')).success).toBe(false);
    actor.system.level = 3;
    roll.mockResolvedValueOnce({ cancelled: false, total: 1, naturalD20: null });
    expect((await change(command, 'copy-next-level')).copied).toBe(true);
  });

  it('retains committed resources after a chat-card failure and recovers without another die', async () => {
    const { registerSpellcastingAuthority } = await import('./spellcasting.js'); const authority = await import('../progression/progression-authority.js'); registerSpellcastingAuthority();
    const change = async (command, operationId = null) => authority.requestProgressionMutation('spells.mutate', { actorUuid: actor.uuid, command }, operationId);
    await change({ action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'magicuser' }); await change({ action: 'book', bookId: 'book-a-1', available: true }); await change({ action: 'copy', spellId: 'sleep', bookId: 'book-a-1', sourceConfirmed: true }); await change({ action: 'rest', confirmed: true }); await change({ action: 'prepare', spellId: 'sleep', count: 1 });
    const originalCreate = ChatMessage.create;
    ChatMessage.create = vi.fn(async data => { if (data.flags?.['osp-houserules']?.spellOperation) throw new Error('chat unavailable'); return originalCreate(data); });
    const failed = await change({ action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true }, 'chat-fail');
    expect(failed.recoveryRequired).toBe(true); expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
    ChatMessage.create = originalCreate;
    const recovered = await authority.recoverProgressionOperation('chat-fail');
    expect(recovered.success).toBe(true); expect(roll).toHaveBeenCalledTimes(2); expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
  });
  async function preparedCaster() {
    const service = await import('./spellcasting.js');
    service.registerSpellcastingAuthority();
    await service.changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'magicuser' });
    await service.changeSpellState(actor, { action: 'book', bookId: 'book-a-1', available: true });
    await service.changeSpellState(actor, { action: 'grant', spellId: 'sleep', bookId: 'book-a-1' });
    await service.changeSpellState(actor, { action: 'rest', confirmed: true });
    await service.changeSpellState(actor, { action: 'prepare', spellId: 'sleep', count: 1 });
    return service;
  }
  it('recovers an unapplied resource write from its plan without another die', async () => {
    await preparedCaster();
    const authority = await import('../progression/progression-authority.js');
    actor.failBeforeResource = true;
    const failed = await authority.requestProgressionMutation('spells.mutate', { actorUuid: actor.uuid, command: { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true } }, 'before-apply');
    expect(failed.recoveryRequired).toBe(true);
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(0);
    expect(actor.getFlag('osp-houserules', 'spellcastingPending').stage).toBe('planned');
    expect((await authority.recoverProgressionOperation('before-apply')).success).toBe(true);
    expect(roll).toHaveBeenCalledTimes(1);
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
  });
  it('records an interrupted roll once and resumes using the actual GM-confirmed result', async () => {
    const service = await preparedCaster();
    const authority = await import('../progression/progression-authority.js');
    roll.mockRejectedValueOnce(new Error('roll dialog interrupted'));
    const failed = await authority.requestProgressionMutation('spells.mutate', { actorUuid: actor.uuid, command: { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true } }, 'interrupted-roll');
    expect(failed.recoveryRequired).toBe(true);
    expect(actor.getFlag('osp-houserules', 'spellcastingPending').stage).toBe('rolling');
    expect((await service.resolveInterruptedSpell(actor, 1)).success).toBe(true);
    expect(roll).toHaveBeenCalledTimes(1);
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
    const card = game.messages.find(message => message.getFlag('osp-houserules', 'spellOperation') === 'interrupted-roll');
    expect(card.content).toContain('Bane');
  });
  it('serializes distinct cast IDs against the last prepared copy', async () => {
    await preparedCaster();
    const authority = await import('../progression/progression-authority.js');
    const details = { actorUuid: actor.uuid, command: { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true } };
    const results = await Promise.all(['distinct-one','distinct-two'].map(id => authority.requestProgressionMutation('spells.mutate', details, id)));
    expect(results.filter(result => result.success)).toHaveLength(1);
    expect(roll).toHaveBeenCalledTimes(1);
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
  });
  it('requires review when character level changes while a die is being rolled', async () => {
    const service = await preparedCaster();
    roll.mockImplementationOnce(async () => { actor.system.level = 3; return { cancelled: false, total: 10 }; });
    const result = await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true });
    expect(result.recoveryRequired).toBe(true);
    expect(actor.system.level).toBe(3);
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(0);
    expect(actor.getFlag('osp-houserules', 'spellcastingPending').stage).toBe('rolled');
  });
  it('casts without requiring the containing Spellbook after preparation', async () => {
    const service = await preparedCaster();
    roll.mockImplementationOnce(async () => { actor.items.get('book-a').system.quantity = 0; return { cancelled: false, total: 10 }; });
    const result = await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true });
    expect(result.success).toBe(true);
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
  });
  it('requires the configured physical focus and explicit held confirmation', async () => {
    const service = await preparedCaster();
    const before = await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', bookId: 'missing-book', confirmed: true, focusHeldOrDisplayed: true });
    expect(before.success).toBe(true);
    const unheld = await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: false });
    expect(unheld.success).toBe(false);
    expect(roll).toHaveBeenCalledTimes(1);
  });
  it('requires the selected physical focus to be equipped before consuming spell resources', async () => {
    const service = await preparedCaster();
    actor.items.get('staff-a').system.equipped = false;
    const before = actor.getFlag('osp-houserules', 'spellcastingState').used['1'];
    const result = await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true });
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Equip Staff before casting');
    expect(actor.getFlag('osp-houserules', 'spellcastingState').used['1']).toBe(before);
    expect(roll).not.toHaveBeenCalled();
    actor.items.get('staff-a').system.equipped = true;
    expect((await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true })).success).toBe(true);
  });
  it('rejects an unavailable containing volume without consuming the prepared copy', async () => {
    const service = await preparedCaster();
    await service.changeSpellState(actor, { action: 'book', bookId: 'book-a-1', available: false });
    const result = await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true });
    expect(result.success).toBe(true);
    expect(actor.flags['osp-houserules'].spellcastingState.prepared['sleep::normal']).toBe(0);
    expect(roll).toHaveBeenCalledTimes(1);
  });
  it('recovers a source lost during the die only after restoration, without rolling again', async () => {
    const service = await import('./spellcasting.js'); service.registerSpellcastingAuthority();
    const authority = await import('../progression/progression-authority.js');
    roll.mockImplementationOnce(async () => { actor.items.get('scroll-a').system.quantity = 0; return { cancelled: false, total: 10 }; });
    const result = await service.changeSpellState(actor, { action: 'external', spellId: 'sleep', listKey: 'magic-user', sourceId: 'scroll-a', sourceKind: 'scroll', sourceConfirmed: true, confirmed: true, focusHeldOrDisplayed: true });
    expect(result.recoveryRequired).toBe(true);
    const pending = actor.getFlag('osp-houserules', 'spellcastingPending');
    expect(pending.stage).toBe('rolled');
    expect(actor.system.spellSlots['1'].used).toBe(0);
    actor.items.get('scroll-a').system.quantity = 1;
    expect((await authority.recoverProgressionOperation(pending.operationId)).success).toBe(true);
    expect(roll).toHaveBeenCalledTimes(1);
  });

  it('revalidates a containing book before recovering an uncommitted plan', async () => {
    const service = await preparedCaster();
    const authority = await import('../progression/progression-authority.js');
    actor.failBeforeResource = true;
    const result = await authority.requestProgressionMutation('spells.mutate', { actorUuid: actor.uuid, command: { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true } }, 'focus-plan-recovery');
    expect(result.recoveryRequired).toBe(true);
    expect(actor.getFlag('osp-houserules', 'spellcastingPending').stage).toBe('planned');
    actor.items.get('book-a').system.quantity = 0;
    expect((await authority.recoverProgressionOperation('focus-plan-recovery')).success).toBe(true);
    expect(actor.flags['osp-houserules'].spellcastingState.prepared['sleep::normal']).toBe(0);
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
    actor.items.get('book-a').system.quantity = 1;
    expect((await authority.recoverProgressionOperation('focus-plan-recovery')).success).toBe(true);
    expect(roll).toHaveBeenCalledTimes(1);
    expect(actor.flags['osp-houserules'].spellcastingState.used['1']).toBe(1);
  });

  it('grants automatic Read Magic only to the approved classes sharing the arcane list', async () => {
    const read = { id: 'read_magic', name: 'Read Magic', level: 1, alwaysKnown: true };
    fetch.mockImplementation(async url => ({ ok: true, json: async () => url.includes('class_profiles') ? { classProfiles: [profile, { ...profile, id: 'elf', name: 'Elf' }] } : url.includes('spells') ? { spellLists: { 'magic-user': [sleep, read] } } : house }));
    const { spellView } = await import('./spellcasting.js');
    expect((await spellView(actor)).state.known.read_magic).toBe(true);
    actor.system.class = 'Elf';
    expect((await spellView(actor)).state.known.read_magic).toBeUndefined();
  });

  it('rejects spell and ability records as physical inventory focus objects', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js');
    registerSpellcastingAuthority();
    actor.items.push({ id: 'spell-focus', type: 'spell', name: 'Sleep', system: {} });
    for (const itemId of ['innate-a', 'spell-focus']) {
      const result = await changeSpellState(actor, { action: 'focus', itemId, available: true });
      expect(result.success).toBe(false);
      expect(result.reason).toContain('physical inventory object');
    }
    expect(actor.getFlag('osp-houserules', 'spellcastingState')).toBeUndefined();
  });

  it('rejects Spellbook inventory items as Wand or Staff focus', async () => {
    const { registerSpellcastingAuthority, changeSpellState } = await import('./spellcasting.js');
    registerSpellcastingAuthority();
    const result = await changeSpellState(actor, { action: 'focus', focusKind: 'wand', itemId: 'book-a', available: true, focusClass: 'magicuser' });
    expect(result.success).toBe(false);
    expect(result.reason).toContain('owned available Wand or Staff');
  });

  it.each([
    ['Mage', 'mage', 'external'], ['Cleric', 'cleric', 'divine'], ['Paladin', 'paladin', 'divine'],
    ['Druid', 'druid', 'divine'], ['Bard', 'bard', 'divine'], ['Ranger', 'ranger', 'divine'],
  ])('accepts only an eligible inventory focus for %s without an availability checkbox', async (className, classKey, mode) => {
    actor.system.class = className;
    actor.items.get('staff-a').name = { mage: 'Staff', cleric: 'Holy Symbol', paladin: 'Holy Symbol', druid: 'Mistletoe', bard: 'Instrument', ranger: 'Animal Totem' }[classKey];
    const casterProfile = { ...profile, id: classKey, name: className, spellcasting: { ...profile.spellcasting, type: mode === 'external' ? 'arcane-special' : 'class-specific', summary: `${mode} magic-user spells`, spellList: 'magic-user', startsAtLevel: 1, spellProgression: { 1: { 1: 1 }, 2: { 1: 1 } } } };
    fetch.mockImplementation(async url => ({ ok: true, json: async () => url.includes('class_profiles') ? { classProfiles: [casterProfile] } : url.includes('spells') ? catalog : house }));
    const service = await import('./spellcasting.js'); service.registerSpellcastingAuthority();
    expect((await service.changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: classKey })).success).toBe(true);
    expect((await service.changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'wrongclass' })).success).toBe(false);
    if (mode === 'external') return;
    await service.changeSpellState(actor, { action: 'rest', confirmed: true });
    await service.changeSpellState(actor, { action: 'prepare', spellId: 'sleep', count: 1 });
    const unheld = await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', confirmed: true, focusHeldOrDisplayed: false });
    expect(unheld.success).toBe(false);
    actor.items.get('staff-a').system.equipped = false;
    const unequipped = await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', confirmed: true, focusHeldOrDisplayed: true });
    expect(unequipped.success).toBe(false);
    expect(unequipped.reason).toContain('Equip');
    expect(roll).not.toHaveBeenCalled();
    actor.items.get('staff-a').system.equipped = true;
    const cast = await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', confirmed: true, focusHeldOrDisplayed: true });
    expect(cast.success).toBe(true);
  });

  it.each(['Elf', 'Gnome', 'Half-Elf', 'Drow'])('casts prepared %s race-as-class spells without a physical focus', async className => {
    actor.system.class = className;
    const key = className.toLowerCase().replace('-', '_');
    const casterProfile = { ...profile, id: key, name: className, spellcasting: { ...profile.spellcasting, summary: 'arcane magic-user spells', spellList: 'magic-user', startsAtLevel: 1, spellProgression: { 1: { 1: 1 }, 2: { 1: 1 } } } };
    fetch.mockImplementation(async url => ({ ok: true, json: async () => url.includes('class_profiles') ? { classProfiles: [casterProfile] } : url.includes('spells') ? catalog : house }));
    const service = await import('./spellcasting.js'); service.registerSpellcastingAuthority();
    await service.changeSpellState(actor, { action: 'book', bookId: 'book-a-1', available: true });
    await service.changeSpellState(actor, { action: 'grant', spellId: 'sleep', bookId: 'book-a-1' });
    await service.changeSpellState(actor, { action: 'rest', confirmed: true });
    await service.changeSpellState(actor, { action: 'prepare', spellId: 'sleep', count: 1 });
    const result = await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', confirmed: true, focusHeldOrDisplayed: false });
    expect(result.success).toBe(true);
  });

  it.each(['scroll', 'wand', 'staff', 'item'])('uses an external %s as its own focus and requires it to be held', async sourceKind => {
    const service = await import('./spellcasting.js'); service.registerSpellcastingAuthority();
    const sourceId = sourceKind === 'item' ? 'staff-a' : `${sourceKind}-a`;
    const missing = await service.changeSpellState(actor, { action: 'external', spellId: 'sleep', listKey: 'magic-user', sourceId, sourceKind, sourceConfirmed: true, confirmed: true, focusHeldOrDisplayed: false });
    expect(missing.success).toBe(false);
    const result = await service.changeSpellState(actor, { action: 'external', spellId: 'sleep', listKey: 'magic-user', sourceId, sourceKind, sourceConfirmed: true, confirmed: true, focusHeldOrDisplayed: true });
    expect(result.success).toBe(true);
  });

  it('requires an explicit Wand or Staff for Illusionist casts', async () => {
    actor.system.class = 'Illusionist';
    const illusionist = { ...profile, id: 'illusionist', name: 'Illusionist', spellcasting: { ...profile.spellcasting, summary: 'arcane illusionist spells', spellList: 'magic-user' } };
    actor.items.push({ id: 'book-b', name: 'Second Spellbook', type: 'item', system: { quantity: 1 } });
    fetch.mockImplementation(async url => ({ ok: true, json: async () => url.includes('class_profiles') ? { classProfiles: [illusionist] } : url.includes('spells') ? catalog : house }));
    const service = await import('./spellcasting.js'); service.registerSpellcastingAuthority();
    await service.changeSpellState(actor, { action: 'book', bookId: 'book-a-1', available: true });
    await service.changeSpellState(actor, { action: 'book', bookId: 'book-b-1', available: true });
    await service.changeSpellState(actor, { action: 'grant', spellId: 'sleep', bookId: 'book-a-1' });
    await service.changeSpellState(actor, { action: 'rest', confirmed: true });
    await service.changeSpellState(actor, { action: 'prepare', spellId: 'sleep', count: 1 });
    expect((await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', bookId: 'book-b-1', confirmed: true, focusHeldOrDisplayed: true })).success).toBe(false);
    expect((await service.changeSpellState(actor, { action: 'focus', focusKind: 'staff', itemId: 'staff-a', available: true, focusClass: 'illusionist' })).success).toBe(true);
    expect((await service.changeSpellState(actor, { action: 'cast', spellId: 'sleep', bookId: 'book-a-1', confirmed: true, focusHeldOrDisplayed: true })).success).toBe(true);
  });

});


describe('item-owned spell casting', () => {
  async function setup(kind = 'scroll', reverse = false) {
    const item = actor.items.get(kind === 'scroll' ? 'scroll-a' : 'wand-a');
    Object.assign(item.system, { spellKey: 'light', spellClass: 'magic-user', spellReversed: reverse, spellSourceKind: kind, charges: 2, quantity: kind === 'scroll' ? 2 : 1 });
    const service = await import('./spellcasting.js'); service.registerSpellcastingAuthority();
    return { service, item, command: { action: 'itemCast', sourceId: item.id, confirmed: true, focusHeldOrDisplayed: true } };
  }
  it.each(['scroll', 'wand'])('casts the linked form and consumes one %s use without prepared slots', async kind => {
    const { service, item, command } = await setup(kind, true);
    const result = await service.changeSpellState(actor, command);
    expect(result.success).toBe(true);
    expect(roll).toHaveBeenCalledTimes(1);
    expect(item.system[kind === 'scroll' ? 'quantity' : 'charges']).toBe(1);
    expect(actor.system.spellSlots[1].used).toBe(0);
    expect(game.messages.some(message => message.content?.includes('<h3>Darkness</h3>'))).toBe(true);
  });
  it('rejects missing links, exhausted uses, and ineligible classes before rolling', async () => {
    const { service, item, command } = await setup();
    item.system.spellKey = '';
    expect((await service.changeSpellState(actor, command)).success).toBe(false);
    item.system.spellKey = 'light'; item.system.quantity = 0;
    expect((await service.changeSpellState(actor, command)).success).toBe(false);
    item.system.quantity = 1; item.system.spellAllowedClasses = ['cleric'];
    expect((await service.changeSpellState(actor, command)).success).toBe(false);
    expect(roll).not.toHaveBeenCalled();
  });
  it('rejects a resource change during the roll without consuming another item', async () => {
    const { service, item, command } = await setup();
    roll.mockImplementationOnce(async () => { item.system.quantity = 1; return { total: 10 }; });
    expect((await service.changeSpellState(actor, command)).recoveryRequired).toBe(true);
    expect(item.system.quantity).toBe(1);
    expect(game.messages.some(message => message.flags?.['osp-houserules']?.spellOperation)).toBe(false);
  });
  it('recovers a failed item write and never repeats a committed decrement or roll', async () => {
    const { item, command } = await setup();
    const authority = await import('../progression/progression-authority.js');
    actor.failBeforeItem = true;
    const details = { actorUuid: actor.uuid, command };
    expect((await authority.requestProgressionMutation('spells.mutate', details, 'item-recovery')).recoveryRequired).toBe(true);
    expect(item.system.quantity).toBe(2);
    actor.failItemAck = true;
    expect((await authority.recoverProgressionOperation('item-recovery')).success).toBe(true);
    expect(item.system.quantity).toBe(1);
    expect((await authority.requestProgressionMutation('spells.mutate', details, 'item-recovery')).success).toBe(true);
    expect(item.system.quantity).toBe(1);
    expect(roll).toHaveBeenCalledTimes(1);
  });
  it('recovers a failed chat publish without consuming the last scroll twice', async () => {
    const { item, command } = await setup(); item.system.quantity = 1;
    const authority = await import('../progression/progression-authority.js'); const original = ChatMessage.create;
    ChatMessage.create = vi.fn(async data => { if (data.flags?.['osp-houserules']?.spellOperation) throw new Error('publish failed'); return original(data); });
    expect((await authority.requestProgressionMutation('spells.mutate', { actorUuid: actor.uuid, command }, 'last-scroll')).recoveryRequired).toBe(true);
    expect(item.system.quantity).toBe(0);
    ChatMessage.create = original;
    expect((await authority.recoverProgressionOperation('last-scroll')).success).toBe(true);
    expect(item.system.quantity).toBe(0); expect(roll).toHaveBeenCalledTimes(1);
  });
});
