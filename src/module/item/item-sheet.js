import { ItemPositionToolHandler } from './handlers/item-position-tool-handler.js';

export class OspItemSheet extends foundry.appv1.sheets.ItemSheet {
  constructor(...args) {
    super(...args);
    this.handlers = new Map();
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "item"],
      width: 520,
      height: 480,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }],
      submitOnChange: true,
      closeOnSubmit: false,
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
    
    // Ensure img is available
    context.img = this.item.img;
    context.name = this.item.name;
    
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

    // Initialize position tool handler only if GM or in development
    if (game.user.isGM) {
      this.ensurePositionToolHandler(html);
    }

    // Setup Size field tooltip to show storedSize
    this._setupSizeTooltip(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Add or remove tags
    html.find(".tag-control").click(this._onTagControl.bind(this));
  }

  /**
   * Ensure position tool handler is initialized
   */
  ensurePositionToolHandler(html) {
    try {
      // Check if there are any positionable elements first
      const positionableElements = html.find('[class*="is-pos-"]');
      if (positionableElements.length === 0) {
        console.log('ItemSheet: No positionable elements found (no is-pos-* classes), skipping position tool');
        return;
      }

      if (this.handlers.has('positionTool')) {
        const existingHandler = this.handlers.get('positionTool');
        if (existingHandler && typeof existingHandler.destroy === 'function') {
          existingHandler.destroy();
        }
        this.handlers.delete('positionTool');
      }
      
      const handler = new ItemPositionToolHandler(html, this.item);
      handler.initialize();
      this.handlers.set('positionTool', handler);
      
      console.log('ItemSheet: Position tool handler initialized successfully');
    } catch (error) {
      console.error('ItemSheet: Failed to initialize position tool handler:', error);
    }
  }

  /**
   * Setup tooltip for Size field to show storedSize value
   */
  _setupSizeTooltip(html) {
    const sizeWrapper = html.find('.size-wrapper');
    if (!sizeWrapper || sizeWrapper.length === 0) {
      console.log('ItemSheet: Size wrapper not found');
      return;
    }

    const storedSize = this.item.system.storedSize;
    if (!storedSize) {
      console.log('ItemSheet: No storedSize value found');
      return;
    }

    console.log('ItemSheet: Setting up size tooltip with storedSize:', storedSize);

    // Create tooltip element
    let tooltip = document.getElementById('item-size-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'item-size-tooltip';
      tooltip.className = 'cs-tooltip';
      tooltip.style.cssText = `
        position: absolute;
        background: #333;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        line-height: 1.4;
        z-index: 10000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s;
        white-space: nowrap;
      `;
      document.body.appendChild(tooltip);
      console.log('ItemSheet: Created tooltip element');
    }

    let tooltipTimeout;

    // Attach events to the wrapper div which can receive mouse events
    sizeWrapper.on('mouseenter', (e) => {
      console.log('ItemSheet: Size field mouseenter');
      clearTimeout(tooltipTimeout);
      tooltipTimeout = setTimeout(() => {
        tooltip.textContent = `Stored Size: ${storedSize}`;
        
        const rect = e.currentTarget.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width / 2) + 'px';
        tooltip.style.top = (rect.top - 30) + 'px';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.opacity = '1';
        console.log('ItemSheet: Tooltip shown');
      }, 500);
    });

    sizeWrapper.on('mouseleave', () => {
      console.log('ItemSheet: Size field mouseleave');
      clearTimeout(tooltipTimeout);
      tooltip.style.opacity = '0';
    });
  }

  /** @override */
  async _updateObject(event, formData) {
    // Ensure name is never empty or undefined
    if (!formData.name || formData.name.trim() === "") {
      formData.name = this.item.name || "Unnamed Item";
    }
    
    return super._updateObject(event, formData);
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
