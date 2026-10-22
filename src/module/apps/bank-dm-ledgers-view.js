/**
 * @file Westford Bank — DM Ledgers view. Lists every player character's ledger (currency,
 * items, audit log), live-updating as players transact. GM-only by construction: the only way
 * to reach this view is the already-gmOnly DM's Toolkit sidebar tab, so no additional
 * game.user.isGM guard is needed here. Each player's card links to BankDmEditDialog for manual
 * currency/item edits, and exposes a chronological, actor-filterable audit log.
 */
import { getLedger } from "../inventory/bank-ledger-orchestrator.js";
import { BankDmEditDialog } from "./bank-dm-edit-dialog.js";
import { getPartyTreasury } from "../inventory/party-treasury.js";
import { listInventoryOperations, recoverInventoryOperation, RECEIPTS_SETTING } from "../inventory/inventory-authority.js";
import { listPendingTransactions, recoverTransaction } from "../inventory/transaction-journal.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class BankDmLedgersView extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "osp-bank-dm-ledgers-view",
    classes: ["osp", "osp-bank-dm-ledgers-view"],
    window: { title: "Westford Bank Ledgers", resizable: true },
    position: { width: 640, height: 700 },
    actions: {
      manageLedger: BankDmLedgersView._onManageLedger,
      recoverTransaction: BankDmLedgersView._onRecoverTransaction,
      recoverOperation: BankDmLedgersView._onRecoverOperation,
    },
  };

  /** @override */
  static PARTS = {
    app: { template: "systems/osp-houserules/templates/apps/bank-dm-ledgers-view.html" },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const pcs = game.actors.filter((a) => a.type === "character").sort((a, b) => a.name.localeCompare(b.name));

    const personalLedgers = pcs.map((actor) => {
      const ledger = getLedger(actor);
      const log = [...ledger.log]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((entry) => ({ ...entry, timeLabel: new Date(entry.timestamp).toLocaleString() }));
      return {
        actorId: actor.id,
        actorName: actor.name,
        actorImg: actor.img,
        currency: ledger.currency,
        items: ledger.items,
        hasItems: ledger.items.length > 0,
        log,
        hasLog: log.length > 0,
      };
    });
    const partyLedger = getPartyTreasury();
    const partyLog = [...partyLedger.log].sort((a, b) => a.timestamp - b.timestamp).map((entry) => ({
      ...entry,
      timeLabel: new Date(entry.timestamp).toLocaleString(),
      actorLabel: entry.characterName ?? (entry.actor === "dm" ? "DM" : "Player"),
    }));
    context.ledgers = [{
      actorId: "party-treasury",
      actorName: "Party Treasury",
      actorImg: "icons/environment/settlement/temple-columned.webp",
      isParty: true,
      currency: partyLedger.currency,
      items: partyLedger.items,
      hasItems: partyLedger.items.length > 0,
      log: partyLog,
      hasLog: partyLog.length > 0,
    }, ...personalLedgers];
    context.hasLedgers = context.ledgers.length > 0;
    const pending = game.user?.isGM ? listPendingTransactions() : [];
    context.pendingRecoveries = pending.map(({ actorId, actorUuid, actorName, record }) => ({
      actorId,
      actorUuid,
      actorName,
      label: record.label ?? "Inventory transfer",
      createdAt: record.createdAt,
      timeLabel: record.createdAt ? new Date(record.createdAt).toLocaleString() : "Unknown time",
      operationId: record.id,
      detailsJson: JSON.stringify(record.changes ?? [], null, 2),
    }));
    context.pendingOperations = game.user?.isGM ? listInventoryOperations().map(receipt => ({ ...receipt, detailsJson: JSON.stringify(receipt.transaction?.changes ?? [], null, 2) })) : [];
    context.hasPendingOperations = context.pendingOperations.length > 0;
    context.hasPendingRecoveries = context.pendingRecoveries.length > 0;
    return context;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._updateActorHook = (actor) => { if (actor.type === "character") this.render(); };
    Hooks.on("updateActor", this._updateActorHook);
    this._updateSettingHook = (setting) => { if ([`${game.system.id}.partyTreasury`, `${game.system.id}.${RECEIPTS_SETTING}`].includes(setting.key)) this.render(); };
    Hooks.on("updateSetting", this._updateSettingHook);
  }

  /** @override */
  async close(options) {
    if (this._updateActorHook) Hooks.off("updateActor", this._updateActorHook);
    if (this._updateSettingHook) Hooks.off("updateSetting", this._updateSettingHook);
    return super.close(options);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelectorAll('.osp-bank-log-filter').forEach((select) => {
      select.addEventListener('change', () => {
        const scope = select.dataset.filterTarget;
        const value = select.value;
        this.element.querySelectorAll(`.osp-bank-log-row[data-ledger-actor="${scope}"]`).forEach((row) => {
          row.style.display = (value === 'all' || row.dataset.logActor === value) ? '' : 'none';
        });
      });
    });
  }

  /** @this {BankDmLedgersView} */
  static _onManageLedger(_event, target) {
    const actorId = target.closest('[data-actor-id]')?.dataset.actorId;
    if (actorId === "party-treasury") {
      new BankDmEditDialog({ party: true }).render({ force: true });
      return;
    }
    const actor = game.actors.get(actorId);
    if (!actor) return;
    new BankDmEditDialog({ actor }).render({ force: true });
  }

  static async _onRecoverOperation(_event, target) {
    const result = await recoverInventoryOperation(target.dataset.operationId);
    ui.notifications?.[result.success ? "info" : "error"]?.(result.reason ?? `Recovery ${result.outcome ?? "completed"}.`);
    await this.render();
  }

  /** @this {BankDmLedgersView} */
  static async _onRecoverTransaction(_event, target) {
    if (!game.user?.isGM) {
      ui.notifications?.error?.("Only the GM can recover pending inventory transfers.");
      return;
    }
    const row = target.closest('[data-actor-id]');
    const actorId = row?.dataset.actorId;
    const actorUuid = row?.dataset.actorUuid;
    let actor;
    try { actor = actorUuid ? await fromUuid(actorUuid) : game.actors.get(actorId); }
    catch (_error) { actor = null; }
    if (!actor) {
      ui.notifications?.error?.("The character for this pending transfer could not be found.");
      return;
    }
    const result = await recoverTransaction(actor);
    if (result.success && result.outcome === "committed") {
      ui.notifications?.info?.("Pending transfer confirmed as committed.");
    } else if (result.success && result.outcome === "restored") {
      ui.notifications?.info?.("Pending transfer was restored to its original state.");
    } else if (result.success) {
      ui.notifications?.info?.(result.reason ?? "No pending transfer remains.");
    } else {
      ui.notifications?.error?.(result.reason ?? "Recovery is still pending; manual reconciliation is required.");
    }
    await this.render();
  }
}
