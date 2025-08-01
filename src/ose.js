// ose.js - Main system entry point
console.log("osp-houserules Debug: src/ose.js module loaded");

import { OspActorSheetCharacter } from "./module/actor/sheets/character-sheet.js";
import { OspActorSheetMonster } from "./module/actor/sheets/monster-sheet.js";
import { OspActor } from "./module/actor/actor.js";
import { OspItem } from "./module/item/item.js";
import { OspItemSheet } from "./module/item/item-sheet.js";

Hooks.once("init", () => {
  // Configure Actor document classes
  CONFIG.Actor.documentClass = OspActor;
  CONFIG.Actor.label = game.i18n.localize("osp-houserules.Actor.documentLabel");
  
  // Configure Item document classes
  CONFIG.Item.documentClass = OspItem;
  
  // Unregister core sheets
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  
  // Register Actor sheets
  foundry.documents.collections.Actors.registerSheet("osp-houserules", OspActorSheetCharacter, {
    types: ["character"],
    makeDefault: true,
    label: game.i18n.localize("osp-houserules.Actor.Type.character")
  });
  foundry.documents.collections.Actors.registerSheet("osp-houserules", OspActorSheetMonster, {
    types: ["monster"],
    makeDefault: true,
    label: game.i18n.localize("osp-houserules.Actor.Type.monster")
  });

  // Register Item sheets
  foundry.documents.collections.Items.registerSheet("osp-houserules", OspItemSheet, {
    types: ["weapon", "armor", "item", "container"],
    makeDefault: true,
    label: "OSP Item Sheet"
  });

  CONFIG.Actor.typeLabels = {
    character: game.i18n.localize("osp-houserules.Actor.Type.character"),
    monster: game.i18n.localize("osp-houserules.Actor.Type.monster")
  };

  Hooks.on("renderActorConfig", (app, html, data) => {
    const $html = $(html);
    const $select = $html.find('select[name="type"]');
    const $submit = $html.find('button[type="submit"]');

    // Insert a placeholder option if not present
    if ($select.find('option[value=""]').length === 0) {
      $select.prepend(
        `<option value="" disabled>${game.i18n.localize("osp-houserules.ChooseType")}</option>`
      );
      $select.val(""); // Set the select to the placeholder
    }

    // Localize type options
    $select.find('option[value="character"]').text(game.i18n.localize("osp-houserules.Actor.Type.character"));
    $select.find('option[value="monster"]').text(game.i18n.localize("osp-houserules.Actor.Type.monster"));

    // Disable submit if no type is selected
    $submit.prop("disabled", $select.val() === "");

    // Enable submit when a valid type is chosen
    $select.on("change", function () {
      $submit.prop("disabled", $select.val() === "");
    });
  });

  console.log("osp-houserules Debug: Actor and Item sheets registered successfully");
});

// Register a Handlebars helper for range
Handlebars.registerHelper('range', function(start, end) {
  start = parseInt(start);
  end = parseInt(end);
  let result = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
});

// Register a Handlebars helper for parseInt
Handlebars.registerHelper('parseInt', function(value) {
  return parseInt(value, 10);
});

// Register a Handlebars helper for multiplication
Handlebars.registerHelper('multiply', function(a, b) {
  return (parseFloat(a) || 0) * (parseFloat(b) || 0);
});

// Register a Handlebars helper for calculating ability modifiers (OSE rules)
Handlebars.registerHelper('abilityMod', function(score) {
  const numScore = parseInt(score, 10);
  if (isNaN(numScore)) return '0';
  
  let modifier;
  if (numScore === 3) modifier = -3;
  else if (numScore >= 4 && numScore <= 5) modifier = -2;
  else if (numScore >= 6 && numScore <= 8) modifier = -1;
  else if (numScore >= 9 && numScore <= 12) modifier = 0;
  else if (numScore >= 13 && numScore <= 15) modifier = +1;
  else if (numScore >= 16 && numScore <= 17) modifier = +2;
  else if (numScore === 18) modifier = +3;
  else modifier = 0; // fallback for scores outside normal range
  
  return modifier > 0 ? `+${modifier}` : `${modifier}`;
});

// Register helper for calculating unarmored AC (10 + DEX modifier)
Handlebars.registerHelper('unarmoredAC', function(dexScore) {
  const numScore = parseInt(dexScore, 10);
  if (isNaN(numScore)) return 10;
  
  let modifier;
  if (numScore === 3) modifier = -3;
  else if (numScore >= 4 && numScore <= 5) modifier = -2;
  else if (numScore >= 6 && numScore <= 8) modifier = -1;
  else if (numScore >= 9 && numScore <= 12) modifier = 0;
  else if (numScore >= 13 && numScore <= 15) modifier = +1;
  else if (numScore >= 16 && numScore <= 17) modifier = +2;
  else if (numScore === 18) modifier = +3;
  else modifier = 0; // fallback for scores outside normal range
  
  return 10 + modifier;
});

// Register helpers for calculating saving throws
Handlebars.registerHelper('getSavingThrow', function(saveType, characterClass, level, race) {
  const classLower = (characterClass || '').toLowerCase();
  const raceLower = (race || '').toLowerCase();
  const charLevel = parseInt(level, 10) || 1;
  
  // OSE Saving Throw tables by class
  const savingThrows = {
    'fighter': {
      'death': [12, 11, 10, 10, 8, 8, 6, 6, 4, 4, 2, 2, 2, 2],
      'wands': [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2],
      'paralysis': [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2],
      'breath': [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
      'spells': [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3]
    },
    'cleric': {
      'death': [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2],
      'wands': [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2, 2],
      'paralysis': [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2],
      'breath': [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3],
      'spells': [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
    },
    'thief': {
      'death': [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2],
      'wands': [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2],
      'paralysis': [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2],
      'breath': [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3],
      'spells': [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
    },
    'magic-user': {
      'death': [13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 6],
      'wands': [14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 7],
      'paralysis': [13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 6],
      'breath': [16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 9],
      'spells': [15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 8]
    }
  };
  
  // Default to fighter if class not found
  const saveTable = savingThrows[classLower] || savingThrows['fighter'];
  const levelIndex = Math.min(Math.max(charLevel - 1, 0), 13);
  let baseValue = saveTable[saveType] ? saveTable[saveType][levelIndex] : 15;
  
  // Apply racial bonuses
  let racialBonus = 0;
  if (raceLower === 'dwarf' && (saveType === 'wands' || saveType === 'spells' || saveType === 'paralysis' || saveType === 'death')) {
    racialBonus = 4; // Dwarves get +4 vs magic
  } else if (raceLower === 'hobbit' && (saveType === 'wands' || saveType === 'spells' || saveType === 'paralysis' || saveType === 'death')) {
    racialBonus = 4; // Hobbits get +4 vs magic
  }
  
  return Math.max(baseValue - racialBonus, 2); // Minimum save of 2
});

// Register a Handlebars helper for next level XP calculation
Handlebars.registerHelper('getNextLevelXP', function(characterClass, level) {
  const classLower = (characterClass || '').toLowerCase();
  const currentLevel = parseInt(level) || 1;
  
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

  // Map additional classes to their XP patterns
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
  const mappedClass = classXPMapping[classLower] || 'fighter';
  const xpTable = xpTables[mappedClass];
  
  // Calculate next level XP (if max level, show current level requirement)
  const nextLevel = Math.min(currentLevel + 1, 15); // Max level 15
  const nextLevelIndex = nextLevel - 1; // Convert to array index
  
  return xpTable[nextLevelIndex] || xpTable[14]; // Use max level XP if beyond table
});

// Register a Handlebars helper for XP modifier calculation
Handlebars.registerHelper('getXPModifier', function(characterClass, attributes) {
  const classLower = (characterClass || '').toLowerCase();
  const attrs = attributes || {};
  
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
    
    // Race-as-class options
    'dwarf': ['str'],                 // Dwarf class uses STR
    'elf': ['int', 'str'],            // Elf class needs INT and STR
    'gnome': ['int'],                 // Gnome class uses INT
    'half-elf': ['str', 'int'],       // Half-Elf class needs STR and INT
    'half-orc': ['str'],              // Half-Orc class uses STR
    'hobbit': ['dex', 'str']          // Hobbit class needs DEX and STR
  };

  const classReqs = primeRequisites[classLower] || ['str'];
  
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
    const reqScore = attrs[classReqs[0]]?.value || 10;
    totalModifier = getXPModifier(reqScore);
  } else {
    // Multiple prime requisites - use average
    let modifierSum = 0;
    for (const req of classReqs) {
      const reqScore = attrs[req]?.value || 10;
      modifierSum += getXPModifier(reqScore);
    }
    totalModifier = Math.round(modifierSum / classReqs.length);
  }

  return totalModifier;
});

// Register a Handlebars helper to display prime requisites for a class
Handlebars.registerHelper('getPrimeRequisites', function(characterClass) {
  const classLower = (characterClass || '').toLowerCase();
  
  const primeRequisites = {
    // Core OSE classes
    'fighter': ['STR'],
    'cleric': ['WIS'], 
    'magic-user': ['INT'],
    'thief': ['DEX'],
    
    // Advanced Fantasy classes
    'assassin': ['STR', 'DEX'],
    'barbarian': ['STR', 'CON'],
    'bard': ['DEX', 'CHA'],
    'beast master': ['STR', 'WIS'],
    'druid': ['WIS'],
    'knight': ['STR'],
    'paladin': ['STR', 'CHA'],
    'ranger': ['STR', 'WIS'],
    'warden': ['STR', 'CON'],
    
    // Magic users and variants
    'illusionist': ['INT'],
    'mage': ['INT'],
    
    // Race-as-class options
    'dwarf': ['STR'],
    'elf': ['INT', 'STR'],
    'gnome': ['INT'],
    'half-elf': ['STR', 'INT'],
    'half-orc': ['STR'],
    'hobbit': ['DEX', 'STR']
  };

  const classReqs = primeRequisites[classLower] || ['STR'];
  return classReqs.join(', ');
});

// Register a Handlebars helper for path resolution
Handlebars.registerHelper('path', function(templatePath) {
  return `systems/osp-houserules${templatePath}`;
});

// Unpause the game when Foundry VTT starts
Hooks.once("ready", () => {
  if (game.paused) {
    game.togglePause();
    console.log("osp-houserules: Game automatically unpaused on startup");
  }

  // Add global utility function to reset all character sheet fields
  window.resetAllCharacterFields = function() {
    let resetCount = 0;
    
    // Find all open character sheets
    Object.values(ui.windows).forEach(window => {
      if (window instanceof OspActorSheetCharacter) {
        try {
          window.resetAllFieldsToVisible();
          resetCount++;
        } catch (error) {
          console.error('Failed to reset fields for character sheet:', error);
        }
      }
    });
    
    if (resetCount > 0) {
      ui.notifications.info(`Reset fields for ${resetCount} character sheet(s)`);
      console.log(`osp-houserules: Reset fields for ${resetCount} character sheet(s)`);
    } else {
      ui.notifications.warn('No open character sheets found to reset');
      console.log('osp-houserules: No open character sheets found to reset');
    }
    
    return resetCount;
  };
  
  console.log("osp-houserules: Global utility functions registered. Use resetAllCharacterFields() to reset all draggable fields.");
});
