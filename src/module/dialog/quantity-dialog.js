/**
 * @file Reusable "how many?" prompt — first shared version of the quantity dialog that
 * _handleStackedItemDrop / _handleCoinDrop / _handleAmmunitionDrop in character-sheet.js each
 * currently hand-roll inline. Not wired into those call sites as part of this feature; built for
 * Westford Bank's deposit/withdraw flows and left as a natural follow-up de-duplication target.
 */
export class QuantityDialog {
  /**
   * @param {{title:string, label:string, max:number, min?:number, initial?:number}} options
   * @returns {Promise<number|null>} the chosen quantity, or null on cancel/invalid/dismiss
   */
  static async prompt({ title, label, max, min = 1, initial = max }) {
    return new Promise((resolve) => {
      let resolved = false;
      new Dialog({
        title,
        content: `
          <form>
            <div class="form-group">
              <label>${label}</label>
              <input type="number" name="qty" value="${initial}" min="${min}" max="${max}" style="width:100%;margin-top:4px;" autofocus>
            </div>
          </form>`,
        buttons: {
          ok: {
            icon: '<i class="fas fa-check"></i>',
            label: 'Confirm',
            callback: (html) => {
              resolved = true;
              const val = parseInt(html.find('[name="qty"]').val());
              resolve((!val || val < min || val > max) ? null : val);
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
            callback: () => { resolved = true; resolve(null); },
          },
        },
        default: 'ok',
        close: () => { if (!resolved) resolve(null); },
        render: (html) => html.find('[name="qty"]').focus().select(),
      }).render(true);
    });
  }
}
