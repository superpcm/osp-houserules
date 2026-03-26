/**
 * Migration macro: swap full-size osp-houserules item images to thumbnails.
 *
 * Run once in Foundry's macro editor (as GM).
 * Affects: world Items collection + items embedded on Actors.
 *
 * Mapping rule:
 *   systems/osp-houserules/assets/images/{cat}/{name}.webp
 *   → systems/osp-houserules/assets/thumbs/images/{cat}/{name}_thumb.webp
 *
 * Only replaces paths that have a known thumbnail (i.e. the path contains
 * "assets/images/" and the extension is .webp — the thumb naming is derived
 * automatically). Images from other systems or with other extensions are
 * left untouched.
 */

const IMG_BASE  = 'systems/osp-houserules/assets/images/';
const THUMB_BASE = 'systems/osp-houserules/assets/thumbs/images/';

/** Return the thumb path for a full-size osp image, or null if not applicable. */
function toThumb(imgPath) {
  if (!imgPath) return null;
  // Normalise: strip leading slash if present
  const path = imgPath.startsWith('/') ? imgPath.slice(1) : imgPath;
  if (!path.startsWith(IMG_BASE)) return null;
  const relative = path.slice(IMG_BASE.length);          // e.g. "weapons/long-sword.webp"
  if (!relative.endsWith('.webp')) return null;
  const thumbRel = relative.slice(0, -5) + '_thumb.webp'; // "weapons/long-sword_thumb.webp"
  return THUMB_BASE + thumbRel;
}

let updatedItems   = 0;
let updatedEmbedded = 0;
const errors = [];

// --- World Items ---
for (const item of game.items) {
  const thumb = toThumb(item.img);
  if (thumb && thumb !== item.img) {
    try {
      await item.update({ img: thumb });
      updatedItems++;
    } catch (e) {
      errors.push(`Item "${item.name}" (${item.id}): ${e.message}`);
    }
  }
}

// --- Embedded Items on Actors ---
for (const actor of game.actors) {
  for (const item of actor.items) {
    const thumb = toThumb(item.img);
    if (thumb && thumb !== item.img) {
      try {
        await item.update({ img: thumb });
        updatedEmbedded++;
      } catch (e) {
        errors.push(`Actor "${actor.name}" › item "${item.name}": ${e.message}`);
      }
    }
  }
}

// --- Report ---
const lines = [
  `Migration complete.`,
  `  World items updated:    ${updatedItems}`,
  `  Embedded items updated: ${updatedEmbedded}`,
];
if (errors.length) {
  lines.push(`  Errors (${errors.length}):`);
  errors.forEach(e => lines.push(`    • ${e}`));
}
console.log(lines.join('\n'));
ui.notifications.info(
  `Image migration done — ${updatedItems} world items, ${updatedEmbedded} embedded items updated.`
);
