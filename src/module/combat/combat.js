/**
 * @file OSP Combat - extends Foundry Combat with group initiative support
 */
import OspCombatant from "./combatant.js";

export default class OspCombat extends foundry.documents.Combat {
  /** Formula for group initiative (one roll per group) */
  static GROUP_FORMULA = "1d6";

  /** Formula for individual initiative */
  static FORMULA = "1d6 + @init";

  /**
   * Whether combat uses group or individual initiative (from settings)
   */
  get #isGroupInitiative() {
    return game.settings.get(game.system.id, "initiative") === "group";
  }

  /**
   * Reroll behavior from settings: 'keep', 'reset', or 'reroll'
   */
  get #rerollBehavior() {
    return game.settings.get(game.system.id, "rerollInitiative") ?? "reset";
  }

  /** @override */
  async startCombat() {
    await super.startCombat();
    if (this.#isGroupInitiative) {
      await this.rollInitiative(this.combatants.map((c) => c.id));
    }
    return this;
  }

  /** @override */
  async _onEndRound() {
    await super._onEndRound();

    const behavior = this.#rerollBehavior;
    if (behavior === "reset") {
      await this.resetAll();
    } else if (behavior === "reroll") {
      await this.rollInitiative(this.combatants.map((c) => c.id));
    }
    // 'keep' does nothing
  }

  /**
   * Roll initiative for combatants.
   * In group mode, all combatants in the same group share the same roll.
   * @override
   */
  async rollInitiative(ids, { formula = null, updateTurn = true, messageOptions = {} } = {}) {
    if (!this.#isGroupInitiative) {
      return super.rollInitiative(ids, { formula, updateTurn, messageOptions });
    }

    // Group initiative: roll once per group
    const combatants = ids.map((id) => this.combatants.get(id)).filter(Boolean);

    // Collect unique groups
    const groups = {};
    combatants.forEach((c) => {
      const group = c.group;
      if (!groups[group]) groups[group] = [];
      groups[group].push(c);
    });

    const updates = [];
    for (const [group, groupCombatants] of Object.entries(groups)) {
      const roll = new Roll(OspCombat.GROUP_FORMULA);
      await roll.evaluate();
      const initiative = roll.total;

      groupCombatants.forEach((c) => {
        const finalInit = c.isDefeated
          ? OspCombatant.INITIATIVE_VALUE_DEFEATED ?? -790
          : initiative;
        updates.push({ _id: c.id, initiative: finalInit });
      });
    }

    if (updates.length) {
      await this.updateEmbeddedDocuments("Combatant", updates);
    }

    if (updateTurn && this.turn !== null) {
      await this.update({ turn: 0 });
    }

    return this;
  }

  /**
   * Create initiative groups for all combatants based on their group property
   */
  async createGroups() {
    const updates = this.combatants.map((c) => ({
      _id: c.id,
      [`flags.${game.system.id}.group`]: c.groupRaw,
    }));
    return this.updateEmbeddedDocuments("Combatant", updates);
  }

  /**
   * Sort combatants: by group initiative, then by name within group
   * @override
   */
  _sortCombatants(a, b) {
    const ia = a.initiative ?? -Infinity;
    const ib = b.initiative ?? -Infinity;
    if (ia !== ib) return ib - ia;
    return a.name.localeCompare(b.name);
  }

  /**
   * Reset initiative for all combatants at end of round (for reroll/reset behaviors)
   */
  async resetActions() {
    const updates = this.combatants.map((c) => ({
      _id: c.id,
      initiative: null,
    }));
    return this.updateEmbeddedDocuments("Combatant", updates);
  }
}
