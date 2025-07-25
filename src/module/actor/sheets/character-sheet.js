import { RaceClassHandler } from './handlers/race-class-handler.js';
import { LanguageHandler } from './handlers/language-handler.js';
import { ItemHandler } from './handlers/item-handler.js';
import { UIHandler } from './handlers/ui-handler.js';
import { ImageHandler } from './handlers/image-handler.js';
import { LayoutHandler } from './handlers/layout-handler.js';
import { CharacterNameHandler } from './handlers/character-name-handler.js';
import { XPProgressHandler } from './handlers/xp-progress-handler.js';

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