/** One-time migration of the pre-BR-14 initiative defaults. */

export const INITIATIVE_RULES_VERSION = 1;

export async function migrateInitiativeDefaults({ gameRef = globalThis.game } = {}) {
  if (!gameRef?.user?.isGM || gameRef.users?.activeGM?.id !== gameRef.user.id) {
    return { migrated: false, skipped: true, reason: 'active-gm-only' };
  }
  const settings = gameRef.settings;
  const scope = gameRef.system?.id ?? 'osp-houserules';
  const version = Number(settings.get(scope, 'initiativeRulesVersion') ?? 0);
  if (version >= INITIATIVE_RULES_VERSION) return { migrated: false, skipped: true, reason: 'already-migrated' };

  // Keep the marker last: if either setting write fails, the next ready hook retries.
  await settings.set(scope, 'initiative', 'individual');
  await settings.set(scope, 'rerollInitiative', 'reroll');
  await settings.set(scope, 'initiativeRulesVersion', INITIATIVE_RULES_VERSION);
  return { migrated: true, skipped: false, version: INITIATIVE_RULES_VERSION };
}

export default migrateInitiativeDefaults;
