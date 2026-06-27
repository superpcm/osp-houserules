/**
 * Handles item management operations (CRUD, equipment, etc.)
 */
import { getAttackBonus, getAbilityModifier } from "../../../../config/classes.js";
import { ItemCardDialog } from "../../../cards/item-card-dialog.js";
import { ospRoll, buildManualChatContent } from "../../../dice.js";

const critDamageFormula = (formula) =>
  formula.replace(/(\d+)d(\d+)/gi, (_, n, d) => `${parseInt(n) * 2}d${d}`);

const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class ItemHandler {
  constructor(html, actor, sheet) {
    this.html = html;
    this.actor = actor;
    this.sheet = sheet;
  }

  /**
   * Load armorPermissions for the actor's current class from class_profiles.json.
   * Falls back to ['Any'] if the class cannot be resolved.
   */
  async _getClassArmorPermissions() {
    if (!this.sheet?.loadProfileData) return ['Any'];
    const classKey = (this.actor.system.class || '').toLowerCase();
    try {
      const { classes } = await this.sheet.loadProfileData();
      const profile = classes.find(c => (c.id || c.name || '').toLowerCase() === classKey);
      return profile?.armorPermissions ?? ['Any'];
    } catch {
      return ['Any'];
    }
  }

  /**
   * Check whether an armor item may be equipped given the class's armorPermissions.
   * Returns { allowed: boolean, reason?: string }.
   */
  _checkArmorPermission(item, permissions) {
    const type = item.system?.type;       // light | medium | heavy | shield | helmet
    const name = item.name;
    const material = item.system?.material; // wood | metal (shields only)
    const cls = this.actor.system.class || 'This class';

    if (type === 'helmet') return { allowed: true };

    if (permissions.some(p => p === 'Any' || p === 'Any (size-appropriate)')) return { allowed: true };

    if (permissions.some(p => p === 'None' || p === 'No armour')) {
      return { allowed: false, reason: `${cls} cannot wear armour.` };
    }

    if (type === 'shield') {
      if (permissions.includes('No shields'))
        return { allowed: false, reason: `${cls} cannot use shields.` };
      if (permissions.includes('Wooden shields only'))
        return material === 'wood'
          ? { allowed: true }
          : { allowed: false, reason: `${cls} can only use wooden shields.` };
      if (permissions.includes('Shields')) return { allowed: true };
      return { allowed: false, reason: `${cls} cannot use shields.` };
    }

    // Named-item permissions (e.g. Druid: Padded / Leather / Hide)
    const keywords = new Set(['Any', 'Any (size-appropriate)', 'None', 'No armour',
      'Light armor', 'Medium armor', 'Heavy armor', 'Shields', 'Wooden shields only', 'No shields']);
    const namedItems = permissions.filter(p => !keywords.has(p));
    if (namedItems.length > 0) {
      return namedItems.includes(name)
        ? { allowed: true }
        : { allowed: false, reason: `${cls} may only wear: ${namedItems.join(', ')}.` };
    }

    if (type === 'light' && permissions.includes('Light armor')) return { allowed: true };
    if (type === 'medium' && permissions.includes('Medium armor')) return { allowed: true };
    if (type === 'heavy' && permissions.includes('Heavy armor')) return { allowed: true };

    const label = { light: 'light', medium: 'medium', heavy: 'heavy' }[type] ?? type;
    return { allowed: false, reason: `${cls} cannot wear ${label} armour.` };
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
    
    // Delegated so items inside collapsed-then-expanded sections are covered
    this.html.on('click', '.item-name', this.onItemNameClick.bind(this));

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
   * Returns the parent scabbard container for an item, or null if none.
   * A "scabbard" is any container with the 'scabbard' tag that holds this item.
   */
  _getParentScabbard(item) {
    if (!item.system.containerId) return null;
    const parent = this.actor.items.get(item.system.containerId);
    if (!parent) return null;
    const tags = parent.system?.tags || [];
    return tags.includes('scabbard') ? parent : null;
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

    // The actual DOM row for this item — a nested stored-item row (div) or a top-level item-entry (li)
    const nestedRow = $(event.currentTarget).closest(".lashed-stored-item, .contained-item");
    const row = nestedRow.length ? nestedRow : li;

    // Warn if this item contains others that will also be deleted
    const descendants = this._getContainedDescendants(item);
    if (descendants.length > 0) {
      const nameList = descendants.map(i => `<strong>${esc(i.name)}</strong>`).join(', ');
      const confirmed = await new Promise(resolve => {
        new Dialog({
          title: `Delete ${item.name}`,
          content: `<p>Deleting <strong>${esc(item.name)}</strong> will also delete: ${nameList}.</p>`,
          buttons: {
            yes:    { icon: '<i class="fas fa-trash"></i>', label: 'Yes, Delete All', callback: () => resolve(true) },
            cancel: { icon: '<i class="fas fa-times"></i>', label: 'Cancel',           callback: () => resolve(false) }
          },
          default: 'cancel'
        }).render(true);
      });
      if (!confirmed) return;
      await Promise.all(descendants.map(d => d.delete()));
    }

    const parentScabbard = this._getParentScabbard(item);
    const currentQuantity = item.system.quantity || 1;

    // Helper: delete item + scabbard together (or just item if no scabbard)
    const deleteAll = async () => {
      if (nestedRow.length) nestedRow.remove();
      const ops = [item.delete()];
      if (parentScabbard) ops.push(parentScabbard.delete());
      await Promise.all(ops);
      if (!nestedRow.length) row.slideUp(200, () => this.actor.sheet.render(false));
      else this.actor.sheet.render(false);
    };

    // Helper: reduce qty by deleteQty; if it reaches 0 delete both
    const reduceQty = async (deleteQty) => {
      const remaining = currentQuantity - deleteQty;
      if (remaining <= 0) {
        await deleteAll();
      } else {
        const ops = [item.update({ "system.quantity": remaining })];
        if (parentScabbard) ops.push(parentScabbard.update({ "system.quantity": remaining }));
        await Promise.all(ops);
      }
    };

    // If quantity is 1 or item doesn't use quantity system, just delete
    if (currentQuantity <= 1) {
      await deleteAll();
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
          callback: async () => deleteAll()
        },
        deleteSpecific: {
          icon: '<i class="fas fa-minus"></i>',
          label: "Delete Quantity",
          callback: async (html) => {
            const deleteQty = parseInt(html.find('[name="deleteQuantity"]').val()) || 1;
            await reduceQty(deleteQty);
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

    // Warn if dropping all of a container that holds other items
    const descendants = this._getContainedDescendants(item);
    if (descendants.length > 0 && dropQuantity >= currentQuantity) {
      const nameList = descendants.map(i => `<strong>${esc(i.name)}</strong>`).join(', ');
      const confirmed = await new Promise(resolve => {
        new Dialog({
          title: `Drop ${item.name}`,
          content: `<p>Dropping <strong>${esc(item.name)}</strong> will also remove from your inventory: ${nameList}.</p>`,
          buttons: {
            yes:    { icon: '<i class="fas fa-box-open"></i>', label: 'Drop',   callback: () => resolve(true) },
            cancel: { icon: '<i class="fas fa-times"></i>',   label: 'Cancel', callback: () => resolve(false) }
          },
          default: 'cancel'
        }).render(true);
      });
      if (!confirmed) return;
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
        // Dropped all — delete contents first, then the item
        if (descendants.length > 0) await Promise.all(descendants.map(d => d.delete()));
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
        // Lashable containers (belt pouches, sword frogs, etc.): shirt icon attaches to belt or detaches
        if (item.type === 'container' && item.system.lashable) {
          if (item.system.lashed) {
            // Already on belt — shirt icon detaches it (same as unlash)
            await this.onItemLashToggle(event);
            return;
          }
          // Not yet on belt — attach to it
          const belt = this.actor.items.find(i =>
            i.type === 'clothing' && (i.system.lashSlots || 0) > 0 && i.system.equipped
          );
          if (!belt) {
            ui.notifications.error(`No equipped belt found. Equip a belt first.`);
            return;
          }
          const lashedAttachments = this.actor.items.filter(i =>
            i.type === 'container' && i.system.containerId === belt.id && i.system.lashed && i.id !== item.id
          );
          const usedSlots = lashedAttachments.reduce((sum, i) => sum + (i.system.slotCost || 1), 0);
          const itemSlotCost = item.system.slotCost || 1;
          if (usedSlots + itemSlotCost > (belt.system.lashSlots || 0)) {
            ui.notifications.error(`${belt.name} is full (${usedSlots}/${belt.system.lashSlots} slots used, need ${itemSlotCost} for ${item.name}).`);
            return;
          }
          await item.update({ 'system.lashed': true, 'system.containerId': belt.id, 'system.equipped': false });
          ui.notifications.info(`${item.name} attached to ${belt.name}.`);
          return;
        }

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

        // Sack hand-requirement validation
        if (item.name === 'Sack, Large' || item.name === 'Sack, Small') {
          const handsNeeded = item.name === 'Sack, Large' ? 2 : 1;
          const handsUsed = this._countHandsUsed(item.id);
          const handsFree = 2 - handsUsed;
          if (handsFree < handsNeeded) {
            const needed = handsNeeded === 2 ? 'both hands' : 'one free hand';
            ui.notifications.error(`${item.name} requires ${needed}. Unequip weapons, shields, and hand-held items first.`);
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
        // Consumable thrown weapons (Oil Flask, Holy Water, Darts): ready from container without
        // occupying hand slots.
        const _tags = item.system?.tags || [];
        if (_tags.includes('consumable') || (_tags.includes('missile') && _tags.includes('reload'))) {
          const currentQty = item.system.quantity || 1;
          if (currentQty > 1) {
            // Split: leave (qty-1) in storage, create a new equipped copy with qty=1
            const itemData = item.toObject();
            delete itemData._id;
            itemData.system.quantity = 1;
            itemData.system.equipped = true;
            itemData.system.containerId = null;
            itemData.system.lashed = false;
            await item.update({ 'system.quantity': currentQty - 1 });
            await this.actor.createEmbeddedDocuments('Item', [itemData]);
            ui.notifications.info(`${item.name} readied (${currentQty - 1} remaining in storage).`);
          } else {
            // qty=1: equip in place, keep containerId so stow can return it to the same container
            await item.update({ 'system.equipped': true });
            ui.notifications.info(`${item.name} readied.`);
          }
          return;
        }
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

        // Consumable thrown weapons: stow back to container
        const isConsumable = tags.includes('consumable') || (tags.includes('missile') && tags.includes('reload'));
        if (isConsumable) {
          const currentContainer = item.system.containerId ? this.actor.items.get(item.system.containerId) : null;
          if (currentContainer) {
            // qty=1 path: item still references its container — just unequip in place
            await item.update({ 'system.equipped': false });
            ui.notifications.info(`${item.name} stowed in ${currentContainer.name}.`);
          } else {
            // qty>1 split path: find matching stack in any container and merge, then delete this copy
            const allContainerItems = this.actor.items.filter(i =>
              i.system.containerId && i.name === item.name && !i.system.equipped && i.id !== item.id
            );
            if (allContainerItems.length > 0) {
              const target = allContainerItems[0];
              await target.update({ 'system.quantity': (target.system.quantity || 1) + 1 });
              await item.delete();
              ui.notifications.info(`${item.name} stowed in container.`);
            } else {
              // No matching stack — find best container and create there
              const storage = this._findStorageForWeapon(item);
              if (storage) {
                await item.update({ 'system.equipped': false, 'system.containerId': storage.container.id, 'system.lashed': false });
                ui.notifications.info(`${item.name} stowed in ${storage.container.name}.`);
              } else {
                await this._showNoStorageDialog(item);
              }
            }
          }
          return;
        }

        const isSword = tags.includes('sword');
        const isDagger = tags.includes('dagger');
        if (isSword && !isDagger) {
          // If the sword still references its scabbard (was drawn from it), sheathe in place
          const currentScabbard = item.system.containerId ? this.actor.items.get(item.system.containerId) : null;
          if (currentScabbard) {
            await item.update({ 'system.equipped': false });
            ui.notifications.info(`${item.name} sheathed in ${currentScabbard.name}.`);
          } else {
            // Scabbard deleted or never set — clear any stale containerId before searching
            if (item.system.containerId && !currentScabbard) {
              await item.update({ 'system.containerId': null });
            }
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
            const _tags = item.system?.tags || [];
            const _isSlungOnly = (item.name || '').toLowerCase().includes('crossbow') ||
              (_tags.includes('missile') && _tags.includes('two-handed'));
            if (_isSlungOnly) {
              const SLUNG_MAX = 3;
              const _isSlungable = (tags) => tags.includes('slungable') || tags.includes('sling')
                || (tags.includes('missile') && tags.includes('two-handed'));
              const slotsNeeded = item.system?.slungSlots ?? 1;
              const slotsUsed = this.actor.items
                .filter(i => {
                  const tags = i.system.tags || [];
                  if (!_isSlungable(tags) || i.id === item.id) return false;
                  if (i.type === 'weapon') return !i.system.equipped && !i.system.containerId && !i.system.lashed;
                  return i.system.equipped;
                })
                .reduce((sum, i) => sum + (i.system.slungSlots ?? 1), 0);
              if (SLUNG_MAX - slotsUsed >= slotsNeeded) {
                await item.update({ 'system.equipped': false, 'system.containerId': null, 'system.lashed': false });
                ui.notifications.info(`${item.name} slung.`);
              } else {
                await this._showNoStorageDialog(item);
              }
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
      }
    } else {
      // ── NON-WEAPON, NON-CONTAINER ITEMS (armor, shields, etc.) ───────────
      if (newEquippedState) {
        // Armor permission check
        if (item.type === 'armor') {
          const permissions = await this._getClassArmorPermissions();
          const { allowed, reason } = this._checkArmorPermission(item, permissions);
          if (!allowed) {
            ui.notifications.warn(reason);
            return;
          }
        }

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
        // If lashed to another container (backpack etc.), just store it there — don't show belt dialog
        const parent = item.system.containerId
          ? this.actor.items.get(item.system.containerId)
          : null;
        if (parent && parent.type === 'container') {
          await item.update({ 'system.lashed': false });
          ui.notifications.info(`${item.name} stored in ${parent.name}.`);
          return;
        }
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
        const permissions = await this._getClassArmorPermissions();
        const { allowed, reason: permReason } = this._checkArmorPermission(item, permissions);
        if (!allowed) {
          ui.notifications.warn(permReason);
          return;
        }
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
        await this._showUnlashItemDialog(item);
      }
      return;
    }

    // ── LASH PATH ────────────────────────────────────────────────────────────

    // Sling containers (Baldric etc.) cannot be lashed to anything
    if (item.type === 'container' && (item.system?.tags || []).includes('sling')) {
      ui.notifications.warn(`${item.name} cannot be lashed. It must be worn or dropped.`);
      return;
    }

    // Bows and crossbows cannot be lashed — sling only
    if (item.type === 'weapon') {
      const _tags = item.system?.tags || [];
      const _isSlungOnly = (item.name || '').toLowerCase().includes('crossbow') ||
        (_tags.includes('missile') && _tags.includes('two-handed'));
      if (_isSlungOnly) {
        ui.notifications.warn(`${item.name} cannot be lashed — sling it instead.`);
        return;
      }
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

  /** Returns all currently equipped hand items (weapons + shields + sacks), optionally excluding one by id. */
  _getEquippedHandItems(excludeId = null) {
    return this.actor.items.filter(i =>
      i.system.equipped && i.id !== excludeId &&
      (i.type === 'weapon' ||
       (i.type === 'armor' && i.name.toLowerCase().includes('shield')) ||
       i.name === 'Sack, Large' || i.name === 'Sack, Small')
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

    // Hands occupied by equipped sacks (not captured by weapon/shield checks)
    const sackHandsUsed = this.actor.items.reduce((total, i) => {
      if (!i.system.equipped || i.id === excludeId) return total;
      if (i.name === 'Sack, Large') return total + 2;
      if (i.name === 'Sack, Small') return total + 1;
      return total;
    }, 0);

    // Cannot add anything if a two-handed weapon is already equipped
    if (equipped.some(w => (w.system?.tags || []).includes('two-handed'))) {
      return { canEquip: false, reason: 'hands_full' };
    }

    if (isTwoHanded) {
      if (equipped.length > 0 || hasShield || sackHandsUsed > 0)
        return { canEquip: false, reason: 'hands_full' };
      return { canEquip: true, reason: null };
    }

    const maxWeapons = Math.max(0, 2 - sackHandsUsed - (hasShield ? 1 : 0));
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
      if (allowed.length && !allowed.includes(this._baseName(weapon.name))) return false;
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
   *   Scabbard, Dagger → Dagger, Misericorde
   *   Scabbard, Sword  → Longsword, Broadsword, Bastard Sword, Khopesh, Shortsword
   * @param {Item} scabbard
   * @param {string} weaponName
   * @returns {boolean}
   */
  // Strip trailing modifier suffix (e.g. " +2", " -1") so "Longsword +2" matches "Longsword"
  _baseName(name) {
    return name.replace(/\s*[+-]\d+$/, '');
  }

  _getContainedDescendants(item) {
    const direct = this.actor.items.filter(i => i.system.containerId === item.id);
    return direct.reduce((all, child) => {
      all.push(child, ...this._getContainedDescendants(child));
      return all;
    }, []);
  }

  _scabbardAcceptsWeapon(scabbard, weaponName) {
    const baseName = this._baseName(weaponName);
    const allowedNames = scabbard.system?.allowedNames;
    if (allowedNames && allowedNames.length) return allowedNames.includes(baseName);

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
      'Scabbard, Dagger': ['Dagger', 'Misericorde'],
      'Scabbard, Sword':  ['Longsword', 'Broadsword', 'Bastard Sword', 'Khopesh', 'Shortsword'],
      'Sword Frog':       ['Scabbard, Sword'],
      'Baldric':          ['Zweihander', 'Greatsword'],
      'Axe Sling':        ['Battle Axe', 'Battle Axe, 2-Handed']
    };
    return (defaults[scabbard.name] || []).includes(baseName);
  }

  /**
   * Finds an empty weapon carrier (scabbard, frog, sling) that can accept the given weapon.
   * @param {Item} weapon
   * @returns {Item|null}
   */
  _findEmptyScabbardForWeapon(weapon) {
    const carrierNames = ['Scabbard, Dagger', 'Scabbard, Sword', 'Sword Frog', 'Baldric', 'Axe Sling'];
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
        } else if (item.name === 'Sack, Large' || item.name === 'Sack, Small') {
          // Sack — put it down (unequipped, free-floating until stored)
          await item.update({ 'system.equipped': false, 'system.containerId': null, 'system.lashed': false });
          ui.notifications.info(`${item.name} put down.`);
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
    const SLUNG_MAX = 3;
    const _isSlungable = (tags) => tags.includes('slungable') || tags.includes('sling')
      || (tags.includes('missile') && tags.includes('two-handed'));
    const _slungSlots = (i) => i.system.slungSlots ?? 1;

    const weaponTags = weapon.system?.tags || [];
    const slotsNeeded = weapon.system?.slungSlots ?? 1;
    const slotsUsed = this.actor.items
      .filter(i => {
        const tags = i.system.tags || [];
        if (!_isSlungable(tags) || i.id === weapon.id) return false;
        if (i.type === 'weapon') return !i.system.equipped && !i.system.containerId && !i.system.lashed;
        return i.system.equipped;
      })
      .reduce((sum, i) => sum + _slungSlots(i), 0);
    const canSling = _isSlungable(weaponTags) && (SLUNG_MAX - slotsUsed) >= slotsNeeded;

    return new Promise(resolve => {
      const buttons = {
        drop: { label: 'Drop', callback: async () => { await this._dropItem(weapon); resolve(true); } }
      };
      if (canSling) {
        buttons.sling = {
          label: `Sling (${slotsNeeded} slot${slotsNeeded !== 1 ? 's' : ''})`,
          callback: async () => {
            await weapon.update({ 'system.equipped': false, 'system.containerId': null, 'system.lashed': false });
            ui.notifications.info(`${weapon.name} slung.`);
            resolve(true);
          }
        };
      }
      buttons.cancel = { label: 'Keep in Hand', callback: () => resolve(false) };

      const content = canSling
        ? `<p><strong>${weapon.name}</strong> has nowhere to go. Sling it, drop it, or keep it in hand.</p>`
        : `<p><strong>${weapon.name}</strong> has nowhere to go. Drop it on the ground or keep it in hand.</p>`;

      new Dialog({
        title: `Unequip ${weapon.name}`,
        content,
        buttons,
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
    const _itemTags = item.system?.tags || [];
    const _itemName = (item.name || '').toLowerCase();
    const _isBowOrCrossbow = item.type === 'weapon' &&
      (_itemName.includes('crossbow') || (_itemTags.includes('missile') && _itemTags.includes('two-handed')));
    const candidates = this.actor.items
      .filter(c => {
        if (c.type !== 'container' || c.system.containerId || c.system.lashed || c.id === item.id) return false;
        if (_isBowOrCrossbow && (c.name === 'Sack, Large' || c.name === 'Sack, Small')) return false;
        return true;
      })
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
    const storageContainer = this._findContainerWithSpace(item);
    return new Promise(resolve => {
      const buttons = {};
      if (storageContainer) {
        buttons.store = {
          label: `Store in ${storageContainer.name}`,
          callback: async () => {
            await item.update({ 'system.lashed': false, 'system.containerId': storageContainer.id });
            ui.notifications.info(`${item.name} stored in ${storageContainer.name}.`);
            resolve(true);
          }
        };
      }
      buttons.drop = {
        label: 'Drop',
        callback: async () => {
          await item.update({ 'system.lashed': false, 'system.containerId': null });
          await this._dropItem(item);
          resolve(true);
        }
      };
      buttons.delete = {
        label: 'Delete',
        callback: async () => {
          await item.update({ 'system.lashed': false, 'system.containerId': null });
          await item.delete();
          resolve(true);
        }
      };
      buttons.cancel = { label: 'Cancel', callback: () => resolve(false) };
      new Dialog({
        title: `Unlash ${item.name}`,
        content: `<p>Where does <strong>${esc(item.name)}</strong> go?</p>`,
        buttons,
        default: storageContainer ? 'store' : 'cancel'
      }, { width: 520 }).render(true);
    });
  }

  /**
   * Shows Store / Drop / Cancel dialog when a lashed item (waterskin, etc.) is unlashed.
   */
  async _showUnlashItemDialog(item) {
    const containers = this.actor.items.filter(c =>
      c.type === 'container' && !c.system.containerId && !c.system.lashed &&
      this._hasContainerSpace(c, item)
    );
    return new Promise(resolve => {
      const buttons = {};
      for (const container of containers) {
        buttons[`store_${container.id}`] = {
          label: `Store in ${container.name}`,
          callback: async () => {
            await item.update({ 'system.lashed': false, 'system.containerId': container.id });
            ui.notifications.info(`${item.name} stored in ${container.name}.`);
            resolve(true);
          }
        };
      }
      buttons.drop = {
        label: 'Drop',
        callback: async () => {
          await item.update({ 'system.lashed': false, 'system.containerId': null });
          await this._dropItem(item);
          resolve(true);
        }
      };
      buttons.cancel = { label: 'Cancel', callback: () => resolve(false) };
      new Dialog({
        title: `Unlash ${item.name}`,
        content: `<p>Where does <strong>${esc(item.name)}</strong> go?</p>`,
        buttons,
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
        content: `<p>No container has enough space for <strong>${esc(item.name)}</strong>. What would you like to do?</p>`,
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
        if (!['Scabbard, Dagger', 'Scabbard, Sword', 'Sword Frog', 'Baldric'].includes(i.name)) return false;
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
        ? `<p>Swap with: <strong>${esc(swapTargets[0].occupant.name)}</strong> (${esc(swapTargets[0].scabbard.name)})</p>`
        : `<p>Choose a sword to swap with:</p>${swapTargets.map(t =>
            `<label style="display:block;margin:4px 0;"><input type="radio" name="swapTarget" value="${t.scabbard.id}"> ${esc(t.occupant.name)} (${esc(t.scabbard.name)})</label>`
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
      b.cancel = { label: 'Cancel', callback: () => resolve(false) };
      new Dialog({
        title: `Sheathe ${sword.name}`,
        content: `<p>There is no scabbard in which to sheathe <strong>${esc(sword.name)}</strong>.${hasSwap ? ' You may swap with a sheathed sword, or drop it.' : ' Drop it or cancel.'}</p>${swapContent}`,
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
  async onItemRoll(event) {
    event.preventDefault();
    const item = this.getItemFromEvent(event);
    
    if (item && item.type === "weapon") {
      // Get character stats
      const characterClass = this.actor.system.class || 'fighter';
      const level = parseInt(this.actor.system.level) || 1;
      const strScore = parseInt(this.actor.system.attributes?.str?.value) || 10;
      const dexScore = parseInt(this.actor.system.attributes?.dex?.value) || 10;

      // Dual-use weapons (melee AND missile): ask how it's being employed.
      // Check both boolean fields and tags — older items may lack the boolean fields.
      let isThrown = false;
      const itemTags = item.system?.tags || [];
      const isMelee   = item.system.melee   || itemTags.includes('melee');
      const isMissile = item.system.missile  || itemTags.includes('missile');
      const isDualUse = isMelee && isMissile &&
        !itemTags.includes('consumable') &&
        !(itemTags.includes('missile') && itemTags.includes('reload'));
      if (isDualUse) {
        const choice = await new Promise(resolve => {
          new Dialog({
            title: `${item.name} — Attack Mode`,
            content: `<p>How are you attacking with the <strong>${item.name}</strong>?</p>`,
            buttons: {
              melee:  { icon: '<i class="fas fa-hand-fist"></i>', label: 'Melee (STR)',  callback: () => resolve('melee') },
              thrown: { icon: '<i class="fas fa-bullseye"></i>',  label: 'Thrown (DEX)', callback: () => resolve('thrown') },
              cancel: { icon: '<i class="fas fa-times"></i>',     label: 'Cancel',       callback: () => resolve(null) }
            },
            default: 'melee'
          }).render(true);
        });
        if (!choice) return;
        isThrown = choice === 'thrown';
      }

      // Calculate attack bonus from class/level
      const classAttackBonus = getAttackBonus(characterClass, level);

      // Get weapon's inherent bonus
      const weaponBonus = parseInt(item.system.bonus) || 0;

      // Determine ability modifier based on weapon type
      let abilityModifier = 0;
      let abilityName = '';

      if (isThrown || (!isMelee && isMissile)) {
        // Thrown or pure missile weapons use DEX
        abilityModifier = getAbilityModifier(dexScore);
        abilityName = 'DEX';
      } else if (isMelee) {
        // Melee weapons use STR
        abilityModifier = getAbilityModifier(strScore);
        abilityName = 'STR';
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
      
      const flavor = `${esc(item.name)} Attack Roll<br><small>${bonusBreakdown}</small>`;

      // Resolve target for hit/miss comparison
      const targetOpts = this._resolveTargetOpts(totalBonus);

      const { isHit, isCrit, cancelled } = await this._rollAttack(formula, flavor, targetOpts);
      if (cancelled) return;

      // Consumable thrown weapons are expended on throw (hit or miss)
      if (itemTags.includes('consumable') || (itemTags.includes('missile') && itemTags.includes('reload'))) {
        const qty = item.system.quantity || 1;
        if (qty <= 1) {
          await item.delete();
          ui.notifications.info(`${item.name} used — none remaining.`);
        } else {
          await item.update({ 'system.quantity': qty - 1 });
          ui.notifications.info(`${item.name} used (${qty - 1} remaining).`);
        }
        // item is now deleted or updated; fall through to roll damage using cached item data
      }

      // Dual-use weapon thrown: remove one from inventory and sync scabbard qty
      if (isThrown) {
        const qty = item.system.quantity || 1;
        const scabbard = this._getParentScabbard(item);
        if (qty <= 1) {
          const ops = [item.delete()];
          if (scabbard) ops.push(scabbard.delete());
          await Promise.all(ops);
          ui.notifications.info(`${item.name} thrown — none remaining.`);
        } else {
          const ops = [item.update({ 'system.quantity': qty - 1 })];
          if (scabbard) ops.push(scabbard.update({ 'system.quantity': qty - 1 }));
          await Promise.all(ops);
          ui.notifications.info(`${item.name} thrown (${qty - 1} remaining).`);
        }
      }

      // Roll damage: always when no target, only on a hit when targeting
      if (item.system.damage && (isHit === null || isHit)) {
        const baseDmgFormula = weaponBonus > 0
          ? `${item.system.damage} + ${weaponBonus}`
          : item.system.damage;
        const dmgFormula = isCrit ? critDamageFormula(baseDmgFormula) : baseDmgFormula;
        const dmgFlavor = isCrit
          ? `${item.name} Damage <em>(Critical Hit!)</em>`
          : weaponBonus > 0
            ? `${item.name} Damage<br><small>Weapon bonus: +${weaponBonus}</small>`
            : `${item.name} Damage`;
        await this._rollDamage(dmgFormula, dmgFlavor);
      }
    }
  }

  /**
   * Handle rolling an unarmed attack (Punch/Kick)
   */
  async onUnarmedRoll(event) {
    event.preventDefault();

    const characterClass = this.actor.system.class || 'fighter';
    const level = parseInt(this.actor.system.level) || 1;
    const strScore = parseInt(this.actor.system.attributes?.str?.value) || 10;

    const classAttackBonus = getAttackBonus(characterClass, level);
    const abilityModifier = getAbilityModifier(strScore);
    const totalBonus = classAttackBonus + abilityModifier;

    const formula = totalBonus >= 0 ? `1d20 + ${totalBonus}` : `1d20 - ${Math.abs(totalBonus)}`;
    const bonusBreakdown = [
      `Class: +${classAttackBonus}`,
      `STR: ${abilityModifier >= 0 ? '+' : ''}${abilityModifier}`
    ].join(', ');

    const targetOpts = this._resolveTargetOpts(totalBonus);
    const { isHit, isCrit, cancelled } = await this._rollAttack(formula, `Unarmed Attack (Punch/Kick)<br><small>${bonusBreakdown}</small>`, targetOpts);
    if (cancelled) return;

    if (isHit === null || isHit) {
      const baseDmgFormula = abilityModifier >= 0
        ? `1d2 + ${abilityModifier}`
        : `1d2 - ${Math.abs(abilityModifier)}`;
      const dmgFormula = isCrit ? critDamageFormula(baseDmgFormula) : baseDmgFormula;
      const dmgFlavor = isCrit
        ? `Unarmed Damage <em>(Critical Hit!)</em>`
        : `Unarmed Damage<br><small>STR: ${abilityModifier >= 0 ? '+' : ''}${abilityModifier}</small>`;
      await this._rollDamage(dmgFormula, dmgFlavor);
    }
  }

  _resolveTargetOpts(totalBonus) {
    const targets = [...game.user.targets];
    if (!targets.length) return null;
    const targetToken = targets[0];
    const targetActor = targetToken.actor;
    if (!targetActor) return null;
    const rawAAC = targetActor.system.aac;
    const targetAAC = (rawAAC !== null && typeof rawAAC === "object")
      ? (rawAAC.value ?? 10)
      : (targetActor.system.ac ?? 10);
    return { targetAAC, targetName: targetToken.name, needRoll: targetAAC - totalBonus };
  }

  async _rollAttack(formula, flavor, targetOpts = null) {
    const result = await ospRoll(formula, { label: flavor });
    if (result.cancelled) return { isHit: null, isCrit: false, cancelled: true };

    let finalFlavor = flavor;
    let isHit = null;
    let isCrit = false;
    let flags = {};

    if (targetOpts) {
      const { targetAAC, targetName, needRoll } = targetOpts;
      const natural  = result.naturalD20;
      isCrit         = natural === 20;
      const isFumble = natural === 1;
      isHit = isCrit || (!isFumble && result.total >= targetAAC);
      const attackResult = isCrit ? "critical_hit" : isFumble ? "critical-miss" : isHit ? "hit" : "miss";
      const color = isHit ? "#006600" : "#990000";
      finalFlavor = `${flavor} vs <strong>${esc(targetName)}</strong> (AAC&nbsp;${targetAAC}, need&nbsp;${needRoll}+) — <strong style="color:${color}">${isHit ? "HIT" : "MISS"}</strong>`;
      flags = { "osp-houserules": { attackResult, manualRoll: result.manual } };
    }

    const speaker  = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');

    const safeFlavor = DOMPurify.sanitize(finalFlavor);
    if (result.foundryRoll) {
      await result.foundryRoll.toMessage({ speaker, flavor: safeFlavor, rollMode, flags });
    } else {
      const whisperData = ChatMessage.applyRollMode({}, rollMode);
      await ChatMessage.create({
        ...whisperData,
        speaker,
        flavor: safeFlavor,
        content: buildManualChatContent(result, { formula, label: flavor }),
        flags
      });
    }

    return { isHit, isCrit, cancelled: false };
  }

  async _rollDamage(formula, flavor) {
    const result = await ospRoll(formula, { label: flavor });
    if (result.cancelled) return;

    const speaker  = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const flags    = { "osp-houserules": { combatDamage: true, manualRoll: result.manual, manualDamageTotal: result.manual ? result.total : undefined } };

    if (result.foundryRoll) {
      await result.foundryRoll.toMessage({ speaker, flavor, rollMode, flags });
    } else {
      const whisperData = ChatMessage.applyRollMode({}, rollMode);
      await ChatMessage.create({
        ...whisperData,
        speaker,
        flavor,
        content: buildManualChatContent(result, { formula, label: flavor }),
        flags
      });
    }
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
   * Count hands currently occupied by equipped weapons, shields, and hand-carried sacks.
   * excludeItemId: skip that item (the one being toggled) so we don't double-count it.
   */
  _countHandsUsed(excludeItemId = null) {
    return this.actor.items.reduce((total, i) => {
      if (!i.system.equipped || i.id === excludeItemId) return total;
      const tags = i.system.tags || [];
      if (i.type === 'weapon') return total + (tags.includes('two-handed') ? 2 : 1);
      if (i.type === 'armor' && i.system.type === 'shield') return total + 1;
      if (i.name === 'Sack, Large') return total + 2;
      if (i.name === 'Sack, Small') return total + 1;
      return total;
    }, 0);
  }

  /**
   * Get item from event target
   */
  getItemFromEvent(event) {
    // Prefer data-item-id on the matched element itself
    const directId = $(event.currentTarget).data("item-id");
    if (directId) return this.actor.items.get(directId);
    // Fall back to nearest ANCESTOR (not self) with a non-empty data-item-id.
    // Using .parents() instead of .closest() ensures an empty data-item-id=""
    // on the element itself doesn't shadow the wrapper div's correct id.
    const ancestor = $(event.currentTarget).parents("[data-item-id]").first();
    const itemId = ancestor.data("item-id");
    return itemId ? this.actor.items.get(itemId) : null;
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
