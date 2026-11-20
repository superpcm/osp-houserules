import { normalizeStableProfile, validateStableProfile, eligibleStableProfileItem } from './stable-profiles.js';
import { getStableData, getStableDocument, listStables, STABLE_FLAG } from './stable.js';
import { journalStableChange, runTransaction, snapshotJournal } from './transaction-journal.js';
import { registerInventoryAuthority, requestInventoryMutation } from './inventory-authority.js';

const clone = value => structuredClone(value);
const DAY = 86400;
const values = collection => collection?.contents ?? (typeof collection?.values === 'function' ? [...collection.values()] : Array.isArray(collection) ? collection : []);
const worldTime = () => Number.isFinite(Number(globalThis.game?.time?.worldTime)) ? Number(globalThis.game.time.worldTime) : 0;
const validDays = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 365;
const currentFlag = document => document?.getFlag?.('osp-houserules', 'stable') ?? document?.flags?.['osp-houserules']?.stable ?? {};
const due = (stocking, at) => { const interval = stocking?.intervalDays; if (!stocking?.enabled || !validDays(interval)) return false; const last = stocking.lastRestockedWorldTime == null ? NaN : Number(stocking.lastRestockedWorldTime); return !Number.isFinite(last) || at - last >= Number(interval) * DAY; };

/** Refill generated stock while preserving manual, named, and individually curated entries. */
export function replenishStableStock(stable, options = {}) {
  const data = clone(stable ?? {}); const stocking = normalizeStableProfile({ ...(data.stocking ?? {}), ...options }); const error = validateStableProfile(stocking); if (error) return { success: false, reason: error };
  const entries = Array.isArray(data.entries) ? data.entries : []; const rngSeed = stocking.seed ?? 1; const result = [];
  for (const raw of entries) {
    const entry = clone(raw); const protectedEntry = entry.managed !== true || entry.individual === true || entry.customStock === true || entry.manual === true;
    if (entry.managed && !entry.individual && !eligibleStableProfileItem({ ...entry.itemData, uuid: entry.sourceUuid }, stocking)) { entry.stock = 0; result.push(entry); continue; }
    if (!protectedEntry && entry.stock != null) { const rng = () => { let hash = 0; for (const char of `${rngSeed}:${entry.id}`) hash = (Math.imul(hash ^ char.charCodeAt(0), 16777619)) >>> 0; return (hash % 10000) / 10000; }; entry.stock = stocking.minQuantity + Math.floor(rng() * (stocking.maxQuantity - stocking.minQuantity + 1)); if (stocking.randomizePrices && (entry.customPrice == null || entry.generatedPrice === true) && entry.itemData?.system?.cost != null) { entry.customPrice = Math.round(Number(entry.itemData.system.cost) * randomPercent(`${rngSeed}:${entry.id}`, stocking.minPricePercent, stocking.maxPricePercent) * 10) / 10; entry.generatedPrice = true; } }
    result.push(entry);
  }
  return { success: true, entries: result, settings: stocking };
}
const randomPercent = (seed, min, max) => { let hash = 2166136261; for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0; return (min + (hash % (max - min + 1))) / 100; };

export function restockDueStable(stable, at = worldTime()) { return due(stable?.stocking, at) ? replenishStableStock(stable, { seed: `${stable.id ?? stable.name ?? 'stable'}:${Math.floor(at / DAY)}` }) : { success: true, outcome: 'not-due', entries: clone(stable?.entries ?? []) }; }
export function shouldRestockStable(stable, at = worldTime()) { return due(stable?.stocking, at); }

async function doReplenish(details, message) {
  const requester = globalThis.game?.users?.get?.(message?.userId) ?? globalThis.game?.user;
  if (!requester?.isGM) return { success: false, reason: 'Only the GM can replenish stables.' };
  const document = getStableDocument(details.stableId); if (!document) return { success: false, reason: 'Stable unavailable.' };
  const current = getStableData(document); const now = worldTime(); if (details.force !== true && !due(current.stocking, now)) return { success: true, outcome: 'not-due', stable: current };
  const before = snapshotJournal(document); const plan = replenishStableStock(current, { ...current.stocking, seed: `${document.id}:${Math.floor(now / DAY)}` }); if (!plan.success) return plan;
  const next = clone(current); next.entries = plan.entries; next.stocking = { ...current.stocking, ...plan.settings, lastRestockedWorldTime: now }; next.revision += 1;
  return runTransaction(null, { label: `Replenish stable: ${document.name}`, changes: [{ ...journalStableChange(document, { name: next.name, ownership: { default: next.accessible ? 2 : 0 }, flags: next, flag: STABLE_FLAG }), before }], authority: true, validate: () => JSON.stringify(snapshotJournal(document)) === JSON.stringify(before) });
}
export function restockStable(stableId, { force = true, operationId = null } = {}) { return requestInventoryMutation('stableReplenish', { stableId, force }, null, operationId); }
export function restockDueStables() { if (!globalThis.game?.user?.isGM || globalThis.game.users?.activeGM?.id !== globalThis.game.user.id) return Promise.resolve({ success: false, reason: 'Only the active GM can replenish stables.' }); const now = worldTime(); const results = listStables({ gm: true }).filter(document => due(getStableData(document).stocking, now)).map(document => restockStable(document.id, { force: false, operationId: `stable-replenish-${document.id}-${now}` })); return Promise.all(results).then(valuesResult => ({ success: valuesResult.every(result => result.success), results: valuesResult })); }
export function initStableRestocking() { registerInventoryAuthority('stableReplenish', doReplenish); if (globalThis.__ospStableReplenishmentHook) return; globalThis.__ospStableReplenishmentHook = true; const schedule = () => { void restockDueStables().catch(error => console.error('Stable replenishment failed:', error)); }; globalThis.Hooks?.on?.('updateWorldTime', schedule); globalThis.Hooks?.on?.('ready', schedule); if (globalThis.game?.ready) queueMicrotask(schedule); }

export const __test = { due, validDays, currentFlag, randomPercent };
