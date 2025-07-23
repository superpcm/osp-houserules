export class OspActor extends Actor {
  /**
   * Prepare Character type specific data
   * @private
   */
  _prepareCharacterData() {
    // Organize items by type
    this.system.weapons = this.items.filter(item => item.type === "weapon");
    this.system.armor = this.items.filter(item => item.type === "armor");
    this.system.containers = this.items.filter(item => item.type === "container");
    this.system.items = this.items.filter(item => item.type === "item" && !item.system.treasure);
    this.system.treasures = this.items.filter(item => item.type === "item" && item.system.treasure);

    // Calculate encumbrance
    this._calculateEncumbrance();
    
    // Calculate saving throws
    this._calculateSavingThrows();
    
    // Calculate next level XP
    this._calculateNextLevelXP();
    
    // Calculate XP modifier
    this._calculateXPModifier();
  }

    /**
   * Calculate saving throws based on class, level, and race
   * @private
   */
  _calculateSavingThrows() {
    // Initialize saves structure if it doesn't exist
    if (!this.system.saves) {
      this.system.saves = {
        death: { value: 0 },
        wands: { value: 0 },
        paralysis: { value: 0 },
        breath: { value: 0 },
        spells: { value: 0 }
      };
    }
    
    const characterClass = this.system.class || '';
    const level = parseInt(this.system.level) || 1;
    const race = this.system.race?.toLowerCase() || '';
    
    console.log(`OSP Debug: Class: "${characterClass}", Level: ${level}, Race: "${race}"`);

    // OSE saving throw tables by class
    const savingThrowTables = {
      'fighter': {
        death: [12, 11, 10, 10, 8, 8, 6, 6, 4, 4, 2, 2, 2, 2, 2],
        wands: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2, 2],
        paralysis: [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2],
        breath: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2],
        spells: [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
      },
      'cleric': {
        death: [11, 10, 9, 8, 7, 6, 5, 4, 2, 2, 2, 2, 2, 2, 2],
        wands: [12, 11, 10, 9, 8, 7, 6, 5, 3, 2, 2, 2, 2, 2, 2],
        paralysis: [14, 13, 12, 11, 10, 9, 8, 7, 5, 4, 3, 2, 2, 2, 2],
        breath: [16, 15, 14, 13, 12, 11, 10, 9, 7, 6, 5, 4, 3, 2, 2],
        spells: [15, 14, 13, 12, 11, 10, 9, 8, 6, 5, 4, 3, 2, 2, 2]
      },
      'magic-user': {
        death: [13, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 6],
        wands: [14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7],
        paralysis: [13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
        breath: [16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 8],
        spells: [15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 7]
      },
      'thief': {
        death: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 2, 2, 2, 2, 2],
        wands: [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 3, 2, 2, 2, 2],
        paralysis: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 2, 2, 2, 2, 2],
        breath: [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 5, 4, 3, 2, 2],
        spells: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 4, 3, 2, 2, 2]
      }
    };

    // Map additional classes to their saving throw patterns
    const classMapping = {
      // Core OSE classes
      'fighter': 'fighter',
      'cleric': 'cleric', 
      'magic-user': 'magic-user',
      'thief': 'thief',
      
      // Advanced Fantasy classes - map to appropriate base class tables
      'assassin': 'thief',          // Assassins use thief saves
      'barbarian': 'fighter',       // Barbarians use fighter saves
      'bard': 'thief',              // Bards use thief saves
      'beast master': 'fighter',    // Beast Masters use fighter saves
      'druid': 'cleric',            // Druids use cleric saves
      'knight': 'fighter',          // Knights use fighter saves
      'paladin': 'cleric',          // Paladins use cleric saves
      'ranger': 'fighter',          // Rangers use fighter saves
      'warden': 'fighter',          // Wardens use fighter saves
      
      // Magic users and variants
      'illusionist': 'magic-user',  // Illusionists use magic-user saves
      'mage': 'magic-user',         // Mages use magic-user saves
      
      // Race-as-class options
      'dwarf': 'fighter',           // Dwarf class uses fighter saves
      'elf': 'fighter',             // Elf class uses fighter saves (with some magic-user features)
      'gnome': 'cleric',            // Gnome class uses cleric saves
      'half-elf': 'fighter',        // Half-Elf class uses fighter saves
      'half-orc': 'fighter',        // Half-Orc class uses fighter saves
      'hobbit': 'thief'             // Hobbit class uses thief saves
    };

    // Get the appropriate save table for this class
    const mappedClass = classMapping[characterClass.toLowerCase()] || 'fighter';
    const saveTable = savingThrowTables[mappedClass];
    console.log(`OSP Debug: Using save table for: ${characterClass.toLowerCase()} -> ${mappedClass}`);
    const levelIndex = Math.min(Math.max(level - 1, 0), 14); // Levels 1-15, array index 0-14
    console.log(`OSP Debug: Level index: ${levelIndex}`);

    // Calculate each saving throw
    ['death', 'wands', 'paralysis', 'breath', 'spells'].forEach(saveType => {
      // Ensure the save type exists in the structure
      if (!this.system.saves[saveType]) {
        this.system.saves[saveType] = { value: 0 };
      }
      
      let baseValue = saveTable[saveType] ? saveTable[saveType][levelIndex] : 15;
      console.log(`OSP Debug: ${saveType} base value: ${baseValue}`);
      
      // Apply racial bonuses
      let racialBonus = 0;
      if (race === 'dwarf' && (saveType === 'wands' || saveType === 'spells' || saveType === 'paralysis' || saveType === 'death')) {
        racialBonus = 4; // Dwarves get +4 vs magic
      } else if (race === 'hobbit' && (saveType === 'wands' || saveType === 'spells' || saveType === 'paralysis' || saveType === 'death')) {
        racialBonus = 4; // Hobbits get +4 vs magic
      }
      
      const finalValue = Math.max(baseValue - racialBonus, 2); // Minimum save of 2
      console.log(`OSP Debug: ${saveType} final value: ${finalValue} (base ${baseValue} - racial ${racialBonus})`);
      
      this.system.saves[saveType].value = finalValue;
    });
  }

  /**
   * Calculate next level XP based on class and current level
   * @private
   */
  _calculateNextLevelXP() {
    const characterClass = this.system.class || '';
    const level = parseInt(this.system.level) || 1;
    
    // OSE XP progression tables
    const xpTables = {
      // Fighter progression (and similar classes)
      'fighter': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000, 960000],
      
      // Cleric progression
      'cleric': [0, 1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000],
      
      // Magic-User progression (higher requirements)
      'magic-user': [0, 2500, 5000, 10000, 20000, 40000, 80000, 150000, 300000, 450000, 600000, 750000, 900000, 1050000, 1200000],
      
      // Thief progression
      'thief': [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000, 880000]
    };

    // Map additional classes to their XP patterns (same as saving throw mapping)
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
    const mappedClass = classXPMapping[characterClass.toLowerCase()] || 'fighter';
    const xpTable = xpTables[mappedClass];
    
    // Calculate next level XP (if max level, show current level requirement)
    const nextLevel = Math.min(level + 1, 15); // Max level 15
    const nextLevelIndex = nextLevel - 1; // Convert to array index
    
    this.system.nextLevelXP = xpTable[nextLevelIndex] || xpTable[14]; // Use max level XP if beyond table
  }

  /**
   * Calculate XP modifier based on class prime requisites
   * @private
   */
  _calculateXPModifier() {
    const characterClass = this.system.class || '';
    const attributes = this.system.attributes || {};
    
    // Prime requisite mapping for each class
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
      
      // Race-as-class options (these often have multiple requirements)
      'dwarf': ['str'],                 // Dwarf class uses STR
      'elf': ['int', 'str'],            // Elf class needs INT and STR
      'gnome': ['int'],                 // Gnome class uses INT
      'half-elf': ['str', 'int'],       // Half-Elf class needs STR and INT
      'half-orc': ['str'],              // Half-Orc class uses STR
      'hobbit': ['dex', 'str']          // Hobbit class needs DEX and STR
    };

    const classReqs = primeRequisites[characterClass.toLowerCase()] || ['str'];
    
    // OSE XP modifier table based on ability scores
    const getXPModifier = (score) => {
      const numScore = parseInt(score) || 10;
      if (numScore <= 8) return -10;      // 3-8: -10%
      if (numScore <= 12) return 0;       // 9-12: No modifier
      if (numScore <= 15) return 5;       // 13-15: +5%
      if (numScore <= 17) return 10;      // 16-17: +10%
      return 15;                          // 18: +15%
    };

    let totalModifier = 0;
    
    if (classReqs.length === 1) {
      // Single prime requisite
      const reqScore = attributes[classReqs[0]]?.value || 10;
      totalModifier = getXPModifier(reqScore);
    } else {
      // Multiple prime requisites - use average or most restrictive approach
      // For OSE, typically the average of both is used
      let modifierSum = 0;
      for (const req of classReqs) {
        const reqScore = attributes[req]?.value || 10;
        modifierSum += getXPModifier(reqScore);
      }
      totalModifier = Math.round(modifierSum / classReqs.length);
    }

    this.system.xpModifier = totalModifier;
  }

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

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    
    // Prepare character-specific data
    if (this.type === "character") {
      this._prepareCharacterData();
    }
  }

  /**
   * Prepare character-specific data
   * @private
   */
  _prepareCharacterData() {
    // Organize items by type
    this.system.weapons = this.items.filter(item => item.type === "weapon");
    this.system.armor = this.items.filter(item => item.type === "armor");
    this.system.containers = this.items.filter(item => item.type === "container");
    this.system.items = this.items.filter(item => item.type === "item" && !item.system.treasure);
    this.system.treasures = this.items.filter(item => item.type === "item" && item.system.treasure);

    // Calculate encumbrance
    this._calculateEncumbrance();
    
    // Calculate saving throws
    this._calculateSavingThrows();
  }

  /**
   * Calculate encumbrance for the character
   * @private
   */
  _calculateEncumbrance() {
    let totalWeight = 0;
    
    // Sum up all item weights
    this.items.forEach(item => {
      if (item.system.equipped || item.type === "armor" || item.type === "weapon") {
        const quantity = item.system.quantity?.value || 1;
        const weight = item.system.weight || 0;
        totalWeight += weight * quantity;
      }
    });

    // Basic encumbrance calculation (can be made more sophisticated)
    const maxWeight = 100; // Base carrying capacity
    const encumbrancePercentage = Math.min(100, (totalWeight / maxWeight) * 100);

    this.system.encumbrance = {
      totalWeight: totalWeight,
      maxWeight: maxWeight,
      percentage: encumbrancePercentage,
      encumbered: encumbrancePercentage > 50
    };
  }
}
