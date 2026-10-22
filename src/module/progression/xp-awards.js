import { calculateXPModifier } from "../../config/classes.js";
import { registerProgressionAuthority, requestProgressionMutation, recoverProgressionOperation, assertProgressionAuthorityFence, getProgressionRequester } from "./progression-authority.js";

export const XP_LEDGER_SETTING = "xpAwardLedger";
export const PARTY_REMAINDER_SETTING = "partyXPRemainder";
const systemId = () => game.system.id;
const clone = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const getSetting = key => clone(game.settings?.get?.(systemId(), key) ?? (key === PARTY_REMAINDER_SETTING ? 0 : {}));
const setSetting = async (key, value) => {
  assertProgressionAuthorityFence();
  try { await game.settings.set(systemId(), key, clone(value)); }
  catch (error) { if (JSON.stringify(getSetting(key)) !== JSON.stringify(value)) throw error; }
  if (JSON.stringify(getSetting(key)) !== JSON.stringify(value)) throw new Error('XP journal write was not acknowledged.');
};
const attrs = actor => actor?.system?.attributes ?? actor?.system?.abilities ?? {};
const actorXP = actor => Number(String(actor?.system?.xp ?? 0).replaceAll(",", ""));
const roundHalfUp = value => Math.floor(value + 0.5);
const activeGM = () => Boolean(game.user?.isGM && game.users?.activeGM?.id === game.user.id);
function actorFromRef(ref) { const uuid = ref?.actorUuid ?? ref?.uuid; const candidate = game.actors?.get?.(ref?.actorId ?? ref?.id); const resolved = uuid && globalThis.fromUuidSync?.(uuid); const actor = uuid ? (candidate?.uuid === uuid && (!resolved || resolved === candidate) ? candidate : null) : candidate; return actor?.type === "character" && game.actors?.get?.(actor.id) === actor ? actor : null; }
function reference(actor) { return { actorId: actor.id, actorUuid: actor.uuid, name: actor.name, class: actor.system?.class ?? "", race: actor.system?.race ?? "" }; }
function partyMember(actor, party) { if (!party) return true; if (Array.isArray(party)) return party.some(p => (p?.id ?? p?.actorId) === actor.id || p === actor); if (party.members) return partyMember(actor, party.members); return actor.getFlag?.(systemId(), "party") === true; }
export function calculateXPAward({ amount, actors = [], party = true, remainder = 0 } = {}) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("XP award amount must be a positive safe integer.");
  if (party !== false && (!Number.isSafeInteger(remainder) || remainder < 0)) throw new Error('Saved XP remainder is invalid.');
  for (const actor of actors.filter(Boolean)) if (!Number.isSafeInteger(actorXP(actor)) || actorXP(actor) < 0) throw new Error('Existing XP is invalid.');
  const unique = [...new Map(actors.filter(Boolean).map(actor => [actor.id, actor])).values()].filter(actor => actor.type === "character" && partyMember(actor, party));
  if (!unique.length) throw new Error("XP award requires at least one character.");
  if (party === false) return { amount, actorCount: unique.length, baseShare: amount, remainderBefore: 0, remainderAfter: 0, entries: unique.map(actor => { const modifier = calculateXPModifier(actor.system?.class ?? "", attrs(actor)); const awarded = roundHalfUp(amount * (1 + modifier / 100)); return { actor: reference(actor), actorId: actor.id, baseShare: amount, modifier, awarded, before: actorXP(actor), after: actorXP(actor) + awarded, levelBefore: Number(actor.system?.level ?? 1) }; }) };
  const available = amount + (Number.isSafeInteger(remainder) && remainder >= 0 ? remainder : 0);
  if (!Number.isSafeInteger(available)) throw new Error("XP award plus saved remainder exceeds safe integer range.");
  const baseShare = Math.floor(available / unique.length), nextRemainder = available % unique.length;
  const entries = unique.map(actor => { const modifier = calculateXPModifier(actor.system?.class ?? "", attrs(actor)); const awarded = roundHalfUp(baseShare * (1 + modifier / 100)); return { actor: reference(actor), actorId: actor.id, baseShare, modifier, awarded, before: actorXP(actor), after: actorXP(actor) + awarded, levelBefore: Number(actor.system?.level ?? 1) }; });
  return { amount, actorCount: unique.length, baseShare, remainderBefore: remainder, remainderAfter: nextRemainder, entries };
}
const skillFields = ['assassination', 'climbSheer', 'listeningAtDoors', 'hideShadows', 'moveSilently', 'findTraps', 'openLocks', 'pickPockets', 'hideUndergrowth'];
function progressionSnapshot(actor) {
  return {
    class: actor.system.class, race: actor.system.race, maxHP: actor.system.maxhitpoints ?? null,
    skills: Object.fromEntries(skillFields.map(key => [key, actor.system[key] ?? null])),
    pendingSkillPoints: actor.getFlag?.(systemId(), 'pendingSkillPoints') ?? null,
    skillPointFraction: actor.getFlag?.(systemId(), 'skillPointFraction') ?? null,
    skillPoolVersion: actor.getFlag?.(systemId(), 'skillPoolVersion') ?? null,
    levelUpState: clone(actor.getFlag?.(systemId(), 'levelUpState') ?? null),
    lastKnownLevel: actor.getFlag?.(systemId(), 'lastKnownLevel') ?? null,
  };
}
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
async function updateActor(actor, changes, options, committed) {
  assertProgressionAuthorityFence();
  try { await actor.update(changes, options); }
  catch (error) { if (!committed()) throw error; }
  if (!committed()) throw new Error(`Actor write was not acknowledged for ${actor.name}.`);
}
async function executeXPAward(details, message = {}) {
  if (!activeGM() || !game.users?.get?.(message.userId ?? game.user.id)?.isGM) return { success: false, reason: "Only a GM may award XP." };
  if (!Number.isSafeInteger(details.amount) || details.amount <= 0) return { success: false, reason: "XP award amount must be a positive safe integer." };
  const refs = Array.isArray(details.actorRefs) ? [...new Map(details.actorRefs.map(ref => [ref.actorId ?? ref.id, ref])).values()] : [];
  const actors = refs.map(actorFromRef); if (actors.some(actor => !actor) || !actors.length) return { success: false, reason: "Every award actor must resolve to a world character." };
  const ledger = getSetting(XP_LEDGER_SETTING), id = details.awardId ?? message.operationId;
  if (id !== message.operationId || typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return { success: false, reason: "Invalid XP award ID." };
  const pending = Object.values(ledger).find(record => (record.status === "planned" || record.status === "undoing") && record.awardId !== id);
  if (pending) return { success: false, recoveryRequired: true, reason: `Pending XP award ${pending.awardId} must be recovered first.` };
  const existing = ledger[id]; if (existing?.status === "completed") return { ...existing.result, operationId: message.operationId, replay: true }; if (existing?.status === "planned" && existing.plan) { /* resume the durable plan below */ }
  const savedRemainder = Number(getSetting(PARTY_REMAINDER_SETTING));
  if (!Number.isSafeInteger(savedRemainder) || savedRemainder < 0) return { success: false, recoveryRequired: true, reason: "Saved XP remainder is invalid." };
  let plan = existing?.plan;
  if (!plan) {
    try { plan = calculateXPAward({ amount: details.amount, actors, party: details.party, remainder: details.party === false ? 0 : savedRemainder }); }
    catch (error) { return { success: false, reason: error.message }; }
  }
  if (plan.entries.some(entry => !Number.isSafeInteger(entry.after) || entry.after < 0)) return { success: false, reason: "XP result exceeds safe integer range." };
  if (!existing) {
    plan.party = details.party !== false;
    plan.actorSnapshots = actors.filter(actor => plan.entries.some(entry => entry.actorId === actor.id)).map(actor => ({ actorId: actor.id, ...progressionSnapshot(actor) }));
    ledger[id] = { awardId: id, createdAt: Date.now(), initiator: getProgressionRequester()?.id, amount: details.amount, party: plan.party, status: 'planned', plan };
    await setSetting(XP_LEDGER_SETTING, ledger);
  }
  if (existing && existing.status !== 'planned') return { success: false, reason: 'Award has already been undone or is being undone.' };
  if (plan.party && savedRemainder !== plan.remainderBefore && savedRemainder !== plan.remainderAfter) throw new Error('Party remainder changed; manual correction required.');
  for (const entry of plan.entries) {
    const actor = actors.find(candidate => candidate.id === entry.actorId); if (!actor) return { success: false, recoveryRequired: true, reason: `Unknown actor ${entry.actorId}.` };
    const current = actorXP(actor), receipts = actor.getFlag?.(systemId(), "xpAwardReceipts") ?? {}, prior = receipts[id];
    if (prior && prior.xpBefore === entry.before && prior.xpAfter === entry.after && prior.modifier === entry.modifier && prior.class === entry.actor.class && prior.race === entry.actor.race && current === entry.after) continue;
    if (prior) return { success: false, recoveryRequired: true, reason: `XP receipt conflict for ${entry.actor.name}.` };
    if (current !== entry.before) return { success: false, recoveryRequired: true, reason: `XP conflict for ${entry.actor.name}.` };
    const snapshot = plan.actorSnapshots?.find(candidate => candidate.actorId === entry.actorId) ?? entry.actor;
    await updateActor(actor, { "system.xp": entry.after, "flags.osp-houserules.xpAwardReceipts": { ...receipts, [id]: { awardId: id, levelBefore: snapshot?.levelBefore ?? entry.levelBefore ?? actor.system?.level ?? 1, xpBefore: entry.before, xpAfter: entry.after, modifier: entry.modifier, class: entry.actor.class, race: entry.actor.race, timestamp: Date.now() } } }, { ospXPAward: true, ospXPAmount: entry.awarded, ospXPAwardId: id, ospXPLevelBefore: entry.levelBefore }, () => {
      const written = actor.getFlag?.(systemId(), 'xpAwardReceipts')?.[id];
      return actorXP(actor) === entry.after && written?.xpBefore === entry.before && written?.xpAfter === entry.after;
    });
  }
  if (plan.party) await setSetting(PARTY_REMAINDER_SETTING, plan.remainderAfter);
  const result = { success: true, operationId: message.operationId, awardId: id, amount: plan.amount, entries: plan.entries, remainderBefore: plan.remainderBefore, remainderAfter: plan.remainderAfter };
  const latest = getSetting(XP_LEDGER_SETTING); latest[id] = { ...(latest[id] ?? {}), status: "completed", plan, result, completedAt: Date.now() }; await setSetting(XP_LEDGER_SETTING, latest); return result;
}
export function registerXPAwardAuthority() { registerProgressionAuthority("awardXP", executeXPAward); }
export async function awardXP({ amount, actorRefs, party = true, awardId = null } = {}) { if (!activeGM()) return requestProgressionMutation("awardXP", { amount, actorRefs, party, awardId }, awardId); return requestProgressionMutation("awardXP", { amount, actorRefs, party, awardId }, awardId); }
export function listXPAwards() { return Object.values(getSetting(XP_LEDGER_SETTING)); }
export async function recoverXPAward(id) { return recoverProgressionOperation(id); }
async function executeUndoXPAward({ id, reason = "" } = {}, message = {}) {
  if (!activeGM() || !game.users?.get?.(message.userId)?.isGM) return { success: false, reason: 'Only a GM may undo XP.' };
  const ledger = getSetting(XP_LEDGER_SETTING), record = ledger[id];
  if (record?.status === 'undone') return { success: true, awardId: id, undone: true, replay: true };
  if (!record?.plan || !['completed', 'undoing'].includes(record.status)) return { success: false, reason: 'Award is not undoable.' };
  const later = Object.values(ledger).some(item => item.awardId !== id && ['planned', 'completed', 'undoing'].includes(item.status) && item.createdAt >= record.createdAt);
  if (later) return { success: false, manualRepair: true, reason: 'Only the latest award can be undone; use manual GM correction.' };
  const actors = record.plan.entries.map(entry => actorFromRef(entry.actor));
  if (actors.some(actor => !actor)) throw new Error('Actor is unavailable for undo.');
  const remainder = getSetting(PARTY_REMAINDER_SETTING);
  if (record.plan.party && remainder !== record.plan.remainderAfter && !(record.status === 'undoing' && remainder === record.plan.remainderBefore)) return { success: false, manualRepair: true, reason: 'Party remainder changed; manual GM correction required.' };
  for (const entry of record.plan.entries) {
    const actor = actors.find(actor => actor.id === entry.actorId);
    const snapshot = record.plan.actorSnapshots.find(snapshot => snapshot.actorId === actor.id);
    const undone = actor.getFlag?.(systemId(), 'xpUndoReceipts')?.[id];
    const awardReceipt = actor.getFlag?.(systemId(), 'xpAwardReceipts')?.[id];
    if (!same(progressionSnapshot(actor), Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== 'actorId'))) ||
      !awardReceipt || awardReceipt.xpBefore !== entry.before || awardReceipt.xpAfter !== entry.after ||
      (undone ? record.status !== 'undoing' || undone.xpBefore !== entry.before || undone.xpAfter !== entry.after || actorXP(actor) !== entry.before : actorXP(actor) !== entry.after)) {
      return { success: false, manualRepair: true, reason: 'Character progressed after award; manual GM correction is required.' };
    }
  }
  if (record.status !== 'undoing') {
    record.status = 'undoing'; record.undoReason = reason; record.undoOperationId = message.operationId;
    await setSetting(XP_LEDGER_SETTING, ledger);
  }
  for (const entry of record.plan.entries) {
    const actor = actors.find(actor => actor.id === entry.actorId), receipts = actor.getFlag?.(systemId(), 'xpUndoReceipts') ?? {};
    if (receipts[id]) continue;
    await updateActor(actor, { 'system.xp': entry.before, [`flags.${systemId()}.xpUndoReceipts`]: { ...receipts, [id]: { awardId: id, xpBefore: entry.before, xpAfter: entry.after } } },
      { ospXPUndo: true }, () => actorXP(actor) === entry.before && actor.getFlag?.(systemId(), 'xpUndoReceipts')?.[id]?.xpAfter === entry.after);
  }
  if (record.plan.party) await setSetting(PARTY_REMAINDER_SETTING, record.plan.remainderBefore);
  record.status = 'undone'; record.undoneAt = Date.now();
  await setSetting(XP_LEDGER_SETTING, ledger);
  return { success: true, awardId: id, undone: true };
}
export async function undoXPAward(id, reason = "") { return requestProgressionMutation("undoXP", { id, reason }, `undo-${id}`); }

registerXPAwardAuthority();
registerProgressionAuthority("undoXP", executeUndoXPAward);
