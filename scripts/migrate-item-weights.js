/**
 * Migration macro: update unitWeight on existing world items and actor-embedded
 * items to historically accurate values.
 *
 * Run once in Foundry's macro editor (as GM).
 * Affects: world Items collection + items embedded on Actors.
 */

const WEIGHT_CORRECTIONS = {
  // Weapons
  "Bastard Sword":      6,
  "Battle Axe":         5,
  "Battle Axe, 2-Handed": 8,
  "Broadsword":         3,
  "Crossbow, Heavy":    12,
  "Crossbow, Light":    6,
  "Flail":              4,
  "Great Club":         6,
  "Hand Axe":           3,
  "Javelin":            3,
  "Khopesh":            4,
  "Lance":              8,
  "Longbow":            2,
  "Longsword":          3,
  "Mace":               4,
  "Morning Star":       5,
  "Pole Arm":           7,
  "Shortsword":         2,
  "Sickle":             1,
  "Spear":              4,
  "Warhammer":          4,
  "Zweihander":         6,
  // Armor
  "Banded mail":        30,
  "Body Shield":        12,
  "Brigandine":         20,
  "Bronze plate":       50,
  "Chain mail":         25,
  "Field plate":        45,
  "Full plate":         50,
  "Great helm":         5,
  "Hide":               25,
  "Leather":            10,
  "Padded":             8,
  "Ring mail":          22,
  "Shield":             7,
  "Studded Leather":    15,
  // Gear
  "Bedroll":            4,
  "Crowbar (2 ft.)":    3,
  "Grappling Hook":     2,
  "Pole, Ten Foot":     5,
  "Rope, Hempen (50')": 7,
  "Rope, Silken (50')": 3,
  "Waterskin":          5,
  "Wineskin":           3,
};

let updatedItems    = 0;
let updatedEmbedded = 0;
const skipped = [];
const errors  = [];

// --- World Items ---
for (const item of game.items) {
  const newWeight = WEIGHT_CORRECTIONS[item.name];
  if (newWeight === undefined) continue;
  const oldWeight = item.system?.unitWeight;
  if (oldWeight === newWeight) continue;
  try {
    await item.update({ "system.unitWeight": newWeight });
    updatedItems++;
  } catch (e) {
    errors.push(`Item "${item.name}" (${item.id}): ${e.message}`);
  }
}

// --- Embedded Items on Actors ---
for (const actor of game.actors) {
  for (const item of actor.items) {
    const newWeight = WEIGHT_CORRECTIONS[item.name];
    if (newWeight === undefined) continue;
    const oldWeight = item.system?.unitWeight;
    if (oldWeight === newWeight) continue;
    try {
      await item.update({ "system.unitWeight": newWeight });
      updatedEmbedded++;
    } catch (e) {
      errors.push(`Actor "${actor.name}" › item "${item.name}": ${e.message}`);
    }
  }
}

// --- Report ---
const lines = [
  `Weight migration complete.`,
  `  World items updated:    ${updatedItems}`,
  `  Embedded items updated: ${updatedEmbedded}`,
];
if (errors.length) {
  lines.push(`  Errors (${errors.length}):`);
  errors.forEach(e => lines.push(`    • ${e}`));
}
console.log(lines.join('\n'));
ui.notifications.info(
  `Weight migration done — ${updatedItems} world items, ${updatedEmbedded} embedded items updated.`
);
