/**
 * @file Westford Bank — DM Ledgers view. Lists every player character's ledger (currency,
 * items, audit log), live-updating as players transact. GM-only by construction: the only way
 * to reach this view is the already-gmOnly DM's Toolkit sidebar tab, so no additional
 * game.user.isGM guard is needed here. Each player's card links to BankDmEditDialog for manual
 * currency/item edits, and exposes a chronological, actor-filterable audit log.
 */
import { getLedger } from "../inventory/bank-ledger-orchestrator.js";
import { BankDmEditDialog } from "./bank-dm-edit-dialog.js";

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

    context.ledgers = pcs.map((actor) => {
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
    context.hasLedgers = context.ledgers.length > 0;
    return context;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._updateActorHook = (actor) => { if (actor.type === "character") this.render(); };
    Hooks.on("updateActor", this._updateActorHook);
  }

  /** @override */
  async close(options) {
    if (this._updateActorHook) Hooks.off("updateActor", this._updateActorHook);
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
    const actor = game.actors.get(actorId);
    if (!actor) return;
    new BankDmEditDialog({ actor }).render(true);
  }
}
