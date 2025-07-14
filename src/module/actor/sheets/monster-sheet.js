const ActorSheet = foundry?.app?.ActorSheet || foundry?.appv1?.sheets?.ActorSheet;

export class OspActorSheetMonster extends (ActorSheet || class {}) {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "monster"],
      template: "systems/osp-houserules/templates/actors/monster-sheet.html",
      width: 600,
      height: 400,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
    });
  }

  getData() {
    const data = super.getData();
    return data;
  }
}
