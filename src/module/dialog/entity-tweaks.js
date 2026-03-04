/**
 * @file OSP Entity Tweaks dialog — actor-level configuration tweaks
 */
import { OSP } from "../config";

export class OspEntityTweaks extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, options);
    this.actor = actor;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "osp-entity-tweaks",
      classes: ["osp", "dialog", "entity-tweaks"],
      title: game.i18n.localize("OSE.dialog.EntityTweaks"),
      template: `${OSP.systemPath()}/templates/dialogs/entity-tweaks.html`,
      width: 400,
      height: "auto",
      submitOnChange: false,
      closeOnSubmit: true,
    });
  }

  /** @override */
  getData() {
    const ascendingAC = game.settings.get(game.system.id, "ascendingAC");
    return {
      actor: this.actor,
      system: this.actor.system,
      config: CONFIG.OSE,
      ascendingAC,
      isCharacter: this.actor.type === "character",
      isMonster: this.actor.type === "monster",
    };
  }

  /** @override */
  async _updateObject(event, formData) {
    await this.actor.update(formData);
  }
}
