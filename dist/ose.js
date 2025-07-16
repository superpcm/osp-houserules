class OspActorSheetCharacter extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "character"],
      template: "systems/osp-houserules/templates/actors/character-sheet.html",
      width: 600,
      height: 400,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
    });
  }

  getData(options) {
    const context = super.getData(options);
    context.system = this.actor.system;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
  }
}

class OspActorSheetMonster extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "monster"],
      template: "systems/osp-houserules/templates/actors/monster-sheet.html",
      width: 600,
      height: 400,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
    });
  }

  getData(options) {
    const context = super.getData(options);
    context.system = this.actor.system;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
  }
}

class OspActor extends Actor {
  /** @override */
  prepareData() {
    super.prepareData();
    // Add any system-specific actor prep here
  }
}

// ose.js - Main system entry point
console.log("OSP Debug: src/ose.js module loaded");

Hooks.once("init", () => {
  CONFIG.Actor.documentClass = OspActor;
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("osp-houserules", OspActorSheetCharacter, {
    types: ["character"],
    makeDefault: true
  });
  foundry.documents.collections.Actors.registerSheet("osp-houserules", OspActorSheetMonster, {
    types: ["monster"],
    makeDefault: true
  });

  CONFIG.Actor.typeLabels = {
    character: "Character",
    monster: "Monster"
  };

  console.log("OSP Debug: Actor sheets registered successfully");
});
//# sourceMappingURL=ose.js.map
