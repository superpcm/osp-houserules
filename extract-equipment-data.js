/**
 * Extract equipment data from the game world
 * Run this in the browser console while in Foundry VTT
 * Copy the output and save to data/equipment.json
 */

(async function extractEquipmentData() {
  // Get all items from the world
  const items = game.items.filter(item => 
    ['item', 'container'].includes(item.type)
  );
  
  if (items.length === 0) {
    console.log('No items or containers found in game.items');
    return;
  }
  
  // Build the equipment array
  const equipmentData = items.map(item => {
    const data = {
      name: item.name,
      type: item.type,
      img: item.img,
      system: {
        description: item.system.description || "",
        cost: item.system.cost || 0,
        weight: item.system.weight || 0,
        storedSize: item.system.storedSize || 4,
        quantity: {
          value: item.system.quantity?.value || 1,
          max: item.system.quantity?.max || 0
        },
        equipped: false,
        tags: item.system.tags || []
      }
    };
    
    // Add capacity for containers
    if (item.type === 'container') {
      data.system.capacity = item.system.capacity || 16;
      if (item.system.lashSlots) {
        data.system.lashSlots = item.system.lashSlots;
      }
    }
    
    return data;
  });
  
  // Sort by name
  equipmentData.sort((a, b) => a.name.localeCompare(b.name));
  
  // Output as JSON
  const jsonOutput = JSON.stringify(equipmentData, null, 2);
  
  console.log('=== COPY THE JSON BELOW ===');
  console.log(jsonOutput);
  console.log('=== END JSON ===');
  console.log(`\nExtracted ${equipmentData.length} items`);
  
  // Try to copy to clipboard (may fail if document not focused)
  try {
    await navigator.clipboard.writeText(jsonOutput);
    console.log('✓ JSON copied to clipboard!');
  } catch (e) {
    console.log('⚠ Could not copy to clipboard automatically.');
    console.log('→ Right-click in the console and select "Copy object" or manually copy the JSON above');
  }
  
  return equipmentData;
})();
