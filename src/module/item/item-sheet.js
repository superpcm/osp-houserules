import { TOOLTIP_DELAY_MS } from '../ui/tooltips.js';
import { ItemCardDialog } from '../cards/item-card-dialog.js';
import { VEHICLE_KINDS, VEHICLE_ATTACHMENT_KINDS } from '../inventory/vehicle-lashing.js';
import { vehicleMetadataUpdate } from '../inventory/vehicle-metadata-editor.js';
import { rollAbility } from '../actor/ability-roll.js';

let tooltipInstanceSequence = 0;

export class OspItemSheet extends foundry.appv1.sheets.ItemSheet {
  constructor(...args) {
    super(...args);
    this.handlers = new Map();
    this._tooltipNamespace = `.ospItemSheetTooltip${++tooltipInstanceSequence}`;
    this._tooltipTimers = new Set();
    this._sizeTooltip = null;
    this._equippedTooltip = null;
    this._tooltipTargets = new Set();
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "item"],
      width: 520,
      height: 480,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }],
      submitOnChange: true,
      closeOnSubmit: false,
    });
  }

  /** @override */
  async render(force, options = {}) {
    // For displayable items, show card instead of sheet
    const displayableTypes = ['item', 'weapon', 'armor', 'container', 'coin', 'clothing', 'ammunition', 'livestock'];
    if (displayableTypes.includes(this.item.type)) {
      // Show card dialog instead of traditional sheet
      const cardDialog = new ItemCardDialog(this.item);
      cardDialog.render(true);
      // Return this to satisfy the promise but don't actually render the sheet
      return this;
    }

    // For other types (abilities, spells, etc.), use traditional sheet
    return super.render(force, options);
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
    context.stockingAvailability = context.system.storeAvailability ?? '';
    context.blacksmithEligibleValue = context.system.blacksmithEligible == null ? '' : String(Boolean(context.system.blacksmithEligible));

    context.vehicleKindOptions = VEHICLE_KINDS.map(choice => ({ ...choice, selected: choice.id === context.system.vehicleKind }));
    context.vehicleAttachmentKindOptions = VEHICLE_ATTACHMENT_KINDS.map(choice => ({ ...choice, selected: choice.id === context.system.vehicleAttachmentKind }));
    context.canBeVehicle = this.item.type === 'container';
    context.isTenFootPole = this.item.name === 'Pole, Ten Foot';
    context.disassembledForTransport = this.item.flags?.['osp-houserules']?.disassembled === true;

    // Ensure img is available
    context.img = this.item.img;
    context.name = this.item.name;

    // Add GM status for conditional editing
    context.isGM = game.user.isGM;

    // Add configuration data (merge OSE/OSP config so templates can access saves_long etc.)
    context.config = foundry.utils.mergeObject(CONFIG.OSE ?? {}, {
      damageTypes: ["d4", "d6", "d8", "d10", "d12"],
      armorTypes: ["light", "medium", "heavy"],
      weaponTypes: ["melee", "missile", "both"]
    });

    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    this._cleanupTooltips(true);
    this._destroyHandlers();

    // Setup Size field tooltip to show storedSize
    this._setupSizeTooltip(html);

    // Setup Equipped checkbox tooltip
    this._setupEquippedTooltip(html);

    html.find('[data-roll-ability]').on('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        if (this.options.editable) await this._onSubmit(event);
        await rollAbility(this.item);
      } catch (error) {
        ui.notifications.error(error.message);
      } finally {
        button.disabled = false;
      }
    });

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Add or remove tags
    html.find(".tag-control").click(this._onTagControl.bind(this));
  }

  /**
   * Setup tooltip for Size field to show storedSize value
   */
  _setupSizeTooltip(html) {
    const sizeElement = html.find('.is-pos-size');
    if (!sizeElement || sizeElement.length === 0) return;

    const storedSize = this.item.system.storedSize;
    if (!storedSize) return;

    // Create tooltip element
    const tooltip = this._createTooltip('size');
    this._sizeTooltip = tooltip;
    this._tooltipTargets.add(sizeElement);
    const schedule = (callback, delay) => this._scheduleTooltip(callback, delay);

    // Attach events to the size select element
    sizeElement.off(this._tooltipNamespace).on(`mouseenter${this._tooltipNamespace}`, (e) => {
      this._clearTooltipTimers();
      schedule(() => {
        tooltip.textContent = `Stored Size: ${storedSize}`;

        const rect = e.currentTarget.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width / 2) + 'px';
        tooltip.style.top = (rect.top - 30) + 'px';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.opacity = '1';
      }, TOOLTIP_DELAY_MS);
    });

    sizeElement.on(`mouseleave${this._tooltipNamespace}`, () => {
      this._clearTooltipTimers();
      tooltip.style.opacity = '0';
    });
  }

  /**
   * Setup tooltip for Equipped checkbox
   */
  _setupEquippedTooltip(html) {
    const equippedWrapper = html.find('.is-pos-equipped-checkbox');
    if (!equippedWrapper || equippedWrapper.length === 0) return;

    // Create tooltip element
    const tooltip = this._createTooltip('equipped');
    this._equippedTooltip = tooltip;
    this._tooltipTargets.add(equippedWrapper);
    const schedule = (callback, delay) => this._scheduleTooltip(callback, delay);

    equippedWrapper.off(this._tooltipNamespace).on(`mouseenter${this._tooltipNamespace}`, (e) => {
      this._clearTooltipTimers();
      schedule(() => {
        tooltip.textContent = 'Equip/Unequip';

        const rect = e.currentTarget.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width / 2) + 'px';
        tooltip.style.top = (rect.top - 30) + 'px';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.opacity = '1';
      }, TOOLTIP_DELAY_MS);
    });

    equippedWrapper.on(`mouseleave${this._tooltipNamespace}`, () => {
      this._clearTooltipTimers();
      tooltip.style.opacity = '0';
    });
  }

  _createTooltip(kind) {
    const tooltip = document.createElement('div');
    tooltip.className = `cs-tooltip item-sheet-${kind}-tooltip`;
    tooltip.style.cssText = `
      position: absolute;
      background: #333;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.4;
      z-index: 10000;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      white-space: nowrap;
    `;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  _scheduleTooltip(callback, delay) {
    const timer = setTimeout(() => {
      this._tooltipTimers.delete(timer);
      if (!this._tooltipTimers || this._destroyed) return;
      callback();
    }, delay);
    this._tooltipTimers.add(timer);
    return timer;
  }

  _clearTooltipTimers() {
    for (const timer of this._tooltipTimers) clearTimeout(timer);
    this._tooltipTimers.clear();
  }

  _cleanupTooltips(reset = false) {
    if (reset) this._destroyed = false;
    this._clearTooltipTimers();
    for (const target of this._tooltipTargets) target.off(this._tooltipNamespace);
    this._tooltipTargets.clear();
    for (const tooltip of [this._sizeTooltip, this._equippedTooltip]) {
      if (tooltip?.parentNode) tooltip.parentNode.removeChild(tooltip);
    }
    this._sizeTooltip = null;
    this._equippedTooltip = null;
  }

  async close(options = {}) {
    this._destroyed = true;
    this._cleanupTooltips();
    this._destroyHandlers();
    return super.close(options);
  }

  _destroyHandlers() {
    for (const handler of this.handlers.values()) {
      if (handler && typeof handler.destroy === 'function') handler.destroy();
    }
    this.handlers.clear();
  }

  /** @override */
  async _updateObject(event, formData) {
    // Ensure name is never empty or undefined
    if (!formData.name || formData.name.trim() === "") {
      formData.name = this.item.name || "Unnamed Item";
    }
    if (Object.hasOwn(formData, 'system.storeAvailability') && formData['system.storeAvailability'] === '') formData['system.storeAvailability'] = null;
    if (Object.hasOwn(formData, 'system.blacksmithEligible')) {
      const value = formData['system.blacksmithEligible'];
      formData['system.blacksmithEligible'] = value === '' ? null : value === true || value === 'true';
    }

    const fittingValues = {};
    for (const field of ['vehicleKind', 'vehicleAttachmentKind']) {
      const key = `system.${field}`;
      if (!Object.hasOwn(formData, key)) continue;
      if (game.user?.isGM) fittingValues[field] = formData[key];
      delete formData[key];
    }
    Object.assign(formData, vehicleMetadataUpdate(this.item, fittingValues));
    return super._updateObject(event, formData);
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
