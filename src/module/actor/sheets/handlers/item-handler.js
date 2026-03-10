/**
 * Handles item management operations (CRUD, equipment, etc.)
 */
import { getAttackBonus, getAbilityModifier } from "../../../../config/classes.js";
import { ItemCardDialog } from "../../../cards/item-card-dialog.js";

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
    this.html.find('.item-drop').click(this.onItemDrop.bind(this));
    this.html.find('.item-toggle').click(this.onItemToggle.bind(this));
    this.html.find('.item-lash-toggle').click(this.onItemLashToggle.bind(this));
    this.html.find('.item-show').click(this.onItemShow.bind(this));
    this.html.find('.item-rollable').click(this.onItemRoll.bind(this));
    this.html.find('.item-unarmed-roll').click(this.onUnarmedRoll.bind(this));
    this.html.find('.item-roll-icon[draggable="true"]').on('dragstart', this.onRollIconDragStart.bind(this));
    this.html.find('.quantity input').change(this.onQuantityChange.bind(this));
    
    // Add click handler for item names to show card
    this.html.find('.item-name').click(this.onItemNameClick.bind(this));
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
  async onItemDelete(event) {
    event.preventDefault();
    event.stopPropagation(); // Prevent triggering item roll
    const li = $(event.currentTarget).parents(".item-entry");
    const item = this.getItemFromEvent(event);
    if (!item) return;

    const currentQuantity = item.system.quantity || 1;

    // If quantity is 1 or item doesn't use quantity system, just delete
    if (currentQuantity <= 1) {
      item.delete();
      li.slideUp(200, () => this.actor.sheet.render(false));
      return;
    }

    // For items with quantity > 1, show dialog
    const content = `
      <form>
        <div class="form-group">
          <label>Current Quantity: <strong>${currentQuantity}</strong></label>
          <label style="margin-top: 10px;">Delete how many?</label>
          <input type="number" name="deleteQuantity" value="1" min="1" max="${currentQuantity}" style="width: 100%;" />
        </div>
      </form>
    `;

    new Dialog({
      title: `Delete ${item.name}`,
      content: content,
      buttons: {
        deleteAll: {
          icon: '<i class="fas fa-trash"></i>',
          label: "Delete All",
          callback: () => {
            item.delete();
            li.slideUp(200, () => this.actor.sheet.render(false));
          }
        },
        deleteSpecific: {
          icon: '<i class="fas fa-minus"></i>',
          label: "Delete Quantity",
          callback: (html) => {
            const deleteQty = parseInt(html.find('[name="deleteQuantity"]').val());
            if (deleteQty >= currentQuantity) {
              // Delete entire item if quantity would be 0 or less
              item.delete();
              li.slideUp(200, () => this.actor.sheet.render(false));
            } else if (deleteQty > 0) {
              // Reduce quantity
              const newQuantity = currentQuantity - deleteQty;
              item.update({ "system.quantity": newQuantity });
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "deleteSpecific"
    }).render(true);
  }

  /**
   * Handle dropping an item onto the scene
   */
  async onItemDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const item = this.getItemFromEvent(event);
    if (!item) return;

    // Check if there's an active scene
    const scene = game.scenes.active;
    if (!scene) {
      ui.notifications.error("No active scene to drop item on.");
      return;
    }

    // Check if user has a controlled token, or find their owned token
    let token = null;
    const controlledTokens = canvas.tokens.controlled;
    
    if (controlledTokens.length > 0) {
      // Use the first controlled token
      token = controlledTokens[0];
    } else {
      // No controlled tokens, find tokens owned by the user
      const ownedTokens = canvas.tokens.placeables.filter(t => 
        t.actor && t.document.isOwner && t.actor.type === "character"
      );
      
      if (ownedTokens.length === 0) {
        ui.notifications.error("No character token found on the scene.");
        return;
      } else if (ownedTokens.length === 1) {
        // Exactly one owned token, use it automatically
        token = ownedTokens[0];
      } else {
        // Multiple owned tokens, need selection
        ui.notifications.warn("You have multiple tokens on the scene. Please select the one you want to drop from.");
        return;
      }
    }

    const currentQuantity = item.system.quantity || 1;
    let dropQuantity = 1;

    // If quantity > 1, prompt for how many to drop
    if (currentQuantity > 1) {
      const content = `
        <form>
          <div class="form-group">
            <label>Current Quantity: <strong>${currentQuantity}</strong></label>
            <label style="margin-top: 10px;">Drop how many?</label>
            <input type="number" name="dropQuantity" value="1" min="1" max="${currentQuantity}" style="width: 100%;" />
          </div>
        </form>
      `;

      const dropAll = await new Promise(resolve => {
        new Dialog({
          title: `Drop ${item.name}`,
          content: content,
          buttons: {
            dropAll: {
              icon: '<i class="fas fa-box-open"></i>',
              label: "Drop All",
              callback: () => resolve(currentQuantity)
            },
            dropSpecific: {
              icon: '<i class="fas fa-hand-holding"></i>',
              label: "Drop Quantity",
              callback: (html) => {
                const qty = parseInt(html.find('[name="dropQuantity"]').val());
                resolve(Math.min(Math.max(qty, 1), currentQuantity));
              }
            },
            cancel: {
              icon: '<i class="fas fa-times"></i>',
              label: "Cancel",
              callback: () => resolve(null)
            }
          },
          default: "dropSpecific"
        }).render(true);
      });

      if (dropAll === null) return; // User cancelled
      dropQuantity = dropAll;
    }

    // Calculate drop position (1 grid square in front of token based on facing)
    const gridSize = scene.grid.size;
    const tokenRotation = token.document.rotation || 0;
    
    // Convert rotation to radians and calculate offset
    const radians = (tokenRotation * Math.PI) / 180;
    const offsetX = Math.cos(radians) * gridSize;
    const offsetY = Math.sin(radians) * gridSize;
    
    const dropX = token.x + offsetX;
    const dropY = token.y + offsetY;

    // Unequip if equipped
    const wasEquipped = item.system.equipped;
    if (wasEquipped) {
      await item.update({ "system.equipped": false });
    }

    // Create item data to store in token
    const itemData = item.toObject();
    itemData.system.quantity = dropQuantity;

    try {
      // Create an unlinked token (no actor) to represent the dropped item
      const tokenData = {
        name: `${item.name} (${dropQuantity})`,
        x: dropX,
        y: dropY,
        texture: {
          src: item.img
        },
        width: 1,
        height: 1,
        lockRotation: true,
        actorLink: false,
        displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
        displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
        flags: {
          'osp-houserules': {
            droppedItem: true,
            itemData: itemData,
            originalActorId: this.actor.id
          }
        }
      };

      // Create the token WITHOUT an actor (unlinked)
      await scene.createEmbeddedDocuments("Token", [tokenData]);

      // Update or delete the item from actor's inventory
      if (dropQuantity >= currentQuantity) {
        // Dropped all, delete the item
        await item.delete();
        ui.notifications.info(`Dropped all ${item.name}.`);
      } else {
        // Reduce quantity
        const newQuantity = currentQuantity - dropQuantity;
        await item.update({ "system.quantity": newQuantity });
        ui.notifications.info(`Dropped ${dropQuantity} ${item.name}. ${newQuantity} remaining.`);
      }

      // Re-render the sheet
      this.actor.sheet.render(false);

    } catch (error) {
      console.error("Error dropping item:", error);
      ui.notifications.error(`Failed to drop item: ${error.message}`);
      
      // Re-equip if it was equipped before
      if (wasEquipped) {
        await item.update({ "system.equipped": true });
      }
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
    
    // Special handling for containers and clothing: equipped = top-level, unequipped = nested
    if (item.type === "container" || item.type === "clothing") {
      if (newEquippedState) {
        // Equipping = moving to top-level
        
        // For clothing: Only one set of "Clothes" can be equipped at a time
        if (item.type === "clothing" && item.name.startsWith("Clothes,")) {
          const equippedClothes = this.actor.items.filter(i => 
            i.type === "clothing" &&
            i.name.startsWith("Clothes,") &&
            i.system.equipped &&
            i.id !== item.id
          );
          
          if (equippedClothes.length > 0) {
            const currentClothes = equippedClothes[0];
            
            // Check if current clothes has items stored in it
            if (currentClothes.system.capacity) {
              const storedItems = this.actor.items.filter(i => i.system.containerId === currentClothes.id);
              if (storedItems.length > 0) {
                ui.notifications.error(`Cannot equip ${item.name} - remove items from ${currentClothes.name} pockets first.`);
                return;
              }
            }
            
            // Current clothes is empty (or has no capacity), safe to unequip
            await currentClothes.update({"system.equipped": false});
            ui.notifications.info(`Unequipped ${currentClothes.name} to equip ${item.name}.`);
          }
        }
        
        // If it's a Large Sack, validate hand requirements
        if (item.type === "container" && item.name.toLowerCase().includes('sack') && item.name.toLowerCase().includes('large')) {
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
        
        // Check container count limits (only for containers, not clothing)
        if (item.type === "container") {
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
        } // End of container-specific checks
        
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
    // storedSize is per-unit; multiply by quantity for all item types
    return this.actor.items
      .filter(i => i.system.containerId === container.id && !i.system.lashed)
      .reduce((total, item) => {
        const storedSize = parseFloat(item.system.storedSize) || 0;
        const currentQuantity = item.system.quantity || 1;
        return total + storedSize * currentQuantity;
      }, 0);
  }

  /**
   * Get item size in slots
   */
  _getItemSlotSize(item) {
    const storedSize = parseFloat(item.system.storedSize) || 0;
    const currentQuantity = item.system.quantity || 1;
    return storedSize * currentQuantity;
  }

  /**
   * Handle showing item card (eyeball icon)
   */
  onItemShow(event) {
    event.preventDefault();
    event.stopPropagation(); // Prevent triggering item roll
    const item = this.getItemFromEvent(event);
    if (!item) return;
    
    // Open item card dialog
    const dialog = new ItemCardDialog(item);
    dialog.render(true);
  }

  /**
   * Handle clicking item name to show card
   */
  onItemNameClick(event) {
    // Don't trigger if clicking edit/delete/etc buttons
    if ($(event.target).closest('.item-controls').length > 0) {
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    const item = this.getItemFromEvent(event);
    if (!item) return;
    
    // Open item card dialog
    const dialog = new ItemCardDialog(item);
    dialog.render(true);
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
   * Handle rolling an unarmed attack (Punch/Kick)
   */
  onUnarmedRoll(event) {
    event.preventDefault();
    
    // Get character stats
    const characterClass = this.actor.system.class || 'fighter';
    const level = parseInt(this.actor.system.level) || 1;
    const strScore = parseInt(this.actor.system.attributes?.str?.value) || 10;
    
    // Calculate attack bonus from class/level
    const classAttackBonus = getAttackBonus(characterClass, level);
    
    // Unarmed attacks use STR
    const abilityModifier = getAbilityModifier(strScore);
    
    // Calculate total bonus (no weapon bonus for unarmed)
    const totalBonus = classAttackBonus + abilityModifier;
    
    // Build formula and flavor text
    const formula = totalBonus >= 0 ? `1d20 + ${totalBonus}` : `1d20 - ${Math.abs(totalBonus)}`;
    const bonusBreakdown = [
      `Class: +${classAttackBonus}`,
      `STR: ${abilityModifier >= 0 ? '+' : ''}${abilityModifier}`
    ].join(', ');
    
    const flavor = `Unarmed Attack (Punch/Kick)<br><small>${bonusBreakdown}</small><br><small>Damage: 1d2</small>`;
    
    // Roll the attack
    const roll = new Roll(formula);
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: flavor
    });
  }

  /**
   * Handle dragging the roll icon to create a macro
   */
  onRollIconDragStart(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    
    if (!item || item.type !== "weapon") return;
    
    const dragData = {
      type: "WeaponAttackMacro",
      actorId: this.actor.id,
      itemId: item.id,
      itemName: item.name,
      macroType: "weaponAttack"
    };
    
    // Prevent default drag behavior and stop propagation
    event.stopPropagation();
    event.originalEvent.dataTransfer.effectAllowed = "copy";
    event.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
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
