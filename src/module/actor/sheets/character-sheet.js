import { RaceClassHandler } from './handlers/race-class-handler.js';
import { LanguageHandler } from './handlers/language-handler.js';
import { ItemHandler } from './handlers/item-handler.js';
import { UIHandler } from './handlers/ui-handler.js';
import { XPProgressHandler } from './handlers/xp-progress-handler.js';
import { BackgroundHandler } from './handlers/background-handler.js';
import { PositionToolHandler } from './handlers/position-tool-handler.js';
import { PortraitTool } from './portrait-tool.js';
import { calculateMaxHP, XP_TABLES, CLASS_XP_MAPPING } from '../../../config/classes.js';

const { ActorSheet } = foundry.appv1.sheets;

const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SLUNG_MAX = 3;
const isSlungable = (tags) => tags.includes('slungable') || tags.includes('sling')
  || (tags.includes('missile') && tags.includes('two-handed'));
const slungSlots = (item) => item.system.slungSlots ?? 1;

export class OspActorSheetCharacter extends ActorSheet {
  // Skill configuration: defines which skills are available for each class and race
  static SKILL_CONFIG = {
    // Base skills that all characters have
    base: ['listening', 'find-secret-door', 'open-stuck-doors'],
    
    // Race-specific skills (only if no qualifying class)
    races: {
      dwarf: ['detect-construction', 'detect-room-traps'],
      gnome: ['detect-construction', 'hiding'],
      'half-orc': [],
      hobbit: ['hiding']
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
      ranger: ['foraging-hunting', 'stealth'],
      warden: ['foraging-hunting', 'wilderness-surprise-attack'],
      illusionist: [],
      mage: [],
      thief: ['climb-sheer', 'hide-shadows', 'move-silently', 'find-traps', 'open-locks', 'pick-pockets'],

      // Race-as-class options
      dwarf: ['detect-construction', 'detect-room-traps'],
      elf: [],
      gnome: ['detect-construction', 'hiding'],
      'half-elf': [],
      'half-orc': ['hide-shadows', 'move-silently', 'pick-pockets'],
      hobbit: ['hiding']
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
    'hide-dungeons': '.cs-pos-hide-dungeons',
    'foraging-hunting': '.cs-pos-foraging-hunting',
    'stealth': '.cs-pos-stealth',
    'wilderness-surprise-attack': '.cs-pos-wilderness-surprise-attack',
    'hiding': '.cs-pos-hiding'
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
      width: 800,
      height: 835, // 800px content area + ~35px title bar
      resizable: false,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }],
      submitOnClose: true,
    });
  }

  /**
   * Override ProseMirror plugin config so every save path uses preventRender,
   * keeping the editor alive through font/formatting changes.
   */
  _configureProseMirrorPlugins(name, { remove = true } = {}) {
    const save = () => this.saveEditor(name, { remove, preventRender: true });
    return {
      menu: ProseMirror.ProseMirrorMenu.build(ProseMirror.defaultSchema, {
        destroyOnSave: remove,
        onSave: save,
      }),
      keyMaps: ProseMirror.ProseMirrorKeyMaps.build(ProseMirror.defaultSchema, {
        onSave: save,
      }),
    };
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    // Guarantee the prototype token config button is present — it may not render
    // in Foundry v13's AppV1 compatibility layer without an explicit override.
    if (!buttons.find(b => b.class === 'configure-token')) {
      buttons.unshift({
        label: 'Token',
        class: 'configure-token',
        icon: 'fas fa-user-circle',
        onclick: ev => this._onConfigureToken(ev)
      });
    }
    return buttons;
  }

  async getData(options) {
    // If we're in the process of closing, don't render
    if (this._isClosing) {
      return {};
    }
    
    const context = await super.getData(options);
    context.system = this.actor.system;
    context.isGM = game.user.isGM;

    context.enrichedBackground = await TextEditor.enrichHTML(context.system.details?.background || '', { async: true, relativeTo: this.actor });
    context.enrichedNotes = await TextEditor.enrichHTML(context.system.tabNotes || '', { async: true, relativeTo: this.actor });

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
    const regularWeapons = this.actor.items.filter(i => i.type === "weapon");
    const itemsWithWeaponProperties = this.actor.items.filter(item => 
      item.type === "item" && 
      item.system.damage && item.system.range && (item.system.melee || item.system.missile)
    );
    context.weapons = [...regularWeapons, ...itemsWithWeaponProperties];
    context.armor = this.actor.items.filter(i => i.type === "armor");
    
    // Filter equipped weapons and worn armor/shields for Combat tab
    // Unarmed placeholder is a synthetic entry whose sort position is stored in actor flags
    const unarmedSort = this.actor.getFlag('osp-houserules', 'unarmedSort') ?? Number.MAX_SAFE_INTEGER;
    context.equippedWeapons = [
      ...context.weapons.filter(w => w.system.equipped),
      { id: '__unarmed__', sort: unarmedSort, _isUnarmedPlaceholder: true }
    ].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    // Only show armor/shields that are actively equipped (providing AC bonus)
    context.wornArmor = context.armor
      .filter(a => a.system.equipped)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    // All shields (equipped + unequipped, excluding lashed) for combat tab toggle
    context.allShields = context.armor
      .filter(a => a.name.toLowerCase().includes('shield') && !a.system.lashed)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    
    // Organize containers with nested items
    const allContainers = this.actor.items.filter(i => i.type === "container");
    const allItems = this.actor.items.filter(i => i.type === "item");
    const allWeapons = this.actor.items.filter(i => i.type === "weapon");
    const allArmor = this.actor.items.filter(i => i.type === "armor");
    const allAmmunition = this.actor.items.filter(i => i.type === "ammunition");
    const allCoins = this.actor.items.filter(i => i.type === "coin");

    // Consumable weapons (Oil Flask, Holy Water, Darts, etc.) can be readied from containers.
    // When equipped, they appear on the combat tab and hide from their container.
    const isConsumableWeapon = (i) => {
      const tags = i.system?.tags || [];
      return i.type === 'weapon' && (tags.includes('consumable') || (tags.includes('missile') && tags.includes('reload')));
    };
    
    // Filter top-level clothing items (equipped, not in containers)
    const allClothing = this.actor.items.filter(i => i.type === "clothing");
    const topLevelClothing = allClothing.filter(item => !item.system.containerId);
    
    context.clothing = topLevelClothing.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map(item => {
      // Calculate display weight: unitWeight * quantity
      const itemWeight = parseFloat(item.system.unitWeight || item.system.weight) || 0;
      const currentQuantity = item.system.quantity !== undefined ? item.system.quantity : 1;
      item.displayWeight = Math.round(itemWeight * currentQuantity * 10) / 10;
      item.totalWeight = item.displayWeight; // default; overridden below if has capacity

      // If clothing has capacity, treat it like a container
      if (item.system.capacity) {
        // Find items stored in this clothing
        const containedItems = allItems.filter(i => i.system.containerId === item.id);
        const containedWeapons = allWeapons.filter(w => w.system.containerId === item.id && !(w.system.equipped && isConsumableWeapon(w)));
        const containedArmor = allArmor.filter(a => a.system.containerId === item.id);
        const containedAmmunition = allAmmunition.filter(a => a.system.containerId === item.id);
        const containedContainers = allContainers.filter(c => c.system.containerId === item.id);
        const containedClothing = allClothing.filter(c => c.system.containerId === item.id);
        const containedCoins = allCoins.filter(c => c.system.containerId === item.id);

        const allContainedItems = [
          ...containedItems,
          ...containedWeapons,
          ...containedArmor,
          ...containedAmmunition,
          ...containedContainers,
          ...containedClothing,
          ...containedCoins
        ];
        
        // Calculate display values for nested items
        allContainedItems.forEach(nestedItem => {
          const nestedWeight = parseFloat(nestedItem.system.unitWeight || nestedItem.system.weight) || 0;
          const nestedQuantity = nestedItem.system.quantity !== undefined ? nestedItem.system.quantity : 1;
          nestedItem.unitWeight = Math.round(nestedWeight * 10) / 10;
          nestedItem.displayWeight = Math.round(nestedWeight * nestedQuantity * 10) / 10;

          const storedSize = parseFloat(nestedItem.system.storedSize) || 0;
          nestedItem.displayCapacity = Math.round(storedSize * nestedQuantity);
          nestedItem.isConsumableWeapon = isConsumableWeapon(nestedItem);

          if (nestedItem.type === 'container') {
            const subItems = this.actor.items.filter(i => i.system.containerId === nestedItem.id && !i.system.lashed && !(i.system.equipped && isConsumableWeapon(i)));
            subItems.forEach(si => {
              const siWeight = parseFloat(si.system.unitWeight || si.system.weight) || 0;
              const siQty = si.system.quantity || 1;
              si.unitWeight = Math.round(siWeight * 10) / 10;
              si.displayWeight = Math.round(siWeight * siQty * 10) / 10;
              si.displayCapacity = Math.round((parseFloat(si.system.storedSize) || 0) * siQty * 10) / 10;
              si.isConsumableWeapon = isConsumableWeapon(si);
            });
            nestedItem.containedItems = subItems;
            nestedItem.collapsed = this.actor.getFlag('osp-houserules', `container-${nestedItem.id}-collapsed`) ?? false;
          } else {
            nestedItem.containedItems = [];
            nestedItem.collapsed = true;
          }
        });
        
        item.containedItems = allContainedItems;

        const containedWeight = allContainedItems.reduce((total, i) => total + (i.displayWeight || 0), 0);
        item.totalWeight = Math.round((item.displayWeight + containedWeight) * 10) / 10;

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
        item.collapsed = this.actor.getFlag('osp-houserules', `container-${item.id}-collapsed`) ?? true;
      }

      // If clothing has lash slots (e.g. Belt), expose belt attachment data for the template
      if (item.system.lashSlots > 0) {
        const lashedAttachments = allContainers.filter(c => c.system.containerId === item.id && c.system.lashed);
        lashedAttachments.forEach(c => {
          const wt = parseFloat(c.system.unitWeight || c.system.weight) || 0;
          c.displayWeight = Math.round(wt * (c.system.quantity || 1) * 10) / 10;
          c.slotCost = c.system.slotCost || 1;
          // Always (re)assign storedWeapon/storedItem so stale values from prior renders are cleared
          // For capacity containers (pouches etc.) include stackable weapons alongside items.
          // For non-capacity containers (scabbards) keep the storedWeapon-exclusive pattern.
          const hasCapacity = (parseFloat(c.system.capacity) || 0) > 0;
          // Exclude stackable weapons from storedWeapon in capacity containers — they go in storedItems instead
          const storedWeapon = allWeapons.find(w =>
            w.system.containerId === c.id && (!hasCapacity || !isConsumableWeapon(w))
          ) ?? null;
          // Sub-containers stored inside this attachment (e.g. Scabbard, Sword inside Sword Frog)
          c.subContainers = allContainers.filter(sc => sc.system.containerId === c.id).map(sub => {
            const swt2 = parseFloat(sub.system.unitWeight || sub.system.weight) || 0;
            sub.unitWeight = Math.round(swt2 * 10) / 10;
            sub.displayWeight = Math.round(swt2 * (sub.system.quantity || 1) * 10) / 10;
            sub.itemId = sub.id;
            const subWeapon = allWeapons.find(w => w.system.containerId === sub.id) ?? null;
            if (subWeapon) {
              const wt2 = parseFloat(subWeapon.system.unitWeight || subWeapon.system.weight) || 0;
              subWeapon.unitWeight = Math.round(wt2 * 10) / 10;
              subWeapon.displayWeight = Math.round(wt2 * (subWeapon.system.quantity || 1) * 10) / 10;
              subWeapon.itemId = subWeapon.id;
            }
            sub.storedWeapon = subWeapon;
            return sub;
          });
          if (storedWeapon) {
            const swt = parseFloat(storedWeapon.system.unitWeight || storedWeapon.system.weight) || 0;
            storedWeapon.unitWeight = Math.round(swt * 10) / 10;
            storedWeapon.displayWeight = Math.round(swt * (storedWeapon.system.quantity || 1) * 10) / 10;
            storedWeapon.itemId = storedWeapon.id;
          }
          c.storedWeapon = storedWeapon;
          const storedItems = (hasCapacity || !storedWeapon)
            ? this.actor.items.filter(i =>
                i.system.containerId === c.id &&
                (i.type === 'item' || i.type === 'ammunition' || i.type === 'coin' || isConsumableWeapon(i)) &&
                !(i.system.equipped && isConsumableWeapon(i))
              ).map(i => {
                const sit = parseFloat(i.system.unitWeight || i.system.weight) || 0;
                i.unitWeight = Math.round(sit * 10) / 10;
                i.displayWeight = Math.round(sit * (i.system.quantity || 1) * 10) / 10;
                i.itemId = i.id;
                i.isConsumableWeapon = isConsumableWeapon(i);
                return i;
              })
            : [];
          c.storedItems = storedItems;
          c.storedItem = storedItems[0] || null;
          c.hasContents = !!(c.storedWeapon || storedItems.length > 0 || c.subContainers.length > 0);
          const storedContentWeight = (c.storedWeapon?.displayWeight || 0)
            + storedItems.reduce((sum, i) => sum + (i.displayWeight || 0), 0)
            + c.subContainers.reduce((sum, sub) =>
                sum + (sub.displayWeight || 0) + (sub.storedWeapon?.displayWeight || 0), 0);
          c.totalWeight = Math.round((c.displayWeight + storedContentWeight) * 10) / 10;
          c.storageCollapsed = this.actor.getFlag('osp-houserules', `attachment-${c.id}-collapsed`) ?? false;
          // Capacity bar for attachments that are containers
          const cap = parseFloat(c.system.capacity) || 0;
          if (cap > 0) {
            const allStored = this.actor.items.filter(i => i.system.containerId === c.id && !i.system.lashed);
            const usedCap = allStored.reduce((sum, i) => sum + (parseFloat(i.system.storedSize) || 0) * (i.system.quantity || 1), 0);
            c.remainingCapacity = Math.round((cap - usedCap) * 10) / 10;
            c.capacityPercentage = Math.round((usedCap / cap) * 100);
          }
        });
        item.lashedItems = lashedAttachments;
        item.lashSlots = item.system.lashSlots;
        item.usedLashSlots = lashedAttachments.reduce((sum, c) => sum + (c.system.slotCost || 1), 0);
        item.remainingLashSlots = Math.max(0, item.system.lashSlots - item.usedLashSlots);
        item.lashSlotPercentage = item.lashSlots > 0 ? Math.round((item.usedLashSlots / item.lashSlots) * 100) : 0;
        item.lashedCollapsed = this.actor.getFlag('osp-houserules', `lashed-${item.id}-collapsed`) ?? true;
        const lashedWeight = lashedAttachments.reduce((t, c) => t + (c.totalWeight || 0), 0);
        item.totalWeight = Math.round((item.totalWeight + lashedWeight) * 10) / 10;
      }

      return item;
    });
    
    // Slung Items — containers use equipped:true; weapons use equipped:false+no containerId (limbo state)
    const allSlungable = this.actor.items.filter(i => {
      const tags = i.system.tags || [];
      if (!isSlungable(tags)) return false;
      if (i.type === 'weapon') return !i.system.equipped && !i.system.containerId && !i.system.lashed;
      return i.system.equipped;
    });
    const slungItems = allSlungable.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map(item => {
      const wt = parseFloat(item.system.unitWeight || item.system.weight) || 0;
      item.displayWeight = Math.round(wt * (item.system.quantity || 1) * 10) / 10;
      item.unitWeight = Math.round(wt * 10) / 10;
      if ((item.system.tags || []).includes('sling')) {
        const storedWeapon = allWeapons.find(w => w.system.containerId === item.id) ?? null;
        if (storedWeapon) {
          const swt = parseFloat(storedWeapon.system.unitWeight || storedWeapon.system.weight) || 0;
          storedWeapon.unitWeight = Math.round(swt * 10) / 10;
          storedWeapon.displayWeight = Math.round(swt * (storedWeapon.system.quantity || 1) * 10) / 10;
          storedWeapon.itemId = storedWeapon.id;
        }
        item.storedWeapon = storedWeapon;
        const storedIt = (!storedWeapon && allItems.find(i2 => i2.system.containerId === item.id)) || null;
        if (storedIt) {
          const sit = parseFloat(storedIt.system.unitWeight || storedIt.system.weight) || 0;
          storedIt.unitWeight = Math.round(sit * 10) / 10;
          storedIt.displayWeight = Math.round(sit * (storedIt.system.quantity || 1) * 10) / 10;
          storedIt.itemId = storedIt.id;
        }
        item.storedItem = storedIt;
        item.hasStoredContent = !!(item.storedWeapon || item.storedItem);
        item.slingUsedCapacity = item.hasStoredContent ? 1 : 0;
        item.slingCapacityPercentage = item.hasStoredContent ? 100 : 0;
        item.storageCollapsed = this.actor.getFlag('osp-houserules', `sling-${item.id}-collapsed`) ?? true;
      }

      // For slung containers (e.g. quiver), collect contained ammunition for display
      if (item.type === 'container') {
        const containedAmmo = allAmmunition.filter(a => a.system.containerId === item.id);
        if (containedAmmo.length > 0) {
          containedAmmo.forEach(ammo => {
            const awt = parseFloat(ammo.system.unitWeight || ammo.system.weight) || 0;
            ammo.unitWeight = Math.round(awt * 10) / 10;
            ammo.displayWeight = Math.round(awt * (ammo.system.quantity || 1) * 10) / 10;
            ammo.itemId = ammo.id;
          });
          item.containedAmmunition = containedAmmo;
          item.hasStoredContent = true;
          item.storageCollapsed = item.storageCollapsed ??
            (this.actor.getFlag('osp-houserules', `sling-${item.id}-collapsed`) ?? true);
        }
      }

      return item;
    });
    const slungItemIds = new Set(slungItems.map(i => i.id));
    const slungSlotsUsed = slungItems.reduce((sum, i) => sum + slungSlots(i), 0);
    context.slungItems = slungItems;
    context.slungUsed = slungSlotsUsed;
    context.slungMax = SLUNG_MAX;
    context.slungCapacityPercentage = Math.round((slungSlotsUsed / SLUNG_MAX) * 100);
    context.slungTotalWeight = Math.round(
      slungItems.reduce((sum, i) => {
        const storedWt = (i.storedWeapon?.displayWeight || 0) + (i.storedItem?.displayWeight || 0);
        return sum + (i.displayWeight || 0) + storedWt;
      }, 0) * 10
    ) / 10;
    context.slungCollapsed = this.actor.getFlag('osp-houserules', 'slung-collapsed') ?? true;

    // Only show TOP-LEVEL containers (not nested, not lashed, not actively slung)
    const topLevelContainers = allContainers.filter(container =>
      !container.system?.containerId &&
      !container.system?.lashed &&
      !slungItemIds.has(container.id)
    );
    
    context.containers = topLevelContainers.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map(container => {
      // Explicitly preserve the id and other properties
      const containerData = {
        id: container.id,
        name: container.name,
        img: container.img,
        type: container.type,
        system: container.system,
        ...container
      };
      
      // Find ALL items in this container - items, weapons, armor, ammunition, coins, AND nested containers
      const containedItems = allItems.filter(item => item.system.containerId === container.id);
      const containedWeapons = allWeapons.filter(weapon => weapon.system.containerId === container.id && !(weapon.system.equipped && isConsumableWeapon(weapon)));
      const containedArmor = allArmor.filter(armor => armor.system.containerId === container.id);
      const containedAmmunition = allAmmunition.filter(ammo => ammo.system.containerId === container.id);
      const containedContainers = allContainers.filter(c => c.system.containerId === container.id);
      const containedClothing = allClothing.filter(c => c.system.containerId === container.id);
      const containedCoins = allCoins.filter(c => c.system.containerId === container.id);

      // Combine all contained items
      const allContainedItems = [
        ...containedItems,
        ...containedWeapons,
        ...containedArmor,
        ...containedAmmunition,
        ...containedContainers,
        ...containedClothing,
        ...containedCoins
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

        // Simple weight calculation: weight per unit * quantity, rounded to 1 decimal
        item.unitWeight = Math.round(itemWeight * 10) / 10;
        item.displayWeight = Math.round(itemWeight * currentQuantity * 10) / 10;

        // Capacity: storedSize is per-unit; coins use same logic
        const itemCapacity = storedSize * currentQuantity;
        item.displayCapacity = Math.round(itemCapacity * 10) / 10;
        item.isConsumableWeapon = isConsumableWeapon(item);

        // Build sub-items for nested containers so the template can show their contents
        if (item.type === 'container') {
          const subItems = this.actor.items.filter(i => i.system.containerId === item.id && !i.system.lashed && !(i.system.equipped && isConsumableWeapon(i)));
          subItems.forEach(si => {
            const siWeight = parseFloat(si.system.unitWeight || si.system.weight) || 0;
            const siQty = si.system.quantity || 1;
            si.unitWeight = Math.round(siWeight * 10) / 10;
            si.displayWeight = Math.round(siWeight * siQty * 10) / 10;
            si.displayCapacity = Math.round((parseFloat(si.system.storedSize) || 0) * siQty * 10) / 10;
            si.isConsumableWeapon = isConsumableWeapon(si);
          });
          item.containedItems = subItems;
          item.collapsed = this.actor.getFlag('osp-houserules', `container-${item.id}-collapsed`) ?? false;
        } else {
          item.containedItems = [];
          item.collapsed = true;
        }

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
      containerData.displayWeight = Math.round(containerWeight * 10) / 10;
      containerData.totalWeight = Math.round((containerWeight + containedWeight) * 10) / 10;
      
      // Calculate used capacity: ONLY stored items count, not lashed items
      // storedSize is per-unit; multiply by quantity for all item types
      const usedCapacity = storedItems.reduce((total, item) => {
        const storedSize = parseFloat(item.system.storedSize) || 0;
        const currentQuantity = item.system.quantity || 1;
        return total + storedSize * currentQuantity;
      }, 0);

      containerData.usedCapacity = Math.round(usedCapacity * 10) / 10;
      
      // Handle capacity as either a number or an object {type, value, max}
      let maxCapacity = 0;
      if (typeof container.system.capacity === 'object' && container.system.capacity !== null) {
        maxCapacity = container.system.capacity.max || 0;
      } else {
        maxCapacity = container.system.capacity || 0;
      }
      
      containerData.maxCapacity = maxCapacity;
      containerData.remainingCapacity = Math.round(Math.max(0, containerData.maxCapacity - containerData.usedCapacity) * 100) / 100;
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
      containerData.collapsed = this.actor.getFlag('osp-houserules', `container-${container.id}-collapsed`) ?? true;
      
      // Check if lashed items section is collapsed
      containerData.lashedCollapsed = this.actor.getFlag('osp-houserules', `lashed-${container.id}-collapsed`) ?? true;

      containerData.isSack = container.name === 'Sack, Large' || container.name === 'Sack, Small';

      return containerData;
    });
    
    // Build set of all valid container/clothing-with-capacity IDs so we can detect orphaned items
    const validContainerIds = new Set([
      ...allContainers.map(c => c.id),
      ...this.actor.items.filter(i => i.type === "clothing" && i.system.capacity).map(i => i.id)
    ]);

    // Only show items that are NOT in containers AND are not containers or clothing themselves.
    // Also surface orphaned items (containerId set but pointing to a deleted container) so they
    // are visible and manageable rather than silently inflating encumbrance.
    const freeItems = allItems.filter(item =>
      item.type !== 'container' && item.type !== 'clothing' &&
      !item.system.lashed &&
      (!item.system.containerId || !validContainerIds.has(item.system.containerId))
    );
    const freeAmmunition = allAmmunition.filter(ammo =>
      !ammo.system.lashed &&
      (!ammo.system.containerId || !validContainerIds.has(ammo.system.containerId))
    );
    // Unequipped weapons/armor not in any container are otherwise invisible — include them too
    const unequippedWeapons = allWeapons.filter(w =>
      !w.system.equipped && !w.system.lashed && !slungItemIds.has(w.id) &&
      (!w.system.containerId || !validContainerIds.has(w.system.containerId))
    );
    const unequippedArmor = allArmor.filter(a =>
      !a.system.equipped && !a.system.lashed &&
      !a.name.toLowerCase().includes('shield') &&
      (!a.system.containerId || !validContainerIds.has(a.system.containerId))
    );
    const generalItems = [...freeItems, ...freeAmmunition, ...unequippedArmor];

    // Calculate displayWeight for general items and loose weapons
    [...generalItems, ...unequippedWeapons].forEach(item => {
      const itemWeight = parseFloat(item.system.unitWeight || item.system.weight) || 0;
      const currentQuantity = item.system.quantity !== undefined ? item.system.quantity : 1;
      item.displayWeight = Math.round(itemWeight * currentQuantity * 10) / 10;
    });

    context.items = generalItems.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    // Unequipped weapons rendered separately in gear tab with weapon-row layout
    context.unequippedWeapons = unequippedWeapons.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    // All weapons for combat tab (equipped, sheathed, and lashed all appear; unequipped shown greyed out)
    context.allWeapons = allWeapons;
    
    context.treasures = this.actor.system.treasures || [];

    // Tag each top-level item with its section so the unified template loop can branch
    const unequippedShields = context.allShields.filter(s => !s.system.equipped && !s.system.lashed);
    context.clothing.forEach(i => { i._gearSection = 'clothing'; });
    context.unequippedWeapons.forEach(i => { i._gearSection = 'weapon'; });
    unequippedShields.forEach(i => { i._gearSection = 'shield'; });
    context.items.forEach(i => { i._gearSection = 'item'; });
    context.containers.forEach(i => { i._gearSection = 'container'; });
    context.topLevelGearItems = [
      ...context.clothing,
      ...context.unequippedWeapons,
      ...unequippedShields,
      ...context.items,
      ...context.containers,
    ].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

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

    const { classes } = await this.loadProfileData();
    context.showSpellsTab = this._shouldShowSpellsTab(context.system, classes);

    return context;
  }

  _shouldShowSpellsTab(system, classProfiles = []) {
    const cls = (system.class || '').toLowerCase().trim();
    const level = parseInt(system.level) || 1;
    const wis = parseInt(system.attributes?.wis?.value) || 10;

    // Look up spellcasting data from profile
    const profile = classProfiles.find(c =>
      (c.id || '').toLowerCase() === cls || (c.name || '').toLowerCase() === cls
    );
    const sc = profile?.spellcasting;
    if (!sc) return false;

    const base = sc.startsAtLevel ?? 1;

    // WIS-adjusted gates for divine casters
    if (cls === 'cleric')  return level >= (wis >= 15 ? Math.max(1, base - 1) : base);
    if (cls === 'paladin') return level >= Math.max(1, base - Math.max(0, wis - 15));
    if (cls === 'ranger')  return level >= Math.max(1, base - Math.max(0, wis - 15));

    return level >= base;
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

    // Apply theme class to the form element and outer app element
    const theme = this.actor.getFlag(game.system.id, 'sheetTheme') ?? 'default';
    if (theme !== 'default') {
      const formEl = html[0]?.closest?.('form') ?? html[0];
      formEl?.classList.add(`theme-${theme}`);
      this.element[0]?.classList.add(`theme-${theme}`);
    }

    // ALWAYS initialize position tool handler first, regardless of editable state
    this.ensurePositionToolHandler(html);

    // Skill target selects are GM-only
    if (!game.user.isGM) html.find('.cs-listening-select').prop('disabled', true);

    // Age field tooltip — shows race age guidelines after 2-second hover
    this._activateAgeTooltip(html);
    this._activateLevelTooltip(html);

    // Container collapse/expand toggle
    html.find('.container-toggle').click(this._onContainerToggle.bind(this));
    
    // Lashed items collapse/expand toggle
    html.find('.lashed-toggle').click(this._onLashedToggle.bind(this));
    html.find('.attachment-toggle').click(this._onAttachmentToggle.bind(this));
    html.find('.belt-row-toggle').click(this._onBeltRowToggle.bind(this));
    html.find('.sling-storage-toggle').click(this._onSlingStorageToggle.bind(this));
    html.find('.slung-section-toggle').click(async () => {
      const current = this.actor.getFlag('osp-houserules', 'slung-collapsed') ?? true;
      await this.actor.setFlag('osp-houserules', 'slung-collapsed', !current);
    });

    // Capture the dragged item's ID via DOM lookup — reading dataTransfer.getData in ancestor
    // dragstart handlers returns empty in most browsers (only the originating handler can read it back).
    // Uses capture:true so this fires before Foundry's target-phase DragDrop handler, which calls
    // stopPropagation and would otherwise prevent this bubble-phase listener from ever running.
    const gearSection = html.find('.gear-tab')[0];
    if (gearSection) {
      gearSection.addEventListener('dragstart', (e) => {
        this._gearDragItemId = null;
        const el = e.target.closest('[data-item-id]');
        if (el) this._gearDragItemId = el.dataset.itemId;
      }, { capture: true });
      gearSection.addEventListener('dragend', () => { this._gearDragItemId = null; }, { capture: true });
    }

    // Slung Items section — validity-aware drop target (slungable items show green, others red)
    const slungEntry = html.find('.slung-section-entry')[0];
    if (slungEntry) {
      this._wireGearDropTarget(slungEntry, null, () => this._getSlungDropValidity());
    }

    // Individual slung containers (Baldric etc.)
    html.find('.slung-item[data-item-id]').each((i, el) => {
      const item = this.actor.items.get(el.dataset.itemId);
      if (!item || item.type !== 'container') return;
      this._wireGearDropTarget(el, item);
    });

    // Make belt-attachment and sling containers draggable.
    // stopPropagation on dragstart prevents the gear-tab listener from firing, so set _gearDragItemId directly.
    const _wireDraggableContainer = (el) => {
      const item = this.actor.items.get(el.dataset.itemId);
      if (!item) return;
      const tags = item.system?.tags || [];
      const isDraggable = item.system.lashable || (item.system.slotCost || 0) > 0 || tags.includes('sling');
      if (!isDraggable) return;
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (e) => {
        const dragData = item.toDragData();
        e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'move';
        this._gearDragItemId = item.id;
        e.stopPropagation();
      });
    };
    html.find('.container-entry[data-item-id], .slung-item[data-item-id]').each((i, el) => _wireDraggableContainer(el));

    // Top-level container rows
    html.find('.container-entry[data-item-id]').each((i, el) => {
      const item = this.actor.items.get(el.dataset.itemId);
      this._wireGearDropTarget(el, item || null);
    });

    // Nested containers inside top-level containers (contained-item rows that are containers)
    html.find('.contained-item[data-item-id]').each((i, el) => {
      const item = this.actor.items.get(el.dataset.itemId);
      if (!item || (item.type !== 'container' && !(item.type === 'clothing' && item.system.capacity))) return;
      this._wireGearDropTarget(el, item);
    });

    // Belt attachment container rows (lashed-item rows)
    html.find('.lashed-item[data-item-id]').each((i, el) => {
      const item = this.actor.items.get(el.dataset.itemId);
      if (!item || item.type !== 'container') return;
      this._wireGearDropTarget(el, item);
    });

    // div.lashed-stored-item and div.lashed-sub-stored-item are not matched by Foundry's
    // DragDrop selector (.item-list .item) so they have no draggable ancestor closer than
    // the parent li.lashed-item. Without this block, dragging a dagger from inside a Belt
    // Pouch would drag the Pouch instead. Give each such div its own dragstart so the correct
    // item moves and stopPropagation keeps the parent from hijacking the drag.
    html.find('.lashed-stored-item[data-item-id], .lashed-sub-stored-item[data-item-id]').each((i, el) => {
      const item = this.actor.items.get(el.dataset.itemId);
      if (!item) return;
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (e) => {
        const dragData = item.toDragData();
        e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'move';
        this._gearDragItemId = item.id;
        e.stopPropagation();
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

    // Save ProseMirror editors when focus leaves the editor container
    html.find('div.editor[data-edit]').on('focusout', (event) => {
      const editorDiv = event.currentTarget;
      const name = editorDiv.dataset.edit;
      if (!editorDiv.contains(event.relatedTarget) && this.editors[name]?.instance) {
        // preventRender: true stops the actor update from triggering a sheet re-render,
        // which would destroy the ProseMirror instance mid-interaction (e.g. while the
        // font dropdown is open) and lose any pending formatting changes.
        this.saveEditor(name, { remove: false, preventRender: true });
      }
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

    // Drag-to-reorder weapons and armor on the Combat tab
    this._activateCombatItemSort(html);

    // Up/down arrows to reorder top-level items on the Gear tab
    this._activateGearItemSort(html);

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
  _activateCombatItemSort(html) {
    html[0].querySelectorAll('.tab[data-tab="combat"] .combat-equipped-section .item-list').forEach(list => {
      // Remove draggable from roll icons so they don't compete with the row drag.
      // Roll clicks still work. Drag the weapon row itself to the hotbar to create a macro.
      list.querySelectorAll('.item-roll-icon[draggable]').forEach(el => el.removeAttribute('draggable'));

      let dragSrcId = null;

      // Use capture: true so our handlers run BEFORE Foundry's bubble-phase DragDrop
      // handlers on the <li> elements (which call stopPropagation and would block us).

      list.addEventListener('dragstart', (e) => {
        const li = e.target.closest('.item-entry.item[data-item-id]');
        if (!li) return;
        dragSrcId = li.dataset.itemId;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      }, { capture: true });

      list.addEventListener('dragend', () => {
        dragSrcId = null;
        list.querySelectorAll('.dragging, .drag-over').forEach(el => {
          el.classList.remove('dragging', 'drag-over');
        });
      }, { capture: true });

      list.addEventListener('dragover', (e) => {
        if (!dragSrcId) return;
        const li = e.target.closest('.item-entry.item[data-item-id]');
        if (!li) return;
        e.preventDefault();
        e.stopPropagation();
        list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        li.classList.add('drag-over');
      }, { capture: true });

      list.addEventListener('drop', async (e) => {
        if (!dragSrcId) return;
        const li = e.target.closest('.item-entry.item[data-item-id]');
        if (!li) return;
        e.preventDefault();
        e.stopPropagation();
        const targetId = li.dataset.itemId;
        li.classList.remove('drag-over');
        if (targetId === dragSrcId) { dragSrcId = null; return; }

        const orderedIds = [...list.querySelectorAll('.item-entry.item[data-item-id]')]
          .map(el => el.dataset.itemId);
        const srcIdx = orderedIds.indexOf(dragSrcId);
        if (srcIdx === -1) { dragSrcId = null; return; }
        // Dragging down → insert after target; dragging up → insert before
        const tgtIdxOrig = orderedIds.indexOf(targetId);
        const after = srcIdx < tgtIdxOrig;
        orderedIds.splice(srcIdx, 1);
        const tgtIdx = orderedIds.indexOf(targetId);
        orderedIds.splice(after ? tgtIdx + 1 : tgtIdx, 0, dragSrcId);

        const BASE = 100000;
        const itemUpdates = [];
        let newUnarmedSort = null;
        orderedIds.forEach((id, idx) => {
          const newSort = (idx + 1) * BASE;
          if (id === '__unarmed__') newUnarmedSort = newSort;
          else itemUpdates.push({ _id: id, sort: newSort });
        });

        dragSrcId = null;
        if (itemUpdates.length) await this.actor.updateEmbeddedDocuments('Item', itemUpdates);
        if (newUnarmedSort !== null) await this.actor.setFlag('osp-houserules', 'unarmedSort', newUnarmedSort);
      }, { capture: true });
    });
  }

  _activateGearItemSort(html) {
    const gearTab = html.find('.tab[data-tab="gear"]')[0];
    if (!gearTab) return;

    gearTab.addEventListener('click', async e => {
      const btn = e.target.closest('.item-sort-up, .item-sort-down');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const row = btn.closest('li.item-entry[data-item-id]');
      if (!row) return;

      // All top-level gear rows in current DOM order (excludes nested items)
      const allRows = [...gearTab.querySelectorAll('li.item-entry[data-item-id]')]
        .filter(el => !el.closest('.lashed-items-list, .contained-items-list, .lashed-item'));

      const rowIndex = allRows.indexOf(row);
      if (rowIndex === -1) return;

      const isUp = btn.classList.contains('item-sort-up');
      const targetIndex = isUp ? rowIndex - 1 : rowIndex + 1;
      if (targetIndex < 0 || targetIndex >= allRows.length) return;

      // Swap the two rows and reassign clean sort values to all top-level items
      const orderedIds = allRows.map(el => el.dataset.itemId);
      [orderedIds[rowIndex], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[rowIndex]];

      const BASE = 100000;
      const itemUpdates = orderedIds
        .map((id, idx) => {
          if (!this.actor.items.get(id)) return null;
          return { _id: id, sort: (idx + 1) * BASE };
        })
        .filter(Boolean);

      await this.actor.updateEmbeddedDocuments('Item', itemUpdates);
    }, true);
  }

  initializeBioFieldAutoResize(html) {
    // Bio textareas are fixed-height with internal scrolling — no auto-resize.

    // Recompute skill-input positions when the Skills tab is opened; the tab
    // may have been hidden (display: none) when the SVG first injected, in
    // which case getBoundingClientRect returned zero and positions weren't set.
    html.find('.sheet-tabs a[data-tab="skills"]').on('click', () => {
      requestAnimationFrame(() => this.applySkillPositionsFromSVG(html));
    });

    // Render spell tab on initial load and whenever it is activated
    this.renderSpellTab(html);
    html.find('.sheet-tabs a[data-tab="attributes"]').on('click', () => {
      requestAnimationFrame(() => this.renderSpellTab(html));
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

    // Restore previously active tab, or default to 'bio'
    const activeTab = this._activeTab || 'bio';
    this.activateTab(html, activeTab);

    // Simple event delegation - single handler on the tab container
    html.off('click.tabsystem').on('click.tabsystem', '.sheet-tabs a.item', (event) => {
      this.handleTabClick(event, html);
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
    // Race changes suppress render so the XP handler ignore-flag has time to clear.
    // Class changes must allow a full render so {{#if showSpellsTab}} re-evaluates.
    await super._onSubmit(event, { ...options, preventRender: isRaceChange });
    
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
    // Keep actor.img (sidebar icon) in sync with system.portrait
    const newPortrait = formData["system.portrait"];
    if (newPortrait && newPortrait !== this.actor.img) {
      formData["img"] = newPortrait;
    }

    const result = await super._updateObject(event, formData);

    if (this.actor) {
      this.actor.prepareDerivedData();
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
   * Resolve the composite skill-circle SVG for a given class/race combo.
   * Lookup order: class+race combo → class → race → base.
   */
  getSkillSVGPath(characterClass, race) {
    const base = '/systems/osp-houserules/assets/character-sheet';
    const cls = (characterClass || '').toLowerCase().replace(/\s+/g, '-');
    const rcRaw = (race || '').toLowerCase().replace(/\s+/g, '-');
    const rc = rcRaw === 'half-orc' ? 'halforc' : rcRaw;

    const classesWithSkills = new Set(['assassin', 'barbarian', 'ranger', 'thief', 'warden']);
    const racesWithSkills = new Set(['dwarf', 'gnome', 'elf', 'hobbit', 'halforc']);
    // Races with `skills-{class}-{race}.svg` files for skill-bearing classes.
    const classComboRaces = new Set(['dwarf', 'gnome', 'hobbit']);
    // Races with `skills-base-{race}.svg` files (race + non-skill class).
    // Hobbit is intentionally absent: its non-skill-class layout comes from skills-hobbit.svg.
    const baseComboRaces = new Set(['dwarf', 'gnome']);

    if (classesWithSkills.has(cls)) {
      if (classComboRaces.has(rc)) return `${base}/skills-${cls}-${rc}.svg`;
      return `${base}/skills-${cls}.svg`;
    }
    if (baseComboRaces.has(rc)) return `${base}/skills-base-${rc}.svg`;
    if (racesWithSkills.has(rc)) return `${base}/skills-${rc}.svg`;
    return `${base}/skills-base.svg`;
  }

  /**
   * Fetch the composite skill SVG and inject it into the Skills tab container.
   * Caches fetched SVG text statically across sheet instances.
   */
  async fetchAndInjectSVG(html, svgPath) {
    const container = this.getElement(html, '.cs-skill-svg-container');
    if (!container) return;
    const el = container[0] || container;

    if (el.dataset.svgPath === svgPath && el.innerHTML) return;

    if (!OspActorSheetCharacter._svgCache) OspActorSheetCharacter._svgCache = new Map();
    const cache = OspActorSheetCharacter._svgCache;

    let svgText = cache.get(svgPath);
    if (!svgText) {
      try {
        const response = await fetch(svgPath);
        if (!response.ok) return;
        svgText = await response.text();
        cache.set(svgPath, svgText);
      } catch (err) {
        console.warn(`[osp-houserules] Failed to load skill SVG: ${svgPath}`, err);
        return;
      }
    }
    el.innerHTML = svgText;
    el.dataset.svgPath = svgPath;
    // Defer to next frame so layout is computed before measuring.
    requestAnimationFrame(() => this.applySkillPositionsFromSVG(html));
  }

  /**
   * Map SVG circle IDs to the HTML cs-pos-* slugs where they differ.
   * The SVGs use newer slugs that don't yet match every HTML class name.
   */
  static SKILL_SVG_ID_ALIASES = {
    'hear-noise': 'listening',
    'find-secret-doors': 'find-secret-door',
  };

  // Normalized names of class/race entries that are skills (rendered on the
  // skill circles) or otherwise suppressed from the Abilities list.
  static SKILL_OR_SUPPRESSED_ABILITIES = new Set([
    'listening', 'listeningatdoors', 'listenatdoors', 'hearnoise',
    'findsecretdoor', 'findsecretdoors', 'detectsecretdoors', 'detectsecretdoor',
    'openstuckdoors',
    'detectconstruction', 'detectconstructiontricks',
    'detectroomtraps',
    'assassination',
    'climbsheer', 'climbsheersurfaces',
    'hideshadows', 'hideinshadows',
    'movesilently',
    'findtraps', 'findremovetreasuretraps',
    'openlocks',
    'pickpockets',
    'hideundergrowth', 'hideinundergrowth',
    'hidedungeons', 'hideindungeons',
    'hiding',
    'foraginghunting', 'foragehunt', 'foragingandhunting',
    'stealth', 'wildernessstealth',
    'wildernesssurpriseattack', 'surpriseattack'
  ]);

  static _classProfiles = null;
  static _raceProfiles = null;
  static _spellsData = null;
  static _bonusSpellsConfig = null;

  /**
   * Lazily fetch and cache spells.json.
   */
  async loadSpellsData() {
    const cls = OspActorSheetCharacter;
    if (!cls._spellsData) {
      try {
        const r = await fetch('/systems/osp-houserules/data/spells.json');
        const d = await r.json();
        cls._spellsData = d.spellLists || {};
        cls._bonusSpellsConfig = d.houseRules?.bonusSpells || null;
      } catch (err) {
        console.warn('[osp-houserules] Failed to load spells.json', err);
        cls._spellsData = {};
        cls._bonusSpellsConfig = null;
      }
    }
    return cls._spellsData;
  }

  /**
   * Compute max spell slots per level for the current character.
   * Returns { [spellLevel]: maxSlots } or empty object if no spellcasting.
   */
  _computeMaxSpellSlots(system, classProfile) {
    const sc = classProfile?.spellcasting;
    if (!sc?.spellProgression) return {};
    const level = String(parseInt(system.level) || 1);
    return { ...(sc.spellProgression[level] || {}) };
  }

  /**
   * Render the Spells tab: slot tracker + full class spell list with expandable entries.
   */
  async renderSpellTab(html) {
    const slotsSection = this.getElement(html, '.spell-slots-section');
    const listContent = this.getElement(html, '.spell-list-content');
    if (!slotsSection || !listContent) return;

    const slotEl = slotsSection[0] || slotsSection;
    const listEl = listContent[0] || listContent;
    const root = html[0] || html;
    const subtabNavEl  = root.querySelector('.spell-subtab-nav');
    const spellbookEl  = root.querySelector('.spell-subtab-panel[data-subtab="spellbook"]');
    const allSpellsEl  = root.querySelector('.spell-subtab-panel[data-subtab="all"]');

    // Force Cooper Std on static template elements — CSS !important is overridden by Foundry's layer system
    const cooperFont = `'Cooper Std', 'Cooper Standard', Georgia, serif`;
    const $root = html.find ? html : $(html);
    $root.find('.spell-tab-title, .spell-tab-subtitle').each((_, el) => {
      el.style.setProperty('font-family', cooperFont, 'important');
    });

    const system = this.actor.system;
    const classId = (system.class || '').toLowerCase().replace(/-/g, '_').replace(/\s/g, '_');

    const { classes } = await this.loadProfileData();
    const spellsData = await this.loadSpellsData();

    const profile = classes.find(c => (c.id || '').toLowerCase() === classId);
    const sc = profile?.spellcasting;

    if (!sc || !sc.spellProgression) {
      slotEl.innerHTML = '<div class="spell-no-slots">No spell slots available at this level.</div>';
      listEl.innerHTML = '';
      return;
    }

    // Arcane casters must select/copy spells into a spellbook
    const isArcane = (sc.summary || '').toLowerCase().includes('arcane');
    const isDivine = !isArcane && (sc.summary || '').toLowerCase().includes('divine');
    const knownSpells = isArcane
      ? (this.actor.getFlag('osp-houserules', 'knownSpells') || {})
      : null;
    const memorizedSpells = (isArcane || isDivine)
      ? (this.actor.getFlag('osp-houserules', 'memorizedSpells') || {})
      : null;

    const maxSlots = this._computeMaxSpellSlots(system, profile);

    // Apply bonus spell slots from house rules (based on prime requisite score)
    const bonusCfg = OspActorSheetCharacter._bonusSpellsConfig;
    const baseSlots = { ...maxSlots };   // snapshot before bonus
    const bonusApplied = {};             // { '1': n, '2': n, '3': n }
    let formulaMeta = null;              // { stat, statValue, bracket, isExcluded }

    if (bonusCfg) {
      const excluded = (bonusCfg.doesNotApplyTo || []).map(n => n.toLowerCase());
      const classNameNorm = (system.class || '').toLowerCase().replace(/[^a-z]/g, '');
      const isExcluded = excluded.some(n => classNameNorm.includes(n.replace(/[^a-z]/g, '')));
      const bonusStat = isArcane ? 'int' : 'wis';
      const statValue = system.attributes?.[bonusStat]?.value ?? 0;
      let bonusRow = null;
      if (!isExcluded) {
        for (const row of bonusCfg.table) {
          const parts = row.primeRequisite.split('-').map(Number);
          if (statValue >= parts[0] && statValue <= parts[1]) { bonusRow = row; break; }
        }
        if (bonusRow) {
          if (bonusRow.level1 && (maxSlots['1'] || 0) > 0) { maxSlots['1'] = (maxSlots['1'] || 0) + bonusRow.level1; bonusApplied['1'] = bonusRow.level1; }
          if (bonusRow.level2 && (maxSlots['2'] || 0) > 0) { maxSlots['2'] = (maxSlots['2'] || 0) + bonusRow.level2; bonusApplied['2'] = bonusRow.level2; }
          if (bonusRow.level3 && (maxSlots['3'] || 0) > 0) { maxSlots['3'] = (maxSlots['3'] || 0) + bonusRow.level3; bonusApplied['3'] = bonusRow.level3; }
        }
      }
      formulaMeta = { stat: bonusStat.toUpperCase(), statValue, bracket: bonusRow?.primeRequisite || null, isExcluded };
    }

    const usedSlots = system.spellSlots || {};
    const spellListKey = sc.spellList || '';
    const spells = spellsData[spellListKey] || [];

    // Group spells by level
    const byLevel = {};
    for (const sp of spells) {
      const lv = String(sp.level || 1);
      if (!byLevel[lv]) byLevel[lv] = [];
      byLevel[lv].push(sp);
    }

    // --- Slot Tracker ---
    const spellLevels = Object.keys(maxSlots).sort((a, b) => +a - +b).filter(lv => maxSlots[lv] > 0);

    // Count memorized/prayed spells per level so pips can show green when a slot is filled
    const memorizedCountByLevel = {};
    if (memorizedSpells) {
      for (const lv of spellLevels) {
        memorizedCountByLevel[lv] = (byLevel[lv] || []).reduce((sum, sp) => sum + (Number(memorizedSpells[sp.id]) || 0), 0);
      }
    }

    if (spellLevels.length === 0) {
      slotEl.innerHTML = '<div class="spell-no-slots">No spell slots available at this level.</div>';
    } else {
      const levelLabels = ['1st','2nd','3rd','4th','5th','6th'];
      let slotHTML = '<div class="spell-slots-grid">';
      for (const lv of spellLevels) {
        const max = maxSlots[lv] || 0;
        const used = Math.min(parseInt((usedSlots[lv] || {}).used) || 0, max);
        const memCount = memorizedCountByLevel[lv] || 0;
        const label = levelLabels[+lv - 1] || `L${lv}`;
        slotHTML += `<div class="spell-slot-group" data-spell-level="${lv}">`;
        slotHTML += `<div class="spell-slot-label" style="font-family:${cooperFont};">${label}</div>`;
        slotHTML += `<div class="spell-slot-pips">`;
        for (let i = 0; i < max; i++) {
          const isUsed = i < used;
          const isMem  = !isUsed && i < used + memCount;
          const cls    = isUsed ? ' used' : (isMem ? ' memorized' : '');
          const title  = isUsed ? 'Click to restore' : (isMem ? 'Memorized — click to mark used' : 'Click to mark used');
          slotHTML += `<span role="button" tabindex="0" class="spell-slot-pip${cls}" data-level="${lv}" data-pip="${i}" title="${title}"></span>`;
        }
        slotHTML += `</div></div>`;
      }
      slotHTML += '</div>';

      // Formula breakdown
      const charClass = esc(system.class || '?');
      const charLevel = parseInt(system.level) || 1;
      const levelLabelsOrd = ['1st','2nd','3rd','4th','5th','6th'];
      let formulaLines = [];
      for (const lv of spellLevels) {
        const base = baseSlots[lv] || 0;
        const bonus = bonusApplied[lv] || 0;
        const total = maxSlots[lv] || 0;
        const label = levelLabelsOrd[+lv - 1] || `L${lv}`;
        const bonusPart = bonus > 0 ? ` + ${bonus} bonus` : '';
        formulaLines.push(`${label}: ${base}${bonusPart} = <b>${total}</b>`);
      }
      let formulaStatLine = '';
      if (formulaMeta) {
        const { stat, statValue, bracket, isExcluded } = formulaMeta;
        const eStat = esc(stat); const eVal = esc(String(statValue));
        if (isExcluded) {
          formulaStatLine = `${eStat} ${eVal} — no bonus (class excluded)`;
        } else if (bracket) {
          formulaStatLine = `${eStat} ${eVal} → bracket ${esc(bracket)} applies`;
        } else {
          formulaStatLine = `${eStat} ${eVal} — no bonus bracket matched`;
        }
      }
      slotHTML += `<div class="spell-formula">`;
      slotHTML += `<div class="spell-formula-header">Lv ${charLevel} ${charClass} &nbsp;·&nbsp; ${formulaStatLine}</div>`;
      slotHTML += `<div class="spell-formula-slots">${formulaLines.join(' &nbsp;|&nbsp; ')}</div>`;
      slotHTML += `</div>`;

      slotHTML += '<div class="spell-slots-actions">';
      slotHTML += `<button type="button" class="spell-rest-btn" style="font-family:${cooperFont};" title="Restore all spell slots after a full rest">Rest</button>`;
      slotHTML += '</div>';
      slotEl.innerHTML = slotHTML;

      // Force Cooper Std on slot labels, action buttons, and formula panel — inline style= loses to Foundry's button layer rules
      slotEl.querySelectorAll('.spell-slot-label, .spell-rest-btn, .spell-formula, .spell-formula-header, .spell-formula-slots').forEach(el => {
        el.style.setProperty('font-family', cooperFont, 'important');
      });

      // Slot pip click
      slotEl.querySelectorAll('.spell-slot-pip').forEach(pip => {
        pip.addEventListener('click', async (e) => {
          e.stopPropagation();
          const lv = pip.dataset.level;
          const pipIdx = parseInt(pip.dataset.pip);
          const max = maxSlots[lv] || 0;
          const newUsed = pip.classList.contains('used') ? pipIdx : pipIdx + 1;
          await this.actor.update({ [`system.spellSlots.${lv}.used`]: Math.max(0, Math.min(newUsed, max)) });
        });
      });

      // Rest button
      const restBtn = slotEl.querySelector('.spell-rest-btn');
      if (restBtn) {
        restBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          const updates = {};
          for (const lv of spellLevels) updates[`system.spellSlots.${lv}.used`] = 0;
          await this.actor.update(updates);
        });
      }

    }

    // --- Sub-tab nav (arcane only) ---
    if (isArcane) {
      if (!this._activeSpellSubtab) this._activeSpellSubtab = 'spellbook';
      if (subtabNavEl) {
        subtabNavEl.innerHTML =
          `<span class="spell-subtab-btn${this._activeSpellSubtab === 'spellbook' ? ' active' : ''}" data-subtab="spellbook">Spellbook</span>` +
          `<span class="spell-subtab-btn${this._activeSpellSubtab === 'all'       ? ' active' : ''}" data-subtab="all">All Spells</span>`;
        subtabNavEl.querySelectorAll('.spell-subtab-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            this._activeSpellSubtab = btn.dataset.subtab;
            this.renderSpellTab(this.element);
          });
        });
      }
      if (spellbookEl) spellbookEl.classList.toggle('active', this._activeSpellSubtab === 'spellbook');
      if (allSpellsEl) allSpellsEl.classList.toggle('active', this._activeSpellSubtab === 'all');
    } else {
      if (subtabNavEl) { subtabNavEl.innerHTML = ''; subtabNavEl.style.display = 'none'; }
      if (spellbookEl) spellbookEl.classList.remove('active');
      if (allSpellsEl) allSpellsEl.classList.add('active');
    }

    // --- Spell List ---
    if (spells.length === 0) {
      listEl.innerHTML = '<div class="spell-no-spells">No spells found for this class.</div>';
      return;
    }

    const maxLevel = sc.maxSpellLevel || 6;
    const availableLevels = Object.keys(byLevel).sort((a, b) => +a - +b).filter(lv => +lv <= maxLevel);

    if (!this._collapsedSpellLevels) this._collapsedSpellLevels = new Set();
    if (!this._collapsedSpellbookLevels) this._collapsedSpellbookLevels = new Set();

    const imgMem            = '/systems/osp-houserules/assets/images/icons/spell-memorized.webp';
    const imgNo             = '/systems/osp-houserules/assets/images/icons/spell_no_memory.webp';
    const imgLearn          = '/systems/osp-houserules/assets/images/icons/learn-spell.webp';
    const imgCast           = '/systems/osp-houserules/assets/images/icons/cast.webp';
    const classLower = (system.class || '').toLowerCase();
    const isDruidOrRanger = classLower === 'druid' || classLower === 'ranger' || classLower === 'bard';
    const imgPray           = isDruidOrRanger
      ? '/systems/osp-houserules/assets/images/icons/leaf.webp'
      : '/systems/osp-houserules/assets/images/icons/pray.webp';
    const imgPrayerAnswered = isDruidOrRanger
      ? '/systems/osp-houserules/assets/images/icons/green-leaf.webp'
      : '/systems/osp-houserules/assets/images/icons/prayer-answered.webp';
    const iconStyle = 'flex:0 0 auto;display:inline-block;padding:0 2px;line-height:0;';

    // Build a single spell entry row — context: 'all' | 'spellbook'
    const buildEntry = (sp, lv, context) => {
      const hasReversed = !!sp.reversed;
      const isAlwaysKnown = !!sp.alwaysKnown;
      const isKnown = isArcane ? (isAlwaysKnown || knownSpells[sp.id] === true) : true;
      const memCount    = (isArcane || isDivine) ? (Number(memorizedSpells[sp.id]) || 0) : 0;
      const isMemorized = memCount > 0;
      let h = `<div class="spell-entry${isArcane && !isKnown ? ' unknown' : ''}" data-spell-id="${esc(sp.id)}">`;
      h += `<div class="spell-entry-header" style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 6px;cursor:pointer;border-radius:3px;user-select:none;width:100%;box-sizing:border-box;">`;
      if (isDivine) {
        const prayImg = isMemorized ? imgPrayerAnswered : imgPray;
        h += `<span role="button" tabindex="0" class="spell-pray-indicator${isMemorized ? ' prayed' : ''}" data-spell-id="${esc(sp.id)}" data-spell-level="${lv}" title="${isMemorized ? 'Change prayers' : 'Pray for spell'}" style="${iconStyle}cursor:pointer;"><img src="${prayImg}" style="width:24px;height:24px;display:block;" alt="${isMemorized ? 'Prayed' : 'Not prayed'}"></span>`;
        const pipCap = Math.max(0, (maxSlots[lv] || 0) - Math.min(parseInt((usedSlots[lv] || {}).used) || 0, maxSlots[lv] || 0));
        let pipsHTML = `<span class="spell-pip-mini-group">`;
        for (let i = 0; i < pipCap; i++) pipsHTML += `<span class="spell-pip-mini${i < memCount ? ' filled' : ''}"></span>`;
        h += pipsHTML + '</span>';
        const castDim   = isMemorized ? '' : 'opacity:0.3;pointer-events:none;';
        const castTitle = isMemorized ? 'Cast this spell' : 'Pray first to cast';
        h += `<span role="button" tabindex="0" class="spell-cast-btn${isMemorized ? '' : ' disabled'}" data-spell-id="${esc(sp.id)}" data-spell-level="${lv}" title="${castTitle}" style="${iconStyle}cursor:${isMemorized ? 'pointer' : 'default'};"><img src="${imgCast}" style="width:24px;height:24px;display:block;${castDim}" alt="Cast"></span>`;
      } else if (isArcane) {
        if (context === 'all') {
          // All Spells panel: learn icon only
          if (isAlwaysKnown) {
            // Always-known: greyed, non-interactive
            h += `<span class="spell-learn-btn known" title="Always known" style="${iconStyle}cursor:default;"><img src="${imgLearn}" style="width:24px;height:24px;display:block;opacity:0.35;" alt="Always known"></span>`;
          } else if (!isKnown) {
            // Unknown: black learn icon → click to learn
            h += `<span role="button" tabindex="0" class="spell-learn-btn" data-spell-id="${esc(sp.id)}" data-spell-level="${lv}" data-spell-name="${esc(sp.name)}" title="Learn — add to spellbook" style="${iconStyle}cursor:pointer;"><img src="${imgLearn}" style="width:24px;height:24px;display:block;" alt="Learn"></span>`;
          } else {
            // Known: greyed learn icon → click to open forget dialog
            h += `<span role="button" tabindex="0" class="spell-learn-btn known" data-spell-id="${esc(sp.id)}" data-spell-level="${lv}" data-spell-name="${esc(sp.name)}" title="In spellbook — click to forget" style="${iconStyle}cursor:pointer;"><img src="${imgLearn}" style="width:24px;height:24px;display:block;opacity:0.35;" alt="Learned"></span>`;
          }
        } else {
          // Spellbook panel: memory indicator + mini-pips + cast
          const memImg = isMemorized ? imgMem : imgNo;
          h += `<span role="button" tabindex="0" class="spell-memorize-indicator${isMemorized ? ' memorized' : ''}" data-spell-id="${esc(sp.id)}" data-spell-level="${lv}" title="${isMemorized ? 'Change memorizations' : 'Memorize spell'}" style="${iconStyle}cursor:pointer;"><img src="${memImg}" style="width:24px;height:24px;display:block;" alt="${isMemorized ? 'Memorized' : 'Not memorized'}"></span>`;
          const pipCap = Math.max(0, (maxSlots[lv] || 0) - Math.min(parseInt((usedSlots[lv] || {}).used) || 0, maxSlots[lv] || 0));
          let pipsHTML = `<span class="spell-pip-mini-group">`;
          for (let i = 0; i < pipCap; i++) pipsHTML += `<span class="spell-pip-mini${i < memCount ? ' filled' : ''}"></span>`;
          h += pipsHTML + '</span>';
          const castDim   = isMemorized ? '' : 'opacity:0.3;pointer-events:none;';
          const castTitle = isMemorized ? 'Cast this spell' : 'Memorize first to cast';
          h += `<span role="button" tabindex="0" class="spell-cast-btn${isMemorized ? '' : ' disabled'}" data-spell-id="${esc(sp.id)}" data-spell-level="${lv}" title="${castTitle}" style="${iconStyle}cursor:${isMemorized ? 'pointer' : 'default'};"><img src="${imgCast}" style="width:24px;height:24px;display:block;${castDim}" alt="Cast"></span>`;
        }
      }
      h += `<span class="spell-entry-chevron" style="flex:0 0 auto;font-size:14px;color:#704214;line-height:1;margin-left:4px;">&#9654;</span>`;
      h += `<span class="spell-entry-name" style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:24px;font-weight:bold;color:#1a1a1a;">${esc(sp.name)}${hasReversed ? ' <span class="spell-reversible-tag">R</span>' : ''}</span>`;
      h += `<span class="spell-entry-meta" style="flex:0 0 auto;font-size:20px;color:#666;white-space:nowrap;">${esc(sp.duration || '')}${sp.duration && sp.range ? ' &bull; ' : ''}${esc(sp.range || '')}</span>`;
      h += `</div><div class="spell-entry-body"><p class="spell-description">${esc(sp.description || '')}</p>`;
      if (hasReversed) h += `<div class="spell-reversed-block"><div class="spell-reversed-name">Reversed: ${esc(sp.reversed.name || '')}</div><p class="spell-description">${esc(sp.reversed.description || '')}</p></div>`;
      h += `</div></div>`;
      return h;
    };

    // Build a level group block — context passed through to buildEntry
    const buildLevelGroup = (lv, lvSpells, collapsedSet, knownOnly, context) => {
      const filtered = knownOnly ? lvSpells.filter(sp => !!sp.alwaysKnown || knownSpells[sp.id] === true) : lvSpells;
      if (filtered.length === 0) return '';
      const max = maxSlots[lv] || 0;
      const isCollapsed = collapsedSet.has(lv);
      let h = `<div class="spell-level-group${isCollapsed ? ' collapsed' : ''}" data-level="${lv}">`;
      h += `<div class="spell-level-heading" style="display:flex;align-items:center;gap:8px;padding:3px 4px 4px;cursor:pointer;user-select:none;">`;
      h += `<span class="spell-level-caret" style="flex:0 0 auto;font-size:14px;color:#704214;line-height:1;">${isCollapsed ? '&#9654;' : '&#9660;'}</span>`;
      h += `Level ${lv}${max ? ` <span class="spell-level-slots">(${max} slot${max !== 1 ? 's' : ''})</span>` : ''}`;
      h += `</div>`;
      for (const sp of filtered) h += buildEntry(sp, lv, context);
      h += `</div>`;
      return h;
    };

    // Post a spell-cast card to chat
    const postSpellToChat = (sp, spellLevel) => {
      if (!sp) return;
      const levelLabels = ['1st','2nd','3rd','4th','5th','6th'];
      const levelLabel  = levelLabels[+spellLevel - 1] || `Level ${spellLevel}`;
      const castType    = isDivine ? 'Divine Prayer' : 'Arcane Spell';
      const meta = [levelLabel];
      if (sp.duration) meta.push(`Duration: ${esc(sp.duration)}`);
      if (sp.range)    meta.push(`Range: ${esc(sp.range)}`);
      const actorName = esc(this.actor.name || 'Unknown');
      const rawContent = `<div class="osp-spell-cast-card">
        <div class="spell-card-header">
          <div class="spell-card-name">${actorName} casts ${esc(sp.name)}</div>
          <div class="spell-card-type">${castType}</div>
        </div>
        <div class="spell-card-meta">${meta.join(' &bull; ')}</div>
        ${sp.description ? `<div class="spell-card-desc">${sp.description}</div>` : ''}
      </div>`;
      ChatMessage.create({
        content: DOMPurify.sanitize(rawContent),
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        rollMode: game.settings.get('core', 'rollMode'),
      });
    };

    // Attach all listeners — context: 'all' | 'spellbook'
    const attachListeners = (containerEl, collapsedSet, context) => {
      containerEl.querySelectorAll('.spell-level-heading').forEach(heading => {
        heading.addEventListener('click', () => {
          const group = heading.closest('.spell-level-group');
          const lv = group.dataset.level;
          const isNowCollapsed = group.classList.toggle('collapsed');
          if (isNowCollapsed) collapsedSet.add(lv);
          else collapsedSet.delete(lv);
          const caret = heading.querySelector('.spell-level-caret');
          if (caret) caret.innerHTML = isNowCollapsed ? '&#9654;' : '&#9660;';
        });
      });
      containerEl.querySelectorAll('.spell-entry-header').forEach(header => {
        header.addEventListener('click', (e) => {
          if (e.target.closest('.spell-learn-btn,.spell-known-btn,.spell-cast-btn,.spell-pray-btn')) return;
          const entry = header.closest('.spell-entry');
          const isOpen = entry.classList.toggle('open');
          const chevron = header.querySelector('.spell-entry-chevron');
          if (chevron) chevron.innerHTML = isOpen ? '&#9660;' : '&#9654;';
        });
      });
      if (isDivine) {
        const levelLabels = ['1st','2nd','3rd','4th','5th','6th'];
        containerEl.querySelectorAll('.spell-pray-indicator').forEach(indicator => {
          indicator.addEventListener('click', async (e) => {
            e.stopPropagation();
            const spellId    = indicator.dataset.spellId;
            const spellLevel = indicator.dataset.spellLevel;
            const mem        = this.actor.getFlag('osp-houserules', 'memorizedSpells') || {};
            const thisCount  = Number(mem[spellId]) || 0;
            const used       = parseInt((system.spellSlots?.[spellLevel] || {}).used) || 0;
            const cap        = Math.max(0, (maxSlots[spellLevel] || 0) - used);
            const totalCount = (byLevel[spellLevel] || []).reduce((sum, sp) => sum + (Number(mem[sp.id]) || 0), 0);
            let newCount;
            if (totalCount < cap) {
              newCount = thisCount + 1;
            } else if (thisCount > 0) {
              newCount = 0;
            } else {
              const label = levelLabels[+spellLevel - 1] || `Level ${spellLevel}`;
              ui.notifications?.warn(`${label}: not enough slots remaining.`);
              return;
            }
            await this.actor.setFlag('osp-houserules', 'memorizedSpells', { ...mem, [spellId]: newCount });
          });
        });
        containerEl.querySelectorAll('.spell-cast-btn:not(.disabled)').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const spellId    = btn.dataset.spellId;
            const spellLevel = btn.dataset.spellLevel;
            const max        = maxSlots[spellLevel] || 0;
            const currentUsed = parseInt((system.spellSlots?.[spellLevel] || {}).used) || 0;
            if (currentUsed >= max) {
              ui.notifications?.warn('No spell slots remaining at this level.');
              return;
            }
            const sp       = (byLevel[spellLevel] || []).find(s => s.id === spellId);
            const mem      = this.actor.getFlag('osp-houserules', 'memorizedSpells') || {};
            const newCount = Math.max(0, (Number(mem[spellId]) || 0) - 1);
            postSpellToChat(sp, spellLevel);
            await Promise.all([
              this.actor.update({ [`system.spellSlots.${spellLevel}.used`]: currentUsed + 1 }),
              this.actor.setFlag('osp-houserules', 'memorizedSpells', { ...mem, [spellId]: newCount }),
            ]);
          });
        });
        return;
      }
      if (!isArcane) return;

      if (context === 'all') {
        // Unknown spell learn icon → add to spellbook
        containerEl.querySelectorAll('.spell-learn-btn:not(.known)').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const spellId = btn.dataset.spellId;
            const known = this.actor.getFlag('osp-houserules', 'knownSpells') || {};
            await this.actor.setFlag('osp-houserules', 'knownSpells', { ...known, [spellId]: true });
          });
        });

        // Known spell learn icon (greyed) → forget dialog
        containerEl.querySelectorAll('.spell-learn-btn.known[data-spell-id]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const spellId   = btn.dataset.spellId;
            const spellName = btn.dataset.spellName || spellId;
            new Dialog({
              title: 'Forget Spell',
              content: `<p>Remove <strong>${spellName}</strong> from your spellbook?</p>`,
              buttons: {
                forget: {
                  label: 'Forget',
                  callback: async () => {
                    const known = this.actor.getFlag('osp-houserules', 'knownSpells') || {};
                    await this.actor.setFlag('osp-houserules', 'knownSpells', { ...known, [spellId]: false });
                  }
                },
                cancel: { label: 'Cancel' }
              },
              default: 'cancel'
            }).render(true);
          });
        });

      } else {
        // Spellbook panel: memorize toggle + cast
        const levelLabels = ['1st','2nd','3rd','4th','5th','6th'];

        containerEl.querySelectorAll('.spell-memorize-indicator').forEach(indicator => {
          indicator.addEventListener('click', async (e) => {
            e.stopPropagation();
            const spellId    = indicator.dataset.spellId;
            const spellLevel = indicator.dataset.spellLevel;
            const mem        = this.actor.getFlag('osp-houserules', 'memorizedSpells') || {};
            const thisCount  = Number(mem[spellId]) || 0;
            const used       = parseInt((system.spellSlots?.[spellLevel] || {}).used) || 0;
            const cap        = Math.max(0, (maxSlots[spellLevel] || 0) - used);
            const totalCount = (byLevel[spellLevel] || []).reduce((sum, sp) => sum + (Number(mem[sp.id]) || 0), 0);
            let newCount;
            if (totalCount < cap) {
              newCount = thisCount + 1;
            } else if (thisCount > 0) {
              newCount = 0;
            } else {
              const label = levelLabels[+spellLevel - 1] || `Level ${spellLevel}`;
              ui.notifications?.warn(`${label}: not enough slots remaining.`);
              return;
            }
            await this.actor.setFlag('osp-houserules', 'memorizedSpells', { ...mem, [spellId]: newCount });
          });
        });

        containerEl.querySelectorAll('.spell-cast-btn:not(.disabled)').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const spellId    = btn.dataset.spellId;
            const spellLevel = btn.dataset.spellLevel;
            const max        = maxSlots[spellLevel] || 0;
            const currentUsed = parseInt((system.spellSlots?.[spellLevel] || {}).used) || 0;
            if (currentUsed >= max) {
              ui.notifications?.warn('No spell slots remaining at this level.');
              return;
            }
            const sp       = (byLevel[spellLevel] || []).find(s => s.id === spellId);
            const mem      = this.actor.getFlag('osp-houserules', 'memorizedSpells') || {};
            const newCount = Math.max(0, (Number(mem[spellId]) || 0) - 1);
            postSpellToChat(sp, spellLevel);
            await Promise.all([
              this.actor.update({ [`system.spellSlots.${spellLevel}.used`]: currentUsed + 1 }),
              this.actor.setFlag('osp-houserules', 'memorizedSpells', { ...mem, [spellId]: newCount }),
            ]);
          });
        });
      }
    };

    // --- Spellbook panel (arcane only: known + alwaysKnown spells) ---
    if (isArcane && spellbookEl) {
      let sbHTML = '';
      let hasAny = false;
      for (const lv of availableLevels) {
        const lvSpells = byLevel[lv].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const chunk = buildLevelGroup(lv, lvSpells, this._collapsedSpellbookLevels, true, 'spellbook');
        if (chunk) hasAny = true;
        sbHTML += chunk;
      }
      if (!hasAny) sbHTML += '<div class="spell-no-spells">No spells in spellbook yet.</div>';
      spellbookEl.innerHTML = sbHTML;
      attachListeners(spellbookEl, this._collapsedSpellbookLevels, 'spellbook');
    } else if (spellbookEl) {
      spellbookEl.innerHTML = '';
    }

    // --- Full spell list ---
    let listHTML = '';
    for (const lv of availableLevels) {
      const lvSpells = byLevel[lv].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      listHTML += buildLevelGroup(lv, lvSpells, this._collapsedSpellLevels, false, 'all');
    }
    listEl.innerHTML = listHTML;
    attachListeners(listEl, this._collapsedSpellLevels, 'all');
  }

  /**
   * Lazily fetch and cache class_profiles.json and race_profiles.json.
   */
  async loadProfileData() {
    const cls = OspActorSheetCharacter;
    if (!cls._classProfiles) {
      try {
        const r = await fetch('/systems/osp-houserules/data/class_profiles.json');
        const d = await r.json();
        cls._classProfiles = d.classProfiles || [];
      } catch (err) {
        console.warn('[osp-houserules] Failed to load class_profiles.json', err);
        cls._classProfiles = [];
      }
    }
    if (!cls._raceProfiles) {
      try {
        const r = await fetch('/systems/osp-houserules/data/race_profiles.json');
        const d = await r.json();
        cls._raceProfiles = d.raceProfiles || [];
      } catch (err) {
        console.warn('[osp-houserules] Failed to load race_profiles.json', err);
        cls._raceProfiles = [];
      }
    }
    return { classes: cls._classProfiles, races: cls._raceProfiles };
  }

  /**
   * Render the Abilities section on the Skills tab from class/race profile data.
   * Filters out entries that are represented as skill circles (or suppressed by house rules).
   */
  async renderAbilities(html, characterClass, race) {
    const target = this.getElement(html, '.skill-abilities-content');
    if (!target) return;
    const el = target[0] || target;

    const { classes, races } = await this.loadProfileData();

    const classKey = (characterClass || '').toLowerCase();
    // race ids in data: dwarf, elf, gnome, half_elf, hobbit, half_orc, human
    const raceKey = (race || '').toLowerCase()
      .replace(/-/g, '_');

    const classData = classes.find(c => (c.id || '').toLowerCase() === classKey);
    const raceData = races.find(r => (r.id || '').toLowerCase() === raceKey);

    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const skip = OspActorSheetCharacter.SKILL_OR_SUPPRESSED_ABILITIES;
    const isSkill = (name) => skip.has(norm(name));

    const entries = [];
    // Race first so racial abilities win deduplication tag priority
    if (raceData) {
      for (const a of (raceData.racialAbilities || [])) {
        if (!isSkill(a.name)) entries.push({ ...a, source: 'race' });
      }
    }
    if (classData) {
      for (const a of (classData.activeAbilities || [])) {
        if (!isSkill(a.name)) entries.push({ ...a, source: 'class' });
      }
      for (const a of (classData.passiveAbilities || [])) {
        if (!isSkill(a.name)) entries.push({ ...a, source: 'class' });
      }
    }

    const escape = (s) => String(s || '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    // Deduplicate by name — class entries take precedence (pushed first)
    const seen = new Set();
    const unique = entries.filter(e => {
      const key = (e.name || '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length === 0) {
      el.innerHTML = '';
      return;
    }

    unique.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    el.innerHTML = unique.map(e => {
      const tag = e.source === 'race'
        ? ' <span class="skill-ability-tag skill-ability-tag--race">Race</span>'
        : e.source === 'class'
        ? ' <span class="skill-ability-tag skill-ability-tag--class">Class</span>'
        : '';
      const trigger = e.trigger
        ? `<span class="skill-ability-trigger">${escape(e.trigger)}.</span> `
        : '';
      return `<div class="skill-ability-entry skill-ability-collapsed">` +
        `<div class="skill-ability-name skill-ability-toggle">` +
        `<span class="skill-ability-caret">&#9654;</span>${escape(e.name)}${tag}</div>` +
        `<div class="skill-ability-effect">${trigger}${escape(e.effect || '')}</div>` +
        `</div>`;
    }).join('');

    // Toggle expand/collapse on name click
    el.addEventListener('click', (event) => {
      const toggle = event.target.closest('.skill-ability-toggle');
      if (!toggle) return;
      const entry = toggle.closest('.skill-ability-entry');
      const caret = toggle.querySelector('.skill-ability-caret');
      const collapsed = entry.classList.toggle('skill-ability-collapsed');
      caret.innerHTML = collapsed ? '&#9654;' : '&#9660;';
    });
  }

  /**
   * Read circle anchors from the injected SVG and position each matching
   * skill input field so it's centered on its circle. Inline --left/--top
   * override the SCSS-driven defaults.
   */
  applySkillPositionsFromSVG(html) {
    const container = this.getElement(html, '.cs-skill-svg-container');
    if (!container) return;
    const containerEl = container[0] || container;
    const svg = containerEl.querySelector('svg');
    if (!svg) return;

    const tab = containerEl.closest('.tab[data-tab="skills"]');
    if (!tab) return;

    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    if (!viewBox || !viewBox.width) return;

    const svgRect = svg.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    // Tab hidden / not laid out yet — bail; we'll retry on tab activation.
    if (!svgRect.width || !tabRect.width) return;

    const scale = svgRect.width / viewBox.width;
    const svgOffsetX = svgRect.left - tabRect.left;
    const svgOffsetY = svgRect.top - tabRect.top;

    const aliases = OspActorSheetCharacter.SKILL_SVG_ID_ALIASES;
    const positionedSlugs = new Set();

    svg.querySelectorAll('circle[id]').forEach(circle => {
      const id = circle.id;
      const slug = aliases[id] || id;
      const targetEl = tab.querySelector(`.cs-pos-${slug}`);
      if (!targetEl) return;

      const cx = parseFloat(circle.getAttribute('cx'));
      const cy = parseFloat(circle.getAttribute('cy'));
      if (Number.isNaN(cx) || Number.isNaN(cy)) return;

      const w = targetEl.offsetWidth;
      const h = targetEl.offsetHeight;

      const left = svgOffsetX + cx * scale - w / 2;
      const top = svgOffsetY + cy * scale - h / 2 - 3;

      targetEl.style.setProperty('--left', `${left}px`);
      targetEl.style.setProperty('--top', `${top}px`);
      positionedSlugs.add(slug);
    });

    // Hide any skill input that applySkillVisibility marked as visible but
    // has no circle in the loaded SVG (i.e., the class/race combo SVG file
    // doesn't include this skill). Prevents the input from rendering at
    // its SCSS default (0,0) as an orphan.
    const selectors = OspActorSheetCharacter.SKILL_SELECTORS;
    Object.keys(selectors).forEach(skill => {
      const cssSlug = selectors[skill].replace('.cs-pos-', '');
      if (positionedSlugs.has(cssSlug)) return;
      tab.querySelectorAll(selectors[skill]).forEach(el => {
        if (el.style.display !== 'none') {
          el.style.display = 'none';
          el.dataset.svgOrphan = '1';
        }
      });
    });
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

    // Inject the composite skill-circle SVG for this class/race
    this.fetchAndInjectSVG(html, this.getSkillSVGPath(characterClass, race));

    // Render class/race ability text below the skill circles
    this.renderAbilities(html, characterClass, race);
    
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
   * Age / Height / Weight tooltips — 2-second hover reveals race guidelines (Tables 10 & 11).
   */
  _activateAgeTooltip(html) {
    const AGE_TABLE = {
      'Dwarf':    { base: 40,  variable: '5d6',   max: '250+2d100' },
      'Elf':      { base: 100, variable: '5d6',   max: '350+4d100', note: 'Upon attaining max age, an elf departs to another land rather than dying.' },
      'Gnome':    { base: 60,  variable: '3d12',  max: '200+3d100' },
      'Half-Elf': { base: 15,  variable: '1d6',   max: '125+3d20' },
      'Half-Orc': { base: 14,  variable: '1d2',   max: '~60', note: 'Middle age ~30 · Old ~45 · Venerable ~60+' },
      'Hobbit':   { base: 20,  variable: '3d4',   max: '100+1d100' },
      'Human':    { base: 15,  variable: '1d4',   max: '90+2d20' },
    };

    // Base is Male/Female in inches; modifier is a dice roll
    const HEIGHT_TABLE = {
      'Dwarf':    { base: '43/41', modifier: '1d10' },
      'Elf':      { base: '55/50', modifier: '1d10' },
      'Gnome':    { base: '38/36', modifier: '1d6'  },
      'Half-Elf': { base: '60/58', modifier: '2d6'  },
      'Half-Orc': { base: '60/58',  modifier: '1d12' },
      'Hobbit':   { base: '32/30', modifier: '2d8'  },
      'Human':    { base: '60/59', modifier: '2d10' },
    };

    // Base is Male/Female in pounds; modifier is a dice roll
    const WEIGHT_TABLE = {
      'Dwarf':    { base: '130/105', modifier: '4d10' },
      'Elf':      { base: '90/70',   modifier: '3d10' },
      'Gnome':    { base: '72/68',   modifier: '5d4'  },
      'Half-Elf': { base: '110/85',  modifier: '3d12' },
      'Half-Orc': { base: '135/95',  modifier: '6d10' },
      'Hobbit':   { base: '52/48',   modifier: '5d4'  },
      'Human':    { base: '140/100', modifier: '6d10' },
    };

    const buildAgeHtml = (data, race) => {
      if (!data) return `<div style="color:#a89060;font-style:italic;">No age table for ${esc(race) || 'this race'}.</div>`;
      const noteHtml = data.note ? `<div class="age-tooltip-note">${data.note}</div>` : '';
      return `
        <div class="age-tooltip-row"><span>Base Age</span><span>${data.base}</span></div>
        <div class="age-tooltip-row"><span>Variable</span><span>+${data.variable}</span></div>
        <div class="age-tooltip-row"><span>Maximum</span><span>${data.max}</span></div>
        ${noteHtml}`;
    };

    const buildStatHtml = (data, race, unit, label) => {
      if (!data) return `<div style="color:#a89060;font-style:italic;">No ${label} table for ${esc(race) || 'this race'}.</div>`;
      return `
        <div class="age-tooltip-row"><span>Base (M/F)</span><span>${data.base} ${unit}</span></div>
        <div class="age-tooltip-row"><span>Modifier</span><span>+${data.modifier}</span></div>`;
    };

    const attach = (containerId, tableData, buildFn, ...buildArgs) => {
      const $group = html.find(`#${containerId}`);
      if (!$group.length) return;

      const $tooltip = $('<div class="age-tooltip"></div>');
      html.append($tooltip);
      let timer = null;

      $group.on('mouseenter.statooltip', () => {
        timer = setTimeout(() => {
          const race = this.actor.system.race || '';
          $tooltip.html(buildFn(tableData[race], race, ...buildArgs));
          const offset = $group.position();
          $tooltip.css({ top: (offset.top + $group.outerHeight() + 4) + 'px', left: offset.left + 'px' });
          $tooltip.addClass('visible');
        }, 2000);
      });

      $group.on('mouseleave.statooltip', () => {
        clearTimeout(timer);
        $tooltip.removeClass('visible');
      });
    };

    attach('age-container',    AGE_TABLE,    buildAgeHtml);
    attach('height-container', HEIGHT_TABLE, buildStatHtml, 'in', 'height');
    attach('weight-container', WEIGHT_TABLE, buildStatHtml, 'lb', 'weight');
  }

  _activateLevelTooltip(html) {
    // Level limits for demi-human races (class name → max level, null means unlimited)
    const LEVEL_LIMITS = {
      'Dwarf':    { Assassin: 9, Cleric: 8, Fighter: 10, Thief: 9 },
      'Elf':      { Assassin: 10, Cleric: 7, Druid: 8, Fighter: 7, Knight: 11, 'Magic-User': 11, Ranger: 11, Thief: 10 },
      'Gnome':    { Assassin: 6, Cleric: 7, Fighter: 6, Illusionist: 7, Thief: 8 },
      'Half-Elf': { Assassin: 11, Bard: 12, Cleric: 5, Druid: 12, Fighter: 8, Knight: 12, 'Magic-User': 8, Paladin: 12, Ranger: 8, Thief: 12 },
      'Hobbit':   { Druid: 6, Fighter: 6, Thief: 8 },
      'Half-Orc': { Assassin: 8, Cleric: 4, Fighter: 10, Thief: 8 },
    };

    const $container = html.find('#level-container');
    if (!$container.length) return;

    const $tooltip = $('<div class="level-prog-tooltip"></div>');
    html.append($tooltip);
    let timer = null;

    $container.on('mouseenter.levtip', () => {
      timer = setTimeout(() => {
        const cls   = this.actor.system.class  || '';
        const race  = this.actor.system.race   || '';
        const clsKey = cls.toLowerCase();

        // Resolve XP table
        const tableKey = CLASS_XP_MAPPING[clsKey];
        const xpTable  = tableKey ? XP_TABLES[tableKey] : null;

        if (!xpTable) {
          $tooltip.html(`<div class="level-prog-tooltip-none">No progression table for <em>${esc(cls) || 'unknown class'}</em>.</div>`);
        } else {
          // Determine max level for this race/class combo
          const raceLimits = LEVEL_LIMITS[race];
          let maxLevel = xpTable.length; // default: full table

          if (raceLimits) {
            // Case-insensitive class match against limit keys
            const limitKey = Object.keys(raceLimits).find(k => k.toLowerCase() === cls.toLowerCase());
            if (limitKey !== undefined) maxLevel = raceLimits[limitKey];
          }

          // Format XP with commas
          const fmt = n => n.toLocaleString();

          const rows = xpTable.slice(0, maxLevel).map((xp, i) => {
            const level = i + 1;
            const isCurrent = level === (parseInt(this.actor.system.level) || 1);
            const cls2 = isCurrent ? ' level-prog-current' : '';
            const nextXP = xpTable[i + 1];
            const range = nextXP !== undefined
              ? `${fmt(xp)} – ${fmt(nextXP - 1)}`
              : `${fmt(xp)}+`;
            return `<tr class="level-prog-row${cls2}">
              <td class="level-prog-lvl">${level}</td>
              <td class="level-prog-range">${range}</td>
            </tr>`;
          }).join('');

          const limitNote = raceLimits && maxLevel < xpTable.length
            ? `<div class="level-prog-limit">Max level ${maxLevel} for ${esc(race)} ${esc(cls)}</div>`
            : '';

          $tooltip.html(`
            <div class="level-prog-title">${esc(cls)} XP Progression</div>
            <table class="level-prog-table">
              <thead><tr><th>Lvl</th><th>XP Range</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            ${limitNote}
          `);
        }

        const offset = $container.position();
        $tooltip.css({
          top:  (offset.top + $container.outerHeight() + 4) + 'px',
          left: offset.left + 'px'
        });
        $tooltip.addClass('visible');
      }, 3000);
    });

    $container.on('mouseleave.levtip', () => {
      clearTimeout(timer);
      $tooltip.removeClass('visible');
    });
  }

  /**
   * Handle toggling container collapsed state
   */
  async _onContainerToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const containerEntry = $(event.currentTarget).closest('.item-entry');
    const containerId = containerEntry.data('item-id');
    const currentState = this.actor.getFlag('osp-houserules', `container-${containerId}-collapsed`) ?? true;
    
    await this.actor.setFlag('osp-houserules', `container-${containerId}-collapsed`, !currentState);
    this.render(false);
  }

  async _onLashedToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const lashedSection = $(event.currentTarget).closest('.lashed-items-section');
    const containerId = lashedSection.data('container-id');
    const currentState = this.actor.getFlag('osp-houserules', `lashed-${containerId}-collapsed`) ?? true;
    
    await this.actor.setFlag('osp-houserules', `lashed-${containerId}-collapsed`, !currentState);
    this.render(false);
  }

  async _onBeltRowToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    const itemId = $(event.currentTarget).data('item-id');
    const currentState = this.actor.getFlag('osp-houserules', `lashed-${itemId}-collapsed`) ?? true;
    await this.actor.setFlag('osp-houserules', `lashed-${itemId}-collapsed`, !currentState);
    this.render(false);
  }

  async _onAttachmentToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    const itemId = $(event.currentTarget).data('item-id');
    const currentState = this.actor.getFlag('osp-houserules', `attachment-${itemId}-collapsed`) ?? true;
    await this.actor.setFlag('osp-houserules', `attachment-${itemId}-collapsed`, !currentState);
    this.render(false);
  }

  async _onSlingStorageToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    const itemId = $(event.currentTarget).data('item-id');
    const currentState = this.actor.getFlag('osp-houserules', `sling-${itemId}-collapsed`) ?? true;
    await this.actor.setFlag('osp-houserules', `sling-${itemId}-collapsed`, !currentState);
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

    const LASHABLE_CONTAINER_NAMES = new Set(['Bolt Case', 'Quiver, Hip']);
    const HAND_CARRY_CONTAINERS = new Set(['Sack, Large', 'Sack, Small']);

    const item = await Item.implementation.fromDropData(data);
    const itemData = item.toObject();

    // Check if dropping onto a container or a contained item
    // Also match .slung-item rows (containers in the Slung Items virtual section)
    let dropTarget = event.target.closest('.item-entry[data-item-id]')
                  || event.target.closest('.slung-item[data-item-id]');
    let targetContainer = dropTarget ? this.actor.items.get(dropTarget.dataset.itemId) : null;
    
    // If we dropped on a contained item (not a container or clothing with capacity), find its parent container
    if (targetContainer && targetContainer.type !== "container" && !(targetContainer.type === "clothing" && targetContainer.system.capacity) && targetContainer.system.containerId) {
      targetContainer = this.actor.items.get(targetContainer.system.containerId);
    }

    // Check if this item already exists on this actor
    const existingItemCheck = this.actor.items.get(itemData._id);

    // Check if this is a reordering operation or a new item
    const isReordering = item.actor && item.actor.id === this.actor.id;

    // Prevent circular containment: a container cannot be moved into itself or its own descendants
    if (isReordering && targetContainer && itemData.type === 'container') {
      if (targetContainer.id === item.id) {
        ui.notifications.error(`Cannot drop ${item.name} into itself.`);
        return false;
      }
      if (this._containerIsDescendant(targetContainer, item)) {
        ui.notifications.error(`Cannot drop ${item.name} into one of its own contents.`);
        return false;
      }
    }

    // Store Lock — block non-GM players from acquiring items from outside their inventory
    if (game.settings.get("osp-houserules", "storeLock") && !game.user.isGM && !isReordering) {
      ui.notifications.warn("The store is locked — you cannot add items to your inventory right now.");
      return false;
    }

    // Drop onto the Slung Items section → equip the item (= sling it)
    // But skip if dropping onto a specific slung container (e.g. Baldric) — let normal container logic handle it
    const droppedOnSlungItem = event.target.closest('.slung-item');
    if (event.target.closest('.slung-section-entry') && !droppedOnSlungItem) {
      const tags = itemData.system?.tags || [];
      if (!isSlungable(tags)) {
        ui.notifications.warn(`${itemData.name} cannot be slung.`);
        return false;
      }
      const currentSlung = this.actor.items.filter(i =>
        isSlungable(i.system.tags || []) && i.system.equipped && i.id !== item.id
      );
      const slotsUsed = currentSlung.reduce((sum, i) => sum + slungSlots(i), 0);
      const slotsNeeded = itemData.system?.slungSlots ?? 1;
      if (slotsUsed + slotsNeeded > SLUNG_MAX) {
        ui.notifications.warn(`Not enough slung capacity (need ${slotsNeeded}, have ${SLUNG_MAX - slotsUsed}).`);
        return false;
      }
      const slungEquipped = itemData.type !== 'weapon';
      if (isReordering) {
        return item.update({ 'system.equipped': slungEquipped, 'system.containerId': null, 'system.lashed': false });
      }
      itemData.system.equipped = slungEquipped;
      itemData.system.containerId = null;
      itemData.system.lashed = false;
      if (item.actor && item.actor.id !== this.actor.id) {
        return item.actor.deleteEmbeddedDocuments('Item', [item.id]).then(() =>
          this.actor.createEmbeddedDocuments('Item', [itemData])
        );
      }
      return this.actor.createEmbeddedDocuments('Item', [itemData]);
    }

    // Swords and daggers dropped on open space: auto-provision carrying equipment
    if (itemData.type === "weapon" && (this._itemIsSword(itemData) || this._itemIsDagger(itemData))) {
      if (!targetContainer || targetContainer.type !== "container") {
        let provisioned;
        try {
          provisioned = await this._autoProvisionSwordCarrier(item, itemData);
        } catch (err) {
          console.error('[OSP] Sword carrier provisioning failed:', err);
          ui.notifications.error(`Could not place ${itemData.name}: ${err.message || 'internal error'}`);
          return false;
        }
        if (!provisioned) return false;
        targetContainer = provisioned;
      } else if (this._itemIsSword(itemData) && targetContainer.name === 'Sword Frog') {
        // Dropped directly on a Sword Frog — find or create its Scabbard, then redirect there
        let scabbard = this.actor.items.find(
          i => i.name === 'Scabbard, Sword' && i.system.containerId === targetContainer.id
        );
        if (!scabbard) {
          const tmpl = this._getSwordCarrierTemplate('Scabbard, Sword');
          const [created] = await this.actor.createEmbeddedDocuments('Item', [{
            name: 'Scabbard, Sword', type: 'container', img: tmpl.img,
            system: { ...tmpl.system, containerId: targetContainer.id }
          }]);
          scabbard = created;
        }
        targetContainer = scabbard;
      } else if (this._itemIsDagger(itemData) && !(targetContainer.system?.tags || []).some(t => ['weapon-storage', 'scabbard', 'sling'].includes(t))) {
        // Dagger dropped on a general container.
        // If it came from a Scabbard, Dagger, reuse that scabbard rather than creating a duplicate.
        const sourceScabbard = isReordering ? this.actor.items.get(item.system?.containerId) : null;
        const isSourceDaggerScabbard = sourceScabbard?.name === 'Scabbard, Dagger';
        const existingInTarget = this.actor.items.find(
          i => i.name === 'Scabbard, Dagger' && i.system.containerId === targetContainer.id
        );
        let chosenScabbard;
        if (existingInTarget) {
          // Reuse the existing scabbard already in the target container.
          // If the source was a different scabbard it will now be empty — delete it.
          if (isSourceDaggerScabbard && sourceScabbard.id !== existingInTarget.id) {
            await this.actor.deleteEmbeddedDocuments('Item', [sourceScabbard.id]);
          }
          chosenScabbard = existingInTarget;
        } else if (isSourceDaggerScabbard) {
          // No existing scabbard in target — move the source scabbard here; dagger follows automatically.
          await sourceScabbard.update({
            'system.containerId': targetContainer.id,
            'system.lashed': false,
            'system.equipped': false
          });
          chosenScabbard = sourceScabbard;
        } else {
          chosenScabbard = await this._findOrCreateScabbardInContainer('Scabbard, Dagger', targetContainer);
        }
        if (!chosenScabbard) return false;
        targetContainer = chosenScabbard;
      }
    }

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

    // Sling containers (Baldric, Axe Sling, Skin Sling) — auto-equip, never stored or lashed
    if (itemData.type === 'container' && (itemData.system?.tags || []).includes('sling')) {
      if (targetContainer && targetContainer.type === 'container') {
        ui.notifications.error(`${itemData.name} cannot be stored in a container.`);
        return false;
      }

      // Check if another sling of the same name already exists on this actor
      const existingSling = this.actor.items.find(i =>
        i.type === 'container' &&
        i.name === itemData.name &&
        (!isReordering || i.id !== itemData._id)
      );

      if (existingSling) {
        // Already have one — can't wear a second. Show drop/delete/cancel.
        const itemHandler = this.getHandler('item');
        if (isReordering) {
          await this._showSlingNoRoomDialog(this.actor.items.get(itemData._id), itemHandler);
        } else {
          const [created] = await this.actor.createEmbeddedDocuments('Item', [
            { ...itemData, system: { ...itemData.system, containerId: null, equipped: false } }
          ]);
          await this._showSlingNoRoomDialog(created, itemHandler);
        }
        return;
      }

      // Auto-equip the sling
      itemData.system.containerId = null;
      itemData.system.equipped = true;
      if (item.actor && item.actor.id !== this.actor.id) {
        return item.actor.deleteEmbeddedDocuments('Item', [item.id]).then(() =>
          this.actor.createEmbeddedDocuments('Item', [itemData])
        );
      }
      if (item.actor && item.actor.id === this.actor.id) {
        return item.update({ 'system.containerId': null, 'system.equipped': true });
      }
      return this.actor.createEmbeddedDocuments('Item', [itemData]);
    }

    // Weapons and armor: auto-equip if slot free, else auto-store, else error
    if (itemData.type === 'weapon' || itemData.type === 'armor') {
      // Check if dropping a weapon onto a lash-mount clothing item (e.g. Belt)
      const isBeltLash = itemData.type === 'weapon' &&
        targetContainer &&
        targetContainer.type === 'clothing' &&
        (targetContainer.system.lashSlots || 0) > 0 &&
        !targetContainer.system.capacity;

      if (isBeltLash) {
        if (!targetContainer.system.equipped) {
          ui.notifications.error(`${targetContainer.name} must be worn to lash items to it.`);
          return false;
        }
        const _beltBlockTags = itemData.system?.tags || [];
        const _isSlungOnly = (itemData.name || '').toLowerCase().includes('crossbow') ||
          (_beltBlockTags.includes('missile') && _beltBlockTags.includes('two-handed'));
        if (_isSlungOnly) {
          ui.notifications.error(`${itemData.name} cannot be lashed — sling it instead.`);
          return false;
        }
        const allowedSizes = targetContainer.system.lashAllowedSizes || [];
        if (allowedSizes.length > 0 && !allowedSizes.includes(itemData.system.size)) {
          ui.notifications.error(`${targetContainer.name} can only hold Small weapons. ${itemData.name} is size ${itemData.system.size || '?'}.`);
          return false;
        }
        const usedSlots = this.actor.items.filter(i => i.system.containerId === targetContainer.id && i.system.lashed).length;
        if (usedSlots >= targetContainer.system.lashSlots) {
          ui.notifications.error(`${targetContainer.name} has no available lash slots (${usedSlots}/${targetContainer.system.lashSlots} used).`);
          return false;
        }
        itemData.system.containerId = targetContainer.id;
        itemData.system.lashed = true;
        itemData.system.equipped = false;
        if (item.actor && item.actor.id !== this.actor.id) {
          return item.actor.deleteEmbeddedDocuments('Item', [item.id]).then(() =>
            this.actor.createEmbeddedDocuments('Item', [itemData])
          );
        }
        if (item.actor && item.actor.id === this.actor.id) {
          return item.update({ 'system.containerId': itemData.system.containerId, 'system.lashed': true, 'system.equipped': false });
        }
        return this.actor.createEmbeddedDocuments('Item', [itemData]);
      }
    }

    // Lashable container dropped onto a belt (clothing with lashSlots)
    const isBeltAttachmentDrop = itemData.type === 'container' &&
      (item.system?.lashable || itemData.system?.lashable || (item.system?.slotCost || 0) > 0 || (itemData.system?.slotCost || 0) > 0 || LASHABLE_CONTAINER_NAMES.has(itemData.name)) &&
      targetContainer && targetContainer.type === 'clothing' &&
      (targetContainer.system.lashSlots || 0) > 0;
    if (isBeltAttachmentDrop) {
      if (HAND_CARRY_CONTAINERS.has(itemData.name)) {
        ui.notifications.error(`${itemData.name} must be stored in a container or carried in hand — it cannot be lashed.`);
        return false;
      }
      if (!targetContainer.system.equipped) {
        ui.notifications.error(`${targetContainer.name} must be worn to attach items to it.`);
        return false;
      }

      const belt = targetContainer;
      const lashedAttachments = this.actor.items.filter(i =>
        i.type === 'container' && i.system.containerId === belt.id && i.system.lashed && i.id !== itemData._id
      );
      const usedSlots = lashedAttachments.reduce((sum, i) => sum + (i.system.slotCost || 1), 0);
      const itemSlotCost = item.system?.slotCost || itemData.system?.slotCost || 1;
      if (usedSlots + itemSlotCost > belt.system.lashSlots) {
        ui.notifications.error(`${belt.name} has no room for ${itemData.name} (${usedSlots}/${belt.system.lashSlots} slots used, need ${itemSlotCost}).`);
        return false;
      }

      if (isReordering) {
        return item.update({ 'system.lashed': true, 'system.containerId': belt.id });
      }
      itemData.system.lashed = true;
      itemData.system.containerId = belt.id;
      if (item.actor && item.actor.id !== this.actor.id) {
        return item.actor.deleteEmbeddedDocuments('Item', [item.id]).then(() =>
          this.actor.createEmbeddedDocuments('Item', [itemData])
        );
      }
      return this.actor.createEmbeddedDocuments('Item', [itemData]);
    }

    if (itemData.type === 'weapon' || itemData.type === 'armor') {
      const isTargetContainer = targetContainer &&
        (targetContainer.type === 'container' ||
         (targetContainer.type === 'clothing' && targetContainer.system.capacity));

      if (isTargetContainer) {
        // Dropped onto a specific container — fall through to existing container handling below
      } else if (isReordering) {
        // Weapon/armor being dragged to open space: only allow if currently equipped
        if (!item.system.equipped) {
          ui.notifications.error(`${item.name} must be stored in a container. Drag it onto a container.`);
          return false;
        }
        // Equipped item dropped on open space: no-op (stays on Combat tab)
        return false;
      } else {
        // Shields dropped onto gear tab always go to backpack lash slot
        if (itemData.type === 'armor' && itemData.system?.type === 'shield') {
          const itemHandler = this.getHandler('item');
          const backpack = itemHandler._findBackpackWithLashSlot(itemData);
          if (backpack) {
            itemData.system.lashed = true;
            itemData.system.containerId = backpack.id;
            itemData.system.equipped = false;
          } else {
            // No slot — create item then show dialog
            const [created] = await this.actor.createEmbeddedDocuments('Item', [itemData]);
            await itemHandler._showArmorNoStorageDialog(created);
            return;
          }
          if (item.actor && item.actor.id !== this.actor.id) {
            return item.actor.deleteEmbeddedDocuments('Item', [item.id]).then(() =>
              this.actor.createEmbeddedDocuments('Item', [itemData])
            );
          }
          if (item.actor && item.actor.id === this.actor.id) {
            return item.update({ 'system.equipped': false, 'system.containerId': itemData.system.containerId, 'system.lashed': true });
          }
          return this.actor.createEmbeddedDocuments('Item', [itemData]);
        }

        // New item — auto-equip if slot is free, otherwise auto-store
        const armorBodyTypes = ['light', 'medium', 'heavy'];
        let slotFree;
        if (itemData.type === 'weapon') {
          slotFree = !this.actor.items.some(i => i.type === 'weapon' && i.system.equipped);
        } else if (armorBodyTypes.includes(itemData.system?.type)) {
          slotFree = !this.actor.items.some(i =>
            i.type === 'armor' && armorBodyTypes.includes(i.system.type) && i.system.equipped);
        } else {
          // Shield or other non-body armor
          slotFree = !this.actor.items.some(i =>
            i.type === 'armor' && !armorBodyTypes.includes(i.system.type) && i.system.equipped);
        }

        if (slotFree) {
          itemData.system.equipped = true;
          itemData.system.containerId = null;
        } else {
          let stored = false;
          const _weaponTags = itemData.system?.tags || [];
          const _noBackpackLash = itemData.type === 'weapon' && (
            (_weaponTags.includes('missile') && _weaponTags.includes('two-handed')) ||
            (itemData.name || '').toLowerCase().includes('crossbow')
          );
          // Try lash first if item supports it (bows/crossbows/sacks/containers must not be lashed to backpack)
          if (itemData.system.lashable && itemData.type !== 'container' && !_noBackpackLash && !HAND_CARRY_CONTAINERS.has(itemData.name)) {
            const lashContainer = this._findContainerWithLashSlot(itemData);
            if (lashContainer) {
              itemData.system.containerId = lashContainer.id;
              itemData.system.lashed = true;
              itemData.system.equipped = false;
              stored = true;
            }
          }
          if (!stored) {
            const storageContainer = this._findContainerWithSpace(itemData);
            if (storageContainer) {
              itemData.system.containerId = storageContainer.id;
              itemData.system.equipped = false;
              stored = true;
            }
          }
          if (!stored) {
            ui.notifications.error(`No available storage for ${itemData.name}. Free up container space first.`);
            return false;
          }
        }

        if (item.actor && item.actor.id !== this.actor.id) {
          return item.actor.deleteEmbeddedDocuments('Item', [item.id]).then(() =>
            this.actor.createEmbeddedDocuments('Item', [itemData])
          );
        }
        if (item.actor && item.actor.id === this.actor.id) {
          return item.update({
            'system.equipped': itemData.system.equipped,
            'system.containerId': itemData.system.containerId,
            'system.lashed': itemData.system.lashed ?? false
          });
        }
        return this.actor.createEmbeddedDocuments('Item', [itemData]);
      }
    }

    // If the item is of type "item", "coin", or "ammunition" (not weapon/armor/container/clothing), it MUST go into a container
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
      const check0 = this._isItemAllowedInContainer(itemData, targetContainer);
      if (!check0.allowed) { ui.notifications.error(check0.reason); return false; }

      // For coins, show quantity dialog
      if (itemData.type === "coin") {
        return this._handleCoinDrop(item, itemData, targetContainer, isReordering);
      }

      // For ammunition and stackable items, show quantity dialog
      if (itemData.type === "ammunition" || itemData.type === "item") {
        return this._handleAmmunitionDrop(item, itemData, targetContainer, isReordering);
      }

      // Check container restrictions (type, size, containerSizeRequired)
      const check1 = this._isItemAllowedInContainer(itemData, targetContainer);
      if (!check1.allowed) { ui.notifications.error(check1.reason); return false; }

      // Check capacity (skip for hideCapacity containers like scabbards)
      const alreadyInContainer1 = isReordering && itemData.system.containerId === targetContainer.id;
      if (!alreadyInContainer1 && !this._skipCapacityCheck(targetContainer) && !this._hasContainerSpace(targetContainer, itemData)) {
        const totalRequired = this._getEffectiveDropSize(itemData);
        ui.notifications.error(`Not enough space in ${targetContainer.name}. Required: ${totalRequired}, Available: ${this._getAvailableSpace(targetContainer)}`);
        return false;
      }

      // Set the container ID
      itemData.system.containerId = targetContainer.id;
    }
    // Containers can be stored in other containers, but the target must have capacity
    // for the container's own storedSize plus all items stored inside it.
    else if (itemData.type === "container" && targetContainer && targetContainer.type === "container") {
      // Check container restrictions
      const check2 = this._isItemAllowedInContainer(itemData, targetContainer);
      if (!check2.allowed) { ui.notifications.error(check2.reason); return false; }

      // Check if there's enough space in the target container
      const alreadyInContainer2 = isReordering && itemData.system.containerId === targetContainer.id;
      if (!alreadyInContainer2 && !this._skipCapacityCheck(targetContainer) && !this._hasContainerSpace(targetContainer, itemData)) {
        const totalRequired = this._getEffectiveDropSize(itemData);
        ui.notifications.error(`Not enough space in ${targetContainer.name}. Required: ${totalRequired}, Available: ${this._getAvailableSpace(targetContainer)}`);
        return false;
      }

      itemData.system.containerId = targetContainer.id;
      itemData.system.lashed = false;
      itemData.system.equipped = false;
    }
    // Belt with items attached cannot be stored in a container
    else if (itemData.type === "clothing" && targetContainer && targetContainer.type === "container") {
      const attachedItems = isReordering
        ? this.actor.items.filter(i => i.system.containerId === item.id && i.system.lashed)
        : [];
      if (attachedItems.length > 0) {
        ui.notifications.error(`Cannot store ${itemData.name} in a container — it has ${attachedItems.length} item(s) attached. Remove attachments first.`);
        return false;
      }
      itemData.system.containerId = targetContainer.id;
    }
    // Weapons/armor can be dropped onto containers
    else if (targetContainer &&
             (targetContainer.type === "container" ||
              (targetContainer.type === "clothing" && targetContainer.system.capacity))) {
      // Stack-merge: if an identical item already exists in this container, merge quantities
      // and return early — this bypasses maxItems so daggers in a scabbard can stack.
      const stackMatch3 = this.actor.items.find(i =>
        i.name === itemData.name &&
        i.type === itemData.type &&
        i.system.containerId === targetContainer.id &&
        i.system.storedSize === itemData.system.storedSize &&
        (!isReordering || i.id !== item.id)
      );
      if (stackMatch3) {
        const addingQty = itemData.system.quantity || 1;
        const newQty = (stackMatch3.system.quantity || 1) + addingQty;
        ui.notifications.info(`Merged ${addingQty} ${itemData.name}(s) with existing stack.`);
        // If the container is a scabbard (weapon-storage), its qty mirrors the contained stack
        const isScabbardContainer = (targetContainer.system?.tags || []).includes('scabbard');
        const syncScabbardQty = isScabbardContainer
          ? targetContainer.update({"system.quantity": newQty})
          : Promise.resolve();
        if (isReordering) return item.delete().then(() => Promise.all([stackMatch3.update({"system.quantity": newQty}), syncScabbardQty]));
        if (item.actor && item.actor.id !== this.actor.id) {
          return item.actor.deleteEmbeddedDocuments('Item', [item.id]).then(() =>
            Promise.all([stackMatch3.update({"system.quantity": newQty}), syncScabbardQty])
          );
        }
        return Promise.all([stackMatch3.update({"system.quantity": newQty}), syncScabbardQty]);
      }

      // Check container restrictions
      const check3 = this._isItemAllowedInContainer(itemData, targetContainer);
      if (!check3.allowed) { ui.notifications.error(check3.reason); return false; }

      // Stackable thrown weapons (consumable splash weapons, darts) use the quantity dialog
      const tags = itemData.system.tags || [];
      if (itemData.type === 'weapon' &&
          (tags.includes('consumable') || (tags.includes('missile') && tags.includes('reload')))) {
        return this._handleAmmunitionDrop(item, itemData, targetContainer, isReordering);
      }

      const alreadyInContainer3 = isReordering && itemData.system.containerId === targetContainer.id;
      if (!alreadyInContainer3 && !this._skipCapacityCheck(targetContainer) && !this._hasContainerSpace(targetContainer, itemData)) {
        const totalRequired = this._getEffectiveDropSize(itemData);
        ui.notifications.error(`Not enough space in ${targetContainer.name}. Required: ${totalRequired}, Available: ${this._getAvailableSpace(targetContainer)}`);
        return false;
      }
      // When the target has hidden capacity (e.g. belt loop inside a backpack), also verify
      // the parent container has room for the incoming item.
      // Skip this check when lashed — lashed containers don't consume parent capacity.
      if (!alreadyInContainer3 && this._skipCapacityCheck(targetContainer) && targetContainer.system.containerId && !targetContainer.system.lashed) {
        const parentContainer = this.actor.items.get(targetContainer.system.containerId);
        if (parentContainer && !this._skipCapacityCheck(parentContainer) && !this._hasContainerSpace(parentContainer, itemData)) {
          const itemSize = this._getEffectiveDropSize(itemData);
          ui.notifications.error(`Not enough space in ${parentContainer.name} for ${itemData.name} (size ${itemSize}).`);
          return false;
        }
      }
      itemData.system.containerId = targetContainer.id;
    }
    // Belt dropped onto open gear tab space: auto-equip if no belt worn, else auto-store
    else if (itemData.type === "clothing" && itemData.name === "Belt" && !targetContainer) {
      const equippedBelt = this.actor.items.find(i =>
        i.type === "clothing" && i.name === "Belt" && i.system.equipped &&
        (!isReordering || i.id !== item.id)
      );
      if (!equippedBelt) {
        itemData.system.equipped = true;
        itemData.system.containerId = null;
      } else {
        const container = this._findContainerWithSpace(itemData);
        if (container) {
          itemData.system.containerId = container.id;
          itemData.system.equipped = false;
        } else {
          ui.notifications.error(`No storage space available for ${itemData.name}. Free up container space first.`);
          return false;
        }
      }
    }
    // Lashable containers (and weapon-storage carriers like scabbards) dropped on open space:
    // auto-attach to equipped belt if room available; weapon-storage containers CANNOT be at root.
    else if (itemData.type === 'container' && !targetContainer &&
      (itemData.system?.lashable || (itemData.system?.slotCost || 0) > 0 || LASHABLE_CONTAINER_NAMES.has(itemData.name) ||
       (itemData.system?.tags || []).includes('weapon-storage'))) {
      const tags = itemData.system?.tags || [];
      // Scabbard, Sword / Scabbard, Dagger with no slotCost go INSIDE a Sword Frog, not lashed to the belt directly.
      const isNonLashableScabbard = tags.includes('weapon-storage') && tags.includes('scabbard') &&
        !tags.includes('sling') && !(itemData.system?.lashable) && !(itemData.system?.slotCost);
      if (isNonLashableScabbard) {
        const frog = await this._findOrCreateSwordFrog(item, isReordering);
        if (!frog) return false;
        itemData.system.containerId = frog.id;
        itemData.system.lashed = false;
        itemData.system.equipped = false;
      } else {
        // Lashable belt attachment (Sword Frog, Belt Pouch, Quiver, etc.) — auto-belt-lash
        const belt = this.actor.items.find(i => i.type === 'clothing' && (i.system.lashSlots || 0) > 0 && i.system.equipped);
        if (belt) {
          const lashedAttachments = this.actor.items.filter(i => i.system.containerId === belt.id && i.system.lashed && (!isReordering || i.id !== item.id));
          const usedSlots = lashedAttachments.reduce((sum, i) => sum + (i.system.slotCost || 1), 0);
          const itemSlotCost = itemData.system.slotCost || 1;
          if (usedSlots + itemSlotCost <= (belt.system.lashSlots || 0)) {
            itemData.system.lashed = true;
            itemData.system.containerId = belt.id;
            itemData.system.equipped = false;
          } else {
            ui.notifications.error(`No free belt slots for ${itemData.name}. Drop it onto a container to store it instead.`);
            return false;
          }
        } else {
          const msg = tags.includes('weapon-storage')
            ? `${itemData.name} must be worn on a belt — equip a belt first.`
            : `${itemData.name} must be attached to a belt or stored in a container.`;
          ui.notifications.error(msg);
          return false;
        }
      }
    }
    // If reordering and not dropped on a container, clear the containerId
    // (weapon-storage containers are caught above and never reach this branch)
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
      
      if (movingQty > 1 && currentContainerId !== targetContainerId && (itemData.type === "item" || itemData.type === "container" || itemData.type === "ammunition" || itemData.type === "weapon" || itemData.type === "armor")) {
        return this._handleStackedItemDrop(item, itemData, targetContainer, currentContainerId);
      }
      
      // Check if we should stack this item with an existing one in the target container
      if (targetContainer && (itemData.type === "item" || itemData.type === "container" || itemData.type === "ammunition" || itemData.type === "weapon" || itemData.type === "armor")) {
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
      
      // No matching item found — update containerId and lashed/equipped.
      // When dropped onto an explicit targetContainer, always clear lashed/equipped (item is stored, not lashed).
      // When auto-placed by belt-lash logic (targetContainer null), use the values set above.
      const updatePayload = {"system.containerId": itemData.system.containerId};
      if (itemData.system.containerId) {
        updatePayload["system.lashed"] = targetContainer ? false : (itemData.system.lashed ?? false);
        updatePayload["system.equipped"] = targetContainer ? false : (itemData.system.equipped ?? false);
      }
      return item.update(updatePayload);
    }

    // Check if this item already exists on this actor (handles case where item.actor is null)
    const existingItem = this.actor.items.get(itemData._id);
    if (existingItem) {
      const existingUpdatePayload = {"system.containerId": itemData.system.containerId};
      if (itemData.system.containerId) {
        existingUpdatePayload["system.lashed"] = targetContainer ? false : (itemData.system.lashed ?? false);
        existingUpdatePayload["system.equipped"] = targetContainer ? false : (itemData.system.equipped ?? false);
      }
      return existingItem.update(existingUpdatePayload);
    }

    // Handle item from compendium or elsewhere - check for stacking
    
    // Check if we should stack this item with an existing one
    if (targetContainer && (itemData.type === "item" || itemData.type === "container" || itemData.type === "ammunition" || itemData.type === "weapon" || itemData.type === "armor")) {
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
  // Placement rules that apply to well-known containers regardless of whether the actor's item
  // data has been refreshed. Keyed by container name. Container.system.blockedTypes takes
  // precedence when set (after running the refresh macro), otherwise this table is the source.
  static BUILT_IN_BLOCKED_TYPES = {
    'Belt Pouch (S)': ['armor', 'container', 'clothing', 'sword', 'dagger'],
    'Belt Pouch (L)': ['armor', 'container', 'clothing', 'sword', 'dagger'],
    'Backpack':       ['slungable', 'sword'],
    'Sack, Small':    ['slungable'],
    'Sack, Large':    ['slungable'],
  };

  _isItemAllowedInContainer(itemData, container) {
    // Sling containers (Baldric, Axe Sling, etc.) cannot be stored in any container
    if (itemData.type === 'container' && (itemData.system?.tags || []).includes('sling')) {
      return { allowed: false, reason: `${itemData.name} cannot be stored in a container.` };
    }

    // Check allowedNames — strict whitelist by item name (used by scabbards, frogs, slings).
    // Strip trailing modifier (e.g. " +2") so "Longsword +2" matches "Longsword".
    const allowedNames = container.system?.allowedNames;
    if (allowedNames?.length > 0) {
      const baseName = itemData.name.replace(/\s*[+-]\d+$/, '');
      if (!allowedNames.includes(baseName)) {
        return { allowed: false, reason: `${container.name} only accepts: ${allowedNames.join(', ')}.` };
      }
    }

    // Check allowedTypes — strict whitelist by tag, weaponType, or Foundry item type (used by quivers, bolt cases).
    const allowedTypes = container.system?.allowedTypes;
    if (allowedTypes?.length > 0) {
      const itemTags = itemData.system?.tags || [];
      const weaponType = itemData.system?.weaponType || '';
      const matches = allowedTypes.some(t => itemTags.includes(t) || weaponType === t || itemData.type === t);
      if (!matches) return { allowed: false, reason: `${container.name} only accepts: ${allowedTypes.join(', ')}.` };
    }

    // Check blockedTypes — blacklist by tag, weaponType, or Foundry item type.
    // Uses instance data (container.system.blockedTypes) when present; falls back to the
    // BUILT_IN_BLOCKED_TYPES table so rules apply to actors that pre-date the refresh macro.
    const blockedTypes = container.system?.blockedTypes ?? OspActorSheetCharacter.BUILT_IN_BLOCKED_TYPES[container.name];
    if (blockedTypes?.length > 0) {
      const itemTags = itemData.system?.tags || [];
      const weaponType = itemData.system?.weaponType || '';
      const matchedBlock = blockedTypes.find(t => itemTags.includes(t) || weaponType === t || itemData.type === t);
      if (matchedBlock) {
        return { allowed: false, reason: this._blockedItemReason(itemData, container) };
      }
    }

    // Check allowedSizes
    const allowedSizes = container.system?.allowedSizes || [];
    if (allowedSizes.length > 0 && !allowedSizes.includes(itemData.system?.size || '')) {
      return { allowed: false, reason: `${container.name} only accepts size: ${allowedSizes.join(', ')}.` };
    }

    // Check containerSizeRequired vs containerSize
    const required = itemData.system?.containerSizeRequired || '';
    if (required) {
      const sizeRank = { small: 1, medium: 2, large: 3 };
      const containerSize = container.system?.containerSize || 'medium';
      if ((sizeRank[containerSize] || 2) < (sizeRank[required] || 1)) {
        return { allowed: false, reason: `${itemData.name} is too large to fit inside ${container.name}.` };
      }
    }

    // Check maxItems
    const maxItems = container.system?.maxItems || 0;
    if (maxItems > 0) {
      const currentCount = this.actor.items.filter(i =>
        i.system.containerId === container.id && !i.system.lashed
      ).length;
      if (currentCount >= maxItems) {
        return { allowed: false, reason: `${container.name} is full (holds ${maxItems} item${maxItems > 1 ? 's' : ''} max).` };
      }
    }

    return { allowed: true, reason: null };
  }

  /** Build a context-aware rejection message for a blockedTypes match. */
  _blockedItemReason(itemData, container) {
    const tags = itemData.system?.tags || [];
    switch (itemData.type) {
      case 'armor':
        return `${itemData.name} must be worn or bundled separately — it cannot be stored in ${container.name}.`;
      case 'clothing':
        return `${itemData.name} must be worn, not stored in ${container.name}.`;
      case 'container':
        if (tags.includes('weapon-storage'))
          return `${itemData.name} belongs on a belt, not stored in ${container.name}.`;
        return `${container.name} cannot hold another container.`;
      case 'weapon':
        if (tags.includes('sword'))
          return `${itemData.name} is too long to fit in ${container.name} — swords belong in scabbards.`;
        if (tags.includes('dagger'))
          return `${itemData.name} belongs in a sheath, not stored in ${container.name}.`;
        if (tags.includes('slungable'))
          return `${itemData.name} must be slung, not stored in a container.`;
        return `${itemData.name} cannot be stored in ${container.name}.`;
      default:
        return `${itemData.name} cannot be stored in ${container.name}.`;
    }
  }

  _skipCapacityCheck(container) {
    return container.system?.hideCapacity === true;
  }

  _getSlungDropValidity() {
    if (!this._gearDragItemId) return null;
    const draggedItem = this.actor.items.get(this._gearDragItemId);
    if (!draggedItem) return null;
    const tags = draggedItem.system?.tags ?? [];
    if (isSlungable(tags)) return { valid: true };
    return { valid: false, reason: `${draggedItem.name} cannot be slung.` };
  }

  /**
   * Wire a gear-tab element as a drop target with validity-based highlighting.
   * Uses relatedTarget for accurate entry/exit detection — no counter needed, no stopPropagation.
   * Parent outlines are suppressed via CSS :has() when a child row is highlighted.
   * Drop events bubble to Foundry's _onDrop handler.
   */
  _wireGearDropTarget(el, containerItem, validityFn = null) {
    const applyHighlight = () => {
      el.classList.remove('drag-over', 'drag-valid', 'drag-invalid');
      const result = validityFn ? validityFn() : (containerItem ? this._getContainerDropValidity(containerItem) : null);
      if (result === null) {
        el.classList.add('drag-over');
      } else if (result.valid) {
        el.classList.add('drag-valid');
      } else {
        el.classList.add('drag-invalid');
      }
    };

    el.addEventListener('dragenter', (e) => {
      e.preventDefault();
      // Only apply when entering from outside this element
      if (!el.contains(e.relatedTarget)) applyHighlight();
    });
    el.addEventListener('dragleave', (e) => {
      // Only clear when leaving to outside this element
      if (!el.contains(e.relatedTarget)) {
        el.classList.remove('drag-over', 'drag-valid', 'drag-invalid');
      }
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    el.addEventListener('drop', () => {
      el.classList.remove('drag-over', 'drag-valid', 'drag-invalid');
    });
  }

  /**
   * Synchronous validity check for dropping the currently-dragged item onto targetContainer.
   * Returns {valid: true}, {valid: false, reason}, or null (cannot determine — show neutral).
   * Only works for items dragged from this actor; external/cross-actor drags return null.
   */
  _getContainerDropValidity(targetContainer) {
    if (!this._gearDragItemId) return null;

    const draggedItem = this.actor.items.get(this._gearDragItemId);
    if (!draggedItem) return null; // cross-actor drag — can't validate synchronously

    if (draggedItem.id === targetContainer.id) {
      return { valid: false, reason: 'Cannot drop a container into itself.' };
    }
    if (this._containerIsDescendant(targetContainer, draggedItem)) {
      return { valid: false, reason: 'Cannot drop a container into its own contents.' };
    }

    // Lash-mount targets (Belt, bandolier — clothing with lashSlots but no capacity).
    const isLashMount = targetContainer.type === 'clothing' &&
      (targetContainer.system.lashSlots || 0) > 0 &&
      !targetContainer.system.capacity;
    if (isLashMount) {
      if (!targetContainer.system.equipped) {
        return { valid: false, reason: `${targetContainer.name} must be worn to attach items.` };
      }
      const tags = draggedItem.system?.tags || [];
      const isSlungOnly = (draggedItem.name || '').toLowerCase().includes('crossbow') ||
        (tags.includes('missile') && tags.includes('two-handed')) ||
        tags.includes('sling');
      if (isSlungOnly) {
        return { valid: false, reason: `${draggedItem.name} cannot be lashed — sling it instead.` };
      }
      const itemData = draggedItem.toObject();
      // Swords and daggers go through _autoProvisionSwordCarrier on drop, which reuses existing
      // empty scabbards and has its own slot accounting. Belt-equipped check above is sufficient.
      if (draggedItem.type === 'weapon' && (this._itemIsSword(itemData) || this._itemIsDagger(itemData))) {
        return { valid: true };
      }
      const isWeapon = draggedItem.type === 'weapon';
      const isLashable = draggedItem.system?.lashable === true || (draggedItem.system?.slotCost || 0) > 0;
      if (!isWeapon && !isLashable) return null;
      // lashAllowedSizes is only enforced by the isBeltLash drop path, which only runs for weapons.
      // Non-weapon lashable containers take the isReordering path (no size check), so skip here.
      if (isWeapon) {
        const allowedSizes = targetContainer.system.lashAllowedSizes || [];
        if (allowedSizes.length > 0 && !allowedSizes.includes(draggedItem.system?.size)) {
          return { valid: false, reason: `${draggedItem.name} is the wrong size for ${targetContainer.name}.` };
        }
      }
      // Use slot-cost reduce (matches auto-provision logic).
      // Exclude draggedItem itself — when reordering an already-lashed item its slots are already counted.
      const usedSlots = this.actor.items
        .filter(i => i.system.containerId === targetContainer.id && i.system.lashed && i.id !== draggedItem.id)
        .reduce((sum, i) => sum + (i.system.slotCost || 1), 0);
      const itemSlotCost = draggedItem.system?.slotCost || 1;
      if (usedSlots + itemSlotCost > (targetContainer.system.lashSlots || 0)) {
        return { valid: false, reason: `${targetContainer.name} has no free lash slots.` };
      }
      return { valid: true };
    }

    // Only containers and clothing-with-capacity are storage targets
    const isStorage = targetContainer.type === 'container' ||
      (targetContainer.type === 'clothing' && targetContainer.system.capacity);
    if (!isStorage) return null;

    const itemData = draggedItem.toObject();

    const typeCheck = this._isItemAllowedInContainer(itemData, targetContainer);
    if (!typeCheck.allowed) return { valid: false, reason: typeCheck.reason };

    // Use quantity 1 for hover check so a partial-stack move shows valid when any space exists
    if (!this._skipCapacityCheck(targetContainer)) {
      const checkData = foundry.utils.mergeObject(itemData, { system: { quantity: 1 } }, { inplace: false });
      if (!this._hasContainerSpace(targetContainer, checkData)) {
        return { valid: false, reason: `Not enough space in ${targetContainer.name}.` };
      }
    }

    return { valid: true };
  }

  /**
   * Returns true if potentialChild is a descendant of potentialAncestor in the containment tree.
   */
  _containerIsDescendant(potentialChild, potentialAncestor) {
    const visited = new Set();
    let current = potentialChild;
    while (current.system?.containerId) {
      if (visited.has(current.id)) break; // cycle guard
      visited.add(current.id);
      const parent = this.actor.items.get(current.system.containerId);
      if (!parent) break;
      if (parent.id === potentialAncestor.id) return true;
      current = parent;
    }
    return false;
  }

  _itemIsSword(itemData) {
    return (itemData.system?.tags || []).includes('sword');
  }

  _itemIsDagger(itemData) {
    return (itemData.system?.tags || []).includes('dagger');
  }

  // ── Sword carrier auto-provisioning ────────────────────────────────────────

  async _autoProvisionSwordCarrier(item, itemData) {
    const name = itemData.name;
    if (name === 'Zweihander' || name === 'Greatsword') return this._provisionBaldric(item);
    if (this._itemIsDagger(itemData)) return this._provisionBeltScabbard('Scabbard, Dagger', item);
    return this._provisionSwordFrogAndScabbard(item);
  }

  _getEquippedBelt() {
    return this.actor.items.find(
      i => i.type === 'clothing' && (i.system.lashSlots || 0) > 0 && i.system.equipped
    ) || null;
  }

  _containerIsEmpty(container) {
    return !this.actor.items.some(i => i.system.containerId === container.id);
  }

  _getSwordCarrierTemplate(name) {
    const templates = {
      'Scabbard, Dagger': {
        img: 'systems/osp-houserules/assets/thumbs/images/gear/scabbard-small_thumb.webp',
        system: { description: '', cost: 3, unitWeight: 0.5, storedSize: 2, quantity: 1,
          slotCost: 1, lashable: true, lashed: false, equipped: false, containerId: null,
          tags: ['weapon-storage','scabbard'], capacity: 4, containerSize: 'small',
          hideCapacity: true, maxItems: 1, lashSlots: 0,
          allowedTypes: [], allowedSizes: [], allowedNames: ['Dagger','Misericorde'] }
      },
      'Scabbard, Sword': {
        img: 'systems/osp-houserules/assets/thumbs/images/gear/scabbard-sword_thumb.webp',
        system: { description: '', cost: 3, unitWeight: 0.5, storedSize: 2, quantity: 1,
          slotCost: 0, lashable: false, lashed: false, equipped: false, containerId: null,
          tags: ['weapon-storage','scabbard'], capacity: 4, containerSize: 'small',
          hideCapacity: true, maxItems: 1, lashSlots: 0,
          allowedTypes: [], allowedSizes: [],
          allowedNames: ['Longsword','Broadsword','Bastard Sword','Khopesh','Shortsword'] }
      },
      'Sword Frog': {
        img: 'systems/osp-houserules/assets/thumbs/images/gear/sword-frog_thumb.webp',
        system: { description: '', cost: 4, unitWeight: 0.5, storedSize: 2, quantity: 1,
          slotCost: 2, lashable: true, lashed: false, equipped: false, containerId: null,
          tags: ['weapon-storage','scabbard','bulky'], capacity: 4, containerSize: 'small',
          hideCapacity: true, maxItems: 1, lashSlots: 0,
          allowedTypes: [], allowedSizes: [], allowedNames: ['Scabbard, Sword'] }
      },
      'Baldric': {
        img: 'systems/osp-houserules/assets/thumbs/images/gear/baldric_thumb.webp',
        system: { description: '', cost: 10, unitWeight: 2, storedSize: 6, quantity: 1,
          lashable: false, lashed: false, equipped: false, containerId: null,
          tags: ['weapon-storage','sling','slungable'], capacity: 8, containerSize: 'small',
          hideCapacity: true, maxItems: 1, lashSlots: 0,
          allowedTypes: [], allowedSizes: [], allowedNames: ['Zweihander','Greatsword'] }
      },
    };
    return templates[name];
  }

  async _provisionBeltScabbard(scabbardName, itemBeingMoved = null) {
    const belt = this._getEquippedBelt();
    if (!belt) {
      ui.notifications.error('Cannot equip scabbard: this character does not have a belt.');
      return null;
    }
    // Reuse existing scabbard of this type on the belt, excluding the item being moved from the occupancy check
    const existing = this.actor.items.find(
      i => i.name === scabbardName && i.system.containerId === belt.id && i.system.lashed &&
        !this.actor.items.some(j => j.system.containerId === i.id && j.id !== itemBeingMoved?.id)
    );
    if (existing) {
      // Source scabbard (e.g. inside a container) becomes empty after the move — delete it.
      if (itemBeingMoved) {
        const sourceScabbard = this.actor.items.get(itemBeingMoved.system.containerId);
        if (sourceScabbard && sourceScabbard.name === scabbardName && sourceScabbard.id !== existing.id) {
          await this.actor.deleteEmbeddedDocuments('Item', [sourceScabbard.id]);
        }
      }
      return existing;
    }

    const tmpl = this._getSwordCarrierTemplate(scabbardName);

    // If the dagger came from a Scabbard, Dagger not already on the belt, move that scabbard
    // to the belt rather than creating a duplicate.
    if (itemBeingMoved) {
      const sourceScabbard = this.actor.items.get(itemBeingMoved.system.containerId);
      if (sourceScabbard && sourceScabbard.name === scabbardName &&
          !(sourceScabbard.system.containerId === belt.id && sourceScabbard.system.lashed)) {
        const lashedItems = this.actor.items.filter(i => i.system.containerId === belt.id && i.system.lashed);
        const usedSlots = lashedItems.reduce((sum, i) => sum + (i.system.slotCost || 0), 0);
        const neededSlots = tmpl?.system?.slotCost || 0;
        if (usedSlots + neededSlots <= (belt.system.lashSlots || 0)) {
          await sourceScabbard.update({ 'system.containerId': belt.id, 'system.lashed': true, 'system.equipped': false });
          return sourceScabbard;
        }
        // Belt full — fall through to the error below
      }
    }

    // Check belt slot capacity (category constraints are skipped for auto-provisioning)
    const lashedItems = this.actor.items.filter(i => i.system.containerId === belt.id && i.system.lashed);
    const usedSlots = lashedItems.reduce((sum, i) => sum + (i.system.slotCost || 0), 0);
    const neededSlots = tmpl.system.slotCost || 0;
    if (usedSlots + neededSlots > (belt.system.lashSlots || 0)) {
      ui.notifications.error(`Cannot create ${scabbardName}: belt is full (${usedSlots}/${belt.system.lashSlots} slots used, need ${neededSlots} more). Remove an attachment to make room.`);
      return null;
    }
    const [created] = await this.actor.createEmbeddedDocuments('Item', [{
      name: scabbardName, type: 'container', img: tmpl.img,
      system: { ...tmpl.system, containerId: belt.id, lashed: true }
    }]);
    return created;
  }

  async _findOrCreateScabbardInContainer(scabbardName, container) {
    // Reuse any existing scabbard of this type already in this container
    const existing = this.actor.items.find(
      i => i.name === scabbardName && i.system.containerId === container.id
    );
    if (existing) return existing;

    const tmpl = this._getSwordCarrierTemplate(scabbardName);
    if (!tmpl) return null;

    const scabbardItemData = { name: scabbardName, type: 'container', system: { ...tmpl.system, quantity: 1 } };
    const containerCheck = this._isItemAllowedInContainer(scabbardItemData, container);
    if (!containerCheck.allowed) {
      ui.notifications.error(`${container.name} cannot hold a ${scabbardName}: ${containerCheck.reason}`);
      return null;
    }
    if (!this._skipCapacityCheck(container) && !this._hasContainerSpace(container, scabbardItemData)) {
      ui.notifications.error(`Not enough space in ${container.name} for a ${scabbardName}.`);
      return null;
    }

    const [created] = await this.actor.createEmbeddedDocuments('Item', [{
      name: scabbardName, type: 'container', img: tmpl.img,
      system: { ...tmpl.system, containerId: container.id, lashed: false, equipped: false }
    }]);
    return created;
  }

  async _provisionSwordFrogAndScabbard(itemBeingMoved = null) {
    const belt = this._getEquippedBelt();
    if (!belt) {
      ui.notifications.error('Cannot equip scabbard: this character does not have a belt.');
      return null;
    }
    // Look for an existing Sword Frog on the belt with a usable Scabbard, Sword.
    // Exclude the item being moved so a sword dragged out of its own scabbard can return to it.
    const frogs = this.actor.items.filter(
      i => i.name === 'Sword Frog' && i.system.containerId === belt.id && i.system.lashed
    );
    for (const frog of frogs) {
      const scabbard = this.actor.items.find(
        i => i.name === 'Scabbard, Sword' && i.system.containerId === frog.id
      );
      const scabbardFree = scabbard && !this.actor.items.some(
        i => i.system.containerId === scabbard.id && i.id !== itemBeingMoved?.id
      );
      if (scabbardFree) return scabbard;
      if (!scabbard) {
        // Frog present but missing its scabbard — fill it
        const tmpl = this._getSwordCarrierTemplate('Scabbard, Sword');
        const [created] = await this.actor.createEmbeddedDocuments('Item', [{
          name: 'Scabbard, Sword', type: 'container', img: tmpl.img,
          system: { ...tmpl.system, containerId: frog.id }
        }]);
        return created;
      }
    }
    // No usable frog — check belt capacity for a new Sword Frog (slotCost 2, bulky)
    const lashedItems = this.actor.items.filter(i => i.system.containerId === belt.id && i.system.lashed);
    const frogTmpl = this._getSwordCarrierTemplate('Sword Frog');
    const usedSlots = lashedItems.reduce((sum, i) => sum + (i.system.slotCost || 1), 0);
    if (usedSlots + 2 > (belt.system.lashSlots || 0)) {
      ui.notifications.error('Cannot equip scabbard: the belt is full.');
      return null;
    }
    const [frog] = await this.actor.createEmbeddedDocuments('Item', [{
      name: 'Sword Frog', type: 'container', img: frogTmpl.img,
      system: { ...frogTmpl.system, containerId: belt.id, lashed: true }
    }]);
    const scabbardTmpl = this._getSwordCarrierTemplate('Scabbard, Sword');
    const [scabbard] = await this.actor.createEmbeddedDocuments('Item', [{
      name: 'Scabbard, Sword', type: 'container', img: scabbardTmpl.img,
      system: { ...scabbardTmpl.system, containerId: frog.id }
    }]);
    return scabbard;
  }

  // Find a belt-lashed Sword Frog with no Scabbard inside, or create one.
  // Used when a Scabbard, Sword is dropped at root — it must nest inside a Sword Frog.
  async _findOrCreateSwordFrog(item, isReordering) {
    const belt = this._getEquippedBelt();
    if (!belt) {
      ui.notifications.error('No belt equipped — equip a belt before placing a scabbard.');
      return null;
    }
    const frogs = this.actor.items.filter(
      i => i.name === 'Sword Frog' && i.system.containerId === belt.id && i.system.lashed
    );
    for (const frog of frogs) {
      const hasScabbard = this.actor.items.some(
        i => i.name === 'Scabbard, Sword' && i.system.containerId === frog.id &&
          (!isReordering || i.id !== item.id)
      );
      if (!hasScabbard) return frog;
    }
    // All frogs occupied — try to create a new one
    const frogTmpl = this._getSwordCarrierTemplate('Sword Frog');
    const lashedItems = this.actor.items.filter(i => i.system.containerId === belt.id && i.system.lashed);
    const usedSlots = lashedItems.reduce((sum, i) => sum + (i.system.slotCost || 1), 0);
    if (usedSlots + 2 > (belt.system.lashSlots || 0)) {
      ui.notifications.error('Cannot add Sword Frog: belt is full. Remove an attachment to make room.');
      return null;
    }
    const [frog] = await this.actor.createEmbeddedDocuments('Item', [{
      name: 'Sword Frog', type: 'container', img: frogTmpl.img,
      system: { ...frogTmpl.system, containerId: belt.id, lashed: true }
    }]);
    return frog;
  }

  async _provisionBaldric(itemBeingMoved = null) {
    // Reuse existing Baldric, excluding the item being moved from the occupancy check
    const existing = this.actor.items.find(
      i => i.name === 'Baldric' &&
        !this.actor.items.some(j => j.system.containerId === i.id && j.id !== itemBeingMoved?.id)
    );
    if (existing) {
      if (!existing.system.equipped) await existing.update({ 'system.equipped': true });
      return existing;
    }
    const tmpl = this._getSwordCarrierTemplate('Baldric');
    const [created] = await this.actor.createEmbeddedDocuments('Item', [{
      name: 'Baldric', type: 'container', img: tmpl.img,
      system: { ...tmpl.system, equipped: true }
    }]);
    return created;
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

    const usedCapacity = this._getUsedCapacity(container);
    const itemSize = this._getEffectiveDropSize(itemData);
    return (usedCapacity + itemSize) <= capacity;
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
   * Find the first top-level container with enough space for itemData
   */
  _findContainerWithSpace(itemData) {
    return this.actor.items.find(c =>
      c.type === 'container' &&
      !c.system.containerId &&
      this._hasContainerSpace(c, itemData)
    ) ?? null;
  }

  /**
   * Find the first container that has an available lash slot
   */
  _findContainerWithLashSlot(itemData) {
    return this.actor.items.find(c => {
      const lashSlots = c.system.lashSlots || 0;
      if (lashSlots === 0) return false;
      // Clothing lash mounts (e.g. Belt) must be worn to accept lashed items
      if (c.type === 'clothing' && !c.system.equipped) return false;
      // Check size restriction if present
      if (c.system.lashAllowedSizes?.length && itemData) {
        const weaponSize = itemData.system?.size;
        if (!weaponSize || !c.system.lashAllowedSizes.includes(weaponSize)) return false;
      }
      const used = this.actor.items.filter(i => i.system.containerId === c.id && i.system.lashed).length;
      return used < lashSlots;
    }) ?? null;
  }

  /**
   * Calculate used capacity in a container.
   * Includes nested contents of any sub-containers (e.g. weapons inside a belt loop inside a backpack).
   */
  _getUsedCapacity(container) {
    return this.actor.items
      .filter(item => item.system.containerId === container.id && !item.system.lashed)
      .reduce((total, item) => {
        const ownSize = (parseFloat(item.system.storedSize) || 0) * (item.system.quantity || 1);
        const nestedSize = item.type === 'container' ? this._getTotalNestedSize(item.id) : 0;
        return total + ownSize + nestedSize;
      }, 0);
  }

  // Returns the stored-size footprint of an item in its parent container.
  // A container occupies only its own storedSize regardless of its contents.
  _getEffectiveStoredSize(item) {
    return (parseFloat(item.system.storedSize) || 0) * (item.system.quantity || 1);
  }

  // Returns the effective size for an item being dropped (may be a plain data object, not a live item).
  // For containers, includes the total stored size of all nested contents.
  _getEffectiveDropSize(itemData) {
    const ss = parseFloat(itemData.system?.storedSize);
    if (isNaN(ss) || ss < 0) {
      return (itemData.type === 'weapon' || itemData.type === 'armor') ? 9999 : 0;
    }
    const ownSize = ss * (parseFloat(itemData.system.quantity) || 1);
    if (itemData.type === 'container' && itemData._id) {
      return ownSize + this._getTotalNestedSize(itemData._id);
    }
    return ownSize;
  }

  // Recursively sums storedSize of all items inside a container (by id), including deep descendants.
  _getTotalNestedSize(containerId) {
    return this.actor.items
      .filter(i => i.system.containerId === containerId)
      .reduce((sum, child) => {
        const childSize = (parseFloat(child.system.storedSize) || 0) * (child.system.quantity || 1);
        return sum + childSize + (child.type === 'container' ? this._getTotalNestedSize(child.id) : 0);
      }, 0);
  }

  /**
   * Drop/Delete/Cancel dialog shown when a sling (Baldric etc.) can't be worn.
   */
  async _showSlingNoRoomDialog(item, itemHandler) {
    return new Promise(resolve => {
      new Dialog({
        title: `Cannot Wear ${item.name}`,
        content: `<p>You are already wearing a <strong>${esc(item.name)}</strong>. It cannot be stored or lashed. What would you like to do?</p>`,
        buttons: {
          drop:   { label: 'Drop',   callback: async () => { await itemHandler._dropItem(item); resolve(true); } },
          delete: { label: 'Delete', callback: async () => { await item.delete(); resolve(true); } },
          cancel: { label: 'Cancel', callback: async () => { await item.delete(); resolve(false); } }
        },
        default: 'cancel'
      }).render(true);
    });
  }

  /**
   * Show a dialog asking how many items to move when dragging a stacked item to a different container.
   * Supports full-stack moves (merge if matching stack exists) and partial splits.
   */
  async _handleStackedItemDrop(item, itemData, targetContainer, currentContainerId) {
    const totalQuantity = itemData.system.quantity || 1;
    const targetName = targetContainer ? esc(targetContainer.name) : 'top level';

    return new Promise((resolve) => {
      const content = `
        <form>
          <div class="form-group">
            <label>Stack size: <strong>${totalQuantity}</strong></label>
            <label style="margin-top: 8px;">How many to move to ${targetName}?</label>
            <input type="number" name="moveQuantity" value="${totalQuantity}" min="1" max="${totalQuantity}" style="width: 100%; margin-top: 4px;" autofocus />
          </div>
        </form>
      `;

      new Dialog({
        title: `Move ${item.name}`,
        content,
        buttons: {
          move: {
            icon: '<i class="fas fa-arrows-alt"></i>',
            label: 'Move',
            callback: async (html) => {
              const moveQty = parseInt(html.find('[name="moveQuantity"]').val());
              if (!moveQty || moveQty < 1 || moveQty > totalQuantity) {
                ui.notifications.error(`Quantity must be between 1 and ${totalQuantity}.`);
                resolve(false);
                return;
              }

              const targetContainerId = targetContainer?.id ?? null;
              const matchingItem = this.actor.items.find(i =>
                i.id !== item.id &&
                i.name === itemData.name &&
                i.type === itemData.type &&
                i.system.containerId === targetContainerId &&
                i.system.storedSize === itemData.system.storedSize
              );

              if (moveQty === totalQuantity) {
                if (matchingItem) {
                  await matchingItem.update({ 'system.quantity': (matchingItem.system.quantity || 1) + totalQuantity });
                  await item.delete();
                  ui.notifications.info(`Merged ${totalQuantity}× ${itemData.name} with existing stack.`);
                } else {
                  await item.update({ 'system.containerId': itemData.system.containerId });
                }
              } else {
                if (matchingItem) {
                  await matchingItem.update({ 'system.quantity': (matchingItem.system.quantity || 1) + moveQty });
                  await item.update({ 'system.quantity': totalQuantity - moveQty });
                  ui.notifications.info(`Moved ${moveQty}× ${itemData.name} to existing stack.`);
                } else {
                  const newItemData = foundry.utils.duplicate(itemData);
                  newItemData.system.quantity = moveQty;
                  newItemData.system.containerId = targetContainerId;
                  delete newItemData._id;
                  await item.update({ 'system.quantity': totalQuantity - moveQty });
                  await this.actor.createEmbeddedDocuments('Item', [newItemData]);
                  ui.notifications.info(`Split: moved ${moveQty}× ${itemData.name}.`);
                }
              }
              resolve(true);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
            callback: () => resolve(false)
          }
        },
        default: 'move',
        render: (html) => html.find('[name="moveQuantity"]').focus().select()
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
            <label>How many coins to add to ${esc(targetContainer.name)}?</label>
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
    const totalQuantity = itemData.system.quantity || 1;
    // Limit input to stack size only when moving within the same actor;
    // compendium/sidebar drops can specify any quantity
    const maxAttr = isReordering ? `max="${totalQuantity}"` : '';

    return new Promise((resolve) => {
      const content = `
        <form>
          <div class="form-group">
            <label>${isReordering ? 'Move' : 'Add'} how many ${esc(itemData.name)} to ${esc(targetContainer.name)}?</label>
            <input type="number" name="ammoQuantity" value="${totalQuantity}" min="1" ${maxAttr} style="width: 100%; margin-top: 5px;" autofocus />
          </div>
        </form>
      `;

      new Dialog({
        title: `${isReordering ? 'Move' : 'Add'} ${itemData.name}`,
        content: content,
        buttons: {
          add: {
            icon: '<i class="fas fa-plus"></i>',
            label: isReordering ? "Move" : "Add",
            callback: async (html) => {
              const quantity = parseInt(html.find('[name="ammoQuantity"]').val());

              if (!quantity || quantity <= 0 || (isReordering && quantity > totalQuantity)) {
                ui.notifications.warn(isReordering
                  ? `Quantity must be between 1 and ${totalQuantity}`
                  : "Quantity must be greater than 0");
                resolve(false);
                return;
              }

              // Check if there's already a matching stack of this item in the target container
              const existingAmmo = this.actor.items.find(i =>
                i.type === itemData.type &&
                i.name === itemData.name &&
                i.system.containerId === targetContainer.id &&
                i.id !== item.id
              );

              // Validate space for the quantity being moved
              const storedSize = parseFloat(itemData.system.storedSize) || 0;
              const spaceNeeded = storedSize * quantity;
              const availableSpace = this._getAvailableSpace(targetContainer);

              if (spaceNeeded > availableSpace) {
                ui.notifications.error(`Not enough space in ${targetContainer.name}. Need ${spaceNeeded} slots, have ${availableSpace} available.`);
                resolve(false);
                return;
              }

              const isPartialMove = quantity < totalQuantity;
              const isSameActor = item.actor && item.actor.id === this.actor.id;
              const isOtherActor = item.actor && item.actor.id !== this.actor.id;

              if (isSameActor) {
                if (existingAmmo) {
                  // Add to existing stack in target
                  await existingAmmo.update({"system.quantity": (existingAmmo.system.quantity || 0) + quantity});
                  if (isPartialMove) {
                    await item.update({"system.quantity": totalQuantity - quantity});
                  } else {
                    await item.delete();
                  }
                  ui.notifications.info(`Merged ${quantity} ${itemData.name} with existing stack.`);
                } else if (isPartialMove) {
                  // Split: create new stack in target, reduce source
                  const newItemData = foundry.utils.duplicate(itemData);
                  delete newItemData._id;
                  newItemData.system.quantity = quantity;
                  newItemData.system.containerId = targetContainer.id;
                  await item.update({"system.quantity": totalQuantity - quantity});
                  await this.actor.createEmbeddedDocuments("Item", [newItemData]);
                  ui.notifications.info(`Moved ${quantity} ${itemData.name} to ${targetContainer.name}.`);
                } else {
                  // Move entire stack
                  await item.update({"system.containerId": targetContainer.id});
                }
              } else if (isOtherActor) {
                if (existingAmmo) {
                  await existingAmmo.update({"system.quantity": (existingAmmo.system.quantity || 0) + quantity});
                  if (isPartialMove) {
                    await item.update({"system.quantity": totalQuantity - quantity});
                  } else {
                    await item.actor.deleteEmbeddedDocuments("Item", [item.id]);
                  }
                } else {
                  const newItemData = foundry.utils.duplicate(itemData);
                  delete newItemData._id;
                  newItemData.system.quantity = quantity;
                  newItemData.system.containerId = targetContainer.id;
                  if (isPartialMove) {
                    await item.update({"system.quantity": totalQuantity - quantity});
                  } else {
                    await item.actor.deleteEmbeddedDocuments("Item", [item.id]);
                  }
                  await this.actor.createEmbeddedDocuments("Item", [newItemData]);
                }
                ui.notifications.info(`Moved ${quantity} ${itemData.name} to ${targetContainer.name}.`);
              } else {
                // New item from compendium/sidebar (no actor)
                if (existingAmmo) {
                  await existingAmmo.update({"system.quantity": (existingAmmo.system.quantity || 0) + quantity});
                  ui.notifications.info(`Added ${quantity} ${itemData.name} to existing stack.`);
                } else {
                  const newItemData = foundry.utils.duplicate(itemData);
                  delete newItemData._id;
                  newItemData.system.quantity = quantity;
                  newItemData.system.containerId = targetContainer.id;
                  await this.actor.createEmbeddedDocuments("Item", [newItemData]);
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
          html.find('input[name="ammoQuantity"]').focus().select();
        }
      }).render(true);
    });
  }
}
