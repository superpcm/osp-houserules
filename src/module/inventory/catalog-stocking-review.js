import { loadStockingCatalog, resolveStockingMetadata, validateStockingMetadata } from './catalog-stocking.js';
import { eligibleStoreItem } from './store.js';
import { ospDialogOptions } from '../dialog/dialog-theme.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const collection = value => value?.contents ?? [...(value?.values?.() ?? value ?? [])];
const availabilityLabels = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', exceptional: 'Exceptional' };

function sourceLabel(source) { return source === 'item' ? 'Item override' : source === 'catalog' ? 'Catalog default' : 'Unclassified'; }
function rowFor(item, catalog) {
  const metadata = resolveStockingMetadata(item, catalog);
  return { item, ...metadata, type: item.type, name: item.name };
}

export function catalogReviewRows(items = [], catalog = []) {
  return collection(items).filter(item => !item.actor && !item.parent && eligibleStoreItem(item)).map(item => rowFor(item, catalog));
}

export function stockingMetadataUpdate(change = {}) {
  if (Object.hasOwn(change, 'blacksmith') && ![null, undefined, '', 'null', true, false, 'true', 'false'].includes(change.blacksmith)) throw new Error('Invalid blacksmith eligibility.');
  const update = {};
  if (Object.hasOwn(change, 'availability')) update['system.storeAvailability'] = change.availability == null || change.availability === 'null' || change.availability === '' ? null : change.availability;
  if (Object.hasOwn(change, 'blacksmith')) update['system.blacksmithEligible'] = change.blacksmith == null || change.blacksmith === 'null' || change.blacksmith === '' ? null : change.blacksmith === true || change.blacksmith === 'true';
  const error = validateStockingMetadata({ storeAvailability: update['system.storeAvailability'], blacksmithEligible: update['system.blacksmithEligible'] });
  if (error) throw new Error(error);
  return update;
}

export async function applyStockingMetadataChanges(changes) {
  if (!game.user?.isGM) throw new Error('Only a GM can apply catalog stocking metadata.');
  const updates = [...changes].map(([id, change]) => {
    const item = game.items.get(id);
    if (!item || item.actor || item.parent || !eligibleStoreItem(item)) throw new Error('A selected world equipment item is no longer available. Reopen the review.');
    return { item, update: stockingMetadataUpdate(change) };
  });
  let applied = 0;
  for (const { item, update } of updates) {
    try { await item.update(update); applied += 1; }
    catch (error) { throw new Error(`${applied} items updated before saving failed for ${item.name}: ${error.message}. Reopen the review before retrying.`); }
  }
  return applied;
}

export async function openCatalogStockingReview() {
  if (!game.user?.isGM) return ui.notifications.warn('Only a GM can review stocking availability.');
  const loaded = await loadStockingCatalog();
  const catalog = Array.isArray(loaded) ? loaded : (loaded?.items ?? loaded?.catalog ?? []);
  const rows = catalogReviewRows(game.items, catalog);
  const types = [...new Set(rows.map(row => row.type))].sort();
  const typeOptions = ['<option value="">All equipment types</option>', ...types.map(type => `<option value="${esc(type)}">${esc(type)}</option>`)].join('');
  const content = `<div class="store-ledger osp-catalog-stocking-body">
    <p class="store-hint">Review world equipment metadata used by automatic merchant stocking. Changes are staged until you review and confirm them.</p>
    <div class="store-toolbar catalog-review-filters">
      <input type="search" data-catalog-filter="search" placeholder="Search equipment" aria-label="Search equipment">
      <select data-catalog-filter="type" aria-label="Equipment type">${typeOptions}</select>
      <select data-catalog-filter="availability" aria-label="Availability"><option value="">All availability</option><option value="unclassified">Unclassified</option><option value="common">Common</option><option value="uncommon">Uncommon</option><option value="rare">Rare</option><option value="exceptional">Exceptional</option></select>
      <select data-catalog-filter="blacksmith" aria-label="Blacksmith eligibility"><option value="">All blacksmith eligibility</option><option value="unclassified">Unset</option><option value="yes">Eligible</option><option value="no">Excluded</option></select>
    </div>
    <div class="store-scroll catalog-review-scroll"><table class="store-table"><thead><tr><th><input type="checkbox" data-catalog-select-all aria-label="Select visible equipment"></th><th>Equipment</th><th>Type</th><th>Availability</th><th>Blacksmith</th><th>Source</th></tr></thead><tbody data-catalog-rows></tbody></table></div>
    <div class="catalog-review-editor">
      <label>Set availability <select data-catalog-edit="availability"><option value="">Leave unchanged</option><option value="null">Use catalog default</option><option value="common">Common</option><option value="uncommon">Uncommon</option><option value="rare">Rare</option><option value="exceptional">Exceptional</option></select></label>
      <label>Set blacksmith eligibility <select data-catalog-edit="blacksmith"><option value="">Leave unchanged</option><option value="null">Use catalog default</option><option value="true">Eligible</option><option value="false">Excluded</option></select></label>
      <button type="button" data-catalog-review>Review staged changes</button>
    </div>
    <p class="store-hint" data-catalog-status></p>
  </div>`;
  const dialogOptions = {
    title: 'Catalog Stocking Review', content,
    buttons: { close: { label: 'Close' } },
    render: html => {
      const root = html[0] ?? html;
      const body = root.querySelector('[data-catalog-rows]');
      const filters = Object.fromEntries([...root.querySelectorAll('[data-catalog-filter]')].map(el => [el.dataset.catalogFilter, el]));
      const staged = new Map();
      const selected = new Set();
      const visible = () => rows.filter(row => {
        const text = `${row.name} ${row.type}`.toLowerCase();
        const availabilityMatch = !filters.availability.value || (filters.availability.value === 'unclassified' ? !row.availability : row.availability === filters.availability.value);
        const smithMatch = !filters.blacksmith.value || (filters.blacksmith.value === 'unclassified' ? row.blacksmithEligible == null : filters.blacksmith.value === 'yes' ? row.blacksmithEligible === true : row.blacksmithEligible === false);
        return (!filters.search.value.trim() || text.includes(filters.search.value.trim().toLowerCase())) && (!filters.type.value || row.type === filters.type.value) && availabilityMatch && smithMatch;
      });
      const render = () => {
        const shown = visible();
        body.innerHTML = shown.map(row => `<tr data-catalog-row="${esc(row.item.id)}"><td><input type="checkbox" data-catalog-select value="${esc(row.item.id)}" ${selected.has(row.item.id) ? 'checked' : ''}></td><td>${esc(row.name)}</td><td>${esc(row.type)}</td><td>${esc(availabilityLabels[row.availability] ?? 'Unclassified')}</td><td>${row.blacksmithEligible == null ? 'Unset' : row.blacksmithEligible ? 'Eligible' : 'Excluded'}</td><td>${esc(sourceLabel(row.availabilitySource))} / ${esc(sourceLabel(row.blacksmithSource))}</td></tr>`).join('') || '<tr><td colspan="6">No world equipment matches these filters.</td></tr>';
        body.querySelectorAll('[data-catalog-select]').forEach(box => box.addEventListener('change', event => event.currentTarget.checked ? selected.add(event.currentTarget.value) : selected.delete(event.currentTarget.value)));
        root.querySelector('[data-catalog-status]').textContent = `${shown.length} equipment item${shown.length === 1 ? '' : 's'} shown · ${staged.size} staged change${staged.size === 1 ? '' : 's'}.`;
      };
      root.querySelectorAll('[data-catalog-filter]').forEach(el => el.addEventListener('input', render));
      root.querySelector('[data-catalog-select-all]').addEventListener('change', event => { visible().forEach(row => event.currentTarget.checked ? selected.add(row.item.id) : selected.delete(row.item.id)); render(); });
      root.querySelector('[data-catalog-review]').addEventListener('click', async () => {
        try {
        const availability = root.querySelector('[data-catalog-edit="availability"]').value;
        const blacksmith = root.querySelector('[data-catalog-edit="blacksmith"]').value;
        if (!availability && !blacksmith) return ui.notifications.warn('Choose at least one metadata value to stage.');
        if (!selected.size) return ui.notifications.warn('Select at least one equipment item.');
        selected.forEach(id => staged.set(id, { ...(staged.get(id) ?? {}), ...(availability ? { availability } : {}), ...(blacksmith ? { blacksmith } : {}) }));
        render();
        const summary = [...staged.entries()].map(([id, change]) => { const row = rows.find(candidate => candidate.item.id === id); return `<li>${esc(row?.name)}: ${change.availability ? `availability → ${change.availability === 'null' ? 'catalog default' : availabilityLabels[change.availability]}` : ''}${change.blacksmith ? `; blacksmith → ${change.blacksmith === 'null' ? 'catalog default' : change.blacksmith === 'true' ? 'Eligible' : 'Excluded'}` : ''}</li>`; }).join('');
        const confirmed = await new Promise(resolve => new Dialog(ospDialogOptions({ title: 'Review Catalog Changes', content: `<p>Apply these stocking metadata changes to the selected world items?</p><ul>${summary}</ul>`, buttons: { apply: { label: 'Apply changes', callback: () => resolve(true) }, cancel: { label: 'Cancel', callback: () => resolve(false) } }, close: () => resolve(false), default: 'cancel' })).render(true));
        if (!confirmed) return;
        if (!game.user?.isGM) return ui.notifications.warn('Only a GM can apply catalog stocking metadata.');
        const count = await applyStockingMetadataChanges(staged);
        ui.notifications.info(`${count} world equipment item${count === 1 ? '' : 's'} updated.`);
        dialog.close();
        } catch (error) { ui.notifications.error(error.message || 'Unable to update stocking metadata.'); }
      });
      render();
    }
  };
  const dialog = new Dialog(ospDialogOptions(dialogOptions), { width: 1040, height: 760, classes: ['osp', 'osp-dialog', 'osp-store-app', 'osp-catalog-stocking-review'] });
  return dialog.render(true);
}

export function registerCatalogStockingReviewUI() { game.osp ??= {}; game.osp.openCatalogStockingReview = openCatalogStockingReview; }
