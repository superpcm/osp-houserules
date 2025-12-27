/**
 * Foundry VTT Macro: Refresh All Items from JSON
 * 
 * This macro updates all existing world items with the latest data from JSON files.
 * Removes duplicates and ensures each item only exists once.
 * 
 * Usage:
 * 1. Create a new macro in Foundry
 * 2. Set type to "Script"
 * 3. Copy this entire script into the macro
 * 4. Run the macro to refresh all items
 */

async function refreshAllItems() {
  ui.notifications.info("Starting item refresh and duplicate removal...");
  
  // Step 1: Remove duplicates and wrong-type items
  console.log("=== STEP 1: REMOVING DUPLICATES ===");
  
  // First, load JSON data to know the correct types
  const dataFiles = [
    'systems/osp-houserules/data/ammunition.json',
    'systems/osp-houserules/data/armor.json',
    'systems/osp-houserules/data/clothing.json',
    'systems/osp-houserules/data/equipment.json',
    'systems/osp-houserules/data/livestock.json',
    'systems/osp-houserules/data/misc.json',
    'systems/osp-houserules/data/tack.json',
    'systems/osp-houserules/data/treasure.json',
    'systems/osp-houserules/data/weapons.json'
  ];
  
  let allItems = [];
  for (const filePath of dataFiles) {
    try {
      const cacheBuster = `?v=${Date.now()}&r=${Math.random()}`;
      const response = await fetch(`${filePath}${cacheBuster}`);
      const items = await response.json();
      allItems = allItems.concat(items);
    } catch (error) {
      console.error(`Failed to load ${filePath}:`, error);
    }
  }
  
  // Create a map of item name to correct type from JSON
  const correctTypes = new Map();
  for (const item of allItems) {
    correctTypes.set(item.name, item.type);
  }
  
  const itemsByNameAndType = new Map();
  const itemsByNameOnly = new Map();
  
  for (const item of game.items) {
    const key = `${item.name}|${item.type}`;
    if (!itemsByNameAndType.has(key)) {
      itemsByNameAndType.set(key, []);
    }
    itemsByNameAndType.get(key).push(item);
    
    // Also track by name only
    if (!itemsByNameOnly.has(item.name)) {
      itemsByNameOnly.set(item.name, []);
    }
    itemsByNameOnly.get(item.name).push(item);
  }
  
  let duplicatesRemoved = 0;
  const deletedItemNames = new Set();
  
  // First pass: Remove duplicates with same name AND type
  for (const [key, items] of itemsByNameAndType) {
    if (items.length > 1) {
      console.log(`Found ${items.length} duplicates of: ${key.split('|')[0]}`);
      // Keep the first one, delete the rest
      for (let i = 1; i < items.length; i++) {
        await items[i].delete();
        duplicatesRemoved++;
      }
    }
  }
  
  // Second pass: Remove items with same name but WRONG type
  for (const [name, items] of itemsByNameOnly) {
    const correctType = correctTypes.get(name);
    if (correctType) {
      for (const item of items) {
        if (item.type !== correctType) {
          console.log(`Removing wrong-type item: "${name}" (${item.type} → should be ${correctType})`);
          await item.delete();
          deletedItemNames.add(name);
          duplicatesRemoved++;
        }
      }
    }
  }
  
  console.log(`Removed ${duplicatesRemoved} duplicate/wrong-type items\n`);
  
  // Step 2: Already loaded in Step 1
  console.log(`Total items loaded: ${allItems.length}\n`);
  
  console.log("=== STEP 3: UPDATING/CREATING ITEMS ===");
  let updated = 0;
  let created = 0;
  let skipped = 0;
  const createdItemsList = [];
  
  for (const itemData of allItems) {
    try {
      // If this item was just deleted for wrong type, force-create it
      if (deletedItemNames.has(itemData.name)) {
        const createData = { ...itemData };
        
        if (createData.img && !createData.img.startsWith('systems/') && !createData.img.startsWith('icons/')) {
          createData.img = `systems/osp-houserules/${createData.img}`;
        }
        
        await Item.create(createData);
        console.log(`➕ Created (was wrong type): ${itemData.name}`);
        createdItemsList.push(`${itemData.name} (${itemData.type})`);
        created++;
        continue;
      }
      
      // Find existing item by name and type, or by image path if name changed
      let existing = game.items.find(i => 
        i.name === itemData.name && 
        i.type === itemData.type
      );
      
      // If not found by name, try matching by image path and type (handles renamed items)
      if (!existing && itemData.img) {
        existing = game.items.find(i => 
          i.type === itemData.type &&
          i.img && 
          (i.img === itemData.img || 
           i.img.endsWith(itemData.img.split('/').pop()) ||
           itemData.img.endsWith(i.img.split('/').pop()))
        );
        if (existing) {
          console.log(`🔄 Matched by image: "${existing.name}" → "${itemData.name}"`);
        }
      }
      
      if (existing) {
        // Update existing item with new data
        const updateData = { ...itemData };
        
        // Ensure proper image path
        if (updateData.img && !updateData.img.startsWith('systems/') && !updateData.img.startsWith('icons/')) {
          updateData.img = `systems/osp-houserules/${updateData.img}`;
        }
        
        await existing.update(updateData);
        console.log(`✅ Updated: ${itemData.name}`);
        updated++;
      } else {
        // Create new item if it doesn't exist
        const createData = { ...itemData };
        
        // Ensure proper image path
        if (createData.img && !createData.img.startsWith('systems/') && !createData.img.startsWith('icons/')) {
          createData.img = `systems/osp-houserules/${createData.img}`;
        }
        
        await Item.create(createData);
        console.log(`➕ Created: ${itemData.name}`);
        createdItemsList.push(`${itemData.name} (${itemData.type})`);
        created++;
      }
    } catch (error) {
      console.error(`❌ Failed to process "${itemData.name}":`, error);
      skipped++;
    }
  }
  
  // Display list of created items
  if (createdItemsList.length > 0) {
    console.log("\n📝 CREATED ITEMS:");
    createdItemsList.forEach(item => console.log(`  • ${item}`));
  }
  
  console.log("\n=== STEP 4: UPDATING ACTOR ITEMS ===");
  let actorItemsUpdated = 0;
  let actorItemsSkipped = 0;
  
  // Update items on all actors
  for (const actor of game.actors) {
    for (const item of actor.items) {
      try {
        // Find matching data from loaded items
        let matchingData = allItems.find(data => 
          data.name === item.name && 
          data.type === item.type
        );
        
        // If not found by name, try matching by image path
        if (!matchingData && item.img) {
          matchingData = allItems.find(data => 
            data.type === item.type &&
            data.img && 
            (data.img === item.img || 
             data.img.endsWith(item.img.split('/').pop()) ||
             item.img.endsWith(data.img.split('/').pop()))
          );
          if (matchingData) {
            console.log(`🔄 Actor item matched by image: "${item.name}" → "${matchingData.name}" on ${actor.name}`);
          }
        }
        
        if (matchingData) {
          // Update actor's item with new data (preserve container/equipped state)
          const updateData = {
            name: matchingData.name,
            img: matchingData.img,
            system: {
              ...matchingData.system,
              // Preserve actor-specific state
              containerId: item.system.containerId,
              equipped: item.system.equipped,
              quantity: item.system.quantity
            }
          };
          
          await item.update(updateData);
          actorItemsUpdated++;
        } else {
          actorItemsSkipped++;
        }
      } catch (error) {
        console.error(`❌ Failed to update item "${item.name}" on actor "${actor.name}":`, error);
        actorItemsSkipped++;
      }
    }
  }
  
  console.log(`✅ Updated ${actorItemsUpdated} items on actors`);
  console.log(`⏭️  Skipped ${actorItemsSkipped} items on actors\n`);
  
  console.log("=== REFRESH COMPLETE ===");
  console.log(`🗑️  Duplicates removed: ${duplicatesRemoved}`);
  console.log(`✅ World items updated: ${updated}`);
  console.log(`➕ World items created: ${created}`);
  console.log(`⏭️  World items skipped: ${skipped}`);
  console.log(`✅ Actor items updated: ${actorItemsUpdated}`);
  console.log(`⏭️  Actor items skipped: ${actorItemsSkipped}`);
  
  ui.notifications.info(`Refresh complete! Duplicates: ${duplicatesRemoved}, World items: ${updated} updated/${created} created, Actor items: ${actorItemsUpdated} updated`);
}

// Run the refresh
refreshAllItems();
