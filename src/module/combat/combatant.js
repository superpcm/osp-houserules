/**
 * @file OSP Combatant - extends Foundry Combatant with group initiative support
 */
export default class OspCombatant extends Combatant {
  /** Sentinel value: combatant is slow (two-handed/crossbow) */
  static INITIATIVE_VALUE_SLOWED = -789;

  /** Sentinel value: combatant is defeated (hp <= 0) */
  static INITIATIVE_VALUE_DEFEATED = -790;

  /** Whether this combatant is preparing a spell this round */
  get isCasting() {
    return this.getFlag(game.system.id, "prepareSpell") ?? false;
  }

  /** Whether this combatant is slow (actor has slow weapon equipped) */
  get isSlow() {
    return this.actor?.system?.isSlow ?? false;
  }

  /** Whether the GM explicitly marked this combatant defeated. */
  get isDefeated() {
    return Boolean(this.defeated);
  }

  get combatInitiativeState() {
    return this.getFlag(game.system.id, "initiativeState") ?? {};
  }

  get actionDeclaration() {
    return this.combatInitiativeState.declaration ?? null;
  }

  async setActionDeclaration(declaration, round = this.parent?.round ?? 1) {
    if (!this.parent?.setDeclaration) throw new Error("Combat declaration authority is unavailable.");
    return this.parent.setDeclaration(this.id, declaration, round);
  }

  get isSurprised() {
    return Boolean(this.getFlag(game.system.id, "surprised"));
  }

  async setDefeated(defeated) {
    if (!game.user?.isGM) throw new Error("Only a GM may mark combatants defeated.");
    return this.parent.markDefeated(this.id, Boolean(defeated));
  }

  /**
   * The raw group color for this combatant based on token disposition.
   * Hostile = red, Neutral = purple, Friendly = green, Other = white
   */
  get groupRaw() {
    if (this.token?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) return "red";
    if (this.token?.disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL) return "purple";
    if (this.token?.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return "green";
    return "white";
  }

  /**
   * The OSP initiative group this combatant belongs to (may be overridden via flag).
   * Renamed from `group` to avoid collision with Foundry v13's native BaseCombatant.group field.
   */
  get ospGroup() {
    return this.getFlag(game.system.id, "group") ?? this.groupRaw;
  }

  /**
   * Assign this combatant to an OSP initiative group
   * @param {string} group - The group color string
   */
  async assignGroup(group) {
    return this.setFlag(game.system.id, "group", group);
  }
}
