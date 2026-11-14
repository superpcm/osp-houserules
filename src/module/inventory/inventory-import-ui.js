import { applyInventoryPlan, buildInventoryPlan, loadBundledInventory } from './inventory-import.js';
import { ospDialogOptions } from '../dialog/dialog-theme.js';

let activeImport = false;
let importInFlight = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function renderPlan(plan) {
  const rows = Object.entries(plan.categories).map(([category, counts]) => `<tr><th scope="row">${esc(category)}</th><td>${counts.total}</td><td>${counts.missing}</td><td>${counts.existing}</td><td>${counts.invalid}</td></tr>`).join('');
  const missing = plan.missing.map(entry => `<li>${esc(entry.item.name)} <small>(${esc(entry.item.type)} · ${esc(entry.category)} → ${esc(entry.folderName)})</small></li>`).join('');
  const moves = (plan.toOrganize ?? []).map(entry => `<li>${esc(entry.item.name)} → ${esc(entry.folderName)}</li>`).join('');
  const invalid = [...plan.invalid, ...plan.duplicates].map(entry => `<li>${esc(entry.item?.name || '(unnamed)')} <small>${esc(entry.reason || 'Duplicate bundled identity')}</small></li>`).join('');
  const attention = `${invalid}${(plan.folderAmbiguities ?? []).map(folder => `<li>${esc(folder.name)}: multiple top-level Item folders found; resolve duplicates and retry.</li>`).join('')}`;
  const folders = (plan.folderSummary ?? []).map(folder => `<li>${esc(folder.name)}: ${folder.count} item${folder.count === 1 ? '' : 's'} (${folder.reused ? 'reuse' : folder.ambiguous ? 'ambiguous' : 'create'})</li>`).join('');
  return `<div class="osp-inventory-import"><p>Import missing catalog items into folders and organize matching items currently at the root. Item customizations and existing folder placements are preserved.</p><p><strong>${plan.folderSummary.filter(folder => folder.create).length}</strong> folders to create · <strong>${plan.folderSummary.filter(folder => folder.reused).length}</strong> folders to reuse.</p><table><thead><tr><th>Category</th><th>Total</th><th>Missing</th><th>Existing</th><th>Invalid</th></tr></thead><tbody>${rows}</tbody></table><p><strong>${plan.missing.length}</strong> missing, <strong>${plan.toOrganize?.length ?? 0}</strong> to organize, <strong>${plan.existing.length}</strong> existing, <strong>${plan.invalid.length + plan.duplicates.length}</strong> invalid or duplicate.</p><details ${plan.missing.length ? 'open' : ''}><summary>Missing items (${plan.missing.length})</summary><ul>${missing || '<li>None</li>'}</ul></details><details><summary>Root items to organize (${plan.toOrganize?.length ?? 0})</summary><ul>${moves || '<li>None</li>'}</ul></details><details><summary>Destination folders (${plan.folderSummary.length})</summary><ul>${folders || '<li>None</li>'}</ul></details>${attention ? `<details open><summary>Needs attention (${plan.invalid.length + plan.duplicates.length + (plan.folderAmbiguities?.length ?? 0)})</summary><ul>${attention}</ul></details>` : ''}</div>`;
}

export async function openInventoryImport() {
  if (activeImport || importInFlight) { ui.notifications.warn('An inventory import is already open or running.'); return; }
  if (!globalThis.game?.user?.isGM) { ui.notifications.warn('Only the active GM can import inventory.'); return; }
  activeImport = true;
  try {
    const groups = await loadBundledInventory();
    const documentTypes = game.system.documentTypes?.Item ?? {};
    const validTypes = Array.isArray(documentTypes) ? documentTypes.map(type => typeof type === 'string' ? type : type?.name).filter(Boolean) : Object.keys(documentTypes);
    if (!validTypes.length) throw new Error('The world has no registered Item types.');
    const plan = buildInventoryPlan(groups, [...game.items], validTypes, game.folders);
    const canImport = (plan.missing.length > 0 || plan.toOrganize.length > 0) && plan.invalid.length === 0 && plan.duplicates.length === 0 && plan.folderAmbiguities.length === 0;
    let dialogHtml;
    let dialog;
    await new Promise(resolve => {
      dialog = new Dialog(ospDialogOptions({
        title: 'Import Inventory', content: renderPlan(plan),
        buttons: {
          import: { label: plan.missing.length ? `Import ${plan.missing.length} · Organize ${plan.toOrganize.length}` : plan.toOrganize.length ? `Organize ${plan.toOrganize.length} Items` : 'Nothing to Import or Organize', callback: async () => {
            if (!canImport || importInFlight || !game.user?.isGM) return false;
            dialogHtml?.find('button').prop('disabled', true);
            ui.notifications.info(`Applying ${plan.missing.length} missing items and ${plan.toOrganize.length} folder moves…`);
            importInFlight = (async () => {
              try {
                const result = await applyInventoryPlan(plan, { getWorldItems: async () => [...game.items], folders: game.folders, getFolders: async () => game.folders, isGM: () => game.user?.isGM === true });
                ui.notifications.info(`Inventory import complete: ${result.created.length} created, ${result.organized.length} organized, ${result.skippedCount} skipped, ${result.errors.length} failed. Folders: ${result.folderCreated.length} created, ${result.folderReused.length} reused.`);
                if (result.errors.length) ui.notifications.warn(`Failed: ${result.errors.map(({ entry, error }) => `${entry.item.name}: ${error.message}`).join('; ')}`);
              } catch (error) { ui.notifications.error(`Inventory import failed: ${error.message}`); }
            })();
            try { await importInFlight; } finally { importInFlight = null; await dialog.close(); }
            return false;
          } },
          cancel: { label: 'Cancel' }
        }, default: canImport ? 'import' : 'cancel',
        render: html => {
          dialogHtml = html;
          if (!canImport) html.find('button[data-button="import"]').prop('disabled', true);
        },
        close: resolve
      }), { width: 720, classes: ['osp', 'osp-dialog'] }).render(true);
    });
  } catch (error) { ui.notifications.error(`Inventory import preview failed: ${error.message}`); }
  finally { activeImport = false; }
}
