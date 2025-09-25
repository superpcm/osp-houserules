// ose.js - Main system entry point


// Import system styles so the build produces dist/ose.css
import "./styles/ose.scss";

// Expose DOMPurify for template sanitization
import DOMPurify from 'dompurify';
window.DOMPurify = DOMPurify;

// Import centralized configuration
import { getNextLevelXP, calculateXPModifier } from "./config/classes.js";
import { NumberFormatter } from "./module/ui/number-formatter.js";

import { OspActorSheetCharacter } from "./module/actor/sheets/character-sheet.js";
import { OspActorSheetMonster } from "./module/actor/sheets/monster-sheet.js";
import { PositionToolHandler } from "./module/actor/sheets/handlers/position-tool-handler.js";
import { OspActor } from "./module/actor/actor.js";
import { OspItem } from "./module/item/item.js";
import { OspItemSheet } from "./module/item/item-sheet.js";

Hooks.once("init", () => {
  console.log('🚨🚨🚨 OSP SYSTEM INIT - DIRECT POSITION TOOL FIX 🚨🚨🚨');
  
  // Make centralized config available globally for templates
  window.OSP = {
    getNextLevelXP,
    calculateXPModifier,
    NumberFormatter
  };
  
  // Debug: Expose classes for testing
  window.OSPDebug = {
    OspActorSheetCharacter,
    PositionToolHandler
  };

  console.log('🚨 Setting up DIRECT position tool auto-init... 🚨');
  
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

  console.log('🚨 OSP SYSTEM: About to set up position tool hooks 🚨');
  
  // DISABLED: Hook-based position tool initialization (causes duplicates)
  // Position tool is now properly initialized in character sheet activateListeners
  /*
  Hooks.on('renderApplication', (app, html, data) => {
    // This hook has been disabled to prevent duplicate position tool handlers
    // Position tool initialization is handled in character-sheet.js ensurePositionToolHandler()
  });
  */

  // DISABLED: Timer-based position tool check (causes duplicates)
  // Position tool is now properly initialized in character sheet activateListeners
  /*
  const positionToolTimer = setInterval(() => {
    // This timer has been disabled to prevent duplicate position tool handlers
    // Position tool initialization is handled in character-sheet.js ensurePositionToolHandler()
  }, 3000);
  */

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
// TEMPORARILY DISABLED - using actor.js calculation only
/*
Handlebars.registerHelper('getSavingThrow', function(saveType, characterClass, level, race) {
  // Column index per save type
  const COL = { death: 0, wands: 1, paralysis: 2, breath: 3, spells: 4 };

  // Map aliases to groups
  const GROUP_FOR_CLASS = {
    // Core / AF classes (grouped)
    'fighter': 'fighter', 'knight': 'knight', 'ranger': 'fighter',
    'paladin': 'cleric',
    'barbarian': 'barbarian',
    'cleric': 'cleric', 'druid': 'cleric',
    'magic-user': 'magicUser', 'illusionist': 'magicUser',
    'thief': 'thief', 'assassin': 'assassin', 'acrobat': 'thief', 'bard': 'thief',

    // Race-as-class with specific tables
    'dwarf': 'dwarf',
    'hobbit': 'hobbit', 
    'half-orc': 'half-orc',
    'elf': 'fighter',
    'gnome': 'cleric',
    'half-elf': 'fighter',

    // House rules bespoke
    'beast master': 'beastmaster_bespoke',
    'mage': 'mage_bespoke',
    'warden': 'warden_bespoke'
  };

  // Tiered group tables from AF v1.3 (values are D/W/P/B/S)
  const GROUP_TABLES = {
    fighter: [
      [1, 3,  [12,13,14,15,16]],
      [4, 6,  [10,11,12,13,14]],
      [7, 9,  [ 8, 9,10,10,12]],
      [10,12, [ 6, 7, 8, 8,10]],
      [13,14, [ 4, 5, 6, 6, 8]]
    ],
    barbarian: [
      [1, 3,  [12,13,14,15,16]],
      [4, 6,  [10,11,12,13,13]],
      [7, 9,  [ 8, 9,10,10,10]],
      [10,12, [ 6, 7, 8, 8, 7]],
      [13,14, [ 3, 5, 4, 5, 5]]
    ],
    cleric: [
      [1, 1,  [11,12,14,16,15]],
      [2, 2,  [10,11,13,15,14]],
      [3, 3,  [ 9,10,12,14,13]],
      [4, 4,  [ 8, 9,11,13,12]],
      [5, 5,  [ 7, 8,10,12,11]],
      [6, 6,  [ 6, 7, 9,11,10]],
      [7, 7,  [ 5, 6, 8,10, 9]],
      [8, 8,  [ 4, 5, 7, 9, 8]],
      [9, 12, [ 2, 3, 5, 7, 6]],
      [13,14, [ 2, 2, 2, 2, 2]]
    ],
    magicUser: [
      [1, 1,  [13,14,13,16,15]],
      [2, 2,  [13,14,13,15,14]],
      [3, 3,  [13,13,12,15,14]],
      [4, 4,  [12,13,12,14,13]],
      [5, 5,  [12,12,11,14,13]],
      [6, 6,  [11,12,11,13,12]],
      [7, 7,  [11,11,10,13,12]],
      [8, 8,  [10,11,10,12,11]],
      [9, 9,  [10,10, 9,12,11]],
      [10,10, [ 9,10, 9,11,10]],
      [11,11, [ 9, 9, 8,11,10]],
      [12,12, [ 8, 9, 8,10, 9]],
      [13,13, [ 8, 8, 7,10, 9]],
      [14,14, [ 7, 8, 7, 9, 8]]
    ],
    thief: [
      [1, 4,  [13,14,13,16,15]],
      [5, 8,  [12,13,11,14,13]],
      [9, 12, [10,11, 9,12,10]],
      [13,14, [ 8, 9, 7,10, 8]]
    ],
    assassin: [
      [1, 4,  [13,14,13,16,15]],
      [5, 8,  [12,13,11,14,13]],
      [9, 12, [10,11, 9,12,10]],
      [13,14, [ 8, 9, 7,10, 8]]
    ],
    knight: [
      [1, 3,  [12,13,14,15,16]],
      [4, 6,  [10,11,12,13,14]],
      [7, 9,  [ 8, 9,10,10,12]],
      [10,12, [ 6, 7, 8, 8,10]],
      [13,14, [ 4, 5, 6, 6, 8]]
    ],
    dwarf: [
      [1, 3,  [ 8, 9,10,13,12]],
      [4, 6,  [ 6, 7, 8,10,10]],
      [7, 9,  [ 4, 5, 6, 7, 8]],
      [10,12, [ 2, 3, 4, 4, 6]]
    ],
    hobbit: [
      [1, 3,  [ 8, 9,10,13,12]],
      [4, 6,  [ 6, 7, 8,10,10]],
      [7, 8,  [ 4, 5, 6, 7, 8]]
    ],
    'half-orc': [
      [1, 4,  [13,14,13,16,15]],
      [5, 8,  [12,13,11,14,13]]
    ]
  };

  // Bespoke tables (per-level arrays), columns D/W/P/B/S; levels 1–14
  const BESPOKE = {
    beastmaster_bespoke: {
      death:     [11,11,11,11, 9, 9, 9, 9, 7, 7, 7, 7, 5, 5],
      wands:     [12,12,12,12,10,10,10,10, 8, 8, 8, 8, 6, 6],
      paralysis: [12,12,12,12,10,10,10,10, 8, 8, 8, 8, 6, 6],
      breath:    [15,15,15,15,13,13,13,13,11,11,11,11, 9, 9],
      spells:    [16,16,16,16,14,14,14,14,12,12,12,12,10,10]
    },
    mage_bespoke: {
      death:     [11,11,11,11, 9, 9, 9, 9, 7, 7, 7, 7, 5, 5],
      wands:     [12,12,12,12,10,10,10,10, 8, 8, 8, 8, 6, 6],
      paralysis: [12,12,12,12,10,10,10,10, 8, 8, 8, 8, 6, 6],
      breath:    [15,15,15,15,13,13,13,13,11,11,11,11, 9, 9],
      spells:    [16,16,16,16,14,14,14,14,12,12,12,12,10,10]
    },
    warden_bespoke: {
      death:     [11,11,11,11, 9, 9, 9, 9, 7, 7, 7, 7, 5, 5],
      wands:     [12,12,12,12,10,10,10,10, 8, 8, 8, 8, 6, 6],
      paralysis: [12,12,12,12,10,10,10,10, 8, 8, 8, 8, 6, 6],
      breath:    [15,15,15,15,13,13,13,13,11,11,11,11, 9, 9],
      spells:    [16,16,16,16,14,14,14,14,12,12,12,12,10,10]
    }
  };

  // Find row for a level within a tiered table
  function findTierRow(tiers, level) {
    for (const [lo, hi, arr] of tiers) {
      if (level >= lo && level <= hi) return arr;
    }
    return tiers[0][2];
  }

  const st = String(saveType || '').toLowerCase().trim();
  if (!(st in COL)) return 15;

  const lvl = Math.max(1, Math.min(parseInt(level, 10) || 1, 14));
  const cls = String(characterClass || '').toLowerCase().trim();
  const raceLower = String(race || '').toLowerCase().trim();

  const groupKey = GROUP_FOR_CLASS[cls] || 'fighter';
  let base;

  if (groupKey.endsWith('_bespoke')) {
    const t = BESPOKE[groupKey];
    base = t[st][lvl - 1] || 15;
  } else {
    const tiers = GROUP_TABLES[groupKey] || GROUP_TABLES['fighter'];
    const row = findTierRow(tiers, lvl);
    base = row[COL[st]];
  }

  // Racial magic resistance for dwarves & halflings/hobbits: +4 vs D/W/P/S (not Breath)
  const isMagicSave = st !== 'breath';
  const raceIsDwarfOrHalfling =
    raceLower === 'dwarf' || raceLower === 'halfling' || raceLower === 'hobbit';
  if (raceIsDwarfOrHalfling && isMagicSave) base = Math.max(2, base - 4);

  return base;
});
*/

// Register a Handlebars helper for next level XP calculation
Handlebars.registerHelper('getNextLevelXP', function(characterClass, level) {
  return getNextLevelXP(characterClass, parseInt(level) || 1);
});

// Register a Handlebars helper for XP modifier calculation
Handlebars.registerHelper('getXPModifier', function(characterClass, attributes) {
  return calculateXPModifier(characterClass, attributes || {});
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

        }
      }
    });

    if (resetCount > 0) {
      ui.notifications.info(`Reset fields for ${resetCount} character sheet(s)`);

    } else {
      ui.notifications.warn('No open character sheets found to reset');

    }

    return resetCount;
  };


});
