import { assertProgressionAuthorityFence, currentProgressionOperation, getProgressionRequester, registerProgressionAuthority, requestProgressionMutation } from '../progression/progression-authority.js';

const SYSTEM_ID = 'osp-houserules';
const CATALOG_FILES = ['ammunition', 'armor', 'clothing', 'gear', 'livestock', 'misc', 'tack', 'treasure', 'vehicles', 'weapons'];
const CATALOG_FIELDS = ['weight', 'unitWeight', 'bulk', 'storedSize', 'capacity'];
const clone = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const exact = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function catalogIdentity(entry) { return `${String(entry?.name || '')}|${entry?.type || ''}`; }
function normalizeCatalog(entries) {
  const byIdentity = new Map();
  for (const entry of entries || []) {
    const id = catalogIdentity(entry);
    if (!id.startsWith('|')) byIdentity.set(id, [...(byIdentity.get(id) || []), entry]);
  }
  return byIdentity;
}
function itemCatalogFields(item, entry) {
  const fields = {};
  for (const key of CATALOG_FIELDS) {
    const value = key === 'unitWeight' ? entry?.system?.unitWeight ?? entry?.system?.weight ?? entry?.weight : entry?.system?.[key] ?? entry?.[key];
    if (value !== undefined) fields[`system.${key}`] = value;
  }
  return fields;
}
function existingCatalogFields(item) {
  const fields = {};
  for (const key of CATALOG_FIELDS) {
    const value = item?.system?.[key];
    if (value !== undefined) fields[`system.${key}`] = value;
  }
  return fields;
}
function customFlag(item) { const effects = item?.effects; const flagEffects = item?.flags?.[SYSTEM_ID]?.effects; return item?.flags?.[SYSTEM_ID]?.custom === true || effects?.size > 0 || Array.isArray(effects) && effects.length > 0 || flagEffects?.custom === true || Array.isArray(flagEffects) && flagEffects.length > 0; }
function trustedBaseline(item, entry) {
  const baseline = item?.flags?.[SYSTEM_ID]?.catalogBaseline;
  return Boolean(baseline && baseline.catalogIdentity === catalogIdentity(entry) && exact(baseline.fields, existingCatalogFields(item)));
}

export function pureBuildReconciliationPlan(items = [], catalog = []) {
  const byIdentity = normalizeCatalog(catalog);
  return (items || []).map(item => {
    const matches = byIdentity.get(catalogIdentity(item)) || [];
    const entry = matches.length === 1 ? matches[0] : null;
    const oldFields = existingCatalogFields(item);
    const newFields = entry ? itemCatalogFields(item, entry) : {};
    let classification = 'unmatched';
    if (matches.length > 1) classification = 'ambiguous';
    else if (entry) {
      const differs = !exact(oldFields, newFields);
      if (customFlag(item)) classification = 'custom';
      else if (!differs) classification = 'in-sync';
      else if (trustedBaseline(item, entry)) classification = 'catalog-update';
      else classification = 'review';
    }
    return { itemId: item.id, actorId: item.actorId || item.parent?.id || null, location: item.location || null, name: item.name, type: item.type, classification, oldFields, newFields, catalogIdentity: entry ? catalogIdentity(entry) : null, imageFallback: false };
  });
}
export const purebuildReconciliationPlan = pureBuildReconciliationPlan;

export async function loadCatalog(fetcher = globalThis.fetch) {
  const all = [];
  for (const name of CATALOG_FILES) {
    const response = await fetcher(`systems/${SYSTEM_ID}/data/${name}.json`);
    if (!response?.ok && response?.ok !== undefined) throw new Error(`Unable to load ${name}.json`);
    const entries = await response.json();
    if (!Array.isArray(entries)) throw new Error(`Invalid catalog ${name}.json`);
    all.push(...entries);
  }
  return all;
}

async function executeReconciliation(details) {
  assertProgressionAuthorityFence();
  if (!getProgressionRequester()?.isGM) return { success: false, reason: 'Only a GM may reconcile catalog items.' };
  const item = details.actorId ? game.actors?.get?.(details.actorId)?.items?.get?.(details.itemId) : game.items?.get?.(details.itemId);
  if (!item) return { success: false, reason: 'Item no longer exists.' };
  const prior = item.flags?.[SYSTEM_ID]?.catalogReconciliations?.find?.(receipt => receipt.operationId === currentProgressionOperation());
  if (prior) return exact(existingCatalogFields(item), prior.newFields) ? { success: true, receipt: prior, idempotent: true } : { success: false, recoveryRequired: true, reason: 'Item changed after the recorded catalog update; manual review is required.' };
  if (customFlag(item)) return { success: false, reason: 'Custom items are preserved.' };
  const current = existingCatalogFields(item);
  if (!exact(current, details.expectedOldFields)) return { success: false, recoveryRequired: true, reason: 'Item changed since review; refresh the plan.' };
  const catalog = await loadCatalog();
  const matches = catalog.filter(entry => catalogIdentity(entry) === catalogIdentity(item));
  if (matches.length !== 1) return { success: false, reason: 'Catalog identity is missing or ambiguous.' };
  const trustedFields = itemCatalogFields(item, matches[0]);
  const update = { system: {} };
  for (const [path, value] of Object.entries(trustedFields)) update.system[path.slice('system.'.length)] = value;
  for (const path of Object.keys(current)) if (!(path in trustedFields)) update.system[`-=${path.slice(7)}`] = null;
  const receipt = { operationId: currentProgressionOperation(), actorId: details.actorId || null, itemId: item.id, oldFields: current, newFields: trustedFields, classification: pureBuildReconciliationPlan([item], catalog)[0].classification, catalogIdentity: catalogIdentity(item), oldBaseline: clone(item.flags?.[SYSTEM_ID]?.catalogBaseline ?? null), createdAt: Date.now() };
  update.flags = clone(item.flags || {});
  update.flags[SYSTEM_ID] = { ...(update.flags[SYSTEM_ID] || {}), catalogReconciliations: [...(update.flags[SYSTEM_ID]?.catalogReconciliations || []), receipt], catalogBaseline: { catalogIdentity: catalogIdentity(item), fields: trustedFields } };
  try { await item.update(update); }
  catch (error) {
    if (!item.flags?.[SYSTEM_ID]?.catalogReconciliations?.some(receipt => receipt.operationId === currentProgressionOperation()) || !exact(existingCatalogFields(item), trustedFields)) throw error;
  }
  assertProgressionAuthorityFence();
  const applied = existingCatalogFields(item);
  if (!exact(applied, trustedFields)) return { success: false, recoveryRequired: true, reason: 'Catalog receipt acknowledgment failed.' };
  return { success: true, receipt };
}

async function executeUndo(details) {
  assertProgressionAuthorityFence();
  if (!getProgressionRequester()?.isGM || !details.receipt?.operationId) return { success: false, reason: 'Only the original GM receipt can authorize undo.' };
  const item = details.receipt.actorId ? game.actors?.get?.(details.receipt.actorId)?.items?.get?.(details.receipt.itemId) : game.items?.get?.(details.receipt.itemId);
  const receipt = item?.flags?.[SYSTEM_ID]?.catalogReconciliations?.find?.(entry => entry.operationId === details.receipt.operationId);
  const completedUndo = item?.flags?.[SYSTEM_ID]?.catalogUndoReceipts?.find(entry => entry.targetOperationId === details.receipt.operationId);
  if (completedUndo) return exact(existingCatalogFields(item), receipt?.oldFields) ? { success: true, idempotent: true, receipt: completedUndo } : { success: false, reason: 'Item changed after undo; manual review required.' };
  if (!item || !receipt || receipt.operationId !== details.receipt.operationId || !exact(existingCatalogFields(item), receipt.newFields)) return { success: false, reason: 'Undo guard failed; item changed or receipt is missing.' };
  const system = Object.fromEntries(Object.entries(receipt.oldFields).map(([key, value]) => [key.slice('system.'.length), value]));
  for (const key of Object.keys(receipt.newFields || {})) if (!(key in receipt.oldFields)) system[`-=${key.slice('system.'.length)}`] = null;
  const undoReceipt = { operationId: currentProgressionOperation(), targetOperationId: receipt.operationId, restoredAt: Date.now() };
  const change = { system, flags: { [SYSTEM_ID]: { ...(item.flags?.[SYSTEM_ID] || {}), catalogBaseline: receipt.oldBaseline, catalogUndoReceipts: [...(item.flags?.[SYSTEM_ID]?.catalogUndoReceipts || []), undoReceipt] } } };
  try { await item.update(change); }
  catch (error) { if (!exact(existingCatalogFields(item), receipt.oldFields) || !item.flags?.[SYSTEM_ID]?.catalogUndoReceipts?.some(entry => entry.targetOperationId === receipt.operationId)) throw error; }
  assertProgressionAuthorityFence();
  if (!exact(existingCatalogFields(item), receipt.oldFields)) throw new Error('Undo acknowledgment failed.');
  return { success: true, itemId: item.id, receipt: undoReceipt };
}

export function registerCatalogReconciliationAuthority() {
  registerProgressionAuthority('catalog.reconcile', executeReconciliation);
  registerProgressionAuthority('catalog.undo', executeUndo);
  registerProgressionAuthority('catalog.markCustom', async details => {
    assertProgressionAuthorityFence();
    if (!getProgressionRequester()?.isGM) return { success: false, reason: 'Only a GM may mark custom items.' };
    const item = details.actorId ? game.actors?.get?.(details.actorId)?.items?.get?.(details.itemId) : game.items?.get?.(details.itemId);
    if (!item) return { success: false, reason: 'Item no longer exists.' };
    await item.update({ flags: { [SYSTEM_ID]: { ...(item.flags?.[SYSTEM_ID] || {}), custom: true } } });
    return { success: true, itemId: item.id };
  });
}
export function executeSelectedReconciliation(selection, operationId = null) {
  return requestProgressionMutation('catalog.reconcile', selection, operationId);
}
export function undoCatalogReconciliation(receipt) { return requestProgressionMutation('catalog.undo', { itemId: receipt.itemId, receipt }, `catalog-undo-${receipt.operationId}`); }
export function markCatalogItemCustom(itemId, actorId = null) { return requestProgressionMutation('catalog.markCustom', { itemId, actorId }); }
export { CATALOG_FILES, CATALOG_FIELDS, existingCatalogFields };
