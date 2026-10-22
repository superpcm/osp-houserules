import { healthSnapshot, planHealthChange, conditionEffects } from './health-rules.js';
import { getSavingThrowTarget } from '../actor/saving-throws.js';
import { getAbilityModifier } from '../../config/classes.js';
import { normalizeQuantity } from '../inventory/encumbrance.js';
import { ospRoll } from '../dice.js';
import { recoverPrivateDie, escapeNoncombatHTML as esc } from '../actor/noncombat-prompts.js';
import { registerProgressionAuthority, requestProgressionMutation, currentProgressionOperation, getProgressionRequester, assertProgressionAuthorityFence } from '../progression/progression-authority.js';
const SCOPE = 'osp-houserules';
const clone = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const flag = (actor, name) => actor.getFlag(SCOPE, name);
const hpPath = actor => actor.system.hp && typeof actor.system.hp === 'object' ? 'system.hp.value' : 'system.hitpoints';
const refused = reason => ({ success: false, reason });
const pendingResult = () => ({ success: false, recoveryRequired: true, reason: 'Health change needs GM recovery from XP History.' });
async function pendingWrite(actor, pending) {
  assertProgressionAuthorityFence();
  try { await actor.update({ [`flags.${SCOPE}.healthPending`]: pending }); }
  catch (error) { if (!same(flag(actor, 'healthPending'), pending)) throw error; }
  assertProgressionAuthorityFence();
  if (!same(flag(actor, 'healthPending'), pending)) throw new Error('Health pending write not acknowledged');
}
async function die(actor, pending, key, faces, label) {
  if (pending.rolls[key] !== undefined) return pending.rolls[key];
  let actual;
  if (pending.stage === 'rolling') {
    if (pending.rollKey !== key) throw new Error('Unexpected interrupted die');
    const response = await recoverPrivateDie({ label, faces });
    assertProgressionAuthorityFence();
    if (!response) return null;
    actual = response.actual;
    if (actual === undefined && !response.unrolled) return null;
  }
  if (actual === undefined) {
    pending.stage = 'rolling'; pending.rollKey = key;
    await pendingWrite(actor, pending);
    const result = await ospRoll(`1d${faces}`, { label, strictIntegers: true });
    assertProgressionAuthorityFence();
    if (result.cancelled) return null;
    actual = result.total;
  }
  if (!Number.isInteger(actual) || actual < 1 || actual > faces) throw new Error('Invalid health die');
  pending.rolls[key] = actual; pending.stage = 'ready';
  await pendingWrite(actor, pending);
  return actual;
}
function zeroSaveContext(actor, before) {
  const s = actor.system;
  return getSavingThrowTarget({ className: s.class, level: s.level, race: s.race, con: s.attributes?.con?.value, wis: s.attributes?.wis?.value, saveType: 'death', magical: false, situationalBonus: conditionEffects(before).savePenalty });
}
async function publish(actor, pending) {
  if (!ChatMessage?.create) throw new Error('Chat unavailable');
  if (Array.from(game.messages?.values?.() ?? game.messages ?? []).some(message => message.flags?.[SCOPE]?.healthOperation === pending.operationId && message.author?.isGM)) return;
  assertProgressionAuthorityFence();
  const after = pending.after;
  const effects = conditionEffects(after);
  const content = `<p>${esc(actor.name)} — ${esc(pending.command.action)}: ${pending.before.hp} → ${after.hp} HP.</p>${after.dead ? '<p>Dead. Ordinary healing cannot revive this character.</p>' : ''}${after.bleed ? `<p>Bleed-out: ${after.bleed.remaining} rounds remaining. Exclude the falling round; decrement at the end of each subsequent round. Stabilize with a Healer’s Kit (one action, within reach) or heal magically.</p>` : ''}${after.zeroIncapacitated ? '<p>Incapacitated at 0 HP; recovery requires at least 1 HP. Stabilization leaves HP unchanged.</p>' : ''}${effects.cannotAct ? '<p>Cannot attack or cast. Apply the listed condition movement and saving-throw restrictions.</p>' : ''}${pending.rolls.save !== undefined ? `<p>Zero-HP death save: ${pending.rolls.save} vs ${pending.saveTarget}; ${pending.rolls.saveSuccess ? 'survived' : 'failed'}.</p>` : ''}<p>GM: manage health and conditions through the DM’s Toolkit. Separate injuries keep their own recovery requirements.</p>`;
  const card = { speaker: ChatMessage.getSpeaker?.({ actor }), content, flags: { [SCOPE]: { healthOperation: pending.operationId } } };
  ChatMessage.applyRollMode(card, pending.rollMode ?? 'publicroll');
  if (pending.rollMode === 'selfroll') card.whisper = [getProgressionRequester().id];
  else if (pending.rollMode === 'gmroll') card.whisper = [...new Set([...(card.whisper ?? []), getProgressionRequester().id])];
  await ChatMessage.create(card);
}
async function commit(actor, pending) {
  const already = flag(actor, 'healthLastOperation') === pending.operationId;
  if (!already) {
    if (!same(healthSnapshot(actor), pending.before)) throw new Error('Health changed during operation; GM review required');
    assertProgressionAuthorityFence();
    const update = { [hpPath(actor)]: pending.after.hp, [`flags.${SCOPE}.healthState`]: pending.after, [`flags.${SCOPE}.healthHistory`]: pending.command.action === 'undo' ? null : { operationId: pending.operationId, before: pending.before, after: pending.after }, [`flags.${SCOPE}.healthLastOperation`]: pending.operationId, [`flags.${SCOPE}.healthPending`]: pending };
    try { await actor.update(update); } catch (error) { if (flag(actor, 'healthLastOperation') !== pending.operationId) throw error; }
    if (flag(actor, 'healthLastOperation') !== pending.operationId) throw new Error('Health commit not acknowledged');
  }
  assertProgressionAuthorityFence();
  await publish(actor, pending);
  await pendingWrite(actor, null);
  return { success: true };
}
async function mutate(details) {
  const actor = await fromUuid(details.actorUuid), user = getProgressionRequester();
  if (!actor || !user || !(user.isGM || actor.testUserPermission(user, 'OWNER'))) return refused('An owned actor or GM is required.');
  const command = details.command;
  if (!command || !['damage', 'heal', 'setHP', 'naturalHealing', 'stabilize', 'condition', 'advanceRound', 'zeroResult', 'undo'].includes(command.action)) return refused('Unknown health operation.');
  if (['condition', 'advanceRound', 'zeroResult', 'undo', 'naturalHealing'].includes(command.action) && !user.isGM) return refused('Only the GM may perform this health operation.');
  const operationId = currentProgressionOperation();
  let pending = flag(actor, 'healthPending');
  if (pending && pending.operationId !== operationId) return refused('A pending health change must be recovered first.');
  if (pending?.stage === 'planned') return commit(actor, pending);
  if (!pending && flag(actor, 'healthLastOperation') === operationId) return { success: true };
  if (!pending) {
    const before = healthSnapshot(actor);
    if (command.action === 'setHP') {
      if (!['number', 'string'].includes(typeof command.value) || (typeof command.value === 'string' && command.value.trim() === '')) return refused('HP must be a whole number.');
      const value = Number(command.value);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value > before.maxHp) return refused('HP must be a whole number at or below maximum HP.');
    }
    if (command.action === 'zeroResult' && (before.hp !== 0 || before.dead || before.zeroIncapacitated || before.bleed)) return refused('Only an unresolved zero-HP state requires a death save.');
    if (command.action === 'stabilize') {
      if (before.hp !== 0 || !before.zeroIncapacitated || before.dead) return refused('Kit stabilization here requires a living, Incapacitated character at zero HP.');
      if (command.confirmed !== true) return refused('Confirm one combat action, the kit and patient within reach, and kit supplies.');
      const healer = command.healerUuid ? await fromUuid(command.healerUuid) : actor;
      if (!healer || !(user.isGM || healer.testUserPermission(user, 'OWNER'))) return refused('An owned healer is required.');
      const kit = Array.from(healer.items?.values?.() ?? healer.items ?? []).find(item => ['item', 'container'].includes(item.type) && item.name === "Healer's Kit" && normalizeQuantity(item.system?.quantity) > 0);
      if (!kit) return refused('The healer requires an available physical Healer’s Kit.');
      if (conditionEffects(healthSnapshot(healer)).helpless || healthSnapshot(healer).dead) return refused('An unconscious or dead healer cannot stabilize someone.');
    }
    if (command.action === 'naturalHealing' && command.confirmed !== true) return refused('Confirm a qualifying day of natural healing.');
    if (command.action === 'undo') {
      const history = flag(actor, 'healthHistory');
      if (!history || !same(before, history.after)) return refused('Only the latest unchanged health operation can be undone.');
      pending = { operationId, rollMode: details.rollMode, command, before, after: history.before, rolls: {}, stage: 'planned' };
      await pendingWrite(actor, pending); return commit(actor, pending);
    }
    const round = Number(game.combat?.round) || 0;
    pending = { operationId, rollMode: details.rollMode, command: clone(command), before, rolls: {}, stage: 'ready', combatId: game.combat?.id ?? 'manual', round, conModifier: getAbilityModifier(actor.system.attributes?.con?.value ?? 10), saveTarget: zeroSaveContext(actor, before) };
    // Reject invalid requests before prompting for any die.
    if (command.action === 'naturalHealing') planHealthChange(before, { ...command, conModifier: pending.conModifier }, { healing: 1 });
    else if (command.action !== 'zeroResult') planHealthChange(before, command);
    await pendingWrite(actor, pending);
  } else pending = clone(pending);
  if (!same(healthSnapshot(actor), pending.before)) throw new Error('Health changed during operation');
  let after;
  if (pending.command.action === 'naturalHealing') {
    const rolled = await die(actor, pending, 'healing', 4, 'Natural healing: 1d4 plus CON, minimum 1');
    if (rolled === null) return pendingResult();
    after = planHealthChange(pending.before, { ...pending.command, conModifier: pending.conModifier }, pending.rolls);
  } else after = pending.command.action === 'zeroResult' ? clone(pending.before) : planHealthChange(pending.before, pending.command);
  if ((after.needsDeathSave || pending.command.action === 'zeroResult') && actor.type === 'character') {
    if (after.hp !== 0 || after.dead) return refused('A zero-HP death save requires a living character at exactly zero.');
    const save = await die(actor, pending, 'save', 20, 'Zero HP: Save vs Death');
    if (save === null) return pendingResult();
    pending.rolls.saveSuccess = save !== 1 && (save === 20 || save >= pending.saveTarget);
    if (pending.rolls.saveSuccess && await die(actor, pending, 'bleed', 4, 'Bleed-out duration: d4 plus 1 rounds') === null) return pendingResult();
    after = planHealthChange(after, { action: 'zeroResult', round: pending.round, combatId: pending.combatId }, pending.rolls);
  } else if (actor.type !== 'character') after.needsDeathSave = false;
  if (same(after, pending.before)) { await pendingWrite(actor, null); return { success: true, unchanged: true }; }
  pending.after = after; pending.stage = 'planned';
  await pendingWrite(actor, pending);
  return commit(actor, pending);
}
export function registerHealthAuthority() {
  registerProgressionAuthority('health.mutate', async details => { try { return await mutate(details); } catch (error) { const actor = await fromUuid(details.actorUuid); return { success: false, recoveryRequired: Boolean(actor?.getFlag?.(SCOPE, 'healthPending')), reason: error.message }; } });
}
export async function changeHealth(actor, command, operationId = null) {
  const beforeHP = healthSnapshot(actor).hp;
  const result = await requestProgressionMutation('health.mutate', { actorUuid: actor.uuid, command, rollMode: game.settings.get('core', 'rollMode') ?? 'publicroll' }, operationId);
  // HP stays on the permission-scoped actor and chat card, never in world receipts.
  const history = flag(actor, 'healthHistory');
  return result.success ? { ...result, beforeHP: history?.operationId === result.operationId ? history.before.hp : beforeHP, afterHP: healthSnapshot(actor).hp } : result;
}
export function registerHealthRoundHook() {
  Hooks.on('updateCombat', (combat, changed) => {
    if (!Object.hasOwn(changed, 'round') || !game.user?.isGM || game.user.id !== game.users.activeGM?.id || combat.round < 1) return;
    const actors = new Map(Array.from(combat.combatants).filter(c => c.actor).map(c => [c.actor.uuid, c.actor]));
    for (const actor of actors.values()) {
      const state = healthSnapshot(actor);
      if (state.bleed?.combatId !== combat.id || combat.round - 1 <= state.bleed.lastRound) continue;
      void changeHealth(actor, { action: 'advanceRound', combatId: combat.id, round: combat.round - 1 }).then(result => { if (!result.success) ui.notifications.warn(`${actor.name}: ${result.reason}`); });
    }
  });
}
