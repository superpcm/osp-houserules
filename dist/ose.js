class OspActorSheetCharacter extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "character"],
      template: "systems/osp-houserules/templates/actors/character-sheet.html",
      width: 600,
      height: 500,
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

    const raceClasses = [
      "Elf", "Dwarf", "Gnome", "Hobbit", "Half-Elf", "Half-Orc"
    ];

    const $classSelect = html.find('select[name="system.class"]');
    const $raceSelect = html.find('select[name="system.race"]');

    function syncRaceField() {
      const selectedClass = $classSelect.val();
      if (raceClasses.includes(selectedClass)) {
        $raceSelect.val(selectedClass);
        $raceSelect.prop("disabled", true);
      } else {
        $raceSelect.prop("disabled", false);
      }
    }

    $classSelect.on("change", syncRaceField);
    syncRaceField();
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
  get displayName() {
    return "Actor";
  }

  /** @override */
  get displayNamePlural() {
    return "Actors";
  }

  /** @override */
  prepareData() {
    super.prepareData();
    // Add any system-specific actor prep here
  }
}

// ose.js - Main system entry point
console.log("osp-houserules Debug: src/ose.js module loaded");

Hooks.once("init", () => {
  CONFIG.Actor.documentClass = OspActor;
  CONFIG.Actor.label = game.i18n.localize("osp-houserules.Actor.documentLabel");
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("osp-houserules-houserules", OspActorSheetCharacter, {
    types: ["character"],
    makeDefault: true,
    label: game.i18n.localize("osp-houserules.Actor.Type.character")
  });
  foundry.documents.collections.Actors.registerSheet("osp-houserules-houserules", OspActorSheetMonster, {
    types: ["monster"],
    makeDefault: true,
    label: game.i18n.localize("osp-houserules.Actor.Type.monster")
  });
  CONFIG.Actor.typeLabels = {
    character: game.i18n.localize("osp-houserules.Actor.Type.character"),
    monster: game.i18n.localize("osp-houserules.Actor.Type.monster")
  };

  Hooks.on("renderActorConfig", (app, html, data) => {
    const $html = $(html);
    const $select = $html.find('select[name="type"]');
    const $submit = $html.find('button[type="submit"]');

    // Insert a placeholder option if not present
    if ($select.find('option[value=""]').length === 0) {
      $select.prepend(
        `<option value="" disabled>${game.i18n.localize("osp-houserules.ChooseType")}</option>`
      );
      $select.val(""); // Set the select to the placeholder
    }

    // Localize type options
    $select.find('option[value="character"]').text(game.i18n.localize("osp-houserules.Actor.Type.character"));
    $select.find('option[value="monster"]').text(game.i18n.localize("osp-houserules.Actor.Type.monster"));

    // Disable submit if no type is selected
    $submit.prop("disabled", $select.val() === "");

    // Enable submit when a valid type is chosen
    $select.on("change", function () {
      $submit.prop("disabled", $select.val() === "");
    });
  });

  console.log("osp-houserules Debug: Actor sheets registered successfully");
});
//# sourceMappingURL=ose.js.map
