/**
 * @file OSP Character Creator dialog — rolls ability scores and initial gold
 */
import { OSP } from "../config";
import OspDice from "../helpers-dice.js";

export class OspCharacterCreator extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, options);
    this.actor = actor;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "osp-character-creator",
      classes: ["osp", "dialog", "character-creator"],
      title: game.i18n.localize("OSE.dialog.CharacterCreation"),
      template: `${OSP.systemPath()}/templates/dialogs/character-creator.html`,
      width: 400,
      height: "auto",
      submitOnChange: false,
      closeOnSubmit: false,
    });
  }

  /** @override */
  getData() {
    const scores = ["str", "dex", "con", "int", "wis", "cha"].map((attr) => ({
      key: attr,
      label: attr.toUpperCase(),
      value: this.actor.system.attributes?.[attr]?.value ?? 10,
    }));
    return {
      actor: this.actor,
      scores,
      config: CONFIG.OSE,
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Roll 3d6 for a single score
    html.find(".score-roll").click(async (event) => {
      const scoreKey = event.currentTarget.dataset.score;
      const roll = await new Roll("3d6").evaluate();
      html.find(`input[name="scores.${scoreKey}"]`).val(roll.total);
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `Rolling ${scoreKey.toUpperCase()}`,
      });
    });

    // Roll all scores at once
    html.find(".roll-all").click(async (event) => {
      for (const scoreKey of ["str", "dex", "con", "int", "wis", "cha"]) {
        const roll = await new Roll("3d6").evaluate();
        html.find(`input[name="scores.${scoreKey}"]`).val(roll.total);
      }
    });

    // Roll starting gold
    html.find(".roll-gold").click(async (event) => {
      const roll = await new Roll("3d6*10").evaluate();
      html.find('input[name="gold"]').val(roll.total);
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: "Starting Gold",
      });
    });
  }

  /** @override */
  async _updateObject(event, formData) {
    const scores = {};
    ["str", "dex", "con", "int", "wis", "cha"].forEach((attr) => {
      const val = parseInt(formData[`scores.${attr}`]) || 10;
      scores[`system.attributes.${attr}.value`] = val;
    });

    await this.actor.update(scores);

    // Create a coin item for starting gold if specified
    const gold = parseInt(formData.gold) || 0;
    if (gold > 0) {
      // Look for existing GP item
      const existingGp = this.actor.items.find(
        (i) => i.type === "coin" && i.name.toLowerCase().includes("gold")
      );
      if (existingGp) {
        const currentQty = existingGp.system.quantity ?? 0;
        await existingGp.update({ "system.quantity": currentQty + gold });
      } else {
        await this.actor.createEmbeddedDocuments("Item", [
          {
            name: "Gold Pieces (GP)",
            type: "coin",
            img: "icons/commodities/currency/coin-embossed-crown-gold.webp",
            system: { quantity: gold, unitWeight: 0.1, cost: 1 },
          },
        ]);
      }
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> character created with ${gold} GP starting gold.</p>`,
    });

    this.close();
  }
}
