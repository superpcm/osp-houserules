import { RaceClassHandler } from './handlers/race-class-handler.js';
import { LanguageHandler } from './handlers/language-handler.js';
import { ItemHandler } from './handlers/item-handler.js';
import { UIHandler } from './handlers/ui-handler.js';
import { XPProgressHandler } from './handlers/xp-progress-handler.js';
import { BackgroundHandler } from './handlers/background-handler.js';
import { PositionToolHandler } from './handlers/position-tool-handler.js';
import { PortraitTool } from './portrait-tool.js';

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

    // Prepare items for template
    context.weapons = this.actor.system.weapons || [];
    context.armor = this.actor.system.armor || [];
    
    // Organize containers with nested items
    const allContainers = this.actor.system.containers || [];
    const allItems = this.actor.system.items || [];
    const allWeapons = this.actor.system.weapons || [];
    const allArmor = this.actor.system.armor || [];
    
    // Only show TOP-LEVEL containers (not nested in other containers)
    const topLevelContainers = allContainers.filter(container => !container.system.containerId);
    
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
      containerData.containedItems = [
        ...containedItems,
        ...containedWeapons,
        ...containedArmor,
        ...containedContainers
      ];
      
      // Check if container is collapsed (stored in flags)
      containerData.collapsed = this.actor.getFlag('osp-houserules', `container-${container.id}-collapsed`) || false;
      
      return containerData;
    });
    
    // Only show items that are NOT in containers AND are not containers themselves
    context.items = allItems.filter(item => !item.system.containerId && item.type !== 'container');
    
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

  /**
   * Override render to prevent rendering while closing
   */
  async render(force = false, options = {}) {
    // If we're closing, don't render
    if (this._isClosing) {
      return this;
    }
    
    return super.render(force, options);
  }

  activateListeners(html) {
    super.activateListeners(html);

    // ALWAYS initialize position tool handler first, regardless of editable state
    this.ensurePositionToolHandler(html);

    // Container collapse/expand toggle
    html.find('.container-toggle').click(this._onContainerToggle.bind(this));

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
      console.log(`Bio field ${fieldName} updated:`, value);
      await this.actor.update({ [fieldName]: value });
    });

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

    // Check if dropping onto a container
    const dropTarget = event.target.closest('.item-entry[data-item-id]');
    const targetContainer = dropTarget ? this.actor.items.get(dropTarget.dataset.itemId) : null;
    
    console.log('=== DROP DEBUG ===');
    console.log('Drop data:', data);
    console.log('Item being dropped:', itemData.name, 'Type:', itemData.type, 'ID:', itemData._id);
    console.log('Drop target element:', dropTarget);
    console.log('Target container:', targetContainer?.name, 'Type:', targetContainer?.type);
    console.log('Item object:', item);
    console.log('Item has actor?', !!item.actor, 'Item actor ID:', item.actor?.id, 'This actor ID:', this.actor.id);
    
    // Check if this item already exists on this actor
    const existingItemCheck = this.actor.items.get(itemData._id);
    console.log('Existing item on actor?', !!existingItemCheck);
    
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
      
      // Check if there's enough space in the target container
      if (!this._hasContainerSpace(targetContainer, itemData)) {
        ui.notifications.error(`Not enough space in ${targetContainer.name}. Required: ${itemData.system.storedSize}, Available: ${this._getAvailableSpace(targetContainer)}`);
        return false;
      }
      
      itemData.system.containerId = targetContainer.id;
      console.log('Container-in-container: Setting containerId to', targetContainer.id);
    }
    // Weapons/armor can be dropped onto containers
    else if (targetContainer && targetContainer.type === "container") {
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

    console.log('Final containerId to set:', itemData.system.containerId);

    // Handle item from another actor
    if (item.actor && item.actor.id !== this.actor.id) {
      console.log('Path: Item from another actor - delete and create');
      return item.actor.deleteEmbeddedDocuments("Item", [item.id]).then(() => {
        return this.actor.createEmbeddedDocuments("Item", [itemData]);
      });
    }

    // Handle item from this actor (reordering/moving between containers)
    if (item.actor && item.actor.id === this.actor.id) {
      console.log('Path: Updating item with containerId:', itemData.system.containerId);
      return item.update({"system.containerId": itemData.system.containerId});
    }

    // Check if this item already exists on this actor (handles case where item.actor is null)
    const existingItem = this.actor.items.get(itemData._id);
    if (existingItem) {
      console.log('Path: Item exists but item.actor was null - updating existing item');
      return existingItem.update({"system.containerId": itemData.system.containerId});
    }

    // Handle item from compendium or elsewhere
    console.log('Path: Creating new item from compendium or elsewhere');
    return this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  /**
   * Check if container has enough space for an item
   */
  _hasContainerSpace(container, itemData) {
    // Get capacity from the container
    const actorItem = this.actor.items.get(container.id || container._id);
    let capacityStr = actorItem?.system?.capacity;
    
    // Handle corrupted data - if capacity is stringified object or contains "[o"
    if (typeof capacityStr === 'string' && (
      capacityStr.includes('[o') || 
      capacityStr === '[object Object]' || 
      capacityStr === 'undefined' ||
      !capacityStr
    )) {
      console.error('ERROR: Container has corrupted capacity data:', capacityStr);
      ui.notifications.error(`Container "${container.name}" has corrupted capacity data. Please delete and re-add it from the compendium.`);
      return false;
    }
    
    // If capacity is still an object (not stringified), try to extract value
    if (typeof capacityStr === 'object' && capacityStr !== null) {
      // Try various common Foundry DataModel properties
      capacityStr = capacityStr.value 
        || capacityStr._value 
        || capacityStr.default
        || capacityStr._default;
      
      if (!capacityStr) {
        console.error('ERROR: Could not extract capacity string from object');
        ui.notifications.error(`Container "${container.name}" capacity is in an unexpected format.`);
        return false;
      }
    }
    
    const maxCapacity = this._parseCapacity(capacityStr);
    const usedCapacity = this._getUsedCapacity(container);
    const itemSize = this._getItemSlotSize(itemData.system.storedSize || itemData.system.sizeCat);
    
    return (usedCapacity + itemSize) <= maxCapacity;
  }

  /**
   * Get available space in a container
   */
  _getAvailableSpace(container) {
    const capacityStr = container.system?.capacity;
    const maxCapacity = this._parseCapacity(capacityStr);
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
    
    // If it's a string that looks like "[object Object]", it means we need the actual value
    if (typeof capacityStr === 'string' && capacityStr === '[object Object]') {
      console.error('Capacity is stringified object - this should not happen');
      return 0;
    }
    
    // Ensure it's a string
    capacityStr = String(capacityStr);
    
    const match = capacityStr.match(/^(\d+)([TSMLWB])$/);
    
    if (!match) return 0;
    
    const count = parseInt(match[1]);
    const size = match[2];
    
    return count * this._getItemSlotSize(size);
  }

  /**
   * Convert size category to slot count
   * T = 1 slot (25 coins)
   * S = 2 slots (50 coins)
   * M = 4 slots (100 coins)
   * L = 24 slots (600 coins)
   * W (worn) = 0 slots
   * B (bulk) = special handling
   */
  _getItemSlotSize(sizeCat) {
    const sizeMap = {
      'T': 1,
      'S': 2,
      'M': 4,
      'L': 24,
      'W': 0,
      'B': 0
    };
    
    return sizeMap[sizeCat] || 0;
  }
}