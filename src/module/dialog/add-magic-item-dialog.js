/**
 * @file "Add Magic Item" DM Toolkit dialog — creates a wand/ring/wondrous
 * item/scroll/potion from scratch (no mundane base item to enchant, unlike
 * magic-item-creator.js's "Create Magic Version" context-menu action). Picks
 * a category, fills in category fields (scroll adds a spell picker sourced
 * from data/spells.json), browses a full-size image and a thumbnail — same
 * two-file flow as AddItemDialog — then applies the golden glow effect to
 * the thumbnail and files the result under "Magic Items > <category>".
 */

import { MAGIC_CATEGORIES, renderMagicCategoryFields, initMagicCategoryFields } from "./magic-item-schema.js";
import { collectSystemData } from "./add-item/catalog-schema.js";
import { slugify } from "./add-item/image-pipeline.js";
import { generateGlowImage, ensureMagicFolder } from "./magic-item-shared.js";

// See add-item-dialog.js — both the full-size and thumbnail uploads must
// actually be .webp or item-card-renderer.js's "_thumb.webp" -> ".webp"
// derivation silently fails to resolve the full-size image.
function isWebpFile(file) {
  return file.type === 'image/webp' || /\.webp$/i.test(file.name);
}

export class AddMagicItemDialog {
  static async prompt() {
    const categoryOptions = MAGIC_CATEGORIES.map(c => `<option value="${c.key}">${c.label}</option>`).join('');

    const content = `
      <div class="osp-add-item-dialog osp-add-magic-item-dialog">
        <div class="add-item-field add-item-field-full">
          <label>Category</label>
          <select id="magic-item-category">
            <option value="">-- Select --</option>
            ${categoryOptions}
          </select>
        </div>

        <div id="magic-item-base-fields" class="is-hidden">
          <div class="add-item-fields-grid">
            <div class="add-item-field add-item-field-full">
              <label>Name</label>
              <input type="text" id="magic-item-name" placeholder="Item name">
            </div>
            <div class="add-item-field add-item-field-full">
              <label>Description</label>
              <textarea data-sys-field="description" data-sys-kind="textarea" rows="3"></textarea>
            </div>
            <div class="add-item-field">
              <label>Cost (sp)</label>
              <input type="number" data-sys-field="cost" data-sys-kind="number" value="0">
            </div>
            <div class="add-item-field">
              <label>Weight</label>
              <input type="number" data-sys-field="unitWeight" data-sys-kind="number" value="0" step="0.1">
            </div>
            <div class="add-item-field">
              <label>Stored Size</label>
              <input type="number" data-sys-field="storedSize" data-sys-kind="number" value="0.25" step="0.25">
            </div>
            <div class="add-item-field">
              <label>Quantity</label>
              <input type="number" data-sys-field="quantity" data-sys-kind="number" value="1">
            </div>
          </div>
        </div>

        <div id="magic-item-category-fields"></div>

        <div id="magic-item-image-section" class="add-item-image-section is-hidden">
          <div class="add-item-field add-item-field-full">
            <label>Full-Size Image</label>
            <div class="add-item-image-row">
              <span role="button" tabindex="0" class="add-item-browse-btn" data-target="full">Browse&hellip;</span>
              <span class="add-item-file-name" data-target="full">No file selected</span>
              <img class="add-item-image-preview" data-target="full" style="display:none;">
            </div>
            <input type="file" id="magic-item-file-input-full" accept="image/webp,.webp" class="add-item-file-input-hidden">
          </div>
          <div class="add-item-field add-item-field-full">
            <label>Thumbnail Image &mdash; glow effect applied automatically</label>
            <div class="add-item-image-row">
              <span role="button" tabindex="0" class="add-item-browse-btn" data-target="thumb">Browse&hellip;</span>
              <span class="add-item-file-name" data-target="thumb">No file selected</span>
              <img class="add-item-image-preview" data-target="thumb" style="display:none;">
            </div>
            <input type="file" id="magic-item-file-input-thumb" accept="image/webp,.webp" class="add-item-file-input-hidden">
          </div>
        </div>

        <div class="add-item-actions">
          <span role="button" tabindex="0" class="add-item-create-btn is-disabled">Create Magic Item</span>
          <span class="add-item-status"></span>
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      let resolved = false;
      const dialog = new foundry.applications.api.DialogV2({
        window: { title: "Add Magic Item" },
        position: { width: 640 },
        content,
        buttons: [
          { action: "close", label: "Close", default: true, callback: () => { resolved = true; resolve(); } }
        ],
        close: () => { if (!resolved) resolve(); },
        rejectClose: false
      });

      dialog.render({ force: true }).then(() => {
        const el = dialog.element;
        if (!el) return;

        const categorySelect  = el.querySelector('#magic-item-category');
        const baseFields      = el.querySelector('#magic-item-base-fields');
        const categoryFields  = el.querySelector('#magic-item-category-fields');
        const imageSection    = el.querySelector('#magic-item-image-section');
        const nameInput       = el.querySelector('#magic-item-name');
        const fileInputFull   = el.querySelector('#magic-item-file-input-full');
        const fileInputThumb  = el.querySelector('#magic-item-file-input-thumb');
        const browseBtnFull   = el.querySelector('.add-item-browse-btn[data-target="full"]');
        const browseBtnThumb  = el.querySelector('.add-item-browse-btn[data-target="thumb"]');
        const fileNameSpanFull  = el.querySelector('.add-item-file-name[data-target="full"]');
        const fileNameSpanThumb = el.querySelector('.add-item-file-name[data-target="thumb"]');
        const imgPreviewFull    = el.querySelector('.add-item-image-preview[data-target="full"]');
        const imgPreviewThumb   = el.querySelector('.add-item-image-preview[data-target="thumb"]');
        const createBtn       = el.querySelector('.add-item-create-btn');
        const statusSpan      = el.querySelector('.add-item-status');

        let selectedFullFile  = null;
        let selectedThumbFile = null;

        // Same rationale as add-item-dialog.js: Foundry's global `button {}` rule
        // breaks flex-item sizing, so every interactive element here is a
        // <span role="button"> with manual click + Enter/Space activation.
        function bindActivate(node, handler) {
          node.addEventListener('click', handler);
          node.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handler(event);
            }
          });
        }

        function currentCategory() {
          return MAGIC_CATEGORIES.find(c => c.key === categorySelect.value) || null;
        }

        function updateCreateEnabled() {
          const enabled = !!(categorySelect.value && nameInput.value.trim()
            && selectedFullFile && selectedThumbFile);
          createBtn.classList.toggle('is-disabled', !enabled);
        }

        categorySelect.addEventListener('change', () => {
          const cat = currentCategory();
          categoryFields.innerHTML = cat ? renderMagicCategoryFields(cat.key) : '';
          if (cat) {
            baseFields.classList.remove('is-hidden');
            imageSection.classList.remove('is-hidden');
            initMagicCategoryFields(el, cat.key, {
              onSpellChosen: (spell) => {
                if (!spell) return;
                const suggested = `Scroll of ${spell.name}`;
                if (!nameInput.value.trim() || /^Scroll of /.test(nameInput.value)) {
                  nameInput.value = suggested;
                  updateCreateEnabled();
                }
                const desc = el.querySelector('[data-sys-field="description"]');
                if (desc && !desc.value.trim()) desc.value = spell.description;
              }
            });
          } else {
            baseFields.classList.add('is-hidden');
            imageSection.classList.add('is-hidden');
          }
          updateCreateEnabled();
        });

        nameInput.addEventListener('input', updateCreateEnabled);

        bindActivate(browseBtnFull, () => fileInputFull.click());
        fileInputFull.addEventListener('change', () => {
          const file = fileInputFull.files[0] || null;
          if (file && !isWebpFile(file)) {
            ui.notifications.warn(`"${file.name}" isn't a .webp file — the full-size image must be .webp.`);
            fileInputFull.value = '';
            selectedFullFile = null;
            fileNameSpanFull.textContent = 'No file selected';
            imgPreviewFull.style.display = 'none';
            updateCreateEnabled();
            return;
          }
          selectedFullFile = file;
          fileNameSpanFull.textContent = selectedFullFile ? selectedFullFile.name : 'No file selected';
          if (selectedFullFile) {
            imgPreviewFull.src = URL.createObjectURL(selectedFullFile);
            imgPreviewFull.style.display = '';
          } else {
            imgPreviewFull.style.display = 'none';
          }
          updateCreateEnabled();
        });

        bindActivate(browseBtnThumb, () => fileInputThumb.click());
        fileInputThumb.addEventListener('change', () => {
          const file = fileInputThumb.files[0] || null;
          if (file && !isWebpFile(file)) {
            ui.notifications.warn(`"${file.name}" isn't a .webp file — the thumbnail must be .webp.`);
            fileInputThumb.value = '';
            selectedThumbFile = null;
            fileNameSpanThumb.textContent = 'No file selected';
            imgPreviewThumb.style.display = 'none';
            updateCreateEnabled();
            return;
          }
          selectedThumbFile = file;
          fileNameSpanThumb.textContent = selectedThumbFile ? selectedThumbFile.name : 'No file selected';
          if (selectedThumbFile) {
            imgPreviewThumb.src = URL.createObjectURL(selectedThumbFile);
            imgPreviewThumb.style.display = '';
          } else {
            imgPreviewThumb.style.display = 'none';
          }
          updateCreateEnabled();
        });

        bindActivate(createBtn, async () => {
          if (createBtn.classList.contains('is-disabled')) return;

          const cat  = currentCategory();
          const name = nameInput.value.trim();
          if (!cat || !name || !selectedFullFile || !selectedThumbFile) {
            ui.notifications.warn("Pick a category, enter a name, and choose both a full-size image and a thumbnail first.");
            return;
          }

          createBtn.classList.add('is-disabled');
          statusSpan.textContent = 'Generating glow…';

          // Glow both browsed files directly and upload straight into the top-level
          // "magic-item-thumbs/<category>/" folder — never into systems/osp-houserules/,
          // since GM-generated magic item art must survive a system update/reinstall,
          // which wipes the system's own package directory. Full and thumb are siblings
          // in the same folder (item-card-renderer.js strips "_thumb" from the filename
          // to find the full-size image), so no separate images/ vs thumbs/images/ tree
          // is needed the way catalog items use.
          const dir = `magic-item-thumbs/${cat.imageDir}`;
          const baseName = slugify(name);

          let glowThumb = null;
          try {
            [, glowThumb] = await Promise.all([
              generateGlowImage(URL.createObjectURL(selectedFullFile),  { dir, fileName: `${baseName}.webp` }),
              generateGlowImage(URL.createObjectURL(selectedThumbFile), { dir, fileName: `${baseName}_thumb.webp` }),
            ]);
          } catch (err) {
            console.error("[OSP] Add Magic Item glow generation failed:", err);
          }

          if (!glowThumb) {
            ui.notifications.error("Glow generation failed — item was not created.");
            statusSpan.textContent = 'Glow generation failed.';
            createBtn.classList.remove('is-disabled');
            return;
          }

          const system = collectSystemData(el);
          system.tags = Array.from(new Set([...(system.tags || []), ...cat.tags]));

          const folder = await ensureMagicFolder(cat.folder);

          const itemData = { name, type: 'item', img: glowThumb, system };
          if (folder) itemData.folder = folder.id;

          try {
            await Item.create(itemData);
          } catch (err) {
            console.error("[OSP] Add Magic Item creation failed:", err);
            ui.notifications.error(`Failed to create item: ${err.message}`);
            statusSpan.textContent = 'Item creation failed.';
            createBtn.classList.remove('is-disabled');
            return;
          }

          ui.notifications.info(`Created "${name}".`);
          statusSpan.textContent = 'Item created ✓';
          createBtn.classList.remove('is-disabled');
        });
      });
    });
  }
}
