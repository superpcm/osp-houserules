/**
 * Debug script to check encumbrance calculation for equipment items
 * Run this in the Foundry console (F12) while viewing a character sheet
 */

console.log("=== Equipment Encumbrance Debug ===\n");

// Get the first character actor
const actor = game.actors.find(a => a.type === "character");

if (!actor) {
  console.error("No character found! Please create a character first.");
} else {
  console.log(`Character: ${actor.name}`);
  console.log(`STR: ${actor.system.attributes?.str?.value || "N/A"}`);
  console.log(`Max Weight (STR × 15): ${(actor.system.attributes?.str?.value || 10) * 15}lbs\n`);
  
  console.log("--- All Items on Character ---");
  let calculatedTotal = 0;
  
  actor.items.forEach(item => {
    const quantity = item.system.quantity !== undefined ? item.system.quantity : 1;
    const unitWeight = item.system.unitWeight || 0;
    const totalItemWeight = unitWeight * quantity;
    calculatedTotal += totalItemWeight;
    
    console.log(`${item.name}:`);
    console.log(`  Type: ${item.type}`);
    console.log(`  unitWeight: ${unitWeight}`);
    console.log(`  quantity: ${quantity}`);
    console.log(`  Total weight: ${totalItemWeight}lbs`);
    console.log(`  equipped: ${item.system.equipped}`);
    console.log(`  containerId: ${item.system.containerId || "none"}`);
  });
  
  console.log(`\n--- Calculated Total: ${calculatedTotal}lbs ---`);
  console.log(`--- Actor's Encumbrance Data ---`);
  console.log(`totalWeight: ${actor.system.encumbrance?.totalWeight || 0}lbs`);
  console.log(`maxWeight: ${actor.system.encumbrance?.maxWeight || 0}lbs`);
  console.log(`percentage: ${actor.system.encumbrance?.percentage || 0}%`);
  console.log(`level: ${actor.system.encumbrance?.level || "N/A"}`);
  
  if (calculatedTotal !== (actor.system.encumbrance?.totalWeight || 0)) {
    console.warn(`\n⚠️ MISMATCH! Calculated: ${calculatedTotal}lbs, Stored: ${actor.system.encumbrance?.totalWeight || 0}lbs`);
  } else {
    console.log(`\n✓ Weight calculations match!`);
  }
}

console.log("\n=== Debug Complete ===");
