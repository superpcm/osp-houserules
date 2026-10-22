import { ospDialogOptions } from '../dialog/dialog-theme.js';

export const escapeNoncombatHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/** These dialogs are called only inside the active GM authority handler. */
export function confirmPrivateCheck(check) {
  if (!globalThis.Dialog) throw new Error('GM dialog unavailable');
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    const victim = check.id === 'pickpockets' ? '<label>Victim level (GM only)<input name="victimLevel" type="number" min="0" step="1" value="0"></label>' : '';
    const modifier = check.id === 'tracking' ? '<p>Ground +20 to -50; +2 per creature beyond first; mingled tracks -50; age -5 per 12 hours; rain -25 per hour; hidden tracks -25.</p><label>Combined tracking modifier (percentage points)<input name="modifier" type="number" step="1" value="0"></label>' : '';
    new Dialog(ospDialogOptions({ title: 'GM private exploration check', content: `<p>${escapeNoncombatHTML(check.label)}</p><p>${escapeNoncombatHTML(check.note)}</p>${victim}${modifier}<p>Confirm the target/area, time, circumstances and retry eligibility. For Mage skills, enforce the per-portal, per-turn or next-level restriction before continuing. No result is sent to the requesting player.</p>`, buttons: {
      confirm: { label: 'Confirm eligibility', callback: html => {
        const victimLevel = check.id === 'pickpockets' ? Number(html.find('[name="victimLevel"]').val()) : 0;
        const modifier = check.id === 'tracking' ? Number(html.find('[name="modifier"]').val()) : 0;
        if (!Number.isInteger(victimLevel) || victimLevel < 0 || !Number.isFinite(modifier)) { globalThis.ui?.notifications?.warn('Enter a valid victim level or tracking modifier.'); finish(null); return; }
        finish({ victimLevel, modifier });
      } }, cancel: { label: 'Cancel', callback: () => finish(null) }
    }, default: 'cancel', close: () => finish(null) })).render(true);
  });
}

export function recoverPrivateDie(check) {
  if (!globalThis.Dialog) throw new Error('GM dialog unavailable');
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    new Dialog(ospDialogOptions({ title: 'Recover private exploration check', content: `<p>${escapeNoncombatHTML(check.label)} was interrupted. If the die was rolled, enter that exact result; never reroll a known result.</p><label>Actual d${check.faces} result<input name="actual" type="number" min="1" max="${check.faces}" step="1"></label>`, buttons: {
      record: { label: 'Record actual result', callback: html => { const actual = Number(html.find('[name="actual"]').val()); if (Number.isInteger(actual) && actual >= 1 && actual <= check.faces) finish({ actual }); else { globalThis.ui?.notifications?.warn('Enter the actual die result.'); finish(null); } } },
      unrolled: { label: 'Confirm no die was rolled; roll now', callback: () => finish({ unrolled: true }) },
      cancel: { label: 'Leave pending', callback: () => finish(null) }
    }, default: 'cancel', close: () => finish(null) })).render(true);
  });
}
