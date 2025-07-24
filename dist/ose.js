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
