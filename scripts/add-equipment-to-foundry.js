/**
 * Script to add equipment items from equipment.json to Foundry dynamically
 * Run this in the Foundry console (F12) to add items to the world
 * 
 * Usage:
 * 1. Copy this entire script
 * 2. Open Foundry console (F12)
 * 3. Paste and press Enter
 * 4. Items will be created as world items that can be dragged to character sheets
 * 
 * To force update existing items, use: addEquipmentToFoundry(true)
 */

async function addEquipmentToFoundry(forceUpdate = false) {
  console.log("Starting equipment import...");
  console.log("Force update mode:", forceUpdate);
  
  // Fetch the equipment.json file
  let equipmentData;
  try {
    // Add cache-busting parameter to force fresh load
    const cacheBuster = `?v=${Date.now()}`;
    const response = await fetch(`systems/osp-houserules/data/equipment.json${cacheBuster}`);
    equipmentData = await response.json();
    console.log(`Loaded ${equipmentData.length} items from equipment.json`);
    
    // Show the last few items for debugging
    console.log("Last 3 items in file:", equipmentData.slice(-3).map(i => i.name));
  } catch (error) {
    console.error("Failed to load equipment.json:", error);
    ui.notifications.error("Failed to load equipment.json file. Check console for details.");
    return;
  }
  
  // Show what items are currently in the world
  console.log(`Current world items: ${game.items.size} items`);
  console.log("World item names:", game.items.map(i => i.name));
  
  // Check if item types are registered
  let validTypes = game.system.documentTypes?.Item || game.system.template?.Item?.types || [];
  
  // Extract type names - documentTypes returns objects, template returns array of strings
  if (Array.isArray(validTypes) && validTypes.length > 0 && typeof validTypes[0] === 'object') {
    // documentTypes format - extract the actual type names
    validTypes = validTypes.map(t => t.name || t);
  } else if (!Array.isArray(validTypes)) {
    validTypes = Object.keys(validTypes);
  }
  
  console.log("Available Item types:", validTypes);
  console.log("Type check - includes 'container':", validTypes.includes("container"));
  
  const createdItems = [];
  const skippedItems = [];
  const updatedItems = [];
  
  for (const itemInfo of equipmentData) {
    try {
      // Debug specific items
      if (itemInfo.name === "Robes" || itemInfo.name === "Cloak") {
        console.log(`\n🔍 PROCESSING: ${itemInfo.name}`);
        console.log(`  Type in JSON: ${itemInfo.type}`);
        console.log(`  Is type valid?`, validTypes.includes(itemInfo.type));
      }
      
      // Validate item type
      if (!validTypes.includes(itemInfo.type)) {
        console.warn(`Unknown item type "${itemInfo.type}" for item "${itemInfo.name}". Skipping.`);
        skippedItems.push(itemInfo.name);
        continue;
      }
      
      // Check if item already exists in world items (sidebar items)
      const existing = game.items.find(i => 
        i.name === itemInfo.name && 
        i.type === itemInfo.type
      );
      
      // More debug for specific items
      if (itemInfo.name === "Robes" || itemInfo.name === "Cloak") {
        console.log(`  Searching for existing: name="${itemInfo.name}" AND type="${itemInfo.type}"`);
        console.log(`  Found existing?`, !!existing);
        if (existing) {
          console.log(`  Existing item:`, existing);
        }
      }
      
      if (existing) {
        console.log(`Item "${itemInfo.name}" already exists in world (ID: ${existing.id}, Type: ${existing.type})`);
        
        if (forceUpdate) {
          // Update existing item
          await existing.update(itemInfo);
          console.log(`  ✅ Updated existing item`);
          updatedItems.push(itemInfo.name);
        } else {
          console.log(`  ⏭️  Skipping (use forceUpdate=true to update)`);
          skippedItems.push(itemInfo.name);
        }
      } else {
        // Double check - show what we're looking for
        if (itemInfo.name === "Robes" || itemInfo.name === "Cloak") {
          console.log(`DEBUG: Looking for "${itemInfo.name}" (type: ${itemInfo.type})`);
          console.log(`  Found match:`, game.items.find(i => i.name === itemInfo.name));
        }
        
        // Create the item
        console.log(`Creating new item: ${itemInfo.name} (${itemInfo.type})`);
        const item = await Item.create(itemInfo);
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
  
  ui.notifications.info(`Equipment import complete! Created ${createdItems.length}, updated ${updatedItems.length}, skipped ${skippedItems.length}.`);
  
  return {
    created: createdItems,
    skipped: skippedItems,
    updated: updatedItems
  };
}

// Run the function
addEquipmentToFoundry();
