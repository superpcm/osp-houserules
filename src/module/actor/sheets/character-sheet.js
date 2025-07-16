export class OspActorSheetCharacter extends ActorSheet {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "character"],
      template: "systems/osp-houserules/templates/actors/character-sheet.html",
      width: 600,
      height: 400,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
    });
  }

  getData(options) {
    const context = super.getData(options);
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
  }
}