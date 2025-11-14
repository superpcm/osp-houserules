/**
 * Script to migrate weight field to unitWeight in all actors and world items
 * Run this in the Foundry console (F12)
 */

(async function migrateWeightToUnitWeight() {
  console.log("Starting weight to unitWeight migration...");
  
  let updatedCount = 0;
  
  // Update world items
  console.log("Migrating world items...");
  for (const item of game.items) {
    if (item.system.weight !== undefined && item.system.unitWeight === undefined) {
      await item.update({ 
        "system.unitWeight": item.system.weight,
        "system.-=weight": null  // Remove old field
      });
      console.log(`Migrated world item: ${item.name} (${item.system.weight} -> unitWeight)`);
      updatedCount++;
    }
  }
  
  // Update items in all actors
  console.log("Migrating actor items...");
  for (const actor of game.actors) {
    for (const item of actor.items) {
      if (item.system.weight !== undefined && item.system.unitWeight === undefined) {
        await item.update({ 
          "system.unitWeight": item.system.weight,
          "system.-=weight": null  // Remove old field
        });
        console.log(`Migrated ${actor.name}'s item: ${item.name} (${item.system.weight} -> unitWeight)`);
        updatedCount++;
      }
    }
  }
  
  console.log(`Migration complete! Updated ${updatedCount} items total.`);
  ui.notifications.info(`Migrated ${updatedCount} items from weight to unitWeight.`);
})();
