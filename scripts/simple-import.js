/**
 * SIMPLE ITEM IMPORTER FOR FOUNDRY VTT
 * 
 * INSTRUCTIONS:
 * 1. In Foundry, create compendium packs:
 *    Settings > Configure Settings > Compendium Packs > Create Compendium
 *    - Create three packs named: "weapons", "armor", "equipment" (all type: Item)
 * 
 * 2. Copy this ENTIRE script
 * 3. In Foundry, press F12 to open console
 * 4. Paste and press Enter
 * 5. Select which pack to import to and the items will be created
 */

(async function() {
  
  // ============ PASTE YOUR JSON DATA BELOW ============
  
  const WEAPONS = [
    {
      name: "Battle Axe",
      type: "weapon",
      img: "icons/weapons/axes/axe-battle-worn.webp",
      system: {
        description: "A heavy single-bladed axe designed for combat.",
        cost: 7,
        weight: 50,
        quantity: 1,
        equipped: false,
        damage: "1d8",
        bonus: 0,
        tags: ["slow", "melee", "two-handed"],
        melee: true,
        missile: false,
        slow: true,
        range: { short: 0, medium: 0, long: 0 }
      }
    },
    {
      name: "Short Sword",
      type: "weapon",
      img: "icons/weapons/swords/sword-short-steel.webp",
      system: {
        description: "A short blade, ideal for close combat.",
        cost: 7,
        weight: 30,
        quantity: 1,
        equipped: false,
        damage: "1d6",
        bonus: 0,
        tags: ["melee"],
        melee: true,
        missile: false,
        slow: false,
        range: { short: 0, medium: 0, long: 0 }
      }
    },
    {
      name: "Longbow",
      type: "weapon",
      img: "icons/weapons/bows/bow-recurve-leather.webp",
      system: {
        description: "A tall bow for long-range combat.",
        cost: 40,
        weight: 30,
        quantity: 1,
        equipped: false,
        damage: "1d6",
        bonus: 0,
        tags: ["missile", "two-handed"],
        melee: false,
        missile: true,
        slow: false,
        range: { short: 70, medium: 140, long: 210 }
      }
    }
  ];

  const ARMOR = [
    {
      name: "Leather Armor",
      type: "armor",
      img: "icons/equipment/chest/breastplate-leather-brown.webp",
      system: {
        description: "Light armor made of hardened leather.",
        cost: 20,
        weight: 200,
        quantity: 1,
        equipped: false,
        ac: { value: 7 },
        aac: { value: 12 },
        type: "light"
      }
    },
    {
      name: "Chain Mail",
      type: "armor",
      img: "icons/equipment/chest/breastplate-rivited-steel.webp",
      system: {
        description: "Armor made of interlocking metal rings.",
        cost: 40,
        weight: 400,
        quantity: 1,
        equipped: false,
        ac: { value: 5 },
        aac: { value: 14 },
        type: "medium"
      }
    }
  ];

  const EQUIPMENT = [
    {
      name: "Rope, 50'",
      type: "item",
      img: "icons/sundries/survival/rope-coiled-brown.webp",
      system: {
        description: "A 50-foot length of rope.",
        cost: 1,
        weight: 20,
        quantity: 1,
        equipped: false,
        treasure: false
      }
    },
    {
      name: "Torch",
      type: "item",
      img: "icons/sundries/lights/torch-brown-lit.webp",
      system: {
        description: "A wooden torch that burns for 1 hour.",
        cost: 0.01,
        weight: 1,
        quantity: 1,
        equipped: false,
        treasure: false
      }
    }
  ];

  const CONTAINERS = [
    {
      name: "Backpack",
      type: "container",
      img: "icons/containers/bags/pack-leather-brown-tan.webp",
      system: {
        description: "A leather backpack that can hold up to 400 coins worth of weight.",
        cost: 5,
        weight: 20,
        quantity: 1,
        equipped: false,
        capacity: { type: "weight", value: 0, max: 400 }
      }
    },
    {
      name: "Sack, Small",
      type: "container",
      img: "icons/containers/bags/sack-simple-leather-brown.webp",
      system: {
        description: "A small cloth or leather sack. Holds up to 200 coins weight.",
        cost: 1,
        weight: 5,
        quantity: 1,
        equipped: false,
        capacity: { type: "weight", value: 0, max: 200 }
      }
    },
    {
      name: "Belt Pouch",
      type: "container",
      img: "icons/containers/bags/pouch-leather-tan-simple.webp",
      system: {
        description: "A small pouch worn on the belt. Holds up to 50 coins weight.",
        cost: 1,
        weight: 2,
        quantity: 1,
        equipped: false,
        capacity: { type: "weight", value: 0, max: 50 }
      }
    }
  ];

  // ============ IMPORT LOGIC ============

  const datasets = {
    weapons: WEAPONS,
    armor: ARMOR,
    equipment: EQUIPMENT,
    containers: CONTAINERS
  };

  // Find available packs
  const availablePacks = Array.from(game.packs.values())
    .filter(p => p.documentName === "Item")
    .map(p => ({ name: p.metadata.label, id: p.collection }));

  if (availablePacks.length === 0) {
    ui.notifications.error("No Item compendiums found! Create them first in Settings.");
    return;
  }

  // Create selection dialog
  const packOptions = availablePacks.map(p => 
    `<option value="${p.id}">${p.name}</option>`
  ).join("");

  const dataOptions = Object.keys(datasets).map(key =>
    `<option value="${key}">${key.charAt(0).toUpperCase() + key.slice(1)}</option>`
  ).join("");

  const result = await Dialog.prompt({
    title: "Import Items to Compendium",
    content: `
      <form style="padding: 10px;">
        <div class="form-group" style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;"><strong>Select Dataset:</strong></label>
          <select name="dataset" style="width: 100%; padding: 5px;">
            ${dataOptions}
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;"><strong>Select Target Pack:</strong></label>
          <select name="pack" style="width: 100%; padding: 5px;">
            ${packOptions}
          </select>
        </div>
        <p style="margin-top: 15px; padding: 10px; background: #f0f0f0; border-radius: 4px;">
          <strong>Note:</strong> This will create items in the selected compendium.
        </p>
      </form>
    `,
    callback: (html) => ({
      dataset: html.find('[name="dataset"]').val(),
      pack: html.find('[name="pack"]').val()
    }),
    rejectClose: false,
    options: { width: 400 }
  });

  if (!result) {
    ui.notifications.warn("Import cancelled");
    return;
  }

  const items = datasets[result.dataset];
  const pack = game.packs.get(result.pack);

  if (!pack) {
    ui.notifications.error(`Pack not found: ${result.pack}`);
    return;
  }

  ui.notifications.info(`Importing ${items.length} items...`);

  let imported = 0;
  for (const itemData of items) {
    try {
      await Item.create(itemData, { pack: pack.collection });
      console.log(`✓ Imported: ${itemData.name}`);
      imported++;
    } catch (error) {
      console.error(`✗ Failed to import ${itemData.name}:`, error);
      ui.notifications.warn(`Failed to import: ${itemData.name}`);
    }
  }

  ui.notifications.info(`Successfully imported ${imported} of ${items.length} items into ${pack.metadata.label}!`);
  console.log(`Import complete: ${imported}/${items.length} items`);
  
})();
