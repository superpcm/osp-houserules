/**
 * Character class configuration and progression tables
 * Centralized source of truth for all class-related data
 */

// Attack bonus progression tables by class group (Ascending AC bonuses)
// Based on house_rules_v1.5.txt THAC0 tables
export const ATTACK_BONUS_TABLES = {
  // Fighter group (Fighter, Knight, Barbarian, Ranger, Beast Master, Warden, etc.)
  // Levels 1-3: +0, 4-6: +2, 7-9: +5, 10-12: +7, 13-14: +9
  'fighter': [0, 0, 0, 2, 2, 2, 5, 5, 5, 7, 7, 7, 9, 9],
  
  // Cleric group (Cleric, Druid, Paladin)
  // Levels 1-4: +0, 5-8: +2, 9-12: +5, 13-14: +7
  'cleric': [0, 0, 0, 0, 2, 2, 2, 2, 5, 5, 5, 5, 7, 7],
  
  // Magic-User group (Magic-User, Illusionist, Mage)
  // Levels 1-5: +0, 6-10: +2, 11-14: +5
  'magic-user': [0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 5, 5, 5, 5],
  
  // Thief group (Thief, Assassin, Bard)
  // Levels 1-4: +0, 5-8: +2, 9-12: +5, 13-14: +7
  'thief': [0, 0, 0, 0, 2, 2, 2, 2, 5, 5, 5, 5, 7, 7]
};

// Map character classes to their attack bonus progression
export const CLASS_ATTACK_BONUS_MAPPING = {
  // Core OSE classes
  'fighter': 'fighter',
  'cleric': 'cleric',
  'magic-user': 'magic-user',
  'thief': 'thief',

  // Advanced Fantasy classes
  'assassin': 'thief',
  'barbarian': 'fighter',
  'bard': 'thief',
  'beast master': 'fighter',
  'druid': 'cleric',
  'knight': 'fighter',
  'paladin': 'cleric',
  'ranger': 'fighter',
  'warden': 'fighter',
  'illusionist': 'magic-user',
  'mage': 'magic-user',

  // Race-as-class
  'dwarf': 'fighter',
  'elf': 'fighter',
  'gnome': 'cleric',
  'half-elf': 'fighter',
  'half-orc': 'fighter',
  'hobbit': 'thief'
};

// XP progression tables by base class
export const XP_TABLES = {
  // Fighter progression (and similar classes)
  'fighter': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000, 960000],
  
  // Cleric progression
  'cleric': [0, 1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000],
  
  // Magic-User progression (higher requirements)
  'magic-user': [0, 2500, 5000, 10000, 20000, 40000, 80000, 150000, 300000, 450000, 600000, 750000, 900000, 1050000, 1200000],
  
  // Thief progression
  'thief': [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000, 880000]
};

// Map character classes to their XP progression
export const CLASS_XP_MAPPING = {
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

// Prime requisite mapping for each class
export const PRIME_REQUISITES = {
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
  'elf': ['int', 'str'],            // Elf class uses INT and STR (hybrid)
  'gnome': ['int'],                 // Gnome class uses INT
  'half-elf': ['int', 'str'],       // Half-Elf class uses INT and STR
  'half-orc': ['str', 'con'],       // Half-Orc class uses STR and CON
  'hobbit': ['dex', 'str']          // Hobbit class needs DEX and STR
};

/**
 * Get XP table for a character class
 * @param {string} characterClass - The character class name
 * @returns {number[]} XP progression table
 */
export function getXPTable(characterClass) {
  const mappedClass = CLASS_XP_MAPPING[characterClass.toLowerCase()] || 'fighter';
  return XP_TABLES[mappedClass];
}

/**
 * Get XP required for next level
 * @param {string} characterClass - The character class name
 * @param {number} currentLevel - Current character level
 * @returns {number} XP required for next level
 */
export function getNextLevelXP(characterClass, currentLevel) {
  const xpTable = getXPTable(characterClass);
  const nextLevel = Math.min(currentLevel + 1, 15); // Max level 15
  const nextLevelIndex = nextLevel - 1; // Convert to array index
  return xpTable[nextLevelIndex] || xpTable[14]; // Use max level XP if beyond table
}

/**
 * Get prime requisites for a character class
 * @param {string} characterClass - The character class name
 * @returns {string[]} Array of prime requisite attribute names
 */
export function getPrimeRequisites(characterClass) {
  return PRIME_REQUISITES[characterClass.toLowerCase()] || ['str'];
}

/**
 * Get attack bonus for a character based on class and level
 * @param {string} characterClass - The character class name
 * @param {number} level - Character level (1-14)
 * @returns {number} Attack bonus
 */
export function getAttackBonus(characterClass, level) {
  const mappedClass = CLASS_ATTACK_BONUS_MAPPING[characterClass.toLowerCase()] || 'fighter';
  const bonusTable = ATTACK_BONUS_TABLES[mappedClass];
  const levelIndex = Math.min(Math.max(level - 1, 0), 13); // Levels 1-14, array index 0-13
  return bonusTable[levelIndex] || 0;
}

/**
 * Calculate ability modifier for a given score
 * @param {number} score - Ability score (3-18)
 * @returns {number} Modifier (-3 to +3)
 */
export function getAbilityModifier(score) {
  const numScore = parseInt(score) || 10;
  if (numScore === 3) return -3;
  if (numScore >= 4 && numScore <= 5) return -2;
  if (numScore >= 6 && numScore <= 8) return -1;
  if (numScore >= 9 && numScore <= 12) return 0;
  if (numScore >= 13 && numScore <= 15) return 1;
  if (numScore >= 16 && numScore <= 17) return 2;
  if (numScore >= 18) return 3;
  return 0;
}

/**
 * Calculate XP modifier based on class and attributes
 * @param {string} characterClass - The character class name
 * @param {Object} attributes - Character attributes object
 * @returns {number} XP modifier percentage
 */
export function calculateXPModifier(characterClass, attributes) {
  const primes = getPrimeRequisites(characterClass);
  if (primes.length === 0) return 0;

  // Calculate modifier based on prime requisite scores
  let totalModifier = 0;

  if (primes.length === 1) {
    // Single prime requisite
    const score = attributes[primes[0]]?.value || 10;
    if (score >= 16) totalModifier = 10;
    else if (score >= 13) totalModifier = 5;
    else if (score <= 8) totalModifier = -10;
  } else {
    // Multiple prime requisites - both must be high for bonus
    const scores = primes.map(attr => attributes[attr]?.value || 10);
    const allHigh = scores.every(score => score >= 13);
    const anyLow = scores.some(score => score <= 8);

    if (allHigh && scores.every(score => score >= 16)) totalModifier = 10;
    else if (allHigh) totalModifier = 5;
    else if (anyLow) totalModifier = -10;
  }

  return totalModifier;
}
