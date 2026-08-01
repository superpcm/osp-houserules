/**
 * @file Westford Bank — Deposit dialog. Left pane lists the player's own coin stacks and
 * treasure-eligible items (system.treasure === true), grouped by the container they're
 * currently stored in, as drag sources using the standard Foundry item drag payload
 * (item.toDragData()) since these are real embedded items. Right pane is a drop zone showing
 * the current ledger. Non-owned, non-coin, non-treasure drops are rejected with a warning
 * toast and no dialog, per spec.
 */
import { getLedger, depositItem, depositCurrency } from "../inventory/bank-ledger-orchestrator.js";
import { QuantityDialog } from "../dialog/quantity-dialog.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const COIN_NAME_TO_DENOMINATION = { 'Gold Coins': 'gold', 'Silver Coins': 'silver', 'Copper Coins': 'copper' };

export class BankDepositDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ actor, ...options } = {}) {
    options.id ??= `osp-bank-deposit-dialog-${actor.id}`;
    super(options);
    this.actor = actor;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["osp", "osp-bank-deposit-dialog"],
    window: { title: "Deposit into Westford Bank", resizable: true },
    position: { width: 560, height: 520 },
  };

  /** @override */
  static PARTS = {
    app: { template: "systems/osp-houserules/templates/apps/bank-deposit-dialog.html" },
  };

  get title() {
    return `Deposit into Westford Bank — ${this.actor.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;

    const coinItems = actor.items.filter((i) => i.type === 'coin' && (i.system.quantity || 0) > 0);
    const treasureItems = actor.items.filter((i) => i.type === 'item' && i.system.treasure === true && (i.system.quantity || 0) > 0);

    const mapRow = (i) => ({ itemId: i.id, name: i.name, img: i.img, quantity: i.system.quantity || 1 });

    const containerIds = [...new Set([...coinItems, ...treasureItems].map((i) => i.system.containerId).filter(Boolean))];
    context.groups = containerIds.map((containerId) => {
      const container = actor.items.get(containerId);
      return {
        containerName: container?.name ?? 'Unknown Container',
        coins: coinItems.filter((i) => i.system.containerId === containerId).map(mapRow),
        treasures: treasureItems.filter((i) => i.system.containerId === containerId).map(mapRow),
      };
    });
    context.looseTreasures = treasureItems.filter((i) => !i.system.containerId).map(mapRow);
    context.hasSources = context.groups.length > 0 || context.looseTreasures.length > 0;

    const ledger = getLedger(actor);
    context.currency = ledger.currency;
    context.items = ledger.items;
    context.hasItems = ledger.items.length > 0;
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;

    root.querySelectorAll('.osp-bank-drag-source[data-item-id]').forEach((el) => {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (event) => {
        const item = this.actor.items.get(el.dataset.itemId);
        if (!item) return;
        event.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
        event.dataTransfer.effectAllowed = 'copy';
      });
    });

    const dropZone = root.querySelector('.osp-bank-drop-zone');
    if (!dropZone) return;
    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.classList.add('osp-bank-drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('osp-bank-drag-over'));
    dropZone.addEventListener('drop', async (event) => {
      event.preventDefault();
      dropZone.classList.remove('osp-bank-drag-over');
      await this._handleDrop(event);
    });
  }

  async _handleDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if (data?.type !== 'Item') return;

    const item = await Item.implementation.fromDropData(data);
    if (!item || item.actor?.id !== this.actor.id) {
      ui.notifications.warn("You can only deposit items from your own inventory.");
      return;
    }

    if (item.type === 'coin') return this._handleCoinDeposit(item);

    if (item.type !== 'item' || item.system.treasure !== true) {
      ui.notifications.warn(`${item.name} is not treasure and cannot be deposited.`);
      return;
    }
    return this._handleItemDeposit(item);
  }

  async _handleItemDeposit(item) {
    const available = item.system.quantity || 1;
    const chosen = available === 1
      ? 1
      : await QuantityDialog.prompt({ title: `Deposit ${item.name}`, label: `How many of ${item.name} to deposit? (max ${available})`, max: available });
    if (chosen === null) return;

    try {
      const plan = await depositItem(this.actor, item, chosen);
      if (!plan.success) { ui.notifications.error(plan.reason); return; }
      ui.notifications.info(`Deposited ${chosen}× ${item.name} into Westford Bank.`);
    } catch (err) {
      console.error('[Westford Bank] item deposit failed unexpectedly', err);
      ui.notifications.error("Deposit failed unexpectedly — nothing was changed. Check the console for details.");
    } finally {
      this.render();
    }
  }

  async _handleCoinDeposit(item) {
    const denomination = COIN_NAME_TO_DENOMINATION[item.name];
    if (!denomination) {
      ui.notifications.warn(`${item.name} isn't a recognized coin denomination.`);
      return;
    }
    const available = item.system.quantity || 1;
    const chosen = available === 1
      ? 1
      : await QuantityDialog.prompt({ title: `Deposit ${item.name}`, label: `How many ${item.name} to deposit? (max ${available})`, max: available });
    if (chosen === null) return;

    try {
      const plan = await depositCurrency(this.actor, denomination, chosen, item);
      if (!plan.success) { ui.notifications.error(plan.reason); return; }
      ui.notifications.info(`Deposited ${chosen} ${item.name} into Westford Bank.`);
    } catch (err) {
      console.error('[Westford Bank] currency deposit failed unexpectedly', err);
      ui.notifications.error("Deposit failed unexpectedly — nothing was changed. Check the console for details.");
    } finally {
      this.render();
    }
  }
}
