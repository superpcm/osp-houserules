/**
 * XPProgressHandler - Manages XP progress bar functionalit    // Listen for changes to XP field
    this.html.on('change', 'input[name="system.xp"]', () => {
      console.log('XP field changed, updating progress bar...');
      setTimeout(() => this.updateProgressBar(), 50);
    });
  }rd system
 */
export class XPProgressHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.xpDisplay = null;
    this.xpAwardBtn = null;
    this.progressBar = null;
    this.nextLevelDisplay = null;
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
    this.xpAwardBtn = this.html.find('.xp-award-btn');
    this.levelDisplay = this.html.find('.char-level-display');
    
    console.log('XP Progress Handler - Elements found:', {
      xpDisplay: this.xpDisplay.length,
      xpAwardBtn: this.xpAwardBtn.length,
      progressBar: this.progressBar.length,
      levelXpProgress: this.levelXpProgress.length,
      nextLevelDisplay: this.nextLevelDisplay.length,
      percentageDisplay: this.percentageDisplay.length,
      levelDisplay: this.levelDisplay.length
    });
    
    this.bindEvents();
    
    // Update both progress bars if they exist
    if (this.progressBar.length || this.levelXpProgress.length) {
      // Force immediate update with delay to ensure DOM is ready
      setTimeout(() => {
        this.updateProgressBar();
      }, 250);
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

    // Listen for external updates (like from other handlers)
    this.html.on('xpChanged', () => {
      this.updateProgressBar();
    });

    // Listen for changes to the XP field directly
    this.html.on('change', '.char-xp', () => {
      console.log('XP field changed, updating progress bar...');
      setTimeout(() => this.updateProgressBar(), 50);
    });

    // Listen for actor updates (since level is now managed through dialog)
    if (this.actor) {
      this.actor.on?.('update', () => {
        console.log('Actor updated, refreshing progress bar...');
        setTimeout(() => this.updateProgressBar(), 50);
      });
    }

    // Listen for changes to XP field
    this.html.on('change', 'input[name="system.xp"]', () => {
      console.log('XP field changed, updating progress bar...');
      setTimeout(() => this.updateProgressBar(), 50);
    });
  }

  /**
   * Show XP award dialog
   */
  async showXPAwardDialog() {
    const currentXP = parseInt(this.actor.system.xp) || 0;
    const nextLevelXP = this.getNextLevelXP();
    const xpMod = this.getXPModifier();
    const currentLevel = parseInt(this.actor.system.level) || 1;
    
    // Check if user is a GM
    const isGM = game.user.isGM;
    
    // Create dialog content
    const content = `
      <div style="padding: 10px; display: flex; gap: 20px;">
        <div style="flex: 1;">
          <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
            <label for="current-xp-display"><strong>Current XP:</strong></label>
            ${isGM ? `<input type="number" id="current-xp-input" value="${currentXP}" min="0" max="999999" style="width: 80px; padding: 5px; background-color: white !important; border: 1px solid black; border-radius: 9px; box-shadow: inset 3px 3px 6px rgba(0,0,0,0.15), inset -2px -2px 3px rgba(255,255,255,0.8); text-align: center;" />` : `<span id="current-xp-display">${currentXP}</span>`}
          </div>
          ${isGM ? `
          <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
            <label for="level-input"><strong>Level:</strong></label>
            <select id="level-input" style="width: 60px; padding: 5px; background-color: white !important; border: 1px solid black; border-radius: 9px; box-shadow: inset 3px 3px 6px rgba(0,0,0,0.15), inset -2px -2px 3px rgba(255,255,255,0.8); text-align: center; line-height: 1.2; appearance: none; -webkit-appearance: none; -moz-appearance: none;">
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
          ` : ''}
          <div style="margin-bottom: 10px;">
            <strong>Next Level XP:</strong> <span id="next-level-xp-display">${nextLevelXP}</span>
          </div>
          <div style="margin-bottom: 10px;">
            <strong>XP Modifier:</strong> ${xpMod >= 0 ? '+' : ''}${xpMod}%
          </div>
          <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
            <label for="xp-award-input"><strong>XP to Award:</strong></label>
            <input type="number" id="xp-award-input" value="" min="0" max="9999" style="width: 60px; padding: 5px; background-color: white !important; border: 1px solid black; border-radius: 9px; box-shadow: inset 3px 3px 6px rgba(0,0,0,0.15), inset -2px -2px 3px rgba(255,255,255,0.8); text-align: center;" />
          </div>
        </div>
        <div id="xp-preview" style="flex: 1; padding: 8px; background: #f5f5f5; border-radius: 3px; display: none;">
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
            const awardedXP = parseInt(html.find('#xp-award-input').val()) || 0;
            let updateData = {};
            
            // Handle GM-only editable fields
            if (isGM) {
              const newCurrentXP = parseInt(html.find('#current-xp-input').val()) || 0;
              const newLevel = parseInt(html.find('#level-input').val()) || 1;
              
              // Update current XP and level if changed
              if (newCurrentXP !== currentXP) {
                updateData['system.xp'] = newCurrentXP;
              }
              if (newLevel !== currentLevel) {
                updateData['system.level'] = newLevel;
              }
              
              if (Object.keys(updateData).length > 0) {
                console.log('Updating actor with:', updateData);
                await this.actor.update(updateData);
                // Force progress bar update after level/XP change
                setTimeout(() => this.updateProgressBar(), 100);
              }
            }
            
            // Award XP if specified
            if (awardedXP > 0) {
              this.awardXP(awardedXP);
            } else if (Object.keys(updateData).length > 0) {
              // If we only changed level/XP without awarding, still refresh the progress bar
              setTimeout(() => this.updateProgressBar(), 100);
            }
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
        
        // Apply character sheet background styling to dialog
        const dialogWindow = html.closest('.app.window-app');
        if (dialogWindow.length) {
          dialogWindow.css({
            'background': 'transparent',
            'background-image': 'url("systems/osp-houserules/assets/backgrounds/character-sheet-background.jpg")',
            'background-repeat': 'no-repeat',
            'background-size': 'cover',
            'background-position': 'center'
          });
          
          // Style the window header to be black
          const windowHeader = dialogWindow.find('.window-header');
          if (windowHeader.length) {
            windowHeader.css({
              'background': 'black',
              'background-color': 'black'
            });
          }
          
          // Also style the window content
          const windowContent = dialogWindow.find('.window-content');
          if (windowContent.length) {
            windowContent.css({
              'background': 'transparent',
              'background-color': 'transparent'
            });
          }
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
            console.log(`Level changed to ${selectedLevel}, Next Level XP: ${newNextLevelXP}`);
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
    const xpMod = this.getXPModifier();
    const modifiedXP = Math.floor(baseXP * (1 + xpMod / 100));
    const currentXP = parseInt(this.actor.system.xp) || 0;
    const newXP = currentXP + modifiedXP;

    // Update the actor's XP
    await this.actor.update({ 'system.xp': newXP });
    
    // Update the display
    this.xpDisplay.text(newXP);
    
    // Trigger progress bar update
    this.updateProgressBar();
    
    // Show notification
    ui.notifications.info(`Awarded ${baseXP} XP (${modifiedXP} after ${xpMod >= 0 ? '+' : ''}${xpMod}% modifier). New total: ${newXP}`);
  }

  /**
   * Get XP modifier percentage based on character attributes and class
   * This matches the logic used in the template helper and actor calculation
   */
  getXPModifier() {
    const characterClass = this.actor.system.class || '';
    const attributes = this.actor.system.attributes || {};
    
    // Prime requisite mapping for each class (matches ose.js and actor.js)
    const primeRequisites = {
      // Core OSE classes
      'fighter': ['str'],
      'cleric': ['wis'], 
      'magic-user': ['int'],
      'thief': ['dex'],
      
      // Advanced Fantasy classes
      'assassin': ['str', 'dex'],       // Assassins need both STR and DEX
      'barbarian': ['str', 'con'],      // Barbarians need STR and CON
      'bard': ['dex', 'cha'],           // Bards need DEX and CHA
      'beast master': ['str', 'wis'],   // Beast Masters need STR and WIS
      'druid': ['wis'],                 // Druids use WIS like clerics
      'knight': ['str'],                // Knights use STR like fighters
      'paladin': ['str', 'cha'],        // Paladins need STR and CHA
      'ranger': ['str', 'wis'],         // Rangers need STR and WIS
      'warden': ['str', 'con'],         // Wardens need STR and CON
      
      // Magic users and variants
      'illusionist': ['int'],           // Illusionists use INT
      'mage': ['int'],                  // Mages use INT like magic-users
      
      // Race-as-class options
      'dwarf': ['str'],                 // Dwarf class uses STR
      'elf': ['int', 'str'],            // Elf class needs INT and STR
      'gnome': ['int'],                 // Gnome class uses INT
      'half-elf': ['str', 'int'],       // Half-Elf class needs STR and INT
      'half-orc': ['str'],              // Half-Orc class uses STR
      'hobbit': ['dex', 'str']          // Hobbit class needs DEX and STR
    };

    const classReqs = primeRequisites[characterClass.toLowerCase()] || ['str'];
    
    // Get all prime requisite scores
    const primeScores = classReqs.map(req => parseInt(attributes[req]?.value) || 10);
    
    // Standard AF/OSE XP modifier rules:
    // - If ANY prime requisite ≤ 8 → −10% XP
    // - Else if ALL prime requisites ≥ 18 → +15% XP  
    // - Else if ALL prime requisites ≥ 16 → +10% XP
    // - Else if ALL prime requisites ≥ 13 → +5% XP
    // - Else → 0%
    
    // Check if ANY prime is ≤ 8
    if (primeScores.some(score => score <= 8)) {
      return -10;
    }
    
    // Check if ALL primes are ≥ 18
    if (primeScores.every(score => score >= 18)) {
      return 15;
    }
    
    // Check if ALL primes are ≥ 16
    if (primeScores.every(score => score >= 16)) {
      return 10;
    }
    
    // Check if ALL primes are ≥ 13
    if (primeScores.every(score => score >= 13)) {
      return 5;
    }
    
    // Otherwise, no modifier
    return 0;
  }

  /**
   * Update the progress bar based on current XP and next level requirements
   */
  updateProgressBar() {
    const currentXP = parseInt(this.actor.system.xp) || 0;
    const currentLevel = parseInt(this.actor.system.level) || 1;
    const characterClass = this.actor.system.class || 'Fighter';
    const nextLevelXP = this.getNextLevelXP();
    const currentLevelXP = this.getCurrentLevelXP();
    
    // Calculate progress toward next level as a total percentage
    // This shows: "How much of the XP needed for next level do I have?"
    let progressPercentage = 0;
    if (nextLevelXP > 0) {
      progressPercentage = Math.min(100, Math.max(0, (currentXP / nextLevelXP) * 100));
    }

    console.log('XP Progress Debug:', {
      currentXP,
      currentLevel,
      characterClass,
      nextLevelXP,
      currentLevelXP,
      progressPercentage: Math.round(progressPercentage),
      calculation: `${currentXP} / ${nextLevelXP} = ${(currentXP / nextLevelXP * 100).toFixed(1)}%`,
      oldCalculationWouldBe: `(${currentXP} - ${currentLevelXP}) / (${nextLevelXP} - ${currentLevelXP}) = ${((currentXP - currentLevelXP) / (nextLevelXP - currentLevelXP) * 100).toFixed(1)}%`,
      levelXpProgressFound: this.levelXpProgress.length
    });

    // Update horizontal progress bar (if it exists)
    if (this.progressBar.length) {
      this.progressBar.css('width', `${progressPercentage}%`);
      
      // Optional: Change bar color if at max level or over XP requirement
      if (currentXP >= nextLevelXP) {
        this.progressBar.css('background-color', '#16a34a'); // Darker green when complete
      } else {
        this.progressBar.css('background-color', '#22c55e'); // Bright green
      }
    }

    // Update vertical level field progress bar (if it exists)
    if (this.levelXpProgress.length) {
      console.log('Updating level XP progress bar height to:', `${progressPercentage}%`);
      this.levelXpProgress.css('height', `${progressPercentage}%`);
      
      // Calculate top border radius based on progress (gradual transition starting at 90%)
      let topRadius = 0;
      if (progressPercentage >= 90) {
        // Linear interpolation: at 90% = 0px, at 100% = 9px
        const radiusProgress = (progressPercentage - 90) / 10; // 0 to 1 scale
        topRadius = Math.min(9, radiusProgress * 9); // 0px to 9px
      }
      
      // Update the CSS custom property for top border radius
      this.levelXpProgress.css('--progress-top-radius', `${topRadius}px`);
      
      // Set background color based on progress
      if (currentXP >= nextLevelXP) {
        this.levelXpProgress.css('background', 'linear-gradient(to top, #16a34a 0%, #22c55e 100%)'); // Darker green when complete
      } else {
        this.levelXpProgress.css('background', 'linear-gradient(to top, #22c55e 0%, #4ade80 100%)'); // Green gradient
      }
    } else {
      console.log('Level XP progress element not found!');
    }

    // Update next level display
    if (this.nextLevelDisplay.length) {
      this.nextLevelDisplay.text(nextLevelXP);
    }

    // Update level display
    if (this.levelDisplay.length) {
      this.levelDisplay.text(this.actor.system.level || 1);
    }

    // Update percentage display
    if (this.percentageDisplay.length) {
      this.percentageDisplay.text(Math.round(progressPercentage) + '%');
    }

    // Update XP display if it exists
    if (this.xpDisplay.length) {
      this.xpDisplay.text(currentXP);
    }
  }

  /**
   * Get XP required for next level based on class and specified level
   */
  getNextLevelXPForLevel(level) {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(level) || 1;
    
    // XP requirements table - matches ose.js
    const xpTables = {
      'fighter': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000, 960000],
      'cleric': [0, 1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000],
      'magic-user': [0, 2500, 5000, 10000, 20000, 40000, 80000, 150000, 300000, 450000, 600000, 750000, 900000, 1050000, 1200000],
      'thief': [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000, 880000]
    };

    // Map additional classes to their XP patterns - matches ose.js
    const classXPMapping = {
      // Core OSE classes
      'fighter': 'fighter',
      'cleric': 'cleric', 
      'magic-user': 'magic-user',
      'thief': 'thief',
      
      // Advanced Fantasy classes - map to appropriate base class XP tables
      'assassin': 'thief',          // Assassins use thief XP
      'barbarian': 'fighter',       // Barbarians use fighter XP
      'bard': 'thief',              // Bards use thief XP
      'beast master': 'fighter',    // Beast Masters use fighter XP
      'druid': 'cleric',            // Druids use cleric XP
      'knight': 'fighter',          // Knights use fighter XP
      'paladin': 'cleric',          // Paladins use cleric XP
      'ranger': 'fighter',          // Rangers use fighter XP
      'warden': 'fighter',          // Wardens use fighter XP
      
      // Magic users and variants
      'illusionist': 'magic-user',  // Illusionists use magic-user XP
      'mage': 'magic-user',         // Mages use magic-user XP
      
      // Race-as-class options
      'dwarf': 'fighter',           // Dwarf class uses fighter XP
      'elf': 'magic-user',          // Elf class uses magic-user XP (fighter/magic-user hybrid)
      'gnome': 'cleric',            // Gnome class uses cleric XP
      'half-elf': 'fighter',        // Half-Elf class uses fighter XP
      'half-orc': 'fighter',        // Half-Orc class uses fighter XP
      'hobbit': 'thief'             // Hobbit class uses thief XP
    };

    // Get the appropriate XP table for this class
    const mappedClass = classXPMapping[characterClass?.toLowerCase()] || 'fighter';
    const table = xpTables[mappedClass];
    
    // Get next level XP (currentLevel index = nextLevel - 1)
    const nextLevel = Math.min(currentLevel + 1, 15); // Max level 15
    const nextLevelIndex = nextLevel - 1; // Convert to array index
    
    return table[nextLevelIndex] || table[14]; // Use max level XP if beyond table
  }

  /**
   * Get XP required for next level based on class and current level
   */
  getNextLevelXP() {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(this.actor.system.level) || 1; // Use actual level field, not calculated from XP
    
    // XP requirements table - matches ose.js
    const xpTables = {
      'fighter': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000, 960000],
      'cleric': [0, 1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000],
      'magic-user': [0, 2500, 5000, 10000, 20000, 40000, 80000, 150000, 300000, 450000, 600000, 750000, 900000, 1050000, 1200000],
      'thief': [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000, 880000]
    };

    // Map additional classes to their XP patterns - matches ose.js
    const classXPMapping = {
      // Core OSE classes
      'fighter': 'fighter',
      'cleric': 'cleric', 
      'magic-user': 'magic-user',
      'thief': 'thief',
      
      // Advanced Fantasy classes - map to appropriate base class XP tables
      'assassin': 'thief',          // Assassins use thief XP
      'barbarian': 'fighter',       // Barbarians use fighter XP
      'bard': 'thief',              // Bards use thief XP
      'beast master': 'fighter',    // Beast Masters use fighter XP
      'druid': 'cleric',            // Druids use cleric XP
      'knight': 'fighter',          // Knights use fighter XP
      'paladin': 'cleric',          // Paladins use cleric XP
      'ranger': 'fighter',          // Rangers use fighter XP
      'warden': 'fighter',          // Wardens use fighter XP
      
      // Magic users and variants
      'illusionist': 'magic-user',  // Illusionists use magic-user XP
      'mage': 'magic-user',         // Mages use magic-user XP
      
      // Race-as-class options
      'dwarf': 'fighter',           // Dwarf class uses fighter XP
      'elf': 'magic-user',          // Elf class uses magic-user XP (fighter/magic-user hybrid)
      'gnome': 'cleric',            // Gnome class uses cleric XP
      'half-elf': 'fighter',        // Half-Elf class uses fighter XP
      'half-orc': 'fighter',        // Half-Orc class uses fighter XP
      'hobbit': 'thief'             // Hobbit class uses thief XP
    };

    // Get the appropriate XP table for this class
    const mappedClass = classXPMapping[characterClass?.toLowerCase()] || 'fighter';
    const table = xpTables[mappedClass];
    
    // Get next level XP (currentLevel index = nextLevel - 1)
    const nextLevel = Math.min(currentLevel + 1, 15); // Max level 15
    const nextLevelIndex = nextLevel - 1; // Convert to array index
    
    return table[nextLevelIndex] || table[14]; // Use max level XP if beyond table
  }

  /**
   * Get XP required for current level
   */
  getCurrentLevelXP() {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(this.actor.system.level) || 1; // Use actual level field, not calculated from XP
    
    // XP requirements table - matches ose.js
    const xpTables = {
      'fighter': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000, 960000],
      'cleric': [0, 1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000],
      'magic-user': [0, 2500, 5000, 10000, 20000, 40000, 80000, 150000, 300000, 450000, 600000, 750000, 900000, 1050000, 1200000],
      'thief': [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000, 880000]
    };

    // Map additional classes to their XP patterns - matches ose.js
    const classXPMapping = {
      // Core OSE classes
      'fighter': 'fighter',
      'cleric': 'cleric', 
      'magic-user': 'magic-user',
      'thief': 'thief',
      
      // Advanced Fantasy classes - map to appropriate base class XP tables
      'assassin': 'thief',          // Assassins use thief XP
      'barbarian': 'fighter',       // Barbarians use fighter XP
      'bard': 'thief',              // Bards use thief XP
      'beast master': 'fighter',    // Beast Masters use fighter XP
      'druid': 'cleric',            // Druids use cleric XP
      'knight': 'fighter',          // Knights use fighter XP
      'paladin': 'cleric',          // Paladins use cleric XP
      'ranger': 'fighter',          // Rangers use fighter XP
      'warden': 'fighter',          // Wardens use fighter XP
      
      // Magic users and variants
      'illusionist': 'magic-user',  // Illusionists use magic-user XP
      'mage': 'magic-user',         // Mages use magic-user XP
      
      // Race-as-class options
      'dwarf': 'fighter',           // Dwarf class uses fighter XP
      'elf': 'magic-user',          // Elf class uses magic-user XP (fighter/magic-user hybrid)
      'gnome': 'cleric',            // Gnome class uses cleric XP
      'half-elf': 'fighter',        // Half-Elf class uses fighter XP
      'half-orc': 'fighter',        // Half-Orc class uses fighter XP
      'hobbit': 'thief'             // Hobbit class uses thief XP
    };

    // Get the appropriate XP table for this class
    const mappedClass = classXPMapping[characterClass?.toLowerCase()] || 'fighter';
    const table = xpTables[mappedClass];
    
    // Get XP requirement for the current level (level - 1 = index)
    const levelIndex = Math.max(0, Math.min(currentLevel - 1, table.length - 1));
    return table[levelIndex] || 0;
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
    console.log(`Testing progress bar with ${percentage}%`);
    if (this.levelXpProgress.length) {
      this.levelXpProgress.css('height', `${percentage}%`);
      this.levelXpProgress.css('background', 'linear-gradient(to top, #22c55e 0%, #4ade80 100%)');
      console.log(`Progress bar height set to ${percentage}%`);
    } else {
      console.log('Level XP progress element not found for testing');
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
