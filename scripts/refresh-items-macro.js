/**
 * Foundry VTT Macro: Refresh All Items from JSON
 * 
 * This macro updates all existing world items with the latest data from JSON files.
 * Use this after modifying JSON files to sync changes to Foundry.
 * 
 * Usage:
 * 1. Create a new macro in Foundry
 * 2. Set type to "Script"
 * 3. Copy this entire script into the macro
 * 4. Run the macro to refresh all items
 */

async function refreshAllItems() {
  ui.notifications.info("Starting item refresh...");
  
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
  
  // Load all data files with cache busting
  for (const filePath of dataFiles) {
    try {
      const cacheBuster = `?v=${Date.now()}&r=${Math.random()}`;
      const response = await fetch(`${filePath}${cacheBuster}`);
      const items = await response.json();
      const fileName = filePath.split('/').pop();
      console.log(`Loaded ${items.length} items from ${fileName}`);
      allItems = allItems.concat(items);
    } catch (error) {
      console.error(`Failed to load ${filePath}:`, error);
      ui.notifications.warn(`Failed to load ${filePath.split('/').pop()}`);
    }
  }
  
  if (allItems.length === 0) {
    ui.notifications.error("No items loaded from JSON files!");
    return;
  }
  
  console.log(`Total items loaded: ${allItems.length}`);
  
  let updated = 0;
  let created = 0;
  let skipped = 0;
  
  for (const itemData of allItems) {
    try {
      // Find existing item by name and type
      const existing = game.items.find(i => 
        i.name === itemData.name && 
        i.type === itemData.type
      );
      
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
        created++;
      }
    } catch (error) {
      console.error(`❌ Failed to process "${itemData.name}":`, error);
      skipped++;
    }
  }
  
  console.log("\n=== REFRESH COMPLETE ===");
  console.log(`✅ Updated: ${updated} items`);
  console.log(`➕ Created: ${created} items`);
  console.log(`⏭️  Skipped: ${skipped} items`);
  
  ui.notifications.info(`Refresh complete! Updated: ${updated}, Created: ${created}, Skipped: ${skipped}`);
}

// Run the refresh
refreshAllItems();
