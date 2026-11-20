import { getInnData, getInnDocument, listInns, INN_FLAG, INN_SCOPE } from './inn.js';
import { replenishInnOfferings } from './inn-profiles.js';
import { journalInnChange, runTransaction, snapshotJournal } from './transaction-journal.js';
import { registerInventoryAuthority, requestInventoryMutation } from './inventory-authority.js';

export { replenishInnOfferings } from './inn-profiles.js';

const clone = value => structuredClone(value);
const DAY = 86400;
const values = collection => collection?.contents ?? (typeof collection?.values === 'function' ? [...collection.values()] : Array.isArray(collection) ? collection : []);
const worldTime = () => Number.isFinite(Number(game?.time?.worldTime)) ? Number(game.time.worldTime) : 0;
const validDays = value => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 365;
function rawInn(document) { return document?.getFlag?.(INN_SCOPE, INN_FLAG) ?? document?.flags?.[INN_SCOPE]?.[INN_FLAG] ?? {}; }
function due(replenishment, at) { const interval = replenishment?.intervalDays ?? replenishment?.days; if (!replenishment?.enabled || !validDays(interval)) return false; const rawLast = replenishment.lastReplenishedWorldTime ?? replenishment.lastAt; const last = rawLast == null ? NaN : Number(rawLast); return !Number.isFinite(last) || at - last >= Number(interval) * DAY; }

async function doReplenish(details, message) {
  const requester = game?.users?.get?.(message?.userId) ?? game?.user;
  if (!requester?.isGM) return { success: false, reason: 'Only the GM can replenish inns.' };
  const document = getInnDocument(details.innId); if (!document) return { success: false, reason: 'Inn unavailable.' };
  const current = getInnData(document); const replenishment = current.replenishment ?? {};
  const now = worldTime(); if (details.force !== true && !due(replenishment, now)) return { success: true, outcome: 'not-due', inn: current };
  const before = snapshotJournal(document); const plan = replenishInnOfferings(current, { ...replenishment, seed: `${document.id}:${Math.floor(now / DAY)}` }); if (!plan.success) return plan;
  const next = clone(current); next.offerings = plan.offerings; next.replenishment = { ...replenishment, lastReplenishedWorldTime: now }; delete next.replenishment.lastAt; next.revision += 1;
  return runTransaction(null, { label: `Replenish inn: ${document.name}`, changes: [{ ...journalInnChange(document, { name: next.name, ownership: { default: next.accessible ? 2 : 0 }, flags: next, flag: INN_FLAG }), before }], authority: true, validate: () => JSON.stringify(snapshotJournal(document)) === JSON.stringify(before) });
}

export function replenishInn(innId, { force = true, operationId = null } = {}) { return requestInventoryMutation('innReplenish', { innId, force }, null, operationId); }
export function restockDueInns() { if (!game?.user?.isGM || game.users?.activeGM?.id !== game.user.id) return Promise.resolve({ success: false, reason: 'Only the active GM can replenish inns.' }); const results = []; for (const document of listInns({ gm: true })) { const current = getInnData(document); if (!due(current.replenishment, worldTime())) continue; results.push(replenishInn(document.id, { force: false, operationId: `inn-replenish-${document.id}-${worldTime()}` })); } return Promise.all(results).then(valuesResult => ({ success: valuesResult.every(result => result.success), results: valuesResult })); }
export function initInnReplenishment() {
  registerInventoryAuthority('innReplenish', doReplenish);
  if (globalThis.__ospInnReplenishmentHook) return;
  globalThis.__ospInnReplenishmentHook = true;
  const schedule = () => { void restockDueInns().catch(error => console.error('Inn replenishment failed:', error)); };
  globalThis.Hooks?.on?.('updateWorldTime', schedule);
  globalThis.Hooks?.on?.('ready', schedule);
  if (game.ready) queueMicrotask(schedule);
}
export const __test = { due, validDays, rawInn };
