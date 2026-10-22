import { listXPAwards, recoverXPAward, undoXPAward } from './xp-awards.js';
import { listProgressionOperations, recoverProgressionOperation } from './progression-authority.js';
import { ospDialogOptions } from '../dialog/dialog-theme.js';

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const date = value => value ? new Date(value).toLocaleString() : '';

/** GM audit and recovery view. Actor names and historical data are always escaped. */
export function openXPAwardHistory() {
  if (!game.user.isGM) return;
  const records = listXPAwards().sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const unfinished = listProgressionOperations();
  const content = `<div class="osp-xp-history">
    <p>Party XP saved for the next award: <strong>${esc(game.settings.get(game.system.id, 'partyXPRemainder'))}</strong>.</p>
    ${unfinished.map(record => `<p>Interrupted ${esc(record.action)}:
      <button type="button" data-progression-recover="${esc(record.operationId)}">Recover</button></p>`).join('')}
    ${records.length ? records.map(record => {
      const id = record.awardId;
      const plan = record.plan || {};
      return `<fieldset><legend>${esc(date(record.createdAt))} — ${esc(record.status)}</legend>
        <p>${esc(record.amount)} base XP ${record.party === false ? 'per character' : 'for the party'}.
        Party remainder: ${esc(plan.remainderBefore)} → ${esc(plan.remainderAfter)}.</p>
        <table><thead><tr><th>Character</th><th>Base share</th><th>Modifier</th><th>Awarded</th><th>XP before</th><th>XP after</th></tr></thead><tbody>
        ${(plan.entries || []).map(entry => `<tr><td>${esc(entry.actor?.name)}</td><td>${esc(entry.baseShare)}</td>
          <td>${esc(entry.modifier)}%</td><td>${esc(entry.awarded)}</td><td>${esc(entry.before)}</td><td>${esc(entry.after)}</td></tr>`).join('')}
        </tbody></table>
        ${record.status === 'planned' ? `<button type="button" data-xp-recover="${esc(id)}">Resume award</button>` : ''}
        ${record.status === 'completed' ? `<button type="button" data-xp-undo="${esc(id)}">Undo if safe</button>` : ''}
        ${record.undoReason ? `<p>${esc(record.undoReason)}</p>` : ''}
      </fieldset>`;
    }).join('') : '<p>No XP awards recorded yet.</p>'}
    <p>If HP or skills have already changed, automatic undo is blocked. Use the audit values with Set XP and Set maxHP for a deliberate GM correction.</p>
  </div>`;
  const dialog = new Dialog({ title: 'XP History', content,
    buttons: { close: { label: 'Close' } },
    render: html => {
      const act = (selector, attribute, callback) => html.find(selector).on('click', async event => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        try {
          const result = await callback(button.getAttribute(attribute));
          if (result.success) { ui.notifications.info('XP operation recovered.'); dialog.close(); openXPAwardHistory(); }
          else ui.notifications.warn(result.reason || 'XP operation requires GM correction.');
        } catch (error) { ui.notifications.warn(error.message); }
        finally { button.disabled = false; }
      });
      act('[data-xp-recover]', 'data-xp-recover', recoverXPAward);
      act('[data-progression-recover]', 'data-progression-recover', recoverProgressionOperation);
      act('[data-xp-undo]', 'data-xp-undo', id => undoXPAward(id, 'GM correction from XP History'));
    }
  }, ospDialogOptions({ width: 760 }));
  dialog.render(true);
}
