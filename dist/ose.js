const ActorSheet$1 = foundry?.app?.ActorSheet || foundry?.appv1?.sheets?.ActorSheet;

class OspActorSheetCharacter extends (ActorSheet$1 || class {}) {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "character"],
      template: "systems/osp-houserules/templates/actors/character-sheet.html",
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

const ActorSheet = foundry?.app?.ActorSheet || foundry?.appv1?.sheets?.ActorSheet;

class OspActorSheetMonster extends (ActorSheet || class {}) {
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

// ose.js - Main system entry point
console.log("OSP Debug: src/ose.js module loaded");

Hooks.once("init", () => {
  console.log("OSP Debug: init hook – starting Actor type registration");

  // Define valid actor types
  CONFIG.osp = CONFIG.osp || {};
  CONFIG.osp.actorTypes = ["character", "monster"];

  // Ensure typeLabels exists
  CONFIG.Actor.typeLabels ??= {};
  Object.assign(CONFIG.Actor.typeLabels, {
    character: "Character",
    monster: "Monster"
  });

  // Fallback: warn if sheetClasses is not available
  if (!CONFIG.Actor?.sheetClasses) {
    console.warn("OSP Warning: Actor sheetClasses not yet available in CONFIG. Skipping unregister step.");
  }

  // Register OSP character sheet
  foundry.documents.collections.Actors.registerSheet("osp-houserules", OspActorSheetCharacter, {
    types: ["character"],
    label: "Character Sheet",
    makeDefault: true
  });

  // Register OSP monster sheet
  foundry.documents.collections.Actors.registerSheet("osp-houserules", OspActorSheetMonster, {
    types: ["monster"],
    label: "Monster Sheet",
    makeDefault: true
  });

  // Ensure default type on Actor creation if missing
  Hooks.on("preCreateActor", (data, options, userId) => {
    if (!data.type) {
      data.type = "character"; // Default fallback type
    }
  });

  // Extend Actor Directory create button to prompt for type and name
  Hooks.on("renderActorDirectory", (_app, html, _data) => {
    html.find('button[data-action="create"]').off("click").on("click", async () => {
      const content = `
        <form>
          <div class="form-group">
            <label>Name:</label>
            <input type="text" name="name" value="New Actor"/>
          </div>
          <div class="form-group">
            <label>Actor Type:</label>
            <select name="type">
              <option value="character">Character</option>
              <option value="monster">Monster</option>
            </select>
          </div>
        </form>
      `;

      const type = await new Promise((resolve) => {
        const dialog = new Dialog({
          title: "Create Actor",
          content,
          buttons: {
            create: {
              icon: '<i class="fas fa-check"></i>',
              label: "Create",
              callback: (html) => {
                const name = html.find("[name=name]").val();
                const type = html.find("[name=type]").val();
                if (!type) {
                  ui.notifications.error("You must select an Actor type.");
                  return resolve(null);
                }
                resolve({ name, type });
              }
            },
            cancel: {
              icon: '<i class="fas fa-times"></i>',
              label: "Cancel",
              callback: () => resolve(null)
            }
          },
          default: "create"
        });
        dialog.render(true);
      });

      if (!type) return;

      await Actor.create({
        name: type.name || "New Actor",
        type: type.type
      });
    });
  });

  console.log("OSP Debug: init hook – registration complete", CONFIG.osp.actorTypes);
});
//# sourceMappingURL=ose.js.map
