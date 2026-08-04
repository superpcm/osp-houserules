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
 * "magic-item-thumbs/legacy" (still outside systems/osp-houserules/ — GM-
 * generated magic item art must never live inside the system package
 * directory, since a system update/reinstall wipes that folder) and
 * repoints item.img at the new _thumb copy, so the card picks up the
 * (already-glowing) image as its full-size art too.
 *
 * Usage:
 * 1. Create a new macro in Foundry, type "Script".
 * 2. Paste this entire script in and run it as GM.
 * Affects: world Items collection + items embedded on Actors, filtered to
 * items whose img currently lives under "magic-item-thumbs/" but not yet
 * under the destination folder below (safe to re-run).
 */

const SOURCE_DIR = 'magic-item-thumbs/';
const DEST_DIR   = 'magic-item-thumbs/legacy';

function slugify(name) {
  const slug = name.replace(/\.[^.]+$/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `item-${Date.now()}`;
}

// FilePicker.createDirectory doesn't create missing parent directories on its own —
// asking it for ".../magic/legacy" fails outright if "magic" doesn't already exist.
async function ensureDirectory(fullPath) {
  const segments = fullPath.split('/').filter(Boolean);
  let current = '';
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    try {
      await FilePicker.createDirectory("data", current);
    } catch (err) {
      if (!/already exists/i.test(err?.message ?? '')) {
        console.warn(`[OSP] createDirectory failed for "${current}":`, err);
      }
    }
  }
}

/** Duplicates item.img into a full+thumb sibling pair, returns the new thumb path (or null if not a legacy magic image). */
async function duplicateToSiblingPair(item) {
  const path = item.img?.startsWith('/') ? item.img.slice(1) : item.img;
  if (!path || !path.includes(SOURCE_DIR)) return null;
  if (path.includes(DEST_DIR)) return null; // already migrated — safe to re-run this script

  const resp = await fetch(`/${path}`);
  if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
  const blob = await resp.blob();

  // Disambiguate by item id — multiple magic items can share a name (e.g.
  // two different "+1 Longsword" instances on different actors).
  const baseName = `${slugify(item.name)}-${item.id}`;

  await ensureDirectory(DEST_DIR);

  const fullFile  = new File([blob], `${baseName}.webp`, { type: "image/webp" });
  const thumbFile = new File([blob], `${baseName}_thumb.webp`, { type: "image/webp" });

  // FilePicker.upload doesn't throw on failure — it resolves to `false` and logs its
  // own error to console/notifications — so a missing .path has to be checked explicitly
  // and turned into a thrown error, or a failed upload silently no-ops instead of
  // showing up in the errors report.
  const fullResult = await FilePicker.upload("data", DEST_DIR, fullFile, {});
  if (!fullResult?.path) throw new Error("full-size upload failed (see console for FilePicker error above)");

  const thumbResult = await FilePicker.upload("data", DEST_DIR, thumbFile, {});
  if (!thumbResult?.path) throw new Error("thumbnail upload failed (see console for FilePicker error above)");

  return thumbResult.path;
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
