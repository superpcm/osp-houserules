import { normalizeQuantity } from '../inventory/encumbrance.js';
import { ospRoll } from '../dice.js';
import { assertProgressionAuthorityFence, registerProgressionAuthority, requestProgressionMutation, currentProgressionOperation, getProgressionRequester } from '../progression/progression-authority.js';
import { d6Outcome, d6Target, mageChance, percentileOutcome, trackingChance, normalizeKey } from './noncombat-rules.js';
import { deriveExplorationSkills } from './exploration-skills.js';
import { confirmPrivateCheck, recoverPrivateDie, escapeNoncombatHTML as escape } from './noncombat-prompts.js';

const ACTION = 'noncombat.check';
const SCOPE = 'osp-houserules';
const FLAG = 'noncombatCheck';
const neutral = () => ({ success: true, private: true });
const pending = () => ({ success: false, recoveryRequired: true, reason: 'Private check pending. The GM must recover this operation in XP History.' });
const classKey = actor => normalizeKey(actor?.system?.class);
const itemsOf = actor => Array.from(actor?.items?.values?.() ?? actor?.items ?? []);
const available = item => normalizeQuantity(item.system?.quantity) > 0;
const hasKit = actor => itemsOf(actor).some(item => ['item', 'container'].includes(item.type) && normalizeKey(item.name) === 'disguisekit' && available(item));
const trained = {
  climbsheersurfaces: ['climbSheer', 'Climb Sheer Surfaces'], hideshadows: ['hideShadows', 'Hide in Shadows'], hideundergrowth: ['hideUndergrowth', 'Hide in Undergrowth'], movesilently: ['moveSilently', 'Move Silently'], hearnoise: ['listeningAtDoors', 'Hear Noise'], findtraps: ['findTraps', 'Find/Remove Traps'], openlocks: ['openLocks', 'Open Locks'], pickpockets: ['pickPockets', 'Pick Pockets']
};
const classSkills = { assassin: ['climbsheersurfaces', 'hearnoise', 'hideshadows', 'movesilently'], barbarian: ['climbsheersurfaces', 'hideundergrowth', 'movesilently'], thief: Object.keys(trained).filter(id => id !== 'hideundergrowth') };
const mageSkills = { detectmagic: ['Detect Magic', 'One turn concentrating; failed checks may be retried.'], openclose: ['Open/Close', 'Unlocked portal/lid only; one attempt per portal; hold for one round per level.'], rally: ['Rally', 'Counters magical fear; once per turn.'], readmagic: ['Read Magic', 'After failure, retry this script only after gaining a level.'], suggestion: ['Suggestion', 'Once per turn; up to one HD of persons per level; save vs spells, dangerous suggestions automatically save; one round per level.'] };
let housePromise;
export function noncombatHouseRules() {
  return housePromise ??= fetch('systems/osp-houserules/data/ose_house_rules_v1_5.json').then(response => { if (!response.ok) throw new Error('House rules unavailable'); return response.json(); }).catch(error => { housePromise = null; throw error; });
}

export function eligibleNoncombatCheck(actor, checkId) {
  const id = normalizeKey(checkId), cls = classKey(actor), race = normalizeKey(actor?.system?.race);
  if (['listeningatdoors', 'findsecretdoor', 'detectroomtraps'].includes(id)) return id;
  if (id === 'detectconstructiontricks') return ['dwarf', 'gnome'].includes(race) ? id : null;
  if (classSkills[cls]?.includes(id)) return id;
  if (id === 'disguise') return cls === 'assassin' && hasKit(actor) ? id : null;
  if (id === 'tracking') return ['ranger', 'warden'].includes(cls) ? id : null;
  if (mageSkills[id]) return cls === 'mage' ? id : null;
  return null;
}
export function noncombatCheckInfo(id) {
  const labels = { listeningatdoors: 'Listen / Hear Noise', findsecretdoor: 'Search for Secret Doors', detectroomtraps: 'Search for Room Traps', detectconstructiontricks: 'Detect Construction Tricks', disguise: 'Disguise', tracking: 'Tracking' };
  const note = id === 'disguise' ? 'Physical Disguise Kit required. Observer detection and feasibility are referee-managed; this records the procedure, not a successful disguise.' : id === 'detectroomtraps' ? 'General room-trap search; the Dwarf bonus requires relevant stonework. Small mechanisms use the Thief skill.' : id === 'tracking' ? 'Full WIS plus tracking table and GM circumstance modifiers.' : mageSkills[id] ? `${mageSkills[id][1]} Range 30 feet; full INT score added.` : 'GM-private check; confirm time, circumstances and retry limits.';
  return { id, label: labels[id] ?? trained[id]?.[1] ?? mageSkills[id]?.[0] ?? id, note };
}
function penalizedArmor(actor) {
  const body = itemsOf(actor).filter(item => item.type === 'armor' && ['light', 'medium', 'heavy'].includes(String(item.system?.type).toLowerCase()) && item.system?.equipped && available(item));
  return (body.find(item => !['leather', 'padded', 'hide'].includes(normalizeKey(item.name))) ?? body[0])?.name ?? '';
}
export function noncombatTarget(actor, id, house, context = {}) {
  const derived = deriveExplorationSkills(actor.system);
  if (['listeningatdoors', 'hearnoise'].includes(id)) return Number(derived.effectiveListeningAtDoors);
  if (id === 'findsecretdoor') return Number(derived.effectiveFindSecretDoor);
  if (id === 'detectconstructiontricks') return Number(derived.detectConstruction);
  if (id === 'detectroomtraps') return Number(derived.detectRoomTraps || 1);
  if (id === 'tracking') return trackingChance(null, house, actor.system.level, actor.system.attributes?.wis?.value) + (context.modifier ?? 0);
  if (mageSkills[id]) return mageChance(house, actor.system.level, actor.system.attributes?.int?.value, id);
  if (id === 'disguise') return null;
  return d6Target(actor.system[trained[id][0]] || 1, { armorName: penalizedArmor(actor), skill: id, victimLevel: context.victimLevel ?? 0 });
}
function gmIds() { return Array.from(game.users.values()).filter(user => user.isGM).map(user => user.id); }
function journalData(message) { return message.flags?.[SCOPE]?.[FLAG]; }
function findJournal(operationId) {
  return Array.from(game.messages?.values?.() ?? game.messages ?? []).find(message => {
    const author = game.users.get(message.author?.id ?? message.author);
    return author?.isGM && message.whisper?.length && message.whisper.every(id => game.users.get(id)?.isGM) && journalData(message)?.operationId === operationId;
  });
}
async function saveJournal(message, value) {
  assertProgressionAuthorityFence();
  const content = value.stage === 'complete' ? `<p>${escape(value.actorName)} — ${escape(value.label)}</p><p>${value.faces ? `Roll ${value.roll}; target ${value.target}; ${value.outcome.success ? 'Success' : 'Failure'}${value.outcome.noticed ? '; theft noticed' : ''}.` : 'Disguise procedure recorded. GM determines observer detection and feasibility.'}</p>` : `<p>Private exploration check: ${escape(value.label)} (${escape(value.stage)}). Recover pending checks from XP History.</p>`;
  try {
    if (message) await message.update({ content, [`flags.${SCOPE}.${FLAG}`]: value });
    else message = await ChatMessage.create({ content, whisper: gmIds(), flags: { [SCOPE]: { [FLAG]: value } } });
  } catch (error) {
    const saved = findJournal(value.operationId);
    if (!saved || JSON.stringify(journalData(saved)) !== JSON.stringify(value)) throw error;
    message = saved;
  }
  assertProgressionAuthorityFence();
  if (!message || JSON.stringify(journalData(message)) !== JSON.stringify(value)) throw new Error('Private journal not acknowledged');
  return message;
}
async function executePrivate(details, receipt) {
  if (!game.user?.isGM || game.user.id !== game.users.activeGM?.id || !globalThis.ChatMessage?.create) return pending();
  if (Object.keys(details).some(key => !['actorUuid', 'checkId'].includes(key))) return { success: false, reason: 'Unexpected private-check request fields.' };
  const actor = await fromUuid(details.actorUuid), requester = getProgressionRequester();
  if (!actor || actor.type !== 'character' || !requester || !actor.testUserPermission(requester, 'OWNER')) return { success: false, reason: 'Actor ownership does not permit this check.' };
  const id = eligibleNoncombatCheck(actor, details.checkId);
  if (!id) return { success: false, reason: 'Check or required equipment is unavailable for this actor.' };
  const operationId = currentProgressionOperation();
  let message = findJournal(operationId), value = message && structuredClone(journalData(message));
  if (value && (value.actorUuid !== actor.uuid || value.id !== id)) return pending();
  if (value?.stage === 'complete') return neutral();
  if (value?.stage === 'cancelled') return { success: false, reason: 'Check cancelled.' };
  if (!value) {
    // If no journal survived an interrupted operation, require explicit GM confirmation.
    if (receipt?.status === 'started') {
      const resolution = await recoverPrivateDie({ ...noncombatCheckInfo(id), faces: mageSkills[id] || id === 'tracking' ? 100 : 6 });
      assertProgressionAuthorityFence();
      if (!resolution?.unrolled) return pending();
    }
    const context = await confirmPrivateCheck(noncombatCheckInfo(id));
    assertProgressionAuthorityFence();
    if (!context) return { success: false, reason: 'Check cancelled.' };
    if (!eligibleNoncombatCheck(actor, id)) return { success: false, reason: 'Character eligibility changed; check cancelled.' };
    const house = mageSkills[id] || id === 'tracking' ? await noncombatHouseRules() : null;
    value = { operationId, actorUuid: actor.uuid, actorName: actor.name, ...noncombatCheckInfo(id), context, target: noncombatTarget(actor, id, house, context), faces: id === 'disguise' ? 0 : mageSkills[id] || id === 'tracking' ? 100 : 6, stage: 'configured' };
    message = await saveJournal(null, value);
  }
  if (!value.faces) { value.stage = 'complete'; await saveJournal(message, value); return neutral(); }
  let actual;
  if (value.stage === 'rolling') {
    const resolution = await recoverPrivateDie(value);
    assertProgressionAuthorityFence();
    if (!resolution) return pending();
    actual = resolution.actual;
    if (actual === undefined && !resolution.unrolled) return pending();
  } else if (value.stage !== 'configured') return pending();
  if (actual === undefined) {
    value.stage = 'rolling'; message = await saveJournal(message, value);
    assertProgressionAuthorityFence();
    const rolled = await ospRoll(`1d${value.faces}`, { strictIntegers: true, label: `GM private: ${escape(value.label)}` });
    assertProgressionAuthorityFence();
    if (rolled?.cancelled) { value.stage = 'cancelled'; await saveJournal(message, value); return { success: false, reason: 'Check cancelled.' }; }
    actual = rolled.total;
  }
  value.roll = actual;
  value.outcome = value.faces === 100 ? percentileOutcome(actual, value.target) : d6Outcome(actual, value.target, value.id);
  value.stage = 'complete';
  await saveJournal(message, value);
  return neutral();
}
export function registerNoncombatAuthority() {
  registerProgressionAuthority(ACTION, async (details, receipt) => {
    try { return await executePrivate(details, receipt); }
    catch (_) { return pending(); } // Never expose private inputs, dice or error text in public receipts.
  });
}
export function requestNoncombatCheck(actorUuid, checkId, operationId = null) { return requestProgressionMutation(ACTION, { actorUuid, checkId }, operationId); }
