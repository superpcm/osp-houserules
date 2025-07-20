export class OspActorSheetCharacter extends foundry.appv1.sheets.ActorSheet {
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