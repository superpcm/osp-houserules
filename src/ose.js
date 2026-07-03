// ose.js - Main system entry point

// Import system styles so the build produces dist/ose.css
import "./styles/ose.scss";

// Expose DOMPurify for template sanitization
import DOMPurify from 'dompurify';
window.DOMPurify = DOMPurify;

// Import centralized configuration
import { getNextLevelXP, calculateXPModifier, getLevelFromXP } from "./config/classes.js";
import { SKILL_POINT_CONFIG, calcSkillPoints, showSkillPointDialog } from "./module/dialog/skill-point-dialog.js";
import { NumberFormatter } from "./module/ui/number-formatter.js";
import { OSP } from "./module/config.js";

// Core document classes
import { OspActorSheetCharacter } from "./module/actor/sheets/character-sheet.js";
import { OspActorSheetMonster } from "./module/actor/sheets/monster-sheet.js";
import { PositionToolHandler } from "./module/actor/sheets/handlers/position-tool-handler.js";
import { registerPositionSettings, applyStoredPositionOverrides } from "./module/actor/sheets/handlers/position-file-writer.js";
import { OspActor } from "./module/actor/actor.js";
import { OspItem } from "./module/item/item.js";
import { OspItemSheet } from "./module/item/item-sheet.js";

// Data models for new item types
import OspDataModelAbility from "./module/item/data-model-ability.js";
import OspDataModelSpell from "./module/item/data-model-spell.js";

// Settings
import { registerSettings } from "./module/settings.js";

// Helper modules
import { registerHelpers } from "./module/helpers-handlebars.js";
import { preloadHandlebarsTemplates } from "./module/preloadTemplates.js";
import { addChatMessageContextOptions, addChatMessageButtons } from "./module/helpers-chat.js";
import { augmentTable } from "./module/helpers-treasure.js";
import { createOspMacro, rollItemMacro, rollTableMacro } from "./module/helpers-macros.js";
import { addControl as addPartyControl, update as updatePartySheet } from "./module/helpers-party.js";
import OspDice from "./module/helpers-dice.js";

// Magic item creator
import { MagicItemCreator } from "./module/dialog/magic-item-creator.js";

// Combat system
import OspCombat from "./module/combat/combat.js";
import OspCombatant from "./module/combat/combatant.js";
import OspCombatTracker from "./module/combat/combat-tracker.js";
import { registerMoraleHooks } from "./module/combat/morale.js";

// DM Toolkit sidebar tab
import DmToolkitTab from "./module/sidebar/dm-toolkit.js";

// Character creation dialog (4d6 drop lowest ability rolls)
import { CharacterCreationDialog } from "./module/actor/character-creation-dialog.js";

// Token ruler
import { TokenRulerOSP } from "./module/actor/token-ruler.js";

// Cross-window drag tracking (Items sidebar → actor sheet drop-target highlighting)
import { initExternalDragTracker } from "./module/external-drag-tracker.js";

Hooks.once("init", () => {
  initExternalDragTracker();

  // ── Config ────────────────────────────────────────────────────────────────
  // Expose OSP config globally and alias as CONFIG.OSE so all OSE templates work
  CONFIG.OSE = OSP;
  window.OSP = OSP;

  // Expose helper utilities globally for macros
  game.osp = {
    rollItemMacro,
    rollTableMacro,
    OspDice,
  };

  // Expose classes for debugging
  window.OSPDebug = { OspActorSheetCharacter, PositionToolHandler };

  // Make classic helpers available globally (for templates / macros)
  window.OSPLegacy = { getNextLevelXP, calculateXPModifier, NumberFormatter };

  // ── Settings ──────────────────────────────────────────────────────────────
  registerSettings();
  registerPositionSettings();

  // ── Handlebars helpers ────────────────────────────────────────────────────
  registerHelpers();

  // ── Document Classes ──────────────────────────────────────────────────────
  CONFIG.Actor.documentClass = OspActor;
  CONFIG.Actor.label = game.i18n.localize("ose.Actor.documentLabel");
  CONFIG.Item.documentClass = OspItem;
  CONFIG.Item.defaultOwnership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER };

  // ── Combat ────────────────────────────────────────────────────────────────
  CONFIG.Combat.documentClass = OspCombat;
  CONFIG.Combatant.documentClass = OspCombatant;
  CONFIG.ui.combat = OspCombatTracker;
  CONFIG.Combat.initiative = { formula: "1d20", decimals: 0 };

  // ── DM Toolkit (GM only) ─────────────────────────────────────────────────
  foundry.applications.sidebar.Sidebar.TABS.dmtoolkit = {
    tooltip: "DM's Toolkit",
    icon: "osp-dm-toolkit-icon",
    gmOnly: true
  };
  CONFIG.ui.dmtoolkit = DmToolkitTab;

  // ── Token Ruler ───────────────────────────────────────────────────────────
  CONFIG.Token.rulerClass = TokenRulerOSP;

  // ── TypeDataModels for new item types ────────────────────────────────────
  CONFIG.Item.dataModels = CONFIG.Item.dataModels ?? {};
  CONFIG.Item.dataModels.ability = OspDataModelAbility;
  CONFIG.Item.dataModels.spell = OspDataModelSpell;

  // ── Sheets ────────────────────────────────────────────────────────────────
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet, { types: ["character"] });
  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);

  foundry.documents.collections.Actors.registerSheet("ose", OspActorSheetCharacter, {
    types: ["character"],
    makeDefault: true,
    label: game.i18n.localize("ose.Actor.Type.character")
  });
  foundry.documents.collections.Actors.registerSheet("ose", OspActorSheetMonster, {
    types: ["monster"],
    makeDefault: true,
    label: game.i18n.localize("ose.Actor.Type.monster")
  });

  foundry.documents.collections.Items.registerSheet("ose", OspItemSheet, {
    types: ["weapon", "armor", "item", "container", "coin", "clothing", "ammunition", "livestock", "ability", "spell"],
    makeDefault: true,
    label: "OSP Item Sheet"
  });
  
  // ── Type labels ───────────────────────────────────────────────────────────
  CONFIG.Actor.typeLabels = {
    character: game.i18n.localize("ose.Actor.Type.character"),
    monster: game.i18n.localize("ose.Actor.Type.monster")
  };

  // ── Preload templates ────────────────────────────────────────────────────
  preloadHandlebarsTemplates();

  Hooks.on("renderActorConfig", (app, html, data) => {
    const $html = $(html);
    const $select = $html.find('select[name="type"]');
    const $submit = $html.find('button[type="submit"]');

    // Insert a placeholder option if not present
    if ($select.find('option[value=""]').length === 0) {
      $select.prepend(
        `<option value="" disabled>${game.i18n.localize("ose.ChooseType")}</option>`
      );
      $select.val(""); // Set the select to the placeholder
    }

    // Localize type options
    $select.find('option[value="character"]').text(game.i18n.localize("ose.Actor.Type.character"));
    $select.find('option[value="monster"]').text(game.i18n.localize("ose.Actor.Type.monster"));

    // Disable submit if no type is selected
    $submit.prop("disabled", $select.val() === "");

    // Enable submit when a valid type is chosen
    $select.on("change", function () {
      $submit.prop("disabled", $select.val() === "");
    });
  });

  // ── Character creation: roll 4d6-drop-lowest for ability scores ──────────
  Hooks.on("preCreateActor", (document, data, options, userId) => {
    if (options.osprSkipDialog) return;
    if (document.type !== "character") return;
    if (game.userId !== userId) return;

    const attrs = document.system?.attributes;
    const keys = ['str', 'int', 'wis', 'dex', 'con', 'cha'];
    const hasScores = attrs && keys.some(k => Number(attrs[k]?.value) > 0);
    if (hasScores) return;

    const sourceData = document.toObject();
    delete sourceData._id;

    (async () => {
      const result = await CharacterCreationDialog.prompt();
      if (!result) return;
      const DEFAULT_PORTRAIT = 'systems/osp-houserules/assets/images/icons/generic-portrait.webp';
      const newData = foundry.utils.mergeObject(
        sourceData,
        {
          img: DEFAULT_PORTRAIT,
          prototypeToken: { texture: { src: DEFAULT_PORTRAIT } },
          system: {
            attributes: result.attributes,
            race:        result.race        || '',
            class:       result.class       || '',
            alignment:   result.alignment   || '',
            background:  result.background  || ''
          }
        },
        { inplace: false }
      );
      await Actor.create(newData, { osprSkipDialog: true, renderSheet: true });
    })();

    return false;
  });

});

// ── Position overrides ────────────────────────────────────────────────────
Hooks.once("ready", () => {
  applyStoredPositionOverrides().catch(err => console.warn('OSP | applyStoredPositionOverrides failed:', err));

});

// ── Morale system ─────────────────────────────────────────────────────────
registerMoraleHooks();

// ── Party system hooks ─────────────────────────────────────────────────────
Hooks.on("renderActorDirectory", (app, html) => addPartyControl(app, html));
Hooks.on("updateActor", async (actor, data, options) => {
  updatePartySheet(actor, data);

  // ── Skill point level-up detection ───────────────────────────────────────
  // Only trigger when XP actually changed, on the owning player's client.
  // If a non-GM owner is active, skip on GM to avoid duplicate dialogs.
  if (data.system?.xp !== undefined && actor.type === 'character') {
    const config = SKILL_POINT_CONFIG[(actor.system.class || '').trim()];
    if (config) {
      const isRelevantClient = actor.isOwner && (game.user.isGM
        ? !game.users.some(u => !u.isGM && u.active && (actor.ownership[u.id] ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
        : true);

      if (isRelevantClient) {
        const newLevel      = parseInt(actor.system.level) || 1;
        const lastKnownLevel = actor.getFlag('osp-houserules', 'lastKnownLevel') ?? 0;

        if (newLevel > lastKnownLevel) {
          const newPoints    = calcSkillPoints(config, lastKnownLevel, newLevel);
          const prevPending  = actor.getFlag('osp-houserules', 'pendingSkillPoints') || 0;
          const totalPending = prevPending + newPoints;

          // Persist updated tracking in one update (avoids double hook)
          await actor.update({
            'flags.osp-houserules.lastKnownLevel':    newLevel,
            'flags.osp-houserules.pendingSkillPoints': totalPending,
          });

          showSkillPointDialog(actor, totalPending);
        }
      }
    }
  }

  // XP award popup — fires on every client; only show for actors owned by this user
  if (options?.ospXPAward && actor.isOwner) {
    const amount = options.ospXPAmount ?? 0;
    const formatted = amount.toLocaleString();

    const wrap = document.createElement('div');
    wrap.className = 'osp-xp-award-popup';

    const img = document.createElement('img');
    img.src = 'systems/osp-houserules/assets/images/icons/xp_award.webp';

    const badge = document.createElement('div');
    badge.className = 'osp-xp-award-badge';
    badge.innerHTML = `<span class="osp-xp-award-plus">+</span>${formatted}<span class="osp-xp-award-label"> XP</span>`;

    const btn = document.createElement('button');
    btn.className = 'osp-xp-award-close';
    btn.textContent = '✕  Dismiss';
    btn.addEventListener('click', () => wrap.remove());

    wrap.appendChild(img);
    wrap.appendChild(badge);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);

    foundry.audio.AudioHelper.play({ src: 'systems/osp-houserules/assets/sounds/xp_bonus.ogg', volume: 1.0, loop: false });
  }
});

// ── User Configuration — remove Pronouns field ───────────────────────────
Hooks.on("renderUserConfig", (_app, html) => {
  const el = html instanceof HTMLElement ? html : html[0];
  el?.querySelector('[name="pronouns"]')?.closest('.form-group')?.remove();
});

// ── Chat hooks ────────────────────────────────────────────────────────────
Hooks.on("getChatMessageContextOptions", addChatMessageContextOptions);
Hooks.on("renderChatMessageHTML", addChatMessageButtons);
Hooks.on("createChatMessage", (message) => {
  const flags    = message.flags?.["osp-houserules"] ?? {};
  const dsnActive = game.modules.get("dice-so-nice")?.active;
  const isManual  = flags.manualRoll === true;

  const result = flags.attackResult;
  if (result === "hit" || result === "miss" || result === "critical_hit" || result === "critical-miss") {
    // Manual rolls have no DSN animation — show popup immediately
    if (!isManual && dsnActive) _pendingAttackResults.set(message.id, result);
    else showCombatResultPopup(result);
  }

  if (flags.combatDamage) {
    // For manual rolls the total is stored in the flag (no rolls[] on the message)
    const total = isManual ? flags.manualDamageTotal : message.rolls?.[0]?.total;
    if (total !== undefined) {
      if (!isManual && dsnActive) _pendingDamageResults.set(message.id, total);
      else updateHitPopupWithDamage(total);
    }
  }
});

Hooks.on("diceSoNiceRollComplete", (messageId) => {
  const result = _pendingAttackResults.get(messageId);
  if (result) {
    _pendingAttackResults.delete(messageId);
    showCombatResultPopup(result);
    return;
  }

  const total = _pendingDamageResults.get(messageId);
  if (total !== undefined) {
    _pendingDamageResults.delete(messageId);
    updateHitPopupWithDamage(total);
  }
});

// ── Monster HD artwork — override "View Character Artwork" in Actors sidebar ──
// Converts actor name to the kebab-case filename used in assets/images/monsters_artwork/.
// Falls back to the built-in handler if no matching HD file is found.
function _ospMonsterArtFilename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '-')  // non-alphanumeric (incl. accents, parens, commas) → hyphen
    .replace(/\s+/g, '-')            // spaces → hyphen
    .replace(/-+/g, '-')             // collapse runs of hyphens
    .replace(/^-|-$/g, '');          // trim leading/trailing hyphens
}

// Foundry v14 fires "getActorContextOptions" for the Actors sidebar right-click menu.
// li is a raw HTMLElement; use li.dataset.entryId to get the actor ID.
// onClick receives (event, li). Hook signature: (app, options).
Hooks.on("getActorContextOptions", (_app, options) => {
  const artOpt = options.find(o => o.label === "SIDEBAR.CharArt");
  if (!artOpt) return;

  const originalOnClick = artOpt.onClick;
  artOpt.onClick = async (event, li) => {
    const actorId = li.dataset.entryId;
    const actor   = game.actors.get(actorId);

    if (actor?.type !== "monster") {
      return originalOnClick(event, li);
    }

    const filename = _ospMonsterArtFilename(actor.name);
    const hdPath   = `systems/osp-houserules/assets/images/monsters_artwork/${filename}.webp`;

    try {
      const res = await fetch(hdPath, { method: "HEAD" });
      if (res.ok) {
        new foundry.applications.apps.ImagePopout({ src: hdPath, window: { title: actor.name }, uuid: actor.uuid }).render({ force: true });
        return;
      }
    } catch (_e) { /* fall through to default */ }

    originalOnClick(event, li);
  };
});

// ── Magic item creator — right-click weapon/armor/ammunition in Items sidebar ─
// Foundry v13 AppV2 fires "getItemContextOptions"; li is a raw HTMLElement with data-entry-id
Hooks.on("getItemContextOptions", (app, options) => {
  const getItem = (li) => game.items.get(li.closest("[data-entry-id]")?.dataset.entryId);
  options.push({
    name: "Create Magic Version",
    icon: '<i class="fas fa-hat-wizard"></i>',
    condition: (li) => {
      if (!game.user.isGM) return false;
      const item = getItem(li);
      return item && ["weapon", "armor", "ammunition"].includes(item.type);
    },
    callback: (li) => {
      const item = getItem(li);
      if (item) new MagicItemCreator(item).render(true);
    }
  });
});

// ── Treasure table hooks ──────────────────────────────────────────────────
Hooks.on("renderRollTableConfig", (app, html) => augmentTable(app, html[0] ?? html));

// ── Macro drop hook ──────────────────────────────────────────────────────
// Must be synchronous — hotbarDrop uses Hooks.call(), which checks the return
// value immediately. An async handler returns a Promise (truthy), allowing
// Foundry's default macro creation to also run.
Hooks.on("hotbarDrop", (bar, data, slot) => {
  if (data.type === "Item") {
    createOspMacro(data, slot); // async fire-and-forget
    return false;
  }
  return true;
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

Handlebars.registerHelper('signedInt', function(value) {
  const n = parseInt(value, 10);
  if (isNaN(n)) return value;
  return n >= 0 ? `+${n}` : `${n}`;
});

// Register a Handlebars helper for multiplication
Handlebars.registerHelper('multiply', function(a, b) {
  return (parseFloat(a) || 0) * (parseFloat(b) || 0);
});

// Register a Handlebars helper for checking if a string includes a substring
Handlebars.registerHelper('includes', function(str, substring) {
  return String(str || '').includes(substring);
});

Handlebars.registerHelper('abbrevTime', function(value) {
  return value ? String(value).replace(/\s+minutes?/i, ' min') : '';
});

// Register a Handlebars helper for checking if an array contains a value
Handlebars.registerHelper('hasTag', function(arr, value) {
  return Array.isArray(arr) && arr.includes(value);
});

// Register a Handlebars helper to check if item is a regular shield (not body shield)
Handlebars.registerHelper('isRegularShield', function(item) {
  const type = String(item.system.type || '').toLowerCase();
  const name = String(item.name || '');
  return type === 'shield' && !name.includes('Body');
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

  // Racial magic resistance for dwarves & hobbits: +4 vs D/W/P/S (not Breath)
  const isMagicSave = st !== 'breath';
  const raceIsDwarfOrHobbit =
    raceLower === 'dwarf' || raceLower === 'hobbit';
  if (raceIsDwarfOrHobbit && isMagicSave) base = Math.max(2, base - 4);

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

/**
 * Create a macro when dropping a weapon roll icon on the hotbar
 */
Hooks.on("hotbarDrop", (bar, data, slot) => {
  // Check for our custom weapon attack macro type
  if (data.type === "WeaponAttackMacro" || data.macroType === "weaponAttack") {
    const actor = game.actors.get(data.actorId);
    const item = actor?.items.get(data.itemId);

    if (!actor || !item) {
      ui.notifications.warn("Could not find actor or weapon for macro");
      return false;
    }

    // Include actorId so the macro works without needing a token selected
    const macroCommand = `game.osp.rollItemMacro(${JSON.stringify(item.name)}, ${JSON.stringify(actor.id)});`;

    (async () => {
      const macro = await Macro.create({
        name: `${item.name} Attack`,
        type: "script",
        img: item.img,
        command: macroCommand,
        flags: { "osp-houserules": { actorId: data.actorId, itemId: data.itemId } }
      });
      game.user.assignHotbarMacro(macro, slot);
    })();

    return false; // Prevent default hotbar drop behavior
  }

  return true; // Allow other drops to proceed
});

/**
 * Prevent default sheet opening for dropped item tokens and handle pickup
 */
const _pendingAttackResults = new Map();
const _pendingDamageResults = new Map();
let _hitPopupEl = null;

function showCombatResultPopup(result) {
  document.querySelector('.osp-combat-result-popup')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'osp-combat-result-popup';
  const img = document.createElement('img');
  img.src = `systems/osp-houserules/assets/images/icons/${result}.webp`;
  wrap.appendChild(img);
  document.body.appendChild(wrap);

  if (result === "hit" || result === "critical_hit") {
    _hitPopupEl = wrap;
  } else {
    _hitPopupEl = null;
    setTimeout(() => wrap.remove(), 4000);
  }
}

function updateHitPopupWithDamage(total) {
  if (!_hitPopupEl) return;
  const badge = document.createElement('div');
  badge.className = 'osp-xp-award-badge';
  badge.innerHTML = `${total}<span class="osp-xp-award-label"> DMG</span>`;
  _hitPopupEl.appendChild(badge);
  const wrap = _hitPopupEl;
  _hitPopupEl = null;
  setTimeout(() => wrap.remove(), 4000);
}

function showPlayerLockPopup() {
  if (document.querySelector('.osp-player-lock-popup')) return;
  const wrap = document.createElement('div');
  wrap.className = 'osp-xp-award-popup osp-player-lock-popup';

  const img = document.createElement('img');
  img.src = 'systems/osp-houserules/assets/images/icons/action_locked.webp';

  const btn = document.createElement('button');
  btn.className = 'osp-xp-award-close';
  btn.textContent = '✕  Dismiss';
  btn.addEventListener('click', () => wrap.remove());

  wrap.appendChild(img);
  wrap.appendChild(btn);
  document.body.appendChild(wrap);

  foundry.audio.AudioHelper.play({ src: 'systems/osp-houserules/assets/sounds/locked.ogg', volume: 1.0, loop: false });
}

Hooks.on("preUpdateToken", (tokenDoc, changes, options, userId) => {
  if (game.settings.get("osp-houserules", "playerLock") && !game.user.isGM) {
    if ("x" in changes || "y" in changes) {
      showPlayerLockPopup();
      return false;
    }
  }
  return true;
});

Hooks.on("preCreateChatMessage", (message, options, userId) => {
  if (!game.settings.get("osp-houserules", "playerLock")) return;
  if (game.user.isGM) return;
  if (message.rolls?.length > 0) {
    showPlayerLockPopup();
    return false;
  }
});

/**
 * Handle double-click on dropped item tokens to pick them up
 */
Hooks.on("targetToken", async (user, token, targeted) => {
  // Only proceed if targeting (not untargeting)
  if (!targeted) return;
  
  // Check if this is a dropped item token
  const isDroppedItem = token.document.flags?.['osp-houserules']?.droppedItem;
  if (!isDroppedItem) return;
  
  const itemData = token.document.flags['osp-houserules'].itemData;
  if (!itemData) return;
  
  // Untarget immediately to clean up
  token.setTarget(false, {releaseOthers: false});
  
  // Find controlled actors (characters that can pick up the item)
  const controlledTokens = canvas.tokens.controlled.filter(t => 
    t.actor?.type === "character" && t.id !== token.id
  );
  
  if (controlledTokens.length === 0) {
    ui.notifications.warn("You must control a character token to pick up items.");
    return;
  }
  
  // Use the first controlled actor
  const actorToken = controlledTokens[0];
  const actor = actorToken.actor;
  
  const currentQuantity = itemData.system.quantity || 1;
  
  // If quantity > 1, show quantity picker
  if (currentQuantity > 1) {
    const content = `
      <form>
        <div class="form-group">
          <label>Available Quantity: <strong>${currentQuantity}</strong></label>
          <label style="margin-top: 10px;">Pick up how many?</label>
          <input type="number" name="pickupQuantity" value="1" min="1" max="${currentQuantity}" style="width: 100%;" />
        </div>
      </form>
    `;

    new Dialog({
      title: `Pick up ${itemData.name}`,
      content: content,
      buttons: {
        pickAll: {
          icon: '<i class="fas fa-hand-holding"></i>',
          label: "Pick Up All",
          callback: async () => {
            try {
              // Check if actor already has this item
              const existingItem = actor.items.find(i => 
                i.name === itemData.name && 
                i.type === itemData.type &&
                i.img === itemData.img
              );
              
              if (existingItem) {
                // Stack with existing item
                const existingQty = parseInt(existingItem.system.quantity?.value ?? existingItem.system.quantity ?? 1);
                const newQuantity = existingQty + currentQuantity;
                await existingItem.update({ "system.quantity": newQuantity });
                ui.notifications.info(`Added ${currentQuantity} ${itemData.name} to inventory (total: ${newQuantity}).`);
              } else {
                // Create new item
                await actor.createEmbeddedDocuments("Item", [itemData]);
                ui.notifications.info(`Picked up ${currentQuantity} ${itemData.name}.`);
              }
              
              // Delete the token from scene
              await token.document.delete();
              
            } catch (error) {
              console.error("Error picking up item:", error);
              ui.notifications.error(`Failed to pick up item: ${error.message}`);
            }
          }
        },
        pickSpecific: {
          icon: '<i class="fas fa-hand-pointer"></i>',
          label: "Pick Up Quantity",
          callback: async (html) => {
            const pickupQty = parseInt(html.find('[name="pickupQuantity"]').val());
            const quantity = Math.min(Math.max(pickupQty, 1), currentQuantity);
            
            try {
              // Check if actor already has this item
              const existingItem = actor.items.find(i => 
                i.name === itemData.name && 
                i.type === itemData.type &&
                i.img === itemData.img
              );
              
              if (existingItem) {
                // Stack with existing item
                const existingQty = parseInt(existingItem.system.quantity?.value ?? existingItem.system.quantity ?? 1);
                const newQuantity = existingQty + quantity;
                await existingItem.update({ "system.quantity": newQuantity });
                ui.notifications.info(`Added ${quantity} ${itemData.name} to inventory (total: ${newQuantity}).`);
              } else {
                // Create new item with picked up quantity
                const newItemData = foundry.utils.duplicate(itemData);
                newItemData.system.quantity = quantity;
                await actor.createEmbeddedDocuments("Item", [newItemData]);
                ui.notifications.info(`Picked up ${quantity} ${itemData.name}.`);
              }
              
              // Update or delete the token
              if (quantity >= currentQuantity) {
                // Picked up all, delete the token
                await token.document.delete();
              } else {
                // Reduce quantity on token
                const remainingQuantity = currentQuantity - quantity;
                const updatedItemData = foundry.utils.duplicate(itemData);
                updatedItemData.system.quantity = remainingQuantity;
                
                await token.document.update({
                  name: `${itemData.name} (${remainingQuantity})`,
                  "flags.osp-houserules.itemData": updatedItemData
                });
              }
              
            } catch (error) {
              console.error("Error picking up item:", error);
              ui.notifications.error(`Failed to pick up item: ${error.message}`);
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "pickSpecific"
    }).render(true);
  } else {
    // Single item, simple pickup dialog
    new Dialog({
      title: `Pick up ${itemData.name}?`,
      content: `<p>Pick up <strong>${itemData.name}</strong>?</p>`,
      buttons: {
        yes: {
          icon: '<i class="fas fa-hand-holding"></i>',
          label: "Pick Up",
          callback: async () => {
            try {
              // Check if actor already has this item
              const existingItem = actor.items.find(i => 
                i.name === itemData.name && 
                i.type === itemData.type &&
                i.img === itemData.img
              );
              
              if (existingItem) {
                // Stack with existing item
                const existingQty = parseInt(existingItem.system.quantity?.value ?? existingItem.system.quantity ?? 1);
                const newQuantity = existingQty + 1;
                await existingItem.update({ "system.quantity": newQuantity });
                ui.notifications.info(`Added ${itemData.name} to inventory (total: ${newQuantity}).`);
              } else {
                // Create new item
                await actor.createEmbeddedDocuments("Item", [itemData]);
                ui.notifications.info(`Picked up ${itemData.name}.`);
              }
              
              // Delete the token from scene
              await token.document.delete();
              
            } catch (error) {
              console.error("Error picking up item:", error);
              ui.notifications.error(`Failed to pick up item: ${error.message}`);
            }
          }
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "yes"
    }).render(true);
  }
});

// Inject OSP theme picker into the Sheet Configuration dialog for character actors.
// Foundry v13 disables its native theme dropdown for AppV1 sheets, so we add our own row
// to the Document fieldset and save the choice as an actor flag on form submit.
Hooks.on('renderDocumentSheetConfig', (app, element) => {
  const fdoc = app.document;
  if (fdoc?.documentName !== 'Actor' || fdoc.type !== 'character') return;
  if (element.querySelector('.osp-theme-picker')) return;

  const fieldset = element.querySelector('fieldset');
  if (!fieldset) return;

  const currentTheme = fdoc.getFlag(game.system.id, 'sheetTheme') ?? 'default';

  const row = document.createElement('div');
  row.className = 'form-group osp-theme-picker';
  row.innerHTML = `
    <label>OSP Theme</label>
    <div class="form-fields">
      <select name="osp-sheetTheme">
        <option value="default"${currentTheme === 'default' ? ' selected' : ''}>Old School Green</option>
        <option value="parchment"${currentTheme === 'parchment' ? ' selected' : ''}>Cliche Parchment</option>
      </select>
    </div>
    <p class="hint">Visual theme for this character's sheet.</p>
  `;
  fieldset.appendChild(row);

  row.querySelector('select').addEventListener('change', (e) => {
    fdoc.setFlag(game.system.id, 'sheetTheme', e.currentTarget.value);
  });
});
