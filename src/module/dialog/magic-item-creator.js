import { OSP } from "../config.js";

export class MagicItemCreator extends FormApplication {
  constructor(sourceItem, options = {}) {
    super(sourceItem, options);
    this.sourceItem = sourceItem;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "osp-magic-item-creator",
      classes: ["osp", "dialog", "magic-item-creator"],
      title: "Create Magic Version",
      template: `${OSP.systemPath()}/templates/dialogs/magic-item-creator.html`,
      width: 500,
      height: "auto",
      submitOnChange: false,
      closeOnSubmit: true,
    });
  }

  getData() {
    const item = this.sourceItem;
    const sys = foundry.utils.deepClone(item.system);

    // Default bonus to 1 for non-magic sources so name and fields start in sync
    const sourceBonus = item.system.bonus ?? 0;
    if (!sourceBonus) sys.bonus = 1;
    const defaultBonus = sys.bonus;

    // Default suggested name: append +N if not already present
    const suggestedName = /[+]\d/.test(item.name) ? item.name : `${item.name} +${defaultBonus}`;
    // aac.value stays as the base AC; bonus is tracked separately and added at display/calc time

    return {
      name: suggestedName,
      img: item.img,
      type: item.type,
      system: sys,
      isWeapon: item.type === "weapon",
      isArmor: item.type === "armor",
      isAmmunition: item.type === "ammunition",
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const bonusInput = html[0].querySelector('[name="system.bonus"]');
    const nameInput  = html[0].querySelector('[name="name"]');
    if (!bonusInput) return;
    bonusInput.addEventListener('input', () => {
      const bonus = parseInt(bonusInput.value) || 0;
      if (nameInput && bonus > 0) {
        nameInput.value = nameInput.value.replace(/\s*[+]\d+$/, '') + ` +${bonus}`;
      }
    });
  }

  async _updateObject(event, formData) {
    const expanded = foundry.utils.expandObject(formData);

    // Generate glow from the full-resolution source image, not the thumbnail
    const glowImg = await MagicItemCreator._generateGlowImage(
      MagicItemCreator._resolveFullRes(this.sourceItem.img)
    );

    // Ensure folder hierarchy: Magic Items > Weapons/Armor/Ammunition
    const folder = await MagicItemCreator._ensureFolder(this.sourceItem.type);

    // Merge form data onto source item, stripping actor-placement fields
    const itemData = foundry.utils.mergeObject(
      this.sourceItem.toObject(),
      {
        name: expanded.name,
        img: glowImg,
        folder: folder?.id ?? null,
        system: expanded.system,
      },
      { overwrite: true, inplace: false }
    );
    itemData.system.containerId = null;
    itemData.system.equipped    = false;
    itemData.system.lashed      = false;

    await Item.create(itemData);
    ui.notifications.info(`Magic item "${expanded.name}" created.`);
  }

  // ── Path helpers ─────────────────────────────────────────────────────────

  static _resolveFullRes(imgPath) {
    const THUMB_BASE = 'systems/osp-houserules/assets/thumbs/images/';
    if (imgPath && imgPath.includes(THUMB_BASE)) {
      const relative = imgPath.slice(imgPath.indexOf(THUMB_BASE) + THUMB_BASE.length);
      return 'systems/osp-houserules/assets/images/' + relative.replace('_thumb.webp', '.webp');
    }
    return imgPath;
  }

  // ── Folder helpers ──────────────────────────────────────────────────────

  static async _ensureFolder(itemType) {
    const subName = { weapon: "Weapons", armor: "Armor", ammunition: "Ammunition" }[itemType];
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

  // ── Glow image generation ────────────────────────────────────────────────

  static async _generateGlowImage(srcImg) {
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

        canvas.toBlob(async (blob) => {
          if (!blob) { resolve(srcImg); return; }
          const baseName = srcImg.split("/").pop().replace(/\.[^.]+$/, "").replace(/_thumb$/, "");
          const fileName = `${baseName}-magic_${Date.now()}.webp`;
          try {
            await FilePicker.createDirectory("data", "magic-item-thumbs").catch(() => {});
            const file   = new File([blob], fileName, { type: "image/webp" });
            const result = await FilePicker.upload("data", "magic-item-thumbs", file, {});
            resolve(result.path ?? srcImg);
          } catch {
            resolve(srcImg);
          }
        }, "image/webp", 0.92);
      };

      img.onerror = () => resolve(srcImg);

      // Prefix path so the browser resolves it correctly from the Foundry origin
      const resolved = srcImg.startsWith("http") || srcImg.startsWith("/")
        ? srcImg
        : `/${srcImg}`;
      img.src = `${resolved}?v=${Date.now()}`;
    });
  }
}
