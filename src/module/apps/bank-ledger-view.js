/**
 * @file Westford Bank — main ledger view. Read-only display of a player's own currency and
 * deposited treasure, with Deposit/Withdraw buttons opening the two transaction dialogs. All
 * mutation happens in those dialogs; this view just renders getLedger(actor) and re-renders
 * live when the actor's flags change (see the updateActor hook below).
 */
import { getLedger } from "../inventory/bank-ledger-orchestrator.js";
import { BankDepositDialog } from "./bank-deposit-dialog.js";
import { BankWithdrawDialog } from "./bank-withdraw-dialog.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class BankLedgerView extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ actor, ...options } = {}) {
    options.id ??= `osp-bank-ledger-view-${actor.id}`;
    super(options);
    this.actor = actor;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["osp", "osp-bank-ledger-view"],
    window: { title: "Westford Bank", resizable: true },
    position: { width: 420, height: 560 },
    actions: {
      deposit: BankLedgerView._onDeposit,
      withdraw: BankLedgerView._onWithdraw,
    },
  };

  /** @override */
  static PARTS = {
    app: { template: "systems/osp-houserules/templates/apps/bank-ledger-view.html" },
  };

  get title() {
    return `Westford Bank — ${this.actor.name}`;
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

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._updateActorHook = (actor) => { if (actor.id === this.actor.id) this.render(); };
    Hooks.on("updateActor", this._updateActorHook);
  }

  /** @override */
  async close(options) {
    if (this._updateActorHook) Hooks.off("updateActor", this._updateActorHook);
    return super.close(options);
  }

  /** @this {BankLedgerView} */
  static _onDeposit(_event, _target) {
    new BankDepositDialog({ actor: this.actor }).render(true);
  }

  /** @this {BankLedgerView} */
  static _onWithdraw(_event, _target) {
    new BankWithdrawDialog({ actor: this.actor }).render(true);
  }
}
