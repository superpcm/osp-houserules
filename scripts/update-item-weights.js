/**
 * Script to update item weights to per-unit values in all actors and world items
 * Run this in the Foundry console (F12)
 */

(async function updateItemWeights() {
  console.log("Starting item weight update...");
  
  // Define the weight updates (item name -> new per-unit weight)
  const weightUpdates = {
    "Iron Spikes": 0.333333,           // Was 4, now 0.333333 per spike
    "Rations (iron, 7 days)": 1,       // Was 7, now 1 per day
    "Rations (standard, 7 days)": 2,   // Was 14, now 2 per day
    "Stakes and mallet": 1,            // Was 3, now 1 per stake
    "Torch": 0.166667                  // Was 1, now 0.166667 per torch
  };
  
  let updatedCount = 0;
  
  // Update world items in compendiums/world
  console.log("Updating world items...");
  for (const item of game.items) {
    if (weightUpdates.hasOwnProperty(item.name)) {
      const newWeight = weightUpdates[item.name];
      await item.update({ "system.unitWeight": newWeight });
      console.log(`Updated world item: ${item.name} -> ${newWeight} lbs`);
      updatedCount++;
    }
  }
  
  // Update items in all actors
  console.log("Updating actor items...");
  for (const actor of game.actors) {
    for (const item of actor.items) {
      if (weightUpdates.hasOwnProperty(item.name)) {
        const newWeight = weightUpdates[item.name];
        await item.update({ "system.unitWeight": newWeight });
        console.log(`Updated ${actor.name}'s item: ${item.name} -> ${newWeight} lbs`);
        updatedCount++;
      }
    }
  }
  
  console.log(`Weight update complete! Updated ${updatedCount} items total.`);
  ui.notifications.info(`Updated ${updatedCount} items to per-unit weights.`);
})();
