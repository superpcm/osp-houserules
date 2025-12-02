/**
 * Script to add coin items to Foundry dynamically
 * Run this in the Foundry console (F12) to add coins to the world
 * 
 * NOTE: After running this script, you must reload Foundry (F5) for the "coin" type to work properly.
 * Until reload, coins will be created as "item" type but will convert to "coin" type after reload.
 */

async function addCoinsToFoundry() {
  console.log("Starting coin creation...");
  
  // Check if coin type is registered - Foundry v12+ uses documentTypes
  let validTypes = game.system.documentTypes?.Item || game.system.template?.Item?.types || [];
  // Convert to array if it's an object
  if (!Array.isArray(validTypes)) {
    validTypes = Object.values(validTypes);
  }
  const coinTypeExists = validTypes.includes("coin");
  
  console.log("System documentTypes:", game.system.documentTypes);
  console.log("Available Item types:", validTypes);
  console.log("Coin type exists:", coinTypeExists);
  
  if (!coinTypeExists) {
    ui.notifications.warn("Coin type not yet registered. The coin type may not be in template.json. Check console for details.");
    console.warn("Available item types:", validTypes);
    console.warn("Expected 'coin' to be in the list above.");
    // Continue anyway - let Foundry validate
  }
  
  const coinData = [
    {
      name: "Gold Coins",
      type: "coin",
      img: "assets/images/icons/gold-coin.webp",
      system: {
        description: "Standard gold coins used throughout the realm. 100 coins weigh approximately 2 pounds.",
        cost: 0,
        unitWeight: 0.02,
        storedSize: 0.04,
        quantity: 0,
        equipped: false,
        lashable: false,
        lashed: false,
        containerId: null
      }
    },
    {
      name: "Silver Coins",
      type: "coin",
      img: "assets/images/icons/silver-coin.webp",
      system: {
        description: "Standard silver coins used throughout the realm. 10 silver coins = 1 gold coin. 100 coins weigh approximately 2 pounds.",
        cost: 0,
        unitWeight: 0.02,
        storedSize: 0.04,
        quantity: 0,
        equipped: false,
        lashable: false,
        lashed: false,
        containerId: null
      }
    },
    {
      name: "Copper Coins",
      type: "coin",
      img: "assets/images/icons/copper-coin.webp",
      system: {
        description: "Standard copper coins used throughout the realm. 100 copper coins = 1 gold coin. 100 coins weigh approximately 2 pounds.",
        cost: 0,
        unitWeight: 0.02,
        storedSize: 0.04,
        quantity: 0,
        equipped: false,
        lashable: false,
        lashed: false,
        containerId: null
      }
    }
  ];

  const createdItems = [];
  
  for (const coinInfo of coinData) {
    try {
      // Check if coin already exists in world items
      const existing = game.items.find(i => i.name === coinInfo.name && i.type === "coin");
      
      if (existing) {
        console.log(`Coin "${coinInfo.name}" already exists (ID: ${existing.id})`);
        createdItems.push(existing);
      } else {
        // Create the coin item
        const coin = await Item.create(coinInfo);
        console.log(`Created coin: ${coin.name} (ID: ${coin.id})`);
        createdItems.push(coin);
      }
    } catch (error) {
      console.error(`Failed to create coin "${coinInfo.name}":`, error);
    }
  }
  
  console.log(`Coin creation complete. Created/found ${createdItems.length} coins.`);
  ui.notifications.info(`Coins ready! ${createdItems.length} coin types available.`);
  
  return createdItems;
}

// Run the function
addCoinsToFoundry();
