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
