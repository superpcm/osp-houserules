/**
 * Update existing Quivers and Bolt Cases with item type restrictions
 * 
 * Run this in Foundry's console (F12) to update all existing containers:
 * Copy and paste this entire file into the console and press Enter.
 */

(async function updateContainerRestrictions() {
  console.log('=== Updating Container Restrictions ===');
  
  let updatedCount = 0;
  
  // Update World Items (sidebar)
  console.log('\n1. Checking World Items...');
  for (const item of game.items) {
    if (item.type !== 'container') continue;
    
    let allowedTypes = null;
    
    if (item.name === 'Quiver' || item.name === 'Quiver, Hip') {
      allowedTypes = ['arrows'];
    } else if (item.name === 'Bolt Case') {
      allowedTypes = ['bolts'];
    }
    
    if (allowedTypes) {
      await item.update({ 'system.allowedTypes': allowedTypes });
      console.log(`  ✓ Updated ${item.name} with allowedTypes: ${allowedTypes.join(', ')}`);
      updatedCount++;
    }
  }
  
  // Update items on Actors
  console.log('\n2. Checking Actor Items...');
  for (const actor of game.actors) {
    for (const item of actor.items) {
      if (item.type !== 'container') continue;
      
      let allowedTypes = null;
      
      if (item.name === 'Quiver' || item.name === 'Quiver, Hip') {
        allowedTypes = ['arrows'];
      } else if (item.name === 'Bolt Case') {
        allowedTypes = ['bolts'];
      }
      
      if (allowedTypes) {
        await item.update({ 'system.allowedTypes': allowedTypes });
        console.log(`  ✓ Updated ${item.name} on ${actor.name} with allowedTypes: ${allowedTypes.join(', ')}`);
        updatedCount++;
      }
    }
  }
  
  console.log(`\n=== Complete! Updated ${updatedCount} containers ===`);
  ui.notifications.info(`Updated ${updatedCount} containers with item restrictions`);
})();
