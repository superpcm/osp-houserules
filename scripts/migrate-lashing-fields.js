/**
 * Migration script to add lashable and lashed fields to existing items
 * Run this in the browser console while in your Foundry world:
 * 
 * Copy and paste this entire script into the F12 console and press Enter
 */

(async function migrateLashingFields() {
  console.log("Starting lashing fields migration...");
  
  // Define which items should be lashable
  const lashableItems = [
    "Crowbar",
    "Grappling hook", 
    "Lantern",
    "Pole (10' long)",
    "Rope (50')",
    "Sack (large)"
  ];
  
  let updatedCount = 0;
  let skippedCount = 0;
  
  // Get all actors
  for (const actor of game.actors) {
    console.log(`Processing actor: ${actor.name}`);
    
    // Get all items for this actor
    for (const item of actor.items) {
      // Check if item already has the lashable field
      if (item.system.lashable !== undefined) {
        skippedCount++;
        continue;
      }
      
      // Determine if this item should be lashable based on its name
      const isLashable = lashableItems.includes(item.name);
      
      // Update the item
      await item.update({
        "system.lashable": isLashable,
        "system.lashed": false
      });
      
      updatedCount++;
      console.log(`  Updated ${item.name}: lashable=${isLashable}`);
    }
  }
  
  console.log(`Migration complete!`);
  console.log(`  Updated: ${updatedCount} items`);
  console.log(`  Skipped: ${skippedCount} items (already had fields)`);
  console.log(`Please refresh your character sheets to see the lash icons.`);
})();
