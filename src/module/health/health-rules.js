const clone = value => JSON.parse(JSON.stringify(value));
const finite = (value, label) => { const n = Number(value); if (!Number.isFinite(n)) throw new RangeError(`${label} must be numeric`); return n; };
const nonnegative = (value, label) => { const n = finite(value, label); if (n < 0) throw new RangeError(`${label} must be non-negative`); return n; };
const round = (value, label) => { const n = finite(value, label); if (!Number.isInteger(n) || n < 0) throw new RangeError(`${label} must be a non-negative integer`); return n; };

export function healthSnapshot(actor = {}) {
  const system = actor.system ?? actor;
  const flagState = actor.getFlag?.('osp-houserules', 'healthState');
  const state = flagState ?? actor.flags?.['osp-houserules']?.healthState ?? actor.flags?.healthState ?? {};
  const hp = finite(system.hp?.value ?? system.hitpoints ?? 0, 'hitpoints');
  const maxHp = finite(system.hp?.max ?? system.maxhitpoints ?? Math.max(0, hp), 'maxhitpoints');
  const conditions = { prone: Boolean(state.conditions?.prone), unconscious: Boolean(state.conditions?.unconscious), incapacitated: Boolean(state.conditions?.incapacitated) };
  const bleed = state.bleed && typeof state.bleed === 'object' ? { remaining: nonnegative(state.bleed.remaining, 'bleed remaining'), lastRound: round(state.bleed.lastRound, 'bleed last round'), combatId: String(state.bleed.combatId ?? 'manual') } : null;
  return { hp, maxHp, dead: Boolean(state.dead) || hp < 0, zeroIncapacitated: Boolean(state.zeroIncapacitated), stabilized: Boolean(state.stabilized), conditions, bleed, needsDeathSave: Boolean(state.needsDeathSave) };
}

function ensure(snapshot) { const next = clone(snapshot); if (!next.conditions) next.conditions = { prone: false, unconscious: false, incapacitated: false }; return next; }

export function planHealthChange(snapshot, command, rolls = {}) {
  const next = ensure(snapshot), type = typeof command === 'string' ? command : command?.action ?? command?.type;
  if (!type) throw new TypeError('health command is required');
  if (type === 'setHP') {
    if (!['number', 'string'].includes(typeof command.value) || (typeof command.value === 'string' && command.value.trim() === '')) throw new TypeError('HP must be a whole number');
    const value = finite(command.value, 'HP');
    if (!Number.isInteger(value)) throw new RangeError('HP must be an integer');
    if (value > next.maxHp) throw new RangeError('HP cannot exceed maximum HP');
    if (value === 0 && next.hp === 0) return next;
    next.hp = value;
    next.bleed = null;
    next.stabilized = false;
    next.zeroIncapacitated = false;
    next.dead = value < 0;
    next.needsDeathSave = value === 0;
    return next;
  }
  if (next.dead && type !== 'condition') { if (type === 'heal' || type === 'naturalHealing') throw new Error('Dead characters cannot be healed'); return next; }
  if (type === 'damage') {
    const amount = nonnegative(command.amount, 'damage amount'); if (amount === 0) return next;
    next.hp -= amount;
    if (next.hp < 0) { next.dead = true; next.bleed = null; }
    else if (next.hp === 0) next.needsDeathSave = true;
    return next;
  }
  if (type === 'heal') {
    const amount = nonnegative(command.amount, 'healing amount');
    if (next.bleed && !command.magical) throw new Error('Non-magical healing cannot treat active bleed-out');
    next.hp = Math.min(next.maxHp, next.hp + amount);
    if (command.magical && amount > 0) { next.bleed = null; next.stabilized = true; if (next.hp > 0) { next.zeroIncapacitated = false; next.needsDeathSave = false; } }
    else if (amount > 0 && next.stabilized && next.hp > 0) { next.zeroIncapacitated = false; next.needsDeathSave = false; }
    return next;
  }
  if (type === 'naturalHealing') {
    if (next.bleed) throw new Error('Natural healing cannot treat active bleed-out');
    const roll = integerRange(rolls.healing, 'natural healing roll', 1, 4), con = finite(command.conModifier ?? 0, 'CON modifier');
    const amount = Math.max(1, roll + con); next.hp = Math.min(next.maxHp, next.hp + amount);
    if (next.stabilized && next.hp > 0) next.zeroIncapacitated = false;
    return next;
  }
  if (type === 'stabilize') { next.bleed = null; next.stabilized = true; return next; }
  if (type === 'condition') { if (!['prone', 'unconscious', 'incapacitated'].includes(command.name)) throw new RangeError('unknown condition'); if (command.name === 'prone' && !command.value && (next.zeroIncapacitated || next.conditions.incapacitated || next.conditions.unconscious)) throw new Error('Cannot stand while Incapacitated or unconscious'); next.conditions[command.name] = Boolean(command.value); if (command.value && (command.name === 'unconscious' || command.name === 'incapacitated')) next.conditions.prone = true; return next; }
  if (type === 'zeroResult') {
    if (next.hp !== 0 || next.dead || next.zeroIncapacitated || next.bleed) return next;
    if (!Boolean(rolls.saveSuccess)) { next.dead = true; next.needsDeathSave = false; return next; }
    const initialRound = round(command.round, 'initial round'), bleedRoll = integerRange(rolls.bleed, 'bleed roll', 1, 4);
    next.zeroIncapacitated = true; next.stabilized = false; next.conditions.prone = true; next.needsDeathSave = false;
    next.bleed = { remaining: bleedRoll + 1, lastRound: initialRound, combatId: String(command.combatId ?? 'manual') };
    return next;
  }
  if (type === 'advanceRound') {
    const current = round(command.round, 'round'), combatId = String(command.combatId ?? 'manual');
    if (!next.bleed || next.bleed.combatId !== combatId) return next;
    const elapsed = Math.max(0, current - next.bleed.lastRound);
    if (current < next.bleed.lastRound) return next;
    next.bleed.remaining = Math.max(0, next.bleed.remaining - elapsed); next.bleed.lastRound = current;
    if (next.bleed.remaining === 0) { next.dead = true; next.bleed = null; }
    return next;
  }
  throw new RangeError(`unknown health command: ${type}`);
}

export function conditionEffects(snapshot) {
  const s = ensure(snapshot), dead = Boolean(s.dead), unconscious = Boolean(s.conditions.unconscious), incapacitated = Boolean(s.conditions.incapacitated || s.zeroIncapacitated), prone = Boolean(s.conditions.prone);
  return { cannotAct: dead || unconscious || incapacitated, savePenalty: incapacitated ? -4 : 0, outgoingAttack: prone ? -2 : 0, incomingAttack: incapacitated ? 4 : prone ? 2 : 0, helpless: unconscious, movementReminder: unconscious ? 'Cannot move.' : incapacitated ? "Can only drag the body at 5' per round." : prone ? 'Standing costs half Encounter Speed.' : '' };
}

function integerRange(value, label, min, max) { const n = finite(value, label); if (!Number.isInteger(n) || n < min || n > max) throw new RangeError(`${label} must be an integer from ${min} to ${max}`); return n; }
