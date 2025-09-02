import { calculateXPModifier, getNextLevelXP, getXPTable } from "../../../../config/classes.js";

/**
 * XPProgressHandler - Manages XP progress bar functionality
 */
export class XPProgressHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.xpDisplay = null;
    this.xpAwardBtn = null;
    this.progressBar = null;
    this.nextLevelDisplay = null;
    this.isUpdatingXP = false; // Flag to prevent XP display overwrites during updates
  }

  /**
   * Initialize the XP progress handler
   */
  initialize() {


    // Initialize DOM elements
    this.progressBar = this.html.find('.xp-progress');
    this.levelXpProgress = this.html.find('.level-xp-progress');
    this.percentageDisplay = this.html.find('.xp-percentage');
    this.xpDisplay = this.html.find('.xp-display');
    this.nextLevelDisplay = this.html.find('.next-level-xp');
    this.nextLevelFormDisplay = this.html.find('.next-level-display'); // Static header next level field
    this.xpAwardBtn = this.html.find('.xp-award-btn');
    this.levelDisplay = this.html.find('.char-level-display');
    this.skillsLevelProgressRing = this.html.find('.skills-level-progress-ring');
    this.skillsLevelDisplay = this.html.find('.skills-level-display');
    this.staticLevelDisplay = this.html.find('.level-display'); // Static area level display
    this.staticLevelProgressBar = this.html.find('.level-progress-bar'); // Static area progress bar (changed from ring)





    this.bindEvents();

    // Update all progress displays if they exist, with retry for DOM readiness
    setTimeout(() => {
      // Re-find elements to ensure DOM is ready
      this.refreshElements();
      this.updateProgressBar();
    }, 250);
  }

  /**
   * Refresh element references (useful for DOM readiness)
   */
  refreshElements() {
    // Re-initialize DOM elements
    this.progressBar = this.html.find('.xp-progress');
    this.levelXpProgress = this.html.find('.level-xp-progress');
    this.percentageDisplay = this.html.find('.xp-percentage');
    this.xpDisplay = this.html.find('.xp-display');
    this.nextLevelDisplay = this.html.find('.next-level-xp');
    this.nextLevelFormDisplay = this.html.find('.next-level-display'); // Static header next level field
    this.xpAwardBtn = this.html.find('.xp-award-btn');
    this.levelDisplay = this.html.find('.char-level-display');
    this.skillsLevelProgressRing = this.html.find('.skills-level-progress-ring');
    this.skillsLevelDisplay = this.html.find('.skills-level-display');
    this.staticLevelDisplay = this.html.find('.level-display'); // Static area level display
    this.staticLevelProgressRing = this.html.find('.level-progress-ring'); // Static area progress ring



    // Bind XP display click now that we have the element
    if (this.xpDisplay.length) {

      // Set readonly status - XP field is now readonly for everyone
      this.xpDisplay.prop('readonly', true);
      this.xpDisplay.addClass('cs-cursor-pointer').removeClass('cs-cursor-text');

      // For both GMs and non-GMs, only open dialog on double-click
      this.xpDisplay.off('dblclick').on('dblclick', (e) => {

        e.preventDefault();
        this.showXPAwardDialog();
      });

    } else {

    }

    // Remove click event from static level display (no longer used for XP award)
    if (this.staticLevelDisplay.length) {
      this.staticLevelDisplay.off('click');

    }
  }

  /**
   * Bind events for XP award button
   */
  bindEvents() {
    // Bind XP award button click
    if (this.xpAwardBtn.length) {
      this.xpAwardBtn.on('click', (e) => {
        e.preventDefault();
        this.showXPAwardDialog();
      });
    }

    // Bind skills level display click (for XP award)
    if (this.skillsLevelDisplay.length) {
      this.skillsLevelDisplay.on('click', (e) => {
        e.preventDefault();
        this.showXPAwardDialog();
      });
    }

    // Bind static level display click (for XP award)
    if (this.staticLevelDisplay.length) {
      this.staticLevelDisplay.on('click', (e) => {
        e.preventDefault();
        this.showXPAwardDialog();
      });
    }

    // Listen for external updates (like from other handlers)
    this.html.on('xpChanged', () => {
      this.updateProgressBar();
    });

    // Listen for changes to the XP field directly
    this.html.on('change', '.char-xp', () => {

      setTimeout(() => this.updateProgressBar(), 50);
    });

    // Listen for actor updates (since level is now managed through dialog)
    if (this.actor) {
      this.actor.on?.('update', (actor, updateData) => {


        // If XP was updated, immediately update the display to prevent flash
        let skipXPUpdate = false;
        if (updateData.system?.xp !== undefined && this.xpDisplay.length) {
          this.xpDisplay.val(updateData.system.xp);
          skipXPUpdate = true; // Don't let updateProgressBar overwrite our manual update
        }

        // Then update progress bar with minimal delay, skipping XP update if we handled it
        setTimeout(() => this.updateProgressBar(skipXPUpdate), 10);
      });
    }

    // Listen for changes to XP field
    this.html.on('change', 'input[name="system.xp"]', () => {

      setTimeout(() => this.updateProgressBar(), 50);
    });

    // XP field is now readonly - removed direct editing functionality
    // Users must use the XP award dialog (double-click) to modify XP
  }

  /**
   * Show XP award dialog
   */
  async showXPAwardDialog() {
    const currentXP = parseInt(String(this.actor.system.xp).replace(/,/g, '')) || 0;
    const nextLevelXP = this.getNextLevelXP();
    const xpMod = this.getXPModifier();
    const currentLevel = parseInt(this.actor.system.level) || 1;

    // Check if user is a GM
    const isGM = game.user.isGM;

    // Create dialog content
    const content = `
      <div class="cs-xp-dialog-container">
        <div class="cs-xp-row">
          <div class="cs-xp-inline">
            <label for="xp-award-input"><strong>XP to Award:</strong></label>
            <input type="number" id="xp-award-input" value="" min="0" max="9999" class="cs-input-small" />
          </div>
        </div>
        <div class="cs-xp-flex">
          <div class="cs-xp-col">
            <div class="cs-xp-inline">
              <label for="current-xp-display"><strong>Current XP:</strong></label>
              ${isGM ? `<input type="number" id="current-xp-input" value="${currentXP}" min="0" max="999999" class="cs-input-medium" />` : `<span id="current-xp-display" class="cs-no-border">${currentXP}</span>`}
            </div>
            ${isGM ? `
            <div class="cs-xp-inline">
              <label for="level-input"><strong>Level:</strong></label>
              <select id="level-input" class="cs-select-inline">
                <option value="1" ${currentLevel === 1 ? 'selected' : ''}>1</option>
                <option value="2" ${currentLevel === 2 ? 'selected' : ''}>2</option>
                <option value="3" ${currentLevel === 3 ? 'selected' : ''}>3</option>
                <option value="4" ${currentLevel === 4 ? 'selected' : ''}>4</option>
                <option value="5" ${currentLevel === 5 ? 'selected' : ''}>5</option>
                <option value="6" ${currentLevel === 6 ? 'selected' : ''}>6</option>
                <option value="7" ${currentLevel === 7 ? 'selected' : ''}>7</option>
                <option value="8" ${currentLevel === 8 ? 'selected' : ''}>8</option>
                <option value="9" ${currentLevel === 9 ? 'selected' : ''}>9</option>
                <option value="10" ${currentLevel === 10 ? 'selected' : ''}>10</option>
                <option value="11" ${currentLevel === 11 ? 'selected' : ''}>11</option>
                <option value="12" ${currentLevel === 12 ? 'selected' : ''}>12</option>
                <option value="13" ${currentLevel === 13 ? 'selected' : ''}>13</option>
                <option value="14" ${currentLevel === 14 ? 'selected' : ''}>14</option>
              </select>
            </div>
            ` : `
            <div class="cs-xp-inline">
              <label><strong>Level:</strong></label>
              <span class="cs-no-border">${currentLevel}</span>
            </div>
            `}
          </div>
          <div class="cs-xp-side">
            <div class="cs-xp-side-row">
              <strong>Next Level XP:</strong> <span id="next-level-xp-display" class="cs-no-border">${nextLevelXP}</span>
            </div>
            <div class="cs-xp-side-row">
              <strong>XP Modifier:</strong> <span class="cs-no-border">${xpMod >= 0 ? '+' : ''}${xpMod}%</span>
            </div>
          </div>
        </div>
  <div id="xp-preview" class="cs-xp-preview">
          <div><strong>Base XP:</strong> <span id="base-xp">0</span></div>
          <div><strong>Modified XP:</strong> <span id="modified-xp">0</span></div>
          <div><strong>New Total:</strong> <span id="new-total">${currentXP}</span></div>
        </div>
      </div>
    `;

    // Create and show dialog
    new Dialog({
      title: "Award Experience Points",
      content: content,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "OK",
          callback: async (html) => {
            this.isUpdatingXP = true; // Prevent other updates from overwriting display
            window.xpHandlerUpdating = true; // Prevent inline script interference

            const awardedXP = parseInt(html.find('#xp-award-input').val()) || 0;
            let updateData = {};

            // Handle GM-only editable fields
            if (isGM) {
              const newCurrentXP = parseInt(html.find('#current-xp-input').val()) || 0;
              const newLevel = parseInt(html.find('#level-input').val()) || 1;

              // Update current XP and level if changed
              if (newCurrentXP !== currentXP) {
                updateData['system.xp'] = newCurrentXP;
                // Immediately update the display to prevent flash
                if (this.xpDisplay.length) {
                  this.xpDisplay.val(newCurrentXP);
                }
              }
              if (newLevel !== currentLevel) {
                updateData['system.level'] = newLevel;
              }

              if (Object.keys(updateData).length > 0) {

                await this.actor.update(updateData);
                // Force progress bar update after level/XP change (skip XP display since we handle it)
                setTimeout(() => this.updateProgressBar(updateData['system.xp'] !== undefined), 50);
              }
            }

            // Award XP if specified
            if (awardedXP > 0) {
              await this.awardXP(awardedXP);
            } else if (Object.keys(updateData).length > 0) {
              // If we only changed level/XP without awarding, still refresh the progress bar
              setTimeout(() => this.updateProgressBar(updateData['system.xp'] !== undefined), 50);
            }

            // Re-enable automatic updates after a short delay
            setTimeout(() => {
              this.isUpdatingXP = false;
              window.xpHandlerUpdating = false;
            }, 150);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "ok",
      render: (html) => {
        const self = this; // Capture the XPProgressHandler instance

        // Apply minimal styling to dialog by adding a class that SCSS targets
        const dialogWindow = html.closest('.app.window-app');
        if (dialogWindow.length) {
          dialogWindow.addClass('cs-xp-dialog');
        }

        // Update preview when input changes
        const input = html.find('#xp-award-input');
        const preview = html.find('#xp-preview');
        const baseXPSpan = html.find('#base-xp');
        const modifiedXPSpan = html.find('#modified-xp');
        const newTotalSpan = html.find('#new-total');
        const currentXPInput = html.find('#current-xp-input');
        const levelInput = html.find('#level-input');
        const nextLevelXPDisplay = html.find('#next-level-xp-display');

        const updatePreview = () => {
          const baseXP = parseInt(input.val()) || 0;
          if (baseXP > 0) {
            const currentXPValue = isGM ? (parseInt(currentXPInput.val()) || 0) : currentXP;
            const modifiedXP = Math.floor(baseXP * (1 + xpMod / 100));
            const newTotal = currentXPValue + modifiedXP;

            baseXPSpan.text(baseXP);
            modifiedXPSpan.text(modifiedXP);
            newTotalSpan.text(newTotal);
            preview.show();
          } else {
            preview.hide();
          }
        };

        input.on('input', updatePreview);

        // Update preview when GM changes current XP
        if (isGM) {
          currentXPInput.on('input', updatePreview);

          // Update Next Level XP when level changes
          levelInput.on('change', () => {
            const selectedLevel = parseInt(levelInput.val()) || 1;
            const newNextLevelXP = self.getNextLevelXPForLevel(selectedLevel);

            nextLevelXPDisplay.text(newNextLevelXP);
            updatePreview(); // Also update the preview in case XP award is set
          });
        }

        // Focus the input
        input.focus();

        // Handle Enter key
        input.on('keypress', (e) => {
          if (e.which === 13) { // Enter key
            html.parent().find('.dialog-button.ok').click();
          }
        });
      }
    }).render(true);
  }

  /**
   * Award XP to the character
   */
  async awardXP(baseXP) {
    this.isUpdatingXP = true; // Prevent other updates from overwriting display
    window.xpHandlerUpdating = true; // Prevent inline script interference

    const xpMod = this.getXPModifier();
    const modifiedXP = Math.floor(baseXP * (1 + xpMod / 100));
    const currentXP = parseInt(String(this.actor.system.xp).replace(/,/g, '')) || 0;
    const newXP = currentXP + modifiedXP;



    // Immediately update the display first to prevent flash
    if (this.xpDisplay.length) {
      this.xpDisplay.val(newXP);
    }

    // Update the actor's XP
    await this.actor.update({ 'system.xp': newXP });

    // Ensure display stays updated (redundant but safe)
    if (this.xpDisplay.length) {
      this.xpDisplay.val(newXP);
    }

    // Trigger progress bar update (skip XP display update since we handle it manually)
    this.updateProgressBar(true);

    // Show notification
    ui.notifications.info(`Awarded ${baseXP} XP (${modifiedXP} after ${xpMod >= 0 ? '+' : ''}${xpMod}% modifier). New total: ${newXP}`);

    // Re-enable automatic updates after a short delay
    setTimeout(() => {
      this.isUpdatingXP = false;
      window.xpHandlerUpdating = false;
    }, 100);
  }

  /**
   * Get XP modifier percentage based on character attributes and class
   * This matches the logic used in the template helper and actor calculation
   */
  getXPModifier() {
    const characterClass = this.actor.system.class || '';
    const attributes = this.actor.system.attributes || {};
    
    return calculateXPModifier(characterClass, attributes);
  }

  /**
   * Update the progress bar based on current XP and next level requirements
   */
  updateProgressBar(skipXPDisplayUpdate = false) {

    const currentXP = parseInt(String(this.actor.system.xp).replace(/,/g, '')) || 0;
    const currentLevel = parseInt(this.actor.system.level) || 1;
    const characterClass = this.actor.system.class || 'Fighter';
    const nextLevelXP = this.getNextLevelXP();
    const currentLevelXP = this.getCurrentLevelXP();

    // Calculate progress toward next level as percentage between current and next level XP requirements
    // This shows: "How much progress have I made from my current level toward the next level?"
    let progressPercentage = 0;
    if (nextLevelXP > currentLevelXP && nextLevelXP > 0 && currentLevelXP >= 0) {
      const xpInCurrentLevel = currentXP - currentLevelXP;
      const xpNeededForNextLevel = nextLevelXP - currentLevelXP;
      
      if (xpNeededForNextLevel > 0) {
        progressPercentage = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNextLevel) * 100));
      }
    }



    // Update horizontal progress bar (if it exists)
    if (this.progressBar.length) {
      // Use CSS variable for width and color so presentation stays in CSS
      try {
        this.progressBar[0].style.setProperty('--xp-progress-width', `${progressPercentage}%`);
        this.progressBar[0].style.setProperty('--xp-progress-color', currentXP >= nextLevelXP ? 'rgba(112, 66, 21, 0.9)' : 'rgba(112, 66, 21, 0.8)');
      } catch (e) {
        // Fallback to direct style assignment when setProperty is unavailable
        if (this.progressBar[0]) {
          this.progressBar[0].style.width = `${progressPercentage}%`;
          this.progressBar[0].style.backgroundColor = currentXP >= nextLevelXP ? 'rgba(112, 66, 21, 0.9)' : 'rgba(112, 66, 21, 0.8)';
        }
      }
    }

    // Update vertical level field progress bar (if it exists)
    if (this.levelXpProgress.length) {
      // Set CSS variables for width, right-radius and background
      const rightRadius = (progressPercentage >= 90) ? `${Math.min(9, ((progressPercentage - 90) / 10) * 9)}px` : '0px';
      try {
        this.levelXpProgress[0].style.setProperty('--level-height', `${progressPercentage}%`);
        this.levelXpProgress[0].style.setProperty('--progress-top-radius', rightRadius);
        this.levelXpProgress[0].style.setProperty('--level-bg', currentXP >= nextLevelXP ? 'linear-gradient(to right, rgba(112, 66, 21, 0.2) 0%, rgba(112, 66, 21, 0.2) 100%)' : 'linear-gradient(to right, rgba(112, 66, 21, 0.2) 0%, rgba(112, 66, 21, 0.2) 100%)');
      } catch (e) {
        // Fallback to direct style properties
        if (this.levelXpProgress[0]) {
          this.levelXpProgress[0].style.width = `${progressPercentage}%`;
          // apply right radius to both corners for visual parity
          this.levelXpProgress[0].style.borderTopRightRadius = rightRadius;
          this.levelXpProgress[0].style.borderBottomRightRadius = rightRadius;
          this.levelXpProgress[0].style.background = currentXP >= nextLevelXP ? 'linear-gradient(to right, rgba(112, 66, 21, 0.2) 0%, rgba(112, 66, 21, 0.2) 100%)' : 'linear-gradient(to right, rgba(112, 66, 21, 0.2) 0%, rgba(112, 66, 21, 0.2) 100%)';
        }
      }
    }

    // Update next level display
    if (this.nextLevelDisplay.length) {
      this.nextLevelDisplay.text(nextLevelXP);
    }

    // Update next level form display in static header
    if (this.nextLevelFormDisplay.length) {
      this.nextLevelFormDisplay.val(nextLevelXP);
    }

    // Update level display
    if (this.levelDisplay.length) {
      this.levelDisplay.text(this.actor.system.level || 1);
    }

    // Update percentage display
    if (this.percentageDisplay.length) {
      this.percentageDisplay.text(Math.round(progressPercentage) + '%');
    }

    // Update XP display if it exists (use .val() for input fields)
    if (this.xpDisplay.length && !skipXPDisplayUpdate && !this.isUpdatingXP) {
      this.xpDisplay.val(currentXP);
    }

    // Update skills tab progress ring (if it exists)
    if (this.skillsLevelProgressRing.length) {
      // Calculate stroke-dashoffset for progress ring
      const circumference = 2 * Math.PI * 32.5; // 2Ãc0r where r = 32.5
      const offset = circumference - (progressPercentage / 100) * circumference;
      try {
        // SVG attributes work best with setAttribute
        this.skillsLevelProgressRing[0].setAttribute('stroke-dashoffset', String(offset));
      } catch (e) {
        // Fallback to style property
        if (this.skillsLevelProgressRing[0]) this.skillsLevelProgressRing[0].style.strokeDashoffset = offset;
      }
    }

    // Update skills level display
    if (this.skillsLevelDisplay.length) {
      this.skillsLevelDisplay.text(this.actor.system.level || 1);
    }

    // Update static level progress ring (if it exists)

    // Update static level progress bar
    if (this.staticLevelProgressBar.length) {
      try {
        this.staticLevelProgressBar[0].style.setProperty('--static-level-width', `${progressPercentage}%`);
      } catch (e) {
        if (this.staticLevelProgressBar[0]) this.staticLevelProgressBar[0].style.width = `${progressPercentage}%`;
      }
    }

    // Update static level display
    if (this.staticLevelDisplay.length) {
      this.staticLevelDisplay.text(this.actor.system.level || 1);
    }
  }

  /**
   * Get XP required for next level based on class and specified level
   */
  getNextLevelXPForLevel(level) {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(level) || 1;
    
    return getNextLevelXP(characterClass, currentLevel);
  }

  /**
   * Get XP required for next level based on class and current level
   */
  getNextLevelXP() {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(this.actor.system.level) || 1; // Use actual level field, not calculated from XP
    
    return getNextLevelXP(characterClass, currentLevel);
  }

  /**
   * Get XP required for current level
   */
  getCurrentLevelXP() {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(this.actor.system.level) || 1; // Use actual level field, not calculated from XP
    
    // Use centralized config for consistency
    const nextLevelXP = getNextLevelXP(characterClass, currentLevel);
    const prevLevelXP = currentLevel > 1 ? getNextLevelXP(characterClass, currentLevel - 1) : 0;
    
    return prevLevelXP;
  }

  /**
   * Get current progress information
   */
  getProgressInfo() {
    const currentXP = parseInt(this.actor.system.xp) || 0;
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
   * Test the progress bar with a specific percentage (for debugging)
   */
  testProgressBar(percentage = 50) {

    if (this.levelXpProgress.length) {
      try {
        this.levelXpProgress[0].style.setProperty('--level-height', `${percentage}%`);
        this.levelXpProgress[0].style.setProperty('--level-bg', 'linear-gradient(to right, rgba(112, 66, 21, 0.2) 0%, rgba(112, 66, 21, 0.2) 100%)');
      } catch (e) {
        if (this.levelXpProgress[0]) {
          this.levelXpProgress[0].style.width = `${percentage}%`;
          try {
            this.levelXpProgress[0].style.setProperty('--level-bg', 'linear-gradient(to right, rgba(112, 66, 21, 0.2) 0%, rgba(112, 66, 21, 0.2) 100%)');
          } catch (e2) {
            this.levelXpProgress[0].style.background = 'linear-gradient(to right, rgba(112, 66, 21, 0.2) 0%, rgba(112, 66, 21, 0.2) 100%)';
          }
        }
      }

    } else {

    }
  }

  /**
   * Cleanup handler
   */
  destroy() {
    if (this.xpAwardBtn) {
      this.xpAwardBtn.off('click');
    }
    if (this.html) {
      this.html.off('xpChanged');
    }
  }
}
