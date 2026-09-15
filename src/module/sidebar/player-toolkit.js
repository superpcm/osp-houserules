/**
 * @file Player's Toolkit — sidebar tab visible to all players (sibling to DM's Toolkit, which
 * is gmOnly). First entry is Westford Bank, opening BankLedgerView bound to the acting user's
 * own character.
 */
import { BankLedgerView } from "../apps/bank-ledger-view.js";
import { StorehouseView } from "../apps/storehouse-view.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { AbstractSidebarTab } = foundry.applications.sidebar;

export default class PlayerToolkitTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  static tabName = "playertoolkit";

  static DEFAULT_OPTIONS = {
    window: { title: "Player's Toolkit" },
    actions: {
      openBank: PlayerToolkitTab._onOpenBank,
      openStorehouse: PlayerToolkitTab._onOpenStorehouse,
    }
  };

  static PARTS = {
    app: {
      template: "systems/osp-houserules/templates/sidebar/player-toolkit.html"
    }
  };

  static async _onOpenBank(_event, _target) {
    const actor = await PlayerToolkitTab._resolvePlayerActor("Westford Bank", "ledger");
    if (!actor) return;
    new BankLedgerView({ actor }).render({ force: true });
  }

  static async _onOpenStorehouse(_event, _target) {
    const actor = await PlayerToolkitTab._resolvePlayerActor("Westford Storehouse", "locker");
    if (!actor) return;
    new StorehouseView({ actor }).render({ force: true });
  }

  // Trusts game.user.character (the "Assigned Character" set in Configure Player Characters)
  // when present — if that's pointed at the wrong actor, this opens the wrong ledger with no
  // way for us to detect it, so double-check that assignment first if a ledger ever looks empty
  // unexpectedly. Only falls back to guessing among owned actors when no character is assigned;
  // with more than one candidate (e.g. a GM, who owns every actor) it prompts rather than
  // silently picking one — a silent guess here previously bound the Bank dialogs to the wrong
  // actor with no visible indication why.
  static async _resolvePlayerActor(serviceName = "Player's Toolkit", accountName = "account") {
    if (game.user.character) return game.user.character;

    const owned = game.actors.filter(a => a.type === 'character' && a.isOwner);
    if (owned.length === 0) {
      ui.notifications.warn("No character found — ask your DM to assign one to your user, or claim ownership of exactly one.");
      return null;
    }
    if (owned.length === 1) return owned[0];

    return PlayerToolkitTab._promptChooseActor(owned, serviceName, accountName);
  }

  static async _promptChooseActor(actors, serviceName, accountName) {
    const options = actors.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    return new Promise((resolve) => {
      new Dialog({
        title: `${serviceName} — Choose Character`,
        content: `
          <form>
            <div class="form-group">
              <label>No character is assigned to your user, and you own more than one. Which ${accountName} do you want to open?</label>
              <select name="actorId" style="width:100%;margin-top:6px;">${options}</select>
            </div>
          </form>`,
        buttons: {
          open: {
            icon: '<i class="fas fa-check"></i>',
            label: 'Open',
            callback: (html) => resolve(game.actors.get(html.find('[name="actorId"]').val()) ?? null)
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
            callback: () => resolve(null)
          }
        },
        default: 'open'
      }).render(true);
    });
  }
}
