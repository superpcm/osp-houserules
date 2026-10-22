/** Durable, pure state helpers for resumable level-up processing (BR-12). */

export const LEVEL_UP_STATE_VERSION = 1;

export function initialLevelUpData(characterClass = '') {
  const config = { Thief: 4, Assassin: 3, Barbarian: 2 }[String(characterClass).trim()];
  const skills = config === undefined ? {} : { ...(String(characterClass).trim() === 'Thief' ? { climbSheer: 1, listeningAtDoors: 1, hideShadows: 1, moveSilently: 1, findTraps: 1, openLocks: 1, pickPockets: 1 } : String(characterClass).trim() === 'Assassin' ? { climbSheer: 1, listeningAtDoors: 1, hideShadows: 1, moveSilently: 1 } : { climbSheer: 1, moveSilently: 1, hideUndergrowth: 1 }) };
  return {
    state: { ...createLevelUpState({ fromLevel: 1, targetLevel: 1 }), status: 'complete' },
    skills,
    skillBase: config === undefined ? null : 1,
    pendingSkillPoints: config ?? 0,
    skillPointFraction: 0,
    skillPoolVersion: 0
  };
}

export function createLevelUpState({ generation = 1, fromLevel = 1, targetLevel = fromLevel } = {}) {
  const from = Math.max(1, Math.floor(Number(fromLevel) || 1));
  const target = Math.max(from, Math.floor(Number(targetLevel) || from));
  return {
    version: LEVEL_UP_STATE_VERSION,
    generation,
    fromLevel: from,
    targetLevel: target,
    nextLevel: from + 1,
    status: 'pending',
    levels: {},
    pendingClaim: null
  };
}

export function normalizeLevelUpState(value, defaults = {}) {
  const base = createLevelUpState(defaults);
  if (!value || typeof value !== 'object') return base;
  return {
    ...base,
    ...value,
    version: LEVEL_UP_STATE_VERSION,
    levels: { ...(value.levels || {}) },
    pendingClaim: value.pendingClaim || null,
    nextLevel: Math.max(base.fromLevel + 1, Math.floor(Number(value.nextLevel) || base.fromLevel + 1))
  };
}

export function levelMarker(state, level) {
  return state?.levels?.[String(level)] || null;
}

export function markLevelClaimed(state, level, claim = {}) {
  const next = normalizeLevelUpState(state);
  const key = String(level);
  next.levels[key] = { ...(next.levels[key] || {}), status: 'claimed', claimToken: claim.claimToken || null, ownerId: claim.ownerId || null };
  next.pendingClaim = { level, ...claim };
  next.status = 'claimed';
  return next;
}

export function markLevelCommitted(state, level, { grantedHP = 0, skillCredit = 0, receiptId = null } = {}) {
  const next = normalizeLevelUpState(state);
  const key = String(level);
  const existing = next.levels[key] || {};
  if (existing.status === 'committed') return next;
  next.levels[key] = { ...existing, status: 'committed', grantedHP, skillCredit, receiptId };
  next.pendingClaim = null;
  while (next.nextLevel <= next.targetLevel && next.levels[String(next.nextLevel)]?.status === 'committed') next.nextLevel += 1;
  next.status = next.nextLevel > next.targetLevel ? 'complete' : 'pending';
  return next;
}

export function isLevelCommitted(state, level) {
  return levelMarker(state, level)?.status === 'committed';
}

export function skillCreditForLevel(config, level) {
  const start = Number(config?.startPoints) || 0;
  const rate = Number(config?.rate) || 0;
  const current = Math.floor(start + rate * Math.max(0, Number(level) - 1));
  const previous = Math.floor(start + rate * Math.max(0, Number(level) - 2));
  return Math.max(0, current - previous);
}

export function accumulatedSkillCredit(config, fromLevel, toLevel) {
  const start = Number(config?.startPoints) || 0;
  const rate = Number(config?.rate) || 0;
  const from = Math.max(0, Math.floor(Number(fromLevel) || 0));
  const to = Math.max(from, Math.floor(Number(toLevel) || from));
  const earnedAt = level => level <= 0 ? 0 : Math.floor(start + rate * Math.max(0, level - 1));
  return Math.max(0, earnedAt(to) - earnedAt(from));
}

export function validateSkillAllocation({ skills, current = {}, allocation = {}, pool = 0, max = 5 } = {}) {
  if (!Number.isSafeInteger(pool) || pool < 0 || !allocation || typeof allocation !== 'object' || Array.isArray(allocation)) return { ok: false, reason: 'invalid-skill-pool' };
  const allowed = new Set(skills || []);
  let spent = 0;
  const next = {};
  for (const [skill, amount] of Object.entries(allocation || {})) {
    if (!allowed.has(skill) || !Number.isInteger(amount) || amount < 0) return { ok: false, reason: 'invalid-skill-allocation' };
    const value = Number(current[skill] ?? 1);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) return { ok: false, reason: 'invalid-skill-value' };
    if (value + amount > max) return { ok: false, reason: 'skill-cap-exceeded' };
    spent += amount;
    next[skill] = value + amount;
  }
  if (spent > Number(pool) || spent < 0) return { ok: false, reason: 'insufficient-skill-points' };
  return { ok: true, spent, remaining: Number(pool) - spent, values: next };
}
