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

  /** Whether this combatant is defeated (hp at 0 or below) */
  get isDefeated() {
    const hp = this.actor?.system?.hitpoints ?? null;
    if (hp === null) return false;
    return hp <= 0;
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
   * The group this combatant belongs to (may be overridden via flag)
   */
  get group() {
    return this.getFlag(game.system.id, "group") ?? this.groupRaw;
  }

  /**
   * Assign this combatant to a group
   * @param {string} group - The group color string
   */
  async assignGroup(group) {
    return this.setFlag(game.system.id, "group", group);
  }
}
