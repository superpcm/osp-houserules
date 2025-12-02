/**
 * Test script for encumbrance system
 * Run in browser console after loading a character
 */

console.log("=== Encumbrance System Test ===");

// Get the first character actor
const actor = game.actors.find(a => a.type === "character");

if (!actor) {
  console.error("No character found! Please create a character first.");
} else {
  console.log(`Testing with character: ${actor.name}`);
  console.log("\n--- Character Stats ---");
  console.log(`STR: ${actor.system.attributes?.str?.value || "N/A"}`);
  console.log(`Race: ${actor.system.race || "N/A"}`);
  
  console.log("\n--- Items ---");
  actor.items.forEach(item => {
    console.log(`${item.name}: ${item.system.weight}lbs x${item.system.quantity || 1} = ${(item.system.weight * (item.system.quantity || 1))}lbs (Size: ${item.system.sizecat}, Equipped: ${item.system.equipped})`);
  });
  
  console.log("\n--- Encumbrance Results ---");
  console.log(`Total Weight: ${actor.system.encumbrance?.weight?.value || actor.system.encumbrance?.totalWeight || 0}lbs`);
  console.log(`Max Weight: ${actor.system.encumbrance?.weight?.max || actor.system.encumbrance?.maxWeight || 0}lbs`);
  console.log(`Encumbrance Level: ${actor.system.encumbrance?.level || "N/A"}`);
  console.log(`Movement Rate: ${actor.system.encumbrance?.movement || 0}'`);
  console.log(`Percentage: ${actor.system.encumbrance?.percentage || 0}%`);
  
  console.log("\n--- Thresholds ---");
  const maxWeight = actor.system.encumbrance?.weight?.max || actor.system.encumbrance?.maxWeight || 0;
  console.log(`Unencumbered: ≤${Math.round(maxWeight / 3)}lbs`);
  console.log(`Light: ≤${Math.round((maxWeight * 2) / 3)}lbs (-10' movement)`);
  console.log(`Heavy: ≤${maxWeight}lbs (-20' movement)`);
  console.log(`Overloaded: >${maxWeight}lbs (cannot move)`);
  
  console.log("\n--- Container Capacity ---");
  const containers = actor.items.filter(i => i.type === "container");
  if (containers.length === 0) {
    console.log("No containers found.");
  } else {
    containers.forEach(container => {
      console.log(`${container.name}:`);
      console.log(`  Capacity: ${container.system.capacity}`);
      console.log(`  Used: ${container.system.capacityUsed || 0} / ${container.system.capacityMax || 0} slots`);
      console.log(`  Percentage: ${container.system.capacityPercentage || 0}%`);
    });
  }
}

console.log("\n=== Test Complete ===");
