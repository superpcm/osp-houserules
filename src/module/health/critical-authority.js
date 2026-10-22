import { lookupCritical, criticalFollowup } from '../combat/critical-rules.js';
import { noncombatHouseRules } from '../actor/noncombat.js';
import { recoverPrivateDie, escapeNoncombatHTML as esc } from '../actor/noncombat-prompts.js';
import { getAbilityModifier } from '../../config/classes.js';
import { ospRoll } from '../dice.js';
import { registerProgressionAuthority, requestProgressionMutation, currentProgressionOperation, getProgressionRequester, assertProgressionAuthorityFence } from '../progression/progression-authority.js';
const SCOPE = 'osp-houserules';
const clone = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function persist(actor, pending) {
  assertProgressionAuthorityFence();
  try { await actor.update({ [`flags.${SCOPE}.criticalPending`]: pending }); }
  catch (error) { if (!same(actor.getFlag(SCOPE, 'criticalPending'), pending)) throw error; }
  assertProgressionAuthorityFence();
  if (!same(actor.getFlag(SCOPE, 'criticalPending'), pending)) throw new Error('Critical record not acknowledged');
}
async function rollStep(actor, pending, name) {
  if (pending.rolls[name] !== undefined) return pending.rolls[name];
  let actual;
  if (pending.stage === 'rolling') {
    if (pending.rollKey !== name) throw new Error('Unexpected pending critical die');
    const answer = await recoverPrivateDie({ label: `Critical table: ${name}`, faces: 100 });
    assertProgressionAuthorityFence();
    if (!answer) return null;
    actual = answer.actual;
    if (actual === undefined && !answer.unrolled) return null;
  }
  if (actual === undefined) {
    pending.stage = 'rolling'; pending.rollKey = name; await persist(actor, pending);
    const result = await ospRoll('1d100', { strictIntegers: true, label: `Critical table: ${name}` });
    assertProgressionAuthorityFence();
    if (result.cancelled) return null;
    actual = result.total;
  }
  if (!Number.isInteger(actual) || actual < 1 || actual > 100) throw new Error('Invalid critical die');
  pending.rolls[name] = actual; pending.stage = 'ready'; await persist(actor, pending);
  return actual;
}
async function execute(details) {
  const actor = await fromUuid(details.actorUuid), user = getProgressionRequester();
  if (!actor || !user || !(user.isGM || actor.testUserPermission(user, 'OWNER'))) return { success: false, reason: 'An owned actor or GM is required.' };
  if (!['hit', 'miss', 'minor', 'major'].includes(details.table)) return { success: false, reason: 'Unknown critical table.' };
  const operationId = currentProgressionOperation();
  let pending = actor.getFlag(SCOPE, 'criticalPending');
  if (pending && pending.operationId !== operationId) return { success: false, reason: 'Recover the pending critical result first.' };
  const completed = actor.getFlag(SCOPE, 'criticalLastResult');
  if (!pending && completed?.operationId === operationId) return { success: true, rerollOnes: completed.result.rerollOnes };
  if (!pending) {
    pending = { operationId, rollMode: details.rollMode, table: details.table, rolls: {}, stage: 'ready', meleeBonus: getAbilityModifier(actor.system.attributes?.str?.value ?? 10) };
    await persist(actor, pending);
  } else pending = clone(pending);
  const house = await noncombatHouseRules();
  const raw = await rollStep(actor, pending, pending.table);
  if (raw === null) return { success: false, recoveryRequired: true, reason: 'Critical roll pending GM recovery; do not repeat the attack.' };
  const entry = lookupCritical(house, pending.table, raw);
  const followup = pending.table === 'hit' ? criticalFollowup(raw) : {};
  let injury = null;
  if (followup.injuryTable) {
    const injuryDie = await rollStep(actor, pending, followup.injuryTable);
    if (injuryDie === null) return { success: false, recoveryRequired: true, reason: 'Injury roll pending GM recovery; do not repeat the attack.' };
    injury = lookupCritical(house, followup.injuryTable, injuryDie, followup.addMelee ? pending.meleeBonus : 0);
  }
  const result = { success: true, table: pending.table, roll: raw, entry, injury, rerollOnes: Boolean(followup.rerollOnes) };
  const exists = Array.from(game.messages?.values?.() ?? game.messages ?? []).some(message => message.author?.isGM && message.flags?.[SCOPE]?.criticalOperation === operationId);
  if (!exists) {
    assertProgressionAuthorityFence();
    const content = `<p>${esc(actor.name)} — ${esc(pending.table)} table: ${raw}</p><p>${esc(entry.effect)}</p>${injury ? `<p>${esc(injury.injury)}: ${esc(injury.effect)} (adjusted result ${injury.adjusted})</p>` : ''}<p>GM adjudication: ${esc(house.critical_hits.injury_note)} Apply movement, saves, dropped/broken equipment, extra attacks, injury bleeding and durations manually. Manage conditions, damage and reminders through the DM’s Toolkit. A temporary Incapacitated result does not start the zero-HP bleed-out timer.</p>`;
    const card = { speaker: ChatMessage.getSpeaker?.({ actor }), content, flags: { [SCOPE]: { criticalOperation: operationId, criticalResult: result } } };
    ChatMessage.applyRollMode(card, pending.rollMode ?? 'publicroll');
    if (pending.rollMode === 'selfroll') card.whisper = [getProgressionRequester().id];
    else if (pending.rollMode === 'gmroll') card.whisper = [...new Set([...(card.whisper ?? []), getProgressionRequester().id])];
    await ChatMessage.create(card);
  }
  assertProgressionAuthorityFence();
  const record = { operationId, result };
  try { await actor.update({ [`flags.${SCOPE}.criticalLastResult`]: record, [`flags.${SCOPE}.criticalPending`]: null }); }
  catch (error) { if (!same(actor.getFlag(SCOPE, 'criticalLastResult'), record)) throw error; }
  return { success: true, rerollOnes: result.rerollOnes };
}
export function registerCriticalAuthority() {
  registerProgressionAuthority('health.critical', async details => { try { return await execute(details); } catch (error) { return { success: false, recoveryRequired: true, reason: error.message }; } });
}
export async function rollCritical(actor, table, operationId = null) {
  const result = await requestProgressionMutation('health.critical', { actorUuid: actor.uuid, table, rollMode: game.settings.get('core', 'rollMode') ?? 'publicroll' }, operationId);
  const record = actor.getFlag(SCOPE, 'criticalLastResult');
  return result.success && record?.operationId === result.operationId ? { ...record.result, ...result } : result;
}
