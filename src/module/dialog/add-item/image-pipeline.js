/**
 * @file Image pipeline for the "Add Item" DM Toolkit tool — uploads a
 * separately-browsed full-size image and thumbnail image into the catalog's
 * category subfolders under assets/images and assets/thumbs/images.
 * Extends the FilePicker.upload pattern already used by MagicItemCreator.
 *
 * Both files must be .webp: item-card-renderer.js and magic-item-creator.js locate the
 * full-size image at render time by string-replacing "_thumb.webp" -> ".webp" on the stored
 * thumb path (only the thumb path is ever saved to item JSON) — a non-.webp upload would land
 * at the right path but never be found by that lookup, silently falling back to the thumbnail.
 */

function isWebpFile(file) {
  return file.type === 'image/webp' || /\.webp$/i.test(file.name);
}

export function slugify(name) {
  const slug = name.replace(/\.[^.]+$/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `item-${Date.now()}`;
}

function extOf(name) {
  const match = /\.[^.]+$/.exec(name);
  return match ? match[0].toLowerCase() : "";
}

/**
 * FilePicker.createDirectory doesn't create missing parent directories on its
 * own — asking it for "magic-item-thumbs/wands" fails outright if
 * "magic-item-thumbs" doesn't already exist. This walks the path one segment
 * at a time so every ancestor gets created (existing ones just fail with
 * "already exists", which is expected and silently skipped).
 */
export async function ensureDirectory(fullPath) {
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

/**
 * Uploads a full-size image and a thumbnail image, as browsed, into the given
 * category subfolder under assets/images and assets/thumbs/images respectively.
 * Files are renamed from the item's name but otherwise uploaded unmodified.
 * @returns {Promise<{imgFull: string|null, imgThumb: string|null}>}
 */
export async function uploadItemImages(fullFile, thumbFile, subfolder, itemName) {
  if (!isWebpFile(fullFile) || !isWebpFile(thumbFile)) {
    throw new Error("Both the full-size image and the thumbnail must be .webp files.");
  }

  const baseName = slugify(itemName || fullFile.name);

  const fullDir  = `systems/osp-houserules/assets/images/${subfolder}`;
  const thumbDir = `systems/osp-houserules/assets/thumbs/images/${subfolder}`;

  await ensureDirectory(fullDir);
  await ensureDirectory(thumbDir);

  const fullUpload  = new File([fullFile],  `${baseName}${extOf(fullFile.name)}`,          { type: fullFile.type });
  const thumbUpload = new File([thumbFile], `${baseName}_thumb${extOf(thumbFile.name)}`,   { type: thumbFile.type });

  const [fullResult, thumbResult] = await Promise.all([
    FilePicker.upload("data", fullDir,  fullUpload,  {}),
    FilePicker.upload("data", thumbDir, thumbUpload, {}),
  ]);

  return {
    imgFull:  fullResult?.path  ?? null,
    imgThumb: thumbResult?.path ?? null,
  };
}
