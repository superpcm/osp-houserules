import { RaceClassHandler } from './handlers/race-class-handler.js';
import { LanguageHandler } from './handlers/language-handler.js';
import { ItemHandler } from './handlers/item-handler.js';
import { UIHandler } from './handlers/ui-handler.js';
import { ImageHandler } from './handlers/image-handler.js';

const { ActorSheet } = foundry.appv1.sheets;

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
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat" }],
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
    console.log("OSP DEBUG: Actor system saves:", this.actor.system.saves);
    context.saves = this.actor.system.saves || {
      death: { value: 0 },
      wands: { value: 0 },
      paralysis: { value: 0 },
      breath: { value: 0 },
      spells: { value: 0 }
    };

    console.log("OSP DEBUG: Context saves:", context.saves);

    console.log("osp-houserules Debug: Saving throws in template context:", context.saves);

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Manual tab handling
    this.setupTabSystem(html);

    // Only initialize handlers if sheet is editable
    if (!this.options.editable) return;

    // Initialize all handlers
    this.initializeHandlers(html);
  }

  /**
   * Setup manual tab system
   */
  setupTabSystem(html) {
    console.log('CHARACTER-SHEET-REFACTORED.JS: Setting up tab system...');
    const tabLinks = html.find('.sheet-tabs a.item');
    const tabSections = html.find('.sheet-body .tab');
    
    console.log('CHARACTER-SHEET-REFACTORED.JS: Found tab links:', tabLinks.length);
    console.log('CHARACTER-SHEET-REFACTORED.JS: Found tab sections:', tabSections.length);

    // Set initial active tab
    this.activateTab(html, 'combat');

    // Event delegation from the form level
    html.on('click', '.sheet-tabs a.item', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const tabName = $(event.currentTarget).data('tab');
      console.log('CHARACTER-SHEET-REFACTORED.JS: Tab clicked (delegation):', tabName);
      this.activateTab(html, tabName);
    });

    // Native DOM events as backup
    tabLinks.each((i, el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tabName = $(event.currentTarget).data('tab');
        console.log('CHARACTER-SHEET-REFACTORED.JS: Tab clicked (native):', tabName);
        this.activateTab(html, tabName);
      }, true);
    });
    
    console.log('CHARACTER-SHEET-REFACTORED.JS: Tab system setup complete');
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
   * Setup manual tab system
   */
  setupTabSystem(html) {
    console.log('Setting up tab system...');
    const tabLinks = html.find('.sheet-tabs a.item');
    const tabSections = html.find('.sheet-body .tab');
    
    console.log('Found tab links:', tabLinks.length);
    console.log('Found tab sections:', tabSections.length);
    
    tabLinks.each((i, el) => {
      console.log('Tab link:', $(el).data('tab'), $(el).text());
    });
    
    tabSections.each((i, el) => {
      console.log('Tab section:', $(el).data('tab'));
    });

    // Set initial active tab
    this.activateTab(html, 'combat');

    // Add click handlers to tab links with multiple event binding approaches
    tabLinks.off('click.tabs'); // Remove any existing handlers
    
    // Method 1: Direct jQuery click
    tabLinks.on('click.tabs', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const tabName = $(event.currentTarget).data('tab');
      console.log('Tab clicked (jQuery):', tabName);
      this.activateTab(html, tabName);
    });
    
    // Method 2: Native DOM events
    tabLinks.each((i, el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tabName = $(event.currentTarget).data('tab');
        console.log('Tab clicked (native):', tabName);
        this.activateTab(html, tabName);
      });
      
      // Add visual feedback for debugging
      el.addEventListener('mousedown', () => {
        console.log('Tab mousedown detected on:', $(el).data('tab'));
      });
    });
    
    console.log('Tab system setup complete');
  }

  /**
   * Activate a specific tab
   */
  activateTab(html, tabName) {
    console.log('Activating tab:', tabName);
    const tabLinks = html.find('.sheet-tabs a.item');
    const tabSections = html.find('.sheet-body .tab');

    console.log('Deactivating all tabs...');
    // Remove active class from all tabs and sections
    tabLinks.removeClass('active');
    tabSections.removeClass('active').hide();

    console.log('Activating tab:', tabName);
    // Add active class to clicked tab and show corresponding section
    const activeLink = tabLinks.filter(`[data-tab="${tabName}"]`);
    const activeSection = tabSections.filter(`[data-tab="${tabName}"]`);
    
    console.log('Active link found:', activeLink.length);
    console.log('Active section found:', activeSection.length);
    
    activeLink.addClass('active');
    activeSection.addClass('active').show();
    
    console.log('Tab activation complete');
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
        console.error(`Failed to initialize ${name} handler:`, error);
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
   * Handle form submission and ensure derived data is recalculated
   * @param {Event} event - The form submission event
   * @param {Object} formData - The form data being submitted
   */
  async _updateObject(event, formData) {
    console.log("OSP Debug: Character sheet _updateObject called with:", formData);
    
    // Call the parent class update method
    const result = await super._updateObject(event, formData);
    
    // Force the actor to recalculate derived data
    if (this.actor) {
      console.log("OSP Debug: Forcing actor derived data recalculation");
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
