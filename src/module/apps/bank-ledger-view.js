/**
 * @file Westford Bank — main ledger view. Read-only display of a player's own currency and
 * deposited treasure. Its vault panel accepts owned coin and treasure item drops, while the
 * Withdraw button opens the withdrawal dialog. The view re-renders live when the actor's flags
 * change (see the updateActor hook below).
 */
import { getLedger, depositItem, depositCurrency, dmDepositCatalogItem } from "../inventory/bank-ledger-orchestrator.js";
import { BankWithdrawDialog } from "./bank-withdraw-dialog.js";
import { QuantityDialog } from "../dialog/quantity-dialog.js";
import { externalDrag } from "../external-drag-tracker.js";
import { getBankDepositCandidate } from "../inventory/bank-deposit-candidate.js";
import { presentLedgerItem } from "../inventory/bank-ledger-display.js";
import { getPartyTreasury, requestPartyTreasury } from "../inventory/party-treasury.js";
import { TreasureValueDialog } from "../dialog/treasure-value-dialog.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class BankLedgerView extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ actor, ...options } = {}) {
    options.id ??= `osp-bank-ledger-view-${actor.id}`;
    super(options);
    this.actor = actor;
    this.vaultOpen = false;
    this.account = "personal";
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["osp", "osp-bank-ledger-view"],
    window: { title: "Westford Bank", resizable: true },
    position: { width: 520, height: 610 },
    actions: {
      toggleVault: BankLedgerView._onToggleVault,
      withdraw: BankLedgerView._onWithdraw,
      selectAccount: BankLedgerView._onSelectAccount,
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
    const ledger = this.account === "party" ? getPartyTreasury() : getLedger(this.actor);
    context.currency = ledger.currency;
    context.isParty = this.account === "party";
    context.ledgerTitle = context.isParty ? "Party Treasury" : `${this.actor.name}’s Ledger`;
    context.items = ledger.items.map(presentLedgerItem);
    context.hasItems = ledger.items.length > 0;
    const itemCount = ledger.items.reduce((total, entry) => total + entry.quantity, 0);
    context.itemCountLabel = `${itemCount} ${itemCount === 1 ? "valuable" : "valuables"} secured`;
    context.vaultOpen = this.vaultOpen;
    return context;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._updateActorHook = (actor) => { if (actor.id === this.actor.id) this.render(); };
    Hooks.on("updateActor", this._updateActorHook);
    this._updateSettingHook = (setting) => {
      if (setting.key === `${game.system.id}.partyTreasury` && this.account === "party") this.render();
    };
    Hooks.on("updateSetting", this._updateSettingHook);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const vault = this.element.querySelector("[data-bank-vault-drop-zone]");
    if (!vault) return;

    vault.addEventListener("dragover", (event) => {
      event.preventDefault();
      const drop = this._getDropCandidate(event);
      this._setVaultDropState(vault, drop.valid ? "valid" : "invalid");
      event.dataTransfer.dropEffect = drop.valid ? "move" : "none";
    });
    vault.addEventListener("dragleave", (event) => {
      if (!vault.contains(event.relatedTarget)) this._setVaultDropState(vault);
    });
    vault.addEventListener("drop", async (event) => {
      event.preventDefault();
      this._setVaultDropState(vault);
      await this._handleVaultDrop(event);
    });

    this.element.querySelectorAll("[data-bank-transfer-source]").forEach((source) => {
      source.addEventListener("dragstart", (event) => {
        const payload = source.dataset.denomination
          ? { osp: "bank-transfer", payloadType: "currency", denomination: source.dataset.denomination, sourceAccount: this.account }
          : { osp: "bank-transfer", payloadType: "item", entryId: source.dataset.entryId, sourceAccount: this.account };
        this._transferDragPayload = payload;
        event.dataTransfer.setData("text/plain", JSON.stringify(payload));
        event.dataTransfer.effectAllowed = "move";
      });
      source.addEventListener("dragend", () => {
        this._transferDragPayload = null;
        this.element.querySelectorAll(".osp-bank-transfer-target").forEach((target) => target.classList.remove("osp-bank-transfer-target"));
      });
    });

    this.element.querySelectorAll("[data-bank-account-tab]").forEach((accountTab) => {
      const destination = accountTab.dataset.account;
      accountTab.addEventListener("dragover", (event) => {
        if (destination === this.account || !this._readTransfer(event)) return;
        event.preventDefault();
        accountTab.classList.add("osp-bank-transfer-target");
        event.dataTransfer.dropEffect = "move";
      });
      accountTab.addEventListener("dragleave", () => accountTab.classList.remove("osp-bank-transfer-target"));
      accountTab.addEventListener("drop", async (event) => {
        event.preventDefault();
        accountTab.classList.remove("osp-bank-transfer-target");
        if (destination !== this.account) await this._handleAccountTransfer(event, destination);
      });
    });
  }

  _readTransfer(event) {
    try {
      const payload = JSON.parse(event.dataTransfer.getData("text/plain"));
      return payload?.osp === "bank-transfer" ? payload : this._transferDragPayload;
    } catch {
      return this._transferDragPayload ?? null;
    }
  }

  async _handleAccountTransfer(event, destination) {
    const payload = this._readTransfer(event);
    if (!payload || payload.sourceAccount !== this.account) return;
    const ledger = this.account === "party" ? getPartyTreasury() : getLedger(this.actor);
    const available = payload.payloadType === "currency"
      ? ledger.currency[payload.denomination] || 0
      : ledger.items.find((entry) => entry.entryId === payload.entryId)?.quantity || 0;
    if (available < 1) return;
    const label = payload.payloadType === "currency"
      ? `${payload.denomination} coins`
      : ledger.items.find((entry) => entry.entryId === payload.entryId)?.name;
    const quantity = available === 1 ? 1 : await QuantityDialog.prompt({
      title: `Transfer ${label}`,
      label: `How many ${label} do you want to transfer? (max ${available})`,
      max: available,
    });
    if (quantity === null) return;
    const result = await requestPartyTreasury("transfer", {
      actorId: this.actor.id,
      sourceAccount: this.account,
      destinationAccount: destination,
      payloadType: payload.payloadType,
      denomination: payload.denomination,
      entryId: payload.entryId,
      quantity,
    });
    if (!result.success) { ui.notifications.error(result.reason); return; }
    ui.notifications.info(`Transferred ${quantity}${payload.payloadType === "item" ? "×" : ""} ${label} to ${destination === "party" ? "Party Treasury" : `${this.actor.name}’s account`}.`);
    this.account = destination;
    this.vaultOpen = payload.payloadType === "item";
    this.render({ force: true });
  }

  /** @override */
  async close(options) {
    if (this._updateActorHook) Hooks.off("updateActor", this._updateActorHook);
    if (this._updateSettingHook) Hooks.off("updateSetting", this._updateSettingHook);
    return super.close(options);
  }

  /**
   * Inspect a Foundry Item drag synchronously so the vault can communicate whether it accepts it.
   * Only a live item owned by this ledger's actor may be deposited.
   */
  _getDropCandidate(event) {
    const data = TextEditor.getDragEventData(event);
    return getBankDepositCandidate(this.actor, data, externalDrag.item);
  }

  _setVaultDropState(vault, state) {
    vault.classList.toggle("osp-bank-drag-valid", state === "valid");
    vault.classList.toggle("osp-bank-drag-invalid", state === "invalid");
  }

  async _handleVaultDrop(event) {
    const drop = this._getDropCandidate(event);
    if (!drop.valid) {
      ui.notifications.warn(drop.reason);
      return;
    }

    const available = drop.catalog && drop.denomination ? 1000000 : (drop.item.system.quantity || 1);
    const chosen = drop.catalog && drop.denomination
      ? await QuantityDialog.prompt({ title: `Deposit ${drop.item.name}`, label: `How many ${drop.item.name} should be added?`, max: available, initial: 100 })
      : available === 1
      ? 1
      : await QuantityDialog.prompt({
        title: `Deposit ${drop.item.name}`,
        label: `How many ${drop.item.name} do you want to deposit? (max ${available})`,
        max: available,
      });
    if (chosen === null) return;

    let catalogItemData = null;
    let catalogCost;
    if (drop.catalog && !drop.denomination) {
      catalogCost = await TreasureValueDialog.prompt({ itemName: drop.item.name, initialValue: drop.item.system.cost, destination: "bank vault" });
      if (catalogCost === null) return;
      catalogItemData = drop.item.toObject();
      catalogItemData.system.cost = catalogCost;
    }

    try {
      const plan = drop.catalog
        ? this.account === "party"
          ? await requestPartyTreasury("catalogDeposit", { actorId: this.actor.id, itemId: drop.item.id, denomination: drop.denomination, quantity: chosen, cost: catalogCost })
          : await dmDepositCatalogItem(this.actor, catalogItemData ?? drop.item.toObject(), chosen, drop.denomination)
        : this.account === "party"
        ? await requestPartyTreasury("deposit", { actorId: this.actor.id, itemId: drop.item.id, denomination: drop.denomination, quantity: chosen })
        : drop.denomination
          ? await depositCurrency(this.actor, drop.denomination, chosen, drop.item)
          : await depositItem(this.actor, drop.item, chosen);
      if (!plan.success) {
        ui.notifications.error(plan.reason);
        return;
      }
      const destination = this.account === "party" ? "the Party Treasury" : "Westford Bank";
      ui.notifications.info(`Deposited ${chosen}${drop.denomination ? "" : "×"} ${drop.item.name} into ${destination}.`);
    } catch (err) {
      console.error("[Westford Bank] vault drop deposit failed unexpectedly", err);
      ui.notifications.error("Deposit failed unexpectedly — nothing was changed. Check the console for details.");
    } finally {
      this.render();
    }
  }

  /** @this {BankLedgerView} */
  static _onToggleVault(_event, _target) {
    this.vaultOpen = !this.vaultOpen;
    this.render({ force: true });
  }

  /** @this {BankLedgerView} */
  static _onSelectAccount(_event, target) {
    const account = target.dataset.account;
    if (account !== "personal" && account !== "party") return;
    this.account = account;
    this.vaultOpen = false;
    this.render({ force: true });
  }

  /** @this {BankLedgerView} */
  static _onWithdraw(_event, _target) {
    new BankWithdrawDialog({ actor: this.actor, account: this.account }).render({ force: true });
  }
}
