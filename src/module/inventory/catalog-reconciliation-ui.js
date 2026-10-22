import { loadCatalog, pureBuildReconciliationPlan, executeSelectedReconciliation, markCatalogItemCustom, undoCatalogReconciliation } from './catalog-reconciliation.js';
import { listProgressionOperations, recoverProgressionOperation } from '../progression/progression-authority.js';
import { ospDialogOptions } from '../dialog/dialog-theme.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const describe = value => escape(JSON.stringify(value));
const list = collection => collection?.contents ?? [...(collection?.values?.() ?? collection ?? [])];

export async function openCatalogReconciliation() {
  if (!game.user?.isGM) return ui.notifications.warn('Only a GM can reconcile the item catalog.');
  const catalog = await loadCatalog();
  const asPlain = (item, actorId = null, location = 'World') => ({ id: item.id, name: item.name, type: item.type, system: item.system, flags: item.flags, effects: item.effects, actorId, location });
  const items = list(game.items).map(item => asPlain(item));
  for (const actor of list(game.actors)) for (const item of list(actor.items)) items.push(asPlain(item, actor.id, actor.name));
  const plan = pureBuildReconciliationPlan(items, catalog);
  const operationIds = new Map(plan.map((row, index) => [index, foundry.utils.randomID()]));
  const review = plan.map((row, index) => ({ ...row, index })).filter(row => row.classification !== 'in-sync');
  const rows = review.map(row => `<tr><td><input type="checkbox" name="catalog-item" value="${row.index}" ${row.classification === 'custom' ? 'disabled' : ''} ${row.classification === 'catalog-update' ? 'checked' : ''}></td><td>${escape(row.name)}</td><td>${escape(row.location)}</td><td>${escape(row.classification)}</td><td><code>${describe(row.oldFields)}</code></td><td><code>${describe(row.newFields)}</code></td></tr>`).join('');
  const receipts = items.flatMap(item => (item.flags?.['osp-houserules']?.catalogReconciliations || []).map(receipt => ({ item, receipt, undone: (item.flags?.['osp-houserules']?.catalogUndoReceipts || []).some(undo => undo.targetOperationId === receipt.operationId) })));
  const pending = listProgressionOperations().filter(operation => operation.action.startsWith('catalog.'));
  const content = `<p>Catalog weights are pounds per item. Bulk and capacity use the catalog's numeric units. Legacy <code>weight</code> is coin-weight (10 CW = 1 lb).</p>
    <p>Review uncertain items before selecting Apply. Custom items are preserved. Unmatched or ambiguous items can be marked custom, but cannot receive catalog values.</p>
    <table><thead><tr><th>Select</th><th>Item</th><th>Location</th><th>Status</th><th>Current</th><th>Catalog</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No weight or bulk differences require review.</td></tr>'}</tbody></table>
    ${pending.map(operation => `<p>Interrupted ${escape(operation.action)} <button type="button" data-catalog-recover="${escape(operation.operationId)}">Recover</button></p>`).join('')}
    <details><summary>Update history (${receipts.length})</summary>${receipts.map(({ item, receipt, undone }, index) => `<p>${escape(item.name)} — ${escape(item.location)}: ${describe(receipt.oldFields)} → ${describe(receipt.newFields)} ${undone ? 'Undone' : `<button type="button" data-catalog-undo="${index}">Undo if unchanged</button>`}</p>`).join('')}</details>`;
  let busy = false;
  const selected = html => html.find('input[name="catalog-item"]:checked').map((_, input) => ({ row: plan[Number(input.value)], index: Number(input.value) })).get();
  const refresh = () => { dialog.close(); void openCatalogReconciliation().catch(error => ui.notifications.warn(error.message)); };
  const apply = async (html, custom) => {
    if (busy) return false;
    busy = true;
    try {
      let count = 0;
      for (const { row, index } of selected(html)) {
        if (!custom && !['review', 'catalog-update'].includes(row.classification)) { ui.notifications.warn(`${row.name}: no unambiguous catalog match.`); continue; }
        const result = custom ? await markCatalogItemCustom(row.itemId, row.actorId) : await executeSelectedReconciliation({ itemId: row.itemId, actorId: row.actorId, expectedOldFields: row.oldFields }, operationIds.get(index));
        if (!result.success) { ui.notifications.warn(result.reason || 'Catalog operation needs recovery.'); return false; }
        count++;
      }
      ui.notifications.info(`${count} item(s) ${custom ? 'marked custom' : 'updated to catalog weight and bulk'}.`); refresh();
    } catch (error) { ui.notifications.warn(error.message); }
    finally { busy = false; }
    return false;
  };
  const dialog = new Dialog({ title: 'Catalog Weight & Bulk Review', content,
    buttons: { apply: { label: 'Apply selected catalog values', callback: html => apply(html, false) }, custom: { label: 'Preserve selected as custom', callback: html => apply(html, true) }, close: { label: 'Close' } },
    render: html => {
      const bind = (selector, callback) => html.find(selector).on('click', async event => {
        const button = event.currentTarget; if (busy || button.disabled) return; button.disabled = true;
        try { const result = await callback(button); if (result.success) refresh(); else ui.notifications.warn(result.reason || 'Manual review is required.'); }
        catch (error) { ui.notifications.warn(error.message); }
        finally { button.disabled = false; }
      });
      bind('[data-catalog-recover]', button => recoverProgressionOperation(button.getAttribute('data-catalog-recover')));
      bind('[data-catalog-undo]', button => undoCatalogReconciliation(receipts[Number(button.getAttribute('data-catalog-undo'))].receipt));
    }
  }, ospDialogOptions({ width: 960 }));
  return dialog.render(true);
}
export function registerCatalogReconciliationUI() { game.osp ??= {}; game.osp.openCatalogReconciliation = openCatalogReconciliation; }
