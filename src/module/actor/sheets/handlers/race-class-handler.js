/**
 * Handles race and class synchronization logic
 */
export class RaceClassHandler {
  constructor(html, actor, characterSheet = null) {
    this.html = html;
    this.actor = actor;
    this.characterSheet = characterSheet;
    this.raceClasses = ["Elf", "Dwarf", "Gnome", "Hobbit", "Half-Elf", "Half-Orc"];
    this.classSelect = html.find('select[name="system.class"]');
    this.raceSelect = html.find('select[name="system.race"]');
    
    // Define class restrictions for each race
    this.raceClassRestrictions = {
      'Dwarf': ['Assassin', 'Cleric', 'Fighter', 'Thief'],
      'Elf': ['Assassin', 'Cleric', 'Druid', 'Fighter', 'Knight', 'Magic-User', 'Ranger', 'Thief'],
      'Gnome': ['Assassin', 'Cleric', 'Fighter', 'Illusionist', 'Thief'],
      'Hobbit': ['Druid', 'Fighter', 'Thief'],
      'Half-Orc': ['Assassin', 'Barbarian', 'Cleric', 'Fighter', 'Thief'],
      'Half-Elf': ['Assassin', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Knight', 'Magic-User', 'Paladin', 'Ranger', 'Thief'],
      'Human': [] // Human gets all classes except race-as-class options, handled by exclusion logic
      // Add other race restrictions here as needed
      // Note: Acrobat class not available in current system
    };
    
    // Store original class options for restoration
    this.originalClassOptions = this.classSelect.find('option').clone();
  }

  /**
   * Initialize race/class synchronization
   */
  initialize() {
    this.classSelect.on("change", this.handleClassChange.bind(this));
    this.raceSelect.on("change", this.handleRaceChange.bind(this));
    // Only sync race field if no race restrictions exist
    if (Object.keys(this.raceClassRestrictions).length === 0) {
      this.syncRaceField();
    }
    this.filterClassOptions(); // Apply initial filtering
  }

  /**
   * Handle class selection changes
   */
  handleClassChange() {
    // Prevent infinite loops during race change handling
    if (this._handlingRaceChange) return;
    
    // Only sync race field if no race restrictions exist (avoids conflicts)
    if (Object.keys(this.raceClassRestrictions).length === 0) {
      this.syncRaceField();
    }
    // Note: Removed updateSkillLayout() call to prevent infinite re-rendering
  }

  /**
   * Handle race selection changes
   */
  handleRaceChange() {
    this._handlingRaceChange = true;
    try {
      this.filterClassOptions();
      // Note: Removed updateSkillLayout() call to prevent infinite re-rendering
    } finally {
      this._handlingRaceChange = false;
    }
  }

  /**
   * Synchronize race field based on class selection
   */
  syncRaceField() {
    // Don't sync if we're currently handling a race change to prevent loops
    if (this._handlingRaceChange) return;
    
    const selectedClass = this.classSelect.val();
    const selectedRace = this.raceSelect.val();
    
    // Only sync race field if the selected class is a race-class AND 
    // the current race doesn't have restrictions (to avoid conflicts)
    if (this.raceClasses.includes(selectedClass) && 
        (!selectedRace || !this.raceClassRestrictions[selectedRace])) {
      this.raceSelect.val(selectedClass);
      this.raceSelect.prop("disabled", true);
    } else {
      this.raceSelect.prop("disabled", false);
    }
  }

  /**
   * Filter class options based on selected race restrictions
   */
  filterClassOptions() {
    const selectedRace = this.raceSelect.val();
    const currentClass = this.classSelect.val();
    
    // Clear current options
    this.classSelect.empty();
    
    if (selectedRace === 'Human') {
      // Special case for Human: exclude race-as-class options
      this.originalClassOptions.each((index, option) => {
        const $option = $(option);
        const classValue = $option.val();
        
        // Exclude race-as-class options for humans
        if (!this.raceClasses.includes(classValue)) {
          this.classSelect.append($option.clone());
        }
      });
    } else if (selectedRace && this.raceClassRestrictions[selectedRace] && this.raceClassRestrictions[selectedRace].length > 0) {
      // Other races with specific restrictions - only show allowed classes
      const allowedClasses = this.raceClassRestrictions[selectedRace];
      
      this.originalClassOptions.each((index, option) => {
        const $option = $(option);
        const classValue = $option.val();
        
        if (allowedClasses.includes(classValue)) {
          this.classSelect.append($option.clone());
        }
      });
    } else {
      // No restrictions - show all classes
      this.classSelect.append(this.originalClassOptions.clone());
    }
    
    // Try to maintain current selection if it's still valid
    if (this.classSelect.find(`option[value="${currentClass}"]`).length > 0) {
      this.classSelect.val(currentClass);
    } else {
      // Current class is not valid for this race, default to Fighter if available
      if (selectedRace === 'Human') {
        // For humans, default to Fighter (which is always available and not a race-class)
        this.classSelect.val('Fighter');
      } else if (selectedRace && this.raceClassRestrictions[selectedRace] && this.raceClassRestrictions[selectedRace].length > 0) {
        const allowedClasses = this.raceClassRestrictions[selectedRace];
        if (allowedClasses.includes('Fighter')) {
          this.classSelect.val('Fighter');
        } else {
          // If Fighter not available, use the first allowed class
          this.classSelect.val(allowedClasses[0] || '');
        }
      } else {
        // No restrictions, default to Fighter
        this.classSelect.val('Fighter');
      }
    }
  }

  /**
   * Update skill layout when race/class changes
   */
  updateSkillLayout() {
    // Call the character sheet's updateSkillLayout method if available
    if (this.characterSheet && typeof this.characterSheet.updateSkillLayout === 'function') {
      setTimeout(() => {
        this.characterSheet.updateSkillLayout(this.html);
      }, 10);
    }
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    this.classSelect.off("change");
    this.raceSelect.off("change");
  }
}
