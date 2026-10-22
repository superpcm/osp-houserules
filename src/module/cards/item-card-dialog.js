/**
 * Dialog for displaying rendered item cards
 * Shows card preview with download button
 */

import { ItemCardRenderer } from './item-card-renderer.js';
import { castSpellItem } from '../spells/spellcasting-ui.js';
import { readItemSpell } from '../spells/item-spell.js';
import { ospDialogOptions } from '../dialog/dialog-theme.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

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
    
    // Close dialog when double-clicking the card
    this._cardHtml = html;
    html.find('.card-preview-container').off('.ospCard').on('dblclick.ospCard', () => this.close());
    
    // Right-click on card to show GM options
    html.find('.card-preview-container').on('contextmenu.ospCard', (e) => {
      e.preventDefault();
      if (game.user.isGM) {
        this._showGMContextMenu(e);
      }
    });
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
    
    new ContextMenu($(event.currentTarget), ".card-preview-container", items);
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
    const content = `<form class="osp-item-spell-config"><label>Spell list <select name="spellClass">${listOptions}</select></label><label>Spell <select name="spellKey">${spellOptions}</select></label><label><input type="checkbox" name="spellReversed"${system.spellReversed ? ' checked' : ''}> Reversed form</label><label>Item type <select name="spellSourceKind"><option value="item">Magic item</option><option value="scroll">Scroll</option><option value="wand">Wand</option><option value="staff">Staff</option></select></label><label>Charges / uses <input type="number" name="charges" min="0" step="1" value="${Number(system.charges ?? 0)}"></label><label>Allowed classes (optional) <input type="text" name="spellAllowedClasses" value="${esc(allowedClasses)}" placeholder="Magic-User, Cleric"></label></form>`;
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
          'system.charges': Number(root.querySelector('[name="charges"]').value) || 0,
          'system.spellAllowedClasses': root.querySelector('[name="spellAllowedClasses"]').value.split(',').map(value => value.trim()).filter(Boolean)
        };
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
      populate(list.value, system.spellKey);
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

        const footerHeight = readItemSpell(this.item) && this.item.actor?.isOwner ? 44 : 0;
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
