import { loadWeaponProfiles, findClassProfile } from './weapon-policy.js';
/** Campaign initiative with authenticated GM serialization and resumable batches. */
import { calculateInitiative, actionSpeed, assignInitiativeTieKeys } from './initiative.js';
import { rollInitiativeD20 } from './initiative-dice.js';
import { combatantState, defaultDeclaration, dexterityModifier, shouldSkipCombatant } from './combat-flow.js';
import { assertProgressionAuthorityFence, currentProgressionOperation, getProgressionRequester, registerProgressionAuthority, requestProgressionMutation, recoverProgressionOperation } from '../progression/progression-authority.js';
import { attackAllowance, createAttackRoundState, reserveAttack, settleAttack, canUseOffhand, hasTalent } from './attack-support.js';

const sid = () => game.system.id;
const copy = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const canOwn = (user, combatant) => Boolean(user?.isGM || combatant?.testUserPermission?.(user, 'OWNER') || combatant?.actor?.testUserPermission?.(user, 'OWNER'));
const stateSnapshot = combatant => ({ defeated: Boolean(combatant.defeated), initiative: combatant.initiative ?? null, state: copy(combatantState(combatant)), surprised: Boolean(combatant.getFlag?.(sid(), 'surprised')) });

export function registerCombatInitiativeAuthority() {
  registerProgressionAuthority('combat.initiative', async details => {
    const combat = game.combats?.get(details.combatId);
    if (!combat) return { success: false, reason: 'Combat no longer exists.' };
    try { return await combat.applyInitiativeOperation(details); }
    catch (error) { return { success: false, recoveryRequired: combat.initiativeOperation?.status === 'prepared', reason: error.message }; }
  });
  registerProgressionAuthority('combat.attack', async details => {
    const combat = game.combats?.get(details.combatId);
    if (!combat) return { success: false, reason: 'Combat no longer exists.' };
    try { return await combat.applyAttackOperation(details); }
    catch (error) { return { success: false, recoveryRequired: true, reason: error.message }; }
  });
}

export default class OspCombat extends foundry.documents.Combat {
  static GROUP_FORMULA = '1d20';
  static FORMULA = '1d20';
  #queue = Promise.resolve();
  get isGroupInitiative() { return game.settings.get(sid(), 'initiative') === 'group'; }
  get rerollBehavior() { return game.settings.get(sid(), 'rerollInitiative') ?? 'reroll'; }
  get initiativeOperation() { return this.getFlag(sid(), 'initiativeOperation'); }
  get attackRoundState() { return this.getFlag(sid(), 'attackRoundState'); }
  #roundOperationId(round) { return `combat-${this.id}-round-${round}-${this.getFlag(sid(), 'initiativeRoundSequence') ?? 0}`; }
  #serialize(work) { const next = this.#queue.catch(() => {}).then(work); this.#queue = next.catch(() => {}); return next; }
  async #request(details, operationId = null) {
    registerCombatInitiativeAuthority();
    const result = await requestProgressionMutation('combat.initiative', { combatId: this.id, ...details }, operationId);
    if (!result.success) throw new Error(result.reason || 'Initiative operation requires recovery.');
    return this;
  }
  async #collectRolls(ids, round) {
    const fromRound = this.round;
    const rolls = [], groups = new Map();
    for (const id of ids) {
      const combatant = this.combatants.get(id);
      if (!combatant || !canOwn(game.user, combatant)) continue;
      if (combatant.defeated) continue;
      if (!this.isGroupInitiative) actionSpeed(defaultDeclaration(combatant), combatant.actor?.items);
      const key = this.isGroupInitiative ? combatant.ospGroup : id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(combatant);
    }
    for (const members of groups.values()) {
      const result = await rollInitiativeD20({ label: this.isGroupInitiative ? `${members[0].ospGroup} Initiative` : `${members[0].name} Initiative` });
      if (result.cancelled) return null;
      for (const combatant of members) rolls.push({ id: combatant.id, rawRollHundredths: result.rawRollHundredths });
    }
    if (this.round !== fromRound) throw new Error('Combat advanced while initiative was entered; roll again for the current round.');
    return { rolls, round };
  }
  startCombat() { return this.#serialize(async () => {
    if (!game.user.isGM) throw new Error('Only a GM may start combat.');
    if (this.round > 0) return this;
    if (this.initiativeOperation?.status === 'prepared') return this.recoverInitiative();
    const staged = await this.#collectRolls(this.combatants.map(c => c.id), 1);
    if (!staged) return this;
    return this.#request({ kind: 'round', fromRound: this.round ?? 0, targetRound: 1, rolls: staged.rolls }, this.#roundOperationId(1));
  }); }
  nextRound() { return this.#serialize(async () => {
    if (!game.user.isGM) throw new Error('Only a GM may advance rounds.');
    if (this.initiativeOperation?.status === 'prepared') return this.recoverInitiative();
    const targetRound = (this.round ?? 0) + 1;
    const staged = this.rerollBehavior === 'reroll' || !this.round ? await this.#collectRolls(this.combatants.map(c => c.id), targetRound) : { rolls: [] };
    if (!staged) return this;
    return this.#request({ kind: 'round', fromRound: this.round ?? 0, targetRound, rolls: staged.rolls }, this.#roundOperationId(targetRound));
  }); }
  rollInitiative(ids, { updateTurn = true } = {}) { return this.#serialize(async () => {
    if (this.initiativeOperation?.status === 'prepared') return this.recoverInitiative();
    ids = typeof ids === 'string' ? [ids] : ids;
    const staged = await this.#collectRolls(ids ?? [], this.round || 1);
    if (!staged || !staged.rolls.length) return this;
    return this.#request({ kind: 'roll', fromRound: this.round, rolls: staged.rolls, updateTurn });
  }); }
  setDeclaration(id, declaration) { return this.#serialize(() => this.#request({ kind: 'declaration', fromRound: this.round, id, declaration })); }
  markDefeated(id, defeated) { return this.#serialize(() => this.#request({ kind: 'defeated', fromRound: this.round, id, value: Boolean(defeated) })); }
  setSurprised(id, surprised) { return this.#serialize(() => this.#request({ kind: 'surprised', fromRound: this.round, id, value: Boolean(surprised) })); }
  async recoverInitiative() {
    const operation = this.initiativeOperation;
    if (!operation || operation.status !== 'prepared') return this;
    const result = await recoverProgressionOperation(operation.operationId);
    if (!result.success) throw new Error(result.reason || 'Initiative recovery requires manual review.');
    return this;
  }
  attackStateFor(combatant) {
    const stored = combatant?.getFlag(sid(), 'attackRoundState');
    const sequence = this.getFlag(sid(), 'initiativeRoundSequence') ?? 0;
    if (stored?.round === this.round && stored.sequence === sequence) return copy(stored);
    return { ...createAttackRoundState({ round: this.round, actor: combatant?.actor }), sequence };
  }
  attackCombatantFor(actor) {
    const matches = this.combatants.filter(c => c.actor === actor || (actor?.uuid && c.actor?.uuid === actor.uuid));
    const controlled = matches.filter(c => globalThis.canvas?.tokens?.controlled?.some(t => t.id === c.tokenId));
    if (controlled.length === 1) return controlled[0];
    if (matches.includes(this.combatant)) return this.combatant;
    if (matches.length > 1) throw new Error('Select the combatant token before attacking with this shared actor.');
    return matches[0];
  }
  async reserveAttackForActor(actor, { operationId, offhand = false, extra = false, override = false, weaponId = null, primaryId = null } = {}) {
    const combatant = this.attackCombatantFor(actor);
    if (!combatant || !this.round) return { success: true, skipped: true };
    const result = await requestProgressionMutation('combat.attack', { combatId: this.id, combatantId: combatant.id, actorId: actor.id, kind: 'reserve', round: this.round, sequence: this.getFlag(sid(), 'initiativeRoundSequence') ?? 0, offhand, extra, override, weaponId, primaryId }, operationId);
    if (!result.success) throw new Error(result.reason || 'Attack reservation failed.');
    return result;
  }
  async settleAttackForActor(actor, reservationId, committed, stamp = {}) {
    const combatant = stamp.combatantId ? this.combatants.get(stamp.combatantId) : this.attackCombatantFor(actor);
    if (!combatant || !this.round) return { success: true, skipped: true };
    const result = await requestProgressionMutation('combat.attack', { combatId: this.id, combatantId: combatant.id, actorId: actor.id, kind: committed ? 'commit' : 'cancel', round: stamp.round ?? this.round, sequence: stamp.sequence ?? (this.getFlag(sid(), 'initiativeRoundSequence') ?? 0), reservationId }, `${reservationId}-${committed ? 'commit' : 'cancel'}`);
    if (!result.success) throw new Error(result.reason || 'Attack settlement failed.');
    return result;
  }
  async applyAttackOperation(details) {
    assertProgressionAuthorityFence();
    const requester = getProgressionRequester(), combatant = this.combatants.get(details.combatantId);
    if (!combatant || combatant.actor?.id !== details.actorId) return { success: false, reason: 'Combatant is no longer valid.' };
    if (!canOwn(requester, combatant)) return { success: false, reason: 'You may only use attacks for an owned combatant.' };
    if (!this.round || details.round !== this.round || details.sequence !== (this.getFlag(sid(), 'initiativeRoundSequence') ?? 0)) return { success: false, reason: 'Attack reservation is stale; the combat round changed.' };
    if (!['reserve', 'commit', 'cancel'].includes(details.kind)) return { success: false, reason: 'Unknown attack operation.' };
    const operationId = details.kind === 'reserve' ? currentProgressionOperation() : details.reservationId;
    if (!operationId) return { success: false, reason: 'Attack reservation identifier is missing.' };
    const current = this.attackStateFor(combatant);
    if (details.kind === 'reserve') {
      if ((details.override || details.extra) && !requester?.isGM) return { success: false, reason: 'Only the GM may grant extra attacks or override exhaustion.' };
      if (details.offhand) {
        const item = combatant.actor.items.get(details.weaponId), primary = combatant.actor.items.get(details.primaryId);
        if (!hasTalent(combatant.actor,'Two-Weapon Fighting')) {
          const {classes} = await loadWeaponProfiles(), profile = findClassProfile(classes,combatant.actor.system.class);
          if (!profile?.primeRequisites?.some(p => ['STR','DEX'].includes(p))) return {success:false,reason:'Two-weapon fighting requires STR or DEX as a prime requisite.'};
        }
        if (!item?.system?.equipped || !primary?.system?.equipped || !canUseOffhand(item, primary, hasTalent(combatant.actor, 'Two-Weapon Fighting'))) return { success: false, reason: 'Select a permitted equipped offhand and primary weapon.' };
      }
      try { reserveAttack(current, operationId, { offhand: Boolean(details.offhand), extra: Boolean(details.extra || details.override) }); }
      catch (error) { return { success: false, reason: error.message }; }
    } else {
      const reservation = current.reservations[operationId];
      if (!reservation) return { success: false, reason: 'Attack reservation is missing.' };
      if (reservation.status === 'reserved') settleAttack(current, operationId, details.kind === 'commit');
      else if (reservation.status !== (details.kind === 'commit' ? 'committed' : 'cancelled')) return { success: false, reason: 'Attack reservation was already settled differently.' };
    }
    assertProgressionAuthorityFence();
    try { await combatant.setFlag(sid(), 'attackRoundState', current); }
    catch (error) { if (!equal(combatant.getFlag(sid(), 'attackRoundState'), current)) throw error; }
    if (!equal(combatant.getFlag(sid(), 'attackRoundState'), current)) throw new Error('Attack state acknowledgement failed; GM recovery is required.');
    return { success: true, combatantId:combatant.id, remaining: Math.max(0, current.allowance - current.spent), round: this.round, sequence: current.sequence, operationId };
  }
  nextTurn() { return this.#serialize(async () => {
    if (this.initiativeOperation?.status === 'prepared') return this.recoverInitiative();
    if (this.round === 0) return this.#advanceRoundFromTurn();
    const next = this.turns.findIndex(c => c.id !== this.combatant?.id && !shouldSkipCombatant(c, this.round));
    if (next < 0) return this.#advanceRoundFromTurn();
    return this.#request({ kind: 'turn', fromRound: this.round, fromTurn: this.turn, targetId: this.turns[next].id });
  }); }
  async #advanceRoundFromTurn() {
    if (!game.user.isGM) throw new Error('Only a GM may advance rounds.');
    const targetRound = (this.round ?? 0) + 1;
    const staged = this.rerollBehavior === 'reroll' || !this.round ? await this.#collectRolls(this.combatants.map(c => c.id), targetRound) : { rolls: [] };
    if (!staged) return this;
    return this.#request({ kind: 'round', fromRound: this.round ?? 0, targetRound, rolls: staged.rolls }, this.#roundOperationId(targetRound));
  }
  _sortCombatants(a, b) {
    const left = a.initiative ?? -Infinity, right = b.initiative ?? -Infinity;
    if (left !== right) return right - left;
    const delta = (combatantState(a).tieKey ?? 0) - (combatantState(b).tieKey ?? 0);
    return delta || a.id.localeCompare(b.id);
  }
  async applyInitiativeOperation(details) {
    assertProgressionAuthorityFence();
    const user = getProgressionRequester(), operationId = currentProgressionOperation();
    const pending = this.initiativeOperation;
    if (pending?.operationId === operationId) return this.#commitPlan(pending);
    if (pending?.status === 'prepared') return { success: false, reason: 'Recover the interrupted initiative operation before continuing.' };
    if (this.round !== details.fromRound) return { success: false, reason: 'Combat round changed; refresh initiative.' };
    const isRound = ['round', 'syncRound'].includes(details.kind);
    if (['round', 'syncRound', 'reset', 'acted', 'defeated', 'surprised'].includes(details.kind) && !user?.isGM) return { success: false, reason: 'Only a GM may change this combat state.' };
    if (!['round', 'syncRound', 'reset', 'acted', 'roll', 'declaration', 'turn', 'defeated', 'surprised'].includes(details.kind)) return { success: false, reason: 'Unknown initiative action.' };
    if (isRound && details.targetRound !== (this.round ?? 0) + (details.kind === 'syncRound' ? 0 : 1)) return { success: false, reason: 'Invalid next round.' };
    const round = isRound ? details.targetRound : this.round || 1;
    const currentId = this.combatant?.id;
    const changes = new Map(), before = {};
    const touch = combatant => {
      if (!changes.has(combatant.id)) { before[combatant.id] = stateSnapshot(combatant); changes.set(combatant.id, { _id: combatant.id, initiative: combatant.initiative ?? null, [`flags.${sid()}.initiativeState`]: copy(combatantState(combatant)), [`flags.${sid()}.surprised`]: Boolean(combatant.getFlag(sid(), 'surprised')) }); }
      return changes.get(combatant.id);
    };
    if (isRound) for (const combatant of this.combatants) {
      const update = touch(combatant);
      update[`flags.${sid()}.initiativeState`] = { ...combatantState(combatant), round, acted: false, declaration: combatant.defeated ? combatantState(combatant).declaration : this.isGroupInitiative ? combatantState(combatant).declaration ?? { kind: 'other' } : defaultDeclaration(combatant), rawHundredths: this.rerollBehavior === 'keep' ? combatantState(combatant).rawHundredths ?? null : null, tieKey: this.rerollBehavior === 'keep' ? combatantState(combatant).tieKey ?? null : null };
      if (round >= 2) update[`flags.${sid()}.surprised`] = false;
      if (this.rerollBehavior !== 'keep' || combatant.defeated) update.initiative = null;
    }
    if (details.kind === 'reset') for (const combatant of this.combatants) { const update = touch(combatant); update.initiative = null; update[`flags.${sid()}.initiativeState`] = { ...combatantState(combatant), rawHundredths: null, tieKey: null }; }
    if (details.kind === 'acted') { const combatant = this.combatants.get(details.id); if (combatant && combatantState(combatant).round === details.round) touch(combatant)[`flags.${sid()}.initiativeState`].acted = true; }
    if (details.kind === 'roll' || isRound) for (const roll of details.rolls ?? []) {
      const combatant = this.combatants.get(roll.id);
      if (!combatant || !canOwn(user, combatant)) return { success: false, reason: 'You may only roll owned combatants.' };
      const update = touch(combatant), old = update[`flags.${sid()}.initiativeState`];
      const declaration = this.isGroupInitiative ? combatantState(combatant).declaration ?? { kind: 'other' } : defaultDeclaration(combatant);
      const value = this.isGroupInitiative ? calculateInitiative({ rawRollHundredths: roll.rawRollHundredths }) : calculateInitiative({ rawRollHundredths: roll.rawRollHundredths, dexMod: dexterityModifier(combatant.actor), race: combatant.actor?.system?.race, speed: actionSpeed(declaration, combatant.actor?.items) });
      update.initiative = combatant.defeated ? null : value.initiative;
      update[`flags.${sid()}.initiativeState`] = { ...old, round, declaration, rawHundredths: roll.rawRollHundredths, acted: isRound ? false : old.round === round && Boolean(old.acted) };
    }
    if (['declaration', 'defeated', 'surprised'].includes(details.kind)) {
      const combatant = this.combatants.get(details.id);
      if (!combatant || !canOwn(user, combatant)) return { success: false, reason: 'You may only change owned combatants.' };
      const update = touch(combatant), old = update[`flags.${sid()}.initiativeState`];
      if (details.kind === 'declaration') {
        const speed = actionSpeed(details.declaration, combatant.actor?.items);
        update[`flags.${sid()}.initiativeState`] = { ...old, declaration: copy(details.declaration) };
        if (!this.isGroupInitiative && old.round === round && old.rawHundredths != null) update.initiative = calculateInitiative({ rawRollHundredths: old.rawHundredths, dexMod: dexterityModifier(combatant.actor), race: combatant.actor?.system?.race, speed }).initiative;
      } else if (details.kind === 'defeated') update.defeated = details.value;
      else {
        if (this.round > 1 && details.value) return { success: false, reason: 'Surprise applies only to the opening round.' };
        update[`flags.${sid()}.surprised`] = details.value;
      }
    }
    let targetId = currentId;
    if (details.kind === 'turn') {
      if (this.turn !== details.fromTurn) return { success: false, reason: 'Combat turn changed.' };
      if (!user?.isGM && !canOwn(user, this.combatant)) return { success: false, reason: 'You may only end your own turn.' };
      const target = this.combatants.get(details.targetId);
      if (!target || shouldSkipCombatant(target, round)) return { success: false, reason: 'The next combatant is not eligible.' };
      if (this.combatant) touch(this.combatant)[`flags.${sid()}.initiativeState`].acted = true;
      targetId = target.id;
    }
    // Re-resolve exact ties across the complete current set, including unaffected rolls.
    const tied = (isRound && (this.rerollBehavior !== 'keep' || details.rolls?.length) || ['roll', 'declaration'].includes(details.kind)) ? assignInitiativeTieKeys([...this.combatants].filter(c => (changes.has(c.id) ? changes.get(c.id).initiative : c.initiative) != null).map(c => ({ id: c.id, initiative: changes.has(c.id) ? changes.get(c.id).initiative : c.initiative }))) : [];
    for (const entry of tied) touch(this.combatants.get(entry.id))[`flags.${sid()}.initiativeState`].tieKey = entry.tieKey;
    if (['defeated', 'surprised'].includes(details.kind) && details.value && targetId === details.id) targetId = [...this.combatants].sort((a, b) => this._sortCombatants(a, b)).find(c => c.id !== details.id && !shouldSkipCombatant(c, round))?.id ?? null;
    const updates = [...changes.values()];
    const plan = { operationId, status: 'prepared', isRound, roundSequence: (this.getFlag(sid(), 'initiativeRoundSequence') ?? 0) + (isRound ? 1 : 0), kind: details.kind, fromRound: this.round, fromTurn: this.turn, round: isRound ? round : this.round, targetId: isRound ? null : targetId, before, updates, createdAt: Date.now() };
    try { await this.setFlag(sid(), 'initiativeOperation', plan); }
    catch (error) { if (!equal(this.initiativeOperation, plan)) throw error; }
    assertProgressionAuthorityFence();
    return this.#commitPlan(plan);
  }
  async #commitPlan(plan) {
    assertProgressionAuthorityFence();
    if (plan.status === 'completed') return { success: true, idempotent: true };
    if (this.round !== plan.fromRound) return { success: false, recoveryRequired: true, reason: 'Combat advanced after the interrupted batch; manual review is required.' };
    const matches = update => {
      const combatant = this.combatants.get(update._id);
      return combatant && combatant.initiative === update.initiative && equal(combatantState(combatant), update[`flags.${sid()}.initiativeState`]) && Boolean(combatant.getFlag(sid(), 'surprised')) === update[`flags.${sid()}.surprised`] && (update.defeated === undefined || combatant.defeated === update.defeated);
    };
    for (const update of plan.updates) {
      const combatant = this.combatants.get(update._id);
      if (!combatant || !matches(update) && !equal(stateSnapshot(combatant), plan.before[update._id])) return { success: false, recoveryRequired: true, reason: 'Combatant changed during interrupted initiative; manual review is required.' };
    }
    try { await this.updateEmbeddedDocuments('Combatant', plan.updates, { turnEvents: false }); }
    catch (error) { if (!plan.updates.every(matches)) throw error; }
    assertProgressionAuthorityFence();
    if (!plan.updates.every(matches)) throw new Error('Initiative batch acknowledgment failed.');
    const turns = this.setupTurns();
    const turn = plan.isRound ? turns.findIndex(c => !shouldSkipCombatant(c, plan.round)) : turns.findIndex(c => c.id === plan.targetId);
    const update = { round: plan.round, turn: turn < 0 ? null : turn, [`flags.${sid()}.initiativeRoundSequence`]: plan.roundSequence, [`flags.${sid()}.initiativeOperation`]: { ...plan, status: 'completed' } };
    const options = { direction: plan.kind === 'round' || plan.kind === 'turn' ? 1 : 0, turnEvents: plan.kind === 'round' || plan.kind === 'turn' };
    if (options.turnEvents && this.getTimeDelta) options.worldTime = { delta: this.getTimeDelta(plan.fromRound, plan.fromTurn, update.round, update.turn) };
    if (plan.kind === 'round') Hooks.callAll(plan.round === 1 ? 'combatStart' : 'combatRound', this, update, options);
    if (plan.kind === 'turn') Hooks.callAll('combatTurn', this, update, options);
    try { await this.update(update, options); }
    catch (error) { if (this.initiativeOperation?.operationId !== plan.operationId || this.initiativeOperation?.status !== 'completed') throw error; }
    assertProgressionAuthorityFence();
    if (this.round !== update.round || this.turn !== update.turn || this.initiativeOperation?.operationId !== plan.operationId || this.initiativeOperation?.status !== 'completed') throw new Error('Combat transition acknowledgment failed.');
    return { success: true };
  }
  async _onEndRound(context) { await super._onEndRound?.(context); }
  async _onEndTurn(combatant, context) {
    await super._onEndTurn?.(combatant, context);
    if (game.user.id !== game.users.activeGM?.id || combatantState(combatant).round !== context.round || combatantState(combatant).acted) return;
    void this.#serialize(() => this.#request({ kind: 'acted', fromRound: this.round, round: context.round, id: combatant.id })).catch(error => ui.notifications.warn(error.message));
  }
  async _onStartRound(context) {
    await super._onStartRound?.(context);
    if (context.skipped || game.user.id !== game.users.activeGM?.id) return;
    void this.#serialize(async () => {
      if (this.initiativeOperation?.status === 'completed' && this.initiativeOperation.round === context.round) return;
      if (this.initiativeOperation?.status === 'prepared') return this.recoverInitiative();
      const staged = this.rerollBehavior === 'reroll' ? await this.#collectRolls(this.combatants.map(c => c.id), context.round) : { rolls: [] };
      if (!staged) return this;
      return this.#request({ kind: 'syncRound', fromRound: this.round, targetRound: this.round, rolls: staged.rolls }, this.#roundOperationId(context.round));
    }).catch(error => ui.notifications.warn(error.message));
  }
  resetAll() { return this.#serialize(() => this.#request({ kind: 'reset', fromRound: this.round })); }
  async resetActions() { return this.resetAll(); }
}
