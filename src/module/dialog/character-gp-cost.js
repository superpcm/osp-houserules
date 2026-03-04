/**
 * @file OSP Character GP Cost dialog — tracks purchased items and deducts gold
 */
import { OSP } from "../config";

export class OspCharacterGpCost extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, options);
    this.actor = actor;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "osp-gp-cost",
      classes: ["osp", "dialog", "gp-cost"],
      title: game.i18n.localize("OSE.dialog.GpCost"),
      template: `${OSP.systemPath()}/templates/dialogs/character-gp-cost.html`,
      width: 400,
      height: "auto",
      submitOnChange: false,
      closeOnSubmit: false,
    });
  }

  /** @override */
  getData() {
    // Find the actor's GP coin items
    const goldItems = this.actor.items.filter(
      (i) => i.type === "coin" && i.name.toLowerCase().includes("gold")
    );
    const totalGP = goldItems.reduce((sum, i) => sum + (i.system.quantity ?? 0), 0);

    // Items that can be purchased (have a cost > 0 and not already paid)
    const purchasableItems = this.actor.items
      .filter((i) => i.system.cost > 0 && !i.getFlag(game.system.id, "paid"))
      .map((i) => ({
        id: i.id,
        name: i.name,
        cost: i.system.cost,
        quantity: i.system.quantity ?? 1,
        totalCost: i.system.cost * (i.system.quantity ?? 1),
      }));

    const cartTotal = purchasableItems.reduce((sum, i) => sum + i.totalCost, 0);

    return {
      actor: this.actor,
      totalGP,
      purchasableItems,
      cartTotal,
      canAfford: totalGP >= cartTotal,
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.find(".purchase-all").click(async () => {
      await this._purchaseAll();
    });
  }

  async _purchaseAll() {
    const data = this.getData();
    if (!data.canAfford) {
      ui.notifications.warn(game.i18n.localize("OSE.dialog.NotEnoughGP"));
      return;
    }

    // Mark items as paid
    for (const itemData of data.purchasableItems) {
      const item = this.actor.items.get(itemData.id);
      await item?.setFlag(game.system.id, "paid", true);
    }

    // Deduct GP
    const goldItems = this.actor.items.filter(
      (i) => i.type === "coin" && i.name.toLowerCase().includes("gold")
    );
    let remaining = data.cartTotal;
    for (const goldItem of goldItems) {
      const qty = goldItem.system.quantity ?? 0;
      if (qty >= remaining) {
        await goldItem.update({ "system.quantity": qty - remaining });
        remaining = 0;
        break;
      } else {
        await goldItem.update({ "system.quantity": 0 });
        remaining -= qty;
      }
    }

    ui.notifications.info(
      game.i18n.format("OSE.dialog.GpDeducted", { amount: data.cartTotal })
    );
    this.render(false);
  }

  /** @override */
  async _updateObject() {}
}
