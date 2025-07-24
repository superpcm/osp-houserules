/**
 * Handles item management operations (CRUD, equipment, etc.)
 */
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
