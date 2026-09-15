import { QuantityDialog } from "../dialog/quantity-dialog.js";
import { getUsedCapacity } from "../inventory/container-capacity.js";
import { getPersonalStorehouse, getPartyStorehouse, withdrawStorehouse } from "../inventory/storehouse.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class StorehouseWithdrawDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ actor, shared = false, ...options } = {}) { options.id ??= `osp-storehouse-withdraw-${actor.id}-${shared ? "party" : "personal"}`; super(options); this.actor = actor; this.shared = shared; }
  static DEFAULT_OPTIONS = { classes: ["osp", "osp-storehouse-withdraw"], window: { title: "Retrieve Stored Goods", resizable: true }, position: { width: 600, height: 540 } };
  static PARTS = { app: { template: "systems/osp-houserules/templates/apps/storehouse-withdraw.html" } };
  get title() { return `Retrieve from ${this.shared ? "Party Stores" : "Personal Locker"} — ${this.actor.name}`; }
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const store = this.shared ? getPartyStorehouse() : getPersonalStorehouse(this.actor);
    context.items = store.items; context.hasItems = store.items.length > 0;
    context.containers = this.actor.items.filter((item) => item.type === "container").map((container) => ({ id: container.id, name: container.name, used: Math.round(getUsedCapacity(container, this.actor.items) * 100) / 100, max: container.system.capacity || 0 }));
    context.hasContainers = context.containers.length > 0;
    return context;
  }
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelectorAll("[data-entry-id]").forEach((row) => row.addEventListener("dragstart", (event) => { event.dataTransfer.setData("text/plain", JSON.stringify({ osp: "storehouse", entryId: row.dataset.entryId })); }));
    this.element.querySelectorAll("[data-container-id]").forEach((target) => {
      target.addEventListener("dragover", (event) => { event.preventDefault(); target.classList.add("is-valid"); });
      target.addEventListener("dragleave", () => target.classList.remove("is-valid"));
      target.addEventListener("drop", async (event) => {
        event.preventDefault(); target.classList.remove("is-valid");
        let payload; try { payload = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; }
        if (payload?.osp !== "storehouse") return;
        const store = this.shared ? getPartyStorehouse() : getPersonalStorehouse(this.actor);
        const entry = store.items.find((item) => item.entryId === payload.entryId); if (!entry) return;
        const quantity = entry.quantity === 1 ? 1 : await QuantityDialog.prompt({ title: `Retrieve ${entry.name}`, label: `How many ${entry.name} should be retrieved? (max ${entry.quantity})`, max: entry.quantity });
        if (quantity === null) return;
        const result = await withdrawStorehouse(this.actor, entry.entryId, quantity, target.dataset.containerId, this.shared);
        if (!result.success) ui.notifications.error(result.reason); else ui.notifications.info(`Placed ${quantity}× ${entry.name} into ${target.dataset.containerName}.`);
        this.render();
      });
    });
  }
}
