/**
 * GM prompt shown when treasure is granted to a character from outside their inventory.
 * The chosen value is written only to the newly-created embedded item, leaving the catalog
 * entry's default value untouched for the next drop.
 */
export class TreasureValueDialog {
  /**
   * @param {{itemName:string, initialValue?:number, destination?:string}} options
   * @returns {Promise<number|null>} value in silver pieces, or null when cancelled/invalid
   */
  static async prompt({ itemName, initialValue = 0, destination = 'character' }) {
    const safeName = String(itemName || 'Treasure')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const defaultValue = Number(initialValue);
    const safeDefault = Number.isFinite(defaultValue) && defaultValue >= 0 ? defaultValue : 0;

    return new Promise((resolve) => {
      let resolved = false;
      new Dialog({
        title: `Set ${safeName} Value`,
        content: `
          <form>
            <p>Set this ${safeName}'s value before adding it to the ${destination}.</p>
            <div class="form-group">
              <label>Value (silver pieces)</label>
              <input type="number" name="treasureValue" value="${safeDefault}" min="0" step="0.1" style="width:100%;margin-top:4px;" autofocus>
            </div>
          </form>`,
        buttons: {
          add: {
            icon: '<i class="fas fa-gem"></i>',
            label: destination === 'character' ? 'Add Treasure' : 'Add to Bank',
            callback: (html) => {
              resolved = true;
              const value = Number(html.find('[name="treasureValue"]').val());
              if (!Number.isFinite(value) || value < 0) {
                ui.notifications.error('Treasure value must be zero or greater.');
                resolve(null);
                return;
              }
              resolve(value);
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
            callback: () => { resolved = true; resolve(null); },
          },
        },
        default: 'add',
        close: () => { if (!resolved) resolve(null); },
        render: (html) => html.find('[name="treasureValue"]').focus().select(),
      }).render(true);
    });
  }
}
