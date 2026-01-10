/**
 * Script to add gear and treasure items to Foundry dynamically
 * Run this in the Foundry console (F12) to add items to the world
 * 
 * Usage:
 * 1. Copy this entire script
 * 2. Open Foundry console (F12)
 * 3. Paste and press Enter
 * 4. Items will be created as world items that can be dragged to character sheets
 * 
 * To force update existing items, use: addItemsToFoundry(true)
 */

async function addItemsToFoundry(forceUpdate = false) {
  console.log("Starting item import...");
  console.log("Force update mode:", forceUpdate);
  
  const dataFiles = [
    'systems/osp-houserules/data/ammunition.json',
    'systems/osp-houserules/data/armor.json',
    'systems/osp-houserules/data/clothing.json',
    'systems/osp-houserules/data/gear.json',
    'systems/osp-houserules/data/livestock.json',
    'systems/osp-houserules/data/tack.json',
    'systems/osp-houserules/data/treasure.json',
    'systems/osp-houserules/data/weapons.json'
  ];
  
  let allItems = [];
  
  // Load all data files
  for (const filePath of dataFiles) {
    try {
      const cacheBuster = `?v=${Date.now()}`;
      const response = await fetch(`${filePath}${cacheBuster}`);
      const items = await response.json();
      const fileName = filePath.split('/').pop();
      console.log(`Loaded ${items.length} items from ${fileName}`);
      allItems = allItems.concat(items);
    } catch (error) {
      console.error(`Failed to load ${filePath}:`, error);
      ui.notifications.warn(`Failed to load ${filePath.split('/').pop()}. Continuing with other files...`);
    }
  }
  
  if (allItems.length === 0) {
    console.error("No items loaded from any data file!");
    ui.notifications.error("Failed to load any item data files.");
    return;
  }
  
  console.log(`Total items to process: ${allItems.length}`);
  
  // Show what items are currently in the world
  console.log(`Current world items: ${game.items.size} items`);
  
  // Check if item types are registered
  let validTypes = game.system.documentTypes?.Item || game.system.template?.Item?.types || [];
  
  // Extract type names - documentTypes returns objects, template returns array of strings
  if (Array.isArray(validTypes) && validTypes.length > 0 && typeof validTypes[0] === 'object') {
    validTypes = validTypes.map(t => t.name || t);
  } else if (!Array.isArray(validTypes)) {
    validTypes = Object.keys(validTypes);
  }
  
  console.log("Available Item types:", validTypes);
  
  const createdItems = [];
  const skippedItems = [];
  const updatedItems = [];
  
  for (const itemInfo of allItems) {
    try {
      // Validate item type
      if (!validTypes.includes(itemInfo.type)) {
        console.warn(`Unknown item type "${itemInfo.type}" for item "${itemInfo.name}". Skipping.`);
        skippedItems.push(itemInfo.name);
        continue;
      }
      
      // Check if item already exists in world items
      const existing = game.items.find(i => 
        i.name === itemInfo.name && 
        i.type === itemInfo.type
      );
      
      if (existing) {
        console.log(`Item "${itemInfo.name}" already exists in world (ID: ${existing.id}, Type: ${existing.type})`);
        
        if (forceUpdate) {
          // Prepare update data - fix image path if needed
          const updateData = { ...itemInfo };
          if (updateData.img && !updateData.img.startsWith('systems/')) {
            updateData.img = `systems/osp-houserules/${updateData.img}`;
          }
          
          // Update existing item
          await existing.update(updateData);
          console.log(`  ✅ Updated existing item`);
          updatedItems.push(itemInfo.name);
        } else {
          console.log(`  ⏭️  Skipping (use forceUpdate=true to update)`);
          skippedItems.push(itemInfo.name);
        }
      } else {
        // Prepare item data - fix image path if needed
        const itemData = { ...itemInfo };
        if (itemData.img && !itemData.img.startsWith('systems/') && !itemData.img.startsWith('icons/')) {
          itemData.img = `systems/osp-houserules/${itemData.img}`;
        }
        
        // Create the item
        console.log(`Creating new item: ${itemData.name} (${itemData.type})`);
        const item = await Item.create(itemData);
        console.log(`✅ Created: ${item.name} (${item.type}) - ID: ${item.id}`);
        createdItems.push(item);
      }
    } catch (error) {
      console.error(`❌ Failed to create item "${itemInfo.name}":`, error);
      skippedItems.push(itemInfo.name);
    }
  }
  
  console.log("\n=== IMPORT COMPLETE ===");
  console.log(`✅ Created: ${createdItems.length} items`);
  console.log(`🔄 Updated: ${updatedItems.length} items`);
  console.log(`⏭️  Skipped: ${skippedItems.length} items`);
  
  if (createdItems.length > 0) {
    console.log("\nNewly created items:", createdItems.map(i => i.name));
  }
  if (skippedItems.length > 0) {
    console.log("\nSkipped items:", skippedItems);
  }
  
  ui.notifications.info(`Item import complete! Created ${createdItems.length}, updated ${updatedItems.length}, skipped ${skippedItems.length}.`);
  
  return {
    created: createdItems,
    skipped: skippedItems,
    updated: updatedItems
  };
}

// Make function globally available
window.addItemsToFoundry = addItemsToFoundry;

// Run the function automatically on paste
addItemsToFoundry();
