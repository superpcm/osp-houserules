import { generateStoreStock } from './store-profiles.js';
import { loadStockingCatalog } from './catalog-stocking.js';
import { getStoreData, getStoreDocument, STORE_SCOPE, STORE_FLAG } from './store.js';
import { registerInventoryAuthority, requestInventoryMutation } from './inventory-authority.js';
import { runTransaction, journalStoreChange, snapshotJournal } from './transaction-journal.js';

const clone = value => structuredClone(value);
const values = collection => collection?.contents ?? (typeof collection?.values === 'function' ? [...collection.values()] : Array.isArray(collection) ? collection : []);
const busy = new Set();
const DAY = 86400;

function rawStoreData(document) {
  const raw = document?.getFlag?.(STORE_SCOPE, STORE_FLAG) ?? document?.flags?.[STORE_SCOPE]?.[STORE_FLAG] ?? {};
  const data = getStoreData(document);
  if (raw.stocking && typeof raw.stocking === 'object') data.stocking = clone(raw.stocking);
  return data;
}
function worldTime() { return Number.isFinite(Number(game?.time?.worldTime)) ? Number(game.time.worldTime) : 0; }
function cycleFor(stocking, at) { return Math.floor(at / (Math.max(1, Number(stocking?.restockDays) || 7) * DAY)); }
function sourceUuid(entry) { return entry?.sourceUuid ?? entry?.itemData?.uuid ?? null; }
function entryId(uuid, seed) { return `restock-${String(seed).replace(/[^a-zA-Z0-9_-]/g, '-')}-${String(uuid).replace(/[^a-zA-Z0-9_-]/g, '-')}`.slice(0, 128); }

/** Pure merge used by the authority handler and tests. */
export function applyRestockPlan(entries = [], generated = [], stocking = {}, seed = 'restock') {
  const current = clone(Array.isArray(entries) ? entries : []);
  const managed = new Set(Array.isArray(stocking.managedSources) ? stocking.managedSources : []);
  const generatedBySource = new Map(generated.map(entry => [sourceUuid(entry), entry]).filter(([uuid]) => uuid));
  const seen = new Set();
  const next = current.map(entry => {
    const uuid = sourceUuid(entry);
    if (!managed.has(uuid)) return entry;
    const replacement = generatedBySource.get(uuid);
    if (!replacement) return { ...entry, stock: 0 };
    seen.add(uuid);
    return {
      ...entry,
      itemData: clone(entry.itemData ?? replacement.itemData),
      stock: replacement.stock,
      customPrice: stocking.repriceOnRestock ? replacement.customPrice : entry.customPrice,
    };
  });
  for (const generatedEntry of generated) {
    const uuid = sourceUuid(generatedEntry);
    if (!uuid || seen.has(uuid) || current.some(entry => sourceUuid(entry) === uuid)) continue;
    next.push({ ...clone(generatedEntry), id: entryId(uuid, seed) });
    seen.add(uuid);
  }
  const mergedSources = [...new Set([...managed, ...generated.map(sourceUuid).filter(uuid => uuid && !current.some(entry => sourceUuid(entry) === uuid))])];
  if (next.length > 200) return { success: false, reason: 'Restocking would exceed the 200-product store limit.' };
  return { success: true, entries: next, managedSources: mergedSources };
}

function validRestockDays(stocking) {
  const days = Number(stocking?.restockDays);
  return Number.isInteger(days) && days >= 1 && days <= 365;
}
function due(stocking, at) {
  if (!stocking?.enabled) return false;
  if (!validRestockDays(stocking)) return false;
  const days = Number(stocking.restockDays);
  const last = Number(stocking.lastRestockWorldTime);
  return !Number.isFinite(last) || at - last >= days * DAY;
}

async function doRestock(details, message) {
  if (!game?.user?.isGM || !game.users?.get?.(message?.userId)?.isGM) return { success: false, reason: 'Only the GM can restock stores.' };
  const document = getStoreDocument(details.storeId);
  if (!document) return { success: false, reason: 'Store unavailable.' };
  const before = snapshotJournal(document);
  const current = rawStoreData(document);
  const stocking = current.stocking;
  if (!stocking?.enabled) return { success: false, reason: 'Ongoing restocking is disabled for this store.' };
  if (!validRestockDays(stocking)) return { success: false, reason: 'Restock interval must be a whole number from 1 to 365 days.' };
  const now = worldTime();
  if (details.force !== true && !due(stocking, now)) return { success: true, outcome: 'not-due', store: current };
  const cycle = cycleFor(stocking, now);
  const seed = `${stocking.seed ?? 'store'}:${cycle}`;
  const profileOptions = { ...clone(stocking), seed, profileId: stocking.profileId, settlement: stocking.settlement, size: stocking.size };
  const catalog = values(game?.items);
  const bundledCatalog = await loadStockingCatalog().catch(() => []);
  const generated = generateStoreStock(catalog, { ...profileOptions, catalog: bundledCatalog });
  if (!generated.success) return generated;
  const planned = applyRestockPlan(current.entries, generated.entries, stocking, seed);
  if (!planned.success) return planned;
  const next = clone(current);
  next.entries = planned.entries;
  next.stocking = { ...clone(stocking), managedSources: planned.managedSources, lastRestockWorldTime: now };
  next.revision = (Number(current.revision) || 0) + 1;
  const change = { ...journalStoreChange(document, { name: next.name, ownership: { default: next.accessible ? 2 : 0 }, flags: { ...clone(next), stocking: clone(next.stocking) } }), before };
  return runTransaction(null, { label: `Restock store: ${document.name}`, changes: [change], authority: true, validate: () => JSON.stringify(snapshotJournal(document)) === JSON.stringify(before) });
}

export async function restockStore(storeId, operationId = null, { force = true } = {}) {
  return requestInventoryMutation('storeRestock', { storeId, force }, null, operationId);
}

export async function restockDueStores() {
  if (!game?.user?.isGM || game.users?.activeGM?.id !== game.user.id) return { success: false, reason: 'Only the active GM can restock stores.' };
  const at = worldTime();
  const results = [];
  for (const document of values(game?.journal)) {
    const data = rawStoreData(document);
    if (!due(data.stocking, at)) continue;
    const operationId = `restock-${document.id}-${cycleFor(data.stocking, at)}-${Number(data.stocking.lastRestockWorldTime) || 0}-${Number(data.revision) || 0}`;
    if (busy.has(operationId)) continue;
    busy.add(operationId);
    try { results.push(await restockStore(document.id, operationId, { force: false })); } finally { busy.delete(operationId); }
  }
  return { success: results.every(result => result.success), results };
}

export function initStoreRestocking() {
  registerInventoryAuthority('storeRestock', doRestock);
  if (globalThis.__ospStoreRestockingHook) return;
  globalThis.__ospStoreRestockingHook = true;
  const schedule = () => {
    void restockDueStores().then(result => {
      const failure = result.results?.find(result => !result.success);
      if (failure) throw new Error(failure.reason || 'A scheduled store restock could not be completed.');
    }).catch(error => {
      const now = Date.now();
      if (schedule.lastMessage === error?.message && now - schedule.lastAt < 60000) return;
      schedule.lastMessage = error?.message;
      schedule.lastAt = now;
      console.error('Store restocking failed:', error);
    });
  };
  globalThis.Hooks?.on?.('updateWorldTime', schedule);
  globalThis.Hooks?.on?.('ready', schedule);
}

export const __test = { rawStoreData, cycleFor, due, validRestockDays };

