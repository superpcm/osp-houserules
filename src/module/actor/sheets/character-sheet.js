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
      height: 653, // Back to original height to fit content without excessive scrolling
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

    // Temporarily disable font handling to isolate infinite loop issue
    // this.ensureHandwrittenFont(html);

    // Initialize all handlers
    this.initializeHandlers(html);

    // Update skill layout based on character class and race
    this.updateSkillLayout(html);

    // Set up tab system AFTER all other handlers to ensure it has priority
    setTimeout(() => {
      this.setupTabSystem(html);
    }, 100);

    // Add broad click detection for debugging
    html.on('click', '*', (event) => {
      if ($(event.target).closest('.sheet-tabs').length > 0) {


      }
    });
  }

  /**
   * Setup manual tab system
   */
  setupTabSystem(html) {

    const tabLinks = html.find('.sheet-tabs a.item');
    const tabSections = html.find('.sheet-body .tab');




    // Debug: Log each tab link found
    tabLinks.each((i, el) => {

    });

  // Ensure tabs are clickable and use class-based presentation
  html.find('.sheet-tabs').addClass('cs-tabs');
  tabLinks.addClass('cs-tab-item');

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

        this.activateTab(html, tabName);
        return false;
      }
    });

    // Method 2: Direct element binding with capture phase
    tabLinks.each((i, el) => {
  // Override any CSS that might block clicks by adding a helper class
  $(el).addClass('cs-force-pointer');

      // Remove any existing listeners first
      el.removeEventListener('click', this._handleTabClick, true);
      el.removeEventListener('click', this._handleTabClick, false);

      // Create bound handler
      this._handleTabClick = (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const tabName = $(event.target).data('tab');

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

            this.activateTab(html, tabName);
          }
        }, true);
      });
    });

    // Method 3: Timer-based activation as ultimate fallback
    tabLinks.on('mousedown touchstart', (event) => {
      const $target = $(event.currentTarget);
      const tabName = $target.data('tab');


      // Clear any existing timer
      if (this._tabTimer) clearTimeout(this._tabTimer);

      // Activate after short delay
      this._tabTimer = setTimeout(() => {

        this.activateTab(html, tabName);
      }, 100);
    });

    // Method 4: Form delegation as backup
    html.off('click.tabsystem').on('click.tabsystem', '.sheet-tabs a.item', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const tabName = $(event.currentTarget).data('tab');

      this.activateTab(html, tabName);
    });


    // Ensure tabs sit below the static header by measuring header height and setting .sheet-tabs top
    try {
      this.setTabsTopToHeader(html);
    } catch (e) {}

    // Auto-calibrate offsets from current DOM positions, then apply computed tab offsets (index-based)
    try {
      this.autoCalibrateTabOffsets(html);
      this.applyComputedTabOffsets(html);

      // Recompute on window resize
      this._tabResizeHandler = () => {
        try { this.setTabsTopToHeader(html); } catch (e) {}
        try { this.applyComputedTabOffsets(html); } catch (e) {}
      };
      window.addEventListener('resize', this._tabResizeHandler);

      // Observe tab list changes (add/remove) and recompute
      const tabsElement = html.find('.sheet-tabs')[0];
      if (tabsElement && window.MutationObserver) {
        this._tabMutationObserver = new MutationObserver(() => this.applyComputedTabOffsets(html));
        this._tabMutationObserver.observe(tabsElement, { childList: true });
      }
    } catch (err) {

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

    // All handlers working - infinite loop issue resolved
    const handlerConfigs = [
      { name: 'raceClass', Handler: RaceClassHandler }, // Fixed infinite loop with Hobbit selection
      { name: 'language', Handler: LanguageHandler }, // Re-enabling with font sizing disabled
      { name: 'item', Handler: ItemHandler }, // Works fine
      { name: 'ui', Handler: UIHandler }, // Works fine
      { name: 'xpProgress', Handler: XPProgressHandler }, // Works fine
      { name: 'background', Handler: BackgroundHandler } // Works fine
    ];

    // Initialize handlers
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
      try { this._tabMutationObserver.disconnect(); } catch(e) {}
      this._tabMutationObserver = null;
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

  /**
   * Compute tab offsets based on index and apply as CSS variables.
   * Uses data attributes as overrides: data-tab-top / data-tab-left
   */
  applyComputedTabOffsets(html) {
    const tabLinks = (html && html.find) ? html.find('.sheet-tabs a.item') : document.querySelectorAll('.sheet-tabs a.item');
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
    let tabsEl = null;
    try {
      tabsEl = (html && html.find) ? html.find('.sheet-tabs')[0] : document.querySelector('.sheet-tabs');
    } catch (e) {
      tabsEl = document.querySelector('.sheet-tabs');
    }
    if (tabsEl) {
      try {
        const cs = window.getComputedStyle(tabsEl);
        const cssBaseTop = cs.getPropertyValue('--tab-base-top').trim();
        const cssStepTop = cs.getPropertyValue('--tab-step-top').trim();
        const cssBaseLeft = cs.getPropertyValue('--tab-base-left').trim();
        const cssStepLeft = cs.getPropertyValue('--tab-step-left').trim();
        if (cssBaseTop) baseTop = parseFloat(cssBaseTop);
        if (cssStepTop) stepTop = parseFloat(cssStepTop);
        if (cssBaseLeft) baseLeft = parseFloat(cssBaseLeft);
        if (cssStepLeft) stepLeft = parseFloat(cssStepLeft);
      } catch (e) {
        // ignore and use defaults
      }

      // Also allow data attributes on the tabs element
      try {
        const dBaseTop = tabsEl.getAttribute('data-tab-base-top');
        const dStepTop = tabsEl.getAttribute('data-tab-step-top');
        const dBaseLeft = tabsEl.getAttribute('data-tab-base-left');
        const dStepLeft = tabsEl.getAttribute('data-tab-step-left');
        if (dBaseTop !== null) baseTop = parseFloat(dBaseTop);
        if (dStepTop !== null) stepTop = parseFloat(dStepTop);
        if (dBaseLeft !== null) baseLeft = parseFloat(dBaseLeft);
        if (dStepLeft !== null) stepLeft = parseFloat(dStepLeft);
      } catch (e) {}
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
        // ignore
      }
    }
  }

  /**
   * Measure the static header and set the .sheet-tabs top so tabs start directly below it.
   * This keeps tab placement correct even if the header height changes.
   */
  setTabsTopToHeader(html) {
    const root = (html && html.find) ? html[0] : document;
    const tabsEl = (html && html.find) ? html.find('.sheet-tabs')[0] : document.querySelector('.sheet-tabs');
    const headerEl = (html && html.find) ? html.find('.static-header')[0] : document.querySelector('.static-header');
    const sheetBody = (html && html.find) ? html.find('.sheet-body')[0] : document.querySelector('.sheet-body');
    if (!tabsEl || !headerEl || !sheetBody) return;
    try {
      const headerRect = headerEl.getBoundingClientRect();
      const sheetRect = sheetBody.getBoundingClientRect();
      // Compute top relative to the sheet container
  // Move tabs slightly upward (5px) so they don't sit flush with the header border
  const topPx = Math.max(0, Math.round(headerRect.bottom - sheetRect.top) - 5);
  // Apply as a CSS custom property on .sheet-tabs (CSS will pick up via var(--tabs-top))
  try { tabsEl.style.setProperty('--tabs-top', `${topPx}px`); } catch(e) {}
    } catch (e) {
      // ignore
    }
  }

  /**
   * Measure current tab anchor positions and compute base/step offsets.
   * Writes CSS variables to the .sheet-tabs element so future computations use the calibrated values.
   */
  autoCalibrateTabOffsets(html) {
    // Find tab anchors
    const tabAnchors = (html && html.find) ? html.find('.sheet-tabs a.item') : document.querySelectorAll('.sheet-tabs a.item');
    const tabsEl = (html && html.find) ? html.find('.sheet-tabs')[0] : document.querySelector('.sheet-tabs');
    if (!tabAnchors || tabAnchors.length < 2 || !tabsEl) return; // need at least 2 points to compute step

    // If the tabs element already provides CSS variables or explicit data attributes, don't auto-calibrate
    try {
      const cs = window.getComputedStyle(tabsEl);
      const cssBaseTop = cs.getPropertyValue('--tab-base-top').trim();
      const hasCssVars = !!cssBaseTop;
      const hasDataAttrs = tabsEl.hasAttribute('data-tab-base-top') || tabsEl.hasAttribute('data-tab-step-top') || tabsEl.hasAttribute('data-tab-base-left') || tabsEl.hasAttribute('data-tab-step-left');
      if (hasCssVars || hasDataAttrs) {

        return;
      }
    } catch (e) {
      // ignore and continue
    }

    // Convert to DOM nodes
    const nodes = [];
    for (let i = 0; i < tabAnchors.length; i++) {
      const el = tabAnchors[i];
      nodes.push(el.jquery ? el[0] : el);
    }

    // Measure positions relative to tabsEl
    const tabRect = tabsEl.getBoundingClientRect();
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


      tabsEl.style.setProperty('--tab-base-top', `${Math.round(baseTop)}px`);
      tabsEl.style.setProperty('--tab-step-top', `${Math.round(stepTop)}px`);
      tabsEl.style.setProperty('--tab-base-left', `${Math.round(baseLeft)}px`);
      tabsEl.style.setProperty('--tab-step-left', `${Math.round(stepLeft)}px`);
      // Also write data attributes for convenience
      tabsEl.setAttribute('data-tab-base-top', Math.round(baseTop));
      tabsEl.setAttribute('data-tab-step-top', Math.round(stepTop));
      tabsEl.setAttribute('data-tab-base-left', Math.round(baseLeft));
      tabsEl.setAttribute('data-tab-step-left', Math.round(stepLeft));
    } catch (e) {
      // ignore failures (e.g., non-DOM environment)
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
    
    // Define skill requirements for each class/race combination
    const skillRequirements = {
      // Base skills that all races have
      base: ['listening', 'find-secret-door', 'open-stuck-doors'],
      
      // Race-specific skills (only if no qualifying class)
      races: {
        dwarf: ['detect-construction', 'detect-room-traps'],
        gnome: ['detect-construction'],
        'half-orc': ['hide-dungeons'],
        hobbit: [] // No additional skills beyond base
      },
      
      // Class-specific skills (take priority over race)
      classes: {
        assassin: ['assassination', 'climb-sheer', 'hide-shadows', 'move-silently'],
        barbarian: ['climb-sheer', 'move-silently', 'hide-undergrowth'],
        thief: ['climb-sheer', 'hide-shadows', 'move-silently', 'find-traps', 'open-locks', 'pick-pockets']
      }
    };
    
    // Map skill names to their CSS class selectors
    const skillSelectors = {
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
    
    // Determine which skills should be shown
    let requiredSkills = [...skillRequirements.base];
    let layoutClass = 'skill-layout-generic';
    
    // Check for class-specific skills first (priority)
    if (characterClass && skillRequirements.classes[characterClass]) {
      requiredSkills = [...requiredSkills, ...skillRequirements.classes[characterClass]];
      layoutClass = `skill-layout-${characterClass}`;
      
      // Add race-specific skills if applicable
      if (race && skillRequirements.races[race]) {
        requiredSkills = [...requiredSkills, ...skillRequirements.races[race]];
        // Use combined layout class for special combinations
        // Note: Dwarves, Gnomes, and Hobbits cannot be Barbarians
        if ((characterClass === 'thief' && race === 'dwarf') ||
            (characterClass === 'thief' && race === 'gnome') ||
            (characterClass === 'cleric' && race === 'gnome') ||
            (characterClass === 'assassin' && race === 'half-orc') ||
            (characterClass === 'barbarian' && race === 'half-orc')) {
          layoutClass = `skill-layout-${race.replace('-', '')}-${characterClass}`;
        }
      }
    } else if (race && skillRequirements.races[race]) {
      // Handle classes without specific skills but with race combinations
      if (characterClass === 'cleric' && race === 'gnome') {
        requiredSkills = [...requiredSkills, ...skillRequirements.races[race]];
        layoutClass = `skill-layout-${race.replace('-', '')}-${characterClass}`;
      } else if (race !== 'half-orc') {
        // Use race-only skills if no qualifying class
        // Exception: Half-Orcs only get race skills when paired with compatible classes (Assassin/Barbarian)
        requiredSkills = [...requiredSkills, ...skillRequirements.races[race]];
        layoutClass = `skill-layout-${race.replace('-', '')}`;
      }
      // Half-Orcs without compatible classes get generic layout
    }
    
    // Show/hide skill fields based on requirements
    Object.keys(skillSelectors).forEach(skill => {
      const skillElement = html.find(skillSelectors[skill]);
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
    
    // Apply the appropriate skill layout CSS class
    const formElement = this.element.find('form');
    if (formElement.length > 0) {
      // Remove all skill-layout-* classes
      const currentClasses = formElement[0].className.split(' ');
      const filteredClasses = currentClasses.filter(cls => !cls.startsWith('skill-layout-'));
      
      // Add the new layout class
      formElement[0].className = [...filteredClasses, layoutClass].join(' ');
      
      // Force style recalculation to ensure background images update
      const combatTab = html.find('.tab[data-tab="combat"]');
      if (combatTab.length > 0) {
        combatTab[0].style.display = 'none';
        combatTab[0].offsetHeight; // trigger reflow
        combatTab[0].style.display = '';
      }
    }
  }
}