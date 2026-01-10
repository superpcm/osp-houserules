import { RaceClassHandler } from './handlers/race-class-handler.js';
import { LanguageHandler } from './handlers/language-handler.js';
import { ItemHandler } from './handlers/item-handler.js';
import { UIHandler } from './handlers/ui-handler.js';
import { XPProgressHandler } from './handlers/xp-progress-handler.js';
import { BackgroundHandler } from './handlers/background-handler.js';
import { PositionToolHandler } from './handlers/position-tool-handler.js';
import { PortraitTool } from './portrait-tool.js';
import { calculateMaxHP } from '../../../config/classes.js';

const { ActorSheet } = foundry.appv1.sheets;

export class OspActorSheetCharacter extends ActorSheet {
  // Skill configuration: defines which skills are available for each class and race
  static SKILL_CONFIG = {
    // Base skills that all characters have
    base: ['listening', 'find-secret-door', 'open-stuck-doors'],
    
    // Race-specific skills (only if no qualifying class)
    races: {
      dwarf: ['detect-construction', 'detect-room-traps'],
      gnome: ['detect-construction'],
      'half-orc': [],
      hobbit: []
    },
    
    // Class-specific skills (take priority over race)
    classes: {
      // Core OSE classes
      fighter: [],
      cleric: [],
      'magic-user': [],
      
      // Advanced Fantasy classes with special skills
      assassin: ['assassination', 'climb-sheer', 'hide-shadows', 'move-silently'],
      barbarian: ['climb-sheer', 'move-silently', 'hide-undergrowth'],
      bard: [],
      'beast master': [],
      druid: [],
      knight: [],
      paladin: [],
      ranger: [],
      warden: [],
      illusionist: [],
      mage: [],
      thief: ['climb-sheer', 'hide-shadows', 'move-silently', 'find-traps', 'open-locks', 'pick-pockets'],
      
      // Race-as-class options
      dwarf: ['detect-construction', 'detect-room-traps'],
      elf: [],
      gnome: ['detect-construction'],
      'half-elf': [],
      'half-orc': ['hide-shadows', 'move-silently', 'pick-pockets'],
      hobbit: []
    }
  };

  // Map skill names to their CSS class selectors
  static SKILL_SELECTORS = {
    'listening': '.cs-pos-listening',
    'find-secret-door': '.cs-pos-find-secret-door',
    'open-stuck-doors': '.cs-pos-open-stuck-doors',
    'detect-construction': '.cs-pos-detect-construction',
    'detect-room-traps': '.cs-pos-detect-room-traps',
    'assassination': '.cs-pos-assassination',
    'climb-sheer': '.cs-pos-climb-sheer',
    'hide-shadows': '.cs-pos-hide-shadows',
    'move-silently': '.cs-pos-move-silently',
    'find-traps': '.cs-pos-find-traps',
    'open-locks': '.cs-pos-open-locks',
    'pick-pockets': '.cs-pos-pick-pockets',
    'hide-undergrowth': '.cs-pos-hide-undergrowth',
    'hide-dungeons': '.cs-pos-hide-dungeons'
  };

  constructor(...args) {
    super(...args);
    this.handlers = new Map();
  }

  /**
   * Helper: Get element with jQuery or vanilla JS fallback
   * @param {jQuery|null} html - jQuery object or null
   * @param {string} selector - CSS selector
   * @returns {jQuery|Element|null} Element or null if not found
   */
  getElement(html, selector) {
    if (html && html.find) {
      const result = html.find(selector);
      return result.length > 0 ? result : null;
    }
    return document.querySelector(selector);
  }

  /**
   * Helper: Get all elements with jQuery or vanilla JS fallback
   * @param {jQuery|null} html - jQuery object or null
   * @param {string} selector - CSS selector
   * @returns {jQuery|NodeList} Elements collection
   */
  getElements(html, selector) {
    return (html && html.find) ? html.find(selector) : document.querySelectorAll(selector);
  }

  /**
   * Helper: Get CSS variable value from element
   * @param {Element} element - DOM element
   * @param {string} varName - CSS variable name (without --)
   * @param {*} defaultValue - Default value if variable not found
   * @returns {string|number|*} Parsed value or default
   */
  getCSSVariable(element, varName, defaultValue = null) {
    try {
      const cs = window.getComputedStyle(element);
      const value = cs.getPropertyValue(`--${varName}`).trim();
      if (!value) return defaultValue;
      
      // Try to parse as number if it looks numeric
      const parsed = parseFloat(value);
      return !isNaN(parsed) ? parsed : value;
    } catch (e) {
      console.error(`CharacterSheet: Failed to read CSS variable --${varName}`, e);
      return defaultValue;
    }
  }

  /**
   * Helper: Handle tab click with common preventDefault/stop logic
   * @param {Event} event - Click event
   * @param {jQuery} html - Sheet HTML
   */
  handleTabClick(event, html) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const tabName = $(event.target).closest('a.item').data('tab') || $(event.target).data('tab');
    if (tabName) {
      this.activateTab(html, tabName);
    }
    return false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "character"],
      template: "systems/osp-houserules/templates/actors/character-sheet.html",
      width: 800, // Increased by 30px (15px padding each side)
      height: 687, // Increased by 30px (15px padding each side)
      resizable: false,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }],
    });
  }

  getData(options) {
    // If we're in the process of closing, don't render
    if (this._isClosing) {
      return {};
    }
    
    const context = super.getData(options);
    context.system = this.actor.system;

    // Initialize position and portrait data if missing
    if (!context.system.levelPosition) {
      context.system.levelPosition = { x: 0, y: 0, zIndex: 0 };
    }
    if (!context.system.userPortrait) {
      context.system.userPortrait = { scale: 1, x: 0, y: 0 };
    }
    if (!context.system.namePosition) {
      context.system.namePosition = { x: 0, y: 0, zIndex: 0 };
    }
    if (!context.system.classPosition) {
      context.system.classPosition = { x: 0, y: 0, zIndex: 0 };
    }

    // Prepare items for template
    // Include regular weapons and items with weapon properties (like Holy Water, Oil Flask)
    const regularWeapons = this.actor.system.weapons || [];
    const itemsWithWeaponProperties = (this.actor.system.items || []).filter(item => 
      item.system.damage && item.system.range && (item.system.melee || item.system.missile)
    );
    context.weapons = [...regularWeapons, ...itemsWithWeaponProperties];
    context.armor = this.actor.system.armor || [];
    
    // Organize containers with nested items
    const allContainers = this.actor.system.containers || [];
    const allItems = this.actor.system.items || [];
    const allWeapons = this.actor.system.weapons || [];
    const allArmor = this.actor.system.armor || [];
    
    // Filter top-level clothing items (equipped, not in containers)
    const topLevelClothing = allItems.filter(item => 
      item.type === "clothing" && 
      !item.system.containerId
    );
    
    context.clothing = topLevelClothing.map(item => {
      // Calculate display weight: unitWeight * quantity
      const itemWeight = parseFloat(item.system.unitWeight || item.system.weight) || 0;
      const currentQuantity = item.system.quantity !== undefined ? item.system.quantity : 1;
      item.displayWeight = Math.round(itemWeight * currentQuantity * 10) / 10;
      
      // If clothing has capacity, treat it like a container
      if (item.system.capacity) {
        // Find items stored in this clothing
        const containedItems = allItems.filter(i => i.system.containerId === item.id);
        const containedWeapons = allWeapons.filter(w => w.system.containerId === item.id);
        const containedArmor = allArmor.filter(a => a.system.containerId === item.id);
        const containedContainers = allContainers.filter(c => c.system.containerId === item.id);
        const containedClothing = topLevelClothing.filter(c => c.system.containerId === item.id);
        
        const allContainedItems = [
          ...containedItems,
          ...containedWeapons,
          ...containedArmor,
          ...containedContainers,
          ...containedClothing
        ];
        
        // Calculate display values for nested items
        allContainedItems.forEach(nestedItem => {
          const nestedWeight = parseFloat(nestedItem.system.unitWeight || nestedItem.system.weight) || 0;
          const nestedQuantity = nestedItem.system.quantity !== undefined ? nestedItem.system.quantity : 1;
          nestedItem.displayWeight = Math.round(nestedWeight * nestedQuantity * 10) / 10;
          
          const storedSize = parseFloat(nestedItem.system.storedSize) || 0;
          nestedItem.displayCapacity = Math.round(storedSize * nestedQuantity);
        });
        
        item.containedItems = allContainedItems;
        
        // Calculate capacity usage
        const capacity = parseFloat(item.system.capacity) || 0;
        let usedCapacity = 0;
        allContainedItems.forEach(nestedItem => {
          const storedSize = parseFloat(nestedItem.system.storedSize) || 0;
          const qty = nestedItem.system.quantity || 1;
          usedCapacity += storedSize * qty;
        });
        
        item.remainingCapacity = Math.round((capacity - usedCapacity) * 10) / 10;
        item.capacityPercentage = capacity > 0 ? Math.round((usedCapacity / capacity) * 100) : 0;
        item.collapsed = this.actor.getFlag('osp-houserules', `container-${item.id}-collapsed`) || false;
      }
      
      return item;
    });
    
    // Only show TOP-LEVEL containers (not nested in other containers)
    const topLevelContainers = allContainers.filter(container => !container.system?.containerId);
    
    context.containers = topLevelContainers.map(container => {
      // Explicitly preserve the id and other properties
      const containerData = {
        id: container.id,
        name: container.name,
        img: container.img,
        type: container.type,
        system: container.system,
        ...container
      };
      
      // Find ALL items in this container - items, weapons, armor, AND nested containers
      const containedItems = allItems.filter(item => item.system.containerId === container.id);
      const containedWeapons = allWeapons.filter(weapon => weapon.system.containerId === container.id);
      const containedArmor = allArmor.filter(armor => armor.system.containerId === container.id);
      const containedContainers = allContainers.filter(c => c.system.containerId === container.id);
      
      // Combine all contained items
      const allContainedItems = [
        ...containedItems,
        ...containedWeapons,
        ...containedArmor,
        ...containedContainers
      ];
      
      // Separate lashed items from stored items
      const storedItems = [];
      const lashedItems = [];
      
      // Calculate display weight for each item and separate by lashed status
      allContainedItems.forEach(item => {
        // Handle both 'unitWeight' and 'weight' field names
        const itemWeight = parseFloat(item.system.unitWeight || item.system.weight) || 0;
        const currentQuantity = item.system.quantity !== undefined ? item.system.quantity : 1;
        const storedSize = parseFloat(item.system.storedSize) || 0;
        const maxQuantity = item;
        
        // Simple weight calculation: weight per unit * quantity, rounded to 1 decimal
        item.displayWeight = Math.round(itemWeight * currentQuantity * 10) / 10;
        
        // Calculate display capacity based on item type
        let itemCapacity;
        if (item.type === "coin") {
          // Coins: each coin takes storedSize slots
          itemCapacity = storedSize * currentQuantity;
        } else if (maxQuantity > 0) {
          // Stackable item with max > 0: calculate proportionally
          itemCapacity = (storedSize / maxQuantity) * currentQuantity;
        } else if (currentQuantity > 1) {
          // Item with quantity > 1 but max = 0: multiply by quantity (unlimited stacking)
          itemCapacity = storedSize * currentQuantity;
        } else {
          // Non-stackable item with quantity = 1: use storedSize as-is
          itemCapacity = storedSize;
        }
        item.displayCapacity = Math.round(itemCapacity); // Round to whole number
        
        // Separate lashed from stored items
        if (item.system.lashed) {
          lashedItems.push(item);
        } else {
          storedItems.push(item);
        }
      });
      
      containerData.containedItems = storedItems;
      containerData.lashedItems = lashedItems;
      
      // Calculate total weight: container weight + all contained items' weights (both stored and lashed)
      // Handle both 'unitWeight' and 'weight' field names
      const containerWeight = parseFloat(container.system.unitWeight || container.system.weight) || 0;
      const containedWeight = allContainedItems.reduce((total, item) => {
        return total + (item.displayWeight || 0);
      }, 0);
      containerData.totalWeight = containerWeight + containedWeight;
      
      // Calculate used capacity: ONLY stored items count, not lashed items
      // For coins: storedSize * quantity (each coin takes 0.04 slots)
      // For stackable items (with max > 0): (storedSize / max) * currentQuantity
      // For non-stackable items: storedSize as-is
      const usedCapacity = storedItems.reduce((total, item) => {
        const storedSize = parseFloat(item.system.storedSize) || 0;
        const currentQuantity = item.system.quantity || 1;
        const maxQuantity = item;
        
        let itemCapacity;
        if (item.type === "coin") {
          // Coins: each coin takes storedSize slots
          itemCapacity = storedSize * currentQuantity;
        } else if (maxQuantity > 0) {
          // Stackable item with max > 0: calculate proportionally
          itemCapacity = (storedSize / maxQuantity) * currentQuantity;
        } else if (currentQuantity > 1) {
          // Item with quantity > 1 but max = 0: multiply by quantity (unlimited stacking)
          itemCapacity = storedSize * currentQuantity;
        } else {
          // Non-stackable item with quantity = 1: use storedSize as-is
          itemCapacity = storedSize;
        }
        
        return total + itemCapacity;
      }, 0);
      
      // Round capacity values to whole numbers
      containerData.usedCapacity = Math.round(usedCapacity);
      
      // Handle capacity as either a number or an object {type, value, max}
      let maxCapacity = 0;
      if (typeof container.system.capacity === 'object' && container.system.capacity !== null) {
        maxCapacity = container.system.capacity.max || 0;
      } else {
        maxCapacity = container.system.capacity || 0;
      }
      
      containerData.maxCapacity = maxCapacity;
      containerData.remainingCapacity = Math.max(0, containerData.maxCapacity - containerData.usedCapacity);
      containerData.capacityPercentage = containerData.maxCapacity > 0 
        ? Math.min(100, (containerData.usedCapacity / containerData.maxCapacity) * 100) 
        : 0;
      
      // Calculate lash slot usage
      const lashSlots = container.system.lashSlots || 0;
      const usedLashSlots = lashedItems.length;
      containerData.lashSlots = lashSlots;
      containerData.usedLashSlots = usedLashSlots;
      containerData.remainingLashSlots = Math.max(0, lashSlots - usedLashSlots);
      
      // Check if container is collapsed (stored in flags)
      containerData.collapsed = this.actor.getFlag('osp-houserules', `container-${container.id}-collapsed`) || false;
      
      // Check if lashed items section is collapsed
      containerData.lashedCollapsed = this.actor.getFlag('osp-houserules', `lashed-${container.id}-collapsed`) || false;
      
      return containerData;
    });
    
    // Only show items that are NOT in containers AND are not containers or clothing themselves
    const generalItems = allItems.filter(item => !item.system.containerId && item.type !== 'container' && item.type !== 'clothing');
    
    // Calculate displayWeight for general items
    generalItems.forEach(item => {
      // Handle both 'unitWeight' and 'weight' field names
      const itemWeight = parseFloat(item.system.unitWeight || item.system.weight) || 0;
      const currentQuantity = item.system.quantity !== undefined ? item.system.quantity : 1;
      
      // Simple weight calculation: weight per unit * quantity, rounded to 1 decimal
      item.displayWeight = Math.round(itemWeight * currentQuantity * 10) / 10;
    });
    
    context.items = generalItems;
    
    context.treasures = this.actor.system.treasures || [];

    // Encumbrance data
    context.totalWeight = this.actor.system.encumbrance?.totalWeight || 0;
    context.maxWeight = this.actor.system.encumbrance?.maxWeight || 100;
    context.encumbrancePercentage = this.actor.system.encumbrance?.percentage || 0;
    
    // Determine encumbrance threshold level for color coding
    if (context.encumbrancePercentage < 33) {
      context.encumbranceLevel = 'light';
    } else if (context.encumbrancePercentage < 66) {
      context.encumbranceLevel = 'normal';
    } else {
      context.encumbranceLevel = 'heavy';
    }

    // Ensure saving throws are available

    context.saves = this.actor.system.saves || {
      death: { value: 0 },
      wands: { value: 0 },
      paralysis: { value: 0 },
      breath: { value: 0 },
      spells: { value: 0 }
    };

    // Calculate Max HP based on class, level, and CON modifier
    const characterClass = this.actor.system.class || '';
    const level = this.actor.system.level || 1;
    const conScore = this.actor.system.attributes?.con?.value || 10;
    context.calculatedMaxHP = calculateMaxHP(characterClass, level, conScore);

    return context;
  }

  /**
   * Override render to prevent rendering while closing and preserve scroll position
   */
  async render(force = false, options = {}) {
    // If we're closing, don't render
    if (this._isClosing) {
      return this;
    }
    
    return super.render(force, options);
  }

  /**
   * Save scroll positions before rendering
   */
  async _render(force, options) {
    // Save scroll position before render
    if (this.element && this.element.length) {
      this._scrollPositions = {};
      
      // Save gear scrollable content (weapons/armor area)
      const gearScrollable = this.element.find('.gear-scrollable-content')[0];
      if (gearScrollable) {
        this._scrollPositions.gear = gearScrollable.scrollTop;
      }
      
      // Save any other scrollable areas
      const scrollableAreas = this.element.find('.scrollable');
      scrollableAreas.each((i, el) => {
        const id = el.id || `scrollable-${i}`;
        this._scrollPositions[id] = el.scrollTop;
      });
    }
    
    return super._render(force, options);
  }

  /**
   * Restore scroll positions after render completes
   */
  setPosition(pos = {}) {
    const result = super.setPosition(pos);
    
    // Restore scroll positions
    if (this._scrollPositions && typeof this._scrollPositions === 'object' && this.element) {
      const html = this.element;
      
      // Use setTimeout to ensure DOM is fully updated
      setTimeout(() => {
        try {
          // Restore gear scrollable content
          if (this._scrollPositions.gear !== undefined) {
            const gearScrollable = html.find('.gear-scrollable-content')[0];
            if (gearScrollable) {
              gearScrollable.scrollTop = this._scrollPositions.gear;
            }
          }
          
          // Restore other scrollable areas
          for (const [id, scrollTop] of Object.entries(this._scrollPositions)) {
            if (id === 'gear') continue;
            
            const element = id.startsWith('scrollable-') 
              ? html.find('.scrollable')[parseInt(id.split('-')[1])]
              : html.find(`#${id}`)[0];
              
            if (element) {
              element.scrollTop = scrollTop;
            }
          }
        } catch (error) {
          console.error('Error restoring scroll positions:', error);
        }
      }, 0);
    }
    
    return result;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // ALWAYS initialize position tool handler first, regardless of editable state
    this.ensurePositionToolHandler(html);

    // Container collapse/expand toggle
    html.find('.container-toggle').click(this._onContainerToggle.bind(this));
    
    // Lashed items collapse/expand toggle
    html.find('.lashed-toggle').click(this._onLashedToggle.bind(this));

    // Add drag-over highlight for containers
    html.find('.container-entry').each((i, el) => {
      let dragCounter = 0; // Track enter/leave events to handle nested elements
      
      el.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        el.classList.add('drag-over');
      });
      
      el.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        // Only remove highlight when we've left all nested elements
        if (dragCounter === 0) {
          el.classList.remove('drag-over');
        }
      });
      
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      
      el.addEventListener('drop', (e) => {
        dragCounter = 0; // Reset counter
        el.classList.remove('drag-over');
      });
    });

    // Only initialize other handlers if sheet is editable
    if (!this.options.editable) {
      return;
    }

    // Initialize all handlers
    this.initializeHandlers(html);

    // Update skill layout based on character class and race
    this.updateSkillLayout(html);

    // Handle all bio textarea changes - use both blur and change events
    html.find('.bio-text-field').on('blur change', async (event) => {
      const fieldName = event.target.name;
      const value = event.target.value;
      await this.actor.update({ [fieldName]: value });
    });

    // Set encumbrance bar widths - each bar shows its portion relative to its section
    const encumbrancePercentage = this.actor.system.encumbrance?.percentage || 0;
    
    // Light bar (0-33%): shows from 0 to min(encumbrance, 33)
    const lightWidth = Math.min(encumbrancePercentage, 33);
    html.find('.encumbrance-bar-light').css('width', `${lightWidth}%`);
    
    // Normal bar (33-66%): shows from 33 to min(encumbrance, 66), but width is relative to its starting position
    const normalWidth = Math.max(0, Math.min(encumbrancePercentage, 66) - 33);
    html.find('.encumbrance-bar-normal').css('width', `${normalWidth}%`);
    
    // Heavy bar (66-100%): shows from 66 to encumbrance, but width is relative to its starting position
    const heavyWidth = Math.max(0, encumbrancePercentage - 66);
    html.find('.encumbrance-bar-heavy').css('width', `${heavyWidth}%`);

    // Auto-resize bio textareas as user types
    this.initializeBioFieldAutoResize(html);

    // Ensure the window close button always works for this sheet instance.
    // Some tools register capturing handlers that can prevent the normal close.
    try {
      const windowApp = html.closest('.window-app')[0];
      if (windowApp) {
        const closeBtn = windowApp.querySelector('.window-header .window-close');
        if (closeBtn) {
          // Cleanup any existing handler for this instance
          if (this._ospCloseHandler && this._ospCloseEl) {
            try { this._ospCloseEl.removeEventListener('click', this._ospCloseHandler, true); } catch(e) {}
            this._ospCloseHandler = null;
            this._ospCloseEl = null;
          }
          this._ospCloseEl = closeBtn;
          this._ospCloseHandler = (e) => {
            // Prevent other handlers from swallowing this click and close the sheet
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
            this.close();
            return false;
          };
          // Use capture phase so our handler runs before potential interfering handlers
          closeBtn.addEventListener('click', this._ospCloseHandler, true);
        }
      }
    } catch (err) {
      console.error('CharacterSheet: failed to attach explicit close handler', err);
    }

    // Set up tab system AFTER all other handlers to ensure it has priority
    setTimeout(() => {
      this.setupTabSystem(html);
    }, 100);
  }

  /**
   * Initialize auto-resize functionality for bio text fields
   */
  initializeBioFieldAutoResize(html) {
    const bioFields = html.find('.bio-text-field');
    
    // Function to auto-resize a textarea based on content
    const autoResize = (textarea) => {
      // Reset height to minimum to get accurate scrollHeight
      textarea.style.height = 'auto';
      // Set height to content height (scrollHeight includes padding)
      textarea.style.height = textarea.scrollHeight + 'px';
    };

    bioFields.each((index, field) => {
      // Auto-resize on input (as user types)
      $(field).on('input', function() {
        autoResize(this);
      });

      // Initial resize to fit existing content - run after a brief delay
      // to ensure DOM is fully ready
      setTimeout(() => {
        autoResize(field);
      }, 50);
    });
  }

  /**
   * Setup manual tab system
   */
  setupTabSystem(html) {
    const tabLinks = html.find('.sheet-tabs a.item');

    // Ensure tabs are clickable and use class-based presentation
    html.find('.sheet-tabs').addClass('cs-tabs');
    tabLinks.addClass('cs-tab-item');

    // Restore previously active tab, or default to 'attributes'
    const activeTab = this._activeTab || 'attributes';
    this.activateTab(html, activeTab);

    // Simple event delegation - single handler on the tab container
    html.off('click.tabsystem').on('click.tabsystem', '.sheet-tabs a.item', (event) => {
      this.handleTabClick(event, html);
    });

    // Ensure tabs sit below the static header by measuring header height and setting .sheet-tabs top
    try {
      this.setTabsTopToHeader(html);
    } catch (e) {
      console.error('CharacterSheet: Failed to set tabs position', e);
    }

    // Auto-calibrate offsets from current DOM positions, then apply computed tab offsets (index-based)
    try {
      this.autoCalibrateTabOffsets(html);
      this.applyComputedTabOffsets(html);

      // Recompute on window resize
      this._tabResizeHandler = () => {
        try { 
          this.setTabsTopToHeader(html); 
        } catch (e) {
          console.error('CharacterSheet: Failed to set tabs position on resize', e);
        }
        try { 
          this.applyComputedTabOffsets(html); 
        } catch (e) {
          console.error('CharacterSheet: Failed to apply tab offsets on resize', e);
        }
      };
      window.addEventListener('resize', this._tabResizeHandler);

      // Observe tab list changes (add/remove) and recompute
      const tabsElement = html.find('.sheet-tabs')[0];
      if (tabsElement && window.MutationObserver) {
        this._tabMutationObserver = new MutationObserver(() => this.applyComputedTabOffsets(html));
        this._tabMutationObserver.observe(tabsElement, { childList: true });
      }
    } catch (err) {
      console.error('CharacterSheet: Failed to initialize tab offset system', err);
    }
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
    
    // Store the active tab so it persists across re-renders
    this._activeTab = tabName;
  }

  /**
   * Override form submission to prevent re-render for race/class changes
   * Updates skill layout dynamically instead
   */
  async _onSubmit(event, options = {}) {
    // Check if this is a race or class change
    const target = event.target;
    const isRaceChange = target?.name === 'system.race';
    const isClassChange = target?.name === 'system.class';
    
    // For race changes, tell XP handler to ignore updates
    if (isRaceChange) {
      this._ignoringRaceChange = true;
    }
    
    // Call parent to handle the actual data update
    await super._onSubmit(event, { ...options, preventRender: (isRaceChange || isClassChange) });
    
    // Clear the flag
    if (isRaceChange) {
      setTimeout(() => {
        this._ignoringRaceChange = false;
      }, 100);
    }
    
    // If race or class changed, update skill layout without full re-render
    if (isRaceChange || isClassChange) {
      const html = this.element;
      this.updateSkillLayout(html);
    }
  }

  /**
   * Ensure Handwritten font is applied - minimal fallback if CSS fails
   */
  ensureHandwrittenFont(html) {
    const nameInput = html.find('#char-name')[0];
    if (nameInput) {
      // Check if CSS applied correctly after a brief delay
      setTimeout(() => {
        const computedStyle = window.getComputedStyle(nameInput);
        if (!computedStyle.fontFamily.includes('Handwritten')) {
          // CSS failed, apply via JavaScript as fallback
          // Prefer class-based fallback so CSS remains centralized
          nameInput.classList.add('cs-handwritten-fallback');
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

    const handlerConfigs = [
      { name: 'raceClass', Handler: RaceClassHandler },
      { name: 'language', Handler: LanguageHandler },
      { name: 'item', Handler: ItemHandler },
      { name: 'ui', Handler: UIHandler },
      { name: 'xpProgress', Handler: XPProgressHandler },
      { name: 'background', Handler: BackgroundHandler },
      { name: 'portrait', Handler: PortraitTool }
    ];

    // Initialize handlers
    handlerConfigs.forEach(({ name, Handler }) => {
      try {
        // PortraitTool uses different constructor signature
        if (name === 'portrait') {
          const handler = new Handler(this);
          handler.initialize();
          this.handlers.set(name, handler);
        } else {
          const handler = new Handler(html, this.actor, this);
          handler.initialize();
          this.handlers.set(name, handler);
        }
      } catch (error) {
        console.error(`CharacterSheet: Failed to initialize handler: ${name}`, error);
      }
    });
  }

  /**
   * Ensure position tool handler is initialized (always runs, handles all edge cases)
   */
  ensurePositionToolHandler(html) {
    try {
      // Clean up any existing handler first to prevent duplicates
      if (this.handlers.has('positionTool')) {
        const existingHandler = this.handlers.get('positionTool');
        if (existingHandler && existingHandler.destroy) {
          existingHandler.destroy();
        }
        this.handlers.delete('positionTool');
      }
      
      const handler = new PositionToolHandler(html, this.actor);
      handler.initialize();
      this.handlers.set('positionTool', handler);
      
      // Verify handler was added
      if (!this.handlers.has('positionTool')) {
        console.error('CharacterSheet: Position tool handler missing from handlers map after creation!');
      }
    } catch (error) {
      console.error('CharacterSheet: Failed to initialize position tool handler:', error);
    }
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
        console.error(`CharacterSheet: Failed to destroy handler: ${name}`, error);
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
    // Set flag to prevent rendering during close
    this._isClosing = true;
    
    this.destroyHandlers();
    // Clean up all tab-related event handlers
    $(document).off('click.tabsystem');
    $('body').off('click.tabsystem');

    // Clear any pending timers
    if (this._tabTimer) {
      clearTimeout(this._tabTimer);
      this._tabTimer = null;
    }

    // Remove resize listener and disconnect mutation observer
    if (this._tabResizeHandler) {
      window.removeEventListener('resize', this._tabResizeHandler);
      this._tabResizeHandler = null;
    }
    if (this._tabMutationObserver) {
      try { 
        this._tabMutationObserver.disconnect(); 
      } catch(e) {
        console.error('CharacterSheet: Failed to disconnect mutation observer', e);
      }
      this._tabMutationObserver = null;
    }

    // Remove any explicit close-button handler we attached
    try {
      if (this._ospCloseEl && this._ospCloseHandler) {
        try { this._ospCloseEl.removeEventListener('click', this._ospCloseHandler, true); } catch(e) {}
      }
    } catch (err) {
      /* ignore */
    }
    this._ospCloseHandler = null;
    this._ospCloseEl = null;

    const result = await super.close(options);
    
    // Clear the closing flag (though sheet should be destroyed at this point)
    this._isClosing = false;
    
    return result;
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
   * Compute tab offsets based on index and apply as CSS variables.
   * Uses data attributes as overrides: data-tab-top / data-tab-left
   */
  applyComputedTabOffsets(html) {
    const tabLinks = this.getElements(html, '.sheet-tabs a.item');
    if (!tabLinks || tabLinks.length === 0) return;

    // Configuration: base offset and step (pixels)
    // These can be overridden by CSS variables on the .sheet-tabs element:
    // --tab-base-top, --tab-step-top, --tab-base-left, --tab-step-left
    // Defaults (original design): large negative top offsets used previously
    let baseTop = -215; // px for first tab (original design)
    let stepTop = 75;   // px between tabs
    let baseLeft = 0;   // starting left offset
    let stepLeft = -24; // left delta per index

    // If we have a tabs element, attempt to read CSS variables or data attributes
    const tabsEl = this.getElement(html, '.sheet-tabs');
    if (tabsEl) {
      const unwrappedTabsEl = tabsEl.jquery ? tabsEl[0] : tabsEl;
      
      // Read CSS variables using helper
      baseTop = this.getCSSVariable(unwrappedTabsEl, 'tab-base-top', baseTop);
      stepTop = this.getCSSVariable(unwrappedTabsEl, 'tab-step-top', stepTop);
      baseLeft = this.getCSSVariable(unwrappedTabsEl, 'tab-base-left', baseLeft);
      stepLeft = this.getCSSVariable(unwrappedTabsEl, 'tab-step-left', stepLeft);

      // Also allow data attributes on the tabs element (data attributes override CSS vars)
      try {
        const dBaseTop = unwrappedTabsEl.getAttribute('data-tab-base-top');
        const dStepTop = unwrappedTabsEl.getAttribute('data-tab-step-top');
        const dBaseLeft = unwrappedTabsEl.getAttribute('data-tab-base-left');
        const dStepLeft = unwrappedTabsEl.getAttribute('data-tab-step-left');
        if (dBaseTop !== null) baseTop = parseFloat(dBaseTop);
        if (dStepTop !== null) stepTop = parseFloat(dStepTop);
        if (dBaseLeft !== null) baseLeft = parseFloat(dBaseLeft);
        if (dStepLeft !== null) stepLeft = parseFloat(dStepLeft);
      } catch (e) {
        console.error('CharacterSheet: Failed to read data attributes', e);
      }
    }

    // For NodeList/jQuery compatibility iterate with index
    for (let i = 0; i < tabLinks.length; i++) {
      const el = tabLinks[i];
      // If jQuery object is present, unwrap
      const dom = (el.jquery) ? el[0] : el;
      if (!dom) continue;

      // Allow explicit data attributes to override computation
      const explicitTop = dom.getAttribute('data-tab-top');
      const explicitLeft = dom.getAttribute('data-tab-left');
      const top = explicitTop !== null ? explicitTop : (baseTop + i * stepTop) + 'px';
      const left = explicitLeft !== null ? explicitLeft : (baseLeft + i * stepLeft) + 'px';

      try {
        dom.style.setProperty('--tab-top', top);
        dom.style.setProperty('--tab-left', left);
      } catch (err) {
        console.error('CharacterSheet: Failed to set tab CSS properties', err);
      }
    }
  }

  /**
   * Measure the static header and set the .sheet-tabs top so tabs start directly below it.
   * This keeps tab placement correct even if the header height changes.
   */
  setTabsTopToHeader(html) {
    const tabsEl = this.getElement(html, '.sheet-tabs');
    const headerEl = this.getElement(html, '.static-header');
    const sheetBody = this.getElement(html, '.sheet-body');
    
    if (!tabsEl || !headerEl || !sheetBody) return;
    
    // Unwrap jQuery if needed
    const unwrappedTabs = tabsEl.jquery ? tabsEl[0] : tabsEl;
    const unwrappedHeader = headerEl.jquery ? headerEl[0] : headerEl;
    const unwrappedBody = sheetBody.jquery ? sheetBody[0] : sheetBody;
    
    try {
      const headerRect = unwrappedHeader.getBoundingClientRect();
      const sheetRect = unwrappedBody.getBoundingClientRect();
      // Compute top relative to the sheet container
      // Move tabs slightly upward (5px) so they don't sit flush with the header border
      const topPx = Math.max(0, Math.round(headerRect.bottom - sheetRect.top) - 5);
      // Apply as a CSS custom property on .sheet-tabs (CSS will pick up via var(--tabs-top))
      try { 
        unwrappedTabs.style.setProperty('--tabs-top', `${topPx}px`); 
      } catch(e) {
        console.error('CharacterSheet: Failed to set tabs-top CSS property', e);
      }
    } catch (e) {
      console.error('CharacterSheet: Failed to measure header position', e);
    }
  }  /**
   * Measure current tab anchor positions and compute base/step offsets.
   * Writes CSS variables to the .sheet-tabs element so future computations use the calibrated values.
   */
  autoCalibrateTabOffsets(html) {
    // Find tab anchors
    const tabAnchors = this.getElements(html, '.sheet-tabs a.item');
    const tabsEl = this.getElement(html, '.sheet-tabs');
    if (!tabAnchors || tabAnchors.length < 2 || !tabsEl) return; // need at least 2 points to compute step

    const unwrappedTabsEl = tabsEl.jquery ? tabsEl[0] : tabsEl;

    // If the tabs element already provides CSS variables or explicit data attributes, don't auto-calibrate
    try {
      const cssBaseTop = this.getCSSVariable(unwrappedTabsEl, 'tab-base-top', null);
      const hasCssVars = cssBaseTop !== null;
      const hasDataAttrs = unwrappedTabsEl.hasAttribute('data-tab-base-top') || 
                          unwrappedTabsEl.hasAttribute('data-tab-step-top') || 
                          unwrappedTabsEl.hasAttribute('data-tab-base-left') || 
                          unwrappedTabsEl.hasAttribute('data-tab-step-left');
      if (hasCssVars || hasDataAttrs) {
        return;
      }
    } catch (e) {
      console.error('CharacterSheet: Failed to check for existing tab configuration', e);
    }

    // Convert to DOM nodes
    const nodes = [];
    for (let i = 0; i < tabAnchors.length; i++) {
      const el = tabAnchors[i];
      nodes.push(el.jquery ? el[0] : el);
    }

    // Measure positions relative to tabsEl
    const tabRect = unwrappedTabsEl.getBoundingClientRect();
    const measured = nodes.map(n => {
      const r = n.getBoundingClientRect();
      return { top: r.top - tabRect.top, left: r.left - tabRect.left };
    });

    // Use first two anchors to compute step; fall back to differences average
    const first = measured[0];
    const second = measured[1];
    const baseTop = first.top;
    const baseLeft = first.left;
    // Compute vertical step as average difference of subsequent items to be robust
    let totalTopStep = 0, totalLeftStep = 0, count = 0;
    for (let i = 1; i < measured.length; i++) {
      totalTopStep += (measured[i].top - measured[i-1].top);
      totalLeftStep += (measured[i].left - measured[i-1].left);
      count++;
    }
    const stepTop = count > 0 ? (totalTopStep / count) : (second.top - first.top);
    const stepLeft = count > 0 ? (totalLeftStep / count) : (second.left - first.left);

    try {
      unwrappedTabsEl.style.setProperty('--tab-base-top', `${Math.round(baseTop)}px`);
      unwrappedTabsEl.style.setProperty('--tab-step-top', `${Math.round(stepTop)}px`);
      unwrappedTabsEl.style.setProperty('--tab-base-left', `${Math.round(baseLeft)}px`);
      unwrappedTabsEl.style.setProperty('--tab-step-left', `${Math.round(stepLeft)}px`);
      // Also write data attributes for convenience
      unwrappedTabsEl.setAttribute('data-tab-base-top', Math.round(baseTop));
      unwrappedTabsEl.setAttribute('data-tab-step-top', Math.round(stepTop));
      unwrappedTabsEl.setAttribute('data-tab-base-left', Math.round(baseLeft));
      unwrappedTabsEl.setAttribute('data-tab-step-left', Math.round(stepLeft));
    } catch (e) {
      console.error('CharacterSheet: Failed to write tab calibration values', e);
    }
  }

  /**
   * Get required skills for a character based on class and race
   * @param {string} characterClass - Character class (lowercase)
   * @param {string} race - Character race (lowercase)
   * @returns {Object} { skills: string[], layoutClass: string, skillsTabClass: string }
   */
  getRequiredSkills(characterClass, race) {
    const config = OspActorSheetCharacter.SKILL_CONFIG;
    let requiredSkills = [...config.base];
    let layoutClass = 'skill-layout-default';
    let skillsTabClass = 'skills-layout-default';
    
    // Check for class-specific skills first (priority)
    if (characterClass && config.classes[characterClass]) {
      requiredSkills = [...requiredSkills, ...config.classes[characterClass]];
      layoutClass = `skill-layout-${characterClass}`;
      
      // Determine Skills tab class - classes that need the skill targets bar
      const classesWithSkillBar = ['assassin', 'barbarian', 'gnome', 'half-orc', 'hobbit', 'thief'];
      if (classesWithSkillBar.includes(characterClass)) {
        skillsTabClass = `skills-layout-${characterClass}`;
      }
      
      // Add race-specific skills if applicable
      if (race && config.races[race]) {
        requiredSkills = [...requiredSkills, ...config.races[race]];
      }
    } else if (race && config.races[race]) {
      // Use race-only skills if no qualifying class
      // Exception: Half-Orcs only get race skills when paired with compatible classes
      if (race !== 'half-orc') {
        requiredSkills = [...requiredSkills, ...config.races[race]];
      }
    }
    
    return { skills: requiredSkills, layoutClass, skillsTabClass };
  }

  /**
   * Apply skill visibility based on required skills
   * @param {jQuery} html - Sheet HTML
   * @param {string[]} requiredSkills - Array of required skill names
   */
  applySkillVisibility(html, requiredSkills) {
    const selectors = OspActorSheetCharacter.SKILL_SELECTORS;
    
    Object.keys(selectors).forEach(skill => {
      const skillElement = html.find(selectors[skill]);
      if (skillElement.length > 0) {
        if (requiredSkills.includes(skill)) {
          skillElement.show();
          // Set default value of 1 if field is empty
          const selectElement = skillElement.find('select');
          if (selectElement.length > 0 && (!selectElement.val() || selectElement.val() === '')) {
            selectElement.val('1');
          }
        } else {
          skillElement.hide();
        }
      }
    });
  }

  /**
   * Get racial skill layout class based on race and class combination
   * @param {string} race - Character race (lowercase)
   * @param {string} characterClass - Character class (lowercase)
   * @returns {string} CSS class name for racial skill layout
   */
  getRacialSkillLayoutClass(race, characterClass) {
    // Dwarf race but not dwarf class - gets dwarf racial skills
    if (race === 'dwarf' && characterClass !== 'dwarf') {
      return 'racial-skill-layout-dwarf';
    }
    
    // Gnome race but not gnome class - gets gnome racial skills
    if (race === 'gnome' && characterClass !== 'gnome') {
      return 'racial-skill-layout-gnome';
    }
    
    // All other scenarios use default (including race-as-class combinations)
    return 'racial-skill-layout-default';
  }

  /**
   * Trigger style recalculation on an element
   * @param {jQuery} element - Element to trigger reflow on
   */
  triggerReflow(element) {
    if (element && element.length > 0) {
      element[0].style.display = 'none';
      element[0].offsetHeight; // trigger reflow
      element[0].style.display = '';
    }
  }

  /**
   * Update skill layout based on character class and race
   * This function dynamically shows/hides skills and applies appropriate positioning
   */
  updateSkillLayout(html) {
    if (!html) html = this.element;
    
    const actorData = this.actor.system;
    const characterClass = actorData.class?.toLowerCase() || '';
    const race = actorData.race?.toLowerCase() || '';
    
    // Get required skills and layout classes
    const { skills, layoutClass, skillsTabClass } = this.getRequiredSkills(characterClass, race);
    
    // Apply skill visibility
    this.applySkillVisibility(html, skills);
    
    // Apply layout CSS classes
    const formElement = this.element.find('form');
    if (formElement.length > 0) {
      // Remove all skill-layout-*, racial-skill-layout-*, and skills-layout-* classes
      const currentClasses = formElement[0].className.split(' ');
      const filteredClasses = currentClasses.filter(cls => 
        !cls.startsWith('skill-layout-') && 
        !cls.startsWith('racial-skill-layout-') && 
        !cls.startsWith('skills-layout-')
      );
      
      // Add the new layout classes
      const racialLayoutClass = this.getRacialSkillLayoutClass(race, characterClass);
      formElement[0].className = [...filteredClasses, layoutClass, skillsTabClass, racialLayoutClass].join(' ');
      
      // Force style recalculation to ensure background images update
      this.triggerReflow(html.find('.tab[data-tab="attributes"]'));
      this.triggerReflow(html.find('.tab[data-tab="skills"]'));
    }
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

  async _onLashedToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const lashedSection = $(event.currentTarget).closest('.lashed-items-section');
    const containerId = lashedSection.data('container-id');
    const currentState = this.actor.getFlag('osp-houserules', `lashed-${containerId}-collapsed`) || false;
    
    await this.actor.setFlag('osp-houserules', `lashed-${containerId}-collapsed`, !currentState);
    this.render(false);
  }

  /**
   * Handle dropping an item onto the sheet
   */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);

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

    // Check if dropping onto a container or a contained item
    let dropTarget = event.target.closest('.item-entry[data-item-id]');
    let targetContainer = dropTarget ? this.actor.items.get(dropTarget.dataset.itemId) : null;
    
    // If we dropped on a contained item (not a container or clothing with capacity), find its parent container
    if (targetContainer && targetContainer.type !== "container" && !(targetContainer.type === "clothing" && targetContainer.system.capacity) && targetContainer.system.containerId) {
      // This is a contained item, find its parent container
      const parentContainerId = targetContainer.system.containerId;
      targetContainer = this.actor.items.get(parentContainerId);
    }
    
    // If target container is itself stored inside another container (and not equipped/worn),
    // traverse up to find the top-level equipped/worn container
    if (targetContainer && (targetContainer.type === "container" || (targetContainer.type === "clothing" && targetContainer.system.capacity)) && targetContainer.system.containerId && !targetContainer.system.equipped) {
      // Container is stored in another container and not equipped - find the top-level container
      let topContainer = targetContainer;
      while (topContainer.system.containerId) {
        const parentContainer = this.actor.items.get(topContainer.system.containerId);
        if (!parentContainer) break; // Safety check
        topContainer = parentContainer;
      }
      targetContainer = topContainer;
    }
    
    // Check if this item already exists on this actor
    const existingItemCheck = this.actor.items.get(itemData._id);
    
    // Check if this is a reordering operation or a new item
    const isReordering = item.actor && item.actor.id === this.actor.id;

    // Special validation for Backpacks - only one can be at top-level
    if (itemData.type === "container" && itemData.name.toLowerCase().includes('backpack')) {
      // Check if adding as top-level (no target container)
      if (!targetContainer || targetContainer.type !== "container") {
        // Count existing top-level backpacks (excluding the one being moved if reordering)
        const existingBackpacks = this.actor.items.filter(i => 
          i.type === "container" && 
          i.name.toLowerCase().includes('backpack') &&
          !i.system.containerId &&
          (!isReordering || i.id !== itemData._id) // Exclude self if reordering
        );
        
        if (existingBackpacks.length > 0) {
          ui.notifications.error("You can only carry one Backpack at a time. Store additional backpacks inside containers.");
          return false;
        }
      }
    }
    
    // Special validation for Belt Pouches - only two can be at top-level
    if (itemData.type === "container" && itemData.name.toLowerCase().includes('pouch')) {
      // Check if adding as top-level (no target container)
      if (!targetContainer || targetContainer.type !== "container") {
        // Count existing top-level pouches (excluding the one being moved if reordering)
        const existingPouches = this.actor.items.filter(i => 
          i.type === "container" && 
          i.name.toLowerCase().includes('pouch') &&
          !i.system.containerId &&
          (!isReordering || i.id !== itemData._id) // Exclude self if reordering
        );
        
        if (existingPouches.length >= 2) {
          ui.notifications.error("You can only carry two Belt Pouches at a time. Store additional pouches inside containers.");
          return false;
        }
      }
    }

    // If the item is of type "item" (not weapon/armor/container), it MUST go into a container
    if (itemData.type === "item" || itemData.type === "coin" || itemData.type === "ammunition") {
      // Check if target is a valid container (container type OR clothing with capacity)
      const isValidContainer = targetContainer && 
        (targetContainer.type === "container" || 
         (targetContainer.type === "clothing" && targetContainer.system.capacity));
      
      if (!isValidContainer) {
        ui.notifications.error("Items must be stored in a container. Drag the item onto a container.");
        return false;
      }

      // Check container type restrictions BEFORE handling coins/ammunition
      if (!this._isItemAllowedInContainer(itemData, targetContainer)) {
        const allowedTypes = targetContainer.system.allowedTypes || [];
        const restriction = allowedTypes.length > 0 ? allowedTypes.join(', ') : 'any';
        ui.notifications.error(`${targetContainer.name} can only hold: ${restriction}`);
        return false;
      }

      // Check maximum item size restriction
      if (targetContainer.system.maxItemSize !== null && 
          targetContainer.system.maxItemSize !== undefined &&
          itemData.system.storedSize > targetContainer.system.maxItemSize) {
        ui.notifications.error(`${item.name} (size ${itemData.system.storedSize}) is too large for ${targetContainer.name} (max size ${targetContainer.system.maxItemSize})`);
        return false;
      }

      // For coins, show quantity dialog
      if (itemData.type === "coin") {
        return this._handleCoinDrop(item, itemData, targetContainer, isReordering);
      }

      // For ammunition, show quantity dialog
      if (itemData.type === "ammunition") {
        return this._handleAmmunitionDrop(item, itemData, targetContainer, isReordering);
      }

      // Check if there's enough space in the container
      if (!this._hasContainerSpace(targetContainer, itemData)) {
        ui.notifications.error(`Not enough space in ${targetContainer.name}. Required: ${itemData.system.storedSize}, Available: ${this._getAvailableSpace(targetContainer)}`);
        return false;
      }

      // Set the container ID
      itemData.system.containerId = targetContainer.id;
    } 
    // Allow containers to be stored in other containers if they're empty
    // Only check for emptiness when reordering (new containers from compendium are always empty)
    else if (itemData.type === "container" && targetContainer && targetContainer.type === "container") {
      // If reordering, check if the container being dropped has any items in it
      if (isReordering) {
        const droppedContainerId = item.id;
        const itemsInDroppedContainer = droppedContainerId ? 
          this.actor.items.filter(i => i.system.containerId === droppedContainerId) : [];
        
        if (itemsInDroppedContainer.length > 0) {
          ui.notifications.error(`Cannot store ${item.name} - it contains ${itemsInDroppedContainer.length} item(s). Empty it first.`);
          return false;
        }
      }
      
      // Check maximum item size restriction
      if (targetContainer.system.maxItemSize !== null && 
          targetContainer.system.maxItemSize !== undefined &&
          itemData.system.storedSize > targetContainer.system.maxItemSize) {
        ui.notifications.error(`${item.name} (size ${itemData.system.storedSize}) is too large for ${targetContainer.name} (max size ${targetContainer.system.maxItemSize})`);
        return false;
      }
      
      // Check if there's enough space in the target container
      if (!this._hasContainerSpace(targetContainer, itemData)) {
        ui.notifications.error(`Not enough space in ${targetContainer.name}. Required: ${itemData.system.storedSize}, Available: ${this._getAvailableSpace(targetContainer)}`);
        return false;
      }
      
      itemData.system.containerId = targetContainer.id;
    }
    // Weapons/armor can be dropped onto containers
    else if (targetContainer && 
             (targetContainer.type === "container" || 
              (targetContainer.type === "clothing" && targetContainer.system.capacity))) {
      // Check container type restrictions
      if (!this._isItemAllowedInContainer(itemData, targetContainer)) {
        const allowedTypes = targetContainer.system.allowedTypes || [];
        const restriction = allowedTypes.length > 0 ? allowedTypes.join(', ') : 'any';
        ui.notifications.error(`${targetContainer.name} can only hold: ${restriction}`);
        return false;
      }

      // Check maximum item size restriction
      if (targetContainer.system.maxItemSize !== null && 
          targetContainer.system.maxItemSize !== undefined &&
          itemData.system.storedSize > targetContainer.system.maxItemSize) {
        ui.notifications.error(`${item.name} (size ${itemData.system.storedSize}) is too large for ${targetContainer.name} (max size ${targetContainer.system.maxItemSize})`);
        return false;
      }

      if (!this._hasContainerSpace(targetContainer, itemData)) {
        ui.notifications.error(`Not enough space in ${targetContainer.name}. Required: ${itemData.system.storedSize}, Available: ${this._getAvailableSpace(targetContainer)}`);
        return false;
      }
      itemData.system.containerId = targetContainer.id;
    }
    // If reordering and not dropped on a container, clear the containerId
    else if (isReordering) {
      itemData.system.containerId = null;
    }
    // For new items from compendium/sidebar not dropped on container, don't set containerId
    // They'll be added as top-level items

    // Handle item from another actor
    if (item.actor && item.actor.id !== this.actor.id) {
      return item.actor.deleteEmbeddedDocuments("Item", [item.id]).then(() => {
        return this.actor.createEmbeddedDocuments("Item", [itemData]);
      });
    }

    // Handle item from this actor (reordering/moving between containers)
    if (item.actor && item.actor.id === this.actor.id) {
      
      // For stacked items (quantity > 1) moving to a different container, show dialog
      const movingQty = itemData.system.quantity || 1;
      const currentContainerId = item.system.containerId;
      const targetContainerId = targetContainer?.id || null;
      
      if (movingQty > 1 && currentContainerId !== targetContainerId && (itemData.type === "item" || itemData.type === "container" || itemData.type === "ammunition")) {
        return this._handleStackedItemDrop(item, itemData, targetContainer, currentContainerId);
      }
      
      // Check if we should stack this item with an existing one in the target container
      if (targetContainer && (itemData.type === "item" || itemData.type === "container" || itemData.type === "ammunition")) {
        // Find matching item in the target container (excluding the item being moved)
        const matchingItem = this.actor.items.find(i => 
          i.id !== item.id && // Don't match with itself
          i.name === itemData.name &&
          i.type === itemData.type &&
          i.system.containerId === targetContainer.id &&
          i.system.storedSize === itemData.system.storedSize
        );
        
        if (matchingItem) {
          // Stack: increase quantity of existing item and delete the moved item
          const currentQty = matchingItem.system.quantity || 1;
          const addingQty = itemData.system.quantity || 1;
          const maxQty = matchingItem;
          const newQty = currentQty + addingQty;
          
          ui.notifications.info(`Merged ${addingQty} ${itemData.name}(s) with existing stack.`);
          
          // Just update quantity - unitWeight stays the same (it's per unit!)
          const updateData = {"system.quantity": newQty};
          
          // Delete the item being moved and update the matching item
          return item.delete().then(() => {
            return matchingItem.update(updateData);
          });
        }
      }
      
      // No matching item found, just update the containerId
      return item.update({"system.containerId": itemData.system.containerId});
    }

    // Check if this item already exists on this actor (handles case where item.actor is null)
    const existingItem = this.actor.items.get(itemData._id);
    if (existingItem) {
      return existingItem.update({"system.containerId": itemData.system.containerId});
    }

    // Handle item from compendium or elsewhere - check for stacking
    
    // Check if we should stack this item with an existing one
    if (targetContainer && (itemData.type === "item" || itemData.type === "container" || itemData.type === "ammunition")) {
      // Find matching item in the same container
      const matchingItem = this.actor.items.find(i => 
        i.name === itemData.name &&
        i.type === itemData.type &&
        i.system.containerId === targetContainer.id &&
        i.system.storedSize === itemData.system.storedSize
      );
      
      if (matchingItem) {
        // Stack: increase quantity of existing item
        const currentQty = matchingItem.system.quantity || 1;
        const addingQty = itemData.system.quantity || 1;
        const maxQty = matchingItem;
        const newQty = currentQty + addingQty;
        
        ui.notifications.info(`Added ${addingQty} ${itemData.name}(s) to existing stack.`);
        
        // Just update quantity - unitWeight stays the same (it's per unit!)
        const updateData = {"system.quantity": newQty};
        
        return matchingItem.update(updateData);
      }
    }
    
    // No matching item found, create new
    return this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  /**
   * Check if an item is allowed in a container based on type restrictions
   */
  _isItemAllowedInContainer(itemData, container) {
    const allowedTypes = container.system?.allowedTypes;
    
    // If no restrictions, allow any item
    if (!allowedTypes || !Array.isArray(allowedTypes) || allowedTypes.length === 0) {
      return true;
    }
    
    // Check if item has any of the allowed tags
    const itemTags = itemData.system?.tags || [];
    
    // Debug logging
    console.log('Container restriction check:', {
      container: container.name,
      allowedTypes: allowedTypes,
      itemName: itemData.name,
      itemType: itemData.type,
      itemTags: itemTags,
      hasMatch: itemTags.some(tag => allowedTypes.includes(tag))
    });
    
    // If container has restrictions but item has no tags, reject it
    if (itemTags.length === 0) {
      return false;
    }
    
    // Check if any item tag matches allowed types
    return itemTags.some(tag => allowedTypes.includes(tag));
  }

  /**
   * Check if container has space for an item
   */
  _hasContainerSpace(container, itemData) {
    const capacity = parseFloat(container.system?.capacity);
    
    if (isNaN(capacity) || capacity <= 0) {
      console.error('ERROR: Container capacity must be a positive number', container.system?.capacity);
      ui.notifications.error(`Container "${container.name}" has invalid capacity. Delete and re-add the container.`);
      return false;
    }
    
    const maxCapacity = capacity;
    const usedCapacity = this._getUsedCapacity(container);
    
    // Calculate the space needed for the item being added
    const storedSize = parseFloat(itemData.system.storedSize) || 0;
    const currentQuantity = itemData.system.quantity || 1;
    const maxQuantity = itemData;
    
    let itemSize;
    if (itemData.type === "coin") {
      // Coins: each coin takes storedSize slots
      itemSize = storedSize * currentQuantity;
    } else if (maxQuantity > 0) {
      // Stackable item with max > 0: calculate proportionally
      itemSize = (storedSize / maxQuantity) * currentQuantity;
    } else if (currentQuantity > 1) {
      // Item with quantity > 1 but max = 0: multiply by quantity (unlimited stacking)
      itemSize = storedSize * currentQuantity;
    } else {
      // Non-stackable item with quantity = 1: use storedSize as-is
      itemSize = storedSize;
    }
    
    return (usedCapacity + itemSize) <= maxCapacity;
  }

  /**
   * Get available space in a container
   */
  _getAvailableSpace(container) {
    const maxCapacity = container.system?.capacity || 0;
    const usedCapacity = this._getUsedCapacity(container);
    return maxCapacity - usedCapacity;
  }

  /**
   * Calculate used capacity in a container
   */
  _getUsedCapacity(container) {
    let total = 0;
    
    // Find all items in this container (ONLY stored items, not lashed items)
    const itemsInContainer = this.actor.items.filter(item => 
      item.system.containerId === container.id && !item.system.lashed
    );
    
    itemsInContainer.forEach(item => {
      const storedSize = parseFloat(item.system.storedSize) || 0;
      const currentQuantity = item.system.quantity || 1;
      const maxQuantity = item;
      
      let itemCapacity;
      if (item.type === "coin") {
        // Coins: each coin takes storedSize slots
        itemCapacity = storedSize * currentQuantity;
      } else if (maxQuantity > 0) {
        // Stackable item with max > 0: calculate proportionally
        itemCapacity = (storedSize / maxQuantity) * currentQuantity;
      } else if (currentQuantity > 1) {
        // Item with quantity > 1 but max = 0: multiply by quantity (unlimited stacking)
        itemCapacity = storedSize * currentQuantity;
      } else {
        // Non-stackable item with quantity = 1: use storedSize as-is
        itemCapacity = storedSize;
      }
      
      total += itemCapacity;
    });
    
    return total;
  }

  /**
   * Handle dropping stacked items with quantity dialog
   */
  async _handleStackedItemDrop(item, itemData, targetContainer, currentContainerId) {
    const totalQuantity = itemData.system.quantity || 1;
    
    // Show dialog to ask how many to move
    return new Promise((resolve) => {
      const content = `
        <form>
          <div class="form-group">
            <label>Current Quantity: <strong>${totalQuantity}</strong></label>
            <label style="margin-top: 10px;">Move how many to ${targetContainer ? targetContainer.name : 'top level'}?</label>
            <input type="number" name="moveQuantity" value="${totalQuantity}" min="1" max="${totalQuantity}" style="width: 100%;" autofocus />
          </div>
        </form>
      `;

      new Dialog({
        title: `Move ${item.name}`,
        content: content,
        buttons: {
          moveAll: {
            icon: '<i class="fas fa-arrows-alt"></i>',
            label: "Move All",
            callback: async () => {
              // Check if there's a matching item in target to stack with
              const matchingItem = this.actor.items.find(i => 
                i.id !== item.id &&
                i.name === itemData.name &&
                i.type === itemData.type &&
                i.system.containerId === (targetContainer?.id || null) &&
                i.system.storedSize === itemData.system.storedSize
              );
              
              if (matchingItem) {
                // Stack with existing item
                const newTargetQty = (matchingItem.system.quantity || 1) + totalQuantity;
                await matchingItem.update({"system.quantity": newTargetQty});
                await item.delete();
                ui.notifications.info(`Merged ${totalQuantity} ${itemData.name}(s) with existing stack.`);
              } else {
                // Move all - just update the containerId
                await item.update({"system.containerId": itemData.system.containerId});
              }
              resolve(true);
            }
          },
          moveSpecific: {
            icon: '<i class="fas fa-hand-holding"></i>',
            label: "Move Quantity",
            callback: async (html) => {
              const moveQty = parseInt(html.find('[name="moveQuantity"]').val());
              
              if (moveQty <= 0 || moveQty > totalQuantity) {
                ui.notifications.error(`Invalid quantity. Must be between 1 and ${totalQuantity}`);
                resolve(false);
                return;
              }
              
              if (moveQty === totalQuantity) {
                // Moving all - check if there's a matching item in target to stack with
                const matchingItemAll = this.actor.items.find(i => 
                  i.id !== item.id &&
                  i.name === itemData.name &&
                  i.type === itemData.type &&
                  i.system.containerId === (targetContainer?.id || null) &&
                  i.system.storedSize === itemData.system.storedSize
                );
                
                if (matchingItemAll) {
                  // Stack with existing item
                  const newTargetQty = (matchingItemAll.system.quantity || 1) + totalQuantity;
                  await matchingItemAll.update({"system.quantity": newTargetQty});
                  await item.delete();
                  ui.notifications.info(`Merged ${totalQuantity} ${itemData.name}(s) with existing stack.`);
                } else {
                  // Just update the containerId
                  await item.update({"system.containerId": itemData.system.containerId});
                }
                resolve(true);
                return;
              }
              
              // Moving partial quantity - check if there's a matching item in target
              const matchingItem = this.actor.items.find(i => 
                i.id !== item.id &&
                i.name === itemData.name &&
                i.type === itemData.type &&
                i.system.containerId === (targetContainer?.id || null) &&
                i.system.storedSize === itemData.system.storedSize
              );
              
              if (matchingItem) {
                // Stack with existing item
                const newTargetQty = (matchingItem.system.quantity || 1) + moveQty;
                const newSourceQty = totalQuantity - moveQty;
                
                await matchingItem.update({"system.quantity": newTargetQty});
                await item.update({"system.quantity": newSourceQty});
                ui.notifications.info(`Moved ${moveQty} ${itemData.name}(s) to existing stack.`);
              } else {
                // Create new item in target location
                const newItemData = foundry.utils.duplicate(itemData);
                newItemData.system.quantity = moveQty;
                newItemData.system.containerId = targetContainer?.id || null;
                delete newItemData._id; // Remove ID so a new one is generated
                
                // Reduce quantity of source item
                const newSourceQty = totalQuantity - moveQty;
                await item.update({"system.quantity": newSourceQty});
                await this.actor.createEmbeddedDocuments("Item", [newItemData]);
                ui.notifications.info(`Moved ${moveQty} ${itemData.name}(s).`);
              }
              
              resolve(true);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve(false)
          }
        },
        default: "moveSpecific"
      }).render(true);
    });
  }

  /**
   * Handle dropping coins into a container with quantity dialog
   */
  async _handleCoinDrop(item, itemData, targetContainer, isReordering) {
    const currentQuantity = itemData.system.quantity || 0;
    const availableSpace = this._getAvailableSpace(targetContainer);
    const storedSize = parseFloat(itemData.system.storedSize) || 0.04;
    const maxCoins = Math.floor(availableSpace / storedSize);
    
    // Show dialog to ask how many coins to add
    return new Promise((resolve) => {
      const content = `
        <form>
          <div class="form-group">
            <label>How many coins to add to ${targetContainer.name}?</label>
            <input type="number" name="coinQuantity" value="${Math.min(currentQuantity, maxCoins)}" min="0" style="width: 100%;" autofocus />
            <p style="margin-top: 8px; font-size: 12px; color: #666;">
              Available space in container: ${availableSpace} slots<br>
              Maximum coins that fit: ${maxCoins} (each coin = ${storedSize} slots)
            </p>
          </div>
        </form>
      `;

      new Dialog({
        title: `Add ${item.name}`,
        content: content,
        buttons: {
          add: {
            icon: '<i class="fas fa-coins"></i>',
            label: "Add Coins",
            callback: async (html) => {
              const quantity = parseInt(html.find('[name="coinQuantity"]').val());
              
              if (quantity <= 0) {
                ui.notifications.warn("Quantity must be greater than 0");
                resolve(false);
                return;
              }

              if (quantity > maxCoins) {
                ui.notifications.error(`Not enough space in ${targetContainer.name}. Maximum coins that fit: ${maxCoins}`);
                resolve(false);
                return;
              }
              
              // Check if there's already a coin of this type in the target container
              const existingCoin = this.actor.items.find(i => 
                i.type === "coin" &&
                i.name === itemData.name &&
                i.system.containerId === targetContainer.id &&
                (!item.actor || i.id !== item.id) // Don't match with the coin being moved
              );
              
              // Validate space based on whether we're stacking or creating new
              if (existingCoin) {
                // Stacking: check if adding MORE coins to existing stack will fit
                const additionalSpace = storedSize * quantity;
                const availableSpace = this._getAvailableSpace(targetContainer);
                
                if (additionalSpace > availableSpace) {
                  ui.notifications.error(`Not enough space in ${targetContainer.name}. Need ${additionalSpace} slots, have ${availableSpace} available.`);
                  resolve(false);
                  return;
                }
              } else {
                // New stack: validate all coins will fit
                itemData.system.quantity = quantity;
                
                if (!this._hasContainerSpace(targetContainer, itemData)) {
                  ui.notifications.error(`Not enough space in ${targetContainer.name} for ${quantity} coins.`);
                  resolve(false);
                  return;
                }
              }
              
              // Update the item data with the specified quantity
              itemData.system.quantity = quantity;
              
              // Set the container ID
              itemData.system.containerId = targetContainer.id;
              
              // Handle item from another actor
              if (item.actor && item.actor.id !== this.actor.id) {
                if (existingCoin) {
                  // Stack with existing coin
                  const newQuantity = (existingCoin.system.quantity || 0) + quantity;
                  await existingCoin.update({"system.quantity": newQuantity});
                  await item.actor.deleteEmbeddedDocuments("Item", [item.id]);
                  ui.notifications.info(`Added ${quantity} ${itemData.name} to existing stack`);
                } else {
                  await item.actor.deleteEmbeddedDocuments("Item", [item.id]);
                  await this.actor.createEmbeddedDocuments("Item", [itemData]);
                }
              } 
              // Handle reordering within same actor
              else if (item.actor && item.actor.id === this.actor.id) {
                if (existingCoin) {
                  // Stack with existing coin and delete the one being moved
                  const newQuantity = (existingCoin.system.quantity || 0) + quantity;
                  await existingCoin.update({"system.quantity": newQuantity});
                  await item.delete();
                  ui.notifications.info(`Merged ${quantity} ${itemData.name} with existing stack`);
                } else {
                  await item.update(itemData);
                }
              }
              // Handle new item from compendium/sidebar (no actor)
              else {
                if (existingCoin) {
                  // Stack with existing coin
                  const newQuantity = (existingCoin.system.quantity || 0) + quantity;
                  await existingCoin.update({"system.quantity": newQuantity});
                  ui.notifications.info(`Added ${quantity} ${itemData.name} to existing stack`);
                } else {
                  await this.actor.createEmbeddedDocuments("Item", [itemData]);
                }
              }
              
              resolve(true);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve(false)
          }
        },
        default: "add",
        render: (html) => {
          // Focus and select the input field
          html.find('input[name="coinQuantity"]').focus().select();
        }
      }).render(true);
    });
  }

  /**
   * Handle dropping ammunition with quantity dialog
   */
  async _handleAmmunitionDrop(item, itemData, targetContainer, isReordering) {
    const defaultQuantity = itemData.system.quantity || 1;
    
    return new Promise((resolve) => {
      const content = `
        <form>
          <div class="form-group">
            <label>Add how many ${itemData.name} to ${targetContainer.name}?</label>
            <input type="number" name="ammoQuantity" value="${defaultQuantity}" min="1" style="width: 100%; margin-top: 5px;" autofocus />
          </div>
        </form>
      `;

      new Dialog({
        title: `Add ${itemData.name}`,
        content: content,
        buttons: {
          add: {
            icon: '<i class="fas fa-plus"></i>',
            label: "Add",
            callback: async (html) => {
              const quantity = parseInt(html.find('[name="ammoQuantity"]').val());
              
              if (!quantity || quantity <= 0) {
                ui.notifications.warn("Quantity must be greater than 0");
                resolve(false);
                return;
              }
              
              // Check if there's already ammunition of this type in the target container
              const existingAmmo = this.actor.items.find(i => 
                i.type === "ammunition" &&
                i.name === itemData.name &&
                i.system.containerId === targetContainer.id &&
                (!item.actor || i.id !== item.id) // Don't match with the ammo being moved
              );
              
              // Validate space
              const storedSize = parseFloat(itemData.system.storedSize) || 0;
              if (existingAmmo) {
                // Stacking: check if adding MORE ammunition to existing stack will fit
                const additionalSpace = storedSize * quantity;
                const availableSpace = this._getAvailableSpace(targetContainer);
                
                if (additionalSpace > availableSpace) {
                  ui.notifications.error(`Not enough space in ${targetContainer.name}. Need ${additionalSpace} slots, have ${availableSpace} available.`);
                  resolve(false);
                  return;
                }
              } else {
                // New stack: validate all ammunition will fit
                itemData.system.quantity = quantity;
                
                if (!this._hasContainerSpace(targetContainer, itemData)) {
                  ui.notifications.error(`Not enough space in ${targetContainer.name} for ${quantity} ${itemData.name}.`);
                  resolve(false);
                  return;
                }
              }
              
              // Update the item data with the specified quantity
              itemData.system.quantity = quantity;
              
              // Set the container ID
              itemData.system.containerId = targetContainer.id;
              
              // Handle item from another actor
              if (item.actor && item.actor.id !== this.actor.id) {
                if (existingAmmo) {
                  // Stack with existing ammunition
                  const newQuantity = (existingAmmo.system.quantity || 0) + quantity;
                  await existingAmmo.update({"system.quantity": newQuantity});
                  await item.actor.deleteEmbeddedDocuments("Item", [item.id]);
                  ui.notifications.info(`Added ${quantity} ${itemData.name} to existing stack`);
                } else {
                  await item.actor.deleteEmbeddedDocuments("Item", [item.id]);
                  await this.actor.createEmbeddedDocuments("Item", [itemData]);
                }
              } 
              // Handle reordering within same actor
              else if (item.actor && item.actor.id === this.actor.id) {
                if (existingAmmo) {
                  // Stack with existing ammunition and delete the one being moved
                  const newQuantity = (existingAmmo.system.quantity || 0) + quantity;
                  await existingAmmo.update({"system.quantity": newQuantity});
                  await item.delete();
                  ui.notifications.info(`Merged ${quantity} ${itemData.name} with existing stack`);
                } else {
                  await item.update(itemData);
                }
              }
              // Handle new item from compendium/sidebar (no actor)
              else {
                if (existingAmmo) {
                  // Stack with existing ammunition
                  const newQuantity = (existingAmmo.system.quantity || 0) + quantity;
                  await existingAmmo.update({"system.quantity": newQuantity});
                  ui.notifications.info(`Added ${quantity} ${itemData.name} to existing stack`);
                } else {
                  await this.actor.createEmbeddedDocuments("Item", [itemData]);
                }
              }
              
              resolve(true);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve(false)
          }
        },
        default: "add",
        render: (html) => {
          // Focus and select the input field
          html.find('input[name="ammoQuantity"]').focus().select();
        }
      }).render(true);
    });
  }
}
