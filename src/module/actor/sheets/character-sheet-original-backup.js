<div style="
  position: absolute; 
  top: 0; 
  left: 0; 
  width: 55px;  <!-- This controls the actual bar width -->
  height: 34px; 
  background-color: white; 
  border: 1px solid #000; 
  border-radius: 9px;
  box-shadow: inset 3px 3px 6px rgba(0,0,0,0.15);
  overflow: hidden;
">const { ActorSheet } = foundry.appv1.sheets;

export class OspActorSheetCharacter extends ActorSheet {
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

    // --- Race/Class logic (leave unchanged) ---
    const raceClasses = [
      "Elf", "Dwarf", "Gnome", "Hobbit", "Half-Elf", "Half-Orc"
    ];

    const $classSelect = html.find('select[name="system.class"]');
    const $raceSelect = html.find('select[name="system.race"]');

    function syncRaceField() {
      const selectedClass = $classSelect.val();
      if (raceClasses.includes(selectedClass)) {
        $raceSelect.val(selectedClass);
        $raceSelect.prop("disabled", true);
      } else {
        $raceSelect.prop("disabled", false);
      }
    }

    $classSelect.on("change", syncRaceField);
    syncRaceField();

    // --- Languages tag input logic ---
    const $tags = html.find('.languages-tags');
    const $hidden = html.find('.char-languages');
    const $openDialog = html.find('.open-language-dialog');

    // Always include "Common" as the first tag
    let languages = ($hidden.val() || "").split(",").map(l => l.trim()).filter(l => l && l !== "Common");
    languages.unshift("Common");

    function renderTags() {
      $tags.empty();
      languages.forEach(lang => {
        const $tag = $(`
          <span class="lang-tag">
            ${lang}
            ${lang !== "Common" ? `<button type="button" class="remove-lang" data-lang="${lang}" aria-label="Remove ${lang}">&times;</button>` : ""}
          </span>
        `);
        $tags.append($tag);
      });
      $hidden.val(languages.join(", "));
    }

    renderTags();

    $tags.on('click', '.remove-lang', function() {
      const lang = $(this).data('lang');
      languages = languages.filter(l => l !== lang && l !== "Common");
      languages.unshift("Common");
      renderTags();
    });

    // Dialog for adding languages
    $openDialog.on('click', async function() {
      // List of standard languages
      const allLangs = ["Dwarvish", "Elvish", "Gnomish", "Hobbitish", "Humanish", "Orcish"];
      let dialogContent = `<form>
        <div style="margin-bottom:8px;">
          <label><b>Select Languages:</b></label><br/>
          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px;">
            ${allLangs.map(lang =>
              `<label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" name="lang" value="${lang}" ${languages.includes(lang) ? "checked disabled" : ""}/>
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

      new Dialog({
        title: "Add Language",
        content: dialogContent,
        buttons: {
          ok: {
            label: "Add",
            callback: htmlDialog => {
              // Add checked standard languages
              htmlDialog.find('input[name="lang"]:checked:not(:disabled)').each(function() {
                const val = $(this).val();
                if (val && !languages.includes(val)) languages.push(val);
              });
              // Add custom language
              const custom = htmlDialog.find('input[name="custom"]').val().trim();
              if (custom && !languages.includes(custom)) languages.push(custom);
              renderTags();
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "ok"
      }).render(true);
    });

    // --- Item Controls ---
    if (!this.options.editable) return;

    // Create Item
    html.find('.item-create').click(this._onItemCreate.bind(this));

    // Update Item
    html.find('.item-edit').click(this._onItemEdit.bind(this));

    // Delete Item
    html.find('.item-delete').click(this._onItemDelete.bind(this));

    // Toggle Equipment
    html.find('.item-toggle').click(this._onItemToggle.bind(this));

    // Show Item
    html.find('.item-show').click(this._onItemShow.bind(this));

    // Rollable Items
    html.find('.item-rollable').click(this._onItemRoll.bind(this));

    // Item Quantity Changes
    html.find('.quantity input').change(this._onQuantityChange.bind(this));

    // Category Toggles
    html.find('.category-caret').click(this._onCategoryToggle.bind(this));
  }

  /**
   * Handle creating a new Owned Item for the actor using the item creation dialog
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {
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
   * Handle editing an Owned Item for the Actor
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemEdit(event) {
    event.preventDefault();
    const li = $(event.currentTarget).parents(".item-entry");
    const item = this.actor.items.get(li.data("item-id"));
    item.sheet.render(true);
  }

  /**
   * Handle deleting an Owned Item for the Actor
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemDelete(event) {
    event.preventDefault();
    const li = $(event.currentTarget).parents(".item-entry");
    const item = this.actor.items.get(li.data("item-id"));
    item.delete();
    li.slideUp(200, () => this.render(false));
  }

  /**
   * Handle toggling an item's equipped status
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemToggle(event) {
    event.preventDefault();
    const li = $(event.currentTarget).parents(".item-entry");
    const item = this.actor.items.get(li.data("item-id"));
    const equipped = !item.system.equipped;
    item.update({"system.equipped": equipped});
  }

  /**
   * Handle showing an item's details in chat
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemShow(event) {
    event.preventDefault();
    const li = $(event.currentTarget).parents(".item-entry");
    const item = this.actor.items.get(li.data("item-id"));
    
    // Create a chat message with item details
    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="item-card">
        <h3>${item.name}</h3>
        ${item.system.description ? `<p>${item.system.description}</p>` : ""}
        ${item.type === "weapon" ? `<p><strong>Damage:</strong> ${item.system.damage}</p>` : ""}
        ${item.type === "armor" ? `<p><strong>AC:</strong> ${item.system.ac.value}</p>` : ""}
        <p><strong>Weight:</strong> ${item.system.weight} lbs</p>
      </div>`
    };
    
    ChatMessage.create(chatData);
  }

  /**
   * Handle rolling for an item (weapons)
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemRoll(event) {
    event.preventDefault();
    const li = $(event.currentTarget).parents(".item-entry");
    const item = this.actor.items.get(li.data("item-id"));
    
    if (item.type === "weapon") {
      // Roll attack
      const roll = new Roll("1d20");
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${item.name} Attack Roll`
      });
    }
  }

  /**
   * Handle changing item quantities
   * @param {Event} event   The originating change event
   * @private
   */
  _onQuantityChange(event) {
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
   * Handle toggling category visibility
   * @param {Event} event   The originating click event
   * @private
   */
  _onCategoryToggle(event) {
    event.preventDefault();
    const caret = event.currentTarget;
    const category = $(caret).closest('.item-category');
    const list = category.find('.item-list');
    
    list.slideToggle(200);
    $(caret).find('i').toggleClass('fa-caret-down fa-caret-right');
  }
}