import { ospRoll, buildManualChatContent } from '../dice.js';

const inFlight = new WeakSet();

const clean = (value) => DOMPurify.sanitize(String(value ?? ''));

export function abilityOutcome(total, rollType = 'result', target) {
  if (!Number.isFinite(total)) throw new Error('Ability roll did not produce a numeric result.');
  if (rollType === 'result') return { total, success: null };
  if ((rollType !== 'above' && rollType !== 'below') || !Number.isFinite(target)) {
    throw new Error('A finite roll target is required for this ability.');
  }
  return { total, success: rollType === 'above' ? total >= target : total <= target };
}

function getActor(item) {
  return item?.parent?.documentName === 'Actor' ? item.parent : item?.actor;
}

function authorized(actor, item) {
  const user = game.user;
  if (!actor || !['character', 'monster'].includes(actor.type)) return false;
  if (user?.isGM) return true;
  return actor.isOwner || item?.testUserPermission?.(user, 'OWNER');
}

export async function rollAbility(item) {
  if (!item || item.type !== 'ability') throw new Error('Only ability items can be rolled.');
  const actor = getActor(item);
  if (!authorized(actor, item)) throw new Error('You do not have permission to roll this ability.');
  if (game.settings.get('osp-houserules', 'playerLock') && !game.user.isGM) {
    throw new Error('Player Lock prevents this ability roll.');
  }
  if (inFlight.has(item)) return { cancelled: true, duplicate: true };

  const formula = String(item.system?.roll ?? '').trim();
  if (!formula) throw new Error('This ability has no roll formula.');
  const rollType = item.system?.rollType || 'result';
  if (!['result', 'above', 'below'].includes(rollType)) throw new Error('Unsupported ability roll type.');
  const rawTarget = item.system?.rollTarget;
  const target = Number(rawTarget);
  if (rollType !== 'result' && (rawTarget == null || String(rawTarget).trim() === '' || !Number.isFinite(target))) {
    throw new Error('A finite roll target is required for this ability.');
  }

  inFlight.add(item);
  try {
    const data = actor.getRollData?.() ?? actor.system ?? {};
    const resolved = new Roll(formula, data).formula;
    const result = await ospRoll(resolved, { label: `${item.name} Ability` });
    if (result?.cancelled) return result;
    const outcome = abilityOutcome(result.total, rollType, target);
    const mode = item.system?.blindroll ? 'blindroll' : game.settings.get('core', 'rollMode');
    const speaker = ChatMessage.getSpeaker({ actor });
    const name = clean(item.name);
    const status = outcome.success === null
      ? `Result: ${outcome.total}`
      : `Result: ${outcome.total} — ${outcome.success ? 'Success' : 'Failure'} (target ${target})`;
    const flavor = `${name} — ${status}`;
    const rollMessageData = ChatMessage.applyRollMode({}, mode);
    if (result.foundryRoll) {
      await result.foundryRoll.toMessage({ ...rollMessageData, speaker, flavor }, { rollMode: mode });
    } else {
      await ChatMessage.create({
        ...rollMessageData,
        speaker,
        flavor,
        content: buildManualChatContent(result, { formula: resolved, label: name }),
      });
    }
    return { ...result, ...outcome };
  } finally {
    inFlight.delete(item);
  }
}

