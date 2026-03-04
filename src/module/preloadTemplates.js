/**
 * @file Preloads Handlebars templates for OSP
 */
import { OSP } from "./config";

export const preloadHandlebarsTemplates = async () => {
  const path = OSP.systemPath();

  const templatePaths = [
    // Actor sheet tabs
    `${path}/templates/actors/character-sheet.html`,
    `${path}/templates/actors/gear-tab.html`,
    `${path}/templates/actors/monster-sheet.html`,

    // Item sheets
    `${path}/templates/items/weapon-sheet.html`,
    `${path}/templates/items/armor-sheet.html`,
    `${path}/templates/items/item-sheet.html`,
    `${path}/templates/items/container-sheet.html`,
    `${path}/templates/items/coin-sheet.html`,
    `${path}/templates/items/ability-sheet.html`,
    `${path}/templates/items/spell-sheet.html`,

    // Chat templates
    `${path}/templates/chat/roll-attack.html`,
    `${path}/templates/chat/roll-result.html`,
    `${path}/templates/chat/roll-dialog.html`,
    `${path}/templates/chat/roll-treasure.html`,

    // Dialog templates
    `${path}/templates/dialogs/item-card-dialog.html`,
    `${path}/templates/dialogs/character-creator.html`,
    `${path}/templates/dialogs/character-gp-cost.html`,
    `${path}/templates/dialogs/modifiers-dialog.html`,
    `${path}/templates/dialogs/entity-tweaks.html`,

    // Party sheet
    `${path}/templates/party/party-sheet.html`,
    `${path}/templates/party/party-xp.html`,

    // Combat apps
    `${path}/templates/apps/combat-set-groups.hbs`,
  ];

  return foundry.applications.handlebars.loadTemplates(templatePaths);
};
