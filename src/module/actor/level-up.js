/**
 * @file Hit Die rolling on level-up.
 *
 * First level uses maximum HD plus CON. Later named-HD levels roll plus CON
 * (minimum 1); post-named-HD levels add the exact table's fixed gain without CON.
 * Existing accumulated HP is authoritative and no gains occur beyond racial/class caps.
 */

import { getHitDieMax, getAbilityModifier } from "../../config/classes.js";
import { getLevelHitPointGain, getMaximumLevel } from "../../config/progression.js";
import { ospRoll } from "../dice.js";
import { registerProgressionAuthority, requestProgressionMutation, assertProgressionAuthorityFence } from "../progression/progression-authority.js";
import { createLevelUpState, normalizeLevelUpState, markLevelClaimed, markLevelCommitted, levelMarker, isLevelCommitted, skillCreditForLevel, validateSkillAllocation } from './level-up-state.js';
import { SKILL_POINT_CONFIG } from '../dialog/skill-point-dialog.js';

const SYSTEM_ID = () => game?.system?.id || 'osp-houserules';
const localFlights = new Map();
const clone = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const activeGM = () => Boolean(game?.user?.isGM && game?.users?.activeGM?.id === game.user.id);
const actorFor = details => { const actor = game?.actors?.get?.(details?.actorId); return actor?.type === 'character' && (!details.actorUuid || actor.uuid === details.actorUuid) ? actor : null; };
const flagState = actor => actor?.getFlag?.(SYSTEM_ID(), 'levelUpState') || actor?.system?.levelUpState;
const randomId = () => globalThis.foundry?.utils?.randomID?.() || globalThis.crypto?.randomUUID?.() || `level-${Date.now()}`;

async function updateActor(actor, changes, options) {
  assertProgressionAuthorityFence();
  const applied = () => Object.entries(changes).every(([key, value]) => {
    const actual = key.startsWith('system.') ? actor.system[key.slice(7)] : actor.getFlag?.(SYSTEM_ID(), key.split('.').at(-1));
    return JSON.stringify(actual) === JSON.stringify(value);
  });
  try { await actor.update(changes, options); }
  catch (error) { if (!applied()) throw error; }
  if (!applied()) throw new Error('Progression actor write was not acknowledged.');
}

function actorOwner(actor) {
  const owners = [...(game?.users?.contents || game?.users || [])].filter(user => user.active && !user.isGM && actor?.testUserPermission?.(user, 'OWNER'));
  return (owners.sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || game?.users?.activeGM || game?.user)?.id;
}

function levelTarget(actor, requested) {
  return Math.min(Math.floor(Number(requested) || Number(actor?.system?.level) || 1), Math.floor(Number(actor?.system?.level) || 1), getMaximumLevel(actor?.system?.class || '', actor?.system?.race || ''));
}

function getRollCache(token) {
  try { return JSON.parse(globalThis.sessionStorage?.getItem(`osp-level-roll:${token}`) || 'null'); } catch (_) { return null; }
}
function setRollCache(token, value) { try { globalThis.sessionStorage?.setItem(`osp-level-roll:${token}`, JSON.stringify(value)); } catch (_) {} }

function requireAuthority(actor, message, allowPrepare = false) {
  if (!activeGM()) return false;
  const requester = game?.users?.get?.(message?.userId || game.user.id);
  if (requester?.isGM) return true;
  return Boolean(requester?.active && actor?.testUserPermission?.(requester, 'OWNER') && (allowPrepare || actorOwner(actor) === requester.id));
}

async function prepareLevel(details = {}, message = {}) {
  const actor = actorFor(details); if (!actor) return { success: false, reason: 'Actor unavailable.' };
  if (!requireAuthority(actor, message, true)) return { success: false, retryable: true, reason: 'Requester is not authorized for this actor.' };
  const target = levelTarget(actor, details.targetLevel);
  const recorded = actor.getFlag?.(SYSTEM_ID(), 'lastKnownLevel');
  const receipt = details.sourceAwardId ? actor.getFlag?.(SYSTEM_ID(), 'xpAwardReceipts')?.[details.sourceAwardId] : null;
  const from = Number(recorded ?? receipt?.levelBefore ?? actor.system.level ?? 1);
  if (!Number.isSafeInteger(from) || from < 1) return { success: false, reason: 'Recorded level baseline is invalid.' };
  if (target <= from) return { success: true, noop: true, state: flagState(actor) };
  const existing = flagState(actor);
  if (existing?.status === 'pending' || existing?.status === 'claimed') {
    if (target <= Number(existing.targetLevel)) return { success: true, state: existing, replay: true };
    const extended = { ...existing, targetLevel: target, status: 'pending' };
    await updateActor(actor, { [`flags.${SYSTEM_ID()}.levelUpState`]: extended }, { ospLevelUp: true });
    return { success: true, state: extended, extended: true };
  }
  const state = createLevelUpState({ generation: Number(existing?.generation || 0) + 1, fromLevel: Math.min(from, target), targetLevel: target });
  await updateActor(actor, { [`flags.${SYSTEM_ID()}.levelUpState`]: state }, { ospLevelUp: true });
  return { success: true, state };
}

async function claimLevel(details = {}, message = {}) {
  const actor = actorFor(details); if (!actor) return { success: false, reason: 'Actor unavailable.' };
  if (!requireAuthority(actor, message)) return { success: false, retryable: true, reason: 'Requester is not the elected active owner.' };
  const state = normalizeLevelUpState(flagState(actor)); const level = Number(details.level ?? state.nextLevel);
  if (isLevelCommitted(state, level)) return { success: true, replay: true, marker: levelMarker(state, level) };
  const ownerId = actorOwner(actor);
  if (!Number.isSafeInteger(level) || level !== state.nextLevel || level > state.targetLevel || level > levelTarget(actor, state.targetLevel)) return { success: false, reason: 'Level-up request is out of order.' };
  if (state.pendingClaim?.level === level && state.pendingClaim.ownerId === ownerId && levelMarker(state, level)?.status === 'claimed') return { success: true, replay: true, claimToken: state.pendingClaim.claimToken, ownerId, state };
  if (details.ownerId && details.ownerId !== ownerId) return { success: false, reason: 'Requester is not the elected active owner.' };
  const claimToken = randomId();
  const next = markLevelClaimed(state, level, { claimToken, ownerId });
  await updateActor(actor, { [`flags.${SYSTEM_ID()}.levelUpState`]: next }, { ospLevelUp: true });
  return { success: true, claimToken, ownerId, state: next };
}

async function commitHP(details = {}, message = {}) {
  const actor = actorFor(details); if (!actor) return { success: false, reason: 'Actor unavailable.' };
  if (!requireAuthority(actor, message)) return { success: false, retryable: true, reason: 'Requester is not the elected active owner.' };
  const state = normalizeLevelUpState(flagState(actor)); const level = Number(details.level); const marker = levelMarker(state, level);
  if (isLevelCommitted(state, level)) return { success: true, replay: true, marker };
  if (!marker || marker.status !== 'claimed' || marker.claimToken !== details.claimToken || marker.ownerId !== details.ownerId || marker.ownerId !== actorOwner(actor) || level !== state.nextLevel) return { success: false, reason: 'Invalid or expired level-up claim.' };
  const cap = getMaximumLevel(actor.system?.class || '', actor.system?.race || '');
  if (!Number.isSafeInteger(level) || level > cap || level > state.targetLevel || level > levelTarget(actor, state.targetLevel)) return { success: false, reason: 'Level exceeds approved cap.' };
  const fixed = getLevelHitPointGain(actor.system?.class || '', level);
  const die = getHitDieMax(actor.system?.class || ''); const con = getAbilityModifier(actor.system?.attributes?.con?.value);
  const expected = fixed === null ? { min: Math.max(1, 1 + con), max: Math.max(1, die + con) } : { min: fixed, max: fixed };
  const hp = Number(details.hp); if (!Number.isInteger(hp) || hp < expected.min || hp > expected.max) return { success: false, reason: 'HP result is outside the approved formula.' };
  const oldHP = Number(actor.system?.maxhitpoints); if (actor.system?.maxhitpoints === null || actor.system?.maxhitpoints === undefined || actor.system?.maxhitpoints === '' || !Number.isSafeInteger(oldHP) || oldHP < 0) return { success: false, manualRepair: true, reason: 'Existing max HP is missing.' };
  const credit = skillCreditForLevel(SKILL_POINT_CONFIG[actor.system?.class || ''], level);
  const committed = markLevelCommitted(state, level, { grantedHP: hp, skillCredit: credit, receiptId: details.receiptId || message.operationId });
  const pending = Number(actor.getFlag?.(SYSTEM_ID(), 'pendingSkillPoints') || 0) + credit;
  if (!Number.isSafeInteger(oldHP + hp) || !Number.isSafeInteger(pending) || pending < 0) return { success: false, manualRepair: true, reason: 'HP or skill pool is invalid.' };
  const config = SKILL_POINT_CONFIG[actor.system?.class || ''];
  const fraction = config ? (config.startPoints + config.rate * (level - 1)) % 1 : 0;
  const poolVersion = Number(actor.getFlag?.(SYSTEM_ID(), 'skillPoolVersion') || 0);
  await updateActor(actor, { 'system.maxhitpoints': oldHP + hp, [`flags.${SYSTEM_ID()}.skillPointFraction`]: fraction, [`flags.${SYSTEM_ID()}.skillPoolVersion`]: poolVersion + 1, [`flags.${SYSTEM_ID()}.pendingSkillPoints`]: pending, [`flags.${SYSTEM_ID()}.levelUpState`]: committed, [`flags.${SYSTEM_ID()}.lastKnownLevel`]: level }, { ospLevelUp: true });
  return { success: true, grantedHP: hp, skillCredit: credit, state: committed };
}

async function releaseLevel(details = {}, message = {}) {
  const actor = actorFor(details); if (!actor) return { success: false, reason: 'Actor unavailable.' };
  if (!requireAuthority(actor, message)) return { success: false, retryable: true, reason: 'Requester is not authorized to release this claim.' };
  const state = normalizeLevelUpState(flagState(actor));
  if (!state.pendingClaim || state.pendingClaim.claimToken !== details.claimToken) return { success: false, reason: 'Invalid claim token.' };
  state.pendingClaim = null; state.status = 'pending';
  const level = Number(details.level || state.nextLevel); if (state.levels[String(level)]?.status === 'claimed') delete state.levels[String(level)];
  await updateActor(actor, { [`flags.${SYSTEM_ID()}.levelUpState`]: state }, { ospLevelUp: true });
  return { success: true, state };
}

async function allocateSkill(details = {}, message = {}) {
  const actor = actorFor(details); if (!actor) return { success: false, reason: 'Actor unavailable.' };
  if (!requireAuthority(actor, message)) return { success: false, retryable: true, reason: 'Requester is not the elected active owner.' };
  const config = SKILL_POINT_CONFIG[actor.system?.class || '']; if (!config) return { success: false, reason: 'Class has no skill pool.' };
  const allocationId = details.allocationId || message.operationId;
  if (allocationId !== message.operationId) return { success: false, reason: 'Skill allocation ID does not match its request.' };
  const receipts = actor.getFlag?.(SYSTEM_ID(), 'skillAllocationReceipts') || {};
  if (receipts[allocationId]) return { success: true, replay: true, ...receipts[allocationId] };
  const poolVersion = Number(actor.getFlag?.(SYSTEM_ID(), 'skillPoolVersion') || 0);
  if (!Number.isSafeInteger(details.poolVersion) || details.poolVersion !== poolVersion) return { success: false, reason: 'Skill pool changed; reopen allocation.' };
  const current = Object.fromEntries(config.skills.map(skill => [skill, Number(actor.system?.[skill]) || 1]));
  const pool = Number(actor.getFlag?.(SYSTEM_ID(), 'pendingSkillPoints') || 0);
  const result = validateSkillAllocation({ skills: config.skills, current, allocation: details.allocation, pool });
  if (!result.ok) return { success: false, reason: result.reason };
  const receipt = { spent: result.spent, remaining: result.remaining, values: result.values, allocationId };
  const update = { [`flags.${SYSTEM_ID()}.pendingSkillPoints`]: result.remaining, [`flags.${SYSTEM_ID()}.skillPoolVersion`]: poolVersion + 1, [`flags.${SYSTEM_ID()}.skillAllocationReceipts`]: { ...receipts, [allocationId]: receipt } };
  for (const [skill, value] of Object.entries(result.values)) update[`system.${skill}`] = String(value);
  await updateActor(actor, update, { ospSkillAllocation: true });
  return { success: true, ...receipt };
}

export function registerLevelUpAuthority() {
  registerProgressionAuthority('level.prepare', prepareLevel);
  registerProgressionAuthority('level.claim', claimLevel);
  registerProgressionAuthority('level.commitHP', commitHP);
  registerProgressionAuthority('level.release', releaseLevel);
  registerProgressionAuthority('skill.allocate', allocateSkill);
  registerProgressionAuthority('level.migrate', async (details, message) => {
    if (!game.users.get(message.userId)?.isGM) return { success: false, reason: 'Only a GM may migrate progression.' };
    return migrateActor(actorFor(details));
  });
}

export async function processLevelUp(actor, { sourceAwardId = null, fromLevel = null, targetLevel = null } = {}) {
  if (!actor || !actor.id) return { success: false, reason: 'Actor unavailable.' };
  if (game?.user?.id && actorOwner(actor) !== game.user.id) return { success: false, reason: 'Only the elected active owner may resume level-up.' };
  if (localFlights.has(actor.id)) return localFlights.get(actor.id);
  const run = async () => {
    const existing = normalizeLevelUpState(flagState(actor), { fromLevel: Number(actor.getFlag?.(SYSTEM_ID(), 'lastKnownLevel') ?? actor.system.level ?? 1), targetLevel: Number(actor.getFlag?.(SYSTEM_ID(), 'lastKnownLevel') ?? actor.system.level ?? 1) });
    const receiptLevel = sourceAwardId ? actor.getFlag?.(SYSTEM_ID(), 'xpAwardReceipts')?.[sourceAwardId]?.levelBefore : null;
    const from = existing.status === 'pending' || existing.status === 'claimed' ? existing.nextLevel - 1 : fromLevel ?? Number(receiptLevel || actor.getFlag?.(SYSTEM_ID(), 'lastKnownLevel') || actor.system?.level || 1);
    const requestedTarget = levelTarget(actor, targetLevel ?? actor.system?.level);
    const target = existing.status === 'pending' || existing.status === 'claimed' ? Math.max(existing.targetLevel, requestedTarget) : requestedTarget;
    if (target <= from) return { success: true, noop: true, state: existing };
    const prepared = (existing.status === 'pending' || existing.status === 'claimed') && target === existing.targetLevel
      ? { success: true, state: existing }
      : await requestProgressionMutation('level.prepare', { actorId: actor.id, sourceAwardId, fromLevel: from, targetLevel: target });
    if (!prepared?.success || prepared.noop) return prepared;
    const preparedState = normalizeLevelUpState(prepared.state);
    const firstLevel = preparedState.nextLevel;
  for (let level = firstLevel; level <= target; level += 1) {
    const claim = await requestProgressionMutation('level.claim', { actorId: actor.id, level, ownerId: game?.user?.id });
    if (!claim?.success) return claim;
    if (claim.marker?.status === 'committed') continue;
    const fixed = getLevelHitPointGain(actor.system.class || '', level);
    const token = claim.claimToken; const cached = getRollCache(token);
    let result = cached;
    if (!result) {
      if (fixed === null) {
        const die = getHitDieMax(actor.system.class || ''); const con = getAbilityModifier(actor.system.attributes?.con?.value); const mod = con > 0 ? `+${con}` : con < 0 ? `${con}` : '';
        const rolled = await ospRoll(`1d${die}${mod}`, { label: `${actor.name} — Hit Die (Level ${level})` });
        if (rolled?.cancelled) { await requestProgressionMutation('level.release', { actorId: actor.id, level, claimToken: token }); return { success: false, cancelled: true }; }
        result = { hp: Math.max(1, Number(rolled.total)), roll: rolled };
      } else result = { hp: fixed, fixed: true };
      setRollCache(token, result);
    }
    const committed = await requestProgressionMutation('level.commitHP', { actorId: actor.id, level, ownerId: claim.ownerId, claimToken: token, hp: result.hp, sourceAwardId });
    if (!committed?.success) return committed;
    if (!isLevelCommitted(normalizeLevelUpState(flagState(actor)), level)) await actor.reload?.();
  }
    return { success: true, state: flagState(actor) };
  };
  const promise = (globalThis.window && !globalThis.navigator?.locks)
    ? Promise.resolve({ success: false, retryable: true, reason: 'This browser cannot safely coordinate level-up ownership.' })
    : globalThis.navigator?.locks?.request
      ? globalThis.navigator.locks.request(`osp-level-up:${actor.id}`, { ifAvailable: true }, lock => lock ? run() : ({ success: false, retryable: true, reason: 'Another tab owns this actor level-up.' }))
      : run();
  localFlights.set(actor.id, promise);
  try { return await promise; } finally { localFlights.delete(actor.id); }
}

export async function resumeLevelUp(actor) { return processLevelUp(actor, {}); }

/** Initialize legacy actors at their current derived level without rerolling historical HP. */
async function migrateActor(actor) {
  if (!activeGM()) return { success: false, reason: 'Only the active GM may migrate progression state.' };
  if (!actor) return { success: false, reason: 'Actor unavailable.' };
  if (flagState(actor)) return { success: true, migrated: false, state: flagState(actor) };
  const level = Math.max(1, Math.floor(Number(actor.system?.level) || 1));
  const state = { ...createLevelUpState({ fromLevel: level, targetLevel: level }), status: 'complete' };
  await updateActor(actor, { [`flags.${SYSTEM_ID()}.levelUpState`]: state, [`flags.${SYSTEM_ID()}.lastKnownLevel`]: level }, { ospLevelUpMigration: true, render: false });
  return { success: true, migrated: true, state };
}

/**
 * Roll (virtual or manual, per the player's usual dice-mode settings) a Hit Die for each level
 * gained between fromLevel (exclusive) and toLevel (inclusive), skipping level 1 since that's
 * covered by the banked baseline rather than a roll. Posts each roll to chat and accumulates
 * the result into system.maxhitpoints.
 *
 * @param {import('./actor.js').OspActor} actor
 * @param {number} fromLevel - the actor's last-known level before this XP change
 * @param {number} toLevel - the actor's new level after this XP change
 */
export async function handleLevelUp(actor, fromLevel, toLevel) {
  return processLevelUp(actor, { fromLevel, targetLevel: toLevel });
}

export function migrateLevelUpState(actor) { return requestProgressionMutation('level.migrate', { actorId: actor.id, actorUuid: actor.uuid }, `level-migrate-v1-${actor.id}`); }
