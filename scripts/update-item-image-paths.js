/**
 * Update all item image paths from old structure to new structure
 * Run this in the Foundry console (F12)
 * 
 * This updates items that are already in your world to use the correct image paths
 */

async function updateItemImagePaths() {
  console.log('Starting item image path update...');
  
  const updates = [];
  
  // Path mappings: old icons directory -> new organized directories
  const pathMappings = [
    // Coins moved to treasure directory
    { old: 'assets/images/icons/gold-coin', new: 'assets/images/treasure/gold-coin' },
    { old: 'assets/images/icons/silver-coins', new: 'assets/images/treasure/silver-coins' },
    { old: 'assets/images/icons/copper-coins', new: 'assets/images/treasure/copper-coins' },
    
    // Everything else from icons moved to gear
    { old: 'assets/images/icons/', new: 'assets/images/gear/' }
  ];
  
  for (let item of game.items) {
    if (!item.img) continue;
    
    let newPath = item.img;
    let changed = false;
    
    // Check each mapping
    for (let mapping of pathMappings) {
      if (newPath.includes(mapping.old)) {
        newPath = newPath.replace(mapping.old, mapping.new);
        changed = true;
        break; // Stop after first match
      }
    }
    
    if (changed) {
      updates.push({ _id: item.id, img: newPath });
      console.log(`📝 Will update ${item.name}:`);
      console.log(`   Old: ${item.img}`);
      console.log(`   New: ${newPath}`);
    }
  }
  
  if (updates.length > 0) {
    console.log(`\n🔄 Updating ${updates.length} items...`);
    await Item.updateDocuments(updates);
    console.log('✅ Update complete!');
    ui.notifications.info(`Updated ${updates.length} item image paths`);
  } else {
    console.log('✅ No items needed updating');
    ui.notifications.info('All item paths are already correct');
  }
  
  return updates;
}

// Run the function
updateItemImagePaths();
