/**
 * @file Westford Bank — Withdraw dialog. Left pane lists the ledger's currency and item stacks
 * as drag sources; right pane lists the player's own containers as drop targets. Ledger rows
 * aren't real Foundry documents, so drags here use a small custom JSON payload
 * ({osp:'bank-currency', denomination} / {osp:'bank-item', entryId}) read back directly from
 * dataTransfer, rather than TextEditor.getDragEventData (which assumes a real document type).
 * On drop, checkWithdrawTarget (via withdrawItem/withdrawCurrency) runs before anything is
 * mutated — on failure nothing changes and a reasonType-specific error toast fires ("snap back"
 * without a literal drag-node animation, since this is data-driven re-render UI).
 */
import { getLedger, withdrawItem, withdrawCurrency } from "../inventory/bank-ledger-orchestrator.js";
import { getUsedCapacity } from "../inventory/container-capacity.js";
import { QuantityDialog } from "../dialog/quantity-dialog.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class BankWithdrawDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ actor, ...options } = {}) {
    options.id ??= `osp-bank-withdraw-dialog-${actor.id}`;
    super(options);
    this.actor = actor;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["osp", "osp-bank-withdraw-dialog"],
    window: { title: "Withdraw from Westford Bank", resizable: true },
    position: { width: 560, height: 520 },
  };

  /** @override */
  static PARTS = {
    app: { template: "systems/osp-houserules/templates/apps/bank-withdraw-dialog.html" },
  };

  get title() {
    return `Withdraw from Westford Bank — ${this.actor.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const ledger = getLedger(actor);

    context.currency = [
      { denomination: 'gold', label: 'Gold', quantity: ledger.currency.gold },
      { denomination: 'silver', label: 'Silver', quantity: ledger.currency.silver },
      { denomination: 'copper', label: 'Copper', quantity: ledger.currency.copper },
    ].filter((c) => c.quantity > 0);
    context.items = ledger.items;
    context.hasSources = context.currency.length > 0 || ledger.items.length > 0;

    context.containers = actor.items
      .filter((i) => i.type === 'container')
      .map((c) => {
        const used = Math.round(getUsedCapacity(c, actor.items) * 100) / 100;
        const max = c.system?.capacity || 0;
        return { itemId: c.id, name: c.name, used, max };
      });
    context.hasContainers = context.containers.length > 0;
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;

    root.querySelectorAll('.osp-bank-drag-source[data-denomination]').forEach((el) => {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', JSON.stringify({ osp: 'bank-currency', denomination: el.dataset.denomination }));
        event.dataTransfer.effectAllowed = 'copy';
      });
    });

    root.querySelectorAll('.osp-bank-drag-source[data-entry-id]').forEach((el) => {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', JSON.stringify({ osp: 'bank-item', entryId: el.dataset.entryId }));
        event.dataTransfer.effectAllowed = 'copy';
      });
    });

    root.querySelectorAll('.osp-bank-drop-target[data-item-id]').forEach((el) => {
      el.addEventListener('dragover', (event) => {
        event.preventDefault();
        el.classList.add('osp-bank-drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('osp-bank-drag-over'));
      el.addEventListener('drop', async (event) => {
        event.preventDefault();
        el.classList.remove('osp-bank-drag-over');
        await this._handleDrop(event, el.dataset.itemId);
      });
    });
  }

  async _handleDrop(event, targetContainerId) {
    let payload;
    try {
      payload = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }
    if (!payload?.osp) return; // not a Bank drag payload — ignore silently

    const targetContainer = this.actor.items.get(targetContainerId);
    if (!targetContainer) return;

    if (payload.osp === 'bank-currency') return this._handleCurrencyWithdraw(payload.denomination, targetContainer);
    if (payload.osp === 'bank-item') return this._handleItemWithdraw(payload.entryId, targetContainer);
  }

  async _handleCurrencyWithdraw(denomination, targetContainer) {
    const ledger = getLedger(this.actor);
    const available = ledger.currency[denomination] || 0;
    if (available <= 0) return;

    const chosen = available === 1
      ? 1
      : await QuantityDialog.prompt({ title: `Withdraw ${denomination} coins`, label: `How many ${denomination} to withdraw? (max ${available})`, max: available });
    if (chosen === null) return;

    try {
      const plan = await withdrawCurrency(this.actor, denomination, chosen, targetContainer);
      if (!plan.success) { ui.notifications.error(plan.reason); return; }
      ui.notifications.info(`Withdrew ${chosen} ${denomination} coins into ${targetContainer.name}.`);
    } catch (err) {
      console.error('[Westford Bank] currency withdrawal failed unexpectedly', err);
      ui.notifications.error("Withdrawal failed unexpectedly — nothing was changed. Check the console for details.");
    } finally {
      this.render();
    }
  }

  async _handleItemWithdraw(entryId, targetContainer) {
    const ledger = getLedger(this.actor);
    const entry = ledger.items.find((e) => e.entryId === entryId);
    if (!entry) return;

    const chosen = entry.quantity === 1
      ? 1
      : await QuantityDialog.prompt({ title: `Withdraw ${entry.name}`, label: `How many ${entry.name} to withdraw? (max ${entry.quantity})`, max: entry.quantity });
    if (chosen === null) return;

    try {
      const plan = await withdrawItem(this.actor, entryId, chosen, targetContainer);
      if (!plan.success) { ui.notifications.error(plan.reason); return; }
      ui.notifications.info(`Withdrew ${chosen}× ${entry.name} into ${targetContainer.name}.`);
    } catch (err) {
      console.error('[Westford Bank] item withdrawal failed unexpectedly', err);
      ui.notifications.error("Withdrawal failed unexpectedly — nothing was changed. Check the console for details.");
    } finally {
      this.render();
    }
  }
}
