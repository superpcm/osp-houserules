/**
 * Handles item management operations (CRUD, equipment, etc.)
 */
import { getAttackBonus, getAbilityModifier } from "../../../../config/classes.js";

export class ItemHandler {
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
    this.html.find('.item-lash-toggle').click(this.onItemLashToggle.bind(this));
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
    event.stopPropagation(); // Prevent triggering item roll
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
    event.stopPropagation(); // Prevent triggering item roll
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
  async onItemToggle(event) {
    event.preventDefault();
    event.stopPropagation(); // Prevent triggering item roll
    const item = this.getItemFromEvent(event);
    if (!item) return;
    
    const newEquippedState = !item.system.equipped;
    
    // Special handling for containers: equipped = top-level, unequipped = nested
    if (item.type === "container") {
      if (newEquippedState) {
        // Equipping = moving to top-level
        // If it's a Large Sack, validate hand requirements
        if (item.name.toLowerCase().includes('sack') && item.name.toLowerCase().includes('large')) {
          // Count currently equipped large sacks (excluding this one)
          const equippedLargeSacks = this.actor.items.filter(i => 
            i.type === "container" &&
            i.name.toLowerCase().includes('sack') &&
            i.name.toLowerCase().includes('large') &&
            !i.system.containerId &&
            i.id !== item.id
          );
          
          // Count equipped hand-held items (weapons and shields)
          const equippedHandItems = this.actor.items.filter(i => 
            i.system.equipped &&
            (i.type === "weapon" || 
             (i.type === "armor" && i.name.toLowerCase().includes('shield')))
          );
          
          if (equippedLargeSacks.length === 0) {
            // Equipping first large sack - requires 1 hand, so max 1 hand-held item
            if (equippedHandItems.length > 1) {
              ui.notifications.error("Large Sack requires one hand. You can only have one hand-held item equipped (unequip weapons/shields first).");
              return;
            }
          } else if (equippedLargeSacks.length === 1) {
            // Equipping second large sack - requires both hands, so no hand-held items
            if (equippedHandItems.length > 0) {
              ui.notifications.error("Two Large Sacks require both hands. Unequip all weapons and shields first.");
              return;
            }
          } else {
            // Already have 2 large sacks equipped
            ui.notifications.error("You can only equip two Large Sacks at a time.");
            return;
          }
        }
        
        // Check container count limits
        if (item.name.toLowerCase().includes('backpack')) {
          const existingBackpacks = this.actor.items.filter(i => 
            i.type === "container" && 
            i.name.toLowerCase().includes('backpack') &&
            !i.system.containerId &&
            i.id !== item.id
          );
          
          if (existingBackpacks.length > 0) {
            ui.notifications.error("You can only carry one Backpack at a time. Store additional backpacks inside containers.");
            return;
          }
        }
        
        if (item.name.toLowerCase().includes('pouch')) {
          const existingPouches = this.actor.items.filter(i => 
            i.type === "container" && 
            i.name.toLowerCase().includes('pouch') &&
            !i.system.containerId &&
            i.id !== item.id
          );
          
          if (existingPouches.length >= 2) {
            ui.notifications.error("You can only carry two Belt Pouches at a time. Store additional pouches inside containers.");
            return;
          }
        }
        
        // Move to top-level by clearing containerId and setting equipped
        await item.update({
          "system.containerId": null,
          "system.equipped": true
        });
      } else {
        // Unequipping = moving to a container
        // Find container with most available capacity
        const availableContainers = this.actor.items.filter(i => 
          i.type === "container" &&
          !i.system.containerId && // Top-level only
          i.id !== item.id // Not itself
        );
        
        if (availableContainers.length === 0) {
          ui.notifications.error(`Cannot unequip ${item.name} - no containers available to store it in.`);
          return;
        }
        
        // Calculate available space for each container
        const containerSpaces = availableContainers.map(container => {
          const capacity = this._parseCapacity(container.system.capacity);
          const used = this._getUsedCapacity(container);
          return {
            container: container,
            available: capacity - used
          };
        }).filter(c => c.available > 0);
        
        if (containerSpaces.length === 0) {
          ui.notifications.error(`Cannot unequip ${item.name} - no containers have enough space.`);
          return;
        }
        
        // Sort by most available space
        containerSpaces.sort((a, b) => b.available - a.available);
        const bestContainer = containerSpaces[0].container;
        
        // Check if item fits
        const itemSize = this._getItemSlotSize(item);
        if (itemSize > containerSpaces[0].available) {
          ui.notifications.error(`Cannot unequip ${item.name} - requires ${itemSize} slots but largest container only has ${containerSpaces[0].available} available.`);
          return;
        }
        
        // Move into best container by setting containerId and unequipped
        await item.update({
          "system.containerId": bestContainer.id,
          "system.equipped": false
        });
        
        ui.notifications.info(`${item.name} stored in ${bestContainer.name}.`);
      }
    } else {
      // Non-container items: check hand requirements before equipping
      if (newEquippedState) {
        // Check if this is a hand-held item (weapon or shield)
        const isHandHeld = item.type === "weapon" || 
                          (item.type === "armor" && item.name.toLowerCase().includes('shield'));
        
        if (isHandHeld) {
          // Count equipped large sacks
          const equippedLargeSacks = this.actor.items.filter(i => 
            i.type === "container" &&
            i.name.toLowerCase().includes('sack') &&
            i.name.toLowerCase().includes('large') &&
            !i.system.containerId // Top-level only
          );
          
          if (equippedLargeSacks.length >= 2) {
            ui.notifications.error("Cannot equip - both hands are occupied by two Large Sacks.");
            return;
          }
          
          if (equippedLargeSacks.length === 1) {
            // One large sack equipped - can only have 1 hand-held item total
            const otherEquippedHandItems = this.actor.items.filter(i => 
              i.system.equipped &&
              i.id !== item.id &&
              (i.type === "weapon" || 
               (i.type === "armor" && i.name.toLowerCase().includes('shield')))
            );
            
            if (otherEquippedHandItems.length >= 1) {
              ui.notifications.error("Cannot equip - one hand is occupied by a Large Sack and the other by " + otherEquippedHandItems[0].name + ".");
              return;
            }
          }
        }
      }
      
      // Proceed with toggle
      await item.update({"system.equipped": newEquippedState});
    }
  }

  /**
   * Handle toggling item lashed status
   */
  async onItemLashToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    const item = this.getItemFromEvent(event);
    if (!item) return;
    
    // Check if item is lashable
    if (!item.system.lashable) {
      ui.notifications.warn(`${item.name} cannot be lashed to a backpack.`);
      return;
    }
    
    // Get the container this item is in
    const containerId = item.system.containerId;
    if (!containerId) {
      ui.notifications.warn(`${item.name} must be in a container to be lashed.`);
      return;
    }
    
    const container = this.actor.items.get(containerId);
    if (!container || container.type !== "container") {
      ui.notifications.error("Container not found.");
      return;
    }
    
    // Check if container has lash slots
    const lashSlots = container.system.lashSlots || 0;
    if (lashSlots === 0) {
      ui.notifications.warn(`${container.name} does not support lashing items.`);
      return;
    }
    
    const newLashedState = !item.system.lashed;
    
    if (newLashedState) {
      // Lashing the item - check if lash slots available
      const lashedItems = this.actor.items.filter(i => 
        i.system.containerId === containerId && 
        i.system.lashed &&
        i.id !== item.id
      );
      
      if (lashedItems.length >= lashSlots) {
        ui.notifications.error(`${container.name} has no available lash slots (${lashedItems.length}/${lashSlots} used).`);
        return;
      }
      
      ui.notifications.info(`${item.name} lashed to ${container.name}.`);
    } else {
      ui.notifications.info(`${item.name} unlashed from ${container.name}.`);
    }
    
    // Toggle lashed status
    await item.update({"system.lashed": newLashedState});
  }
  
  /**
   * Parse capacity string (e.g., "6M" = 24 slots)
   */
  _parseCapacity(capacity) {
    // Capacity is now a direct numeric value
    const parsed = parseFloat(capacity);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  /**
   * Get used capacity in a container
   */
  _getUsedCapacity(container) {
    let total = 0;
    
    // Find all items in this container (ONLY stored items, not lashed items)
    const itemsInContainer = this.actor.items.filter(i => 
      i.system.containerId === container.id && !i.system.lashed
    );
    
    itemsInContainer.forEach(item => {
      const storedSize = parseFloat(item.system.storedSize) || 0;
      const currentQuantity = item.system.quantity?.value || 1;
      const maxQuantity = item.system.quantity?.max || 0;
      
      let itemCapacity;
      if (maxQuantity > 0) {
        // Stackable item: calculate proportionally
        itemCapacity = (storedSize / maxQuantity) * currentQuantity;
      } else {
        // Non-stackable item: use storedSize as-is
        itemCapacity = storedSize;
      }
      
      total += itemCapacity;
    });
    
    return total;
  }
  
  /**
   * Get item size in slots
   */
  _getItemSlotSize(item) {
    const storedSize = parseFloat(item.system.storedSize) || 0;
    const currentQuantity = item.system.quantity?.value || 1;
    const maxQuantity = item.system.quantity?.max || 0;
    
    if (maxQuantity > 0) {
      // Stackable item: calculate proportionally
      return (storedSize / maxQuantity) * currentQuantity;
    } else {
      // Non-stackable item: use storedSize as-is
      return storedSize;
    }
  }

  /**
   * Handle showing item details in chat
   */
  onItemShow(event) {
    event.preventDefault();
    event.stopPropagation(); // Prevent triggering item roll
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
      // Get character stats
      const characterClass = this.actor.system.class || 'fighter';
      const level = parseInt(this.actor.system.level) || 1;
      const strScore = parseInt(this.actor.system.attributes?.str?.value) || 10;
      const dexScore = parseInt(this.actor.system.attributes?.dex?.value) || 10;
      
      // Calculate attack bonus from class/level
      const classAttackBonus = getAttackBonus(characterClass, level);
      
      // Get weapon's inherent bonus
      const weaponBonus = parseInt(item.system.bonus) || 0;
      
      // Determine ability modifier based on weapon type
      let abilityModifier = 0;
      let abilityName = '';
      
      if (item.system.melee) {
        // Melee weapons use STR
        abilityModifier = getAbilityModifier(strScore);
        abilityName = 'STR';
      } else if (item.system.missile) {
        // Missile weapons use DEX
        abilityModifier = getAbilityModifier(dexScore);
        abilityName = 'DEX';
      } else {
        // Default to STR for unspecified weapons
        abilityModifier = getAbilityModifier(strScore);
        abilityName = 'STR';
      }
      
      // Calculate total bonus
      const totalBonus = classAttackBonus + weaponBonus + abilityModifier;
      
      // Build formula and flavor text
      const formula = totalBonus >= 0 ? `1d20 + ${totalBonus}` : `1d20 - ${Math.abs(totalBonus)}`;
      const bonusBreakdown = [
        `Class: +${classAttackBonus}`,
        weaponBonus !== 0 ? `Weapon: ${weaponBonus >= 0 ? '+' : ''}${weaponBonus}` : null,
        `${abilityName}: ${abilityModifier >= 0 ? '+' : ''}${abilityModifier}`
      ].filter(b => b !== null).join(', ');
      
      const flavor = `${item.name} Attack Roll<br><small>${bonusBreakdown}</small>`;
      
      // Roll the attack
      const roll = new Roll(formula);
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: flavor
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
    
    if (item.system.unitWeight) {
      content += `<p><strong>Weight:</strong> ${item.system.unitWeight} lbs</p>`;
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
