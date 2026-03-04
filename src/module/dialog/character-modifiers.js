/**
 * @file OSP Character Modifiers dialog — shows attribute modifiers
 */
import { OSP } from "../config";
import { getAbilityModifier } from "../../config/classes.js";

export class OspCharacterModifiers extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, options);
    this.actor = actor;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "osp-character-modifiers",
      classes: ["osp", "dialog", "character-modifiers"],
      title: game.i18n.localize("OSE.dialog.Modifiers"),
      template: `${OSP.systemPath()}/templates/dialogs/modifiers-dialog.html`,
      width: 320,
      height: "auto",
    });
  }

  /** @override */
  getData() {
    const attrs = this.actor.system.attributes ?? {};
    const getModLabel = (score) => {
      const mod = getAbilityModifier(score);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    };

    return {
      actor: this.actor,
      modifiers: [
        { key: "str", label: "STR", score: attrs.str?.value ?? 10, mod: getModLabel(attrs.str?.value ?? 10) },
        { key: "dex", label: "DEX", score: attrs.dex?.value ?? 10, mod: getModLabel(attrs.dex?.value ?? 10) },
        { key: "con", label: "CON", score: attrs.con?.value ?? 10, mod: getModLabel(attrs.con?.value ?? 10) },
        { key: "int", label: "INT", score: attrs.int?.value ?? 10, mod: getModLabel(attrs.int?.value ?? 10) },
        { key: "wis", label: "WIS", score: attrs.wis?.value ?? 10, mod: getModLabel(attrs.wis?.value ?? 10) },
        { key: "cha", label: "CHA", score: attrs.cha?.value ?? 10, mod: getModLabel(attrs.cha?.value ?? 10) },
      ],
    };
  }

  /** @override */
  async _updateObject() {}
}
