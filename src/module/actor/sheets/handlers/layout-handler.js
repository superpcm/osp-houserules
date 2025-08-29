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

    // Add extra padding to char-field-group elements to create more clickable area
    if ($element.hasClass('char-field-group')) {
  $element.addClass('cs-char-field-group');

      // Add hover effect to show draggable area
      $element.off('mouseenter.fieldgroup mouseleave.fieldgroup')
        .on('mouseenter.fieldgroup', function() {
          $(this).addClass('drag-hover');
        })
        .on('mouseleave.fieldgroup', function() {
          if (!$(this).hasClass('dragging')) {
            $(this).removeClass('drag-hover');
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

  dragHandle.addClass('drag-handle');
      $element.append(dragHandle);
    }

    // Make labels clickable for dragging with explicit event handler
  $element.find('label').addClass('drag-label').off('mousedown.label').on('mousedown.label', (e) => {
      e.stopPropagation();
      this.startDrag(e, $element);
    });

    // Special styling for character name section to make it more obviously draggable
  if ($element.hasClass('character-name-section')) {
  $element.addClass('character-name-draggable');

      // Add hover effect to show it's draggable
      $element.off('mouseenter.charname mouseleave.charname')
        .on('mouseenter.charname', function() {
          $(this).addClass('drag-hover');
          $(this).find('.drag-handle').addClass('visible');
        })
        .on('mouseleave.charname', function() {
          if (!$(this).hasClass('dragging')) {
            $(this).removeClass('drag-hover');
            $(this).find('.drag-handle').removeClass('visible');
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

      }

      // Don't start drag if clicking directly on form inputs
      if (isOnInput) {
        return;
      }

      // Allow dragging from labels, drag handles, or container areas
      if (isOnLabel || isOnDragHandle || isOnContainer) {

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
      .on('mouseenter.layout', () => { $element.find('.drag-handle').addClass('visible'); })
      .on('mouseleave.layout', () => { if (!this.isDragging) { $element.find('.drag-handle').removeClass('visible'); } });

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

  // Get current transform values via CSS variables if present
  let currentX = 0, currentY = 0;
  try {
    const computed = window.getComputedStyle($element[0]);
    currentX = parseInt(computed.getPropertyValue('--translate-x')) || 0;
    currentY = parseInt(computed.getPropertyValue('--translate-y')) || 0;
  } catch (e) {
    // Fallback to transform matrix parsing
    try {
      const transform = $element[0].style.transform || window.getComputedStyle($element[0]).transform;
      if (transform && transform !== 'none') {
        const matrix = new DOMMatrix(transform);
        currentX = matrix.m41 || 0;
        currentY = matrix.m42 || 0;
      }
    } catch (e2) {
      currentX = 0;
      currentY = 0;
    }
  }
  this.elementStartPos = { x: currentX, y: currentY };

    // Visual feedback
  $element.addClass('dragging');

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

    // Apply transform via CSS variables (keeps presentational control in CSS)
    try {
      this.currentDragElement[0].style.setProperty('--translate-x', `${newX}px`);
      this.currentDragElement[0].style.setProperty('--translate-y', `${newY}px`);
    } catch (e) {
      // fallback to direct transform if setProperty fails
      if (this.currentDragElement && this.currentDragElement[0]) {
        this.currentDragElement[0].style.transform = `translate(${newX}px, ${newY}px)`;
      }
    }
  }

  /**
   * End dragging
   */
  endDrag() {
    if (!this.isDragging) return;

    this.isDragging = false;

    if (this.currentDragElement) {
      this.currentDragElement.removeClass('dragging');
      if (this.currentDragElement[0]) {
        this.currentDragElement[0].style.zIndex = '';
        this.currentDragElement[0].style.opacity = '';
      }
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
      <div class="layout-controls">
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

  // Buttons are styled via SCSS; no inline styles

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

    this.gridOverlay = document.createElement('div');
    this.gridOverlay.className = 'grid-overlay';
    // Set grid size via CSS variable so SCSS controls visual appearance
    try {
      this.gridOverlay.style.setProperty('--grid-size', `${this.gridSize}px`);
    } catch (e) {
      this.gridOverlay.style.backgroundSize = `${this.gridSize}px ${this.gridSize}px`;
    }
    this.html.find('[data-tab="combat"]')[0].appendChild(this.gridOverlay);
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
  button.removeClass('active');
    } else {
      this.showGrid();
  button.addClass('active');
    }
  }

  /**
   * Toggle snap to grid
   */
  toggleSnap() {
    this.snapToGrid = !this.snapToGrid;
    const button = this.html.find('.toggle-snap');

    if (this.snapToGrid) {
  button.addClass('active');
      if (!this.gridOverlay) {
        this.showGrid();
      }
    } else {
  button.removeClass('active');
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

      // Prefer CSS variables, fallback to transform matrix parsing
      let x = 0, y = 0;
      try {
        const computed = window.getComputedStyle($element[0]);
        const tx = computed.getPropertyValue('--translate-x');
        const ty = computed.getPropertyValue('--translate-y');
        if (tx && tx !== 'auto' && tx !== '0px') x = parseInt(tx) || 0;
        if (ty && ty !== 'auto' && ty !== '0px') y = parseInt(ty) || 0;
        if (!tx || !ty) {
          const transform = $element[0].style.transform || computed.transform;
          if (transform && transform !== 'none') {
            const matrix = new DOMMatrix(transform);
            x = matrix.m41 || x;
            y = matrix.m42 || y;
          }
        }
      } catch (e) {
        const transform = $element[0].style.transform || window.getComputedStyle($element[0]).transform;
        if (transform && transform !== 'none') {
          const matrix = new DOMMatrix(transform);
          x = matrix.m41;
          y = matrix.m42;
        }
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
        try {
          $element[0].style.setProperty('--translate-x', `${position.x}px`);
          $element[0].style.setProperty('--translate-y', `${position.y}px`);
        } catch (e) {
          if ($element[0]) $element[0].style.transform = `translate(${position.x}px, ${position.y}px)`;
        }
      }
    });

    ui.notifications.info('Layout applied successfully');
  }

  /**
   * Reset layout to original positions
   */
  resetLayout() {
    // Clear CSS variables first, fallback to clearing transform
    this.html.find('.draggable-field').each((i, el) => {
      try {
        el.style.removeProperty('--translate-x');
        el.style.removeProperty('--translate-y');
        el.style.removeProperty('transform');
      } catch (e) {
        if (el && el.style) el.style.transform = '';
      }
    });
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

      // Prefer explicit CSS variables for stored positions
      let x = 0, y = 0;
      try {
        const computed = window.getComputedStyle($element[0]);
        const computedX = computed.getPropertyValue('--translate-x');
        const computedY = computed.getPropertyValue('--translate-y');
        if (computedX && computedX !== '0px' && computedX !== 'auto') {
          x = parseInt(computedX) || 0;
        } else {
          const transform = $element[0].style.transform || computed.transform;
          if (transform && transform !== 'none') {
            const matrix = new DOMMatrix(transform);
            x = matrix.m41;
          }
        }
        if (computedY && computedY !== '0px' && computedY !== 'auto') {
          y = parseInt(computedY) || 0;
        } else {
          const transform = $element[0].style.transform || computed.transform;
          if (transform && transform !== 'none') {
            const matrix = new DOMMatrix(transform);
            y = matrix.m42;
          }
        }
      } catch (e) {
        const transform = $element[0].style.transform || window.getComputedStyle($element[0]).transform;
        if (transform && transform !== 'none') {
          const matrix = new DOMMatrix(transform);
          x = matrix.m41;
          y = matrix.m42;
        }
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
