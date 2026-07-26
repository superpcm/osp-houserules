/**
 * Foundry VTT Macro: Migrate Fung Telt's legacy currency + Backpack
 *
 * One-off fix for a single actor stuck on pre-container/pre-coin-type data: his currency is
 * two "[01.00] Gold (gp)" stacks (a duplicate pair) and one "[00.10] Silver (sp)" stack, all
 * type "item" — the old gp-denominated naming convention, predating the Sovereign/Crown/Penny
 * "coin" item type in data/treasure.json. His Backpack is also type "item" instead of
 * "container". refresh-items-macro.js can't fix either: it matches by name+type, and Foundry
 * doesn't allow an item's type to change via update() after creation — so this deletes the old
 * items and recreates them as the current types, preserving quantity/placement.
 *
 * Coin value carries over 1:1, no rescaling needed: old cost is gp-denominated (1 gp = 1.00
 * unit), new coin cost is sp-denominated (data/treasure.json: Gold Coins=10, Silver Coins=1)
 * — and 1 gp = 10 sp in both systems, so "[01.00] Gold (gp)" (worth 10 sp) already equals one
 * Gold Coins coin (cost 10), and "[00.10] Silver (sp)" (worth 1 sp) already equals one Silver
 * Coins coin (cost 1). Quantities map straight across.
 *
 * All of Fung Telt's currency/Backpack items currently have containerId unset (they're loose,
 * top-level), so nothing else references the old Backpack's id and there's no relinking to do —
 * the migrated items are recreated the same way, loose at the top level, exactly like a fresh
 * coin/container drop that hasn't been dragged into a pouch yet.
 *
 * Usage: Macros → new Script macro → paste this file's contents → run.
 */

async function migrateFungTeltLegacyItems() {
  const matches = game.actors.filter(a => a.name === "Fung Telt");
  if (matches.length !== 1) {
    ui.notifications.error(`Expected exactly one actor named "Fung Telt", found ${matches.length}. Aborting — resolve ambiguity and re-run.`);
    return;
  }
  const actor = matches[0];

  const goldStacks = actor.items.filter(i => i.type === "item" && i.name === "[01.00] Gold (gp)");
  const silverStacks = actor.items.filter(i => i.type === "item" && i.name === "[00.10] Silver (sp)");
  const oldBackpack = actor.items.find(i => i.type === "item" && i.name === "Backpack");

  if (goldStacks.length === 0 && silverStacks.length === 0 && !oldBackpack) {
    ui.notifications.info("Nothing to migrate — no legacy currency or Backpack item found on Fung Telt.");
    return;
  }

  const goldQty = goldStacks.reduce((sum, i) => sum + (i.system.quantity || 0), 0);
  const silverQty = silverStacks.reduce((sum, i) => sum + (i.system.quantity || 0), 0);

  const toDelete = [...goldStacks, ...silverStacks];
  if (oldBackpack) toDelete.push(oldBackpack);

  const toCreate = [];
  if (goldQty > 0) {
    toCreate.push({
      name: "Gold Coins",
      type: "coin",
      img: "systems/osp-houserules/assets/images/treasure/gold-coins.webp",
      system: { cost: 10, unitWeight: 0.04, storedSize: 0.04, quantity: goldQty, equipped: false, lashable: false, lashed: false, tags: ["coins"], containerId: null },
    });
  }
  if (silverQty > 0) {
    toCreate.push({
      name: "Silver Coins",
      type: "coin",
      img: "systems/osp-houserules/assets/images/treasure/silver-coins.webp",
      system: { cost: 1, unitWeight: 0.02, storedSize: 0.04, quantity: silverQty, equipped: false, lashable: false, lashed: false, tags: ["coins"], containerId: null },
    });
  }
  if (oldBackpack) {
    toCreate.push({
      name: "Backpack",
      type: "container",
      img: "systems/osp-houserules/assets/thumbs/images/gear/backpack_thumb.webp",
      system: {
        description: "This rugged leather backpack is fitted with multiple buckled pockets and a rolled blanket strapped across the top, showing the scuffs and creases of long travel. It is typically used by adventurers to carry rations, tools, and gear on the road, keeping their hands free for weapons, torches, or climbing.",
        cost: 5, unitWeight: 2, storedSize: 4, quantity: 1, equipped: false, lashable: false, tags: ["container"],
        capacity: 16, containerSize: "medium", lashSlots: 4, blockedTypes: ["slungable", "sword"], containerId: null,
      },
    });
  }

  console.log(`[Fung Telt migration] Deleting: ${toDelete.map(i => `${i.name} (${i.id}, qty ${i.system.quantity ?? "n/a"})`).join(", ") || "none"}`);
  console.log(`[Fung Telt migration] Creating: ${toCreate.map(i => `${i.name} x${i.system.quantity}`).join(", ")}`);

  if (toDelete.length) await actor.deleteEmbeddedDocuments("Item", toDelete.map(i => i.id));
  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate);

  ui.notifications.info(`Fung Telt migrated: ${goldQty} Gold Coins, ${silverQty} Silver Coins, ${oldBackpack ? "Backpack retyped to container." : "no Backpack found."}`);
}

migrateFungTeltLegacyItems();
