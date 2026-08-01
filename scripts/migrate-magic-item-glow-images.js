/**
 * Foundry VTT Macro: Give existing magic items a full-size glow sibling.
 *
 * Before the full+thumb glow pairing fix, both magic-item-creator.js's
 * "Create Magic Version" and add-magic-item-dialog.js's "Add Magic Item"
 * uploaded a single glow image into the catch-all "magic-item-thumbs/"
 * folder with no full-size sibling — so item-card-renderer.js's
 * "_thumb.webp" -> ".webp" derivation never found a full-size image to show
 * on the item card and fell back to drawing the small icon scaled up.
 *
 * This does NOT re-run the glow effect (the image already has it baked in —
 * doing so again would double up the golden border). It just duplicates each
 * existing glow file into a proper full+thumb sibling pair under
 * "magic/legacy" and repoints item.img at the new _thumb copy, so the card
 * picks up the (already-glowing) image as its full-size art too.
 *
 * Usage:
 * 1. Create a new macro in Foundry, type "Script".
 * 2. Paste this entire script in and run it as GM.
 * Affects: world Items collection + items embedded on Actors, filtered to
 * items whose img currently lives under "magic-item-thumbs/".
 */

const SOURCE_DIR       = 'magic-item-thumbs/';
const DEST_DIR_FULL    = 'systems/osp-houserules/assets/images/magic/legacy';
const DEST_DIR_THUMB   = 'systems/osp-houserules/assets/thumbs/images/magic/legacy';

function slugify(name) {
  const slug = name.replace(/\.[^.]+$/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `item-${Date.now()}`;
}

/** Duplicates item.img into a full+thumb sibling pair, returns the new thumb path (or null if not a legacy magic image). */
async function duplicateToSiblingPair(item) {
  const path = item.img?.startsWith('/') ? item.img.slice(1) : item.img;
  if (!path || !path.includes(SOURCE_DIR)) return null;

  const resp = await fetch(`/${path}`);
  if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
  const blob = await resp.blob();

  // Disambiguate by item id — multiple magic items can share a name (e.g.
  // two different "+1 Longsword" instances on different actors).
  const baseName = `${slugify(item.name)}-${item.id}`;

  await FilePicker.createDirectory("data", DEST_DIR_FULL).catch(() => {});
  await FilePicker.createDirectory("data", DEST_DIR_THUMB).catch(() => {});

  const fullFile  = new File([blob], `${baseName}.webp`, { type: "image/webp" });
  const thumbFile = new File([blob], `${baseName}_thumb.webp`, { type: "image/webp" });

  await FilePicker.upload("data", DEST_DIR_FULL, fullFile, {});
  const thumbResult = await FilePicker.upload("data", DEST_DIR_THUMB, thumbFile, {});

  return thumbResult.path ?? null;
}

let updatedItems = 0;
let updatedEmbedded = 0;
const errors = [];

// --- World Items ---
for (const item of game.items) {
  try {
    const newThumb = await duplicateToSiblingPair(item);
    if (newThumb) {
      await item.update({ img: newThumb });
      updatedItems++;
    }
  } catch (e) {
    errors.push(`Item "${item.name}" (${item.id}): ${e.message}`);
  }
}

// --- Embedded Items on Actors ---
for (const actor of game.actors) {
  for (const item of actor.items) {
    try {
      const newThumb = await duplicateToSiblingPair(item);
      if (newThumb) {
        await item.update({ img: newThumb });
        updatedEmbedded++;
      }
    } catch (e) {
      errors.push(`Actor "${actor.name}" › item "${item.name}": ${e.message}`);
    }
  }
}

// --- Report ---
const lines = [
  `Magic item glow migration complete.`,
  `  World items updated:    ${updatedItems}`,
  `  Embedded items updated: ${updatedEmbedded}`,
];
if (errors.length) {
  lines.push(`  Errors (${errors.length}):`);
  errors.forEach(e => lines.push(`    • ${e}`));
}
console.log(lines.join('\n'));
ui.notifications.info(
  `Magic item glow migration done — ${updatedItems} world items, ${updatedEmbedded} embedded items updated.`
);
