import { OSP } from "../config.js";
import { generateGlowImage, resolveFullRes, ensureMagicFolder } from "./magic-item-shared.js";
import { slugify } from "./add-item/image-pipeline.js";

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

    // Glow both the full-size and thumbnail source art, uploading each as its own
    // "magic/<type>" copy — never overwriting the mundane base item's own art files,
    // since other actors/world items still reference those directly — with the same
    // full/thumb sibling naming item-card-renderer.js expects, so the item card finds
    // the glowing full-size image next to the glowing thumbnail instead of upscaling it.
    const subDir   = { weapon: "weapons", armor: "armor", ammunition: "ammunition" }[this.sourceItem.type] || "misc";
    const baseName = slugify(expanded.name || this.sourceItem.name);
    const fullDir  = `systems/osp-houserules/assets/images/magic/${subDir}`;
    const thumbDir = `systems/osp-houserules/assets/thumbs/images/magic/${subDir}`;

    const [, glowImg] = await Promise.all([
      generateGlowImage(resolveFullRes(this.sourceItem.img), { dir: fullDir,  fileName: `${baseName}.webp` }),
      generateGlowImage(this.sourceItem.img,                  { dir: thumbDir, fileName: `${baseName}_thumb.webp` }),
    ]);

    // Ensure folder hierarchy: Magic Items > Weapons/Armor/Ammunition
    const subName = { weapon: "Weapons", armor: "Armor", ammunition: "Ammunition" }[this.sourceItem.type];
    const folder = await ensureMagicFolder(subName);

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
}
