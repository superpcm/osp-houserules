/**
 * @file Image pipeline for the "Add Item" DM Toolkit tool — uploads a
 * separately-browsed full-size image and thumbnail image into the catalog's
 * category subfolders under assets/images and assets/thumbs/images.
 * Extends the FilePicker.upload pattern already used by MagicItemCreator.
 */

function slugify(name) {
  const slug = name.replace(/\.[^.]+$/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `item-${Date.now()}`;
}

function extOf(name) {
  const match = /\.[^.]+$/.exec(name);
  return match ? match[0].toLowerCase() : "";
}

/**
 * Uploads a full-size image and a thumbnail image, as browsed, into the given
 * category subfolder under assets/images and assets/thumbs/images respectively.
 * Files are renamed from the item's name but otherwise uploaded unmodified.
 * @returns {Promise<{imgFull: string|null, imgThumb: string|null}>}
 */
export async function uploadItemImages(fullFile, thumbFile, subfolder, itemName) {
  const baseName = slugify(itemName || fullFile.name);

  const fullDir  = `systems/osp-houserules/assets/images/${subfolder}`;
  const thumbDir = `systems/osp-houserules/assets/thumbs/images/${subfolder}`;

  await FilePicker.createDirectory("data", fullDir).catch(() => {});
  await FilePicker.createDirectory("data", thumbDir).catch(() => {});

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
