/**
 * Migrate old Scabbard items in world items.
 *
 * Old names: Scabbard, Large  / Scabbard, Medium / Scabbard, Small
 * New names: Scabbard, Sword  / Scabbard, Dagger
 *
 * Actions:
 *  - Rename "Scabbard, Medium" → "Scabbard, Sword" with updated data
 *  - Delete "Scabbard, Large" and "Scabbard, Small"
 *  - Create "Scabbard, Dagger" if it doesn't exist
 *
 * Run in Foundry console (F12): paste the whole file and press Enter.
 */

(async () => {
  const SWORD_DATA = {
    name: "Scabbard, Sword",
    img: "systems/osp-houserules/assets/thumbs/images/gear/scabbard-sword_thumb.webp",
    system: {
      description: "A rigid leather sheath for a standard sword, designed to sit within a sword frog attached to the belt.",
      cost: 3,
      unitWeight: 0.5,
      storedSize: 2,
      quantity: 1,
      equipped: false,
      lashable: false,
      lashed: false,
      containerId: null,
      slotCost: 0,
      tags: ["weapon-storage", "scabbard"],
      capacity: 4,
      containerSize: "small",
      hideCapacity: true,
      maxItems: 1,
      lashSlots: 0,
      allowedTypes: [],
      allowedSizes: [],
      allowedNames: ["Longsword", "Broadsword", "Bastard Sword", "Khopesh", "Shortsword"]
    }
  };

  const DAGGER_DATA = {
    name: "Scabbard, Dagger",
    type: "container",
    img: "systems/osp-houserules/assets/thumbs/images/gear/scabbard-small_thumb.webp",
    system: {
      description: "A compact leather sheath worn on the belt designed to carry a single dagger or narrow-bladed weapon. Keeps the weapon protected and ready to draw in combat.",
      cost: 3,
      unitWeight: 0.5,
      storedSize: 2,
      quantity: 1,
      equipped: false,
      lashable: true,
      lashed: false,
      containerId: null,
      slotCost: 1,
      tags: ["weapon-storage", "scabbard"],
      capacity: 4,
      containerSize: "small",
      hideCapacity: true,
      maxItems: 1,
      lashSlots: 0,
      allowedTypes: [],
      allowedSizes: [],
      allowedNames: ["Dagger", "Misericorde"]
    }
  };

  // 1. Rename Scabbard, Medium → Scabbard, Sword
  const medium = game.items.getName("Scabbard, Medium");
  if (medium) {
    await medium.update(SWORD_DATA);
    console.log("✅ Renamed Scabbard, Medium → Scabbard, Sword");
  } else {
    console.log("ℹ️  Scabbard, Medium not found (already renamed or missing)");
  }

  // 2. Delete Scabbard, Large
  const large = game.items.getName("Scabbard, Large");
  if (large) {
    await large.delete();
    console.log("🗑️  Deleted Scabbard, Large");
  } else {
    console.log("ℹ️  Scabbard, Large not found");
  }

  // 3. Delete Scabbard, Small
  const small = game.items.getName("Scabbard, Small");
  if (small) {
    await small.delete();
    console.log("🗑️  Deleted Scabbard, Small");
  } else {
    console.log("ℹ️  Scabbard, Small not found");
  }

  // 4. Create Scabbard, Dagger if missing
  const daggerExists = game.items.getName("Scabbard, Dagger");
  if (!daggerExists) {
    await Item.create(DAGGER_DATA);
    console.log("✅ Created Scabbard, Dagger");
  } else {
    console.log("ℹ️  Scabbard, Dagger already exists");
  }

  ui.notifications.info("Scabbard migration complete.");
})();
