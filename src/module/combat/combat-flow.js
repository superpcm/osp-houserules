/** Shared BR-14 declarations, modifiers and round eligibility. */
export const COMBAT_DECLARATIONS = Object.freeze({ WEAPON: 'weapon', TWO_WEAPON: 'twoWeapon', SPELL: 'spell', UNARMED: 'unarmed', OTHER: 'other' });
export const DECLARATION_LABELS = Object.freeze({ weapon: 'Weapon', twoWeapon: 'Two weapons', spell: 'Spell', unarmed: 'Unarmed', other: 'Other' });
export const combatantState = combatant => combatant.getFlag?.(game.system.id, 'initiativeState') ?? {};
export function dexterityModifier(actor) {
  const raw = actor?.system?.attributes?.dex?.value;
  if (raw === undefined || raw === null || raw === '') return Number(actor?.system?.initiative?.mod) || 0;
  const score = Number(raw);
  if (!Number.isFinite(score)) return 0;
  return score <= 3 ? -3 : score <= 5 ? -2 : score <= 8 ? -1 : score <= 12 ? 0 : score <= 15 ? 1 : score <= 17 ? 2 : 3;
}
export function defaultDeclaration(combatant) {
  const current = combatantState(combatant).declaration;
  if (current && typeof current === 'object') return current;
  if (combatant.getFlag?.(game.system.id, 'prepareSpell')) throw new Error(`${combatant.name}: choose the spell before rolling initiative.`);
  const weapons = [...(combatant.actor?.items ?? [])].filter(item => item.type === 'weapon' && item.system?.equipped === true);
  if (weapons.length > 2) throw new Error(`${combatant.name}: declare the weapons used before rolling initiative.`);
  return weapons.length ? { kind: weapons.length === 2 ? 'twoWeapon' : 'weapon', weaponIds: weapons.map(item => item.id) } : { kind: 'unarmed' };
}
export function shouldSkipCombatant(combatant, round) {
  const state = combatantState(combatant);
  return Boolean(combatant.defeated || round === 1 && combatant.getFlag?.(game.system.id, 'surprised') || state.round === round && state.acted);
}
