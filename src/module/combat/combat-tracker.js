/**
 * @file OSP Combat Tracker - extends Foundry CombatTracker to show group headers
 */
export default class OspCombatTracker extends foundry.applications.sidebar.tabs.CombatTracker {
  /** @override */
  async getData(options = {}) {
    const data = await super.getData(options);
    if (!this.viewed) return data;

    // Group combatants by their group color
    const groups = {};
    data.turns.forEach((turn) => {
      const combatant = this.viewed.combatants.get(turn.id);
      const group = combatant?.group ?? "white";
      if (!groups[group]) {
        groups[group] = {
          group,
          label: game.i18n.localize(`OSE.colors.${group}`),
          initiative: combatant?.initiative ?? null,
          turns: [],
        };
      }
      groups[group].turns.push(turn);
    });

    data.groups = Object.values(groups);
    return data;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Toggle casting flag
    html.on("click", ".combatant-control[data-control='toggleCasting']", async (event) => {
      event.preventDefault();
      const li = event.currentTarget.closest(".combatant");
      const combatant = this.viewed?.combatants.get(li.dataset.combatantId);
      if (!combatant) return;
      const current = combatant.getFlag(game.system.id, "prepareSpell") ?? false;
      await combatant.setFlag(game.system.id, "prepareSpell", !current);
    });

    // Toggle retreat flag
    html.on("click", ".combatant-control[data-control='toggleRetreat']", async (event) => {
      event.preventDefault();
      const li = event.currentTarget.closest(".combatant");
      const combatant = this.viewed?.combatants.get(li.dataset.combatantId);
      if (!combatant) return;
      const current = combatant.getFlag(game.system.id, "retreat") ?? false;
      await combatant.setFlag(game.system.id, "retreat", !current);
    });

    // Open group selector dialog
    html.on("click", ".combat-set-groups", async (event) => {
      event.preventDefault();
      const { OspCombatGroupSelector } = await import("./combat-set-groups.js");
      new OspCombatGroupSelector(this.viewed).render(true);
    });
  }
}
