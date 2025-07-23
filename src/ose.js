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
  if (isNaN(numScore)) return '+0';
  
  let modifier;
  if (numScore === 3) modifier = -3;
  else if (numScore >= 4 && numScore <= 5) modifier = -2;
  else if (numScore >= 6 && numScore <= 8) modifier = -1;
  else if (numScore >= 9 && numScore <= 12) modifier = 0;
  else if (numScore >= 13 && numScore <= 15) modifier = +1;
  else if (numScore >= 16 && numScore <= 17) modifier = +2;
  else if (numScore === 18) modifier = +3;
  else modifier = 0; // fallback for scores outside normal range
  
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
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
});
