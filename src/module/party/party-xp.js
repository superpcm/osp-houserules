/**
 * @file OSP Party XP distribution dialog
 */
import { OSP } from "../config";
import { getNextLevelXP } from "../../config/classes.js";
import { awardXP, calculateXPAward } from '../progression/xp-awards.js';

export class OspPartyXP extends FormApplication {
  constructor(data = {}, options = {}) {
    super(data, options);
    this._party = data.party ?? [];
    this._awardId = foundry.utils.randomID();
    this._awarding = false;
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
    const savedRemainder = Number(game.settings.get(game.system.id, 'partyXPRemainder')) || 0;
    const share = this._calculateShare(party, totalXP + savedRemainder);
    const preview = Number.isSafeInteger(totalXP) && totalXP > 0 && party.length
      ? calculateXPAward({ amount: totalXP, actors: party, party: true, remainder: savedRemainder }) : null;

    return {
      party: party.map((actor) => ({
        id: actor.id,
        name: actor.name,
        img: actor.img,
        class: actor.system.class ?? "",
        level: actor.system.level ?? 1,
        currentXP: actor.system.xp ?? 0,
        share,
        awarded: preview?.entries.find(entry => entry.actorId === actor.id)?.awarded ?? 0,
        modifier: preview?.entries.find(entry => entry.actorId === actor.id)?.modifier ?? 0,
        nextLevel: getNextLevelXP(actor.system.class ?? "", actor.system.level ?? 1, actor.system.race ?? ""),
      })),
      totalXP,
      share,
      savedRemainder,
      nextRemainder: preview?.remainderAfter ?? savedRemainder,
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
    html.find('[name="totalXP"]').on('change', event => {
      this.object.totalXP = Number(event.target.value);
      this.render(false);
    });
  }

  /**
   * Distribute XP to all party members
   */
  async _dealXP(html) {
    if (this._awarding) return;
    const amount = Number(html.find('[name="totalXP"]').val());
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      ui.notifications.warn('Enter a positive whole-number XP award.');
      return;
    }
    this._awarding = true;
    html.find('.deal-xp').prop('disabled', true);
    try {
      const result = await awardXP({ amount, party: true, awardId: this._awardId,
        actorRefs: this._party.map(actor => ({ actorId: actor.id, actorUuid: actor.uuid })) });
      if (!result.success) {
        ui.notifications.warn(result.reason || 'XP award needs recovery in DM Toolkit → XP History.');
        return;
      }
      ui.notifications.info(`Party XP awarded with individual modifiers. ${result.remainderAfter} XP saved for the next party award.`);
      this.close();
    } catch (error) {
      ui.notifications.warn(`${error.message}. Retry this award or open DM Toolkit → XP History.`);
    } finally {
      this._awarding = false;
      html.find('.deal-xp').prop('disabled', false);
    }
  }

  /** @override */
  async _updateObject(event, formData) {}
}
