import { getMaximumLevel, isClassAvailableForRace, getRaceClassPolicy } from '../../../../config/progression.js';

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
    
    // Store original class options for restoration
    this.originalClassOptions = this.classSelect.find('option').clone();
  }

  /**
   * Initialize race/class synchronization
   */
  initialize() {
    this.classSelect.on("change", this.handleClassChange.bind(this));
    this.raceSelect.on("change", this.handleRaceChange.bind(this));
    
    // Add level input validation
    const levelInput = this.html.find('input[name="system.level"]');
    levelInput.on("change input", this.handleLevelChange.bind(this));
    
    // Only sync race field if no race restrictions exist
    if (!this.raceSelect.val()) {
      this.syncRaceField();
    }
    this.filterClassOptions(); // Apply initial filtering
    this.validateLevelRestrictions(); // Apply initial level restrictions
  }

  /**
   * Handle class selection changes
   */
  handleClassChange() {
    // Prevent infinite loops during race change handling
    if (this._handlingRaceChange) return;
    
    // Only sync race field if no race restrictions exist (avoids conflicts)
    if (!this.raceSelect.val()) {
      this.syncRaceField();
    }
    
    // Update skill layout when class changes (with delay to prevent loops)
    this.updateSkillLayout();
    
    // Validate level restrictions for race-as-class combinations
    this.validateLevelRestrictions();
  }

  /**
   * Handle race selection changes
   */
  handleRaceChange() {
    this._handlingRaceChange = true;
    try {
      this.filterClassOptions();
      
      // Update skill layout when race changes (with delay to prevent loops)
      this.updateSkillLayout();
      
      // Validate level restrictions for race-as-class combinations
      this.validateLevelRestrictions();
    } finally {
      this._handlingRaceChange = false;
    }
  }

  /**
   * Handle level input changes to enforce restrictions
   */
  handleLevelChange(event) {
    const selectedRace = this.raceSelect.val();
    const selectedClass = this.classSelect.val();
    const levelInput = $(event.target);
    const enteredLevel = parseInt(levelInput.val()) || 1;
    
    if (selectedRace && selectedClass) {
      const maxLevel = getMaximumLevel(selectedClass, selectedRace);
      
      if (enteredLevel > maxLevel) {
        levelInput.val(maxLevel);
        // Show a brief warning message
        ui.notifications.warn(`Maximum level for ${selectedClass} ${selectedRace} is ${maxLevel}`);
      }
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
        !selectedRace) {
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
    
    this.originalClassOptions.each((_index, option) => {
      const $option = $(option);
      const className = $option.val();
      const isPersistedChoice = className === this.actor.system.class && selectedRace === this.actor.system.race;
      if (isClassAvailableForRace(className, selectedRace) || isPersistedChoice) {
        const copy = $option.clone();
        const policy = getRaceClassPolicy(className, selectedRace);
        if (!policy.playerAllowed) copy.attr('title', policy.npcOnlyAtRefereeOption
          ? 'Referee-only NPC class; preserved existing character choice.'
          : 'Unavailable race/class pairing; preserved for manual correction.');
        this.classSelect.append(copy);
      }
    });
    
    // Try to maintain current selection if it's still valid
    if (this.classSelect.find(`option[value="${currentClass}"]`).length > 0) {
      this.classSelect.val(currentClass);
    } else {
      // Current class is not valid for this race, default to Fighter if available
      if (selectedRace === 'Human') {
        // For humans, default to Fighter (which is always available and not a race-class)
        this.classSelect.val('Fighter');
      } else if (selectedRace) {
        const allowedClasses = this.originalClassOptions.map((_i, option) => $(option).val()).get().filter(value => isClassAvailableForRace(value, selectedRace));
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
   * Validate and enforce level restrictions for race-as-class combinations
   */
  validateLevelRestrictions() {
    const selectedRace = this.raceSelect.val();
    const selectedClass = this.classSelect.val();
    const levelInput = this.html.find('input[name="system.level"]');
    
    if (selectedRace && selectedClass) {
      const maxLevel = getMaximumLevel(selectedClass, selectedRace);
      const currentLevel = parseInt(levelInput.val()) || 1;
      
      // Set max attribute on level input
      levelInput.attr('max', maxLevel);
      
      // If current level exceeds max, reduce to max
      if (currentLevel > maxLevel) {
        levelInput.val(maxLevel);
        // Trigger change event to update actor data
        levelInput.trigger('change');
      }
      
      // Add visual indicator or tooltip
      levelInput.attr('title', `Maximum level for ${selectedClass} ${selectedRace}: ${maxLevel}`);
    } else {
      // Remove restrictions for non-race-as-class combinations
      levelInput.removeAttr('max');
      levelInput.removeAttr('title');
    }
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    this.classSelect.off("change");
    this.raceSelect.off("change");
    const levelInput = this.html.find('input[name="system.level"]');
    levelInput.off("change input");
  }
}
