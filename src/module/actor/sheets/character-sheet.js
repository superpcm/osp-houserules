import { RaceClassHandler } from './handlers/race-class-handler.js';
import { LanguageHandler } from './handlers/language-handler.js';
import { ItemHandler } from './handlers/item-handler.js';
import { UIHandler } from './handlers/ui-handler.js';
import { XPProgressHandler } from './handlers/xp-progress-handler.js';
import { BackgroundHandler } from './handlers/background-handler.js';

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
      width: 600, // Back to original width - tabs extend beyond without scroll
      height: 700,
      resizable: false,
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

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Only initialize handlers if sheet is editable
    if (!this.options.editable) return;

    // Apply Minion Pro font as fallback if CSS doesn't work
    this.ensureMinionProFont(html);

    // Initialize all handlers
    this.initializeHandlers(html);

    // Set up tab system AFTER all other handlers to ensure it has priority
    setTimeout(() => {
      this.setupTabSystem(html);
    }, 100);

    // Add broad click detection for debugging
    html.on('click', '*', (event) => {
      if ($(event.target).closest('.sheet-tabs').length > 0) {
        console.log('CHARACTER-SHEET.JS: Click detected in tab area:', event.target.tagName, event.target.className);
        console.log('CHARACTER-SHEET.JS: Target data-tab:', $(event.target).data('tab'));
      }
    });
  }

  /**
   * Setup manual tab system
   */
  setupTabSystem(html) {
    console.log('CHARACTER-SHEET.JS: Setting up tab system...');
    const tabLinks = html.find('.sheet-tabs a.item');
    const tabSections = html.find('.sheet-body .tab');
    
    console.log('CHARACTER-SHEET.JS: Found tab links:', tabLinks.length);
    console.log('CHARACTER-SHEET.JS: Found tab sections:', tabSections.length);
    
    // Debug: Log each tab link found
    tabLinks.each((i, el) => {
      console.log('CHARACTER-SHEET.JS: Tab link element:', el, 'data-tab:', $(el).data('tab'), 'text:', $(el).text().trim());
    });

    // Force CSS to ensure tabs are always clickable
    html.find('.sheet-tabs').css({
      'position': 'relative',
      'z-index': '9999',
      'pointer-events': 'auto'
    });
    
    tabLinks.css({
      'position': 'relative',
      'z-index': '10000',
      'pointer-events': 'auto',
      'cursor': 'pointer'
    });

    // Set initial active tab
    this.activateTab(html, 'combat');

    // SUPER AGGRESSIVE APPROACH: Multiple layers of event capture
    
    // Method 1: Body-level capture (even higher than document)
    $('body').off('click.tabsystem').on('click.tabsystem', (event) => {
      const $target = $(event.target);
      const $tabItem = $target.closest('.sheet-tabs a.item');
      if ($tabItem.length > 0 && $tabItem.closest(html).length > 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const tabName = $tabItem.data('tab');
        console.log('CHARACTER-SHEET.JS: Tab clicked (body capture):', tabName);
        this.activateTab(html, tabName);
        return false;
      }
    });

    // Method 2: Direct element binding with capture phase
    tabLinks.each((i, el) => {
      // Override any CSS that might block clicks
      $(el).css('pointer-events', 'auto !important');
      
      // Remove any existing listeners first
      el.removeEventListener('click', this._handleTabClick, true);
      el.removeEventListener('click', this._handleTabClick, false);
      
      // Create bound handler
      this._handleTabClick = (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const tabName = $(event.target).data('tab');
        console.log('CHARACTER-SHEET.JS: Tab clicked (direct capture):', tabName);
        this.activateTab(html, tabName);
        return false;
      };
      
      // Bind with capture = true (highest priority)
      el.addEventListener('click', this._handleTabClick, true);
      
      // Also bind as many event types as possible
      ['mouseup', 'mousedown', 'pointerup', 'touchend'].forEach(eventType => {
        el.addEventListener(eventType, (event) => {
          if (eventType === 'mouseup' || eventType === 'pointerup' || eventType === 'touchend') {
            const tabName = $(event.target).data('tab');
            console.log(`CHARACTER-SHEET.JS: Tab ${eventType}:`, tabName);
            this.activateTab(html, tabName);
          }
        }, true);
      });
    });

    // Method 3: Timer-based activation as ultimate fallback
    tabLinks.on('mousedown touchstart', (event) => {
      const $target = $(event.currentTarget);
      const tabName = $target.data('tab');
      console.log('CHARACTER-SHEET.JS: Setting timer for tab:', tabName);
      
      // Clear any existing timer
      if (this._tabTimer) clearTimeout(this._tabTimer);
      
      // Activate after short delay
      this._tabTimer = setTimeout(() => {
        console.log('CHARACTER-SHEET.JS: Timer activation for tab:', tabName);
        this.activateTab(html, tabName);
      }, 100);
    });
    
    // Method 4: Form delegation as backup
    html.off('click.tabsystem').on('click.tabsystem', '.sheet-tabs a.item', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const tabName = $(event.currentTarget).data('tab');
      console.log('CHARACTER-SHEET.JS: Tab clicked (form delegation):', tabName);
      this.activateTab(html, tabName);
    });
    
    console.log('CHARACTER-SHEET.JS: Tab system setup complete');
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
   * Ensure Minion Pro font is applied - minimal fallback if CSS fails
   */
  ensureMinionProFont(html) {
    const nameInput = html.find('#char-name')[0];
    if (nameInput) {
      // Check if CSS applied correctly after a brief delay
      setTimeout(() => {
        const computedStyle = window.getComputedStyle(nameInput);
        if (!computedStyle.fontFamily.includes('Minion Pro')) {
          // CSS failed, apply via JavaScript as fallback
          nameInput.style.setProperty('font-family', "'Minion Pro', serif", 'important');
          nameInput.style.setProperty('font-weight', 'normal', 'important');
          // font-size intentionally not set here; use inline style in HTML for px control
    // min-height removed for full manual control
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
      { name: 'xpProgress', Handler: XPProgressHandler },
      { name: 'background', Handler: BackgroundHandler }
    ];

    // Initialize handlers
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
    // Clean up all tab-related event handlers
    $(document).off('click.tabsystem');
    $('body').off('click.tabsystem');
    
    // Clear any pending timers
    if (this._tabTimer) {
      clearTimeout(this._tabTimer);
      this._tabTimer = null;
    }
    
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

  /**
   * Reset all draggable fields to their original positions
   */
  resetAllFieldsToVisible() {
    const layoutHandler = this.getHandler('layout');
    if (layoutHandler) {
      layoutHandler.resetAllFieldsToVisible();
    }
  }
}