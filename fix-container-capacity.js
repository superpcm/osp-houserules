/**
 * Fix corrupted container capacity data
 * 
 * Run this in the browser console (F12) while in a world:
 * 
 * Then reload the character sheet.
 */

(async function fixContainerCapacity() {
  console.log('=== Fixing Container Capacity ===');
  
  // Get all actors
  for (const actor of game.actors) {
    console.log(`Checking actor: ${actor.name}`);
    
    // Get all container items
    const containers = actor.items.filter(i => i.type === 'container');
    
    for (const container of containers) {
      const currentCapacity = container.system.capacity;
      console.log(`  Container: ${container.name}, Capacity: ${currentCapacity} (${typeof currentCapacity})`);
      
      // Check if capacity is corrupted
      if (typeof currentCapacity === 'string' && currentCapacity.includes('[o')) {
        console.warn(`    ⚠️  CORRUPTED! Attempting to fix...`);
        
        // Default capacity based on container name
        let newCapacity = '6M'; // Default backpack size
        if (container.name.toLowerCase().includes('pouch')) {
          newCapacity = '2S';
        } else if (container.name.toLowerCase().includes('sack')) {
          if (container.name.toLowerCase().includes('large')) {
            newCapacity = '1L';
          } else {
            newCapacity = '4M';
          }
        }
        
        console.log(`    Setting capacity to: ${newCapacity}`);
        await container.update({ 'system.capacity': newCapacity });
        console.log(`    ✅ Fixed!`);
      } else if (typeof currentCapacity === 'object') {
        console.warn(`    ⚠️  Capacity is an object!`);
        console.log(`    Object:`, currentCapacity);
        
        // Default capacity based on container name
        let newCapacity = '6M'; // Default backpack size
        if (container.name.toLowerCase().includes('pouch')) {
          newCapacity = '2S';
        } else if (container.name.toLowerCase().includes('sack')) {
          if (container.name.toLowerCase().includes('large')) {
            newCapacity = '1L';
          } else {
            newCapacity = '4M';
          }
        }
        
        console.log(`    Setting capacity to: ${newCapacity}`);
        await container.update({ 'system.capacity': newCapacity });
        console.log(`    ✅ Fixed!`);
      } else if (!currentCapacity || currentCapacity === 'undefined' || currentCapacity === '') {
        console.warn(`    ⚠️  Capacity is empty or undefined!`);
        
        // Default capacity based on container name
        let newCapacity = '6M'; // Default backpack size
        if (container.name.toLowerCase().includes('pouch')) {
          newCapacity = '2S';
        } else if (container.name.toLowerCase().includes('sack')) {
          if (container.name.toLowerCase().includes('large')) {
            newCapacity = '1L';
          } else {
            newCapacity = '4M';
          }
        }
        
        console.log(`    Setting capacity to: ${newCapacity}`);
        await container.update({ 'system.capacity': newCapacity });
        console.log(`    ✅ Fixed!`);
      } else {
        console.log(`    ✅ OK`);
      }
    }
  }
  
  console.log('=== Fix Complete ===');
  ui.notifications.info('Container capacity fix complete. Reload character sheets.');
})();
