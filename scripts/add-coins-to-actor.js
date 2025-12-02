/**
 * Script to add coin items to a specific actor
 * Run this in the Foundry console (F12) after selecting a character token
 * or modify actorId to target a specific character
 * 
 * NOTE: After running this script, you must reload Foundry (F5) for the "coin" type to work properly.
 * Until reload, coins will be created as "item" type but will convert to "coin" type after reload.
 */

async function addCoinsToActor(actorId = null) {
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
  
  // Get the actor - use selected token or specified ID
  let actor;
  if (actorId) {
    actor = game.actors.get(actorId);
  } else if (canvas.tokens.controlled.length > 0) {
    actor = canvas.tokens.controlled[0].actor;
  } else {
    ui.notifications.error("Please select a token or provide an actor ID");
    console.error("No actor selected. Select a token or provide actorId parameter.");
    return;
  }

  if (!actor) {
    ui.notifications.error("Actor not found");
    return;
  }

  console.log(`Adding coins to actor: ${actor.name}`);

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
        description: "Standard gold coins used throughout the realm. 100 copper coins = 1 gold coin. 100 coins weigh approximately 2 pounds.",
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
      // Check if this coin type already exists on the actor
      const existing = actor.items.find(i => i.name === coinInfo.name && i.type === "coin");

      if (existing) {
        console.log(`Actor already has "${coinInfo.name}" (ID: ${existing.id})`);
        createdItems.push(existing);
      } else {
        // Add the coin to the actor
        const [coin] = await actor.createEmbeddedDocuments("Item", [coinInfo]);
        console.log(`Added coin to ${actor.name}: ${coin.name} (ID: ${coin.id})`);
        createdItems.push(coin);
      }
    } catch (error) {
      console.error(`Failed to add coin "${coinInfo.name}" to ${actor.name}:`, error);
    }
  }

  console.log(`Coin addition complete. Added/found ${createdItems.length} coins on ${actor.name}.`);
  ui.notifications.info(`${actor.name} now has ${createdItems.length} coin types!`);

  return createdItems;
}

// Run the function (adds to selected token's actor)
addCoinsToActor();

// Or specify an actor ID:
// addCoinsToActor("ActorIdHere");
