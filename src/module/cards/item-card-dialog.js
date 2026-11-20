/**
 * Dialog for displaying rendered item cards
 * Shows card preview with download button
 */

import { ItemCardRenderer } from './item-card-renderer.js';
import { castSpellItem } from '../spells/spellcasting-ui.js';
import { readItemSpell } from '../spells/item-spell.js';
import { changeHealth } from '../health/health-authority.js';
import { ospDialogOptions } from '../dialog/dialog-theme.js';
import { loadStockingCatalog, resolveStockingMetadata, CATALOG_AVAILABILITIES } from '../inventory/catalog-stocking.js';
import { eligibleStoreItem } from '../inventory/store.js';
import { VEHICLE_KINDS, VEHICLE_ATTACHMENT_KINDS, getVehicleKind, getVehicleAttachmentKind } from '../inventory/vehicle-lashing.js';
import { CLOTHING_WEAR_CATEGORIES } from '../inventory/clothing-wear.js';
import { vehicleMetadataUpdate } from '../inventory/vehicle-metadata-editor.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

const CLOTHING_WEAR_CATEGORY_OPTIONS = [{ value: '', label: 'Unassigned (infer if recognized)' }, ...CLOTHING_WEAR_CATEGORIES.map(({ id, label }) => ({ value: id, label }))];

export class ItemCardDialog extends Application {
  constructor(item, options = {}) {
    super(options);
    this.item = item;
    this.renderer = new ItemCardRenderer();
    this.canvas = null;
  }
  
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Item Card",
      template: "systems/osp-houserules/templates/dialogs/item-card-dialog.html",
      classes: ["osp-item-card-dialog"],
      width: 300,
      height: 450,
      resizable: false,
      popOut: true,
      minimizable: false,
      zIndex: 9999,
      dragDrop: [{ dragSelector: null, dropSelector: null }]
    });
  }
  
  async getData() {
    return {
      itemName: this.item.name,
      itemType: this.item.type
    };
  }
  
  activateListeners(html) {
    this._disposeCard();
    this._cardClosed = false;
    super.activateListeners(html);
    
    // Render card when dialog opens
    this._renderCard(html);
    this._setupSpellControls(html);
    this._setupHealingPotionControls(html);
    
    // Open the artwork on double-click and retain the card’s close gesture elsewhere.
    this._cardHtml = html;
    html.find('.card-preview-container').off('.ospCard').on('dblclick.ospCard', event => this._onCardDoubleClick(event));
    
    // Right-click on card to show GM options
    html.find('.card-preview-container').on('contextmenu.ospCard', (e) => {
      e.preventDefault();
      if (game.user.isGM) {
        this._showGMContextMenu(e);
      }
    });
  }
  
  _onCardDoubleClick(event) {
    const canvas = this.canvas;
    const artwork = canvas?.itemArtwork;
    if (artwork && event.target === canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * canvas.width / rect.width;
      const y = (event.clientY - rect.top) * canvas.height / rect.height;
      if (x >= artwork.x && x < artwork.x + artwork.width &&
          y >= artwork.y && y < artwork.y + artwork.height) {
        const Viewer = foundry.applications.apps?.ImagePopout;
        if (!Viewer) return;
        return new Viewer({ src: artwork.src, window: { title: this.item.name } }).render({ force: true });
      }
    }
    return this.close();
  }

  /**
   * Show GM context menu with options
   */
  _showGMContextMenu(event) {
    const items = [
      {
        name: "Rename Item",
        icon: '<i class="fas fa-edit"></i>',
        callback: () => this._showRenameDialog()
      },
      {
        name: "Change Image",
        icon: '<i class="fas fa-image"></i>',
        callback: () => this._showImagePathDialog()
      },
      {
        name: "Configure Spell",
        icon: '<i class="fas fa-wand-magic-sparkles"></i>',
        callback: () => this._showSpellConfigDialog()
      }
    ];
    if (!this.item.actor && eligibleStoreItem(this.item)) items.push({
      name: "Merchant Stocking Metadata",
      icon: '<i class="fas fa-tags"></i>',
      callback: () => this._showStockingMetadataDialog()
    });
    
    if (!this.item.actor && ['item', 'weapon', 'armor', 'container', 'clothing', 'ammunition'].includes(this.item.type)) items.push({
      name: 'Vehicle Fittings', icon: '<i class="fas fa-wagon-covered"></i>', callback: () => this._showVehicleMetadataDialog()
    });
    if (this.item.type === 'clothing') items.push({
      name: 'Wear category', icon: '<i class="fas fa-shirt"></i>', callback: () => this._showClothingWearDialog()
    });
    new ContextMenu($(event.currentTarget), ".card-preview-container", items);
  }

  _showClothingWearDialog() {
    if (!game.user?.isGM || this.item.type !== 'clothing') return;
    const current = String(this.item.system?.slot ?? '');
    const selectedCurrent = CLOTHING_WEAR_CATEGORY_OPTIONS.some(({ value }) => value === current) ? current : '';
    const options = CLOTHING_WEAR_CATEGORY_OPTIONS.map(({ value, label }) => `<option value="${esc(value)}"${selectedCurrent === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
    const content = `<form class="osp-clothing-wear-config"><label>Wear category <select name="clothingWearCategory">${options}</select></label><p>Choose where this garment is worn. Belts remain separate from the Clothing ring.</p></form>`;
    new Dialog(ospDialogOptions({ title: `Wear category: ${esc(this.item.name)}`, content, buttons: {
      save: { label: 'Save category', callback: async html => {
        if (!game.user?.isGM || this.item.type !== 'clothing') return;
        const root = html[0] ?? html;
        const selected = root.querySelector('[name="clothingWearCategory"]')?.value ?? '';
        if (!CLOTHING_WEAR_CATEGORY_OPTIONS.some(({ value }) => value === selected)) {
          ui.notifications.warn('Choose a valid clothing wear category.');
          return;
        }
        try {
          const updated = await this.item.update({ 'system.slot': selected });
          if (!updated || String(this.item.system?.slot ?? '') !== selected) { ui.notifications.warn('Wear category was not changed. Resolve any occupied-position conflict first.'); return; }
          ui.notifications.info(`Updated wear category for ${this.item.name}.`);
          this.render(true);
        } catch (error) { ui.notifications.error(error.message ?? 'Unable to update wear category.'); }
      } },
      cancel: { label: 'Cancel' }
    }, default: 'save' })).render(true);
  }

  async _showStockingMetadataDialog() {
    if (!game.user?.isGM || this.item.actor || !eligibleStoreItem(this.item)) return;
    const catalog = await loadStockingCatalog();
    const metadata = resolveStockingMetadata(this.item, Array.isArray(catalog) ? catalog : catalog?.items ?? []);
    const availability = this.item.system?.storeAvailability ?? '';
    const smith = this.item.system?.blacksmithEligible;
    const options = CATALOG_AVAILABILITIES.map(value => `<option value="${value}"${availability === value ? ' selected' : ''}>${value[0].toUpperCase() + value.slice(1)}</option>`).join('');
    const content = `<form class="osp-item-stocking-config">
      <p>Effective availability: <strong>${metadata.availability ? metadata.availability[0].toUpperCase() + metadata.availability.slice(1) : 'Unclassified'}</strong> (${metadata.availabilitySource})</p>
      <p>Effective blacksmith eligibility: <strong>${metadata.blacksmithEligible == null ? 'Unset' : metadata.blacksmithEligible ? 'Eligible' : 'Excluded'}</strong> (${metadata.blacksmithSource})</p>
      <label>Availability override <select name="storeAvailability"><option value="">Use catalog default</option>${options}</select></label>
      <label>Blacksmith override <select name="blacksmithEligible"><option value="">Use catalog default</option><option value="true"${smith === true ? ' selected' : ''}>Eligible</option><option value="false"${smith === false ? ' selected' : ''}>Excluded</option></select></label>
    </form>`;
    new Dialog(ospDialogOptions({ title: `Merchant Stocking: ${this.item.name}`, content, buttons: {
      save: { label: 'Save metadata', callback: async html => {
        const root = html[0] ?? html;
        try {
          const { applyStockingMetadataChanges } = await import('../inventory/catalog-stocking-review.js');
          await applyStockingMetadataChanges(new Map([[this.item.id, { availability: root.querySelector('[name="storeAvailability"]').value, blacksmith: root.querySelector('[name="blacksmithEligible"]').value }]]));
          ui.notifications.info(`Updated stocking metadata for ${this.item.name}.`); this.render(true);
        }
        catch (error) { ui.notifications.error(error.message ?? 'Unable to update stocking metadata.'); }
      } }, cancel: { label: 'Cancel' }
    }, default: 'save' })).render(true);
  }

  _showVehicleMetadataDialog() {
    if (!game.user?.isGM || this.item.actor) return;
    const options = (values, field) => '<option value="">Use catalog default</option>' + values.map(value => `<option value="${esc(value.id)}"${this.item.system?.[field] === value.id ? ' selected' : ''}>${esc(value.label)}</option>`).join('');
    const content = `<form><p>Vehicle: ${esc(getVehicleKind(this.item) || 'none')}. Attachment: ${esc(getVehicleAttachmentKind(this.item) || 'none')}.</p>
      ${this.item.type === 'container' ? `<label>Vehicle type <select name="vehicleKind">${options(VEHICLE_KINDS, 'vehicleKind')}</select></label>` : ''}
      <label>Vehicle fitting <select name="vehicleAttachmentKind">${options(VEHICLE_ATTACHMENT_KINDS, 'vehicleAttachmentKind')}</select></label>
      <p>Fitting types set compatible vehicles, available positions, and quantity limits. Exterior fittings are attached individually. Buckets must be empty; loose harnesses and grease are stored as cargo.</p></form>`;
    new Dialog(ospDialogOptions({ title: `Vehicle Fittings: ${this.item.name}`, content, buttons: {
      save: { label: 'Save fittings', callback: async html => {
        if (!game.user?.isGM || this.item.actor) return;
        const root = html[0] ?? html;
        try {
          const update = vehicleMetadataUpdate(this.item, { vehicleKind: root.querySelector('[name="vehicleKind"]')?.value ?? '', vehicleAttachmentKind: root.querySelector('[name="vehicleAttachmentKind"]').value });
          await this.item.update(update);
          ui.notifications.info(`Updated vehicle fittings for ${this.item.name}.`);
          this.render(true);
        } catch (error) { ui.notifications.error(error.message ?? 'Unable to update vehicle fittings.'); }
      } }, cancel: { label: 'Cancel' }
    }, default: 'save' })).render(true);
  }

  _spellKind() {
    return readItemSpell(this.item)?.kind ?? 'item';
  }

  _spellUses() {
    const system = this.item.system ?? {};
    const quantity = system.quantity && typeof system.quantity === 'object' ? system.quantity.value : system.quantity;
    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) return 0;
    if (this._spellKind() !== 'scroll' && Number(quantity) !== 1) return 0;
    const value = Number(this._spellKind() === 'scroll' ? quantity ?? 0 : system.charges ?? 0);
    return Number.isInteger(value) && value > 0 ? value : 0;
  }

  _setupSpellControls(html) {
    const actor = this.item.actor;
    const button = html.find('[data-cast-item-spell]')[0];
    if (!button) return;
    const configured = Boolean(readItemSpell(this.item));
    const owned = Boolean(actor?.isOwner);
    if (!configured || !owned) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    const pending = actor.getFlag?.('osp-houserules', 'spellcastingPending');
    const refresh = () => {
      button.disabled = this._spellUses() <= 0 || Boolean(this._spellInFlight) || Boolean(pending);
      button.title = pending ? 'Spell recovery is required' : this._spellUses() <= 0 ? 'No uses remaining' : 'Cast spell from item';
    };
    refresh();
    html.find('[data-cast-item-spell]').off('.ospSpell').on('click.ospSpell', async event => {
      event.preventDefault();
      if (this._spellInFlight || this._spellUses() <= 0) return;
      this._spellInFlight = true;
      refresh();
      try {
        await castSpellItem(actor, this.item);
        await this.item.actor?.sheet?.render?.(false);
        await this.render(true);
      } catch (error) {
        ui.notifications.error(error.message ?? 'Unable to cast item spell.');
      } finally {
        this._spellInFlight = false;
        refresh();
      }
    });
  }

  _setupHealingPotionControls(html) {
    const actor = this.item.actor;
    const button = html.find('[data-use-healing-potion]')[0];
    if (!button) return;
    const owned = Boolean(actor?.isOwner);
    if (this.item.name !== 'Healing Potion' || this.item.type !== 'item' || !owned) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    const refresh = () => {
      const quantity = this.item.system?.quantity && typeof this.item.system.quantity === 'object' ? this.item.system.quantity.value : this.item.system?.quantity;
      const pending = actor.getFlag?.('osp-houserules', 'healthPending');
      button.disabled = Number(quantity) <= 0 || Boolean(this._healingPotionInFlight) || Boolean(pending);
      button.title = pending ? 'Health recovery is required' : Number(quantity) <= 0 ? 'No potions remaining' : 'Use Healing Potion';
    };
    refresh();
    html.find('[data-use-healing-potion]').off('.ospHealingPotion').on('click.ospHealingPotion', async event => {
      event.preventDefault();
      if (this._healingPotionInFlight || button.disabled) return;
      this._healingPotionInFlight = true;
      refresh();
      try {
        const result = await changeHealth(actor, { action: 'useHealingPotion', itemId: this.item.id });
        if (!result.success && !result.cancelled) throw new Error(result.reason ?? 'Unable to use Healing Potion.');
        this._healingPotionInFlight = false;
        await actor.sheet?.render?.(false);
        await this.render(true);
      } catch (error) {
        ui.notifications.error(error.message ?? 'Unable to use Healing Potion.');
      } finally {
        this._healingPotionInFlight = false;
        refresh();
      }
    });
  }

  async _showSpellConfigDialog() {
    if (!game.user.isGM) return;
    let lists = {};
    try {
      const response = await fetch('systems/osp-houserules/data/spells.json');
      lists = (await response.json()).spellLists ?? {};
    } catch (error) {
      ui.notifications.error('Unable to load the canonical spell list.');
      return;
    }
    const system = this.item.system ?? {};
    const listOptions = Object.keys(lists).sort().map(key => `<option value="${esc(key)}"${key === system.spellClass ? ' selected' : ''}>${esc(key)}</option>`).join('');
    const selectedList = lists[system.spellClass] ?? Object.values(lists)[0] ?? [];
    const spellOptions = selectedList.map(spell => `<option value="${esc(spell.id)}"${spell.id === system.spellKey ? ' selected' : ''}>${esc(spell.name)}</option>`).join('');
    const allowedClasses = Array.isArray(system.spellAllowedClasses) ? system.spellAllowedClasses.join(', ') : String(system.spellAllowedClasses ?? '');
    const content = `<form class="osp-item-spell-config"><label>Spell list <select name="spellClass">${listOptions}</select></label><label>Spell <select name="spellKey">${spellOptions}</select></label><label><input type="checkbox" name="spellReversed"${system.spellReversed ? ' checked' : ''}> Reversed form</label><label>Item type <select name="spellSourceKind"><option value="item">Magic item</option><option value="scroll">Scroll</option><option value="wand">Wand</option><option value="staff">Staff</option></select></label><div data-spell-charges><label>Charges / uses <input type="number" name="charges" min="0" step="1" value="${Number(system.charges ?? 0)}"></label></div><div data-scroll-quantity-note>Scroll uses are tracked by inventory quantity.</div><label>Allowed classes (optional) <input type="text" name="spellAllowedClasses" value="${esc(allowedClasses)}" placeholder="Magic-User, Cleric"></label></form>`;
    new Dialog(ospDialogOptions({ title: `Configure Spell: ${this.item.name}`, classes: ['osp-choose-spellbook'], content, buttons: {
      save: { label: 'Save', callback: async html => {
        const root = html[0] ?? html;
        const sourceKind = root.querySelector('[name="spellSourceKind"]').value;
        const spell = (lists[root.querySelector('[name="spellClass"]').value] ?? []).find(entry => entry.id === root.querySelector('[name="spellKey"]').value);
        if (root.querySelector('[name="spellReversed"]').checked && !spell?.reversed) {
          ui.notifications.warn('The selected spell has no reversed form.');
          return;
        }
        const updates = {
          'system.spellClass': root.querySelector('[name="spellClass"]').value,
          'system.spellKey': root.querySelector('[name="spellKey"]').value,
          'system.spellReversed': root.querySelector('[name="spellReversed"]').checked,
          'system.spellSourceKind': sourceKind,
          'system.spellAllowedClasses': root.querySelector('[name="spellAllowedClasses"]').value.split(',').map(value => value.trim()).filter(Boolean)
        };
        if (sourceKind !== 'scroll') updates['system.charges'] = Number(root.querySelector('[name="charges"]').value) || 0;
        try { await this.item.update(updates); this.render(true); } catch (error) { ui.notifications.error(error.message ?? 'Unable to configure item spell.'); }
      } },
      cancel: { label: 'Cancel' }
    }, render: html => {
      const root = html[0] ?? html;
      const kind = root.querySelector('[name="spellSourceKind"]');
      if (kind) kind.value = system.spellSourceKind ?? this._spellKind();
      const list = root.querySelector('[name="spellClass"]');
      const spells = root.querySelector('[name="spellKey"]');
      const reverse = root.querySelector('[name="spellReversed"]');
      const charges = root.querySelector('[data-spell-charges]');
      const quantityNote = root.querySelector('[data-scroll-quantity-note]');
      const refreshCharges = () => {
        const isScroll = kind.value === 'scroll';
        charges.hidden = isScroll;
        charges.querySelector('[name="charges"]').disabled = isScroll;
        quantityNote.hidden = !isScroll;
      };
      const populate = (listKey, selectedId = '') => {
        spells.replaceChildren(...(lists[listKey] ?? []).map(spell => {
          const option = document.createElement('option');
          option.value = spell.id;
          option.textContent = spell.name;
          option.selected = spell.id === selectedId;
          return option;
        }));
        const selected = (lists[listKey] ?? []).find(spell => spell.id === spells.value);
        reverse.disabled = !selected?.reversed;
        if (!selected?.reversed) reverse.checked = false;
      };
      list.addEventListener('change', () => populate(list.value));
      spells.addEventListener('change', () => populate(list.value, spells.value));
      kind.addEventListener('change', refreshCharges);
      populate(list.value, system.spellKey);
      refreshCharges();
    }})).render(true);
  }
  
  /**
   * Show dialog to rename item (GM only)
   */
  async _showRenameDialog() {
    const currentName = this.item.name || '';
    
    new Dialog(ospDialogOptions({
      title: `Rename Item`,
      content: `
        <form>
          <div class="form-group">
            <label>Current Name:</label>
            <input type="text" name="currentName" value="${currentName}" disabled style="width: 100%; margin-bottom: 10px;"/>
            <label>New Name:</label>
            <input type="text" name="newName" value="${currentName}" style="width: 100%;" autofocus/>
          </div>
        </form>
      `,
      buttons: {
        update: {
          icon: '<i class="fas fa-check"></i>',
          label: "Rename",
          callback: async (html) => {
            const newName = html.find('[name="newName"]').val().trim();
            if (newName && newName !== currentName) {
              try {
                await this.item.update({ name: newName });
                ui.notifications.info(`Renamed to "${newName}"`);
                // Update dialog title and re-render card
                this.options.title = `Item Card: ${newName}`;
                this.render(true);
              } catch (error) {
                console.error('Failed to rename item:', error);
                ui.notifications.error('Failed to rename item. Check console for details.');
              }
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "update"
    })).render(true);
  }
  
  /**
   * Show dialog to update image path (GM only)
   */
  async _showImagePathDialog() {
    const currentPath = this.item.img || '';
    
    const dialog = new Dialog(ospDialogOptions({
      title: `Update Image Path: ${this.item.name}`,
      content: `
        <form>
          <div class="form-group">
            <label>Current Path:</label>
            <input type="text" name="currentPath" value="${currentPath}" disabled style="width: 100%; margin-bottom: 10px;"/>
            <label>New Image Path:</label>
            <div style="display: flex; gap: 5px;">
              <input type="text" name="imagePath" value="${currentPath}" style="flex: 1;"/>
              <button type="button" class="file-picker" data-type="imagevideo" data-target="imagePath" title="Browse Files">
                <i class="fas fa-file-import fa-fw"></i>
              </button>
            </div>
            <p class="hint" style="font-size: 11px; margin-top: 5px; color: #666;">
              Enter path or click the file browser to select an image.
            </p>
          </div>
        </form>
      `,
      buttons: {
        update: {
          icon: '<i class="fas fa-check"></i>',
          label: "Update",
          callback: async (html) => {
            const newPath = html.find('[name="imagePath"]').val().trim();
            if (newPath && newPath !== currentPath) {
              try {
                await this.item.update({ img: newPath });
                ui.notifications.info(`Updated image path for ${this.item.name}`);
                // Re-render the card with new image
                this._renderCard(this.element);
              } catch (error) {
                console.error('Failed to update image path:', error);
                ui.notifications.error('Failed to update image path. Check console for details.');
              }
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "update",
      render: (html) => {
        // Activate file picker button
        const button = html.find('.file-picker');
        button.on('click', async (event) => {
          event.preventDefault();
          const input = html.find('[name="imagePath"]');
          const currentValue = input.val();
          
          // Open Foundry's FilePicker
          const fp = new FilePicker({
            type: "imagevideo",
            current: currentValue,
            callback: (path) => {
              input.val(path);
            }
          });
          
          fp.render(true);
        });
      }
    }));
    
    dialog.render(true);
  }
  
  /**
   * Render the item card onto canvas
   */
  async _renderCard(html) {
    const generation = this._cardGeneration;
    try {
      // Render card to canvas at full size. Longer descriptions may produce a taller card.
      const canvas = await this.renderer.renderCard(this.item);
      if (this._cardClosed || generation !== this._cardGeneration) return;
      this.canvas = canvas;
      
      // Scale to 50% (300px wide) for display while preserving the rendered height.
      const displayHeight = Math.round(canvas.height / 2);
      this.canvas.style.width = '300px';
      this.canvas.style.height = `${displayHeight}px`;
      
      // Insert canvas into dialog
      const container = html.find('.card-preview-container')[0];
      if (container) {
        container.innerHTML = '';
        container.appendChild(this.canvas);

        const footerHeight = ((readItemSpell(this.item) ? 1 : 0) + (this.item.name === 'Healing Potion' && this.item.type === 'item' ? 1 : 0)) * (this.item.actor?.isOwner ? 44 : 0);
        const viewportHeight = Math.max(280, (window.innerHeight || displayHeight) - 30);
        const dialogHeight = Math.min(displayHeight + footerHeight, viewportHeight);
        const cardViewportHeight = Math.max(220, dialogHeight - footerHeight);
        this.setPosition?.({ width: 300, height: dialogHeight });
        container.style.maxHeight = `${cardViewportHeight}px`;
        container.style.overflowY = displayHeight > cardViewportHeight ? 'auto' : 'visible';
        
        // Set up dragging after canvas is inserted
        this._setupDragging();
      }
    } catch (error) {
      if (this._cardClosed || generation !== this._cardGeneration) return;
      console.error('Failed to render item card:', error);
      ui.notifications.error('Failed to generate item card. Check console for details.');
    }
  }
  
  /**
   * Set up drag functionality for the card
   */
  _setupDragging() {
    if (!this.canvas) return;
    
    this._removeCardMouseDown?.();
    const canvas = this.canvas;
    const onMouseDown = (e) => {
      if (e.button === 0 && e.detail === 1) { // Left click only, single click (not double)
        e.preventDefault();
        
        // Get the window element
        const windowElement = this.element[0];
        windowElement.style.zIndex = Math.max(...Array.from(document.querySelectorAll('.window-app')).map(el => parseInt(el.style.zIndex) || 0)) + 1;
        
        this._endCardDrag?.();
        // Start drag
        const startX = e.clientX - windowElement.offsetLeft;
        const startY = e.clientY - windowElement.offsetTop;
        
        const onMouseMove = (moveEvent) => {
          windowElement.style.left = (moveEvent.clientX - startX) + 'px';
          windowElement.style.top = (moveEvent.clientY - startY) + 'px';
        };
        
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          this._endCardDrag = null;
        };
        
        this._endCardDrag = onMouseUp;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }
    };
    canvas.addEventListener('mousedown', onMouseDown);
    this._removeCardMouseDown = () => canvas.removeEventListener('mousedown', onMouseDown);
  }

  _disposeCard() {
    this._cardGeneration = (this._cardGeneration ?? 0) + 1;
    this._endCardDrag?.();
    this._removeCardMouseDown?.();
    this._removeCardMouseDown = null;
    this._cardHtml?.find('.card-preview-container').off('.ospCard');
    this._cardHtml = null;
    this.canvas = null;
  }

  async close(options) {
    this._cardClosed = true;
    this._disposeCard();
    return super.close(options);
  }
}
