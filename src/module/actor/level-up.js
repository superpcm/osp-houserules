/**
 * @file Hit Die rolling on level-up.
 *
 * House rule: only level 1 gets max Hit Die value. Every level after that rolls its own Hit
 * Die (+ CON modifier, minimum 1) and the result is added to the character's banked
 * system.maxhitpoints — it does not get recalculated from scratch each render like the old
 * always-max-HD formula did. Level 1's HP (and any level already reached before this system
 * shipped) is baked into system.maxhitpoints once by character-sheet.js's getData() — this
 * module only ever handles levels gained *after* that baseline, via flags.osp-houserules.lastKnownLevel.
 */

import { getHitDieMax, getAbilityModifier } from "../../config/classes.js";
import { ospRoll, buildManualChatContent } from "../dice.js";

/**
 * Roll (virtual or manual, per the player's usual dice-mode settings) a Hit Die for each level
 * gained between fromLevel (exclusive) and toLevel (inclusive), skipping level 1 since that's
 * covered by the banked baseline rather than a roll. Posts each roll to chat and accumulates
 * the result into system.maxhitpoints.
 *
 * @param {import('./actor.js').OspActor} actor
 * @param {number} fromLevel - the actor's last-known level before this XP change
 * @param {number} toLevel - the actor's new level after this XP change
 */
export async function handleLevelUp(actor, fromLevel, toLevel) {
  const dieSize = getHitDieMax(actor.system.class || '');
  const conMod = getAbilityModifier(actor.system.attributes?.con?.value);
  const modStr = conMod > 0 ? `+${conMod}` : conMod < 0 ? `${conMod}` : '';
  const formula = `1d${dieSize}${modStr}`;

  for (let level = Math.max(fromLevel, 1) + 1; level <= toLevel; level++) {
    const label = `${actor.name} — Hit Die (Level ${level})`;
    const result = await ospRoll(formula, { label });

    if (result.cancelled) {
      ui.notifications.warn(`${actor.name}'s Hit Die roll for Level ${level} was cancelled — maxHP not updated. Use the DM Toolkit's "Set maxHP" to adjust manually.`);
      continue;
    }

    const hpGained = Math.max(1, result.total);
    const newMax = (actor.system.maxhitpoints || 0) + hpGained;
    await actor.update({ 'system.maxhitpoints': newMax });

    const speaker = ChatMessage.getSpeaker({ actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const flavor = `${label}: <strong>+${hpGained} HP</strong> (max HP now ${newMax})`;
    const safeFlavor = DOMPurify.sanitize(flavor);

    if (result.foundryRoll) {
      await result.foundryRoll.toMessage({ speaker, flavor: safeFlavor, rollMode });
    } else {
      const whisperData = ChatMessage.applyRollMode({}, rollMode);
      await ChatMessage.create({
        ...whisperData,
        speaker,
        flavor: safeFlavor,
        content: buildManualChatContent(result, { formula, label })
      });
    }
  }
}
