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
    
    // If equipping a Large Sack, validate hand requirements
    if (newEquippedState && item.type === "container" && 
        item.name.toLowerCase().includes('sack') && item.name.toLowerCase().includes('large') &&
        !item.system.containerId) { // Only check if it's a top-level container
      
      // Count currently equipped large sacks (excluding this one)
      const equippedLargeSacks = this.actor.items.filter(i => 
        i.type === "container" &&
        i.name.toLowerCase().includes('sack') &&
        i.name.toLowerCase().includes('large') &&
        i.system.equipped &&
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
    
    // Proceed with equip toggle
    item.update({"system.equipped": newEquippedState});
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
