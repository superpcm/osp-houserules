/**
 * @file Westford Bank — DM manual edit dialog for a single player's ledger. Not drag-and-drop
 * (the DM isn't limited to dragging from that specific player's inventory as a source): a
 * manual "set absolute currency value" form (mirrors DmToolkitTab's _onSetXP/_onSetMaxHP
 * prefill-then-overwrite idiom), an "Add Item" mini-form for entries with no backing catalog
 * item, and a per-entry remove-quantity control. All three go through the same orchestrator
 * functions as player-initiated deposits/withdrawals (dmEditCurrency/dmAddItem/dmRemoveItem),
 * tagged action:'dm_edit' in the audit log.
 */
import { getLedger, dmEditCurrency, dmAddItem, dmRemoveItem } from "../inventory/bank-ledger-orchestrator.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class BankDmEditDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ actor, ...options } = {}) {
    options.id ??= `osp-bank-dm-edit-dialog-${actor.id}`;
    super(options);
    this.actor = actor;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["osp", "osp-bank-dm-edit-dialog"],
    window: { title: "Manage Ledger", resizable: true },
    position: { width: 420, height: "auto" },
    actions: {
      setCurrency: BankDmEditDialog._onSetCurrency,
      addItem: BankDmEditDialog._onAddItem,
      removeItem: BankDmEditDialog._onRemoveItem,
    },
  };

  /** @override */
  static PARTS = {
    app: { template: "systems/osp-houserules/templates/apps/bank-dm-edit-dialog.html" },
  };

  get title() {
    return `Manage Ledger — ${this.actor.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const ledger = getLedger(this.actor);
    context.currency = ledger.currency;
    context.items = ledger.items;
    context.hasItems = ledger.items.length > 0;
    return context;
  }

  /** @this {BankDmEditDialog} */
  static async _onSetCurrency(_event, target) {
    const denomination = target.dataset.denomination;
    const row = target.closest(`[data-denomination="${denomination}"]`);
    const value = parseInt(row?.querySelector('.osp-bank-dm-currency-input')?.value);
    if (isNaN(value) || value < 0) { ui.notifications.warn("Enter a valid non-negative amount."); return; }

    try {
      const plan = await dmEditCurrency(this.actor, denomination, value);
      if (!plan.success) { ui.notifications.error(plan.reason); return; }
      ui.notifications.info(`Set ${this.actor.name}'s banked ${denomination} to ${value}.`);
    } catch (err) {
      console.error('[Westford Bank] DM currency edit failed unexpectedly', err);
      ui.notifications.error("Edit failed unexpectedly — nothing was changed. Check the console for details.");
    } finally {
      this.render();
    }
  }

  /** @this {BankDmEditDialog} */
  static async _onAddItem(_event, _target) {
    const name = this.element.querySelector('#osp-bank-dm-add-name')?.value.trim();
    const quantity = parseInt(this.element.querySelector('#osp-bank-dm-add-qty')?.value) || 0;
    const unique = this.element.querySelector('#osp-bank-dm-add-unique')?.checked ?? false;
    if (!name) { ui.notifications.warn("Enter an item name."); return; }
    if (quantity < 1) { ui.notifications.warn("Quantity must be at least 1."); return; }

    try {
      const plan = await dmAddItem(this.actor, { name, quantity, unique });
      if (!plan.success) { ui.notifications.error(plan.reason); return; }
      ui.notifications.info(`Added ${quantity}× ${name} to ${this.actor.name}'s ledger.`);
    } catch (err) {
      console.error('[Westford Bank] DM add item failed unexpectedly', err);
      ui.notifications.error("Add item failed unexpectedly — nothing was changed. Check the console for details.");
    } finally {
      this.render();
    }
  }

  /** @this {BankDmEditDialog} */
  static async _onRemoveItem(_event, target) {
    const entryId = target.dataset.entryId;
    const row = target.closest('[data-entry-id]');
    const quantity = parseInt(row?.querySelector('.osp-bank-dm-remove-qty')?.value) || 0;
    if (quantity < 1) { ui.notifications.warn("Quantity must be at least 1."); return; }

    try {
      const plan = await dmRemoveItem(this.actor, entryId, quantity);
      if (!plan.success) { ui.notifications.error(plan.reason); return; }
      ui.notifications.info(`Removed ${quantity}× from ${this.actor.name}'s ledger.`);
    } catch (err) {
      console.error('[Westford Bank] DM remove item failed unexpectedly', err);
      ui.notifications.error("Remove item failed unexpectedly — nothing was changed. Check the console for details.");
    } finally {
      this.render();
    }
  }
}
