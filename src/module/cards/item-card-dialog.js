/**
 * Dialog for displaying rendered item cards
 * Shows card preview with download button
 */

import { ItemCardRenderer } from './item-card-renderer.js';

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
    super.activateListeners(html);
    
    // Render card when dialog opens
    this._renderCard(html);
    
    // Close dialog when double-clicking the card
    html.find('.card-preview-container').dblclick(() => this.close());
    
    // Right-click on card to show GM options
    html.find('.card-preview-container').on('contextmenu', (e) => {
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
      }
    ];
    
    new ContextMenu($(event.currentTarget), ".card-preview-container", items);
  }
  
  /**
   * Show dialog to rename item (GM only)
   */
  async _showRenameDialog() {
    const currentName = this.item.name || '';
    
    new Dialog({
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
    }).render(true);
  }
  
  /**
   * Show dialog to update image path (GM only)
   */
  async _showImagePathDialog() {
    const currentPath = this.item.img || '';
    
    const dialog = new Dialog({
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
    });
    
    dialog.render(true);
  }
  
  /**
   * Render the item card onto canvas
   */
  async _renderCard(html) {
    try {
      // Render card to canvas at full size (600x900)
      this.canvas = await this.renderer.renderCard(this.item);
      
      // Scale to 50% (300x450) for display
      this.canvas.style.width = '300px';
      this.canvas.style.height = '450px';
      
      // Insert canvas into dialog
      const container = html.find('.card-preview-container')[0];
      if (container) {
        container.innerHTML = '';
        container.appendChild(this.canvas);
        
        // Set up dragging after canvas is inserted
        this._setupDragging();
      }
    } catch (error) {
      console.error('Failed to render item card:', error);
      ui.notifications.error('Failed to generate item card. Check console for details.');
    }
  }
  
  /**
   * Set up drag functionality for the card
   */
  _setupDragging() {
    if (!this.canvas) return;
    
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && e.detail === 1) { // Left click only, single click (not double)
        e.preventDefault();
        
        // Get the window element
        const windowElement = this.element[0];
        windowElement.style.zIndex = Math.max(...Array.from(document.querySelectorAll('.window-app')).map(el => parseInt(el.style.zIndex) || 0)) + 1;
        
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
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }
    });
  }
}
