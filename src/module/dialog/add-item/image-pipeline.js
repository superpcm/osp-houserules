/**
 * @file Image pipeline for the "Add Item" DM Toolkit tool — converts a browsed
 * source image into the catalog's square webp full+thumb pair and uploads both.
 * Extends the canvas + FilePicker.upload pattern already used by MagicItemCreator.
 */

const THUMB_SIZE = 96;
const FULL_MAX   = 1024;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToWebp(canvas, quality = 0.92) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

function drawSquare(img, sx, sy, side, size) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

function slugify(name) {
  const slug = name.replace(/\.[^.]+$/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `item-${Date.now()}`;
}

/**
 * Center-crops the source image to a square, then produces a full-size webp
 * (capped at 1024px) and a 96x96 thumb webp, uploading both into the given
 * category subfolder under assets/images and assets/thumbs/images.
 * @returns {Promise<{imgFull: string|null, imgThumb: string|null}>}
 */
export async function generateItemImages(file, subfolder) {
  const baseName  = slugify(file.name);
  const objectUrl = URL.createObjectURL(file);

  let img;
  try {
    img = await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  const fullSize = Math.min(side, FULL_MAX);

  const fullCanvas  = drawSquare(img, sx, sy, side, fullSize);
  const thumbCanvas = drawSquare(img, sx, sy, side, THUMB_SIZE);

  const [fullBlob, thumbBlob] = await Promise.all([
    canvasToWebp(fullCanvas),
    canvasToWebp(thumbCanvas),
  ]);

  const fullDir  = `systems/osp-houserules/assets/images/${subfolder}`;
  const thumbDir = `systems/osp-houserules/assets/thumbs/images/${subfolder}`;

  await FilePicker.createDirectory("data", fullDir).catch(() => {});
  await FilePicker.createDirectory("data", thumbDir).catch(() => {});

  const fullFile  = new File([fullBlob],  `${baseName}.webp`,       { type: "image/webp" });
  const thumbFile = new File([thumbBlob], `${baseName}_thumb.webp`, { type: "image/webp" });

  const [fullResult, thumbResult] = await Promise.all([
    FilePicker.upload("data", fullDir,  fullFile,  {}),
    FilePicker.upload("data", thumbDir, thumbFile, {}),
  ]);

  return {
    imgFull:  fullResult?.path  ?? null,
    imgThumb: thumbResult?.path ?? null,
  };
}
