/**
 * Migration script to populate lashSlots and lashAllowedSizes on clothing items.
 * These fields were added to template.json after initial data import, so existing
 * items in the world need to be updated manually.
 *
 * Run in the Foundry F12 console:
 *   Copy and paste this entire script and press Enter.
 */

(async function migrateClothingLashSlots() {
  // Map of clothing item names → their correct lash configuration.
  // Add entries here if other clothing items gain lash slots in future.
  const lashConfig = {
    "Belt": { lashSlots: 2, lashAllowedSizes: ["S"] },
  };

  let updatedCount = 0;
  let skippedCount = 0;

  for (const actor of game.actors) {
    for (const item of actor.items) {
      if (item.type !== "clothing") continue;

      const cfg = lashConfig[item.name];
      if (!cfg) continue;

      // Skip if already correct
      if (item.system.lashSlots === cfg.lashSlots) {
        skippedCount++;
        continue;
      }

      await item.update({
        "system.lashSlots": cfg.lashSlots,
        "system.lashAllowedSizes": cfg.lashAllowedSizes,
      });
      updatedCount++;
      console.log(`  Updated ${actor.name} → ${item.name}: lashSlots=${cfg.lashSlots}, lashAllowedSizes=${JSON.stringify(cfg.lashAllowedSizes)}`);
    }
  }

  // Also update world items (compendium cache / sidebar items not on actors)
  for (const item of game.items) {
    if (item.type !== "clothing") continue;

    const cfg = lashConfig[item.name];
    if (!cfg) continue;

    if (item.system.lashSlots === cfg.lashSlots) {
      skippedCount++;
      continue;
    }

    await item.update({
      "system.lashSlots": cfg.lashSlots,
      "system.lashAllowedSizes": cfg.lashAllowedSizes,
    });
    updatedCount++;
    console.log(`  Updated world item ${item.name}: lashSlots=${cfg.lashSlots}`);
  }

  console.log(`Migration complete! Updated: ${updatedCount}, Skipped (already correct): ${skippedCount}`);
  console.log("Refresh character sheets to see lash slots on Belt.");
})();
