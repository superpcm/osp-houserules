/**
 * Handles race and class synchronization logic
 */
class RaceClassHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.raceClasses = ["Elf", "Dwarf", "Gnome", "Hobbit", "Half-Elf", "Half-Orc"];
    this.classSelect = html.find('select[name="system.class"]');
    this.raceSelect = html.find('select[name="system.race"]');
  }

  /**
   * Initialize race/class synchronization
   */
  initialize() {
    this.classSelect.on("change", this.syncRaceField.bind(this));
    this.syncRaceField();
  }

  /**
   * Synchronize race field based on class selection
   */
  syncRaceField() {
    const selectedClass = this.classSelect.val();
    if (this.raceClasses.includes(selectedClass)) {
      this.raceSelect.val(selectedClass);
      this.raceSelect.prop("disabled", true);
    } else {
      this.raceSelect.prop("disabled", false);
    }
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    this.classSelect.off("change");
  }
}

/**
 * Handles language management functionality
 */
class LanguageHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.tags = html.find('.languages-tags');
    this.hidden = html.find('.char-languages');
    this.openDialog = html.find('.open-language-dialog');
    this.standardLanguages = ["Dwarvish", "Elvish", "Gnomish", "Hobbitish", "Humanish", "Orcish"];
    
    // Initialize languages with Common as default
    this.languages = (this.hidden.val() || "").split(",")
      .map(l => l.trim())
      .filter(l => l && l !== "Common");
    this.languages.unshift("Common");
  }

  /**
   * Initialize language management
   */
  initialize() {
    this.renderTags();
    this.tags.on('click', '.remove-lang', this.onRemoveLanguage.bind(this));
    this.openDialog.on('click', this.onOpenDialog.bind(this));
  }

  /**
   * Render language tags
   */
  renderTags() {
    this.tags.empty();
    this.languages.forEach(lang => {
      const canRemove = lang !== "Common";
      const tagHtml = `
        <span class="lang-tag">
          ${lang}
          ${canRemove ? `<button type="button" class="remove-lang" data-lang="${lang}" aria-label="Remove ${lang}">&times;</button>` : ""}
        </span>
      `;
      this.tags.append(tagHtml);
    });
    this.hidden.val(this.languages.join(", "));
  }

  /**
   * Handle removing a language
   */
  onRemoveLanguage(event) {
    const lang = $(event.currentTarget).data('lang');
    this.languages = this.languages.filter(l => l !== lang && l !== "Common");
    this.languages.unshift("Common");
    this.renderTags();
  }

  /**
   * Handle opening the language selection dialog
   */
  async onOpenDialog(event) {
    const dialogContent = this.buildDialogContent();
    
    new Dialog({
      title: "Add Language",
      content: dialogContent,
      buttons: {
        ok: {
          label: "Add",
          callback: this.onDialogSubmit.bind(this)
        },
        cancel: { label: "Cancel" }
      },
      default: "ok"
    }).render(true);
  }

  /**
   * Build dialog content HTML
   */
  buildDialogContent() {
    return `<form>
      <div style="margin-bottom:8px;">
        <label><b>Select Languages:</b></label><br/>
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px;">
          ${this.standardLanguages.map(lang =>
            `<label style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" name="lang" value="${lang}" ${this.languages.includes(lang) ? "checked disabled" : ""}/>
              <span>${lang}</span>
            </label>`
          ).join("")}
        </div>
      </div>
      <div style="text-align: center;">
        <label><b>Custom Language:</b></label><br/>
        <input type="text" name="custom" style="width: 80%;" placeholder="Enter custom language"/>
      </div>
    </form>`;
  }

  /**
   * Handle dialog submission
   */
  onDialogSubmit(htmlDialog) {
    // Add checked standard languages
    htmlDialog.find('input[name="lang"]:checked:not(:disabled)').each((i, el) => {
      const val = $(el).val();
      if (val && !this.languages.includes(val)) {
        this.languages.push(val);
      }
    });

    // Add custom language
    const custom = htmlDialog.find('input[name="custom"]').val().trim();
    if (custom && !this.languages.includes(custom)) {
      this.languages.push(custom);
    }

    this.renderTags();
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    this.tags.off('click', '.remove-lang');
    this.openDialog.off('click');
  }
}

/**
 * Handles item management operations (CRUD, equipment, etc.)
 */
class ItemHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
  }

  /**
   * Initialize item management
   */
  initialize() {
    if (!this.actor.isOwner) return;

    // Bind all item-related event handlers
    this.html.find('.item-create').click(this.onItemCreate.bind(this));
    this.html.find('.item-edit').click(this.onItemEdit.bind(this));
    this.html.find('.item-delete').click(this.onItemDelete.bind(this));
    this.html.find('.item-toggle').click(this.onItemToggle.bind(this));
    this.html.find('.item-show').click(this.onItemShow.bind(this));
    this.html.find('.item-rollable').click(this.onItemRoll.bind(this));
    this.html.find('.quantity input').change(this.onQuantityChange.bind(this));
  }

  /**
   * Handle creating a new item
   */
  async onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const isTreasure = header.dataset.treasure === "true";
    
    const itemData = {
      name: `New ${type.capitalize()}`,
      type: type,
      system: {}
    };

    if (type === "item" && isTreasure) {
      itemData.system.treasure = true;
    }

    const cls = getDocumentClass("Item");
    return cls.create(itemData, {parent: this.actor});
  }

  /**
   * Handle editing an item
   */
  onItemEdit(event) {
    event.preventDefault();
    const item = this.getItemFromEvent(event);
    if (item) {
      item.sheet.render(true);
    }
  }

  /**
   * Handle deleting an item
   */
  onItemDelete(event) {
    event.preventDefault();
    const li = $(event.currentTarget).parents(".item-entry");
    const item = this.getItemFromEvent(event);
    if (item) {
      item.delete();
      li.slideUp(200, () => this.actor.sheet.render(false));
    }
  }

  /**
   * Handle toggling item equipment status
   */
  onItemToggle(event) {
    event.preventDefault();
    const item = this.getItemFromEvent(event);
    if (item) {
      const equipped = !item.system.equipped;
      item.update({"system.equipped": equipped});
    }
  }

  /**
   * Handle showing item details in chat
   */
  onItemShow(event) {
    event.preventDefault();
    const item = this.getItemFromEvent(event);
    if (!item) return;
    
    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: this.buildItemChatContent(item)
    };
    
    ChatMessage.create(chatData);
  }

  /**
   * Handle rolling for an item
   */
  onItemRoll(event) {
    event.preventDefault();
    const item = this.getItemFromEvent(event);
    
    if (item && item.type === "weapon") {
      const roll = new Roll("1d20");
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${item.name} Attack Roll`
      });
    }
  }

  /**
   * Handle changing item quantities
   */
  onQuantityChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const itemId = input.dataset.itemId;
    const field = input.dataset.field;
    const value = parseInt(input.value) || 0;
    
    const item = this.actor.items.get(itemId);
    if (item) {
      item.update({[field]: value});
    }
  }

  /**
   * Get item from event target
   */
  getItemFromEvent(event) {
    const li = $(event.currentTarget).parents(".item-entry");
    const itemId = li.data("item-id");
    return this.actor.items.get(itemId);
  }

  /**
   * Build chat content for item display
   */
  buildItemChatContent(item) {
    let content = `<div class="item-card"><h3>${item.name}</h3>`;
    
    if (item.system.description) {
      content += `<p>${item.system.description}</p>`;
    }
    
    if (item.type === "weapon" && item.system.damage) {
      content += `<p><strong>Damage:</strong> ${item.system.damage}</p>`;
    }
    
    if (item.type === "armor" && item.system.ac?.value) {
      content += `<p><strong>AC:</strong> ${item.system.ac.value}</p>`;
    }
    
    if (item.system.weight) {
      content += `<p><strong>Weight:</strong> ${item.system.weight} lbs</p>`;
    }
    
    content += `</div>`;
    return content;
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    this.html.find('.item-create').off('click');
    this.html.find('.item-edit').off('click');
    this.html.find('.item-delete').off('click');
    this.html.find('.item-toggle').off('click');
    this.html.find('.item-show').off('click');
    this.html.find('.item-rollable').off('click');
    this.html.find('.quantity input').off('change');
  }
}

/**
 * Handles UI state management (category toggles, etc.)
 */
class UIHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
  }

  /**
   * Initialize UI state management
   */
  initialize() {
    this.html.find('.category-caret').click(this.onCategoryToggle.bind(this));
  }

  /**
   * Handle toggling category visibility
   */
  onCategoryToggle(event) {
    event.preventDefault();
    const caret = event.currentTarget;
    const category = $(caret).closest('.item-category');
    const list = category.find('.item-list');
    
    list.slideToggle(200);
    $(caret).find('i').toggleClass('fa-caret-down fa-caret-right');
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    this.html.find('.category-caret').off('click');
  }
}

class ImageHandler {
  constructor(html, actor, layoutHandler = null) {
    this.html = html;
    this.actor = actor;
    this.layoutHandler = layoutHandler;
    this._isDragging = false;
    this._isResizing = false;
    this.startX = 0;
    this.startY = 0;
    this.startLeft = 0;
    this.startTop = 0;
    this.startWidth = 0;
    this.startHeight = 0;
    this.currentHandle = null;
  }

  get isDragging() {
    return this._isDragging;
  }

  set isDragging(value) {
    this._isDragging = value;
  }

  get isResizing() {
    return this._isResizing;
  }

  set isResizing(value) {
    this._isResizing = value;
  }

  initialize() {
    this.setupImageControls();
    this.setupEventListeners();
  }

  setupImageControls() {
    const container = this.html.find('.character-image-container');
    this.html.find('.character-portrait');
    
    // Show controls on hover
    container.on('mouseenter', () => {
      this.html.find('.resize-handle, .image-controls').show();
    });
    
    container.on('mouseleave', () => {
      if (!this.isDragging && !this.isResizing) {
        this.html.find('.resize-handle, .image-controls').hide();
      }
    });

    // Load saved image transform
    this.loadImageTransform();
  }

  setupEventListeners() {
    const portraitElement = this.html.find('.character-portrait')[0];
    
    // Simple test event to verify the element is clickable
    this.html.find('.character-portrait').on('click', (event) => {
      // Click handler for basic functionality
    });
    
    if (portraitElement) {
      // Try native DOM events instead of jQuery
      portraitElement.addEventListener('mousedown', (event) => {
        // Only handle left click for dragging
        if (event.which === 1 || event.button === 0) {
          event.preventDefault();
          event.stopPropagation();
          this.startDrag(event);
        }
      });
      
      portraitElement.addEventListener('click', (event) => {
        if (this.isDragging || this.isResizing) {
          event.preventDefault();
          event.stopPropagation();
        }
      });
    }
    
    // Also keep jQuery version as fallback
    this.html.find('.character-portrait').on('mousedown', (event) => {
      // Only handle left click for dragging
      if (event.which === 1) {
        event.preventDefault();
        event.stopPropagation();
        this.startDrag(event);
      }
    });
    
    // Prevent Foundry's default image click behavior
    this.html.find('.character-portrait').on('click', (event) => {
      if (this.isDragging || this.isResizing) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    
    // Double-click on image container (not image itself) to change image
    this.html.find('.character-image').on('dblclick', (event) => {
      event.preventDefault();
      this.openImagePicker();
    });
    
    // Resize handles
    this.html.find('.resize-handle').on('mousedown', this.startResize.bind(this));
    
    // Control buttons
    this.html.find('.reset-image').on('click', this.resetImage.bind(this));
    this.html.find('.fit-image').on('click', this.fitImage.bind(this));
    
    // DON'T bind global mouse events here - we'll bind them only when dragging starts
  }

  startDrag(event) {
    event.preventDefault();
    this.isDragging = true;
    this.startX = event.clientX;
    this.startY = event.clientY;
    
    const image = this.html.find('.character-portrait');
    const transform = this.getTransformValues(image);
    this.startLeft = transform.translateX;
    this.startTop = transform.translateY;
    
    // Change cursor and prevent controls from hiding
    image.css('cursor', 'grabbing');
    this.html.find('.resize-handle, .image-controls').show();
    
    // Add visual feedback to container
    this.html.find('.character-image').addClass('dragging');
    
    // NOW bind the global mouse events only when dragging starts
    $(document).on('mousemove.imageHandlerDrag', this.handleMouseMove.bind(this));
    $(document).on('mouseup.imageHandlerDrag', this.handleMouseUp.bind(this));
  }

  startResize(event) {
    event.preventDefault();
    event.stopPropagation();
    this.isResizing = true;
    this.currentHandle = $(event.target).attr('class').split(' ')[1]; // get resize direction
    this.startX = event.clientX;
    this.startY = event.clientY;
    
    const image = this.html.find('.character-portrait');
    const transform = this.getTransformValues(image);
    this.startWidth = transform.scaleX;
    this.startHeight = transform.scaleY;
    
    // Bind global mouse events for resizing
    console.log('ImageHandler: Binding global mouse events for resizing');
    $(document).on('mousemove.imageHandlerResize', this.handleMouseMove.bind(this));
    $(document).on('mouseup.imageHandlerResize', this.handleMouseUp.bind(this));
  }

  handleMouseMove(event) {
    if (this.isDragging) {
      const deltaX = event.clientX - this.startX;
      const deltaY = event.clientY - this.startY;
      const newLeft = this.startLeft + deltaX;
      const newTop = this.startTop + deltaY;
      
      this.applyTransform(newLeft, newTop, null, null);
    } else if (this.isResizing) {
      const deltaX = event.clientX - this.startX;
      const deltaY = event.clientY - this.startY;
      
      // Calculate the larger delta to maintain proportions
      const avgDelta = (Math.abs(deltaX) + Math.abs(deltaY)) / 2;
      let scaleFactor = 1;
      
      // Determine direction based on handle and calculate scale
      switch (this.currentHandle) {
        case 'resize-se':
          scaleFactor = this.startWidth + (avgDelta * 0.01 * Math.sign(deltaX + deltaY));
          break;
        case 'resize-sw':
          scaleFactor = this.startWidth + (avgDelta * 0.01 * Math.sign(-deltaX + deltaY));
          break;
        case 'resize-ne':
          scaleFactor = this.startWidth + (avgDelta * 0.01 * Math.sign(deltaX - deltaY));
          break;
        case 'resize-nw':
          scaleFactor = this.startWidth + (avgDelta * 0.01 * Math.sign(-deltaX - deltaY));
          break;
      }
      
      // Maintain minimum and maximum scale
      scaleFactor = Math.max(0.3, Math.min(3.0, scaleFactor));
      
      // Apply same scale to both X and Y to maintain proportions
      this.applyTransform(null, null, scaleFactor, scaleFactor);
    }
  }

  handleMouseUp() {
    if (this.isDragging || this.isResizing) {
      this.saveImageTransform();
      this.isDragging = false;
      this.isResizing = false;
      this.currentHandle = null;
      
      // Reset cursor and visual feedback
      this.html.find('.character-portrait').css('cursor', 'move');
      this.html.find('.character-image').removeClass('dragging');
      
      // Clean up global events (both drag and resize)
      $(document).off('mousemove.imageHandlerDrag');
      $(document).off('mouseup.imageHandlerDrag');
      $(document).off('mousemove.imageHandlerResize');
      $(document).off('mouseup.imageHandlerResize');
      
      // Hide controls after a brief delay
      setTimeout(() => {
        if (!this.isDragging && !this.isResizing) {
          this.html.find('.resize-handle, .image-controls').hide();
        }
      }, 100);
    }
  }

  applyTransform(translateX, translateY, scaleX, scaleY) {
    const image = this.html.find('.character-portrait');
    const current = this.getTransformValues(image);
    
    const newTranslateX = translateX !== null ? translateX : current.translateX;
    const newTranslateY = translateY !== null ? translateY : current.translateY;
    const newScaleX = scaleX !== null ? scaleX : current.scaleX;
    const newScaleY = scaleY !== null ? scaleY : current.scaleY;
    
    const transform = `translate(${newTranslateX}px, ${newTranslateY}px) scale(${newScaleX}, ${newScaleY})`;
    image.css('transform', transform);
  }

  getTransformValues(element) {
    const transform = element.css('transform');
    const defaultValues = { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 };
    
    if (!transform || transform === 'none') return defaultValues;
    
    const matrix = transform.match(/matrix.*\((.+)\)/);
    if (!matrix) return defaultValues;
    
    const values = matrix[1].split(', ').map(parseFloat);
    return {
      translateX: values[4] || 0,
      translateY: values[5] || 0,
      scaleX: values[0] || 1,
      scaleY: values[3] || 1
    };
  }

  resetImage() {
    this.html.find('.character-portrait').css('transform', 'translate(0px, 0px) scale(1, 1)');
    this.saveImageTransform();
  }

  fitImage() {
    this.html.find('.character-portrait').css('transform', 'translate(0px, 0px) scale(1, 1)');
    this.saveImageTransform();
  }

  openImagePicker() {
    // Use Foundry's file picker for image selection
    const picker = new FilePicker({
      type: "image",
      callback: (imagePath) => {
        this.actor.update({"img": imagePath});
      }
    });
    picker.render(true);
  }

  saveImageTransform() {
    // Notify layout handler to prevent auto-loading during image save
    if (this.layoutHandler) {
      this.layoutHandler.temporarilyPreventLoad(2000);
    }
    
    const image = this.html.find('.character-portrait');
    const transform = this.getTransformValues(image);
    
    // Save to actor data
    this.actor.update({
      'system.imageTransform': {
        translateX: transform.translateX,
        translateY: transform.translateY,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY
      }
    });
  }

  loadImageTransform() {
    const transform = this.actor.system.imageTransform;
    if (transform) {
      this.applyTransform(
        transform.translateX || 0,
        transform.translateY || 0,
        transform.scaleX || 1,
        transform.scaleY || 1
      );
    }
  }

  destroy() {
    // Clean up event listeners
    $(document).off('mousemove.imageHandler');
    $(document).off('mouseup.imageHandler');
    $(document).off('mousemove.imageHandlerDrag');
    $(document).off('mouseup.imageHandlerDrag');
    $(document).off('mousemove.imageHandlerResize');
    $(document).off('mouseup.imageHandlerResize');
    console.log('ImageHandler: Destroyed and cleaned up all event listeners');
  }
}

/**
 * LayoutHandler - Manages draggable fields and layout export/import
 */
class LayoutHandler {
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
    // Target individual draggable elements in the main tab
    const draggableSelectors = [
      '.character-name-section',
      '.xp-progress-section', // XP progress bar section
      '.char-field-group', // Individual fields only, not their parent containers
      '.ability-scores',
      '.saving-throws',
      '.character-stats'
    ];

    const mainTab = this.html.find('[data-tab="main"]');
    
    draggableSelectors.forEach(selector => {
      const elements = mainTab.find(selector);
      elements.each((index, element) => {
        this.makeDraggable($(element));
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

    // Add drag handles (optional visual indicator)
    if (!$element.find('.drag-handle').length) {
      const dragHandle = $('<div class="drag-handle" title="Drag to move">⋮⋮</div>');
      dragHandle.css({
        'position': 'absolute',
        'top': '2px',
        'right': '2px',
        'font-size': '12px',
        'color': '#666',
        'cursor': 'move',
        'opacity': '0.3',
        'z-index': '10',
        'pointer-events': 'none'
      });
      $element.append(dragHandle);
    }

    // Bind drag events
    $element.off('mousedown.layout').on('mousedown.layout', (e) => {
      // Don't interfere with input interactions
      if ($(e.target).is('input, select, textarea, button')) return;
      
      // Special handling for character name - only drag from drag handle or container edges
      if ($element.hasClass('character-name-section') || $element.find('#char-name').length) {
        const isOnDragHandle = $(e.target).hasClass('drag-handle');
        const isOnEdge = this.isClickOnElementEdge(e, $element);
        if (!isOnDragHandle && !isOnEdge) return;
      }

      this.startDrag(e, $element);
    });

    // Show/hide drag handle on hover
    $element.off('mouseenter.layout mouseleave.layout')
      .on('mouseenter.layout', () => {
        $element.find('.drag-handle').css('opacity', '0.7');
      })
      .on('mouseleave.layout', () => {
        if (!this.isDragging) {
          $element.find('.drag-handle').css('opacity', '0.3');
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

    this.html.find('[data-tab="main"]')[0].getBoundingClientRect();
    
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

    this.html.find('[data-tab="main"]').append(this.gridOverlay);
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

/**
 * CharacterNameHandler - Manages dynamic character name field sizing and behavior
 */
class CharacterNameHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.nameInput = null;
    this.minWidth = 150; // minimum width in pixels
    this.maxWidth = 400; // maximum width in pixels
    this.padding = 20; // extra padding for comfortable typing
  }

  /**
   * Initialize the character name handler
   */
  initialize() {
    this.nameInput = this.html.find('#char-name');
    if (this.nameInput.length) {
      this.setupDynamicWidth();
      this.bindEvents();
      this.adjustWidth(); // Initial adjustment
      
      // Ensure drag handle is visible for character name container
      this.ensureDragHandle();
    }
  }

  /**
   * Ensure drag handle is visible and interactive on character name container
   */
  ensureDragHandle() {
    // Use a slight delay to ensure DOM is fully rendered
    setTimeout(() => {
      const container = this.nameInput.closest('.character-name-section');
      if (container.length) {
        // Make sure container has relative positioning for drag handle
        if (container.css('position') !== 'relative') {
          container.css('position', 'relative');
        }
        
        // Check if drag handle already exists (from layout handler)
        let dragHandle = container.find('.drag-handle');
        
        if (dragHandle.length) {
          // Update existing drag handle to make it interactive
          dragHandle.css({
            'pointer-events': 'auto', // Override layout handler's 'none'
            'opacity': '0.3',
            'z-index': '10'
          });
          console.log('Character name drag handle updated to be interactive');
        } else {
          // Create new drag handle if none exists
          dragHandle = $('<div class="drag-handle" title="Drag to move">⋮⋮</div>');
          dragHandle.css({
            'position': 'absolute',
            'top': '2px',
            'right': '2px',
            'font-size': '12px',
            'color': '#666',
            'cursor': 'move',
            'opacity': '0.3',
            'z-index': '10',
            'pointer-events': 'auto', // Enable pointer events for drag handle
            'user-select': 'none',
            'line-height': '1'
          });
          container.append(dragHandle);
          console.log('Character name drag handle created');
        }
        
        // Ensure hover effects work (remove any existing handlers first)
        container.off('mouseenter.charname mouseleave.charname');
        container.on('mouseenter.charname', () => {
          dragHandle.css('opacity', '0.7');
        }).on('mouseleave.charname', () => {
          dragHandle.css('opacity', '0.3');
        });
      }
    }, 300); // Increased delay to ensure layout handler has finished
  }

  /**
   * Setup dynamic width functionality
   */
  setupDynamicWidth() {
    // Create a hidden span to measure text width
    this.measureSpan = $('<span></span>');
    this.measureSpan.css({
      'visibility': 'hidden',
      'position': 'absolute',
      'white-space': 'nowrap',
      'font-family': this.nameInput.css('font-family'),
      'font-size': this.nameInput.css('font-size'),
      'font-weight': this.nameInput.css('font-weight'),
      'letter-spacing': this.nameInput.css('letter-spacing')
    });
    
    // Add to DOM for measurement
    $('body').append(this.measureSpan);

    // Set initial CSS properties for the input
    this.nameInput.css({
      'width': 'auto',
      'min-width': `${this.minWidth}px`,
      'max-width': `${this.maxWidth}px`,
      'box-sizing': 'border-box'
    });
  }

  /**
   * Bind events for dynamic width adjustment
   */
  bindEvents() {
    // Adjust width on input, keyup, paste, and focus
    this.nameInput.on('input keyup paste focus blur', () => {
      setTimeout(() => this.adjustWidth(), 0);
    });

    // Also adjust when font properties change (from Council font handler)
    const observer = new MutationObserver(() => {
      this.updateMeasureSpanFont();
      this.adjustWidth();
    });

    observer.observe(this.nameInput[0], {
      attributes: true,
      attributeFilter: ['style']
    });

    // Store observer for cleanup
    this.fontObserver = observer;
  }

  /**
   * Update measure span font properties to match input
   */
  updateMeasureSpanFont() {
    if (this.measureSpan) {
      this.measureSpan.css({
        'font-family': this.nameInput.css('font-family'),
        'font-size': this.nameInput.css('font-size'),
        'font-weight': this.nameInput.css('font-weight'),
        'letter-spacing': this.nameInput.css('letter-spacing')
      });
    }
  }

  /**
   * Adjust the width of the input based on content
   */
  adjustWidth() {
    if (!this.nameInput || !this.measureSpan) return;

    const text = this.nameInput.val() || this.nameInput.attr('placeholder') || '';
    
    // Use the longer of actual text or placeholder for measurement
    const measureText = text.length > 0 ? text : (this.nameInput.attr('placeholder') || 'Character Name');
    
    // Set text in measure span and get width
    this.measureSpan.text(measureText);
    let textWidth = this.measureSpan.width();

    // Add padding and constrain to min/max
    let newWidth = Math.max(textWidth + this.padding, this.minWidth);
    newWidth = Math.min(newWidth, this.maxWidth);

    // Apply the new width
    this.nameInput.css('width', `${newWidth}px`);

    // Trigger a custom event for other handlers that might need to know about size changes
    this.nameInput.trigger('characterNameResize', { width: newWidth, textWidth: textWidth });
  }

  /**
   * Set minimum and maximum width constraints
   */
  setWidthConstraints(minWidth, maxWidth) {
    this.minWidth = minWidth;
    this.maxWidth = maxWidth;
    
    this.nameInput.css({
      'min-width': `${this.minWidth}px`,
      'max-width': `${this.maxWidth}px`
    });
    
    this.adjustWidth();
  }

  /**
   * Get current width information
   */
  getWidthInfo() {
    const currentWidth = this.nameInput.width();
    const text = this.nameInput.val() || '';
    
    return {
      currentWidth: currentWidth,
      textLength: text.length,
      minWidth: this.minWidth,
      maxWidth: this.maxWidth,
      isAtMin: currentWidth <= this.minWidth,
      isAtMax: currentWidth >= this.maxWidth
    };
  }

  /**
   * Force a width adjustment (useful after external changes)
   */
  refresh() {
    this.updateMeasureSpanFont();
    this.adjustWidth();
  }

  /**
   * Cleanup handler
   */
  destroy() {
    if (this.nameInput) {
      this.nameInput.off('input keyup paste focus blur');
    }
    
    if (this.measureSpan) {
      this.measureSpan.remove();
    }
    
    if (this.fontObserver) {
      this.fontObserver.disconnect();
    }
  }
}

/**
 * XPProgressHandler - Manages XP progress bar functionality and display
 */
class XPProgressHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.xpInput = null;
    this.progressBar = null;
    this.nextLevelDisplay = null;
  }

  /**
   * Initialize the XP progress handler
   */
  initialize() {
    this.xpInput = this.html.find('#char-xp');
    this.progressBar = this.html.find('.xp-progress-bar');
    this.nextLevelDisplay = this.html.find('.next-level-xp');
    this.percentageDisplay = this.html.find('.xp-percentage');
    
    if (this.xpInput.length && this.progressBar.length) {
      this.bindEvents();
      this.updateProgressBar();
    }
  }

  /**
   * Bind events for XP input changes
   */
  bindEvents() {
    // Update progress bar when XP changes
    this.xpInput.on('input change', () => {
      setTimeout(() => this.updateProgressBar(), 0);
    });

    // Also listen for external updates (like from other handlers)
    this.html.on('xpChanged', () => {
      this.updateProgressBar();
    });
  }

  /**
   * Update the progress bar based on current XP and next level requirements
   */
  updateProgressBar() {
    if (!this.xpInput.length || !this.progressBar.length) return;

    const currentXP = parseInt(this.xpInput.val()) || 0;
    const nextLevelXP = this.getNextLevelXP();
    const currentLevelXP = this.getCurrentLevelXP();
    
    // Calculate progress within current level
    const xpInCurrentLevel = currentXP - currentLevelXP;
    const xpNeededForNextLevel = nextLevelXP - currentLevelXP;
    
    // Calculate percentage (0-100%)
    let progressPercentage = 0;
    if (xpNeededForNextLevel > 0) {
      progressPercentage = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNextLevel) * 100));
    }

    // Update progress bar width
    this.progressBar.css('width', `${progressPercentage}%`);

    // Update next level display
    this.nextLevelDisplay.text(nextLevelXP);

    // Update percentage display
    if (this.percentageDisplay.length) {
      this.percentageDisplay.text(Math.round(progressPercentage));
    }

    // Optional: Change bar color if at max level or over XP requirement
    if (currentXP >= nextLevelXP) {
      this.progressBar.css('background-color', '#16a34a'); // Darker green when complete
    } else {
      this.progressBar.css('background-color', '#22c55e'); // Bright green
    }
  }

  /**
   * Get XP required for next level based on class and current level
   */
  getNextLevelXP() {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(this.actor.system.level) || 1;
    
    // XP requirements table - you may need to adjust these based on your system
    const xpTables = {
      'Fighter': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000],
      'Cleric': [0, 1500, 3000, 6000, 13000, 27000, 55000, 110000, 225000, 450000, 675000, 900000, 1125000, 1350000],
      'Magic-User': [0, 2500, 5000, 10000, 22500, 40000, 60000, 90000, 135000, 250000, 375000, 750000, 1125000, 1500000],
      'Mage': [0, 2500, 5000, 10000, 22500, 40000, 60000, 90000, 135000, 250000, 375000, 750000, 1125000, 1500000],
      'Thief': [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000],
      'Dwarf': [0, 2200, 4400, 8800, 17000, 35000, 70000, 140000, 270000, 400000, 530000, 660000, 790000, 920000],
      'Elf': [0, 4000, 8000, 16000, 32000, 64000, 120000, 250000, 400000, 600000, 900000, 1200000, 1500000, 1800000],
      'Hobbit': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000]
    };

    const table = xpTables[characterClass] || xpTables['Fighter']; // Default to Fighter
    const nextLevel = Math.min(currentLevel + 1, table.length - 1);
    
    return table[nextLevel] || table[table.length - 1];
  }

  /**
   * Get XP required for current level
   */
  getCurrentLevelXP() {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(this.actor.system.level) || 1;
    
    // Same XP table as above
    const xpTables = {
      'Fighter': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000],
      'Cleric': [0, 1500, 3000, 6000, 13000, 27000, 55000, 110000, 225000, 450000, 675000, 900000, 1125000, 1350000],
      'Magic-User': [0, 2500, 5000, 10000, 22500, 40000, 60000, 90000, 135000, 250000, 375000, 750000, 1125000, 1500000],
      'Mage': [0, 2500, 5000, 10000, 22500, 40000, 60000, 90000, 135000, 250000, 375000, 750000, 1125000, 1500000],
      'Thief': [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000],
      'Dwarf': [0, 2200, 4400, 8800, 17000, 35000, 70000, 140000, 270000, 400000, 530000, 660000, 790000, 920000],
      'Elf': [0, 4000, 8000, 16000, 32000, 64000, 120000, 250000, 400000, 600000, 900000, 1200000, 1500000, 1800000],
      'Hobbit': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000]
    };

    const table = xpTables[characterClass] || xpTables['Fighter']; // Default to Fighter
    const levelIndex = Math.max(0, Math.min(currentLevel - 1, table.length - 1));
    
    return table[levelIndex] || 0;
  }

  /**
   * Get current progress information
   */
  getProgressInfo() {
    const currentXP = parseInt(this.xpInput.val()) || 0;
    const nextLevelXP = this.getNextLevelXP();
    const currentLevelXP = this.getCurrentLevelXP();
    
    return {
      currentXP: currentXP,
      nextLevelXP: nextLevelXP,
      currentLevelXP: currentLevelXP,
      progressPercentage: Math.min(100, Math.max(0, ((currentXP - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100))
    };
  }

  /**
   * Force a progress bar update (useful after external changes)
   */
  refresh() {
    this.updateProgressBar();
  }

  /**
   * Cleanup handler
   */
  destroy() {
    if (this.xpInput) {
      this.xpInput.off('input change');
    }
    if (this.html) {
      this.html.off('xpChanged');
    }
  }
}

const { ActorSheet } = foundry.appv1.sheets;

class OspActorSheetCharacter extends ActorSheet {
  constructor(...args) {
    super(...args);
    this.handlers = new Map();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "character"],
      template: "systems/osp-houserules/templates/actors/character-sheet.html",
      width: 600,
      height: 500,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }],
    });
  }

  getData(options) {
    const context = super.getData(options);
    context.system = this.actor.system;
    
    // Prepare items for template
    context.weapons = this.actor.system.weapons || [];
    context.armor = this.actor.system.armor || [];
    context.containers = this.actor.system.containers || [];
    context.items = this.actor.system.items || [];
    context.treasures = this.actor.system.treasures || [];
    
    // Encumbrance data
    context.totalWeight = this.actor.system.encumbrance?.totalWeight || 0;
    context.maxWeight = this.actor.system.encumbrance?.maxWeight || 100;
    context.encumbrancePercentage = this.actor.system.encumbrance?.percentage || 0;

    // Ensure saving throws are available
    context.saves = this.actor.system.saves || {
      death: { value: 0 },
      wands: { value: 0 },
      paralysis: { value: 0 },
      breath: { value: 0 },
      spells: { value: 0 }
    };

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Only initialize handlers if sheet is editable
    if (!this.options.editable) return;

    // Apply Council font as fallback if CSS doesn't work
    this.ensureCouncilFont(html);

    // Initialize all handlers
    this.initializeHandlers(html);
  }

  /**
   * Ensure Council font is applied - minimal fallback if CSS fails
   */
  ensureCouncilFont(html) {
    const nameInput = html.find('#char-name')[0];
    if (nameInput) {
      // Check if CSS applied correctly after a brief delay
      setTimeout(() => {
        const computedStyle = window.getComputedStyle(nameInput);
        if (!computedStyle.fontFamily.includes('Council')) {
          // CSS failed, apply via JavaScript as fallback
          nameInput.style.setProperty('font-family', 'Council, serif', 'important');
          nameInput.style.setProperty('font-weight', 'normal', 'important');
          nameInput.style.setProperty('font-size', '3rem', 'important');
          nameInput.style.setProperty('height', 'auto', 'important');
          nameInput.style.setProperty('min-height', '1.2em', 'important');
          nameInput.style.setProperty('line-height', '1.2', 'important');
          nameInput.style.setProperty('letter-spacing', '0.03em', 'important');
        }
      }, 50);
    }
  }

  /**
   * Initialize all event handlers
   */
  initializeHandlers(html) {
    // Clean up existing handlers
    this.destroyHandlers();

    // Create and initialize new handlers with proper dependencies
    const handlerConfigs = [
      { name: 'raceClass', Handler: RaceClassHandler },
      { name: 'language', Handler: LanguageHandler },
      { name: 'item', Handler: ItemHandler },
      { name: 'ui', Handler: UIHandler },
      { name: 'layout', Handler: LayoutHandler }, // Create layout handler first
      { name: 'characterName', Handler: CharacterNameHandler },
      { name: 'xpProgress', Handler: XPProgressHandler }
    ];

    // Initialize layout handler first
    handlerConfigs.forEach(({ name, Handler }) => {
      if (name === 'layout') {
        try {
          const handler = new Handler(html, this.actor);
          handler.initialize();
          this.handlers.set(name, handler);
        } catch (error) {
          console.error(`Failed to initialize ${name} handler:`, error);
        }
      }
    });

    // Initialize image handler with layout handler reference
    try {
      const layoutHandler = this.handlers.get('layout');
      const imageHandler = new ImageHandler(html, this.actor, layoutHandler);
      imageHandler.initialize();
      this.handlers.set('image', imageHandler);
    } catch (error) {
      console.error('Failed to initialize image handler:', error);
    }

    // Initialize remaining handlers
    handlerConfigs.forEach(({ name, Handler }) => {
      if (name !== 'layout') { // Skip layout (already done) and image (done above)
        try {
          const handler = new Handler(html, this.actor);
          handler.initialize();
          this.handlers.set(name, handler);
        } catch (error) {
          console.error(`Failed to initialize ${name} handler:`, error);
        }
      }
    });
  }

  /**
   * Clean up all handlers
   */
  destroyHandlers() {
    this.handlers.forEach((handler, name) => {
      try {
        if (typeof handler.destroy === 'function') {
          handler.destroy();
        }
      } catch (error) {
        console.error(`Failed to destroy ${name} handler:`, error);
      }
    });
    this.handlers.clear();
  }

  /**
   * Override close to clean up handlers
   */
  async close(options = {}) {
    this.destroyHandlers();
    return super.close(options);
  }

  /**
   * Get a specific handler instance
   * @param {string} name - Handler name
   * @returns {Object|null} Handler instance
   */
  getHandler(name) {
    return this.handlers.get(name);
  }
}

class OspActorSheetMonster extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "monster"],
      template: "systems/osp-houserules/templates/actors/monster-sheet.html",
      width: 600,
      height: 400,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
    });
  }

  getData(options) {
    const context = super.getData(options);
    context.system = this.actor.system;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
  }
}

class OspActor extends Actor {
  /**
   * Prepare Character type specific data
   * @private
   */
  _prepareCharacterData() {
    // Organize items by type
    this.system.weapons = this.items.filter(item => item.type === "weapon");
    this.system.armor = this.items.filter(item => item.type === "armor");
    this.system.containers = this.items.filter(item => item.type === "container");
    this.system.items = this.items.filter(item => item.type === "item" && !item.system.treasure);
    this.system.treasures = this.items.filter(item => item.type === "item" && item.system.treasure);

    // Calculate encumbrance
    this._calculateEncumbrance();
    
    // Calculate saving throws
    this._calculateSavingThrows();
    
    // Calculate next level XP
    this._calculateNextLevelXP();
    
    // Calculate XP modifier
    this._calculateXPModifier();
  }

    /**
   * Calculate saving throws based on class, level, and race
   * @private
   */
  _calculateSavingThrows() {
    // Initialize saves structure if it doesn't exist
    if (!this.system.saves) {
      this.system.saves = {
        death: { value: 0 },
        wands: { value: 0 },
        paralysis: { value: 0 },
        breath: { value: 0 },
        spells: { value: 0 }
      };
    }
    
    const characterClass = this.system.class || '';
    const level = parseInt(this.system.level) || 1;
    const race = this.system.race?.toLowerCase() || '';
    
    console.log(`OSP Debug: Class: "${characterClass}", Level: ${level}, Race: "${race}"`);

    // OSE saving throw tables by class
    const savingThrowTables = {
      'fighter': {
        death: [12, 11, 10, 10, 8, 8, 6, 6, 4, 4, 2, 2, 2, 2, 2],
        wands: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2, 2],
        paralysis: [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2],
        breath: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2],
        spells: [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
      },
      'cleric': {
        death: [11, 10, 9, 8, 7, 6, 5, 4, 2, 2, 2, 2, 2, 2, 2],
        wands: [12, 11, 10, 9, 8, 7, 6, 5, 3, 2, 2, 2, 2, 2, 2],
        paralysis: [14, 13, 12, 11, 10, 9, 8, 7, 5, 4, 3, 2, 2, 2, 2],
        breath: [16, 15, 14, 13, 12, 11, 10, 9, 7, 6, 5, 4, 3, 2, 2],
        spells: [15, 14, 13, 12, 11, 10, 9, 8, 6, 5, 4, 3, 2, 2, 2]
      },
      'magic-user': {
        death: [13, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 6],
        wands: [14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7],
        paralysis: [13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
        breath: [16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 8],
        spells: [15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 7]
      },
      'thief': {
        death: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 2, 2, 2, 2, 2],
        wands: [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 3, 2, 2, 2, 2],
        paralysis: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 2, 2, 2, 2, 2],
        breath: [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 5, 4, 3, 2, 2],
        spells: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 4, 3, 2, 2, 2]
      }
    };

    // Map additional classes to their saving throw patterns
    const classMapping = {
      // Core OSE classes
      'fighter': 'fighter',
      'cleric': 'cleric', 
      'magic-user': 'magic-user',
      'thief': 'thief',
      
      // Advanced Fantasy classes - map to appropriate base class tables
      'assassin': 'thief',          // Assassins use thief saves
      'barbarian': 'fighter',       // Barbarians use fighter saves
      'bard': 'thief',              // Bards use thief saves
      'beast master': 'fighter',    // Beast Masters use fighter saves
      'druid': 'cleric',            // Druids use cleric saves
      'knight': 'fighter',          // Knights use fighter saves
      'paladin': 'cleric',          // Paladins use cleric saves
      'ranger': 'fighter',          // Rangers use fighter saves
      'warden': 'fighter',          // Wardens use fighter saves
      
      // Magic users and variants
      'illusionist': 'magic-user',  // Illusionists use magic-user saves
      'mage': 'magic-user',         // Mages use magic-user saves
      
      // Race-as-class options
      'dwarf': 'fighter',           // Dwarf class uses fighter saves
      'elf': 'fighter',             // Elf class uses fighter saves (with some magic-user features)
      'gnome': 'cleric',            // Gnome class uses cleric saves
      'half-elf': 'fighter',        // Half-Elf class uses fighter saves
      'half-orc': 'fighter',        // Half-Orc class uses fighter saves
      'hobbit': 'thief'             // Hobbit class uses thief saves
    };

    // Get the appropriate save table for this class
    const mappedClass = classMapping[characterClass.toLowerCase()] || 'fighter';
    const saveTable = savingThrowTables[mappedClass];
    console.log(`OSP Debug: Using save table for: ${characterClass.toLowerCase()} -> ${mappedClass}`);
    const levelIndex = Math.min(Math.max(level - 1, 0), 14); // Levels 1-15, array index 0-14
    console.log(`OSP Debug: Level index: ${levelIndex}`);

    // Calculate each saving throw
    ['death', 'wands', 'paralysis', 'breath', 'spells'].forEach(saveType => {
      // Ensure the save type exists in the structure
      if (!this.system.saves[saveType]) {
        this.system.saves[saveType] = { value: 0 };
      }
      
      let baseValue = saveTable[saveType] ? saveTable[saveType][levelIndex] : 15;
      console.log(`OSP Debug: ${saveType} base value: ${baseValue}`);
      
      // Apply racial bonuses
      let racialBonus = 0;
      if (race === 'dwarf' && (saveType === 'wands' || saveType === 'spells' || saveType === 'paralysis' || saveType === 'death')) {
        racialBonus = 4; // Dwarves get +4 vs magic
      } else if (race === 'hobbit' && (saveType === 'wands' || saveType === 'spells' || saveType === 'paralysis' || saveType === 'death')) {
        racialBonus = 4; // Hobbits get +4 vs magic
      }
      
      const finalValue = Math.max(baseValue - racialBonus, 2); // Minimum save of 2
      console.log(`OSP Debug: ${saveType} final value: ${finalValue} (base ${baseValue} - racial ${racialBonus})`);
      
      this.system.saves[saveType].value = finalValue;
    });
  }

  /**
   * Calculate next level XP based on class and current level
   * @private
   */
  _calculateNextLevelXP() {
    const characterClass = this.system.class || '';
    const level = parseInt(this.system.level) || 1;
    
    // OSE XP progression tables
    const xpTables = {
      // Fighter progression (and similar classes)
      'fighter': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000, 960000],
      
      // Cleric progression
      'cleric': [0, 1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000],
      
      // Magic-User progression (higher requirements)
      'magic-user': [0, 2500, 5000, 10000, 20000, 40000, 80000, 150000, 300000, 450000, 600000, 750000, 900000, 1050000, 1200000],
      
      // Thief progression
      'thief': [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000, 880000]
    };

    // Map additional classes to their XP patterns (same as saving throw mapping)
    const classXPMapping = {
      // Core OSE classes
      'fighter': 'fighter',
      'cleric': 'cleric', 
      'magic-user': 'magic-user',
      'thief': 'thief',
      
      // Advanced Fantasy classes - map to appropriate base class XP tables
      'assassin': 'thief',          // Assassins use thief XP
      'barbarian': 'fighter',       // Barbarians use fighter XP
      'bard': 'thief',              // Bards use thief XP
      'beast master': 'fighter',    // Beast Masters use fighter XP
      'druid': 'cleric',            // Druids use cleric XP
      'knight': 'fighter',          // Knights use fighter XP
      'paladin': 'cleric',          // Paladins use cleric XP
      'ranger': 'fighter',          // Rangers use fighter XP
      'warden': 'fighter',          // Wardens use fighter XP
      
      // Magic users and variants
      'illusionist': 'magic-user',  // Illusionists use magic-user XP
      'mage': 'magic-user',         // Mages use magic-user XP
      
      // Race-as-class options
      'dwarf': 'fighter',           // Dwarf class uses fighter XP
      'elf': 'magic-user',          // Elf class uses magic-user XP (fighter/magic-user hybrid)
      'gnome': 'cleric',            // Gnome class uses cleric XP
      'half-elf': 'fighter',        // Half-Elf class uses fighter XP
      'half-orc': 'fighter',        // Half-Orc class uses fighter XP
      'hobbit': 'thief'             // Hobbit class uses thief XP
    };

    // Get the appropriate XP table for this class
    const mappedClass = classXPMapping[characterClass.toLowerCase()] || 'fighter';
    const xpTable = xpTables[mappedClass];
    
    // Calculate next level XP (if max level, show current level requirement)
    const nextLevel = Math.min(level + 1, 15); // Max level 15
    const nextLevelIndex = nextLevel - 1; // Convert to array index
    
    this.system.nextLevelXP = xpTable[nextLevelIndex] || xpTable[14]; // Use max level XP if beyond table
  }

  /**
   * Calculate XP modifier based on class prime requisites
   * @private
   */
  _calculateXPModifier() {
    const characterClass = this.system.class || '';
    const attributes = this.system.attributes || {};
    
    // Prime requisite mapping for each class
    const primeRequisites = {
      // Core OSE classes
      'fighter': ['str'],
      'cleric': ['wis'], 
      'magic-user': ['int'],
      'thief': ['dex'],
      
      // Advanced Fantasy classes
      'assassin': ['str', 'dex'],       // Assassins need both STR and DEX
      'barbarian': ['str', 'con'],      // Barbarians need STR and CON
      'bard': ['dex', 'cha'],           // Bards need DEX and CHA
      'beast master': ['str', 'wis'],   // Beast Masters need STR and WIS
      'druid': ['wis'],                 // Druids use WIS like clerics
      'knight': ['str'],                // Knights use STR like fighters
      'paladin': ['str', 'cha'],        // Paladins need STR and CHA
      'ranger': ['str', 'wis'],         // Rangers need STR and WIS
      'warden': ['str', 'con'],         // Wardens need STR and CON
      
      // Magic users and variants
      'illusionist': ['int'],           // Illusionists use INT
      'mage': ['int'],                  // Mages use INT like magic-users
      
      // Race-as-class options (these often have multiple requirements)
      'dwarf': ['str'],                 // Dwarf class uses STR
      'elf': ['int', 'str'],            // Elf class needs INT and STR
      'gnome': ['int'],                 // Gnome class uses INT
      'half-elf': ['str', 'int'],       // Half-Elf class needs STR and INT
      'half-orc': ['str'],              // Half-Orc class uses STR
      'hobbit': ['dex', 'str']          // Hobbit class needs DEX and STR
    };

    const classReqs = primeRequisites[characterClass.toLowerCase()] || ['str'];
    
    // OSE XP modifier table based on ability scores
    const getXPModifier = (score) => {
      const numScore = parseInt(score) || 10;
      if (numScore <= 8) return -10;      // 3-8: -10%
      if (numScore <= 12) return 0;       // 9-12: No modifier
      if (numScore <= 15) return 5;       // 13-15: +5%
      if (numScore <= 17) return 10;      // 16-17: +10%
      return 15;                          // 18: +15%
    };

    let totalModifier = 0;
    
    if (classReqs.length === 1) {
      // Single prime requisite
      const reqScore = attributes[classReqs[0]]?.value || 10;
      totalModifier = getXPModifier(reqScore);
    } else {
      // Multiple prime requisites - use average or most restrictive approach
      // For OSE, typically the average of both is used
      let modifierSum = 0;
      for (const req of classReqs) {
        const reqScore = attributes[req]?.value || 10;
        modifierSum += getXPModifier(reqScore);
      }
      totalModifier = Math.round(modifierSum / classReqs.length);
    }

    this.system.xpModifier = totalModifier;
  }

  /** @override */
  get displayName() {
    return "Actor";
  }

  /** @override */
  get displayNamePlural() {
    return "Actors";
  }

  /** @override */
  prepareData() {
    super.prepareData();
    // Add any system-specific actor prep here
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    
    // Prepare character-specific data
    if (this.type === "character") {
      this._prepareCharacterData();
    }
  }

  /**
   * Prepare character-specific data
   * @private
   */
  _prepareCharacterData() {
    // Organize items by type
    this.system.weapons = this.items.filter(item => item.type === "weapon");
    this.system.armor = this.items.filter(item => item.type === "armor");
    this.system.containers = this.items.filter(item => item.type === "container");
    this.system.items = this.items.filter(item => item.type === "item" && !item.system.treasure);
    this.system.treasures = this.items.filter(item => item.type === "item" && item.system.treasure);

    // Calculate encumbrance
    this._calculateEncumbrance();
    
    // Calculate saving throws
    this._calculateSavingThrows();
  }

  /**
   * Calculate encumbrance for the character
   * @private
   */
  _calculateEncumbrance() {
    let totalWeight = 0;
    
    // Sum up all item weights
    this.items.forEach(item => {
      if (item.system.equipped || item.type === "armor" || item.type === "weapon") {
        const quantity = item.system.quantity?.value || 1;
        const weight = item.system.weight || 0;
        totalWeight += weight * quantity;
      }
    });

    // Basic encumbrance calculation (can be made more sophisticated)
    const maxWeight = 100; // Base carrying capacity
    const encumbrancePercentage = Math.min(100, (totalWeight / maxWeight) * 100);

    this.system.encumbrance = {
      totalWeight: totalWeight,
      maxWeight: maxWeight,
      percentage: encumbrancePercentage,
      encumbered: encumbrancePercentage > 50
    };
  }
}

class OspItem extends Item {
  /** @override */
  prepareData() {
    super.prepareData();
    
    // Calculate cumulative properties for items
    if (this.type === "item" && this.system.treasure) {
      this.system.cumulativeCost = this.system.cost * this.system.quantity.value;
      this.system.cumulativeWeight = this.system.weight * this.system.quantity.value;
    }
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /**
   * Get the item's tags for display
   */
  get displayTags() {
    if (this.type === "weapon" && this.system.tags) {
      return this.system.tags.map(tag => {
        return {
          value: tag,
          title: tag
        };
      });
    }
    return [];
  }

  /**
   * Check if the item is a weapon that can be used for attacks
   */
  get isWeapon() {
    return this.type === "weapon";
  }

  /**
   * Check if the item is equipped
   */
  get isEquipped() {
    return this.system.equipped || false;
  }
}

class OspItemSheet extends foundry.appv1.sheets.ItemSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "item"],
      width: 520,
      height: 480,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }],
    });
  }

  /** @override */
  get template() {
    const path = "systems/osp-houserules/templates/items";
    return `${path}/${this.item.type}-sheet.html`;
  }

  /** @override */
  getData() {
    const context = super.getData();
    
    // Add the item's system data for easy access
    context.system = this.item.system;
    context.flags = this.item.flags;
    
    // Add configuration data
    context.config = {
      damageTypes: ["d4", "d6", "d8", "d10", "d12"],
      armorTypes: ["light", "medium", "heavy"],
      weaponTypes: ["melee", "missile", "both"]
    };

    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Add or remove tags
    html.find(".tag-control").click(this._onTagControl.bind(this));
  }

  /**
   * Handle adding or removing tags from weapons
   * @param {Event} event   The originating click event
   * @private
   */
  _onTagControl(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const action = button.dataset.action;
    
    if (action === "add") {
      const input = button.previousElementSibling;
      const tag = input.value.trim();
      if (tag) {
        const tags = this.item.system.tags || [];
        if (!tags.includes(tag)) {
          tags.push(tag);
          this.item.update({ "system.tags": tags });
        }
        input.value = "";
      }
    } else if (action === "remove") {
      const tag = button.dataset.tag;
      const tags = this.item.system.tags || [];
      const filteredTags = tags.filter(t => t !== tag);
      this.item.update({ "system.tags": filteredTags });
    }
  }
}

// ose.js - Main system entry point
console.log("osp-houserules Debug: src/ose.js module loaded");

Hooks.once("init", () => {
  // Configure Actor document classes
  CONFIG.Actor.documentClass = OspActor;
  CONFIG.Actor.label = game.i18n.localize("osp-houserules.Actor.documentLabel");
  
  // Configure Item document classes
  CONFIG.Item.documentClass = OspItem;
  
  // Unregister core sheets
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  
  // Register Actor sheets
  foundry.documents.collections.Actors.registerSheet("osp-houserules", OspActorSheetCharacter, {
    types: ["character"],
    makeDefault: true,
    label: game.i18n.localize("osp-houserules.Actor.Type.character")
  });
  foundry.documents.collections.Actors.registerSheet("osp-houserules", OspActorSheetMonster, {
    types: ["monster"],
    makeDefault: true,
    label: game.i18n.localize("osp-houserules.Actor.Type.monster")
  });

  // Register Item sheets
  foundry.documents.collections.Items.registerSheet("osp-houserules", OspItemSheet, {
    types: ["weapon", "armor", "item", "container"],
    makeDefault: true,
    label: "OSP Item Sheet"
  });

  CONFIG.Actor.typeLabels = {
    character: game.i18n.localize("osp-houserules.Actor.Type.character"),
    monster: game.i18n.localize("osp-houserules.Actor.Type.monster")
  };

  Hooks.on("renderActorConfig", (app, html, data) => {
    const $html = $(html);
    const $select = $html.find('select[name="type"]');
    const $submit = $html.find('button[type="submit"]');

    // Insert a placeholder option if not present
    if ($select.find('option[value=""]').length === 0) {
      $select.prepend(
        `<option value="" disabled>${game.i18n.localize("osp-houserules.ChooseType")}</option>`
      );
      $select.val(""); // Set the select to the placeholder
    }

    // Localize type options
    $select.find('option[value="character"]').text(game.i18n.localize("osp-houserules.Actor.Type.character"));
    $select.find('option[value="monster"]').text(game.i18n.localize("osp-houserules.Actor.Type.monster"));

    // Disable submit if no type is selected
    $submit.prop("disabled", $select.val() === "");

    // Enable submit when a valid type is chosen
    $select.on("change", function () {
      $submit.prop("disabled", $select.val() === "");
    });
  });

  console.log("osp-houserules Debug: Actor and Item sheets registered successfully");
});

// Register a Handlebars helper for range
Handlebars.registerHelper('range', function(start, end) {
  start = parseInt(start);
  end = parseInt(end);
  let result = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
});

// Register a Handlebars helper for parseInt
Handlebars.registerHelper('parseInt', function(value) {
  return parseInt(value, 10);
});

// Register a Handlebars helper for multiplication
Handlebars.registerHelper('multiply', function(a, b) {
  return (parseFloat(a) || 0) * (parseFloat(b) || 0);
});

// Register a Handlebars helper for calculating ability modifiers (OSE rules)
Handlebars.registerHelper('abilityMod', function(score) {
  const numScore = parseInt(score, 10);
  if (isNaN(numScore)) return '+0';
  
  let modifier;
  if (numScore === 3) modifier = -3;
  else if (numScore >= 4 && numScore <= 5) modifier = -2;
  else if (numScore >= 6 && numScore <= 8) modifier = -1;
  else if (numScore >= 9 && numScore <= 12) modifier = 0;
  else if (numScore >= 13 && numScore <= 15) modifier = +1;
  else if (numScore >= 16 && numScore <= 17) modifier = +2;
  else if (numScore === 18) modifier = +3;
  else modifier = 0; // fallback for scores outside normal range
  
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
});

// Register helper for calculating unarmored AC (10 + DEX modifier)
Handlebars.registerHelper('unarmoredAC', function(dexScore) {
  const numScore = parseInt(dexScore, 10);
  if (isNaN(numScore)) return 10;
  
  let modifier;
  if (numScore === 3) modifier = -3;
  else if (numScore >= 4 && numScore <= 5) modifier = -2;
  else if (numScore >= 6 && numScore <= 8) modifier = -1;
  else if (numScore >= 9 && numScore <= 12) modifier = 0;
  else if (numScore >= 13 && numScore <= 15) modifier = +1;
  else if (numScore >= 16 && numScore <= 17) modifier = +2;
  else if (numScore === 18) modifier = +3;
  else modifier = 0; // fallback for scores outside normal range
  
  return 10 + modifier;
});

// Register helpers for calculating saving throws
Handlebars.registerHelper('getSavingThrow', function(saveType, characterClass, level, race) {
  const classLower = (characterClass || '').toLowerCase();
  const raceLower = (race || '').toLowerCase();
  const charLevel = parseInt(level, 10) || 1;
  
  // OSE Saving Throw tables by class
  const savingThrows = {
    'fighter': {
      'death': [12, 11, 10, 10, 8, 8, 6, 6, 4, 4, 2, 2, 2, 2],
      'wands': [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2],
      'paralysis': [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2],
      'breath': [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
      'spells': [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3]
    },
    'cleric': {
      'death': [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2],
      'wands': [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2, 2],
      'paralysis': [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2],
      'breath': [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3],
      'spells': [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
    },
    'thief': {
      'death': [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2],
      'wands': [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2],
      'paralysis': [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2],
      'breath': [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3],
      'spells': [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
    },
    'magic-user': {
      'death': [13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 6],
      'wands': [14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 7],
      'paralysis': [13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 6],
      'breath': [16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 9],
      'spells': [15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 8]
    }
  };
  
  // Default to fighter if class not found
  const saveTable = savingThrows[classLower] || savingThrows['fighter'];
  const levelIndex = Math.min(Math.max(charLevel - 1, 0), 13);
  let baseValue = saveTable[saveType] ? saveTable[saveType][levelIndex] : 15;
  
  // Apply racial bonuses
  let racialBonus = 0;
  if (raceLower === 'dwarf' && (saveType === 'wands' || saveType === 'spells' || saveType === 'paralysis' || saveType === 'death')) {
    racialBonus = 4; // Dwarves get +4 vs magic
  } else if (raceLower === 'hobbit' && (saveType === 'wands' || saveType === 'spells' || saveType === 'paralysis' || saveType === 'death')) {
    racialBonus = 4; // Hobbits get +4 vs magic
  }
  
  return Math.max(baseValue - racialBonus, 2); // Minimum save of 2
});

// Register a Handlebars helper for next level XP calculation
Handlebars.registerHelper('getNextLevelXP', function(characterClass, level) {
  const classLower = (characterClass || '').toLowerCase();
  const currentLevel = parseInt(level) || 1;
  
  // OSE XP progression tables
  const xpTables = {
    // Fighter progression (and similar classes)
    'fighter': [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000, 960000],
    
    // Cleric progression
    'cleric': [0, 1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000],
    
    // Magic-User progression (higher requirements)
    'magic-user': [0, 2500, 5000, 10000, 20000, 40000, 80000, 150000, 300000, 450000, 600000, 750000, 900000, 1050000, 1200000],
    
    // Thief progression
    'thief': [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000, 880000]
  };

  // Map additional classes to their XP patterns
  const classXPMapping = {
    // Core OSE classes
    'fighter': 'fighter',
    'cleric': 'cleric', 
    'magic-user': 'magic-user',
    'thief': 'thief',
    
    // Advanced Fantasy classes - map to appropriate base class XP tables
    'assassin': 'thief',          // Assassins use thief XP
    'barbarian': 'fighter',       // Barbarians use fighter XP
    'bard': 'thief',              // Bards use thief XP
    'beast master': 'fighter',    // Beast Masters use fighter XP
    'druid': 'cleric',            // Druids use cleric XP
    'knight': 'fighter',          // Knights use fighter XP
    'paladin': 'cleric',          // Paladins use cleric XP
    'ranger': 'fighter',          // Rangers use fighter XP
    'warden': 'fighter',          // Wardens use fighter XP
    
    // Magic users and variants
    'illusionist': 'magic-user',  // Illusionists use magic-user XP
    'mage': 'magic-user',         // Mages use magic-user XP
    
    // Race-as-class options
    'dwarf': 'fighter',           // Dwarf class uses fighter XP
    'elf': 'magic-user',          // Elf class uses magic-user XP (fighter/magic-user hybrid)
    'gnome': 'cleric',            // Gnome class uses cleric XP
    'half-elf': 'fighter',        // Half-Elf class uses fighter XP
    'half-orc': 'fighter',        // Half-Orc class uses fighter XP
    'hobbit': 'thief'             // Hobbit class uses thief XP
  };

  // Get the appropriate XP table for this class
  const mappedClass = classXPMapping[classLower] || 'fighter';
  const xpTable = xpTables[mappedClass];
  
  // Calculate next level XP (if max level, show current level requirement)
  const nextLevel = Math.min(currentLevel + 1, 15); // Max level 15
  const nextLevelIndex = nextLevel - 1; // Convert to array index
  
  return xpTable[nextLevelIndex] || xpTable[14]; // Use max level XP if beyond table
});

// Register a Handlebars helper for XP modifier calculation
Handlebars.registerHelper('getXPModifier', function(characterClass, attributes) {
  const classLower = (characterClass || '').toLowerCase();
  const attrs = attributes || {};
  
  // Prime requisite mapping for each class
  const primeRequisites = {
    // Core OSE classes
    'fighter': ['str'],
    'cleric': ['wis'], 
    'magic-user': ['int'],
    'thief': ['dex'],
    
    // Advanced Fantasy classes
    'assassin': ['str', 'dex'],       // Assassins need both STR and DEX
    'barbarian': ['str', 'con'],      // Barbarians need STR and CON
    'bard': ['dex', 'cha'],           // Bards need DEX and CHA
    'beast master': ['str', 'wis'],   // Beast Masters need STR and WIS
    'druid': ['wis'],                 // Druids use WIS like clerics
    'knight': ['str'],                // Knights use STR like fighters
    'paladin': ['str', 'cha'],        // Paladins need STR and CHA
    'ranger': ['str', 'wis'],         // Rangers need STR and WIS
    'warden': ['str', 'con'],         // Wardens need STR and CON
    
    // Magic users and variants
    'illusionist': ['int'],           // Illusionists use INT
    'mage': ['int'],                  // Mages use INT like magic-users
    
    // Race-as-class options
    'dwarf': ['str'],                 // Dwarf class uses STR
    'elf': ['int', 'str'],            // Elf class needs INT and STR
    'gnome': ['int'],                 // Gnome class uses INT
    'half-elf': ['str', 'int'],       // Half-Elf class needs STR and INT
    'half-orc': ['str'],              // Half-Orc class uses STR
    'hobbit': ['dex', 'str']          // Hobbit class needs DEX and STR
  };

  const classReqs = primeRequisites[classLower] || ['str'];
  
  // OSE XP modifier table based on ability scores
  const getXPModifier = (score) => {
    const numScore = parseInt(score) || 10;
    if (numScore <= 8) return -10;      // 3-8: -10%
    if (numScore <= 12) return 0;       // 9-12: No modifier
    if (numScore <= 15) return 5;       // 13-15: +5%
    if (numScore <= 17) return 10;      // 16-17: +10%
    return 15;                          // 18: +15%
  };

  let totalModifier = 0;
  
  if (classReqs.length === 1) {
    // Single prime requisite
    const reqScore = attrs[classReqs[0]]?.value || 10;
    totalModifier = getXPModifier(reqScore);
  } else {
    // Multiple prime requisites - use average
    let modifierSum = 0;
    for (const req of classReqs) {
      const reqScore = attrs[req]?.value || 10;
      modifierSum += getXPModifier(reqScore);
    }
    totalModifier = Math.round(modifierSum / classReqs.length);
  }

  return totalModifier;
});

// Register a Handlebars helper to display prime requisites for a class
Handlebars.registerHelper('getPrimeRequisites', function(characterClass) {
  const classLower = (characterClass || '').toLowerCase();
  
  const primeRequisites = {
    // Core OSE classes
    'fighter': ['STR'],
    'cleric': ['WIS'], 
    'magic-user': ['INT'],
    'thief': ['DEX'],
    
    // Advanced Fantasy classes
    'assassin': ['STR', 'DEX'],
    'barbarian': ['STR', 'CON'],
    'bard': ['DEX', 'CHA'],
    'beast master': ['STR', 'WIS'],
    'druid': ['WIS'],
    'knight': ['STR'],
    'paladin': ['STR', 'CHA'],
    'ranger': ['STR', 'WIS'],
    'warden': ['STR', 'CON'],
    
    // Magic users and variants
    'illusionist': ['INT'],
    'mage': ['INT'],
    
    // Race-as-class options
    'dwarf': ['STR'],
    'elf': ['INT', 'STR'],
    'gnome': ['INT'],
    'half-elf': ['STR', 'INT'],
    'half-orc': ['STR'],
    'hobbit': ['DEX', 'STR']
  };

  const classReqs = primeRequisites[classLower] || ['STR'];
  return classReqs.join(', ');
});

// Register a Handlebars helper for path resolution
Handlebars.registerHelper('path', function(templatePath) {
  return `systems/osp-houserules${templatePath}`;
});

// Unpause the game when Foundry VTT starts
Hooks.once("ready", () => {
  if (game.paused) {
    game.togglePause();
    console.log("osp-houserules: Game automatically unpaused on startup");
  }
});
//# sourceMappingURL=ose.js.map
