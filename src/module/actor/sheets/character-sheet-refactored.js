import { RaceClassHandler } from './handlers/race-class-handler.js';
import { LanguageHandler } from './handlers/language-handler.js';
import { ItemHandler } from './handlers/item-handler.js';
import { UIHandler } from './handlers/ui-handler.js';

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

    console.log("osp-houserules Debug: Saving throws in template context:", context.saves);

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Only initialize handlers if sheet is editable
    if (!this.options.editable) return;

    // Initialize all handlers
    this.initializeHandlers(html);
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
      { name: 'ui', Handler: UIHandler }
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
