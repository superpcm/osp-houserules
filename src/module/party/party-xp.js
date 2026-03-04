/**
 * @file OSP Party XP distribution dialog
 */
import { OSP } from "../config";
import { getNextLevelXP } from "../../config/classes.js";

export class OspPartyXP extends FormApplication {
  constructor(data = {}, options = {}) {
    super(data, options);
    this._party = data.party ?? [];
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "osp-party-xp",
      classes: ["osp", "party-xp"],
      title: game.i18n.localize("OSE.party.xp.title"),
      template: `${OSP.systemPath()}/templates/party/party-xp.html`,
      width: 400,
      height: "auto",
    });
  }

  /** @override */
  getData() {
    const totalXP = this.object.totalXP ?? 0;
    const party = this._party;
    const share = this._calculateShare(party, totalXP);

    return {
      party: party.map((actor) => ({
        id: actor.id,
        name: actor.name,
        img: actor.img,
        class: actor.system.class ?? "",
        level: actor.system.level ?? 1,
        currentXP: actor.system.xp ?? 0,
        share,
        nextLevel: getNextLevelXP(actor.system.class ?? "", actor.system.level ?? 1),
      })),
      totalXP,
      share,
    };
  }

  /**
   * Calculate each member's XP share
   * @param {Array<Actor>} party
   * @param {number} totalXP
   */
  _calculateShare(party, totalXP) {
    if (!party.length || !totalXP) return 0;
    return Math.floor(totalXP / party.length);
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".deal-xp").click(() => this._dealXP(html));
  }

  /**
   * Distribute XP to all party members
   */
  async _dealXP(html) {
    const totalXP = parseInt(html.find('[name="totalXP"]').val()) || 0;
    const share = this._calculateShare(this._party, totalXP);

    for (const actor of this._party) {
      const currentXP = actor.system.xp ?? 0;
      await actor.update({ "system.xp": currentXP + share });
    }

    ui.notifications.info(
      game.i18n.format("OSE.party.xp.dealt", { amount: share })
    );
    this.close();
  }

  /** @override */
  async _updateObject(event, formData) {}
}
