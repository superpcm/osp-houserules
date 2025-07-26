/**
 * LayoutHandler - Manages draggable fields and layout export/import
 */
export class LayoutHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.isDragging = false;
    this.currentDragElement = null;
    this.snapToGrid = false;
    this.gridSize = 10;
    this.gridOverlay = null;

    // Store original positions for reset functionality
    this.originalPositions = new Map();
    
    // Flag to prevent loading during manual operations
    this.preventLoad = false;
    
    // Timestamp of last manual save to prevent conflicts
    this.lastManualSave = 0;
  }

  /**
   * Initialize the layout handler
   */
  initialize() {
    this.makeFieldsDraggable();
    this.addLayoutControls();
    this.loadSavedLayout();
  }

  /**
   * Make form fields draggable
   */
  makeFieldsDraggable() {
    // Target individual draggable elements in all tabs AND static header
    const draggableSelectors = [
      '.character-image-container',
      '.character-name-section',
      '.xp-progress-section', // XP progress bar section
      '.char-field-group', // Individual fields only, not their parent containers
      '.ability-scores',
      '.saving-throws',
      '.character-stats'
    ];

    // Apply to all tabs AND the static header
    const allContainers = this.html.find('.tab, .static-header');
    
    draggableSelectors.forEach(selector => {
      const elements = allContainers.find(selector);
      elements.each((index, element) => {
        const $element = $(element);
        this.makeDraggable($element);
      });
    });
  }

  /**
   * Make a single element draggable
   */
  makeDraggable($element) {
    $element.addClass('draggable-field');
    $element.css({
      'position': 'relative',
      'cursor': 'move',
      'user-select': 'none'
    });

    // Add extra padding to char-field-group elements to create more clickable area
    if ($element.hasClass('char-field-group')) {
      $element.css({
        'padding': '4px 8px',
        'margin': '2px',
        'border': '1px solid transparent',
        'border-radius': '3px'
      });
      
      // Add hover effect to show draggable area
      $element.off('mouseenter.fieldgroup mouseleave.fieldgroup')
        .on('mouseenter.fieldgroup', function() {
          $(this).css('border-color', '#ddd');
        })
        .on('mouseleave.fieldgroup', function() {
          if (!$(this).hasClass('dragging')) {
            $(this).css('border-color', 'transparent');
          }
        });
    }

    // Add drag handles (optional visual indicator) with better positioning
    if (!$element.find('.drag-handle').length) {
      const dragHandle = $('<div class="drag-handle" title="Drag to move">⋮⋮</div>');
      
      // Better positioning for drag handles
      const isCharNameSection = $element.hasClass('character-name-section');
      const isXPSection = $element.hasClass('xp-progress-section');
      const isCharFieldGroup = $element.hasClass('char-field-group');
      
      dragHandle.css({
        'position': 'absolute',
        'top': isCharNameSection || isXPSection ? '5px' : (isCharFieldGroup ? '-2px' : '2px'),
        'right': isCharNameSection || isXPSection ? '5px' : (isCharFieldGroup ? '-2px' : '2px'),
        'font-size': '12px',
        'color': '#666',
        'cursor': 'move',
        'opacity': '0.6',
        'z-index': '10',
        'pointer-events': 'auto',
        'font-weight': 'bold',
        'text-shadow': '1px 1px 1px rgba(255,255,255,0.8)',
        'background': 'rgba(255,255,255,0.9)',
        'border': '1px solid #ccc',
        'border-radius': '2px',
        'padding': '1px 2px',
        'line-height': '1',
        'width': '14px',
        'height': '14px',
        'display': 'flex',
        'align-items': 'center',
        'justify-content': 'center'
      });
      $element.append(dragHandle);
    }

    // Make labels clickable for dragging with explicit event handler
    $element.find('label').css({
      'cursor': 'move',
      'user-select': 'none'
    }).off('mousedown.label').on('mousedown.label', (e) => {
      e.stopPropagation();
      this.startDrag(e, $element);
    });

    // Special styling for character name section to make it more obviously draggable
    if ($element.hasClass('character-name-section')) {
      $element.css({
        'padding': '8px',
        'border': '1px dashed transparent',
        'min-height': '40px' // Ensure minimum height for drag handle visibility
      });
      
      // Add hover effect to show it's draggable
      $element.off('mouseenter.charname mouseleave.charname')
        .on('mouseenter.charname', function() {
          $(this).css('border-color', '#ccc');
          $(this).find('.drag-handle').css('opacity', '1');
        })
        .on('mouseleave.charname', function() {
          if (!$(this).hasClass('dragging')) {
            $(this).css('border-color', 'transparent');
            $(this).find('.drag-handle').css('opacity', '0.6');
          }
        });
    }

    // Bind drag events (but exclude tabs)
    $element.off('mousedown.layout').on('mousedown.layout', (e) => {
      // Skip if clicking on tabs
      if ($(e.target).closest('.sheet-tabs').length > 0) {
        return; // Let tab clicks through
      }
      
      // Allow dragging from labels, drag handles, and container areas
      const isOnLabel = $(e.target).is('label') || $(e.target).closest('label').length > 0;
      const isOnDragHandle = $(e.target).hasClass('drag-handle');
      const isOnContainer = $(e.target).is($element) && !$(e.target).is('input, select, textarea, button');
      const isOnInput = $(e.target).is('input, select, textarea, button');
      
      // Debug logging for Weight field specifically
      if ($element.find('#char-weight').length > 0) {
        console.log('Weight field click:', {
          target: e.target.tagName + (e.target.className ? '.' + e.target.className.replace(/\s+/g, '.') : ''),
          isOnLabel,
          isOnDragHandle,
          isOnContainer,
          isOnInput,
          elementClass: $element[0].className,
          targetParent: e.target.parentElement?.tagName + (e.target.parentElement?.className ? '.' + e.target.parentElement.className.replace(/\s+/g, '.') : '')
        });
      }
      
      // Don't start drag if clicking directly on form inputs
      if (isOnInput) {
        return;
      }
      
      // Allow dragging from labels, drag handles, or container areas
      if (isOnLabel || isOnDragHandle || isOnContainer) {
        console.log('Starting drag for:', $element[0].className);
        this.startDrag(e, $element);
      }
    });

    // Make drag handles directly clickable
    $element.find('.drag-handle').off('mousedown.draghandle').on('mousedown.draghandle', (e) => {
      this.startDrag(e, $element);
      e.stopPropagation();
    });

    // Show/hide drag handle on hover for all draggable elements
    $element.off('mouseenter.layout mouseleave.layout')
      .on('mouseenter.layout', () => {
        $element.find('.drag-handle').css('opacity', '1');
      })
      .on('mouseleave.layout', () => {
        if (!this.isDragging) {
          $element.find('.drag-handle').css('opacity', '0.6');
        }
      });

    // Store original position for reset functionality
    const originalPosition = {
      x: 0,
      y: 0
    };
    this.originalPositions.set(this.getElementId($element), originalPosition);
  }

  /**
   * Check if click is on element edge (for character name special handling)
   */
  isClickOnElementEdge(e, $element) {
    const rect = $element[0].getBoundingClientRect();
    const edgeThreshold = 10; // pixels from edge
    
    const isNearLeft = e.clientX - rect.left < edgeThreshold;
    const isNearRight = rect.right - e.clientX < edgeThreshold;
    const isNearTop = e.clientY - rect.top < edgeThreshold;
    const isNearBottom = rect.bottom - e.clientY < edgeThreshold;
    
    return isNearLeft || isNearRight || isNearTop || isNearBottom;
  }

  /**
   * Start drag operation
   */
  startDrag(e, $element) {
    this.isDragging = true;
    this.currentDragElement = $element;
    this.dragStartPos = { x: e.clientX, y: e.clientY };
    
    // Get current transform values
    const transform = $element.css('transform');
    let currentX = 0, currentY = 0;
    if (transform && transform !== 'none') {
      const matrix = new DOMMatrix(transform);
      currentX = matrix.m41;
      currentY = matrix.m42;
    }
    this.elementStartPos = { x: currentX, y: currentY };

    // Visual feedback
    $element.addClass('dragging');
    $element.css({
      'z-index': '1000',
      'opacity': '0.8'
    });

    // Bind global events
    $(document).on('mousemove.layout', (e) => this.onDrag(e));
    $(document).on('mouseup.layout', () => this.endDrag());

    // Show grid if snap is enabled
    if (this.snapToGrid) {
      this.showGrid();
    }

    e.preventDefault();
  }

  /**
   * Calculate boundaries for dragging within the visible window
   */
  getBoundaries($element) {
    // Get the main sheet container (the actual sheet window)
    const sheetContainer = this.html.closest('.window-content');
    if (!sheetContainer.length) return { left: -9999, top: -9999, right: 9999, bottom: 9999 };
    
    const containerRect = sheetContainer[0].getBoundingClientRect();
    const elementRect = $element[0].getBoundingClientRect();
    
    // Calculate safe margins (padding from edges)
    const margin = 10;
    
    // Calculate the maximum translation values to keep element within bounds
    const minX = margin - (elementRect.left - containerRect.left);
    const maxX = (containerRect.right - margin) - elementRect.right;
    const minY = margin - (elementRect.top - containerRect.top);
    const maxY = (containerRect.bottom - margin) - elementRect.bottom;
    
    return {
      left: minX,
      right: maxX,
      top: minY,
      bottom: maxY
    };
  }

  /**
   * Handle drag movement
   */
  onDrag(e) {
    if (!this.isDragging || !this.currentDragElement) return;

    const deltaX = e.clientX - this.dragStartPos.x;
    const deltaY = e.clientY - this.dragStartPos.y;

    let newX = this.elementStartPos.x + deltaX;
    let newY = this.elementStartPos.y + deltaY;

    // Snap to grid if enabled
    if (this.snapToGrid) {
      newX = Math.round(newX / this.gridSize) * this.gridSize;
      newY = Math.round(newY / this.gridSize) * this.gridSize;
    }

    // Apply transform
    this.currentDragElement.css('transform', `translate(${newX}px, ${newY}px)`);
  }

  /**
   * End dragging
   */
  endDrag() {
    if (!this.isDragging) return;

    this.isDragging = false;

    if (this.currentDragElement) {
      this.currentDragElement.removeClass('dragging');
      this.currentDragElement.css({
        'z-index': '',
        'opacity': ''
      });
    }

    // Unbind global events
    $(document).off('mousemove.layout mouseup.layout');

    // Hide grid
    this.hideGrid();

    // Save layout with debounce to prevent conflicts
    this.preventLoad = true; // Prevent auto-load during manual save
    this.lastManualSave = Date.now();
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveCurrentLayout();
      // Re-enable auto-load after a delay
      setTimeout(() => {
        this.preventLoad = false;
      }, 500);
    }, 150);

    this.currentDragElement = null;
  }

  /**
   * Add layout control buttons
   */
  addLayoutControls() {
    const controlsHtml = `
      <div class="layout-controls" style="position: absolute; top: 5px; right: 5px; z-index: 1001; display: flex; gap: 5px;">
        <button type="button" class="layout-btn export-layout" title="Export Layout">📁</button>
        <button type="button" class="layout-btn import-layout" title="Import Layout">📂</button>
        <button type="button" class="layout-btn reset-layout" title="Reset Layout">↺</button>
        <button type="button" class="layout-btn toggle-grid" title="Toggle Grid">⊞</button>
        <button type="button" class="layout-btn toggle-snap" title="Toggle Snap">🧲</button>
      </div>
    `;

    // Remove existing controls
    this.html.find('.layout-controls').remove();
    
    // Add to window content
    this.html.find('.window-content').prepend(controlsHtml);

    // Style buttons
    this.html.find('.layout-btn').css({
      'width': '24px',
      'height': '24px',
      'border': 'none',
      'border-radius': '3px',
      'background': '#4a5568',
      'color': 'white',
      'font-size': '12px',
      'cursor': 'pointer',
      'display': 'flex',
      'align-items': 'center',
      'justify-content': 'center'
    });

    // Bind events
    this.html.find('.export-layout').on('click', () => this.exportLayout());
    this.html.find('.import-layout').on('click', () => this.importLayout());
    this.html.find('.reset-layout').on('click', () => this.resetLayout());
    this.html.find('.toggle-grid').on('click', () => this.toggleGrid());
    this.html.find('.toggle-snap').on('click', () => this.toggleSnap());
  }

  /**
   * Show grid overlay
   */
  showGrid() {
    this.hideGrid(); // Remove existing grid

    const combatTab = this.html.find('[data-tab="combat"]')[0];
    if (!combatTab) return; // Exit if combat tab not found
    
    const bounds = combatTab.getBoundingClientRect();
    
    this.gridOverlay = $('<div class="grid-overlay"></div>');
    this.gridOverlay.css({
      'position': 'absolute',
      'top': '0',
      'left': '0',
      'width': '100%',
      'height': '100%',
      'pointer-events': 'none',
      'z-index': '999',
      'background-image': `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
      'background-size': `${this.gridSize}px ${this.gridSize}px`
    });

    this.html.find('[data-tab="combat"]').append(this.gridOverlay);
  }

  /**
   * Hide grid overlay
   */
  hideGrid() {
    if (this.gridOverlay) {
      this.gridOverlay.remove();
      this.gridOverlay = null;
    }
  }

  /**
   * Toggle grid visibility
   */
  toggleGrid() {
    const button = this.html.find('.toggle-grid');
    
    if (this.gridOverlay) {
      this.hideGrid();
      button.css('background', '#4a5568');
    } else {
      this.showGrid();
      button.css('background', '#2d3748');
    }
  }

  /**
   * Toggle snap to grid
   */
  toggleSnap() {
    this.snapToGrid = !this.snapToGrid;
    const button = this.html.find('.toggle-snap');
    
    if (this.snapToGrid) {
      button.css('background', '#2d3748');
      if (!this.gridOverlay) {
        this.showGrid();
      }
    } else {
      button.css('background', '#4a5568');
    }
  }

  /**
   * Export current layout
   */
  exportLayout() {
    const positions = {};
    
    this.html.find('.draggable-field').each((index, element) => {
      const $element = $(element);
      const elementId = this.getElementId($element);
      
      const transform = $element.css('transform');
      let x = 0, y = 0;
      
      if (transform && transform !== 'none') {
        const matrix = new DOMMatrix(transform);
        x = matrix.m41;
        y = matrix.m42;
      }

      positions[elementId] = { x, y };
    });

    const layoutData = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      actorId: this.actor.id,
      actorName: this.actor.name,
      positions: positions
    };

    const dataStr = JSON.stringify(layoutData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `layout-${this.actor.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    link.click();
  }

  /**
   * Import layout from file
   */
  importLayout() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const layoutData = JSON.parse(e.target.result);
            this.applyLayout(layoutData);
          } catch (error) {
            ui.notifications.error('Invalid layout file');
          }
        };
        reader.readAsText(file);
      }
    };
    
    input.click();
  }

  /**
   * Apply layout from data
   */
  applyLayout(layoutData) {
    if (!layoutData.positions) return;

    Object.entries(layoutData.positions).forEach(([elementId, position]) => {
      const $element = this.getElementById(elementId);
      if ($element && $element.length) {
        $element.css('transform', `translate(${position.x}px, ${position.y}px)`);
      }
    });

    ui.notifications.info('Layout applied successfully');
  }

  /**
   * Reset layout to original positions
   */
  resetLayout() {
    this.html.find('.draggable-field').css('transform', '');
    this.actor.unsetFlag('osp-houserules', 'layout');
    ui.notifications.info('Layout reset to defaults');
  }

  /**
   * Reset all fields to visible area - public method for external use
   */
  resetAllFieldsToVisible() {
    this.resetLayout();
  }

  /**
   * Save current layout to actor data
   */
  saveCurrentLayout() {
    const positions = {};
    
    this.html.find('.draggable-field').each((index, element) => {
      const $element = $(element);
      const elementId = this.getElementId($element);
      
      const transform = $element.css('transform');
      let x = 0, y = 0;
      
      if (transform && transform !== 'none') {
        const matrix = new DOMMatrix(transform);
        x = matrix.m41;
        y = matrix.m42;
      }

      positions[elementId] = { x, y };
    });

    // Save to actor flags
    this.actor.setFlag('osp-houserules', 'layout', positions);
  }

  /**
   * Load saved layout from actor data
   */
  loadSavedLayout() {
    // Skip if currently dragging, prevented, or recently saved manually
    if (this.isDragging || this.preventLoad || (Date.now() - this.lastManualSave < 1000)) {
      console.log('Skipping layout load:', { 
        isDragging: this.isDragging, 
        preventLoad: this.preventLoad, 
        recentSave: Date.now() - this.lastManualSave < 1000 
      });
      return;
    }
    
    const savedLayout = this.actor.getFlag('osp-houserules', 'layout');
    if (savedLayout) {
      // Delay application to ensure DOM is ready and not conflicting with other operations
      if (this.loadTimeout) {
        clearTimeout(this.loadTimeout);
      }
      this.loadTimeout = setTimeout(() => {
        // Double-check we're not dragging or prevented before applying
        if (!this.isDragging && !this.preventLoad) {
          console.log('Applying saved layout');
          this.applyLayout({ positions: savedLayout });
        }
      }, 100);
    }
  }

  /**
   * Get unique ID for an element
   */
  getElementId($element) {
    // Try to find a unique identifier
    const id = $element.attr('id');
    if (id) return id;

    const className = $element.attr('class');
    const index = this.html.find('.' + className.split(' ')[0]).index($element);
    
    return `${className.split(' ')[0]}-${index}`;
  }

  /**
   * Get element by ID
   */
  getElementById(elementId) {
    // First try direct ID match
    let $element = this.html.find(`#${elementId}`);
    if ($element.length) return $element;

    // Try class-based match with index
    const parts = elementId.split('-');
    if (parts.length >= 2) {
      const index = parseInt(parts[parts.length - 1]);
      const className = parts.slice(0, -1).join('-');
      $element = this.html.find(`.${className}`).eq(index);
    }

    return $element;
  }

  /**
   * Cleanup handler
   */
  destroy() {
    // Clear any pending timeouts
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    if (this.loadTimeout) {
      clearTimeout(this.loadTimeout);
    }
    
    // Remove event listeners
    this.html.find('.draggable-field').off('.layout');
    this.html.find('.layout-controls').remove();
    $(document).off('.layout');
    
    // Hide grid
    this.hideGrid();
  }

  /**
   * Temporarily prevent auto-loading (for external operations like image handler)
   */
  temporarilyPreventLoad(duration = 1000) {
    this.preventLoad = true;
    this.lastManualSave = Date.now();
    setTimeout(() => {
      this.preventLoad = false;
    }, duration);
  }
}
