import { readItemSpell } from './spells/item-spell.js';
import { castSpellItem } from './spells/spellcasting-ui.js';
/**
 * @file Helper functions for creating and running OSP macros
 */
import { ItemHandler } from "./actor/sheets/handlers/item-handler.js";

/**
 * Create a macro from a dropped Item
 */
export const createOspMacro = async (data, slot) => {
  if (data.type !== "Item") return;
  if (!data.uuid) return ui.notifications.warn("Could not find item UUID for macro");

  const item = await fromUuid(data.uuid);
  if (!item) return ui.notifications.warn("Could not find item for macro");

  // Include actorId so the macro works without needing a token selected
  const actorId = item.parent?.id ?? null;
  const command = actorId
    ? `game.osp.rollItemMacro(${JSON.stringify(item.name)}, ${JSON.stringify(actorId)});`
    : `game.osp.rollItemMacro(${JSON.stringify(item.name)});`;

  let macro = game.macros.find((m) => m.name === item.name && m.command === command);
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command,
      flags: { [game.system.id]: { itemMacro: true } },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
};

/**
 * Roll an item macro — finds the item on the character and calls roll()
 */
export const rollItemMacro = (itemName, actorId = null) => {
  let actor;

  if (actorId) {
    actor = game.actors.get(actorId);
  } else {
    const speaker = ChatMessage.getSpeaker();
    if (speaker.token) actor = canvas.tokens.placeables.find(t => t.id === speaker.token)?.actor;
    if (!actor) actor = game.actors.get(speaker.actor);
  }

  const item = actor?.items.find((i) => i.name === itemName);
  if (!item) {
    return ui.notifications.warn(
      `Could not find item named "${itemName}" on the selected actor`
    );
  }

  if (readItemSpell(item)) return castSpellItem(actor, item).catch(error => ui.notifications.error(error.message));

  // For weapons, do a basic attack roll
  if (item.type === "weapon") {
    return _rollWeaponMacro(actor, item);
  }

  if (item.type === 'spell') return castSpellItem(actor, item).catch(error => ui.notifications.error(error.message));

  // Ordinary ability macros display information.
  return _rollAbilityMacro(actor, item);
};

/**
 * Roll a table macro
 */
export const rollTableMacro = async (tableName) => {
  const table = game.tables.find((t) => t.name === tableName);
  if (!table) {
    return ui.notifications.warn(`Could not find table named "${tableName}"`);
  }
  const { results } = await table.roll();
  table.toMessage(results);
};

/**
 * Internal: handle weapon attack via chat
 */
const _rollWeaponMacro = async (actor, item) => {
  return new ItemHandler(null, actor, actor.sheet).rollWeapon(item);
};

/**
 * Internal: handle ability/spell info to chat
 */
const _rollAbilityMacro = async (actor, item) => {
  const chatData = {
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: item.name,
    content: `<p>${item.system.description || ""}</p><p>This is an information card. Spell-producing inventory items use the Cast action on their item card.</p>`,
  };
  ChatMessage.create(chatData);
};
