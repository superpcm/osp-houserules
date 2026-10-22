/** BR-15 combat support.  Pure rules live here so sheets, macros, and combat UI share them. */
export const NORMAL_ATTACK_PROGRESSION = Object.freeze({
  fighter: [{ level: 1, attacks: 1 }, { level: 4, attacks: 2 }, { level: 9, attacks: 3 }],
  knight: [{ level: 1, attacks: 1 }, { level: 5, attacks: 2 }],
  paladin: [{ level: 1, attacks: 1 }, { level: 5, attacks: 2 }],
  ranger: [{ level: 1, attacks: 1 }, { level: 5, attacks: 2 }],
  warden: [{ level: 1, attacks: 1 }, { level: 5, attacks: 2 }]
});

export const combatKey = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const levelOf = actor => Number(actor?.system?.level ?? actor?.system?.details?.level ?? 1) || 1;

export function normalAttacks(className, level) {
  const progression = NORMAL_ATTACK_PROGRESSION[combatKey(className)] ?? [{ level: 1, attacks: 1 }];
  const found = progression.filter(entry => Number(level) >= entry.level).at(-1);
  return found?.attacks ?? 1;
}

export function attackAllowance(actor) {
  return normalAttacks(actor?.system?.class ?? actor?.system?.details?.class, levelOf(actor));
}

export function talentChoices(level) {
  const n = Number(level) || 0;
  if (n === 1) return ['Weapon Specialization', 'Two-Weapon Fighting'];
  if (n === 3 || n === 7) return ['Cleave', 'Defender', 'Leader', 'Slayer'];
  return [];
}

export function validateTalentSelection(level, talent, { weapon = '', foeType = '' } = {}) {
  if (!talentChoices(level).includes(talent)) return { valid: false, reason: `This talent is not available at level ${level}.` };
  if (talent === 'Weapon Specialization' && !String(weapon).trim()) return { valid: false, reason: 'Weapon Specialization requires a catalog weapon.' };
  if (talent === 'Slayer' && !String(foeType).trim()) return { valid: false, reason: 'Slayer requires a specific foe type.' };
  return { valid: true, talent, ...(weapon ? { weapon } : {}), ...(foeType ? { foeType } : {}) };
}

export function specializationBonus(level) {
  const n = Number(level) || 0;
  return n >= 13 ? { attack: 1, damage: 5 } : n >= 10 ? { attack: 1, damage: 3 } : n >= 4 ? { attack: 1, damage: 2 } : n >= 1 ? { attack: 1, damage: 1 } : { attack: 0, damage: 0 };
}

/** Read the character-sheet talent record without requiring a particular sheet schema. */
export function talentBonuses(actor, item = null, targetType = '') {
  const talents = actor?.getFlag?.('osp-houserules', 'combatTalents') ?? actor?.flags?.['osp-houserules']?.combatTalents ?? [];
  const entries = Array.isArray(talents) ? talents : Object.values(talents || {});
  const specialization = entries.find(t => combatKey(t?.name ?? t) === 'weaponspecialization');
  const slayer = entries.find(t => combatKey(t?.name ?? t) === 'slayer');
  const selectedWeapon = combatKey(specialization?.weapon ?? specialization?.weaponName ?? specialization?.choice);
  const selectedFoe = combatKey(slayer?.foeType ?? slayer?.target ?? slayer?.choice);
  const weaponMatches = Boolean(specialization && selectedWeapon && selectedWeapon === combatKey(item?.name));
  const foeMatches = Boolean(slayer && selectedFoe && selectedFoe === combatKey(targetType));
  const spec = weaponMatches ? specializationBonus(levelOf(actor)) : { attack: 0, damage: 0 };
  return { attack: spec.attack + (foeMatches ? 1 : 0), damage: spec.damage + (foeMatches ? 1 : 0), specialization: Boolean(weaponMatches), slayer: Boolean(foeMatches) };
}

export function twoWeaponPenalties(level) {
  const n = Number(level) || 0;
  if (n >= 9) return { primary: 0, offhand: 0 };
  if (n >= 6) return { primary: 0, offhand: -1 };
  if (n >= 3) return { primary: -1, offhand: -2 };
  return { primary: -1, offhand: -3 };
}

export function hasTalent(actor, name) {
  const stored = actor?.getFlag?.('osp-houserules', 'combatTalents') ?? [];
  const entries = Array.isArray(stored) ? stored : Object.values(stored && typeof stored === 'object' ? stored : {});
  return entries.some(t => combatKey(t?.name) === combatKey(name));
}
export function canUseOffhand(item, primary, trained = true) {
  if (!item || !primary || item.id === primary.id || item.system?.wieldMode === 'twoHanded' || primary.system?.wieldMode === 'twoHanded') return false;
  if (!trained) return item.system?.size === 'S';
  return ['dagger', 'handaxe', 'hammer', 'lighthammer', 'club'].includes(combatKey(item.name)) ||
    (combatKey(item.name) === 'shortsword' && combatKey(primary.name) === 'shortsword');
}
export function situationalModifiers({ charging = false, targetCharging = false, mounted = false, targetOnFoot = false, itemName = '', aiming = false, defender = false, cleave = false, slayer = false, blindedTarget = false, targetHelpless = false, blinded = false, ranged = false, opponentInMelee = false, cover = 0, secondRank = false, attackerLarger = false, rangeBand = 'normal', prone = false, targetProne = false, targetIncapacitated = false } = {}) {
  if (blinded || (ranged && opponentInMelee) || Number(cover) === 99 || rangeBand === 'out') return { automatic: false, attack: 0, damage: 0, blocked: true, reasons: ['attack prohibited by confirmed situation'] };
  const reasons = [], attack = [];
  const add = (condition, value, reason) => { if (condition) { attack.push(value); reasons.push(reason); } };
  add(charging && !ranged, 2, 'charging'); add(targetCharging, 1, 'target charging');
  add(mounted && targetOnFoot && !ranged && !['dagger', 'club'].includes(combatKey(itemName)), 2, 'mounted');
  add(aiming && ranged, 2, 'aimed'); add(defender, -2, 'Defender'); add(cleave, -2, 'Cleave');
  add(slayer, 1, 'Slayer'); add(blindedTarget, 4, 'blinded target');
  add(prone, -2, 'prone'); add(targetIncapacitated, 4, 'target incapacitated'); add(targetProne && !targetIncapacitated, 2, 'target prone');
  add(secondRank && !attackerLarger, -2, 'second rank'); add(Number(cover) > 0, -Number(cover), 'cover');
  add(ranged && rangeBand === 'short', 1, 'short range'); add(ranged && rangeBand === 'long', -1, 'long range');
  return { automatic: Boolean(targetHelpless && !ranged), attack: attack.reduce((a,b) => a+b, 0), damage: slayer ? 1 : 0, blocked: false, reasons };
}
export function oilDamage(stage = 'hit', catalogDamage = null) {
  return stage === 'next-round' ? '1d4' : stage === 'hit' ? catalogDamage : null;
}

export function createAttackRoundState({ round, actor, attackCount = attackAllowance(actor) } = {}) {
  return { round: Number(round) || 1, allowance: Math.max(1, Number(attackCount) || 1), spent: 0, offhandSpent: false, reservations: {} };
}

export function reserveAttack(state, operationId, { offhand = false, extra = false } = {}) {
  if (!state || !operationId) throw new Error('Attack reservation requires a round state and operation ID.');
  if (state.reservations[operationId]) return { ...state.reservations[operationId], idempotent: true };
  if (offhand && (state.offhandSpent || Object.values(state.reservations).some(r => r.status === 'reserved' && r.offhand))) throw new Error('The once-per-round offhand attack has already been used.');
  if (!extra && !offhand && state.spent + Object.values(state.reservations).filter(r => r.status === 'reserved' && !r.offhand && !r.extra).length >= state.allowance) throw new Error('No attacks remain this round.');
  const reservation = { operationId, offhand, extra, status: 'reserved' };
  state.reservations[operationId] = reservation;
  return reservation;
}

export function settleAttack(state, operationId, committed) {
  const reservation = state?.reservations?.[operationId];
  if (!reservation) return false;
  if (reservation.status !== 'reserved') return reservation.status === 'committed';
  reservation.status = committed ? 'committed' : 'cancelled';
  if (committed) { if (reservation.offhand) state.offhandSpent = true; else if (!reservation.extra) state.spent += 1; }
  return true;
}
