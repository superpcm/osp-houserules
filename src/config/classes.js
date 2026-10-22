import {
  CLASS_PROGRESSION, getClassProgression, getMaximumLevel,
  getNextProgressionXP, getProgressionHitDie, getProgressionLevel,
  getProgressionPrimeRequisites, getProgressionXPModifier
} from './progression.js';

// Compatibility exports derive from the same exact class data as the runtime APIs.
const names = profile => [profile.id, profile.name.toLowerCase()];
const derived = select => Object.fromEntries(Object.values(CLASS_PROGRESSION)
  .flatMap(profile => names(profile).map(name => [name, select(profile)])));
export const HIT_DICE_MAX = derived(profile => Number(profile.hitDie.match(/d(\d+)/)[1]));
export const XP_TABLES = derived(profile => profile.xp);
export const CLASS_XP_MAPPING = derived(profile => profile.id);
export const PRIME_REQUISITES = derived(profile => profile.primeRequisites.map(name => name.toLowerCase()));
export const ATTACK_BONUS_TABLES = derived(profile => profile.attack);
export const CLASS_ATTACK_BONUS_MAPPING = derived(profile => profile.id);

export function getXPTable(characterClass) {
  return getClassProgression(characterClass)?.xp || [];
}
export function getLevelFromXP(characterClass, xp, race = '') {
  return getProgressionLevel(characterClass, xp, race);
}
export function getNextLevelXP(characterClass, level, race = '') {
  return getNextProgressionXP(characterClass, level, race);
}
export function getPrimeRequisites(characterClass) {
  return getProgressionPrimeRequisites(characterClass);
}
export function getAttackBonus(characterClass, level, race = '') {
  const profile = getClassProgression(characterClass);
  if (!profile) return 0;
  const cappedLevel = Math.min(Math.max(Math.floor(Number(level)) || 1, 1), getMaximumLevel(characterClass, race));
  return profile.attack[cappedLevel - 1] || 0;
}

export function getAbilityModifier(score) {
  const numScore = parseInt(score) || 10;
  if (numScore === 3) return -3;
  if (numScore >= 4 && numScore <= 5) return -2;
  if (numScore >= 6 && numScore <= 8) return -1;
  if (numScore >= 9 && numScore <= 12) return 0;
  if (numScore >= 13 && numScore <= 15) return 1;
  if (numScore >= 16 && numScore <= 17) return 2;
  if (numScore >= 18) return 3;
  return 0;
}

export function calculateXPModifier(characterClass, attributes) {
  return getProgressionXPModifier(characterClass, attributes);
}
export function getHitDieMax(characterClass) {
  return getProgressionHitDie(characterClass);
}

/** Display-only maximum-roll estimate; never substitutes for accumulated rolled HP. */
export function calculateMaxHP(characterClass, level, conScore, race = '') {
  const profile = getClassProgression(characterClass);
  if (!profile) return 0;
  const cappedLevel = Math.min(Math.max(Math.floor(Number(level)) || 1, 1), getMaximumLevel(characterClass, race));
  const row = profile.hitPoints[cappedLevel - 1];
  const match = row.match(/(\d+)d(\d+)(?:\+(\d+))?/);
  return Number(match[1]) * Math.max(1, Number(match[2]) + getAbilityModifier(conScore)) + Number(match[3] || 0);
}
