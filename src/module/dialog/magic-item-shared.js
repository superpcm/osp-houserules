/**
 * @file Shared plumbing for both magic item creation flows: enchanting an
 * existing weapon/armor/ammunition (magic-item-creator.js) and building a
 * wand/ring/wondrous item/scroll/potion from scratch (add-magic-item-dialog.js).
 * Keeping the glow-image generator and "Magic Items" folder filer here means
 * a from-scratch scroll and a +1 sword end up looking and filing the same way
 * despite having no source item in common.
 */

import { ensureDirectory } from "./add-item/image-pipeline.js";

/**
 * Renders a gold drop-shadow glow around `srcImg` and uploads the result,
 * returning its path for use as an item's `img`. `srcImg` may be a
 * server-relative path or an object URL (blob:) from a freshly-browsed local
 * file.
 *
 * By default the glow is uploaded as a new file into the catch-all
 * `magic-item-thumbs` directory (used when enchanting an existing item, which
 * only ever produces one glow image). Pass `uploadTarget: {dir, fileName}` to
 * instead overwrite a specific path in place — used when glowing both the
 * full-size and thumbnail uploads of a from-scratch magic item, so each glow
 * output lands back at its original sibling path and item-card-renderer.js's
 * "_thumb.webp" -> ".webp" derivation still finds the (now-glowing) full-size
 * image next to the (now-glowing) thumbnail.
 */
export async function generateGlowImage(srcImg, uploadTarget = null) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const PAD = 22;
      const canvas = document.createElement("canvas");
      canvas.width  = img.width  + PAD * 2;
      canvas.height = img.height + PAD * 2;
      const ctx = canvas.getContext("2d");

      // Multiple glow passes to build up intensity
      ctx.shadowColor = "#FFD700";
      ctx.shadowBlur  = 20;
      for (let i = 0; i < 4; i++) ctx.drawImage(img, PAD, PAD);

      // Final sharp draw on top of the glow
      ctx.shadowBlur = 0;
      ctx.drawImage(img, PAD, PAD);

      // On any failure below, fall back to the original srcImg — except when srcImg is
      // a blob: object URL (a freshly-browsed local file, not yet uploaded anywhere):
      // that URL only lives as long as this browser tab, so storing it as item.img
      // would look fine right now and break permanently on the next page reload.
      const fallback = srcImg.startsWith("blob:") ? null : srcImg;

      canvas.toBlob(async (blob) => {
        if (!blob) { resolve(fallback); return; }
        const dir = uploadTarget?.dir ?? "magic-item-thumbs";
        const fileName = uploadTarget?.fileName
          ?? `${srcImg.split("/").pop().replace(/\.[^.]+$/, "").replace(/_thumb$/, "")}-magic_${Date.now()}.webp`;
        try {
          await ensureDirectory(dir);
          const file   = new File([blob], fileName, { type: "image/webp" });
          const result = await FilePicker.upload("data", dir, file, {});
          resolve(result.path ?? fallback);
        } catch {
          resolve(fallback);
        }
      }, "image/webp", 0.92);
    };

    img.onerror = () => resolve(srcImg.startsWith("blob:") ? null : srcImg);

    // Blob URLs are already unique per upload and don't accept a query string;
    // server-relative paths need a leading slash and a cache-busting version.
    if (srcImg.startsWith("blob:")) {
      img.src = srcImg;
    } else {
      const resolved = srcImg.startsWith("http") || srcImg.startsWith("/") ? srcImg : `/${srcImg}`;
      img.src = `${resolved}?v=${Date.now()}`;
    }
  });
}

/**
 * The full-size image is never stored in item JSON — only the thumb path is —
 * so it's derived by string-replacing "_thumb.webp" -> ".webp" on the stored
 * thumb path. Used when enchanting an existing item (its thumb is already on disk).
 */
export function resolveFullRes(imgPath) {
  const THUMB_BASE = 'systems/osp-houserules/assets/thumbs/images/';
  if (imgPath && imgPath.includes(THUMB_BASE)) {
    const relative = imgPath.slice(imgPath.indexOf(THUMB_BASE) + THUMB_BASE.length);
    return 'systems/osp-houserules/assets/images/' + relative.replace('_thumb.webp', '.webp');
  }
  return imgPath;
}

/**
 * Ensures "Magic Items > <subName>" folder hierarchy exists and returns the
 * subfolder. Returns null if subName is falsy (caller wants no folder filing).
 */
export async function ensureMagicFolder(subName) {
  if (!subName) return null;

  let parent = game.folders.find(f => f.name === "Magic Items" && f.type === "Item" && !f.folder);
  if (!parent) {
    parent = await Folder.create({ name: "Magic Items", type: "Item", color: "#8B6914" });
  }

  let sub = game.folders.find(f => f.name === subName && f.type === "Item" && f.folder?.id === parent.id);
  if (!sub) {
    sub = await Folder.create({ name: subName, type: "Item", folder: parent.id });
  }

  return sub;
}
