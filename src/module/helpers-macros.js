import { readItemSpell } from './spells/item-spell.js';
import { castSpellItem } from './spells/spellcasting-ui.js';
/**
 * @file Helper functions for creating and running OSP macros
 */
import { ItemHandler } from "./actor/sheets/handlers/item-handler.js";
import { rollAbility } from './actor/ability-roll.js';

const resolveUuid = async (uuid) => {
  try { return await fromUuid(uuid); } catch { return null; }
};

/**
 * Create a macro from a dropped Item
 */
export const createOspMacro = async (data, slot) => {
  if (data.type !== "Item") return;
  if (!data.uuid) return ui.notifications.warn("Could not find item UUID for macro");

  const item = await resolveUuid(data.uuid);
  if (!item) return ui.notifications.warn("Could not find item for macro");

  const actor = item.parent?.documentName === "Actor" ? item.parent : null;
  const reference = actor && item.uuid ? {
    itemUuid: item.uuid,
    actorUuid: actor.uuid,
    itemId: item.id,
    itemName: item.name,
  } : null;
  // World-item drops retain the old speaker-owned behavior. Actor items use
  // document identity so duplicate names and synthetic token actors remain stable.
  const command = reference
    ? `game.osp.rollItemMacro(${JSON.stringify(reference)});`
    : `game.osp.rollItemMacro(${JSON.stringify(item.name)});`;

  let macro = game.macros.find((m) => m.name === item.name && m.command === command);
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command,
      flags: { [game.system.id]: { itemMacro: true, ...(reference ?? {}) } },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
};

/**
 * Roll an item macro — finds the item on the character and calls roll()
 */
export const rollItemMacro = async (itemNameOrReference, actorId = null) => {
  const reference = itemNameOrReference && typeof itemNameOrReference === "object"
    ? itemNameOrReference : null;
  let actor;
  let item;

  if (reference?.itemUuid) {
    item = await resolveUuid(reference.itemUuid);
    if (!item) return ui.notifications.warn("Could not find the item referenced by this macro");
    if (reference.itemId && item.id !== reference.itemId) {
      return ui.notifications.warn("The item referenced by this macro no longer matches");
    }
    actor = item.parent;
    if (reference.actorUuid) {
      const referencedActor = await resolveUuid(reference.actorUuid);
      if (!referencedActor || !actor || referencedActor.uuid !== actor.uuid) {
        return ui.notifications.warn("The actor referenced by this macro no longer matches");
      }
      actor = referencedActor;
    }
  } else if (reference) {
    return ui.notifications.warn("Could not resolve the item referenced by this macro");
  } else {
    const itemName = itemNameOrReference;
    const speaker = ChatMessage.getSpeaker();
    const tokenActor = speaker.token
      ? (globalThis.canvas?.tokens?.placeables?.find(t => t.id === speaker.token)?.actor
        ?? game.scenes?.get?.(speaker.scene)?.tokens?.get?.(speaker.token)?.actor)
      : null;
    if (actorId) {
      // Legacy macros should use the matching synthetic speaker actor first.
      const matchingSpeakerToken = tokenActor && (tokenActor.id === actorId || tokenActor.uuid === actorId || tokenActor.baseActor?.id === actorId)
        ? tokenActor : null;
      let matchingToken = matchingSpeakerToken;
      if (!matchingToken) {
        const controlledMatches = [...new Map((globalThis.canvas?.tokens?.controlled ?? [])
          .map(token => token.actor)
          .filter(candidate => candidate && (candidate.id === actorId || candidate.uuid === actorId || candidate.baseActor?.id === actorId))
          .map(candidate => [candidate.uuid ?? candidate.id, candidate])).values()];
        if (controlledMatches.length > 1) {
          return ui.notifications.warn(`Multiple token actors match legacy actor "${actorId}"; this macro cannot choose one`);
        }
        matchingToken = controlledMatches[0] ?? null;
      }
      actor = matchingToken ?? game.actors.get(actorId);
    } else {
      actor = tokenActor ?? game.actors.get(speaker.actor);
    }
    const matches = actor?.items ? [...actor.items].filter(i => i.name === itemName) : [];
    if (matches.length > 1) {
      return ui.notifications.warn(`Multiple items named "${itemName}" were found; this legacy macro cannot choose one`);
    }
    item = matches[0];
    if (!item) {
      return ui.notifications.warn(`Could not find item named "${itemName}" on the selected actor`);
    }
  }

  if (!actor || !item) {
    return ui.notifications.warn("Could not resolve the item referenced by this macro");
  }

  if (item.type === 'ability') return rollAbility(item).catch(error => ui.notifications.error(error.message));
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
