import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import house from '../data/ose_house_rules_v1_5.json';

const fixturePath = new URL('./fixtures/westford-combat-party.json', import.meta.url);
const fixture = await readFile(fixturePath, 'utf8').then(JSON.parse, error => {
  if (error.code !== 'ENOENT' || process.env.OSP_COMBAT_REPORT) throw error;
  return null;
});

// Only external Foundry/UI facilities are replaced. The combat, sheet attack,
// critical, progression-authority and health implementations are real code.
const dice = vi.hoisted(() => ({ roll: vi.fn() }));
const attackUI = vi.hoisted(() => ({ confirm: null }));
vi.mock('../src/module/dice.js', () => ({ ospRoll: dice.roll, buildManualChatContent: () => '<p>Seeded test roll</p>' }));
vi.mock('../src/module/cards/item-card-dialog.js', () => ({ ItemCardDialog: class {} }));
vi.mock('../src/module/combat/combat-support-ui.js', () => ({ confirmAttackContext: async (...args) => attackUI.confirm ? attackUI.confirm(...args) : ({ attack: 0, damage: 0, automatic: false, offhand: false, override: false }) }));
const SID = 'osp-houserules', DEFAULT_SEED = 0x5eed1234;
const copy = value => structuredClone(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const collection = values => Object.assign([...values], { get(id) { return this.find(entry => entry.id === id); } });
function apply(target, update) {
  for (const [path, value] of Object.entries(update)) {
    if (path === '_id') continue;
    const parts = path.split('.'); let cursor = target;
    for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
    cursor[parts.at(-1)] = copy(value);
  }
}
const documentMethods = {
  getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
  async setFlag(scope, key, value) { this.flags[scope] ??= {}; this.flags[scope][key] = copy(value); return this; },
  async update(update) { apply(this, update); return this; },
  testUserPermission(user) { return user.isGM; }
};
// Foundry persistence stand-in, not a second combat algorithm.
class MemoryCombat {
  constructor(members) { this.id = 'offline-encounter'; this.round = 0; this.turn = null; this.flags = {}; this.combatants = collection(members); this.setupTurns(); }
  get combatant() { return this.turns[this.turn] ?? null; }
  setupTurns() { this.turns = [...this.combatants].sort((a, b) => this._sortCombatants(a, b)); return this.turns; }
  async updateEmbeddedDocuments(_kind, updates) {
    const current = this.combatant?.id;
    for (const update of updates) apply(this.combatants.get(update._id), update);
    this.setupTurns(); if (current) this.turn = this.turns.findIndex(c => c.id === current);
    return this.combatants;
  }
  async update(update, options = {}) {
    const oldRound = this.round; apply(this, update);
    if (oldRound !== this.round && options.turnEvents !== false) await this._onStartRound?.({ round: this.round, skipped: false });
    return this;
  }
  async _onStartRound() {} async _onEndRound() {} async _onEndTurn() {}
  async delete() { game.combats.delete(this.id); game.combat = null; return this; }
}
Object.assign(MemoryCombat.prototype, { getFlag: documentMethods.getFlag, async setFlag(scope, key, value) { return this.update({ [`flags.${scope}.${key}`]: value }, { turnEvents: false }); } });
// Synthetic enemy pool: no campaign enemy is edited or imported.
const ENEMIES = [
  { name: 'Goblin sparring opponent', hp: 18, ac: 12, str: 10, dex: 10 },
  { name: 'Kobold sparring opponent', hp: 16, ac: 13, str: 10, dex: 13 },
  { name: 'Orc sparring opponent', hp: 22, ac: 12, str: 13, dex: 10 }
];
function seeded(seed) { let state = seed >>> 0; return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296); }
function actorDocument(data) {
  const actor = copy(data); actor.id = actor._id ?? actor.id; actor.uuid = `Actor.${actor.id}`;
  actor.flags ??= {}; actor.items = collection((actor.items ?? []).map(item => {
    const document = { ...item, id: item._id ?? item.id };
    return Object.assign(document, {
      async update(update) { apply(this, update); return this; },
      async delete() { this.deleted = true; actor.items.splice(actor.items.findIndex(item => item.id === this.id), 1); return this; }
    });
  }));
  return Object.assign(actor, documentMethods, {
    async updateEmbeddedDocuments(_kind, updates) {
      for (const update of updates) {
        const item = this.items.get(update._id);
        if (item) apply(item, update);
      }
      return this.items;
    }
  });
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function runEncounter(seed, { maxRounds = 30, controlledWeapons = false, controlledSpells = false, controlledTactics = false } = {}) {
  vi.resetModules();
  attackUI.confirm = null; dice.roll.mockReset();
  const random = seeded(seed), rolls = [], trace = [], initiatives = [];
  const randomSpy = vi.spyOn(Math, 'random').mockImplementation(random);
  const forcedDice = [];
  let nextId = 0;
  // Formulas come from production methods. This replaces Foundry's dice source.
  dice.roll.mockImplementation(async formula => {
    const terms = String(formula).replace(/\s/g, '').match(/[+-]?[^+-]+/g) ?? [];
    let total = 0, naturalD20;
    for (const term of terms) {
      const match = term.match(/^([+-]?)(\d+)d(\d+)(rr1)?$/i);
      if (match) {
        const [, sign, count, faces, reroll] = match; let sum = 0;
        for (let i = 0; i < Number(count); i++) {
          let value;
          do {
            const forced = forcedDice.shift();
            if (forced) {
              expect(Number(faces), 'Controlled die was requested in the wrong order').toBe(forced.faces);
              value = forced.value;
            } else value = 1 + Math.floor(random() * Number(faces));
          } while (reroll && value === 1);
          if (Number(faces) === 20) naturalD20 ??= value;
          sum += value;
        }
        total += sign === '-' ? -sum : sum;
      } else {
        if (!/^[+-]?\d+$/.test(term)) throw new Error(`Unsupported test dice formula: ${formula}`);
        total += Number(term);
      }
    }
    const result = { total, naturalD20, cancelled: false, manual: true };
    rolls.push({ formula, total, ...(naturalD20 === undefined ? {} : { naturalD20 }) }); return result;
  });
  const gm = { id: 'offline-gm', isGM: true, targets: new Set() }, users = new Map([['offline-gm', gm]]); users.activeGM = gm;
  const settings = new Map([['initiative', 'individual'], ['rerollInitiative', 'reroll'], ['rollMode', 'publicroll']]);
  const hooks = new Map(), warnings = [];
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('Actor', class {});
  vi.stubGlobal('foundry', { documents: { Combat: MemoryCombat }, utils: { randomID: () => `test-${++nextId}` } });
  vi.stubGlobal('Hooks', { on(name, fn) { const list = hooks.get(name) ?? []; list.push(fn); hooks.set(name, list); }, callAll(name, ...args) { for (const fn of hooks.get(name) ?? []) fn(...args); } });
  vi.stubGlobal('game', { system: { id: SID }, world: { id: 'offline-combat-test' }, user: gm, users, combats: new Map(), actors: new Map(), messages: [], settings: { get: (_scope, key) => settings.get(key), set: async (_scope, key, value) => { settings.set(key, copy(value)); return value; } } });
  vi.stubGlobal('ui', { notifications: { warn: message => warnings.push(message), error: message => warnings.push(message), info() {} } });
  vi.stubGlobal('DOMPurify', { sanitize: value => value });
  vi.stubGlobal('fetch', async url => {
    const path = String(url);
    if (path.includes('class_profiles.json')) return { ok: true, json: async () => (await import('../data/class_profiles.json', { with: { type: 'json' } })).default };
    if (path.includes('race_profiles.json')) return { ok: true, json: async () => (await import('../data/race_profiles.json', { with: { type: 'json' } })).default };
    if (path.includes('spells.json')) return { ok: true, json: async () => (await import('../data/spells.json', { with: { type: 'json' } })).default };
    return { ok: true, json: async () => copy(house) };
  });
  vi.stubGlobal('ChatMessage', {
    getSpeaker: ({ actor } = {}) => ({ actor: actor?.id }), applyRollMode: card => card,
    async create(data) { const message = { ...copy(data), id: `message-${game.messages.length}`, author: gm }; game.messages.push(message); Hooks.callAll('createChatMessage', message, {}, gm.id); return message; }
  });
  vi.stubGlobal('fromUuid', async uuid => [...game.actors.values()].find(actor => actor.uuid === uuid));
  const { default: Combat } = await import('../src/module/combat/combat.js');
  const { ItemHandler } = await import('../src/module/actor/sheets/handlers/item-handler.js');
  const { OspActor } = await import('../src/module/actor/actor.js');
  const health = await import('../src/module/health/health-authority.js'); health.registerHealthAuthority();
  const critical = await import('../src/module/health/critical-authority.js'); critical.registerCriticalAuthority();
  const spellcasting = await import('../src/module/spells/spellcasting.js'); spellcasting.registerSpellcastingAuthority();
  const { healthSnapshot, conditionEffects } = await import('../src/module/health/health-rules.js');
  const { shouldSkipCombatant } = await import('../src/module/combat/combat-flow.js');
  const isParty = actor => fixture.users.some(user => user.character === actor._id || user.role < 3 && Number(actor.ownership?.[user._id]) >= 3);
  const exclusion = actor => !isParty(actor) ? 'Not assigned to a user or owned by a player' : !(Number(actor.system?.hitpoints) > 0 && Number(actor.system?.maxhitpoints) > 0) ? 'Incomplete or non-positive HP data' : null;
  const sources = fixture.actors.filter(actor => !exclusion(actor));
  expect(sources.length).toBeGreaterThanOrEqual(2);
  const party = sources.map(actorDocument), enemyChoice = copy(ENEMIES[Math.floor(random() * ENEMIES.length)]);
  for (const actor of party) {
    Object.setPrototypeOf(actor, OspActor.prototype);
    actor._prepareCharacterData();
  }
  const enemy = actorDocument({ _id: 'seeded-enemy', name: enemyChoice.name, type: 'monster', system: { hp: { value: enemyChoice.hp, max: enemyChoice.hp }, ac: enemyChoice.ac, attributes: { str: { value: enemyChoice.str }, dex: { value: enemyChoice.dex } } }, flags: {}, items: [] });
  const actors = [...party, enemy]; for (const actor of actors) game.actors.set(actor.id, actor);
  const selectedWeapons = new Map(actors.map(actor => [actor.id, actor.items.find(item => item.type === 'weapon' && item.system.equipped === true)]));
  const members = actors.map(actor => {
    const weapon = selectedWeapons.get(actor.id);
    return Object.assign({ id: `c-${actor.id}`, name: actor.name, actor, flags: { [SID]: { initiativeState: { declaration: weapon ? { kind: 'weapon', weaponIds: [weapon.id] } : { kind: 'unarmed' } } } }, defeated: false, initiative: null, ospGroup: actor === enemy ? 'red' : 'green' }, documentMethods);
  });
  const combat = new Combat(members); game.combats.set(combat.id, combat); game.combat = combat;
  const initialHP = actors.map(actor => [actor.id, healthSnapshot(actor).hp]);
  const alive = actor => healthSnapshot(actor).hp > 0 && !conditionEffects(healthSnapshot(actor)).cannotAct;
  const armorExpectations = new Map([['Blayne "Slim" Isembart', 17], ['Fung Telt', 10], ['Myr Ragmussen', 17]]);
  const armorChecks = party.map(actor => {
    expect(actor.system.ac).toBe(armorExpectations.get(actor.name));
    return { actorId: actor.id, actor: actor.name, ac: actor.system.ac, equippedArmor: actor.system.armor.filter(item => item.system.equipped).map(item => ({ id: item.id, name: item.name })) };
  });
  const recordInitiative = () => {
    expect(combat.turns).toHaveLength(actors.length);
    expect(combat.turns.every(c => c.defeated || Number.isFinite(c.initiative))).toBe(true);
    for (let i = 1; i < combat.turns.length; i++) expect(combat._sortCombatants(combat.turns[i - 1], combat.turns[i])).toBeLessThanOrEqual(0);
    for (const member of combat.turns.filter(c => !c.defeated)) {
      const declaration = member.getFlag(SID, 'initiativeState').declaration;
      const weapon = selectedWeapons.get(member.actor.id);
      expect(declaration).toEqual(weapon ? { kind: 'weapon', weaponIds: [weapon.id] } : { kind: 'unarmed' });
      if (weapon?.id === '5IfEEqBCBUerSkFP') {
        const raw = member.getFlag(SID, 'initiativeState').rawHundredths;
        // Captured Myr: DEX 16 (+2), Warhammer speed 4. Assert integration
        // independently rather than calling calculateInitiative as its oracle.
        expect(Math.floor(member.initiative)).toBe(Math.max(1, Math.floor(raw / 100) + 2 - 4));
        expect(Math.round(member.initiative * 100) % 100).toBe(raw % 100);
      }
    }
    initiatives.push({ round: combat.round, order: combat.turns.map(c => ({ id: c.id, value: c.initiative })) });
  };
  try {
    await combat.startCombat(); expect(combat.round).toBe(1); recordInitiative();
    if (controlledTactics) {
      const { movementProbes } = await import('./support/movement-probes.js');
      const { rangedReactionProbes } = await import('./support/ranged-reaction-probes.js');
      const movement = await movementProbes({ party, combat });
      const support = await vi.importActual('../src/module/combat/combat-support-ui.js');
      support.registerCombatSupportAuthority(); attackUI.confirm = support.confirmAttackContext;
      const ranged = await rangedReactionProbes({ party, enemy, combat, ItemHandler, health, healthSnapshot, forcedDice, rolls, trace, warnings, gm, support, dice });
      expect(Object.values(settings.get('progressionOperationReceipts')).every(receipt => receipt.status === 'completed')).toBe(true);
      await combat.delete(); expect(game.combats.size).toBe(0); expect(game.combat).toBeNull();
      return { mode: 'controlled-movement-ranged-reactions', tacticalCoverage: { movement, ...ranged }, cleanup: 'isolated state disposed in finally' };
    }
    if (controlledSpells) {
      const myr = party.find(actor => actor.name === 'Myr Ragmussen');
      const { readItemSpell } = await import('../src/module/spells/item-spell.js');
      const { readSpellState } = await import('../src/module/spells/spell-state.js');
      const { getSavingThrowTarget } = await import('../src/module/actor/saving-throws.js');
      const { default: OspDice } = await import('../src/module/helpers-dice.js');
      const scrolls = [
        ['DybpvO1h6TGhiy8t', 'hold_person', false, 'Hold Person', 2, 10, 'Normal'],
        ['NKofRGr0sjMzpSnN', 'cure_light_wounds', false, 'Cure Light Wounds', 1, 20, 'Boon'],
        ['0TRlfSBclXzcCjwL', 'remove_fear', true, 'Cause Fear', 1, 1, 'Bane']
      ].map(([id, spellId, reverse, name, level, wildDie, wild]) => ({ item: myr.items.get(id), spellId, reverse, name, level, wildDie, wild }));
      const availability = party.map(actor => ({ actorId: actor.id, actor: actor.name, spellItemDocuments: actor.items.filter(item => item.type === 'spell').length, prepared: copy(readSpellState(actor).prepared), known: copy(readSpellState(actor).known), itemSpells: actor.items.filter(item => readItemSpell(item)).map(item => ({ id: item.id, name: item.name, ...readItemSpell(item) })) }));
      expect(availability.every(actor => actor.spellItemDocuments === 0)).toBe(true);
      expect(availability.find(actor => actor.actorId === myr.id).itemSpells).toHaveLength(3);
      expect(availability.filter(actor => actor.actorId !== myr.id).every(actor => !actor.itemSpells.length)).toBe(true);
      const context = await spellcasting.spellContext(myr);
      for (const source of scrolls) {
        expect(source.item.system.quantity).toBe(1);
        expect(readItemSpell(source.item)).toMatchObject({ spellId: source.spellId, listKey: 'cleric', reverse: source.reverse, kind: 'scroll' });
        const canonical = context.allLists.cleric.find(spell => spell.id === source.spellId);
        expect(canonical.level).toBe(source.level);
        expect(source.reverse ? canonical.reversed.name : canonical.name).toBe(source.name);
      }
      const spellTrace = [], statuses = [], saveRolls = [], renderedSaves = [];
      const operationReceipts = () => game.settings.get(SID, 'progressionOperationReceipts') ?? {};
      // Legacy prepared spells live in flags, not necessarily Item documents.
      // Test Fung's real Glamour without inventing the missing physical focus.
      const fung = party.find(actor => actor.name === 'Fung Telt');
      const fungBefore = readSpellState(fung), fungRolls = rolls.length;
      expect(fungBefore.prepared).toEqual({ 'glamour::normal': 1 });
      expect(fungBefore.known).toMatchObject({ glamour: true, spook: true, colour_spray: true });
      const fungContext = await spellcasting.spellContext(fung);
      expect(fungContext.spells.glamour).toMatchObject({ name: 'Glamour', level: 1 });
      expect(fungContext.focusItems).toHaveLength(0);
      const blockedGlamour = await spellcasting.changeSpellState(fung, { action: 'cast', spellId: 'glamour', confirmed: true, focusHeldOrDisplayed: true }, 'fung-glamour-no-focus');
      expect(blockedGlamour.success).toBe(false); expect(blockedGlamour.reason).toMatch(/Wand or Staff|focus/i);
      expect(readSpellState(fung)).toEqual(fungBefore); expect(rolls.length).toBe(fungRolls);
      expect(fung.getFlag(SID, 'spellcastingPending') ?? null).toBeNull();
      expect(game.messages.some(message => message.flags?.[SID]?.spellOperation === 'fung-glamour-no-focus')).toBe(false);
      const unavailablePrepared = { actorId: fung.id, actor: fung.name, spellId: 'glamour', name: 'Glamour', prepared: 1, consumed: 0, reason: blockedGlamour.reason };
      trace.push({ action: 'blocked-prepared-spell', ...unavailablePrepared });
      const casterMember = combat.attackCombatantFor(myr);
      // Scrolls are inventory actions, not fabricated prepared spell documents.
      await combat.setDeclaration(casterMember.id, { kind: 'other' });
      const casterTurn = async () => {
        await combat.nextRound(); let turns = 0;
        while (combat.combatant?.actor !== myr) { expect(++turns).toBeLessThanOrEqual(actors.length); await combat.nextTurn(); }
      };
      const cast = async (source, operationId) => {
        await casterTurn();
        const before = source.item.system.quantity, messageIndex = game.messages.length, rollIndex = rolls.length;
        const slots = copy(readSpellState(myr).used), prepared = copy(readSpellState(myr).prepared);
        forcedDice.push({ faces: 20, value: source.wildDie });
        const result = await spellcasting.changeSpellState(myr, { action: 'itemCast', sourceId: source.item.id, confirmed: true, focusHeldOrDisplayed: true }, operationId);
        expect(result, result.reason).toMatchObject({ success: true, wild: source.wild, roll: source.wildDie });
        expect(forcedDice).toEqual([]); expect(rolls.slice(rollIndex)).toEqual([{ formula: '1d20', total: source.wildDie, naturalD20: source.wildDie }]);
        expect(source.item.system.quantity).toBe(before - 1);
        expect(operationReceipts()[operationId]?.status).toBe('completed');
        const cards = game.messages.slice(messageIndex).filter(message => message.flags?.[SID]?.spellOperation === operationId);
        expect(cards).toHaveLength(1);
        expect(cards[0].content).toContain(`<h3>${source.name}</h3>`);
        expect(cards[0].content).toContain('One scroll consumed.');
        expect(cards[0].content).toContain('Resolve spell attacks, saves and target effects separately.');
        expect(cards[0].content).toContain(source.wild === 'Normal' ? 'No Boon or Bane.' : `${source.wild}: GM adjudication required.`);
        if (source.wild === 'Bane') expect(cards[0].content).toContain('The spell does not automatically fail.');
        expect(source.item.flags[SID].spellUse.operationId).toBe(operationId);
        expect(readSpellState(myr).operations[operationId]).toMatchObject({ wild: source.wild, roll: source.wildDie });
        expect(readSpellState(myr).used).toEqual(slots); expect(readSpellState(myr).prepared).toEqual(prepared);
        expect(myr.getFlag(SID, 'spellcastingPending')).toBeNull();
        const replay = await spellcasting.changeSpellState(myr, { action: 'itemCast', sourceId: source.item.id, confirmed: true, focusHeldOrDisplayed: true }, operationId);
        expect(replay.success).toBe(true); expect(source.item.system.quantity).toBe(before - 1);
        expect(rolls.length).toBe(rollIndex + 1);
        expect(game.messages.filter(message => message.flags?.[SID]?.spellOperation === operationId)).toHaveLength(1);
        spellTrace.push({ sourceId: source.item.id, sourceName: source.item.name, spellId: source.spellId, list: 'cleric', reverse: source.reverse, level: source.level, displayName: source.name, before, after: source.item.system.quantity, wild: result.wild, roll: result.roll, operationId, round: combat.round });
        trace.push({ action: 'scroll-cast', ...spellTrace.at(-1) });
        return result;
      };
      // Foundry Roll/template adapters only: production RollSave, sendRoll and
      // digestResult perform the actual save roll routing and outcome check.
      vi.stubGlobal('CONFIG', { OSE: {}, Dice: { rollModes: {} }, sounds: { dice: 'test-dice' } });
      vi.stubGlobal('Roll', class {
        constructor(formula) { this.formula = formula; }
        async evaluate() { const result = await dice.roll(this.formula); this.total = result.total; this.dice = [{ results: [{ result: result.naturalD20 }] }]; return this; }
        async render() { return '<span>Controlled Foundry die</span>'; }
      });
      foundry.applications = { handlebars: { async renderTemplate(_path, data) { renderedSaves.push(copy(data.result)); return JSON.stringify(data.result); } } };
      const saveOptions = { className: myr.system.class, level: myr.system.level, race: myr.system.race, con: myr.system.attributes.con.value, wis: myr.system.attributes.wis.value };
      expect(saveOptions).toEqual({ className: 'Cleric', level: 3, race: 'Human', con: 11, wis: 17 });
      const saves = async ({ name, actor = myr, type = 'spells', magical = true, source = '', situationalBonus = 0, target, values }) => {
        const actorOptions = { className: actor.system.class, level: actor.system.level, race: actor.system.race, con: actor.system.attributes.con.value, wis: actor.system.attributes.wis.value };
        const actualTarget = getSavingThrowTarget({ ...actorOptions, saveType: type, magical, source, situationalBonus });
        expect(actualTarget).toBe(target);
        for (const [natural, success] of values) {
          forcedDice.push({ faces: 20, value: natural });
          const rolled = await OspDice.RollSave({ parts: ['1d20'], data: { roll: { type: 'above', target: actualTarget, blindroll: false } }, skipDialog: true, speaker: ChatMessage.getSpeaker({ actor }), title: name });
          expect(forcedDice).toEqual([]); expect(rolled.total).toBe(natural);
          expect(renderedSaves.at(-1)).toEqual({ isSuccess: success, isFailure: !success, target, total: natural });
          expect(JSON.parse(game.messages.at(-1).content)).toEqual(renderedSaves.at(-1));
          saveRolls.push({ name, actorId: actor.id, actor: actor.name, type, magical, source, situationalBonus, ...renderedSaves.at(-1) });
          trace.push({ action: 'saving-throw', ...saveRolls.at(-1) });
        }
      };
      const statusBefore = healthSnapshot(myr), condition = async (name, value, id) => {
        const result = await health.changeHealth(myr, { action: 'condition', name, value }, id);
        expect(result.success, result.reason).toBe(true); expect(myr.getFlag(SID, 'healthPending')).toBeNull();
        myr._calculateSavingThrows();
        statuses.push({ name, value, state: healthSnapshot(myr), effects: conditionEffects(healthSnapshot(myr)), derivedSpellSave: myr.system.saves.spells.value });
        trace.push({ action: 'GM-condition', ...statuses.at(-1) });
      };
      const cannotCast = async id => {
        const beforeRolls = rolls.length, quantity = scrolls[0].item.system.quantity;
        expect(quantity).toBe(1);
        const result = await spellcasting.changeSpellState(myr, { action: 'itemCast', sourceId: scrolls[0].item.id, confirmed: true, focusHeldOrDisplayed: true }, id);
        expect(result.success).toBe(false); expect(result.reason).toMatch(/cannot cast spells/i);
        expect(scrolls[0].item.system.quantity).toBe(quantity); expect(rolls.length).toBe(beforeRolls);
        expect(game.messages.some(message => message.flags?.[SID]?.spellOperation === id)).toBe(false);
        expect(myr.getFlag(SID, 'spellcastingPending') ?? null).toBeNull();
        trace.push({ action: 'blocked-cast', operationId: id, quantity, reason: result.reason });
      };
      await casterTurn();
      myr._calculateSavingThrows();
      expect(myr.system.saves.spells.value).toBe(13);
      await saves({ name: 'spell-save-boundary', target: 13, values: [[12, false], [13, true], [1, false], [20, true]] });
      await saves({ name: 'nonmagical-spell-save', magical: false, target: 15, values: [[14, false], [15, true]] });
      await saves({ name: 'Hold Person single-target GM modifier -2', situationalBonus: -2, target: 15, values: [[14, false], [15, true]] });
      await saves({ name: 'magical-paralysis-save', type: 'paralysis', target: 12, values: [[11, false], [12, true]] });
      await saves({ name: 'nonmagical-death-save', type: 'death', magical: false, target: 11, values: [[10, false], [11, true]] });
      const slim = party.find(actor => actor.name === 'Blayne "Slim" Isembart');
      expect(slim.system.level).toBe(4); expect(fung.system.level).toBe(3);
      // Slim's actual class is Half-Orc, whose level-four row is 13/14/13/16/15;
      // it is distinct from the Fighter table despite using melee attacks.
      expect(slim.system.class).toBe('Half-Orc');
      await saves({ name: 'Slim-spells', actor: slim, target: 15, values: [[14, false], [15, true]] });
      await saves({ name: 'Slim-wands', actor: slim, type: 'wands', target: 14, values: [[13, false], [14, true]] });
      await saves({ name: 'Slim-death', actor: slim, type: 'death', magical: false, target: 13, values: [[12, false], [13, true]] });
      await saves({ name: 'Fung-spells-gnome-resilience', actor: fung, target: 12, values: [[11, false], [12, true]] });
      await saves({ name: 'Fung-wands-gnome-resilience', actor: fung, type: 'wands', target: 11, values: [[10, false], [11, true]] });
      await saves({ name: 'Fung-plain-death', actor: fung, type: 'death', magical: false, target: 13, values: [[12, false], [13, true]] });
      await saves({ name: 'Fung-spell-source-death-resilience', actor: fung, type: 'death', source: 'spell', target: 10, values: [[9, false], [10, true]] });
      await condition('incapacitated', true, 'spell-status-incap');
      expect(conditionEffects(healthSnapshot(myr))).toMatchObject({ cannotAct: true, incomingAttack: 4, savePenalty: -4 });
      expect(healthSnapshot(myr).conditions.prone).toBe(true); expect(myr.system.saves.spells.value).toBe(17);
      await saves({ name: 'incapacitated-spell-save', situationalBonus: conditionEffects(healthSnapshot(myr)).savePenalty, target: 17, values: [[16, false], [17, true]] });
      await cannotCast('spell-blocked-incapacitated');
      const stand = await health.changeHealth(myr, { action: 'condition', name: 'prone', value: false }, 'spell-cannot-stand-incapacitated');
      expect(stand.success).toBe(false); expect(healthSnapshot(myr).conditions.prone).toBe(true);
      await condition('incapacitated', false, 'spell-status-clear-incap');
      await condition('unconscious', true, 'spell-status-unconscious');
      expect(healthSnapshot(myr).conditions.incapacitated).toBe(false);
      expect(conditionEffects(healthSnapshot(myr))).toMatchObject({ cannotAct: true, helpless: true });
      await cannotCast('spell-blocked-unconscious');
      const asleepStand = await health.changeHealth(myr, { action: 'condition', name: 'prone', value: false }, 'spell-cannot-stand-unconscious');
      expect(asleepStand.success).toBe(false);
      await condition('unconscious', false, 'spell-status-awake');
      await condition('prone', false, 'spell-status-stand');
      expect(conditionEffects(healthSnapshot(myr))).toMatchObject({ cannotAct: false, helpless: false, savePenalty: 0, outgoingAttack: 0 });
      expect(myr.system.saves.spells.value).toBe(13);
      await cast(scrolls[0], `spell-cast-${scrolls[0].item.id}`);
      // Deliberate GM resolution of Cure Light Wounds, separate from casting:
      // the real spell card says 1d6+1 and cannot exceed the subject's maximum.
      const patient = party.find(actor => actor.name === 'Fung Telt'), patientBefore = healthSnapshot(patient).hp;
      expect((await health.changeHealth(patient, { action: 'damage', amount: 3 }, 'spell-patient-setup')).success).toBe(true);
      const woundedHP = healthSnapshot(patient).hp;
      await cast(scrolls[1], `spell-cast-${scrolls[1].item.id}`);
      expect(healthSnapshot(patient).hp).toBe(woundedHP); // casting itself doesn't apply target effects
      forcedDice.push({ faces: 6, value: 4 });
      const healing = await dice.roll('1d6+1'); expect(healing.total).toBe(5); expect(forcedDice).toEqual([]);
      expect((await health.changeHealth(patient, { action: 'heal', amount: healing.total, magical: true }, 'spell-manual-heal')).success).toBe(true);
      expect(healthSnapshot(patient).hp).toBe(patientBefore); expect(healthSnapshot(patient).hp).toBe(healthSnapshot(patient).maxHp);
      await cast(scrolls[2], `spell-cast-${scrolls[2].item.id}`);
      const rollCount = rolls.length;
      const exhausted = await spellcasting.changeSpellState(myr, { action: 'itemCast', sourceId: scrolls[0].item.id, confirmed: true, focusHeldOrDisplayed: true }, 'spell-exhausted');
      expect(exhausted.success).toBe(false); expect(exhausted.reason).toMatch(/available owned spell item|No usable item remains/);
      expect(scrolls[0].item.system.quantity).toBe(0); expect(rolls.length).toBe(rollCount);
      expect(statusBefore.hp).toBe(healthSnapshot(myr).hp); expect(healthSnapshot(myr).conditions).toEqual(statusBefore.conditions);
      expect(myr.getFlag(SID, 'spellcastingPending')).toBeNull(); expect(myr.getFlag(SID, 'healthPending')).toBeNull();
      expect(Object.values(operationReceipts()).every(receipt => receipt.status === 'completed')).toBe(true);
      await combat.delete(); expect(game.combats.size).toBe(0); expect(game.combat).toBeNull();
      return { mode: 'controlled-spell-save-status', spellCoverage: { availability, sources: spellTrace, unavailablePrepared, noSpellItemDocuments: true, blockedWhileIncapacitated: true, blockedWhileUnconscious: true, exhaustedSourceRejected: true, saveExecutor: 'Production OspDice.RollSave/sendRoll/digestResult; Foundry Roll and rendering adapters', saveRolls, statuses, manualHealing: { sourceId: scrolls[1].item.id, target: patient.id, formula: '1d6+1', total: healing.total, beforeHP: woundedHP, afterHP: healthSnapshot(patient).hp, maximum: healthSnapshot(patient).maxHp }, manualResolution: 'GM separately resolves target saves and health conditions. Hold Person paralysis and Cause Fear fleeing are not automatically applied. Cure Light Wounds healing is an explicit scripted GM health command, not a cast side effect.' }, cleanup: 'isolated spell state disposed in finally' };
    }
    if (controlledWeapons) {
      const myr = party.find(actor => actor.name === 'Myr Ragmussen'), weapon = selectedWeapons.get(myr.id);
      expect(weapon.id).toBe('5IfEEqBCBUerSkFP'); expect(weapon.name).toBe('Warhammer');
      expect(weapon.system.damage).toBe('1d4+1'); expect(weapon.system.speedFactor).toBe(4);
      const policy = await new ItemHandler(null, myr, null)._getWeaponPolicy(weapon);
      expect(policy).toMatchObject({ allowed: true, proficient: true, attackPenalty: 0, damageCapHD: null });
      const checks = [];
      const probe = async ({ name, attacker, target, dice: values, expected, formula, damage, table }) => {
        await combat.nextRound();
        let steps = 0;
        while (combat.combatant?.actor !== attacker) { expect(++steps).toBeLessThanOrEqual(actors.length); await combat.nextTurn(); }
        gm.targets = new Set([{ name: target.name, actor: target }]);
        const handler = new ItemHandler(null, attacker, null), beforeHP = healthSnapshot(target).hp;
        const messageIndex = game.messages.length, rollIndex = rolls.length;
        forcedDice.push(...values.map(([faces, value]) => ({ faces, value })));
        const held = selectedWeapons.get(attacker.id);
        if (held) await handler.rollWeapon(held); else await handler.onUnarmedRoll({ preventDefault() {} });
        expect(forcedDice, `${name}: unused controlled dice`).toEqual([]);
        const cards = game.messages.slice(messageIndex), actionRolls = copy(rolls.slice(rollIndex));
        const attackCard = cards.find(card => card.flags?.[SID]?.attackResult);
        expect(attackCard?.flags[SID].attackResult).toBe(expected);
        const damageCard = cards.find(card => card.flags?.[SID]?.combatDamage);
        if (damage !== null) {
          expect(actionRolls.at(-1).formula).toBe(formula);
          expect(damageCard?.flags[SID]).toMatchObject({ combatDamageTotal: damage, rawDamageTotal: damage, nonProficiencyCap: null, damageCapped: false });
          const result = await health.changeHealth(target, { action: 'damage', amount: damage }, `probe-${checks.length}`);
          expect(result.success, result.reason).toBe(true); expect(healthSnapshot(target).hp).toBe(beforeHP - damage);
        } else { expect(damageCard).toBeUndefined(); expect(healthSnapshot(target).hp).toBe(beforeHP); }
        const criticalCard = cards.find(card => card.flags?.[SID]?.criticalOperation);
        if (table !== undefined) {
          expect(criticalCard?.flags[SID].criticalResult).toMatchObject({ success: true, table: 'hit', roll: table });
          expect(attacker.getFlag(SID, 'criticalLastResult').result).toEqual(criticalCard.flags[SID].criticalResult);
          expect(attacker.getFlag(SID, 'criticalPending')).toBeNull();
        } else expect(criticalCard).toBeUndefined();
        expect(combat.attackStateFor(combat.attackCombatantFor(attacker)).spent).toBe(1);
        const check = { name, attacker: attacker.id, target: target.id, weaponId: held?.id ?? null, targetAC: target.system.ac, result: expected, rolls: actionRolls, damage: damage ?? 0, beforeHP, afterHP: healthSnapshot(target).hp, critical: criticalCard?.flags[SID].criticalResult ?? null };
        checks.push(check); trace.push(check); return check;
      };
      // Same natural 13: misses actual Chain mail + Shield (17), hits
      // the otherwise identical unarmored copy (DEX +2 => 12).
      const armored = await probe({ name: 'equipped-armor-blocks', attacker: enemy, target: myr, dice: [[20, 13]], expected: 'miss', damage: null });
      const armor = myr.system.armor.filter(item => item.system.equipped);
      for (const item of armor) item.system.equipped = false;
      myr._calculateArmorClass(); expect(myr.system.ac).toBe(12);
      const stripped = await probe({ name: 'same-roll-without-armor-hits', attacker: enemy, target: myr, dice: [[20, 13], [2, 1]], expected: 'hit', formula: '1d2 + 0', damage: 1 });
      expect(stripped.rolls[0]).toEqual(armored.rolls[0]);
      for (const item of armor) item.system.equipped = true;
      myr._calculateArmorClass(); expect(myr.system.ac).toBe(17);
      await probe({ name: 'normal-equipped-warhammer', attacker: myr, target: enemy, dice: [[20, 15], [4, 3]], expected: 'hit', formula: '1d4+1 + 1', damage: 5 });
      const targetAC = enemy.system.ac; enemy.system.ac = 100;
      const criticalCheck = await probe({ name: 'natural-20-bypasses-armor', attacker: myr, target: enemy, dice: [[20, 20], [100, 50], [4, 2], [4, 3]], expected: 'critical_hit', formula: '2d4+1 + 1', damage: 7, table: 50 });
      expect(criticalCheck.rolls[0].total).toBeLessThan(criticalCheck.targetAC);
      expect(criticalCheck.critical.entry.range).toBe('41-50');
      expect(criticalCheck.critical.injury).toBeNull(); expect(criticalCheck.critical.rerollOnes).toBe(false);
      enemy.system.ac = targetAC;
      await probe({ name: 'critical-rerolls-ones', attacker: myr, target: enemy, dice: [[20, 20], [100, 87], [4, 1], [4, 4], [4, 1], [4, 2]], expected: 'critical_hit', formula: '2d4rr1+1 + 1', damage: 8, table: 87 });
      expect(warnings).toEqual([]);
      expect(Object.values(settings.get('progressionOperationReceipts')).every(r => r.status === 'completed')).toBe(true);
      await combat.delete(); expect(game.combats.size).toBe(0); expect(game.combat).toBeNull();
      return { mode: 'controlled-weapon-and-armor-regressions', weapon: { id: weapon.id, name: weapon.name, formula: weapon.system.damage, speed: weapon.system.speedFactor, policy }, armorChecks, checks, cleanup: 'isolated state disposed in finally' };
    }
    const visited = new Set();
    while (alive(enemy) && party.some(alive)) {
      if (combat.round > maxRounds) throw new Error(`Encounter exceeded ${maxRounds} rounds`);
      const member = combat.combatant; expect(member).toBeTruthy(); expect(shouldSkipCombatant(member, combat.round)).toBe(false);
      const turnKey = `${combat.round}-${member.id}`; expect(visited.has(turnKey)).toBe(false); visited.add(turnKey);
      const attacker = member.actor, target = attacker === enemy ? party.find(alive) : enemy;
      expect(alive(attacker)).toBe(true); gm.targets = new Set([{ name: target.name, actor: target }]);
      const handler = new ItemHandler(null, attacker, null), startMessage = game.messages.length, startRoll = rolls.length;
      const weapon = selectedWeapons.get(attacker.id);
      const action = weapon ? 'weapon' : 'unarmed';
      // Canonical sheet action supplies class/STR bonuses, reservations,
      // hit/miss, critical tables and damage formula. No hand-written attack math.
      if (weapon) await handler.rollWeapon(weapon);
      else await handler.onUnarmedRoll({ preventDefault() {} });
      const cards = game.messages.slice(startMessage), attackCard = cards.find(card => card.flags?.[SID]?.attackResult);
      expect(attackCard, `Missing attack card for ${attacker.name}: ${warnings.join('; ')}`).toBeTruthy();
      const attackResult = attackCard.flags[SID].attackResult;
      const attackDie = rolls[startRoll];
      const targetAAC = target.system.ac ?? target.system.aac?.value ?? 10;
      const expectedResult = attackDie.naturalD20 === 20 ? 'critical_hit' : attackDie.naturalD20 === 1 ? 'critical-miss' : attackDie.total >= targetAAC ? 'hit' : 'miss';
      expect(attackResult).toBe(expectedResult);
      if (attackResult === 'critical_hit') {
        const criticalCard = cards.find(card => card.flags?.[SID]?.criticalOperation);
        expect(criticalCard?.flags?.[SID]?.criticalResult?.table).toBe('hit');
        expect(criticalCard?.flags?.[SID]?.criticalResult?.success).toBe(true);
      }
      expect(combat.attackStateFor(member).spent).toBe(1);
      expect(Object.values(combat.attackStateFor(member).reservations).every(r => r.status === 'committed')).toBe(true);
      const damageCard = cards.find(card => card.flags?.[SID]?.combatDamage), damage = damageCard?.flags[SID].combatDamageTotal ?? 0;
      const beforeHP = healthSnapshot(target).hp;
      if (['hit', 'critical_hit'].includes(attackResult)) expect(damageCard).toBeTruthy(); else expect(damageCard).toBeUndefined();
      if (damageCard) {
        expect(damage).toBeGreaterThanOrEqual(0);
        expect(damage).toBe(Math.max(0, rolls.at(-1).total));
        const result = await health.changeHealth(target, { action: 'damage', amount: damage }, `damage-${trace.length}`);
        expect(result.success, result.reason).toBe(true); expect(healthSnapshot(target).hp).toBe(beforeHP - damage);
        expect(target.getFlag(SID, 'healthPending')).toBeNull();
      }
      trace.push({ round: combat.round, attacker: attacker.id, target: target.id, action, weaponId: weapon?.id ?? null, weaponName: weapon?.name ?? null, weaponFormula: weapon?.system?.damage ?? null, targetAC: targetAAC, result: attackResult, rolls: copy(rolls.slice(startRoll)), damage, beforeHP, afterHP: healthSnapshot(target).hp });
      if (!alive(target)) {
        const defeated = members.find(c => c.actor === target); await combat.markDefeated(defeated.id, true);
        expect(defeated.defeated).toBe(true); expect(shouldSkipCombatant(defeated, combat.round)).toBe(true);
      }
      if (!alive(enemy) || !party.some(alive)) break;
      const previousRound = combat.round; await combat.nextTurn();
      if (combat.round !== previousRound) { expect(combat.round).toBe(previousRound + 1); recordInitiative(); }
    }
    expect(warnings).toEqual([]);
    expect(trace.some(action => ['hit', 'critical_hit'].includes(action.result))).toBe(true);
    expect(trace.some(action => ['miss', 'critical-miss'].includes(action.result))).toBe(true);
    expect(trace.some(action => action.action === 'weapon')).toBe(true);
    expect(trace.some(action => action.weaponName === 'Warhammer' && /1d4/.test(action.weaponFormula))).toBe(true);
    for (const action of trace) if (action.target !== 'seeded-enemy') expect(action.targetAC).toBe(armorExpectations.get(party.find(actor => actor.id === action.target)?.name));
    expect(trace.some(action => action.attacker === enemy.id)).toBe(true); expect(combat.round).toBeGreaterThan(1);
    const result = { seed, enemy: enemyChoice, party: party.map(a => ({ id: a.id, name: a.name, level: a.system.level, ac: a.system.ac, weapon: selectedWeapons.get(a.id) ? { id: selectedWeapons.get(a.id).id, name: selectedWeapons.get(a.id).name, speed: selectedWeapons.get(a.id).system.speedFactor } : null, fallback: selectedWeapons.get(a.id) ? null : 'No equipped weapon in captured data' })), armorChecks, excluded: fixture.actors.filter(a => !sources.includes(a)).map(a => ({ id: a._id, name: a.name, reason: exclusion(a) })), missingAssignedActors: fixture.users.filter(user => user.character && !fixture.actors.some(a => a._id === user.character)).map(user => ({ user: user.name, actorId: user.character })), initialHP, initiatives, trace, rounds: combat.round, outcome: alive(enemy) ? 'enemy-win' : 'party-win', finalHP: actors.map(a => [a.id, healthSnapshot(a).hp]) };
    expect(actors.some(a => !alive(a))).toBe(true);
    // Core Foundry deletion hooks are not emulated: verify disposal of the
    // isolated documents and no pending authority mutations, not core hooks.
    await combat.delete(); expect(game.combats.size).toBe(0); expect(game.combat).toBeNull();
    expect(Object.values(settings.get('progressionOperationReceipts')).every(r => r.status === 'completed')).toBe(true);
    game.actors.clear(); game.messages.length = 0; settings.clear(); hooks.clear();
    expect(game.actors.size).toBe(0); expect(game.messages).toHaveLength(0);
    result.cleanup = 'isolated documents, messages and settings cleared; no pending operations'; return result;
  } catch (error) { error.message += `\nReplay seed=${seed}\nTrace=${JSON.stringify(trace)}`; throw error; }
  finally {
    // Also dispose on assertion failures or the round-limit failure path.
    game.combats.clear(); game.combat = null; game.actors.clear(); game.messages.length = 0; settings.clear(); hooks.clear();
    attackUI.confirm = null; randomSpy.mockRestore();
  }
}

let report, controlledCoverage, spellCoverage, tacticalCoverage;
afterAll(async () => {
  if (!process.env.OSP_COMBAT_REPORT || !report || !controlledCoverage || !spellCoverage || !tacticalCoverage) return;
  const path = resolve(process.env.OSP_COMBAT_REPORT); await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ ...report, format: 'osp-combat-encounter-report-v5', controlledCoverage, spellCoverage, tacticalCoverage }, null, 2) + '\n');
});
describe.skipIf(!fixture)('offline Westford encounter using production combat methods', () => {
  it('completes the same encounter twice, preserving the copied source party', async () => {
    const seed = Number(process.env.OSP_COMBAT_SEED ?? DEFAULT_SEED);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('OSP_COMBAT_SEED must be a uint32');
    const originalHash = hash(fixture), first = await runEncounter(seed), second = await runEncounter(seed);
    expect(second).toEqual(first); expect(hash(fixture)).toBe(originalHash);
    report = { format: 'osp-combat-encounter-report-v3', seed, fixtureSha256: originalHash, capturedAt: fixture.capturedAt, sourceFiles: fixture.sourceFiles, isolation: 'Frozen Westford copies; in-memory Foundry adapters; no live connection or database access', limitations: 'Actual equipped Warhammer plus unarmed fallback; neutral context; ranged Edvin excluded for incomplete HP; Foundry persistence, UI and core deletion hooks are adapters, not browser-tested; critical movement/injuries remain manual GM adjudication', checks: { repeatable: true, fixtureUnchanged: true, initiative: true, turns: true, armorDerivedAAC: true, armorChangesHitResult: true, equippedWeapon: true, weaponDamage: true, criticalTable: true, criticalDoubledDice: true, criticalRerollOnes: true, defeat: true, cleanup: true }, run: first };
  }, 20000);
  it('checks exact equipped-weapon damage, armor boundary and critical outcomes with controlled dice', async () => {
    const before = hash(fixture);
    const first = await runEncounter(DEFAULT_SEED, { controlledWeapons: true });
    const second = await runEncounter(DEFAULT_SEED, { controlledWeapons: true });
    expect(first).toEqual(second); expect(hash(fixture)).toBe(before);
    expect(game.combats.size).toBe(0); expect(game.actors.size).toBe(0); expect(game.messages).toHaveLength(0);
    controlledCoverage = first;
  }, 20000);
  it('replays actual spell sources, saves and status transitions in isolation', async () => {
    const before = hash(fixture);
    const first = await runEncounter(DEFAULT_SEED, { controlledSpells: true });
    const second = await runEncounter(DEFAULT_SEED, { controlledSpells: true });
    expect(second).toEqual(first); expect(hash(fixture)).toBe(before);
    expect(game.combats.size).toBe(0); expect(game.actors.size).toBe(0); expect(game.messages).toHaveLength(0);
    spellCoverage = first.spellCoverage;
  }, 20000);
  it('replays movement, actual ranged inventory and supported combat reactions in isolation', async () => {
    const before = hash(fixture);
    const first = await runEncounter(DEFAULT_SEED, { controlledTactics: true });
    const second = await runEncounter(DEFAULT_SEED, { controlledTactics: true });
    expect(first).toEqual(second); expect(hash(fixture)).toBe(before);
    expect(game.combats.size).toBe(0); expect(game.actors.size).toBe(0); expect(game.messages).toHaveLength(0);
    tacticalCoverage = first.tacticalCoverage;
  }, 20000);
  it('fails a stalled encounter with replay seed and trace', async () => {
    await expect(runEncounter(DEFAULT_SEED, { maxRounds: 0 })).rejects.toThrow(/exceeded 0 rounds[\s\S]*Replay seed=/);
    expect(game.combats.size).toBe(0); expect(game.actors.size).toBe(0); expect(game.messages).toHaveLength(0); expect(game.combat).toBeNull();
  });
});
