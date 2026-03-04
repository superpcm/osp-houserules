/**
 * @file OSP Combat Group Selector dialog
 */
import { OSP } from "../config";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class OspCombatGroupSelector extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(combat, options = {}) {
    super(options);
    this.combat = combat;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "osp-combat-set-groups",
    classes: ["osp", "combat-set-groups"],
    window: { title: "OSE.combat.SetGroups" },
    position: { width: 600 },
    actions: {
      setGroup: OspCombatGroupSelector.#setGroup,
    },
  };

  /** @override */
  static PARTS = {
    form: {
      template: `${OSP.systemPath()}/templates/apps/combat-set-groups.hbs`,
    },
  };

  /** @override */
  async _prepareContext(options) {
    const groups = {
      red: game.i18n.localize("OSE.colors.red"),
      purple: game.i18n.localize("OSE.colors.purple"),
      green: game.i18n.localize("OSE.colors.green"),
      white: game.i18n.localize("OSE.colors.white"),
      yellow: game.i18n.localize("OSE.colors.yellow"),
      blue: game.i18n.localize("OSE.colors.blue"),
      orange: game.i18n.localize("OSE.colors.orange"),
    };

    const combatants = this.combat.combatants.map((c) => ({
      id: c.id,
      name: c.name,
      img: c.img,
      group: c.group,
    }));

    return { combatants, groups };
  }

  /** @this {OspCombatGroupSelector} */
  static async #setGroup(event, target) {
    const combatantId = target.closest("[data-combatant-id]")?.dataset.combatantId;
    const group = target.dataset.group;
    if (!combatantId || !group) return;

    const combatant = this.combat.combatants.get(combatantId);
    await combatant?.assignGroup(group);
    this.render(false);
  }
}
