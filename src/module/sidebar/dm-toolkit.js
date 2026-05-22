/**
 * @file DM's Toolkit — GM-only sidebar tab with party utility actions.
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { AbstractSidebarTab } = foundry.applications.sidebar;

export default class DmToolkitTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  static tabName = "dmtoolkit";

  static DEFAULT_OPTIONS = {
    window: { title: "DM's Toolkit" },
    actions: {
      rest: DmToolkitTab._onRest
    }
  };

  static PARTS = {
    app: {
      template: "systems/osp-houserules/templates/sidebar/dm-toolkit.html"
    }
  };

  static async _onRest(_event, _target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Rest the Party" },
      content: "<p>Reset all spell slots for every player character?</p>",
      yes: { label: "Yes" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;

    const pcs = game.actors.filter(a => a.type === "character");

    const slotUpdates = {};
    for (let i = 1; i <= 6; i++) {
      slotUpdates[`system.spellSlots.${i}.used`] = 0;
    }

    for (const actor of pcs) {
      await actor.update(slotUpdates);
      await actor.unsetFlag("osp-houserules", "memorizedSpells");
    }

    ui.notifications.info("Rest complete — all spell slots and memorized spells cleared.");
  }
}
