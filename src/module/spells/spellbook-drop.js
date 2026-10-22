import { isSpellbookItem } from './spellbook-names.js';
import { ospDialogOptions } from '../dialog/dialog-theme.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const cloneSnapshot = value => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const readName = html => {
  if (html?.find) return html.find('[name="name"]').val();
  return html?.querySelector?.('[name="name"]')?.value;
};

/**
 * Prompt for the name of a spellbook being dropped onto an actor.
 * Returns the original non-spellbook value, a renamed snapshot, or null when
 * the prompt is dismissed.
 */
export async function nameDroppedSpellbook(itemData) {
  if (!isSpellbookItem(itemData)) return itemData;

  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const confirm = html => {
      const snapshot = cloneSnapshot(itemData);
      const providedName = String(readName(html) ?? '').trim();
      snapshot.name = providedName || 'Spellbook';
      snapshot.flags = {
        ...(snapshot.flags ?? {}),
        'osp-houserules': {
          ...(snapshot.flags?.['osp-houserules'] ?? {}),
          spellbook: true
        }
      };
      finish(snapshot);
    };

    new Dialog({
      title: 'Name Spellbook',
      content: `<div class="form-group"><label for="osp-spellbook-name">Book name</label><input id="osp-spellbook-name" name="name" type="text" maxlength="80" value="${escapeHtml(itemData.name)}" autofocus></div>`,
      buttons: {
        confirm: { label: 'Confirm', callback: confirm },
        cancel: { label: 'Cancel', callback: () => finish(null) }
      },
      default: 'confirm',
      close: () => finish(null)
    }, ospDialogOptions({ width: 360, classes: ['osp', 'osp-spellbook-rename'] })).render(true);
  });
}
