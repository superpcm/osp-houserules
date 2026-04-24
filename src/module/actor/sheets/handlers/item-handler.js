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
    this.html.find('.item-edit').off('click').click(this.onItemEdit.bind(this));
    this.html.find('.item-delete').off('click').click(this.onItemDelete.bind(this));
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

    // Double-click item image to open item sheet
    this.html.find('.item-image').dblclick(this.onItemEdit.bind(this));
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
    // The actual DOM row for this item — a nested stored-item row (div) or a top-level item-entry (li)
    const nestedRow = $(event.currentTarget).closest(".lashed-stored-item, .contained-item");
    const row = nestedRow.length ? nestedRow : li;

    // If quantity is 1 or item doesn't use quantity system, just delete
    if (currentQuantity <= 1) {
      if (nestedRow.length) {
        nestedRow.remove();
        await item.delete();
        this.actor.sheet.render(false);
        return;
      }
      // If deleting a container, clear containerId on all items inside it first
      if (item.type === 'container') {
        const orphans = this.actor.items.filter(i => i.system.containerId === item.id);
        if (orphans.length) {
          await Promise.all(orphans.map(i => i.update({ 'system.containerId': null, 'system.lashed': false })));
        }
      }
      await item.delete();
      row.slideUp(200, () => this.actor.sheet.render(false));
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
          callback: async () => {
            if (nestedRow.length) {
              nestedRow.remove();
              await item.delete();
              this.actor.sheet.render(false);
              return;
            }
            if (item.type === 'container') {
              const orphans = this.actor.items.filter(i => i.system.containerId === item.id);
              if (orphans.length) {
                await Promise.all(orphans.map(i => i.update({ 'system.containerId': null, 'system.lashed': false })));
              }
            }
            await item.delete();
            row.slideUp(200, () => this.actor.sheet.render(false));
          }
        },
        deleteSpecific: {
          icon: '<i class="fas fa-minus"></i>',
          label: "Delete Quantity",
          callback: async (html) => {
            const deleteQty = parseInt(html.find('[name="deleteQuantity"]').val());
            if (deleteQty >= currentQuantity) {
              if (nestedRow.length) {
                nestedRow.remove();
                await item.delete();
                this.actor.sheet.render(false);
                return;
              }
              await item.delete();
              row.slideUp(200, () => this.actor.sheet.render(false));
            } else if (deleteQty > 0) {
              item.update({ "system.quantity": currentQuantity - deleteQty });
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
    let token = canvas.tokens.controlled[0] ?? null;
    if (!token) {
      const ownedTokens = canvas.tokens.placeables.filter(t =>
        t.actor && t.document.isOwner && t.actor.type === "character"
      );
      if (ownedTokens.length === 1) token = ownedTokens[0];
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

    // Calculate drop position
    const gridSize = scene.grid.size;
    let dropX, dropY;
    if (token) {
      const radians = ((token.document.rotation || 0) * Math.PI) / 180;
      dropX = token.x + Math.cos(radians) * gridSize;
      dropY = token.y + Math.sin(radians) * gridSize;
    } else {
      const dims = scene.dimensions;
      dropX = Math.floor(dims.width / 2 / gridSize) * gridSize;
      dropY = Math.floor(dims.height / 2 / gridSize) * gridSize;
    }

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
        
        // Only one Belt can be equipped at a time
        if (item.type === "clothing" && item.name === "Belt") {
          const equippedBelt = this.actor.items.find(i =>
            i.type === "clothing" &&
            i.name === "Belt" &&
            i.system.equipped &&
            i.id !== item.id
          );
          if (equippedBelt) {
            const attachedCount = this.actor.items.filter(i => i.system.containerId === equippedBelt.id && i.system.lashed).length;
            if (attachedCount > 0) {
              ui.notifications.error(`Cannot equip a second Belt — the equipped belt has ${attachedCount} item(s) attached. Remove them first.`);
            } else {
              ui.notifications.error(`Cannot equip a second Belt — unequip the current Belt first.`);
            }
            return;
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

          // Sling items (baldric, axe sling, waterskin sling): max 1 equipped at a time
          if ((item.system.tags || []).includes('sling')) {
            const equippedSling = this.actor.items.find(i =>
              i.type === 'container' &&
              (i.system.tags || []).includes('sling') &&
              i.system.equipped &&
              i.id !== item.id
            );
            if (equippedSling) {
              ui.notifications.error(`Cannot equip ${item.name} — ${equippedSling.name} is already worn. Remove it first.`);
              return;
            }
          }

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
        // Slings (Baldric etc.) cannot be stored — show Drop/Delete/Cancel
        if ((item.system?.tags || []).includes('sling')) {
          await this._showArmorNoStorageDialog(item);
          return;
        }

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
    } else if (item.type === "weapon") {
      // ── WEAPON EQUIP TOGGLE ───────────────────────────────────────────────
      if (newEquippedState) {
        // Equipping (draw): check hand slots
        const { canEquip, reason } = this._canEquipWeapon(item);
        if (canEquip) {
          // Keep containerId when drawing from a scabbard so the scabbard still shows the
          // weapon greyed-out (drawn). Only clear containerId when unlashing from a belt.
          const drawUpdates = { 'system.equipped': true, 'system.lashed': false };
          if (item.system.lashed) drawUpdates['system.containerId'] = null;
          await item.update(drawUpdates);
          ui.notifications.info(`${item.name} taken in hand.`);
        } else if (reason === 'size_mismatch') {
          ui.notifications.error(`Cannot equip ${item.name} — no free hand that fits a ${item.system.size}-sized weapon.`);
        } else {
          await this._showEquipWeaponDialog(item);
        }
      } else {
        // Unequipping: swords (non-dagger) → scabbard only; daggers → scabbard → belt → lash
        const tags = item.system?.tags || [];
        const isSword = tags.includes('sword');
        const isDagger = tags.includes('dagger');
        if (isSword && !isDagger) {
          // If the sword still references its scabbard (was drawn from it), sheathe in place
          const currentScabbard = item.system.containerId ? this.actor.items.get(item.system.containerId) : null;
          if (currentScabbard) {
            await item.update({ 'system.equipped': false });
            ui.notifications.info(`${item.name} sheathed in ${currentScabbard.name}.`);
          } else {
            const scabbard = this._findEmptyScabbardForWeapon(item);
            if (scabbard) {
              await item.update({ 'system.equipped': false, 'system.containerId': scabbard.id, 'system.lashed': false });
              ui.notifications.info(`${item.name} sheathed in ${scabbard.name}.`);
            } else {
              await this._showSwordNoScabbardDialog(item);
            }
          }
        } else if (isDagger) {
          const currentScabbard = item.system.containerId ? this.actor.items.get(item.system.containerId) : null;
          if (currentScabbard) {
            await item.update({ 'system.equipped': false });
            ui.notifications.info(`${item.name} sheathed in ${currentScabbard.name}.`);
          } else {
            const scabbard = this._findEmptyScabbardForWeapon(item);
            if (scabbard) {
              await item.update({ 'system.equipped': false, 'system.containerId': scabbard.id, 'system.lashed': false });
              ui.notifications.info(`${item.name} sheathed in ${scabbard.name}.`);
            } else {
              const storage = this._findStorageForWeapon(item);
              if (storage) {
                await item.update({ 'system.equipped': false, 'system.lashed': storage.lashed, 'system.containerId': storage.container.id });
                ui.notifications.info(`${item.name} stowed in ${storage.container.name}.`);
              } else {
                await this._showNoStorageDialog(item);
              }
            }
          }
        } else {
          const currentContainer = item.system.containerId ? this.actor.items.get(item.system.containerId) : null;
          if (currentContainer) {
            await item.update({ 'system.equipped': false });
            ui.notifications.info(`${item.name} stowed.`);
          } else {
            const storage = this._findStorageForWeapon(item);
            if (storage) {
              await item.update({ 'system.equipped': false, 'system.lashed': storage.lashed, 'system.containerId': storage.container.id });
              ui.notifications.info(`${item.name} stowed in ${storage.container.name}.`);
            } else {
              await this._showNoStorageDialog(item);
            }
          }
        }
      }
    } else {
      // ── NON-WEAPON, NON-CONTAINER ITEMS (armor, shields, etc.) ───────────
      if (newEquippedState) {
        // Only one piece of body armor at a time
        const armorBodyTypes = ["light", "medium", "heavy"];
        if (item.type === "armor" && armorBodyTypes.includes(item.system.type)) {
          const wornBodyArmor = this.actor.items.filter(i =>
            i.type === "armor" && armorBodyTypes.includes(i.system.type) &&
            i.system.equipped && i.id !== item.id
          );
          if (wornBodyArmor.length > 0) {
            const current = wornBodyArmor[0];
            await current.update({"system.equipped": false});
            ui.notifications.info(`Removed ${current.name} to equip ${item.name}.`);
          }
        }
        await item.update({ "system.equipped": true, "system.containerId": null, "system.lashed": false });
      } else {
        // Unequipping armor — smart storage
        if (item.type === "armor" && (item.system.type === "helmet" || item.system.type === "shield")) {
          await this._unequipToBackpack(item);
        } else if (item.type === "armor" && ["light", "medium", "heavy"].includes(item.system.type)) {
          await this._unequipBodyArmor(item);
        } else {
          await item.update({"system.equipped": false});
        }
      }
    }
  }

  /**
   * Handle toggling item lashed status.
   *
   * Belt attachments (containers with lashable: true) auto-find the equipped belt.
   * Unlashing a weapon tries to equip it; if hands are full shows Swap/Drop/Delete/Cancel.
   * Unlashing a belt attachment simply removes it from the belt.
   */
  async onItemLashToggle(event) {
    event.preventDefault();
    event.stopPropagation();
    const item = this.getItemFromEvent(event);
    if (!item) return;

    const isCurrentlyLashed = item.system.lashed;

    // ── UNLASH PATH ──────────────────────────────────────────────────────────
    if (isCurrentlyLashed) {
      if (item.type === 'container') {
        // Belt attachment being removed — show drop/delete/cancel dialog
        await this._showUnlashContainerDialog(item);
      } else if (item.type === 'weapon') {
        const { canEquip, reason } = this._canEquipWeapon(item);
        if (canEquip) {
          await item.update({ 'system.lashed': false, 'system.containerId': null, 'system.equipped': true });
          ui.notifications.info(`${item.name} taken in hand.`);
        } else if (reason === 'size_mismatch') {
          ui.notifications.error(`Cannot take ${item.name} — no free hand that fits a ${item.system.size}-sized weapon.`);
        } else {
          await this._showEquipWeaponDialog(item);
        }
      } else if (this._isShield(item)) {
        const { canEquip, reason } = this._canEquipShield();
        if (canEquip) {
          await item.update({ 'system.lashed': false, 'system.containerId': null, 'system.equipped': true });
          ui.notifications.info(`${item.name} raised.`);
        } else if (reason === 'has_shield') {
          ui.notifications.error(`Cannot equip ${item.name} — a shield is already equipped.`);
        } else {
          await this._showEquipShieldDialog(item);
        }
      } else if (item.type === 'armor' && item.system.type === 'helmet') {
        // Unlashing a helmet — move to a container or show dialog
        const container = this._findContainerWithSpace(item);
        if (container) {
          await item.update({ 'system.lashed': false, 'system.containerId': container.id });
          ui.notifications.info(`${item.name} stored in ${container.name}.`);
        } else {
          await this._showArmorNoStorageDialog(item);
        }
      } else {
        await item.update({ 'system.lashed': false, 'system.containerId': null });
        ui.notifications.info(`${item.name} unlashed.`);
      }
      return;
    }

    // ── LASH PATH ────────────────────────────────────────────────────────────

    // Sling containers (Baldric etc.) cannot be lashed to anything
    if (item.type === 'container' && (item.system?.tags || []).includes('sling')) {
      ui.notifications.warn(`${item.name} cannot be lashed. It must be worn or dropped.`);
      return;
    }

    // Armor (helmet or shield) → lash to backpack only
    if (item.type === 'armor') {
      const backpack = this._findBackpackWithLashSlot(item);
      if (!backpack) {
        ui.notifications.warn(`No backpack with available lash slots found. Equip a backpack first.`);
        return;
      }
      await item.update({ 'system.lashed': true, 'system.containerId': backpack.id, 'system.equipped': false });
      ui.notifications.info(`${item.name} lashed to ${backpack.name}.`);
      return;
    }

    // Belt attachment path: lashable containers (or containers with slotCost > 0) auto-find the equipped belt
    if (item.type === 'container' && (item.system.lashable || (item.system.slotCost || 0) > 0)) {
      const belt = this.actor.items.find(i =>
        i.type === 'clothing' && (i.system.lashSlots || 0) > 0 && i.system.equipped
      );
      if (!belt) {
        ui.notifications.warn(`No equipped belt found. Equip a belt first.`);
        return;
      }

      const lashedAttachments = this.actor.items.filter(i =>
        i.type === 'container' && i.system.containerId === belt.id && i.system.lashed && i.id !== item.id
      );

      // Slot cost check
      const usedSlots = lashedAttachments.reduce((sum, i) => sum + (i.system.slotCost || 1), 0);
      const itemSlotCost = item.system.slotCost || 1;
      if (usedSlots + itemSlotCost > (belt.system.lashSlots || 0)) {
        ui.notifications.error(
          `${belt.name} has no room for ${item.name} (${usedSlots}/${belt.system.lashSlots} slots used, need ${itemSlotCost}).`
        );
        return;
      }

      // Constraint rules
      const constraint = this._checkBeltConstraints(item, lashedAttachments);
      if (!constraint.ok) {
        ui.notifications.error(constraint.reason);
        return;
      }

      await item.update({ 'system.lashed': true, 'system.containerId': belt.id });
      ui.notifications.info(`${item.name} attached to ${belt.name}.`);
      return;
    }

    // Legacy path: non-container items lashing to a backpack/container
    const containerId = item.system.containerId;
    if (!containerId) {
      ui.notifications.warn(`${item.name} must be in a container to be lashed.`);
      return;
    }

    const container = this.actor.items.get(containerId);
    if (!container || container.type !== 'container') {
      ui.notifications.error("Container not found.");
      return;
    }

    if (!item.system.lashable) {
      ui.notifications.warn(`${item.name} cannot be lashed.`);
      return;
    }

    const lashSlots = container.system.lashSlots || 0;
    if (lashSlots === 0) {
      ui.notifications.warn(`${container.name} does not support lashing items.`);
      return;
    }

    const lashedItems = this.actor.items.filter(i =>
      i.system.containerId === containerId && i.system.lashed && i.id !== item.id
    );
    const usedSlots = lashedItems.reduce((sum, i) => sum + (i.system.slotCost || 1), 0);
    const itemSlotCost = item.system.slotCost || 1;
    if (usedSlots + itemSlotCost > lashSlots) {
      ui.notifications.error(`${container.name} has no available lash slots (${usedSlots}/${lashSlots} used).`);
      return;
    }

    await item.update({ "system.lashed": true });
    ui.notifications.info(`${item.name} lashed to ${container.name}.`);
  }

  /**
   * Validates belt attachment constraint rules beyond slot counting.
   * @param {Item} item  The item being attached
   * @param {Item[]} lashedAttachments  Existing lashed attachments (excluding item)
   * @returns {{ ok: boolean, reason?: string }}
   */
  _checkBeltConstraints(item, lashedAttachments) {
    const SCABBARD_NAMES = new Set(['Scabbard, Small', 'Sword Frog']);
    const BULKY_NAMES    = new Set(['Sword Frog']);

    const isScabbard = SCABBARD_NAMES.has(item.name);
    const isBulky    = BULKY_NAMES.has(item.name);

    const existingScabbards = lashedAttachments.filter(i => SCABBARD_NAMES.has(i.name));
    const existingBulky     = lashedAttachments.filter(i => BULKY_NAMES.has(i.name));

    // Max 2 scabbards total
    if (isScabbard && existingScabbards.length >= 2) {
      return { ok: false, reason: 'A belt can hold at most 2 scabbards.' };
    }

    // Max 2 bulky items
    if (isBulky && existingBulky.length >= 2) {
      return { ok: false, reason: 'A belt can hold at most 2 bulky items.' };
    }

    // Max 1 belt loop
    if (item.name === 'Belt Loop' && lashedAttachments.some(i => i.name === 'Belt Loop')) {
      return { ok: false, reason: 'A belt can hold at most 1 belt loop.' };
    }

    // Max 2 flask/potion holders
    const flaskCount = lashedAttachments.filter(i => i.name === 'Flask/Potion Holder').length;
    if (item.name === 'Flask/Potion Holder' && flaskCount >= 2) {
      return { ok: false, reason: 'A belt can hold at most 2 flask/potion holders.' };
    }

    return { ok: true };
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
    return this.actor.items
      .filter(i => i.system.containerId === container.id && !i.system.lashed)
      .reduce((total, item) => total + this._getEffectiveStoredSize(item), 0);
  }

  _getEffectiveStoredSize(item) {
    const own = (parseFloat(item.system.storedSize) || 0) * (item.system.quantity || 1);
    if (!item.system.capacity) return own;
    const nested = this.actor.items.filter(i => i.system.containerId === item.id && !i.system.lashed);
    return own + nested.reduce((sum, i) => sum + this._getEffectiveStoredSize(i), 0);
  }

  _getItemSlotSize(item) {
    return this._getEffectiveStoredSize(item);
  }

  /** Returns true if a shield is currently equipped, optionally excluding one item by id. */
  _isShield(item) {
    return item.type === 'armor' && item.name.toLowerCase().includes('shield');
  }

  _isShieldEquipped(excludeId = null) {
    return this.actor.items.some(i =>
      i.type === 'armor' && i.system.equipped &&
      i.name.toLowerCase().includes('shield') && i.id !== excludeId
    );
  }

  /** Returns all currently equipped weapons, optionally excluding one by id. */
  _getEquippedWeapons(excludeId = null) {
    return this.actor.items.filter(i =>
      i.type === 'weapon' && i.system.equipped && i.id !== excludeId
    );
  }

  /** Returns all currently equipped hand items (weapons + shields), optionally excluding one by id. */
  _getEquippedHandItems(excludeId = null) {
    return this.actor.items.filter(i =>
      i.system.equipped && i.id !== excludeId &&
      (i.type === 'weapon' || (i.type === 'armor' && i.name.toLowerCase().includes('shield')))
    );
  }

  /**
   * Checks whether a weapon can be equipped given current hand configuration.
   * Hand rules:
   *   - Two-handed weapon needs both hands free and no shield.
   *   - Shield occupies one hand → max 1 weapon (non-two-handed).
   *   - No shield → max 2 weapons: valid combos are S+S, M+S, L+S (non-two-handed).
   * @param {Item} weapon
   * @param {string|null} excludeId - Treat this equipped weapon as already removed.
   * @returns {{ canEquip: boolean, reason: 'hands_full'|'size_mismatch'|null }}
   */
  _canEquipWeapon(weapon, excludeId = null) {
    const tags = weapon.system?.tags || [];
    const size = weapon.system?.size;
    const isTwoHanded = tags.includes('two-handed');
    const hasShield = this._isShieldEquipped(excludeId);
    const equipped = this._getEquippedWeapons(excludeId);

    // Cannot add anything if a two-handed weapon is already equipped
    if (equipped.some(w => (w.system?.tags || []).includes('two-handed'))) {
      return { canEquip: false, reason: 'hands_full' };
    }

    if (isTwoHanded) {
      if (equipped.length > 0 || hasShield) return { canEquip: false, reason: 'hands_full' };
      return { canEquip: true, reason: null };
    }

    const maxWeapons = hasShield ? 1 : 2;
    if (equipped.length >= maxWeapons) return { canEquip: false, reason: 'hands_full' };

    // At most one non-S weapon can be held at a time
    if (size !== 'S' && equipped.some(w => (w.system?.size || 'S') !== 'S')) {
      return { canEquip: false, reason: 'size_mismatch' };
    }

    return { canEquip: true, reason: null };
  }

  /**
   * Checks whether a shield can be equipped given current hand configuration.
   * Rules: can't equip if another shield is held, a two-handed weapon is held, or both hands are full.
   * @param {string|null} excludeId - Treat this equipped item as already removed.
   * @returns {{ canEquip: boolean, reason: 'has_shield'|'hands_full'|null }}
   */
  _canEquipShield(excludeId = null) {
    const handItems = this._getEquippedHandItems(excludeId);
    if (handItems.some(i => this._isShield(i))) return { canEquip: false, reason: 'has_shield' };
    if (handItems.some(i => (i.system?.tags || []).includes('two-handed'))) return { canEquip: false, reason: 'hands_full' };
    if (handItems.length >= 2) return { canEquip: false, reason: 'hands_full' };
    return { canEquip: true, reason: null };
  }

  /**
   * Shows Swap / Drop / Delete / Cancel dialog when equipping a shield with full hands.
   * @param {Item} shield
   */
  async _showEquipShieldDialog(shield) {
    const handItems = this._getEquippedHandItems();
    const swapTargets = handItems.filter(h => this._canEquipShield(h.id).canEquip);

    if (swapTargets.length === 0) {
      ui.notifications.error(`Cannot equip ${shield.name} — no valid swap is possible.`);
      return;
    }

    const executeEquip = async (swapOutItem) => {
      if (swapOutItem.type === 'weapon') {
        const swapTags = swapOutItem.system?.tags || [];
        const isSword = swapTags.includes('sword');
        const isDagger = swapTags.includes('dagger');
        const scabbard = (isSword || isDagger) ? this._findEmptyScabbardForWeapon(swapOutItem) : null;
        if (scabbard) {
          await swapOutItem.update({ 'system.equipped': false, 'system.containerId': scabbard.id, 'system.lashed': false });
        } else if (isDagger) {
          const storage = this._findStorageForWeapon(swapOutItem);
          if (storage) {
            await swapOutItem.update({ 'system.equipped': false, 'system.lashed': storage.lashed, 'system.containerId': storage.container.id });
          } else {
            await swapOutItem.update({ 'system.equipped': false });
            ui.notifications.info(`${swapOutItem.name} unequipped (no storage found).`);
          }
        } else if (!isSword) {
          const storage = this._findStorageForWeapon(swapOutItem);
          if (storage) {
            await swapOutItem.update({ 'system.equipped': false, 'system.lashed': storage.lashed, 'system.containerId': storage.container.id });
          } else {
            await swapOutItem.update({ 'system.equipped': false });
            ui.notifications.info(`${swapOutItem.name} unequipped (no storage found).`);
          }
        } else {
          await swapOutItem.update({ 'system.equipped': false });
          ui.notifications.info(`${swapOutItem.name} unequipped (no scabbard available).`);
        }
      } else {
        // Another shield — lash to backpack or drop
        const backpack = this.actor.items.find(c =>
          c.type === 'container' && c.name.toLowerCase().includes('backpack') &&
          (c.system.lashSlots || 0) > 0 &&
          this.actor.items.filter(i => i.system.containerId === c.id && i.system.lashed).length < c.system.lashSlots
        );
        if (backpack) {
          await swapOutItem.update({ 'system.equipped': false, 'system.lashed': true, 'system.containerId': backpack.id });
          ui.notifications.info(`${swapOutItem.name} lashed to ${backpack.name}.`);
        } else {
          await swapOutItem.update({ 'system.equipped': false });
          await this._dropItem(swapOutItem);
        }
      }
      await shield.update({ 'system.equipped': true, 'system.lashed': false, 'system.containerId': null });
      ui.notifications.info(`${shield.name} raised.`);
    };

    const swapContent = swapTargets.length === 1
      ? `<p>Swap with: <strong>${swapTargets[0].name}</strong></p>`
      : `<p>Choose which item to put away:</p>${swapTargets.map(i =>
          `<label style="display:block;margin:4px 0;"><input type="radio" name="swapTarget" value="${i.id}"> ${i.name}</label>`
        ).join('')}`;

    return new Promise(resolve => {
      new Dialog({
        title: `Equip ${shield.name}`,
        content: `<p>Your hands are full. What would you like to do?</p>${swapContent}`,
        buttons: {
          swap: {
            label: 'Swap',
            callback: async (html) => {
              if (swapTargets.length === 1) {
                await executeEquip(swapTargets[0]);
              } else {
                const id = html.find('[name="swapTarget"]:checked').val();
                if (!id) { ui.notifications.warn('Select an item to swap out.'); resolve(false); return; }
                await executeEquip(this.actor.items.get(id));
              }
              resolve(true);
            }
          },
          drop: {
            label: 'Drop',
            callback: async () => { await this._dropItem(shield); resolve(true); }
          },
          delete: {
            label: 'Delete',
            callback: async () => { await shield.delete(); resolve(true); }
          },
          cancel: { label: 'Cancel', callback: () => resolve(false) }
        },
        default: 'cancel'
      }).render(true);
    });
  }

  /**
   * Finds the best lash-based storage for a non-sword weapon (belt first, then any lash slot).
   * Swords and daggers should call _findEmptyScabbardForWeapon first before this.
   * @param {Item} weapon
   * @returns {{ container: Item, lashed: boolean }|null}
   */
  _findStorageForWeapon(weapon) {
    // Try an equipped belt loop that accepts this weapon
    const beltLoop = this.actor.items.find(i => {
      if (i.type !== 'container' || i.name !== 'Belt Loop') return false;
      if (!i.system.lashed) return false;
      const allowed = i.system.allowedNames || [];
      if (allowed.length && !allowed.includes(weapon.name)) return false;
      return !this.actor.items.some(w => w.type === 'weapon' && w.system.containerId === i.id);
    });
    if (beltLoop) return { container: beltLoop, lashed: false };

    // Fall back to any container with lash slots using slotCost-aware check
    const lashContainer = this.actor.items.find(i => {
      if ((i.system.lashSlots || 0) === 0) return false;
      const attached = this.actor.items.filter(a => a.system.containerId === i.id && a.system.lashed);
      const used = attached.reduce((sum, a) => sum + (a.system.slotCost || 1), 0);
      return used < i.system.lashSlots;
    });
    if (lashContainer) return { container: lashContainer, lashed: true };

    return null;
  }

  /**
   * Returns whether a scabbard can accept the given weapon by name.
   * Uses allowedNames if populated; otherwise falls back to hardcoded defaults:
   *   Scabbard, Small  → Shortsword, Dagger
   *   Scabbard, Large  → Bastard Sword, Broadsword, Khopesh, Longsword
   *   Scabbard, Back   → Zweihander
   * @param {Item} scabbard
   * @param {string} weaponName
   * @returns {boolean}
   */
  _scabbardAcceptsWeapon(scabbard, weaponName) {
    const allowedNames = scabbard.system?.allowedNames;
    if (allowedNames && allowedNames.length) return allowedNames.includes(weaponName);

    // Check allowedTypes + allowedSizes (e.g. Sword Frog: sword + S/M)
    const allowedTypes = scabbard.system?.allowedTypes || [];
    const allowedSizes = scabbard.system?.allowedSizes || [];
    if (allowedTypes.length || allowedSizes.length) {
      const weapon = this.actor.items.find(i => i.type === 'weapon' && i.name === weaponName);
      if (!weapon) return false;
      if (allowedTypes.length && !allowedTypes.some(t => (weapon.system.tags || []).includes(t))) return false;
      if (allowedSizes.length && !allowedSizes.includes(weapon.system.size || '')) return false;
      return true;
    }

    // Hardcoded fallback for legacy items
    const defaults = {
      'Scabbard, Small': ['Dagger', 'Misericorde', 'Shortsword'],
      'Sword Frog':      ['Shortsword', 'Bastard Sword', 'Broadsword', 'Khopesh', 'Longsword'],
      'Baldric':         ['Zweihander', 'Greatsword'],
      'Axe Sling':       ['Battle Axe', 'Battle Axe, 2-Handed']
    };
    return (defaults[scabbard.name] || []).includes(weaponName);
  }

  /**
   * Finds an empty weapon carrier (scabbard, frog, sling) that can accept the given weapon.
   * @param {Item} weapon
   * @returns {Item|null}
   */
  _findEmptyScabbardForWeapon(weapon) {
    const carrierNames = ['Scabbard, Small', 'Sword Frog', 'Baldric', 'Axe Sling'];
    return this.actor.items.find(i => {
      if (i.type !== 'container') return false;
      if (!carrierNames.includes(i.name)) return false;
      if (!this._scabbardAcceptsWeapon(i, weapon.name)) return false;
      return !this.actor.items.some(w => w.type === 'weapon' && w.system.containerId === i.id);
    }) || null;
  }

  /**
   * Drops an item onto the scene (unlinked token) and removes it from the actor.
   * Used by equip/unlash dialogs.
   */
  async _dropItem(item) {
    const scene = game.scenes.active;
    if (!scene) { ui.notifications.error("No active scene to drop item on."); return; }

    let token = canvas.tokens.controlled[0];
    if (!token) {
      const owned = canvas.tokens.placeables.filter(t =>
        t.actor && t.document.isOwner && t.actor.type === 'character'
      );
      if (owned.length === 1) token = owned[0];
    }
    const gridSize = scene.grid.size;
    let dropX, dropY;
    if (token) {
      const radians = ((token.document.rotation || 0) * Math.PI) / 180;
      dropX = token.x + Math.cos(radians) * gridSize;
      dropY = token.y + Math.sin(radians) * gridSize;
    } else {
      const dims = scene.dimensions;
      dropX = Math.floor(dims.width / 2 / gridSize) * gridSize;
      dropY = Math.floor(dims.height / 2 / gridSize) * gridSize;
    }
    try {
      await scene.createEmbeddedDocuments('Token', [{
        name: item.name,
        x: dropX,
        y: dropY,
        texture: { src: item.img },
        width: 1, height: 1, lockRotation: true, actorLink: false,
        displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
        displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
        flags: { 'osp-houserules': { droppedItem: true, itemData: item.toObject(), originalActorId: this.actor.id } }
      }]);
      await item.delete();
      ui.notifications.info(`${item.name} dropped.`);
    } catch (err) {
      ui.notifications.error(`Failed to drop ${item.name}: ${err.message}`);
    }
  }

  /**
   * Shows Swap / Drop / Delete / Cancel dialog when equipping a weapon with full hands.
   * @param {Item} incomingWeapon
   * @param {boolean} wasLashed - Whether the weapon was lashed (used in update)
   */
  async _showEquipWeaponDialog(incomingWeapon) {
    const handItems = this._getEquippedHandItems();
    const isTwoHanded = (incomingWeapon.system?.tags || []).includes('two-handed');
    // For two-handed: must clear all hand items. Otherwise: any hand item whose removal
    // would free enough room for the incoming weapon is a valid swap target.
    const swapTargets = isTwoHanded
      ? handItems
      : handItems.filter(h => this._canEquipWeapon(incomingWeapon, h.id).canEquip);

    if (swapTargets.length === 0) {
      ui.notifications.error(`Cannot equip ${incomingWeapon.name} — no valid swap is possible.`);
      return;
    }

    const executeEquip = async (swapOutItems) => {
      for (const item of swapOutItems) {
        if (item.type === 'weapon') {
          const swapTags = item.system?.tags || [];
          const isSword = swapTags.includes('sword');
          const isDagger = swapTags.includes('dagger');
          const scabbard = (isSword || isDagger) ? this._findEmptyScabbardForWeapon(item) : null;
          if (scabbard) {
            await item.update({ 'system.equipped': false, 'system.containerId': scabbard.id, 'system.lashed': false });
          } else if (isDagger || !isSword) {
            const storage = this._findStorageForWeapon(item);
            if (storage) {
              await item.update({ 'system.equipped': false, 'system.lashed': storage.lashed, 'system.containerId': storage.container.id });
            } else {
              await item.update({ 'system.equipped': false });
              ui.notifications.info(`${item.name} unequipped (no storage found).`);
            }
          } else {
            await item.update({ 'system.equipped': false });
            ui.notifications.info(`${item.name} unequipped (no scabbard available).`);
          }
        } else {
          // Shield — try to lash to a backpack, otherwise drop it
          const backpack = this.actor.items.find(c =>
            c.type === 'container' && c.name.toLowerCase().includes('backpack') &&
            (c.system.lashSlots || 0) > 0 &&
            this.actor.items.filter(i => i.system.containerId === c.id && i.system.lashed).length < c.system.lashSlots
          );
          if (backpack) {
            await item.update({ 'system.equipped': false, 'system.lashed': true, 'system.containerId': backpack.id });
            ui.notifications.info(`${item.name} lashed to ${backpack.name}.`);
          } else {
            await item.update({ 'system.equipped': false });
            await this._dropItem(item);
          }
        }
      }
      const swapDrawUpdates = { 'system.equipped': true, 'system.lashed': false };
      if (incomingWeapon.system.lashed) swapDrawUpdates['system.containerId'] = null;
      await incomingWeapon.update(swapDrawUpdates);
      ui.notifications.info(`${incomingWeapon.name} taken in hand.`);
    };

    let swapContent;
    if (isTwoHanded) {
      swapContent = `<p>Equipping a two-handed weapon requires both hands free. This will unequip: <strong>${handItems.map(i => i.name).join(', ')}</strong>.</p>`;
    } else if (swapTargets.length === 1) {
      swapContent = `<p>Swap with: <strong>${swapTargets[0].name}</strong></p>`;
    } else {
      swapContent = `<p>Choose which item to put away:</p>${swapTargets.map(i =>
        `<label style="display:block;margin:4px 0;"><input type="radio" name="swapTarget" value="${i.id}"> ${i.name}</label>`
      ).join('')}`;
    }

    return new Promise(resolve => {
      new Dialog({
        title: `Equip ${incomingWeapon.name}`,
        content: `<p>Your hands are full. What would you like to do?</p>${swapContent}`,
        buttons: {
          swap: {
            label: 'Swap',
            callback: async (html) => {
              if (isTwoHanded || swapTargets.length === 1) {
                await executeEquip(swapTargets);
              } else {
                const id = html.find('[name="swapTarget"]:checked').val();
                if (!id) { ui.notifications.warn('Select a weapon to swap out.'); resolve(false); return; }
                await executeEquip([this.actor.items.get(id)]);
              }
              resolve(true);
            }
          },
          drop: {
            label: 'Drop',
            callback: async () => { await this._dropItem(incomingWeapon); resolve(true); }
          },
          delete: {
            label: 'Delete',
            callback: async () => { await incomingWeapon.delete(); resolve(true); }
          },
          cancel: { label: 'Cancel', callback: () => resolve(false) }
        },
        default: 'cancel'
      }).render(true);
    });
  }

  /**
   * Shows Drop / Delete / Cancel dialog when no storage is available for an unequipped weapon.
   */
  async _showNoStorageDialog(weapon) {
    return new Promise(resolve => {
      new Dialog({
        title: `Unequip ${weapon.name}`,
        content: `<p><strong>${weapon.name}</strong> has nowhere to go. Drop it on the ground or keep it in hand.</p>`,
        buttons: {
          drop: { label: 'Drop', callback: async () => { await this._dropItem(weapon); resolve(true); } },
          cancel: { label: 'Keep in Hand', callback: () => resolve(false) }
        },
        default: 'cancel'
      }).render(true);
    });
  }

  /**
   * Unequip a helmet or shield: lash to backpack → dialog.
   */
  async _unequipToBackpack(item) {
    const backpack = this._findBackpackWithLashSlot(item);
    if (backpack) {
      await item.update({ 'system.equipped': false, 'system.lashed': true, 'system.containerId': backpack.id });
      ui.notifications.info(`${item.name} lashed to ${backpack.name}.`);
      return;
    }
    await this._showArmorNoStorageDialog(item);
  }

  /**
   * Unequip body armor: store in container → dialog.
   */
  async _unequipBodyArmor(armor) {
    const container = this._findContainerWithSpace(armor);
    if (container) {
      await armor.update({ 'system.equipped': false, 'system.containerId': container.id, 'system.lashed': false });
      ui.notifications.info(`${armor.name} stored in ${container.name}.`);
      return;
    }
    await this._showArmorNoStorageDialog(armor);
  }

  /**
   * Returns the first equipped/top-level backpack that has a free lash slot for the given item.
   */
  _findBackpackWithLashSlot(item) {
    const itemSlotCost = item.system.slotCost || 1;
    return this.actor.items.find(c => {
      if (c.type !== 'container') return false;
      if (!c.name.toLowerCase().includes('backpack')) return false;
      if (c.system.containerId) return false; // must be top-level
      const lashSlots = c.system.lashSlots || 0;
      if (lashSlots === 0) return false;
      const used = this.actor.items
        .filter(i => i.system.containerId === c.id && i.system.lashed)
        .reduce((sum, i) => sum + (i.system.slotCost || 1), 0);
      return used + itemSlotCost <= lashSlots;
    }) || null;
  }

  /**
   * Returns the top-level container with the most available space that fits the given item,
   * or null if none can hold it.
   */
  _findContainerWithSpace(item) {
    const itemSize = this._getItemSlotSize(item);
    const candidates = this.actor.items
      .filter(c => c.type === 'container' && !c.system.containerId && !c.system.lashed && c.id !== item.id)
      .map(c => ({ container: c, available: this._parseCapacity(c.system.capacity) - this._getUsedCapacity(c) }))
      .filter(c => c.available >= itemSize)
      .sort((a, b) => b.available - a.available);
    return candidates.length > 0 ? candidates[0].container : null;
  }

  /**
   * Shows Drop / Delete / Cancel dialog when a belt attachment (scabbard, pouch, etc.) is unlashed.
   * Detaches from the belt only if the user confirms.
   */
  async _showUnlashContainerDialog(item) {
    return new Promise(resolve => {
      new Dialog({
        title: `Unlash ${item.name}`,
        content: `<p>Where does <strong>${item.name}</strong> go?</p>`,
        buttons: {
          drop: {
            label: 'Drop',
            callback: async () => {
              await item.update({ 'system.lashed': false, 'system.containerId': null });
              await this._dropItem(item);
              resolve(true);
            }
          },
          delete: {
            label: 'Delete',
            callback: async () => {
              await item.update({ 'system.lashed': false, 'system.containerId': null });
              await item.delete();
              resolve(true);
            }
          },
          cancel: { label: 'Cancel', callback: () => resolve(false) }
        },
        default: 'cancel'
      }).render(true);
    });
  }

  /**
   * Shows Drop / Delete / Cancel dialog when armor cannot be stored anywhere.
   */
  async _showArmorNoStorageDialog(item) {
    return new Promise(resolve => {
      new Dialog({
        title: `Unequip ${item.name}`,
        content: `<p>No container has enough space for <strong>${item.name}</strong>. What would you like to do?</p>`,
        buttons: {
          drop: { label: 'Drop', callback: async () => { await this._dropItem(item); resolve(true); } },
          delete: { label: 'Delete', callback: async () => { await item.delete(); resolve(true); } },
          cancel: { label: 'Cancel', callback: () => resolve(false) }
        },
        default: 'cancel'
      }).render(true);
    });
  }

  /**
   * Shows Swap / Drop / Keep in Hand dialog when a sword is unequipped with no empty scabbard.
   * Swap means: choose a sword already in a scabbard → it goes to hand, this sword takes its place.
   * @param {Item} sword
   */
  async _showSwordNoScabbardDialog(sword) {
    // Find occupied scabbards that accept this weapon by name
    const swapTargets = this.actor.items
      .filter(i => {
        if (i.type !== 'container') return false;
        if (!['Scabbard, Small', 'Sword Frog', 'Baldric'].includes(i.name)) return false;
        if (!this._scabbardAcceptsWeapon(i, sword.name)) return false;
        return this.actor.items.some(w => w.type === 'weapon' && w.system.containerId === i.id);
      })
      .map(scabbard => ({
        scabbard,
        occupant: this.actor.items.find(w => w.type === 'weapon' && w.system.containerId === scabbard.id)
      }))
      .filter(t => t.occupant);

    const hasSwap = swapTargets.length > 0;
    const swapContent = hasSwap
      ? (swapTargets.length === 1
        ? `<p>Swap with: <strong>${swapTargets[0].occupant.name}</strong> (${swapTargets[0].scabbard.name})</p>`
        : `<p>Choose a sword to swap with:</p>${swapTargets.map(t =>
            `<label style="display:block;margin:4px 0;"><input type="radio" name="swapTarget" value="${t.scabbard.id}"> ${t.occupant.name} (${t.scabbard.name})</label>`
          ).join('')}`)
      : '';

    const executeSwap = async (scabbardId) => {
      const scabbard = this.actor.items.get(scabbardId);
      const occupant = this.actor.items.find(w => w.type === 'weapon' && w.system.containerId === scabbard.id);
      if (!occupant) return;
      await occupant.update({ 'system.containerId': null, 'system.equipped': true, 'system.lashed': false });
      await sword.update({ 'system.equipped': false, 'system.containerId': scabbard.id, 'system.lashed': false });
      ui.notifications.info(`${sword.name} sheathed; ${occupant.name} taken in hand.`);
    };

    return new Promise(resolve => {
      const b = {};
      if (hasSwap) {
        b.swap = {
          label: 'Swap',
          callback: async (html) => {
            if (swapTargets.length === 1) {
              await executeSwap(swapTargets[0].scabbard.id);
            } else {
              const id = html.find('[name="swapTarget"]:checked').val();
              if (!id) { ui.notifications.warn('Select a sword to swap with.'); resolve(false); return; }
              await executeSwap(id);
            }
            resolve(true);
          }
        };
      }
      b.drop = {
        label: 'Drop',
        callback: async () => {
          await sword.update({ 'system.equipped': false });
          await this._dropItem(sword);
          resolve(true);
        }
      };
      b.cancel = { label: 'Keep in Hand', callback: () => resolve(false) };
      new Dialog({
        title: `Sheathe ${sword.name}`,
        content: `<p>No empty scabbard for <strong>${sword.name}</strong>. It must stay in hand or be dropped.${hasSwap ? ' Or swap with a sheathed sword.' : ''}</p>${swapContent}`,
        buttons: b,
        default: 'cancel'
      }).render(true);
    });
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
      this._rollAttack(formula, flavor);
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

    this._rollAttack(formula, flavor);
  }

  /**
   * Evaluate a roll and post to chat. Dice So Nice intercepts automatically via createChatMessage hook.
   */
  async _rollAttack(formula, flavor) {
    const roll = await new Roll(formula).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor,
      rollMode: game.settings.get('core', 'rollMode')
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
    // Prefer data-item-id on the clicked control itself (used by stored-weapon rows
    // that share a parent .item-entry with their container)
    const directId = $(event.currentTarget).data("item-id");
    if (directId) return this.actor.items.get(directId);
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
    this.html.find('.item-image').off('dblclick');
    this.html.find('.item-delete').off('click');
    this.html.find('.item-toggle').off('click');
    this.html.find('.item-show').off('click');
    this.html.find('.item-rollable').off('click');
    this.html.find('.quantity input').off('change');
  }
}
