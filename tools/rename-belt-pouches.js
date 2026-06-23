// Foundry VTT macro — run once from the macro editor (Script type).
// Renames "Belt Pouch, Large" → "Belt Pouch (L)" and
//         "Belt Pouch, Small" → "Belt Pouch (S)"
// in the world Items sidebar AND on every actor.

const RENAMES = {
  "Belt Pouch, Large": "Belt Pouch (L)",
  "Belt Pouch, Small": "Belt Pouch (S)",
};

let totalUpdated = 0;

// ── World Items sidebar ──────────────────────────────────────────────────────
for (const item of game.items.contents) {
  const newName = RENAMES[item.name];
  if (newName) {
    await item.update({ name: newName });
    console.log(`[rename-belt-pouches] World item "${item.name}" → "${newName}"`);
    totalUpdated++;
  }
}

// ── Actor-owned items ────────────────────────────────────────────────────────
for (const actor of game.actors.contents) {
  const updates = [];

  for (const item of actor.items.contents) {
    const newName = RENAMES[item.name];
    if (newName) {
      updates.push({ _id: item.id, name: newName });
    }
  }

  if (updates.length > 0) {
    await actor.updateEmbeddedDocuments("Item", updates);
    console.log(`[rename-belt-pouches] ${actor.name}: renamed ${updates.length} item(s)`);
    totalUpdated += updates.length;
  }
}

if (totalUpdated === 0) {
  ui.notifications.info("No Belt Pouch items found to rename.");
} else {
  ui.notifications.info(`Renamed ${totalUpdated} Belt Pouch item(s) across world items and actors.`);
}
