/**
 * @file "Add Item" DM Toolkit dialog — pick a catalog category, fill in
 * category-specific fields, browse a source image, and create a real World
 * Item immediately. Also renders the matching JSON entry for the GM to copy
 * into the corresponding data/<category>.json catalog file.
 */

import { CATALOG_CATEGORIES, TYPE_LABELS, renderTypeFields, renderCategoryExtras, renderAllowedContainersField, collectSystemData } from "./catalog-schema.js";
import { uploadItemImages } from "./image-pipeline.js";

// The full-size image is never stored in item JSON — item-card-renderer.js and
// magic-item-creator.js both derive it from the thumb path by string-replacing
// "_thumb.webp" -> ".webp", so both uploads must actually be .webp or that derivation
// silently fails to resolve and falls back to showing the thumbnail everywhere.
function isWebpFile(file) {
  return file.type === 'image/webp' || /\.webp$/i.test(file.name);
}

export class AddItemDialog {
  static async prompt() {
    const categoryOptions = CATALOG_CATEGORIES.map(c => `<option value="${c.key}">${c.label}</option>`).join('');

    const content = `
      <div class="osp-add-item-dialog">
        <div class="add-item-field add-item-field-full">
          <label>Category</label>
          <select id="add-item-category">
            <option value="">-- Select --</option>
            ${categoryOptions}
          </select>
        </div>

        <div id="add-item-type-row" class="add-item-field add-item-field-full is-hidden">
          <label>Item Type</label>
          <select id="add-item-type"></select>
        </div>

        <div class="add-item-field add-item-field-full">
          <label>Folder</label>
          <select id="add-item-folder"></select>
        </div>

        <div id="add-item-base-fields" class="is-hidden">
          <div class="add-item-fields-grid">
            <div class="add-item-field add-item-field-full">
              <label>Name</label>
              <input type="text" id="add-item-name" placeholder="Item name">
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
              <input type="number" data-sys-field="storedSize" data-sys-kind="number" value="4">
            </div>
            <div class="add-item-field">
              <label>Quantity</label>
              <input type="number" data-sys-field="quantity" data-sys-kind="number" value="1">
            </div>
            <div class="add-item-field add-item-field-checkbox">
              <label><input type="checkbox" data-sys-field="equipped" data-sys-kind="checkbox"> Equipped</label>
            </div>
            <div class="add-item-field add-item-field-checkbox">
              <label><input type="checkbox" data-sys-field="lashable" data-sys-kind="checkbox"> Lashable</label>
            </div>
            <div class="add-item-field add-item-field-full">
              <label>Tags</label>
              <input type="text" data-sys-field="tags" data-sys-kind="tags" placeholder="comma, separated, tags">
            </div>
          </div>
          <details class="add-item-advanced">
            <summary>Advanced fields</summary>
            <div class="add-item-fields-grid">
              <div class="add-item-field">
                <label>Container Size Required</label>
                <select data-sys-field="containerSizeRequired" data-sys-kind="select">
                  <option value="">--</option>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
              <div class="add-item-field">
                <label>Slot Cost</label>
                <input type="number" data-sys-field="slotCost" data-sys-kind="number" value="0">
              </div>
              ${renderAllowedContainersField()}
            </div>
          </details>
        </div>

        <div id="add-item-type-fields"></div>
        <div id="add-item-category-extras"></div>

        <div id="add-item-image-section" class="add-item-image-section is-hidden">
          <div class="add-item-field add-item-field-full">
            <label>Full-Size Image</label>
            <div class="add-item-image-row">
              <span role="button" tabindex="0" class="add-item-browse-btn" data-target="full">Browse&hellip;</span>
              <span class="add-item-file-name" data-target="full">No file selected</span>
              <img class="add-item-image-preview" data-target="full" style="display:none;">
            </div>
            <input type="file" id="add-item-file-input-full" accept="image/webp,.webp" class="add-item-file-input-hidden">
          </div>
          <div class="add-item-field add-item-field-full">
            <label>Thumbnail Image</label>
            <div class="add-item-image-row">
              <span role="button" tabindex="0" class="add-item-browse-btn" data-target="thumb">Browse&hellip;</span>
              <span class="add-item-file-name" data-target="thumb">No file selected</span>
              <img class="add-item-image-preview" data-target="thumb" style="display:none;">
            </div>
            <input type="file" id="add-item-file-input-thumb" accept="image/webp,.webp" class="add-item-file-input-hidden">
          </div>
          <div class="add-item-field add-item-field-full">
            <label>Target Subfolder (under assets/images and assets/thumbs/images)</label>
            <input type="text" id="add-item-subfolder">
          </div>
        </div>

        <div class="add-item-actions">
          <span role="button" tabindex="0" class="add-item-create-btn is-disabled">Create Item</span>
          <span class="add-item-status"></span>
        </div>

        <div id="add-item-json-section" class="add-item-json-section is-hidden">
          <label>JSON entry — paste into the matching data/&lt;category&gt;.json</label>
          <textarea id="add-item-json-preview" readonly rows="12"></textarea>
          <span role="button" tabindex="0" class="add-item-copy-btn">Copy to Clipboard</span>
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      let resolved = false;
      const dialog = new foundry.applications.api.DialogV2({
        window: { title: "Add Item" },
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

        const categorySelect  = el.querySelector('#add-item-category');
        const typeRow          = el.querySelector('#add-item-type-row');
        const typeSelect       = el.querySelector('#add-item-type');
        const folderSelect     = el.querySelector('#add-item-folder');
        const baseFields       = el.querySelector('#add-item-base-fields');
        const typeFields       = el.querySelector('#add-item-type-fields');
        const categoryExtras   = el.querySelector('#add-item-category-extras');
        const imageSection     = el.querySelector('#add-item-image-section');
        const subfolderInput   = el.querySelector('#add-item-subfolder');
        const nameInput        = el.querySelector('#add-item-name');
        const fileInputFull    = el.querySelector('#add-item-file-input-full');
        const fileInputThumb   = el.querySelector('#add-item-file-input-thumb');
        const browseBtnFull    = el.querySelector('.add-item-browse-btn[data-target="full"]');
        const browseBtnThumb   = el.querySelector('.add-item-browse-btn[data-target="thumb"]');
        const fileNameSpanFull  = el.querySelector('.add-item-file-name[data-target="full"]');
        const fileNameSpanThumb = el.querySelector('.add-item-file-name[data-target="thumb"]');
        const imgPreviewFull    = el.querySelector('.add-item-image-preview[data-target="full"]');
        const imgPreviewThumb   = el.querySelector('.add-item-image-preview[data-target="thumb"]');
        const createBtn        = el.querySelector('.add-item-create-btn');
        const statusSpan       = el.querySelector('.add-item-status');
        const jsonSection      = el.querySelector('#add-item-json-section');
        const jsonTextarea     = el.querySelector('#add-item-json-preview');
        const copyBtn          = el.querySelector('.add-item-copy-btn');

        let selectedFullFile  = null;
        let selectedThumbFile = null;

        // Item folders, indented to reflect nesting (Foundry supports up to 3 levels).
        const itemFolders = game.folders.filter(f => f.type === "Item")
          .sort((a, b) => (a.depth ?? 1) - (b.depth ?? 1) || a.name.localeCompare(b.name));
        folderSelect.innerHTML = '<option value="">-- Root (no folder) --</option>' +
          itemFolders.map(f => `<option value="${f.id}">${'  '.repeat((f.depth ?? 1) - 1)}${f.name}</option>`).join('');

        // Foundry's global `button { display:flex; ... }` rule breaks flex-item sizing
        // and hides siblings when a real <button> sits inside a flex row, so every
        // interactive element in this dialog is a <span role="button"> instead —
        // wire click + Enter/Space activation manually to keep it keyboard-accessible.
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
          return CATALOG_CATEGORIES.find(c => c.key === categorySelect.value) || null;
        }

        function resolvedType() {
          const cat = currentCategory();
          if (!cat) return null;
          return cat.fixedType || typeSelect.value || null;
        }

        function rebuildTypeFields() {
          const type = resolvedType();
          typeFields.innerHTML = type ? renderTypeFields(type) : '';
        }

        function rebuildCategoryExtras() {
          const cat = currentCategory();
          categoryExtras.innerHTML = cat ? renderCategoryExtras(cat.key) : '';
        }

        function updateTypeOptions() {
          const cat = currentCategory();
          if (!cat || cat.fixedType) {
            typeRow.classList.add('is-hidden');
            return;
          }
          typeRow.classList.remove('is-hidden');
          typeSelect.innerHTML = '<option value="">-- Select --</option>' +
            cat.types.map(t => `<option value="${t}">${TYPE_LABELS[t] || t}</option>`).join('');
        }

        function updateCreateEnabled() {
          const enabled = !!(categorySelect.value && resolvedType() && nameInput.value.trim()
            && selectedFullFile && selectedThumbFile);
          createBtn.classList.toggle('is-disabled', !enabled);
        }

        categorySelect.addEventListener('change', () => {
          const cat = currentCategory();
          if (cat) {
            baseFields.classList.remove('is-hidden');
            imageSection.classList.remove('is-hidden');
            subfolderInput.value = cat.thumbFolder;
          } else {
            baseFields.classList.add('is-hidden');
            imageSection.classList.add('is-hidden');
          }
          updateTypeOptions();
          rebuildTypeFields();
          rebuildCategoryExtras();
          updateCreateEnabled();
        });

        typeSelect.addEventListener('change', () => {
          rebuildTypeFields();
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
          const type = resolvedType();
          const name = nameInput.value.trim();
          if (!cat || !type || !name || !selectedFullFile || !selectedThumbFile) {
            ui.notifications.warn("Pick a category, enter a name, and choose both a full-size image and a thumbnail first.");
            return;
          }

          createBtn.classList.add('is-disabled');
          statusSpan.textContent = 'Uploading images…';

          let images = null;
          try {
            images = await uploadItemImages(selectedFullFile, selectedThumbFile, subfolderInput.value.trim() || cat.thumbFolder, name);
          } catch (err) {
            console.error("[OSP] Add Item image upload failed:", err);
          }

          if (!images?.imgThumb) {
            ui.notifications.error("Image upload failed — item was not created.");
            statusSpan.textContent = 'Upload failed.';
            createBtn.classList.remove('is-disabled');
            return;
          }

          const system = collectSystemData(el);
          const itemData = { name, type, img: images.imgThumb, system };
          if (folderSelect.value) itemData.folder = folderSelect.value;

          try {
            await Item.create(itemData);
          } catch (err) {
            console.error("[OSP] Add Item creation failed:", err);
            ui.notifications.error(`Failed to create item: ${err.message}`);
            statusSpan.textContent = 'Item creation failed.';
            createBtn.classList.remove('is-disabled');
            return;
          }

          ui.notifications.info(`Created "${name}".`);
          statusSpan.textContent = 'Item created ✓';
          jsonTextarea.value = JSON.stringify(itemData, null, 2);
          jsonSection.classList.remove('is-hidden');
          jsonSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          createBtn.classList.remove('is-disabled');
        });

        bindActivate(copyBtn, async () => {
          try {
            await navigator.clipboard.writeText(jsonTextarea.value);
            ui.notifications.info("JSON copied to clipboard.");
          } catch (err) {
            ui.notifications.warn("Could not copy automatically — select and copy manually.");
          }
        });
      });
    });
  }
}
