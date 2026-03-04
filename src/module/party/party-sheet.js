/**
 * @file OSP Party Sheet - FormApplication showing current party members
 */
import { OspParty } from "./party.js";
import { OspPartyXP } from "./party-xp.js";
import { OSP } from "../config";

export class OspPartySheet extends FormApplication {
  constructor(options = {}) {
    super({}, options);
    this._party = OspParty.currentParty;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "osp-party-sheet",
      classes: ["osp", "party-sheet"],
      title: game.i18n.localize("OSE.party.title"),
      template: `${OSP.systemPath()}/templates/party/party-sheet.html`,
      width: 280,
      height: 400,
      resizable: true,
      dragDrop: [{ dragSelector: null, dropSelector: ".party-members" }],
    });
  }

  /** @override */
  getData() {
    const party = OspParty.currentParty;
    return {
      party: party.map((actor) => ({
        id: actor.id,
        name: actor.name,
        img: actor.img,
        level: actor.system.level ?? 1,
        class: actor.system.class ?? "",
        hp: actor.system.hitpoints ?? 0,
        maxHp: actor.system.maxhitpoints ?? 0,
        xp: actor.system.xp ?? 0,
        ac: actor.system.ac ?? 10,
      })),
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Remove from party
    html.find(".remove-from-party").click(async (event) => {
      const actorId = event.currentTarget.dataset.actorId;
      const actor = game.actors.get(actorId);
      if (actor) await this._removeActorFromParty(actor);
    });

    // Open actor sheet
    html.find(".party-member-name").click((event) => {
      const actorId = event.currentTarget.dataset.actorId;
      game.actors.get(actorId)?.sheet.render(true);
    });

    // Deal XP button
    html.find(".deal-xp").click(() => {
      new OspPartyXP({ party: OspParty.currentParty }).render(true);
    });
  }

  /** @override */
  async _onDrop(event) {
    event.preventDefault();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (data.type !== "Actor") return;

    const actor = await fromUuid(data.uuid);
    if (!actor || actor.type !== "character") return;

    await this._addActorToParty(actor);
  }

  async _addActorToParty(actor) {
    await OspParty.addToParty(actor);
    this.render(false);
  }

  async _removeActorFromParty(actor) {
    await OspParty.removeFromParty(actor);
    this.render(false);
  }

  /** @override */
  async _updateObject() {}
}
