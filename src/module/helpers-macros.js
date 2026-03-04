/**
 * @file Helper functions for creating and running OSP macros
 */

/**
 * Create a macro from a dropped Item
 */
export const createOspMacro = async (data, slot) => {
  if (data.type !== "Item") return;
  if (!data.uuid) return ui.notifications.warn("Could not find item UUID for macro");

  const item = await fromUuid(data.uuid);
  if (!item) return ui.notifications.warn("Could not find item for macro");

  // Create a macro command
  const command = `game.osp.rollItemMacro("${item.name}");`;
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
export const rollItemMacro = (itemName) => {
  const speaker = ChatMessage.getSpeaker();
  let actor;

  if (speaker.token) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);

  const item = actor?.items.find((i) => i.name === itemName);
  if (!item) {
    return ui.notifications.warn(
      `Could not find item named "${itemName}" on the selected actor`
    );
  }

  // For weapons, do a basic attack roll
  if (item.type === "weapon") {
    return _rollWeaponMacro(actor, item);
  }

  // For spells and abilities, send info to chat
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
  const roll = await new Roll("1d20").evaluate();
  const chatData = {
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${item.name} Attack`,
    content: `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">${roll.formula}</div><div class="dice-total">${roll.total}</div></div></div><p><strong>Damage:</strong> ${item.system.damage}</p>`,
    type: CONST.CHAT_MESSAGE_TYPES?.ROLL ?? 0,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
  };
  ChatMessage.create(chatData);
};

/**
 * Internal: handle ability/spell info to chat
 */
const _rollAbilityMacro = async (actor, item) => {
  const chatData = {
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: item.name,
    content: `<p>${item.system.description || ""}</p>`,
  };
  ChatMessage.create(chatData);
};
