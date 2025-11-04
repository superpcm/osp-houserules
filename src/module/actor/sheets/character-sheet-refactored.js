import { RaceClassHandler } from './handlers/race-class-handler.js';
import { LanguageHandler } from './handlers/language-handler.js';
import { ItemHandler } from './handlers/item-handler.js';
import { UIHandler } from './handlers/ui-handler.js';
import { ImageHandler } from './handlers/image-handler.js';

export class OspActorSheetCharacter extends ActorSheet {
  constructor(...args) {
    super(...args);
    this.handlers = new Map();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "character"],
      template: "systems/osp-houserules/templates/actors/character-sheet.html",
      width: 700,
      height: 700,
      resizable: true,
      minimizable: true,
      maximizable: false,
      dragDrop: [{dragSelector: ".item", dropSelector: null}],
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat" }],
    });
  }

  getData(options) {
    const context = super.getData(options);
    context.system = this.actor.system;

    // Prepare items for template
    context.weapons = this.actor.system.weapons || [];
    context.armor = this.actor.system.armor || [];
    
    // Organize containers with nested items
    const allContainers = this.actor.system.containers || [];
    const allItems = this.actor.system.items || [];
    
    context.containers = allContainers.map(container => {
      const containerData = {...container};
      // Find items in this container
      containerData.containedItems = allItems.filter(item => item.system.containerId === container.id);
      // Check if container is collapsed (stored in flags)
      containerData.collapsed = this.actor.getFlag('osp-houserules', `container-${container.id}-collapsed`) || false;
      return containerData;
    });
    
    // Only show items that are NOT in containers
    context.items = allItems.filter(item => !item.system.containerId);
    
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

    // Manual tab handling
    this.setupTabSystem(html);

    // Container collapse/expand toggle
    html.find('.container-toggle').click(this._onContainerToggle.bind(this));

    // Only initialize handlers if sheet is editable
    if (!this.options.editable) return;

    // Initialize all handlers
    this.initializeHandlers(html);
  }

  /**
   * Override to enable drag-drop
   */
  _canDragDrop(selector) {
    console.log('_canDragDrop called:', selector);
    return true;
  }

  /**
   * Handle toggling container collapsed state
   */
  async _onContainerToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const containerEntry = $(event.currentTarget).closest('.item-entry');
    const containerId = containerEntry.data('item-id');
    const currentState = this.actor.getFlag('osp-houserules', `container-${containerId}-collapsed`) || false;
    
    await this.actor.setFlag('osp-houserules', `container-${containerId}-collapsed`, !currentState);
    this.render(false);
  }

  /**
   * Setup manual tab system
   */
  setupTabSystem(html) {
    const tabLinks = html.find('.sheet-tabs a.item');
    const tabSections = html.find('.sheet-body .tab');

    // Set initial active tab
    this.activateTab(html, 'combat');

    // Event delegation from the form level
    html.on('click', '.sheet-tabs a.item', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const tabName = $(event.currentTarget).data('tab');
      this.activateTab(html, tabName);
    });

    // Native DOM events as backup
    tabLinks.each((i, el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tabName = $(event.currentTarget).data('tab');
        this.activateTab(html, tabName);
      }, true);
    });
  }

  /**
   * Activate a specific tab
   */
  activateTab(html, tabName) {
    const tabLinks = html.find('.sheet-tabs a.item');
    const tabSections = html.find('.sheet-body .tab');

    // Remove active class from all tabs and sections
    tabLinks.removeClass('active');
    tabSections.removeClass('active').hide();

    // Add active class to clicked tab and show corresponding section
    const activeLink = tabLinks.filter(`[data-tab="${tabName}"]`);
    const activeSection = tabSections.filter(`[data-tab="${tabName}"]`);

    activeLink.addClass('active');
    activeSection.addClass('active').show();
  }

  /**
   * Initialize all handlers
   */
  initializeHandlers(html) {
    tabLinks.removeClass('active');
    tabSections.removeClass('active').hide();


    // Add active class to clicked tab and show corresponding section
    const activeLink = tabLinks.filter(`[data-tab="${tabName}"]`);
    const activeSection = tabSections.filter(`[data-tab="${tabName}"]`);




    activeLink.addClass('active');
    activeSection.addClass('active').show();


  }

  /**
   * Initialize all event handlers
   */
  initializeHandlers(html) {
    // Clean up existing handlers
    this.destroyHandlers();

    // Create and initialize new handlers
    const handlerConfigs = [
      { name: 'raceClass', Handler: RaceClassHandler },
      { name: 'language', Handler: LanguageHandler },
      { name: 'item', Handler: ItemHandler },
      { name: 'ui', Handler: UIHandler },
      { name: 'image', Handler: ImageHandler }
    ];

    handlerConfigs.forEach(({ name, Handler }) => {
      try {
        const handler = new Handler(html, this.actor);
        handler.initialize();
        this.handlers.set(name, handler);
      } catch (error) {

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

      }
    });
    this.handlers.clear();
  }

  /**
   * Handle dropping an item onto the sheet
   */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    
    console.log('_onDrop called:', data.type);

    // We only handle Item drops with our custom logic
    if (data.type === "Item") {
      return this._onDropItem(event, data);
    }

    // For other types (Actor, etc), use default behavior
    return super._onDrop(event);
  }

  /**
   * Handle dropping an item
   */
  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;

    const item = await Item.implementation.fromDropData(data);
    const itemData = item.toObject();

    // Check if dropping onto a container
    const dropTarget = event.target.closest('.item-entry[data-item-id]');
    const targetContainer = dropTarget ? this.actor.items.get(dropTarget.dataset.itemId) : null;

    console.log('Drop event:', {
      eventTarget: event.target,
      dropTarget: dropTarget,
      targetContainerId: dropTarget?.dataset.itemId,
      targetContainer: targetContainer,
      itemType: itemData.type,
      itemName: itemData.name
    });

    // If the item is of type "item" (not weapon/armor/container), it MUST go into a container
    if (itemData.type === "item") {
      if (!targetContainer || targetContainer.type !== "container") {
        ui.notifications.error("Items must be stored in a container. Drag the item onto a container.");
        return false;
      }

      // Check if there's enough space in the container
      if (!this._hasContainerSpace(targetContainer, itemData)) {
        ui.notifications.error(`Not enough space in ${targetContainer.name}. Required: ${itemData.system.storedSize}, Available: ${this._getAvailableSpace(targetContainer)}`);
        return false;
      }

      // Set the container ID
      itemData.system.containerId = targetContainer.id;
    } 
    // Containers and weapons can be dropped onto containers
    else if (targetContainer && targetContainer.type === "container") {
      if (!this._hasContainerSpace(targetContainer, itemData)) {
        ui.notifications.error(`Not enough space in ${targetContainer.name}. Required: ${itemData.system.storedSize}, Available: ${this._getAvailableSpace(targetContainer)}`);
        return false;
      }
      itemData.system.containerId = targetContainer.id;
    }
    // If not dropped on a container, clear the containerId
    else {
      itemData.system.containerId = null;
    }

    // Handle item from another actor
    if (item.actor && item.actor.id !== this.actor.id) {
      return item.actor.deleteEmbeddedDocuments("Item", [item.id]).then(() => {
        return this.actor.createEmbeddedDocuments("Item", [itemData]);
      });
    }

    // Handle item from this actor (reordering/moving between containers)
    if (item.actor && item.actor.id === this.actor.id) {
      return item.update({"system.containerId": itemData.system.containerId});
    }

    // Handle item from compendium or elsewhere
    return this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  /**
   * Check if container has enough space for an item
   */
  _hasContainerSpace(container, itemData) {
    const maxCapacity = this._parseCapacity(container.system.capacity);
    const usedCapacity = this._getUsedCapacity(container);
    const itemSize = this._getItemSlotSize(itemData.system.storedSize || itemData.system.sizeCat);
    
    return (usedCapacity + itemSize) <= maxCapacity;
  }

  /**
   * Get available space in a container
   */
  _getAvailableSpace(container) {
    const maxCapacity = this._parseCapacity(container.system.capacity);
    const usedCapacity = this._getUsedCapacity(container);
    return maxCapacity - usedCapacity;
  }

  /**
   * Calculate used capacity in a container
   */
  _getUsedCapacity(container) {
    let total = 0;
    
    // Find all items in this container
    const itemsInContainer = this.actor.items.filter(item => 
      item.system.containerId === container.id
    );
    
    itemsInContainer.forEach(item => {
      const itemSize = this._getItemSlotSize(item.system.storedSize || item.system.sizeCat);
      const quantity = item.system.quantity?.value || 1;
      total += itemSize * quantity;
    });
    
    return total;
  }

  /**
   * Parse capacity string (e.g., "6M", "1L") to slot count
   */
  _parseCapacity(capacityStr) {
    if (!capacityStr) return 0;
    const match = capacityStr.match(/^(\d+)([TSMLWB])$/);
    if (!match) return 0;
    
    const count = parseInt(match[1]);
    const size = match[2];
    
    return count * this._getItemSlotSize(size);
  }

  /**
   * Get slot size for a size category
   */
  _getItemSlotSize(size) {
    const sizeToSlots = {
      'T': 1,
      'S': 2,
      'M': 4,
      'L': 24,
      'W': 0,
      'B': 0
    };
    return sizeToSlots[size] || 0;
  }

  /**
   * Handle form submission and ensure derived data is recalculated
   * @param {Event} event - The form submission event
   * @param {Object} formData - The form data being submitted
   */
  async _updateObject(event, formData) {


    // Call the parent class update method
    const result = await super._updateObject(event, formData);

    // Force the actor to recalculate derived data
    if (this.actor) {

      this.actor.prepareDerivedData();

      // Re-render the sheet to show updated values
      this.render(false);
    }

    return result;
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
