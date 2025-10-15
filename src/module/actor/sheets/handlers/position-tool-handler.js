/**
 * Position Tool Handler - Provides right-click positioning adjustment for character sheet elements
 * 
 * This handler replaces the removed draggable functionality with a right-click context menu
 * that allows users to adjust field x,y coordinates and width/height dimensions.
 */
export class PositionToolHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
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
    this.html.off('contextmenu.positiontool');
  }

  /**
   * Bind right-click context menu events to positionable elements
   */
  bindContextMenuEvents() {
    // Target elements with cs-pos-* classes, cs-ability classes, cs-save-group classes, and cs-save classes for right-click positioning
    // Note: We include both .cs-save-group (parent containers) and .cs-save (individual save elements) to give users flexibility
    const positionableElements = this.html.find('[class*="cs-pos-"], .cs-ability, .cs-save-group, .cs-save');
    
    positionableElements.on('contextmenu.positiontool', (event) => {
      // Check if this user has permission to use positioning tool
      const sheet = this.html.closest('.sheet');
      const isGM = game?.user?.isGM;
      const isOwner = this.actor?.isOwner;
      const hasEditableClass = sheet.hasClass('editable');
      
      // Allow positioning tool if user is GM, actor owner, or in development mode
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
      <div class="cs-position-dialog" style="padding: 10px;">
        <style>
          .cs-position-dialog .form-group { margin: 8px 0; display: flex; align-items: center; }
          .cs-position-dialog label { min-width: 80px; margin-right: 8px; }
          .cs-position-dialog input[type="number"] { width: 80px; margin-right: 5px; }
          .cs-position-dialog .unit { margin-right: 10px; color: #666; }
          .cs-size-controls { display: flex; gap: 3px; margin-left: 10px; }
          .cs-size-btn { width: 22px; height: 22px; font-size: 14px; padding: 0; margin: 0; border: 1px solid #ccc; background: #f8f8f8; cursor: pointer; }
          .cs-size-btn:hover { background: #e8e8e8; }
          .cs-movement-section { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
          .cs-movement-title { font-weight: bold; margin-bottom: 8px; text-align: center; }
          .cs-arrow-grid { display: grid; grid-template-columns: 30px 30px 30px; grid-template-rows: 30px 30px 30px; gap: 2px; justify-content: center; }
          .cs-arrow-btn { width: 28px; height: 28px; font-size: 14px; padding: 0; margin: 0; border: 1px solid #666; background: #f0f0f0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
          .cs-arrow-btn:hover { background: #e0e0e0; }
          .cs-arrow-up { grid-column: 2; grid-row: 1; }
          .cs-arrow-left { grid-column: 1; grid-row: 2; }
          .cs-arrow-right { grid-column: 3; grid-row: 2; }
          .cs-arrow-down { grid-column: 2; grid-row: 3; }
          .cs-keyboard-hint { margin-top: 8px; font-size: 11px; color: #888; font-style: italic; }
          .cs-keyboard-shortcuts { margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; border: 1px solid #ddd; }
          .cs-keyboard-title { font-weight: bold; color: #555; margin-bottom: 6px; }
          .cs-shortcut-list { font-size: 12px; }
          .cs-shortcut-list div { margin: 2px 0; }
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
          
          <div class="cs-movement-section">
            <div class="cs-movement-title">Movement Controls (1px)</div>
            <div class="cs-arrow-grid">
              <button type="button" class="cs-arrow-btn cs-arrow-up" data-direction="up" title="Move Up (Arrow Keys)">↑</button>
              <button type="button" class="cs-arrow-btn cs-arrow-left" data-direction="left" title="Move Left (Arrow Keys)">←</button>
              <button type="button" class="cs-arrow-btn cs-arrow-right" data-direction="right" title="Move Right (Arrow Keys)">→</button>
              <button type="button" class="cs-arrow-btn cs-arrow-down" data-direction="down" title="Move Down (Arrow Keys)">↓</button>
            </div>
            <div class="cs-keyboard-hint">💡 Use Arrow Keys for positioning</div>
          </div>
          
          <div class="form-group">
            <label for="pos-width">Width:</label>
            <input type="number" id="pos-width" name="width" value="${positionData.width}" step="1" min="10">
            <span class="unit">px</span>
            <div class="cs-size-controls">
              <button type="button" class="cs-size-btn" data-dimension="width" data-change="-1" title="Decrease Width (- key)">−</button>
              <button type="button" class="cs-size-btn" data-dimension="width" data-change="1" title="Increase Width (+ key)">+</button>
            </div>
          </div>
          
          <div class="form-group">
            <label for="pos-height">Height:</label>
            <input type="number" id="pos-height" name="height" value="${positionData.height}" step="1" min="10">
            <span class="unit">px</span>
            <div class="cs-size-controls">
              <button type="button" class="cs-size-btn" data-dimension="height" data-change="-1" title="Decrease Height ([ key)">−</button>
              <button type="button" class="cs-size-btn" data-dimension="height" data-change="1" title="Increase Height (] key)">+</button>
            </div>
          </div>
          
          <div class="cs-keyboard-shortcuts">
            <div class="cs-keyboard-title">Keyboard Shortcuts:</div>
            <div class="cs-shortcut-list">
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
      title: `Position Tool - ${positionData.name}`,
      content: content,
      buttons: {
        apply: {
          icon: '<i class="fas fa-check"></i>',
          label: "Apply Changes",
          callback: (html) => this.applyChanges(html, positionData)
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
      cssClass: positionData.cssClass, // Include the cssClass from original positionData
      left: parseInt(formData.get('left')),
      top: parseInt(formData.get('top')),
      width: parseInt(formData.get('width')),
      height: parseInt(formData.get('height'))
    };

    this.updateElementPosition(positionData.element, newData);
    ui.notifications.info(`Position updated for ${positionData.name}`);
  }

  /**
   * Reset element to default position values
   */
  resetToDefault(positionData) {
    // Remove custom CSS properties to revert to defaults
    const root = document.documentElement;
    root.style.removeProperty(`--cs-pos-${positionData.name}-left`);
    root.style.removeProperty(`--cs-pos-${positionData.name}-top`);
    root.style.removeProperty(`--cs-pos-${positionData.name}-width`);
    root.style.removeProperty(`--cs-pos-${positionData.name}-height`);

    ui.notifications.info(`Reset ${positionData.name} to default position`);
  }

  /**
   * Get current position and size data for an element
   */
  getElementPositionData(element) {
    const computedStyle = window.getComputedStyle(element[0]);
    const classList = element[0].className;
    
    // Extract position class name - check cs-pos-* first, then fallback to other types
    let positionName = 'unknown';
    let cssClass = '';
    
    const posMatch = classList.match(/cs-pos-(\w+)/);
    if (posMatch) {
      positionName = posMatch[1];
      cssClass = `cs-pos-${positionName}`;
    } else if (classList.includes('cs-ability')) {
      // For ability scores, check child select element for the attribute type
      const selectElement = element.find('select[class*="attr-"]');
      if (selectElement.length > 0) {
        const selectClasses = selectElement[0].className;
        const attrMatch = selectClasses.match(/attr-(\w+)/);
        positionName = attrMatch ? `ability-${attrMatch[1]}` : 'ability-unknown';
      } else {
        positionName = 'ability-unknown';
      }
      cssClass = 'cs-ability';
    } else if (classList.includes('cs-save-group')) {
      // For saving throws, target the save group container and extract save type
      const saveGroupMatch = classList.match(/save-group-(\w+)/);
      positionName = saveGroupMatch ? `save-${saveGroupMatch[1]}` : 'save-unknown';
      cssClass = 'cs-save-group';
    } else if (classList.includes('cs-save')) {
      // For direct save elements, extract save type from class names
      const saveMatch = classList.match(/(\w+)-save/);
      positionName = saveMatch ? `save-${saveMatch[1]}` : 'save-unknown';
      cssClass = 'cs-save';
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

    const root = document.documentElement;
    
    // Safety check for cssClass
    if (!newData.cssClass) {
      console.warn('PositionToolHandler: cssClass is missing from newData, using fallback detection');
      // Fallback: detect from element classes
      const classList = element[0].className;
      if (classList.includes('cs-pos-')) {
        const posMatch = classList.match(/cs-pos-(\w+)/);
        newData.cssClass = posMatch ? `cs-pos-${posMatch[1]}` : 'cs-pos-unknown';
      } else if (classList.includes('cs-ability')) {
        newData.cssClass = 'cs-ability';
      } else if (classList.includes('cs-save')) {
        newData.cssClass = 'cs-save';
      } else {
        newData.cssClass = 'unknown';
      }
    }
    
    // Get element's current computed and inline styles for debugging
    const computedBefore = window.getComputedStyle(element[0]);
    const inlineBefore = {
      left: element[0].style.left,
      top: element[0].style.top,
      width: element[0].style.width,
      height: element[0].style.height,
      position: element[0].style.position
    };
    
    
    // For ALL elements (cs-pos, cs-ability, cs-save), set CSS custom properties directly on the element
    // When cs-abs class is added, ALL elements use var(--left), var(--top), var(--width), var(--height)
    
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
    
    // Ensure element has cs-abs class for positioning (if not already present)
    if (!element[0].classList.contains('cs-abs')) {
      element[0].classList.add('cs-abs');
    }
    
    // Check if CSS custom properties are actually set
    const setProps = {
      left: element[0].style.getPropertyValue('--left'),
      top: element[0].style.getPropertyValue('--top'), 
      width: element[0].style.getPropertyValue('--width'),
      height: element[0].style.getPropertyValue('--height')
    };
    
    // Legacy fallback for elements that might need direct styles as well
    if (newData.cssClass === 'cs-ability' || newData.cssClass === 'cs-save' || newData.cssClass === 'cs-save-group') {
      
      // For cs-ability, cs-save, and cs-save-group elements, also apply direct styles as backup
      const elementStyle = element[0].style;
      
      if (newData.left !== undefined) {
        elementStyle.left = `${newData.left}px`;
      }
      
      if (newData.top !== undefined) {
        elementStyle.top = `${newData.top}px`;
      }
      
      if (newData.width !== undefined) {
        elementStyle.width = `${newData.width}px`;
      }
      
      if (newData.height !== undefined) {
        elementStyle.height = `${newData.height}px`;
      }
      
      // Ensure the element has absolute positioning as backup
      if (!elementStyle.position || elementStyle.position === 'static') {
        elementStyle.position = 'absolute';
      }
    }

    // Force a reflow to apply changes immediately
    element[0].offsetHeight;
    
    // Check styles AFTER update
    const computedAfter = window.getComputedStyle(element[0]);
    const inlineAfter = {
      left: element[0].style.left,
      top: element[0].style.top,
      width: element[0].style.width,
      height: element[0].style.height,
      position: element[0].style.position
    };
    

  }

  /**
   * Add a visual border guide to the element
   */
  addBorderGuide(element) {
    // Remove any existing border guide first
    this.removeBorderGuide();
    
    // Store reference to the element for later removal
    this.currentGuideElement = element;
    
    // Store the original border style (handle both inline and computed styles)
    const computedStyle = window.getComputedStyle(element[0]);
    this.originalBorderStyle = element[0].style.border || '';
    this.originalBorderColor = element[0].style.borderColor || computedStyle.borderColor || '';
    this.originalBorderWidth = element[0].style.borderWidth || computedStyle.borderWidth || '';
    this.originalBorderStyle = element[0].style.borderStyle || computedStyle.borderStyle || '';
    
    // Apply the dashed red border with 0.5px width and higher specificity
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
  }

  /**
   * Setup event handlers for dialog controls (arrow buttons, size buttons, keyboard shortcuts)
   */
  setupDialogEventHandlers(html, positionData) {
    
    // Debug: Check if buttons exist
    const arrowButtons = html.find('.cs-arrow-btn');
    const sizeButtons = html.find('.cs-size-btn');
    sizeButtons.each((index, button) => {
    });
    
    // Arrow button handlers with debugging
    html.find('.cs-arrow-btn').on('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      const direction = $(event.currentTarget).data('direction');
      
      this.handleArrowClick(direction, html, positionData);
    });

    // Size button handlers with debugging
    html.find('.cs-size-btn').on('click', (event) => {
      
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
    
    // Make the dialog focusable and focus it
    const dialogElement = html.closest('.dialog');
    if (dialogElement.length > 0) {
      dialogElement.attr('tabindex', '0');
      dialogElement.focus();
      
      // Keyboard event handler
      this.keydownHandler = (event) => {
        // Only handle if this dialog is active/focused
        if (!$(event.target).closest('.dialog')[0] === dialogElement[0]) return;
        
        
        let handled = false;
        
        switch (event.key) {
          // Arrow keys for position
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
            
          // Plus/minus for size adjustment
          case '+':
          case '=': // = key without shift is often used for +
            if (event.shiftKey) {
              // Shift + = gives us the actual + character
              this.handleSizeClick('width', 1, html, positionData);
            } else {
              // Regular = key also increases width for convenience
              this.handleSizeClick('width', 1, html, positionData);
            }
            handled = true;
            break;
          case '-':
            this.handleSizeClick('width', -1, html, positionData);
            handled = true;
            break;
            
          // Bracket keys for height adjustment
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
      
      // Attach the keyboard handler
      dialogElement.on('keydown', this.keydownHandler);
      
    } else {
      console.warn('PositionToolHandler: Could not find dialog element for keyboard shortcuts');
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
      default:
        console.warn(`Unknown direction: ${direction}`);
        return;
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