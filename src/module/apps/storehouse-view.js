import { externalDrag } from "../external-drag-tracker.js";
import { QuantityDialog } from "../dialog/quantity-dialog.js";
import { getPersonalStorehouse, getPartyStorehouse, isStorehouseEligible, depositStorehouse, depositCatalogStorehouse } from "../inventory/storehouse.js";
import { StorehouseWithdrawDialog } from "./storehouse-withdraw-dialog.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const CATEGORY = { weapon: "Weapons & Armor", armor: "Weapons & Armor", ammunition: "Supplies", clothing: "Tools & Gear", item: "Tools & Gear" };

export class StorehouseView extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ actor, ...options } = {}) {
    options.id ??= `osp-storehouse-view-${actor.id}`;
    super(options);
    this.actor = actor;
    this.shared = false;
    this.filter = "all";
  }

  static DEFAULT_OPTIONS = {
    classes: ["osp", "osp-storehouse-view"],
    window: { title: "Westford Storehouse", resizable: true },
    position: { width: 560, height: 650 },
    actions: { selectStore: StorehouseView._selectStore, setFilter: StorehouseView._setFilter, withdraw: StorehouseView._withdraw },
  };
  static PARTS = { app: { template: "systems/osp-houserules/templates/apps/storehouse-view.html" } };
  get title() { return `Westford Storehouse — ${this.actor.name}`; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const store = this.shared ? getPartyStorehouse() : getPersonalStorehouse(this.actor);
    context.shared = this.shared;
    context.storeTitle = this.shared ? "Party Stores" : `${this.actor.name}’s Locker`;
    const items = store.items.map((entry) => {
      const unitWeight = Number(entry.itemData.system?.unitWeight) || 0;
      return { ...entry, category: CATEGORY[entry.type] ?? "Other", totalWeight: Math.round(unitWeight * entry.quantity * 100) / 100 };
    });
    context.categories = ["all", "Weapons & Armor", "Supplies", "Tools & Gear", "Other"].map((value) => ({ value, label: value === "all" ? "All" : value, active: this.filter === value }));
    context.items = this.filter === "all" ? items : items.filter((entry) => entry.category === this.filter);
    context.hasItems = context.items.length > 0;
    context.totalCount = store.items.reduce((sum, entry) => sum + entry.quantity, 0);
    return context;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._actorHook = (actor) => { if (actor.id === this.actor.id && !this.shared) this.render(); };
    this._settingHook = (setting) => { if (setting.key === `${game.system.id}.partyStorehouse` && this.shared) this.render(); };
    Hooks.on("updateActor", this._actorHook); Hooks.on("updateSetting", this._settingHook);
  }
  async close(options) { Hooks.off("updateActor", this._actorHook); Hooks.off("updateSetting", this._settingHook); return super.close(options); }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const zone = this.element.querySelector("[data-storehouse-drop]");
    if (!zone) return;
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      const item = externalDrag.item;
      const owned = item?.actor?.id === this.actor.id;
      const catalog = game.user.isGM && item && !item.actor;
      const valid = (owned || catalog) && isStorehouseEligible(item);
      zone.classList.toggle("is-valid", valid); zone.classList.toggle("is-invalid", !valid);
      event.dataTransfer.dropEffect = valid ? "move" : "none";
    });
    zone.addEventListener("dragleave", (event) => { if (!zone.contains(event.relatedTarget)) zone.classList.remove("is-valid", "is-invalid"); });
    zone.addEventListener("drop", async (event) => {
      event.preventDefault(); zone.classList.remove("is-valid", "is-invalid");
      const item = externalDrag.item;
      const catalog = game.user.isGM && item && !item.actor;
      if (!item || (!catalog && item.actor?.id !== this.actor.id) || !isStorehouseEligible(item)) { ui.notifications.warn("Store non-treasure equipment from this character’s Gear sheet here, or drag it from Items as the GM."); return; }
      const unique = (item.system.tags ?? []).includes("unique");
      const available = item.system.quantity || 1;
      const quantity = catalog && !unique
        ? await QuantityDialog.prompt({ title: `Store ${item.name}`, label: `How many ${item.name} should be added?`, max: 1000000, initial: available })
        : available === 1 || unique ? 1 : await QuantityDialog.prompt({ title: `Store ${item.name}`, label: `How many ${item.name} should be stored? (max ${available})`, max: available });
      if (quantity === null) return;
      const result = catalog
        ? await depositCatalogStorehouse(this.actor, item, quantity, this.shared)
        : await depositStorehouse(this.actor, item.id, quantity, this.shared);
      if (!result.success) ui.notifications.error(result.reason); else ui.notifications.info(`Stored ${quantity}× ${item.name} in ${this.shared ? "Party Stores" : "your locker"}.`);
      this.render();
    });
  }

  static _selectStore(_event, target) { this.shared = target.dataset.store === "party"; this.filter = "all"; this.render({ force: true }); }
  static _setFilter(_event, target) { this.filter = target.dataset.filter; this.render({ force: true }); }
  static _withdraw() { new StorehouseWithdrawDialog({ actor: this.actor, shared: this.shared }).render({ force: true }); }
}
