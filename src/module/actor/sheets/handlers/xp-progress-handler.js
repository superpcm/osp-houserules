/**
 * XPProgressHandler - Manages XP progress bar functionality and display
 */
export class XPProgressHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.xpInput = null;
    this.progressBar = null;
    this.nextLevelDisplay = null;
  }

  /**
   * Initialize the XP progress handler
   */
  initialize() {
    this.xpInput = this.html.find('#char-xp');
    this.progressBar = this.html.find('.xp-progress-bar');
    this.nextLevelDisplay = this.html.find('.next-level-xp');
    this.percentageDisplay = this.html.find('.xp-percentage');
    
    if (this.xpInput.length && this.progressBar.length) {
      this.bindEvents();
      this.updateProgressBar();
    }
  }

  /**
   * Bind events for XP input changes
   */
  bindEvents() {
    // Update progress bar when XP changes
    this.xpInput.on('input change', () => {
      setTimeout(() => this.updateProgressBar(), 0);
    });

    // Also listen for external updates (like from other handlers)
    this.html.on('xpChanged', () => {
      this.updateProgressBar();
    });
  }

  /**
   * Update the progress bar based on current XP and next level requirements
   */
  updateProgressBar() {
    if (!this.xpInput.length || !this.progressBar.length) return;

    const currentXP = parseInt(this.xpInput.val()) || 0;
    const nextLevelXP = this.getNextLevelXP();
    const currentLevelXP = this.getCurrentLevelXP();
    
    // Calculate progress within current level
    const xpInCurrentLevel = currentXP - currentLevelXP;
    const xpNeededForNextLevel = nextLevelXP - currentLevelXP;
    
    // Calculate percentage (0-100%)
    let progressPercentage = 0;
    if (xpNeededForNextLevel > 0) {
      progressPercentage = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNextLevel) * 100));
    }

    // Update progress bar width
    this.progressBar.css('width', `${progressPercentage}%`);

    // Update next level display
    this.nextLevelDisplay.text(nextLevelXP);

    // Update percentage display
    if (this.percentageDisplay.length) {
      this.percentageDisplay.text(Math.round(progressPercentage));
    }

    // Optional: Change bar color if at max level or over XP requirement
    if (currentXP >= nextLevelXP) {
      this.progressBar.css('background-color', '#16a34a'); // Darker green when complete
    } else {
      this.progressBar.css('background-color', '#22c55e'); // Bright green
    }
  }

  /**
   * Get XP required for next level based on class and current level
   */
  getNextLevelXP() {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(this.actor.system.level) || 1;
    
    // XP requirements table - you may need to adjust these based on your system
    const xpTables = {
      'Fighter': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000],
      'Cleric': [0, 1500, 3000, 6000, 13000, 27000, 55000, 110000, 225000, 450000, 675000, 900000, 1125000, 1350000],
      'Magic-User': [0, 2500, 5000, 10000, 22500, 40000, 60000, 90000, 135000, 250000, 375000, 750000, 1125000, 1500000],
      'Mage': [0, 2500, 5000, 10000, 22500, 40000, 60000, 90000, 135000, 250000, 375000, 750000, 1125000, 1500000],
      'Thief': [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000],
      'Dwarf': [0, 2200, 4400, 8800, 17000, 35000, 70000, 140000, 270000, 400000, 530000, 660000, 790000, 920000],
      'Elf': [0, 4000, 8000, 16000, 32000, 64000, 120000, 250000, 400000, 600000, 900000, 1200000, 1500000, 1800000],
      'Hobbit': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000]
    };

    const table = xpTables[characterClass] || xpTables['Fighter']; // Default to Fighter
    const nextLevel = Math.min(currentLevel + 1, table.length - 1);
    
    return table[nextLevel] || table[table.length - 1];
  }

  /**
   * Get XP required for current level
   */
  getCurrentLevelXP() {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(this.actor.system.level) || 1;
    
    // Same XP table as above
    const xpTables = {
      'Fighter': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000],
      'Cleric': [0, 1500, 3000, 6000, 13000, 27000, 55000, 110000, 225000, 450000, 675000, 900000, 1125000, 1350000],
      'Magic-User': [0, 2500, 5000, 10000, 22500, 40000, 60000, 90000, 135000, 250000, 375000, 750000, 1125000, 1500000],
      'Mage': [0, 2500, 5000, 10000, 22500, 40000, 60000, 90000, 135000, 250000, 375000, 750000, 1125000, 1500000],
      'Thief': [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000],
      'Dwarf': [0, 2200, 4400, 8800, 17000, 35000, 70000, 140000, 270000, 400000, 530000, 660000, 790000, 920000],
      'Elf': [0, 4000, 8000, 16000, 32000, 64000, 120000, 250000, 400000, 600000, 900000, 1200000, 1500000, 1800000],
      'Hobbit': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000]
    };

    const table = xpTables[characterClass] || xpTables['Fighter']; // Default to Fighter
    const levelIndex = Math.max(0, Math.min(currentLevel - 1, table.length - 1));
    
    return table[levelIndex] || 0;
  }

  /**
   * Get current progress information
   */
  getProgressInfo() {
    const currentXP = parseInt(this.xpInput.val()) || 0;
    const nextLevelXP = this.getNextLevelXP();
    const currentLevelXP = this.getCurrentLevelXP();
    
    return {
      currentXP: currentXP,
      nextLevelXP: nextLevelXP,
      currentLevelXP: currentLevelXP,
      progressPercentage: Math.min(100, Math.max(0, ((currentXP - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100))
    };
  }

  /**
   * Force a progress bar update (useful after external changes)
   */
  refresh() {
    this.updateProgressBar();
  }

  /**
   * Cleanup handler
   */
  destroy() {
    if (this.xpInput) {
      this.xpInput.off('input change');
    }
    if (this.html) {
      this.html.off('xpChanged');
    }
  }
}
