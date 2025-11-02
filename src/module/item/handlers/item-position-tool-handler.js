/**
 * Item Position Tool Handler - Provides right-click positioning adjustment for item sheet elements
 * 
 * This handler allows users to adjust field x,y coordinates and width/height dimensions
 * on item, weapon, armor, and container sheets.
 */
export class ItemPositionToolHandler {
  constructor(html, item) {
    this.html = html;
    this.item = item;
    this.positionDialog = null;
  }

  /**
   * Initialize the position tool handler
   */
  initialize() {
    this.bindContextMenuEvents();
  }

  /**
   * Clean up event listeners and dialogs
   */
  destroy() {
    if (this.positionDialog) {
      this.positionDialog.close();
      this.positionDialog = null;
    }
    
    // Clean up keyboard handler if it exists
    if (this.keydownHandler) {
      const dialogElement = $('.dialog').filter(':visible').last();
      if (dialogElement.length > 0) {
        dialogElement.off('keydown', this.keydownHandler);
      }
      this.keydownHandler = null;
    }
    
    // Remove all contextmenu listeners we added
    this.html.off('contextmenu.itempositiontool');
  }

  /**
   * Bind right-click context menu events to positionable elements
   */
  bindContextMenuEvents() {
    // Target elements with is-pos-* classes for right-click positioning
    const positionableElements = this.html.find('[class*="is-pos-"]');
    
    positionableElements.on('contextmenu.itempositiontool', (event) => {
      // Check if this user has permission to use positioning tool
      const sheet = this.html.closest('.sheet');
      const isGM = game?.user?.isGM;
      const isOwner = this.item?.isOwner;
      const hasEditableClass = sheet.hasClass('editable');
      
      // Allow positioning tool if user is GM, item owner, or in development mode
      const canEditPositions = isGM || isOwner || hasEditableClass || game?.settings?.get('core', 'noCanvas') === true;
      
      if (!canEditPositions) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      
      const element = $(event.currentTarget);
      this.showPositionDialog(element, event);
    });
  }

  /**
   * Show the position adjustment dialog
   */
  async showPositionDialog(element, event) {
    // Close any existing dialog
    if (this.positionDialog) {
      this.positionDialog.close();
    }

    // Add visual border guide to the element
    this.addBorderGuide(element);

    // Get element position and size information
    const positionData = this.getElementPositionData(element);
    
    // Create dialog content with arrow controls and size buttons
    const content = `
      <div class="is-position-dialog" style="padding: 10px;">
        <style>
          .is-position-dialog .form-group { margin: 8px 0; display: flex; align-items: center; }
          .is-position-dialog label { min-width: 80px; margin-right: 8px; }
          .is-position-dialog input[type="number"] { width: 80px; margin-right: 5px; }
          .is-position-dialog .unit { margin-right: 10px; color: #666; }
          .is-size-controls { display: flex; gap: 3px; margin-left: 10px; }
          .is-size-btn { width: 22px; height: 22px; font-size: 14px; padding: 0; margin: 0; border: 1px solid #ccc; background: #f8f8f8; cursor: pointer; }
          .is-size-btn:hover { background: #e8e8e8; }
          .is-movement-section { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
          .is-movement-title { font-weight: bold; margin-bottom: 8px; text-align: center; }
          .is-arrow-grid { display: grid; grid-template-columns: 30px 30px 30px; grid-template-rows: 30px 30px 30px; gap: 2px; justify-content: center; }
          .is-arrow-btn { width: 28px; height: 28px; font-size: 14px; padding: 0; margin: 0; border: 1px solid #666; background: #f0f0f0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
          .is-arrow-btn:hover { background: #e0e0e0; }
          .is-arrow-up { grid-column: 2; grid-row: 1; }
          .is-arrow-left { grid-column: 1; grid-row: 2; }
          .is-arrow-right { grid-column: 3; grid-row: 2; }
          .is-arrow-down { grid-column: 2; grid-row: 3; }
          .is-keyboard-hint { margin-top: 8px; font-size: 11px; color: #888; font-style: italic; }
          .is-keyboard-shortcuts { margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; border: 1px solid #ddd; }
          .is-keyboard-title { font-weight: bold; color: #555; margin-bottom: 6px; }
          .is-shortcut-list { font-size: 12px; }
          .is-shortcut-list div { margin: 2px 0; }
        </style>
        
        <h3>Adjust Position: ${positionData.name}</h3>
        <form>
          <div class="form-group">
            <label for="pos-left">X Position:</label>
            <input type="number" id="pos-left" name="left" value="${positionData.left}" step="1">
            <span class="unit">px</span>
          </div>
          
          <div class="form-group">
            <label for="pos-top">Y Position:</label>
            <input type="number" id="pos-top" name="top" value="${positionData.top}" step="1">
            <span class="unit">px</span>
          </div>
          
          <div class="is-movement-section">
            <div class="is-movement-title">Movement Controls (1px)</div>
            <div class="is-arrow-grid">
              <button type="button" class="is-arrow-btn is-arrow-up" data-direction="up" title="Move Up (Arrow Keys)">↑</button>
              <button type="button" class="is-arrow-btn is-arrow-left" data-direction="left" title="Move Left (Arrow Keys)">←</button>
              <button type="button" class="is-arrow-btn is-arrow-right" data-direction="right" title="Move Right (Arrow Keys)">→</button>
              <button type="button" class="is-arrow-btn is-arrow-down" data-direction="down" title="Move Down (Arrow Keys)">↓</button>
            </div>
            <div class="is-keyboard-hint">💡 Use Arrow Keys for positioning</div>
          </div>
          
          <div class="form-group">
            <label for="pos-width">Width:</label>
            <input type="number" id="pos-width" name="width" value="${positionData.width}" step="1" min="10">
            <span class="unit">px</span>
            <div class="is-size-controls">
              <button type="button" class="is-size-btn" data-dimension="width" data-change="-1" title="Decrease Width (- key)">−</button>
              <button type="button" class="is-size-btn" data-dimension="width" data-change="1" title="Increase Width (+ key)">+</button>
            </div>
          </div>
          
          <div class="form-group">
            <label for="pos-height">Height:</label>
            <input type="number" id="pos-height" name="height" value="${positionData.height}" step="1" min="10">
            <span class="unit">px</span>
            <div class="is-size-controls">
              <button type="button" class="is-size-btn" data-dimension="height" data-change="-1" title="Decrease Height ([ key)">−</button>
              <button type="button" class="is-size-btn" data-dimension="height" data-change="1" title="Increase Height (] key)">+</button>
            </div>
          </div>
          
          <div class="is-keyboard-shortcuts">
            <div class="is-keyboard-title">Keyboard Shortcuts:</div>
            <div class="is-shortcut-list">
              <div>🎯 <strong>Arrow Keys:</strong> Move position</div>
              <div>📏 <strong>+ / -:</strong> Adjust width</div>
              <div>📐 <strong>[ / ]:</strong> Adjust height</div>
            </div>
          </div>
        </form>
      </div>
    `;

    // Create and show the dialog using Foundry's Dialog class
    this.positionDialog = new Dialog({
      title: `Item Position Tool - ${positionData.name}`,
      content: content,
      buttons: {
        apply: {
          icon: '<i class="fas fa-check"></i>',
          label: "Apply Changes",
          callback: (html) => this.applyChanges(html, positionData)
        },
        saveToCSS: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save to CSS",
          callback: (html) => this.saveToCSSFile(html, positionData)
        },
        reset: {
          icon: '<i class="fas fa-undo"></i>',
          label: "Reset to Default",
          callback: (html) => this.resetToDefault(positionData)
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => {}
        }
      },
      default: "apply",
      close: () => {
        this.removeBorderGuide();
        // Clean up keyboard handler if it exists
        if (this.keydownHandler) {
          const dialogElement = $('.dialog').filter(':visible').last();
          if (dialogElement.length > 0) {
            dialogElement.off('keydown', this.keydownHandler);
          }
          this.keydownHandler = null;
        }
        this.positionDialog = null;
      },
      render: (html) => {
        this.setupDialogEventHandlers(html, positionData);
      }
    });

    this.positionDialog.render(true);
  }

  /**
   * Apply position changes from the dialog
   */
  applyChanges(html, positionData) {
    const formData = new FormData(html.find('form')[0]);
    const newData = {
      name: positionData.name,
      cssClass: positionData.cssClass,
      left: parseInt(formData.get('left')),
      top: parseInt(formData.get('top')),
      width: parseInt(formData.get('width')),
      height: parseInt(formData.get('height'))
    };

    this.updateElementPosition(positionData.element, newData);
    ui.notifications.info(`Position updated for ${positionData.name}`);
  }

  /**
   * Save position values directly to the CSS file
   */
  async saveToCSSFile(html, positionData) {
    const formData = new FormData(html.find('form')[0]);
    const left = parseInt(formData.get('left'));
    const top = parseInt(formData.get('top'));
    const width = parseInt(formData.get('width'));
    const height = parseInt(formData.get('height'));

    // Build the CSS selector based on the element's class
    const selector = `.osp.sheet.item .${positionData.cssClass}`;
    
    // Build the CSS rule
    const cssRule = `  position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px;`;
    
    // Show instructions to the user
    const message = `
      <div style="font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 4px; margin: 10px 0;">
        <strong>Add this to equipment.scss:</strong><br><br>
        ${selector} {<br>
        &nbsp;&nbsp;${cssRule}<br>
        }
      </div>
      <p style="margin-top: 10px;">Copy this CSS rule and paste it into:<br>
      <code>src/styles/equipment.scss</code><br>
      Replace the placeholder rule for <strong>${positionData.name}</strong>, then run <code>npm run build</code>.</p>
    `;

    // Create a dialog to show the CSS rule
    new Dialog({
      title: "CSS Rule Generated",
      content: message,
      buttons: {
        copy: {
          icon: '<i class="fas fa-copy"></i>',
          label: "Copy to Clipboard",
          callback: () => {
            const cssText = `${selector} {\n  ${cssRule}\n}`;
            navigator.clipboard.writeText(cssText).then(() => {
              ui.notifications.info("CSS rule copied to clipboard!");
            }).catch(err => {
              ui.notifications.error("Failed to copy to clipboard");
              console.error(err);
            });
          }
        },
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: "Close"
        }
      },
      default: "copy"
    }).render(true);

    // Also apply the changes immediately for preview
    const newData = {
      name: positionData.name,
      cssClass: positionData.cssClass,
      left: left,
      top: top,
      width: width,
      height: height
    };
    this.updateElementPosition(positionData.element, newData);
  }

  /**
   * Reset element to default position values
   */
  resetToDefault(positionData) {
    // Remove custom CSS properties to revert to defaults
    const element = positionData.element[0];
    element.style.removeProperty('--left');
    element.style.removeProperty('--top');
    element.style.removeProperty('--width');
    element.style.removeProperty('--height');
    element.classList.remove('is-abs');

    ui.notifications.info(`Reset ${positionData.name} to default position`);
  }

  /**
   * Get current position and size data for an element
   */
  getElementPositionData(element) {
    const computedStyle = window.getComputedStyle(element[0]);
    const classList = element[0].className;
    
    // Extract position class name
    let positionName = 'unknown';
    let cssClass = '';
    
    const posMatch = classList.match(/is-pos-(\S+)/);
    if (posMatch) {
      positionName = posMatch[1];
      cssClass = `is-pos-${positionName}`;
    }
    
    // Get current CSS custom properties or computed values
    const currentLeft = this.extractPixelValue(computedStyle.left) || 0;
    const currentTop = this.extractPixelValue(computedStyle.top) || 0;
    const currentWidth = this.extractPixelValue(computedStyle.width) || 100;
    const currentHeight = this.extractPixelValue(computedStyle.height) || 20;

    return {
      name: positionName,
      element: element,
      left: currentLeft,
      top: currentTop,
      width: currentWidth,
      height: currentHeight,
      cssClass: cssClass
    };
  }

  /**
   * Extract numeric pixel value from CSS property string
   */
  extractPixelValue(cssValue) {
    if (!cssValue || cssValue === 'auto') return null;
    const match = cssValue.match(/^(-?\d*\.?\d+)px$/);
    return match ? parseFloat(match[1]) : null;
  }

  /**
   * Update element position with new values
   */
  updateElementPosition(element, newData) {
    // Safety check for cssClass
    if (!newData.cssClass) {
      console.warn('ItemPositionToolHandler: cssClass is missing from newData, using fallback detection');
      const classList = element[0].className;
      const posMatch = classList.match(/is-pos-(\S+)/);
      newData.cssClass = posMatch ? `is-pos-${posMatch[1]}` : 'is-pos-unknown';
    }
    
    // Set CSS custom properties directly on the element
    if (newData.left !== undefined) {
      element[0].style.setProperty('--left', `${newData.left}px`);
    }
    
    if (newData.top !== undefined) {
      element[0].style.setProperty('--top', `${newData.top}px`);
    }
    
    if (newData.width !== undefined) {
      element[0].style.setProperty('--width', `${newData.width}px`);
    }
    
    if (newData.height !== undefined) {
      element[0].style.setProperty('--height', `${newData.height}px`);
    }
    
    // Ensure element has is-abs class for positioning
    if (!element[0].classList.contains('is-abs')) {
      element[0].classList.add('is-abs');
    }

    // Force a reflow to apply changes immediately
    element[0].offsetHeight;
  }

  /**
   * Add a visual border guide to the element
   */
  addBorderGuide(element) {
    // Remove any existing border guide first
    this.removeBorderGuide();
    
    // Store reference to the element for later removal
    this.currentGuideElement = element;
    
    // Store the original border style
    const computedStyle = window.getComputedStyle(element[0]);
    this.originalBorderStyle = element[0].style.border || '';
    this.originalBorderColor = element[0].style.borderColor || computedStyle.borderColor || '';
    this.originalBorderWidth = element[0].style.borderWidth || computedStyle.borderWidth || '';
    this.originalBorderStyleType = element[0].style.borderStyle || computedStyle.borderStyle || '';
    
    // Apply the dashed red border
    element[0].style.setProperty('border', '0.5px dashed red', 'important');
    element[0].style.setProperty('box-shadow', '0 0 0 1px rgba(255, 0, 0, 0.3)', 'important');
  }

  /**
   * Remove the visual border guide from the element
   */
  removeBorderGuide() {
    if (this.currentGuideElement) {
      // Remove the positioning guide styles
      this.currentGuideElement[0].style.removeProperty('border');
      this.currentGuideElement[0].style.removeProperty('box-shadow');
      
      // Restore original border if it existed
      if (this.originalBorderStyle) {
        this.currentGuideElement[0].style.border = this.originalBorderStyle;
      }
    }
    
    // Clean up references
    this.currentGuideElement = null;
    this.originalBorderStyle = '';
    this.originalBorderColor = '';
    this.originalBorderWidth = '';
    this.originalBorderStyleType = '';
  }

  /**
   * Setup event handlers for dialog controls
   */
  setupDialogEventHandlers(html, positionData) {
    // Arrow button handlers
    html.find('.is-arrow-btn').on('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      const direction = $(event.currentTarget).data('direction');
      this.handleArrowClick(direction, html, positionData);
    });

    // Size button handlers
    html.find('.is-size-btn').on('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      const dimension = $(event.currentTarget).data('dimension');
      const change = parseInt($(event.currentTarget).data('change'));
      this.handleSizeClick(dimension, change, html, positionData);
    });
    
    // Add keyboard shortcuts support
    this.setupKeyboardShortcuts(html, positionData);
  }

  /**
   * Setup keyboard shortcuts for the positioning dialog
   */
  setupKeyboardShortcuts(html, positionData) {
    const dialogElement = html.closest('.dialog');
    if (dialogElement.length > 0) {
      dialogElement.attr('tabindex', '0');
      dialogElement.focus();
      
      this.keydownHandler = (event) => {
        if (!$(event.target).closest('.dialog')[0] === dialogElement[0]) return;
        
        let handled = false;
        
        switch (event.key) {
          case 'ArrowUp':
            this.handleArrowClick('up', html, positionData);
            handled = true;
            break;
          case 'ArrowDown':
            this.handleArrowClick('down', html, positionData);
            handled = true;
            break;
          case 'ArrowLeft':
            this.handleArrowClick('left', html, positionData);
            handled = true;
            break;
          case 'ArrowRight':
            this.handleArrowClick('right', html, positionData);
            handled = true;
            break;
          case '+':
          case '=':
            this.handleSizeClick('width', 1, html, positionData);
            handled = true;
            break;
          case '-':
            this.handleSizeClick('width', -1, html, positionData);
            handled = true;
            break;
          case '[':
            this.handleSizeClick('height', -1, html, positionData);
            handled = true;
            break;
          case ']':
            this.handleSizeClick('height', 1, html, positionData);
            handled = true;
            break;
        }
        
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      
      dialogElement.on('keydown', this.keydownHandler);
    }
  }

  /**
   * Handle arrow button clicks for 1px position adjustments
   */
  handleArrowClick(direction, html, positionData) {
    const leftInput = html.find('#pos-left');
    const topInput = html.find('#pos-top');
    
    let currentLeft = parseInt(leftInput.val()) || 0;
    let currentTop = parseInt(topInput.val()) || 0;

    switch (direction) {
      case 'up':
        currentTop -= 1;
        topInput.val(currentTop);
        break;
      case 'down':
        currentTop += 1;
        topInput.val(currentTop);
        break;
      case 'left':
        currentLeft -= 1;
        leftInput.val(currentLeft);
        break;
      case 'right':
        currentLeft += 1;
        leftInput.val(currentLeft);
        break;
    }

    // Apply changes immediately for live preview
    const newData = {
      name: positionData.name,
      cssClass: positionData.cssClass,
      left: currentLeft,
      top: currentTop,
      width: parseInt(html.find('#pos-width').val()) || positionData.width,
      height: parseInt(html.find('#pos-height').val()) || positionData.height
    };

    this.updateElementPosition(positionData.element, newData);
  }

  /**
   * Handle size button clicks for 1px width/height adjustments
   */
  handleSizeClick(dimension, change, html, positionData) {
    const input = html.find(`#pos-${dimension}`);
    let currentValue = parseInt(input.val()) || (dimension === 'width' ? positionData.width : positionData.height);
    
    currentValue += change;
    
    // Ensure minimum size
    if (currentValue < 10) {
      currentValue = 10;
    }
    
    input.val(currentValue);

    // Apply changes immediately for live preview
    const newData = {
      name: positionData.name,
      cssClass: positionData.cssClass,
      left: parseInt(html.find('#pos-left').val()) || positionData.left,
      top: parseInt(html.find('#pos-top').val()) || positionData.top,
      width: parseInt(html.find('#pos-width').val()) || positionData.width,
      height: parseInt(html.find('#pos-height').val()) || positionData.height
    };

    this.updateElementPosition(positionData.element, newData);
  }
}
