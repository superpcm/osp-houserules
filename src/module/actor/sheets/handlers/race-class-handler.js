/**
 * Handles race and class synchronization logic
 */
export class RaceClassHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.raceClasses = ["Elf", "Dwarf", "Gnome", "Hobbit", "Half-Elf", "Half-Orc"];
    this.classSelect = html.find('select[name="system.class"]');
    this.raceSelect = html.find('select[name="system.race"]');
  }

  /**
   * Initialize race/class synchronization
   */
  initialize() {
    this.classSelect.on("change", this.syncRaceField.bind(this));
    this.syncRaceField();
  }

  /**
   * Synchronize race field based on class selection
   */
  syncRaceField() {
    const selectedClass = this.classSelect.val();
    if (this.raceClasses.includes(selectedClass)) {
      this.raceSelect.val(selectedClass);
      this.raceSelect.prop("disabled", true);
    } else {
      this.raceSelect.prop("disabled", false);
    }
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    this.classSelect.off("change");
  }
}
