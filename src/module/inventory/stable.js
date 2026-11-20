import { createDropDraft, diffDropDraft, dropDescendants, unchangedDropInventory } from './drop-transaction.js';
import { carriedFunds, stageStorePayment } from './store-payment.js';
import { COIN_TEMPLATES } from './treasure-cost.js';
import { canBeParent } from './containment.js';
import { flagChange, runTransaction, snapshotJournal } from './transaction-journal.js';
import { journalStableChange } from './transaction-journal.js';
import { registerInventoryAuthority, requestInventoryMutation, resolveInventoryActor, inventoryActorReference, currentInventoryOperation } from './inventory-authority.js';
import { STABLE_PROFILES, validateStableProfile } from './stable-profiles.js';
import { isUniqueStackItem } from './stack-identity.js';
import { calendarMinuteOfDay } from '../calendar/calendar-authority.js';

export const STABLE_SCOPE = 'osp-houserules';
export const STABLE_FLAG = 'stable';
export const STABLE_RECEIPTS_FLAG = 'stableReceipts';
const clone = value => structuredClone(value);
const values = collection => collection?.contents ?? (typeof collection?.values === 'function' ? [...collection.values()] : Array.isArray(collection) ? collection : []);
const id = () => globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2);
const DAY = 24 * 60 * 60;
let placementAdapter = async () => ({ success: false, reason: 'Stable placement adapter is unavailable.' });
let validateAdapter = async () => ({ allowed: false, reason: 'Stable placement validator is unavailable.' });

function itemObject(item) {
  const data = clone(item?.toObject ? item.toObject() : item);
  if (!data) return null;
  const result = { name: data.name, type: data.type, img: data.img, system: clone(data.system ?? {}), flags: clone(data.flags ?? {}) };
  result.system = { ...result.system, quantity: 1, containerId: null, equipped: false, lashed: false };
  return result;
}

export function stableItemKind(item) {
  if (!item) return null;
  const type = String(item.type ?? item.system?.type ?? '').toLowerCase();
  const tags = Array.isArray(item.system?.tags) ? item.system.tags.map(String).map(tag => tag.toLowerCase()) : [];
  const transport = String(item.system?.transportType ?? '').toLowerCase();
  if (type === 'vehicle' || transport === 'vehicle' || tags.includes('vehicle')) return 'vehicle';
  if (type === 'livestock' || type === 'mount' || transport === 'livestock' || tags.includes('livestock') || tags.includes('mount')) return 'animal';
  if (tags.includes('vehicle-parts')) return 'parts';
  if (type === 'tack' || tags.includes('tack')) return 'tack';
  return null;
}

function eligible(item, { named = false } = {}) {
  const kind = stableItemKind(item);
  if (!kind || !['livestock', 'item', 'container'].includes(item.type)) return false;
  if (item.system?.treasure || item.system?.magic || item.system?.isMagic || Number(item.system?.bonus) || item.system?.tags?.some(tag => /^(magic|magical)$/i.test(tag))) return false;
  if (isUniqueStackItem(item) && !(named && kind === 'animal')) return false;
  return true;
}

export function entryFromStableItem(item) {
  if (!eligible(item, { named: item?.system?.unique === true })) return null;
  const individual = stableItemKind(item) === 'animal' && (item.system?.unique === true || item.system?.named === true);
  return { id: id(), sourceUuid: item.uuid ?? null, itemData: itemObject(item), customPrice: null, stock: 1, hidden: false, managed: false, customStock: false, individual };
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const itemData = itemObject(raw.itemData ?? raw);
  if (!itemData || !eligible(itemData, { named: raw.individual === true || itemData.system?.unique === true })) return null;
  const kind = stableItemKind(itemData); const individual = kind === 'animal' && (raw.individual === true || itemData.system?.unique === true);
  const hasStock = Object.hasOwn(raw, 'stock');
  let stock = hasStock && raw.stock != null ? Number(raw.stock) : (individual ? 1 : null);
  if (stock != null && (!Number.isSafeInteger(stock) || stock < 0 || stock > 10000 || individual && stock > 1)) return null;
  if (individual) itemData.system.unique = true;
  return { id: String(raw.id ?? id()), sourceUuid: raw.sourceUuid == null ? null : String(raw.sourceUuid), itemData, customPrice: raw.customPrice == null ? null : Number(raw.customPrice), stock: stock ?? 0, hidden: raw.hidden === true, managed: raw.managed === true, customStock: raw.customStock === true, individual, ...(raw.name ? { name: String(raw.name).slice(0, 160) } : {}), ...(typeof raw.generatedPrice === 'boolean' ? { generatedPrice: raw.generatedPrice } : {}), ...(Number.isFinite(Number(raw.basePriceCp)) ? { basePriceCp: Number(raw.basePriceCp) } : {}), ...(Number.isSafeInteger(Number(raw.generatedStock)) ? { generatedStock: Number(raw.generatedStock) } : {}) };
}

function normalizeBooking(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return { id: String(raw.id), actorId: raw.actorId == null ? null : String(raw.actorId), actorUuid: raw.actorUuid == null ? null : String(raw.actorUuid), actorName: String(raw.actorName ?? ''), animalIds: Array.isArray(raw.animalIds) ? [...new Set(raw.animalIds.map(String))] : [], animalNames: Array.isArray(raw.animalNames) ? raw.animalNames.map(String) : [], quantity: Number.isSafeInteger(raw.quantity) ? raw.quantity : 0, startsAt: Number(raw.startsAt ?? 0), endsAt: Number(raw.endsAt ?? 0), checkedOut: raw.checkedOut === true };
}

export function emptyStable(name = 'New Stable') {
  return normalizeStable({ name });
}

export function normalizeStable(raw = {}) {
  const opening = raw.openingHours && typeof raw.openingHours === 'object' ? raw.openingHours : {};
  const boarding = raw.boarding && typeof raw.boarding === 'object' ? raw.boarding : {};
  const buybackRate = Number(raw.buybackRate ?? 50);
  return { version: 1, revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0, name: String(raw.name ?? 'New Stable'), description: String(raw.description ?? ''), img: String(raw.img ?? ''), proprietorName: String(raw.proprietorName ?? ''), proprietorImg: String(raw.proprietorImg ?? ''), accessible: raw.accessible === true, profileId: String(raw.profileId ?? 'livery'), entries: values(raw.entries).map(normalizeEntry).filter(Boolean), history: Array.isArray(raw.history) ? clone(raw.history) : [], bookings: values(raw.bookings).map(normalizeBooking).filter(Boolean), openingHours: { enabled: opening.enabled === true, openMinute: Number.isSafeInteger(opening.openMinute) && opening.openMinute >= 0 && opening.openMinute < 1440 ? opening.openMinute : 480, closeMinute: Number.isSafeInteger(opening.closeMinute) && opening.closeMinute >= 0 && opening.closeMinute < 1440 ? opening.closeMinute : 1080, override: ['auto', 'open', 'closed'].includes(opening.override) ? opening.override : 'auto' }, boarding: { enabled: boarding.enabled !== false, capacity: Number.isSafeInteger(boarding.capacity) && boarding.capacity > 0 && boarding.capacity <= 1000 ? boarding.capacity : 10, priceCp: Number.isSafeInteger(boarding.priceCp) && boarding.priceCp >= 0 ? boarding.priceCp : 10 }, buysFromPlayers: raw.buysFromPlayers === true, buybackRate: Number.isFinite(buybackRate) ? Math.min(100, Math.max(0, buybackRate)) : 50, restockPurchases: raw.restockPurchases === true, stocking: raw.stocking && typeof raw.stocking === 'object' ? clone(raw.stocking) : {} };
}

function rawStable(document) { return document?.getFlag?.(STABLE_SCOPE, STABLE_FLAG) ?? document?.flags?.[STABLE_SCOPE]?.[STABLE_FLAG] ?? null; }
export function getStableData(document) { return normalizeStable(rawStable(document) ?? document); }
export function getStableDocument(idValue) { const journals = globalThis.game?.journal; const document = journals?.get?.(idValue) ?? values(journals).find(doc => doc.id === idValue) ?? null; return rawStable(document)?.version === 1 ? document : null; }
export function listStables({ gm = Boolean(globalThis.game?.user?.isGM) } = {}) { return values(globalThis.game?.journal).filter(doc => rawStable(doc)?.version === 1 && (gm || rawStable(doc)?.accessible === true)); }

export function stableOpeningStatus(stable, at = Number(globalThis.game?.time?.worldTime ?? 0)) {
  const hours = normalizeStable(stable).openingHours;
  if (hours.override === 'open') return { open: true, label: 'Open by GM override', reason: 'Open by GM override.' };
  if (hours.override === 'closed') return { open: false, label: 'Closed by GM override', reason: 'Closed by GM override.' };
  if (!hours.enabled || hours.openMinute === hours.closeMinute) return { open: true, label: 'Open 24 hours (in-game)', reason: 'Open 24 hours.' };
  const minute = calendarMinuteOfDay(at);
  const open = hours.openMinute < hours.closeMinute ? minute >= hours.openMinute && minute < hours.closeMinute : minute >= hours.openMinute || minute < hours.closeMinute;
  return { open, label: `${String(Math.floor(hours.openMinute / 60)).padStart(2, '0')}:${String(hours.openMinute % 60).padStart(2, '0')}–${String(Math.floor(hours.closeMinute / 60)).padStart(2, '0')}:${String(hours.closeMinute % 60).padStart(2, '0')} (in-game)`, reason: open ? 'Open for service.' : 'Closed for service.' };
}

function unitPriceCp(stable, entry) {
  if (entry.customPrice != null) return Math.max(0, Math.round(Number(entry.customPrice) * 10));
  const cost = Number(entry.itemData?.system?.cost ?? 0);
  return Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 10) : null;
}
function activeBooking(booking, now) { return !booking.checkedOut && Number(booking.endsAt) > now; }
function bookingAnimalKeys(now = Number(globalThis.game?.time?.worldTime ?? 0)) { return new Set(listStables({ gm: true }).flatMap(doc => getStableData(doc).bookings.filter(b => activeBooking(b, now)).flatMap(b => b.animalIds.map(animalId => `${b.actorUuid ?? ''}:${b.actorId ?? ''}:${animalId}`)))); }
function actorAnimalKey(actor, itemId) { return `${actor?.uuid ?? ''}:${actor?.id ?? ''}:${itemId}`; }
function actorItems(actor) { return values(actor?.items); }

export function availableStableBoarding(stable, now = Number(globalThis.game?.time?.worldTime ?? 0)) {
  const data = normalizeStable(stable); const used = data.bookings.filter(b => activeBooking(b, now)).reduce((sum, b) => sum + Number(b.quantity || b.animalIds?.length || 0), 0);
  return Math.max(0, data.boarding.enabled ? data.boarding.capacity - used : 0);
}

export function quoteStable(stable, lines = [], { actor = null, now = Number(globalThis.game?.time?.worldTime ?? 0) } = {}) {
  const data = normalizeStable(stable); if (!Array.isArray(lines) || !lines.length || lines.length > 200) return { success: false, reason: 'The order is empty or too large.' };
  const seen = new Set(); const seenAnimals = new Set(); let boardingLines = 0; const quoted = []; let totalCp = 0;
  for (const raw of lines) {
    if (raw?.kind === 'boarding') {
      boardingLines += 1; const animalIds = Array.isArray(raw.animalIds) ? raw.animalIds.map(String) : []; const nights = Number(raw.nights ?? 1);
      if (boardingLines > 1 || !actor || !data.boarding.enabled || !animalIds.length || new Set(animalIds).size !== animalIds.length || !Number.isSafeInteger(nights) || nights < 1 || nights > 365 || animalIds.some(animalId => seenAnimals.has(animalId) || bookingAnimalKeys(now).has(actorAnimalKey(actor, animalId)))) return { success: false, reason: 'Choose available animals and a valid number of nights.' };
      const animals = actorItems(actor).filter(item => animalIds.includes(item.id) && stableItemKind(item) === 'animal' && Number(item.system?.quantity ?? 1) === 1);
      if (animals.length !== animalIds.length) return { success: false, reason: 'Each animal must be a separate livestock item before boarding.' };
      if (animalIds.length > availableStableBoarding(data, now)) return { success: false, reason: 'There is not enough boarding capacity.' };
      const unitPriceCp = data.boarding.priceCp; const lineTotalCp = unitPriceCp * animalIds.length * nights; totalCp += lineTotalCp; if (!Number.isSafeInteger(totalCp)) return { success: false, reason: 'The order total is unsafe.' }; animalIds.forEach(animalId => seenAnimals.add(animalId));
      quoted.push({ kind: 'boarding', name: `Boarding (${animalIds.length} animal${animalIds.length === 1 ? '' : 's'}, ${nights} night${nights === 1 ? '' : 's'})`, animalIds, nights, quantity: animalIds.length, unitPriceCp, lineTotalCp }); continue;
    }
    const entryId = String(raw?.entryId ?? ''); const quantity = Number(raw?.quantity); const entry = data.entries.find(candidate => candidate.id === entryId);
    if (!entry || seen.has(entryId) || entry.hidden || !Number.isSafeInteger(quantity) || quantity <= 0 || (entry.stock != null && quantity > entry.stock) || (entry.individual && quantity !== 1)) return { success: false, reason: 'The order contains an unavailable product.' };
    const unitPrice = unitPriceCp(data, entry); if (unitPrice == null) return { success: false, reason: 'The stable contains an invalid price.' };
    const lineTotalCp = unitPrice * quantity; totalCp += lineTotalCp; if (!Number.isSafeInteger(totalCp)) return { success: false, reason: 'The order total is unsafe.' };
    seen.add(entryId); quoted.push({ kind: stableItemKind(entry.itemData), entryId, name: entry.name ?? entry.itemData.name, quantity, unitPriceCp: unitPrice, lineTotalCp, itemData: clone(entry.itemData), destination: String(raw.destination ?? '') });
  }
  return { success: true, revision: data.revision, totalCp, lines: quoted, now };
}

function owns(user, actor) { const permission = actor?.testUserPermission ? actor.testUserPermission(user, 'OWNER') : ((actor?.ownership?.[user?.id] ?? actor?.ownership?.default ?? 0) >= 3); return Boolean(actor?.type === 'character' && (user?.isGM || (actor?.getFlag?.(STABLE_SCOPE, 'party') === true && permission))); }
function receiptChange(actor, receipt) { return flagChange(actor, STABLE_RECEIPTS_FLAG, [...(actor.getFlag?.(STABLE_SCOPE, STABLE_RECEIPTS_FLAG) ?? []), receipt]); }
function ownership(accessible) { return { default: accessible ? 2 : 0 }; }
function stableAfter(data) { return { name: data.name, ownership: ownership(data.accessible), flags: clone(data), flag: STABLE_FLAG }; }

function validateStableInput(raw) {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 100 || !Array.isArray(raw.entries) || raw.entries.length > 200) return 'Stable data is invalid.';
  const ids = new Set(); for (const rawEntry of raw.entries) { if (rawEntry && Object.hasOwn(rawEntry, 'stock') && rawEntry.stock != null && (!Number.isSafeInteger(Number(rawEntry.stock)) || Number(rawEntry.stock) < 0)) return 'Stable stock is invalid.'; const entry = normalizeEntry(rawEntry); if (!entry || ids.has(entry.id) || (entry.customPrice != null && (!Number.isSafeInteger(Math.round(entry.customPrice * 10)) || !Number.isFinite(entry.customPrice) || entry.customPrice < 0))) return 'Stable products are invalid.'; ids.add(entry.id); }
  if (raw.buybackRate != null && (!Number.isFinite(Number(raw.buybackRate)) || Number(raw.buybackRate) < 0 || Number(raw.buybackRate) > 100)) return 'Buyback rate is invalid.';
  if (raw.profileId != null && !STABLE_PROFILES.some(profile => profile.id === raw.profileId)) return 'Stable specialty is invalid.';
  const profileError = validateStableProfile(raw.stocking ?? {}); if (profileError) return profileError;
  if (raw.openingHours && (![raw.openingHours.openMinute, raw.openingHours.closeMinute].every(value => Number.isSafeInteger(value) && value >= 0 && value < 1440) || !['auto', 'open', 'closed'].includes(raw.openingHours.override ?? 'auto'))) return 'Opening hours are invalid.';
  if (raw.boarding && (!Number.isSafeInteger(Number(raw.boarding.capacity)) || Number(raw.boarding.capacity) < 1 || Number(raw.boarding.capacity) > 1000 || !Number.isSafeInteger(Number(raw.boarding.priceCp)) || Number(raw.boarding.priceCp) < 0)) return 'Boarding settings are invalid.';
  return null;
}

async function createStableDocument(data) {
  const validation = validateStableInput(data); if (validation) return { success: false, reason: validation }; const normalized = normalizeStable(data); normalized.accessible = false; normalized.revision = 0; normalized.bookings = []; normalized.history = [];
  const create = globalThis.game?.journal?.documentClass?.create ?? globalThis.JournalEntry?.create; if (!create) return { success: false, reason: 'Journal documents are unavailable.' };
  const document = await create.call(globalThis.game?.journal?.documentClass ? globalThis.game.journal.documentClass : globalThis.JournalEntry, { name: normalized.name, ownership: ownership(false), flags: { [STABLE_SCOPE]: { [STABLE_FLAG]: normalized } } });
  return { success: true, stable: document, data: normalized };
}
export async function createStable(data = {}) { return globalThis.game?.user?.isGM ? createStableDocument(data) : { success: false, reason: 'Only the GM can create stables.' }; }
export function saveStable(idValue, data, expectedRevision = null) { return requestInventoryMutation('stableSave', { id: idValue, data, expectedRevision }); }

async function doSave(details, message) {
  const user = globalThis.game?.users?.get?.(message?.userId) ?? globalThis.game?.user; if (!user?.isGM) return { success: false, reason: 'Only the GM can edit stables.' };
  const document = getStableDocument(details.id); if (!document) return { success: false, reason: 'Stable unavailable.' }; const current = getStableData(document);
  if (details.expectedRevision != null && details.expectedRevision !== current.revision) return { success: false, reason: 'Stable changed; reload before saving.' };
  const validation = validateStableInput(details.data); if (validation) return { success: false, reason: validation }; const next = normalizeStable(details.data); next.revision = current.revision + 1; next.bookings = clone(current.bookings); next.history = clone(current.history);
  if (next.boarding.capacity < current.bookings.filter(b => activeBooking(b, Number(globalThis.game?.time?.worldTime ?? 0))).reduce((sum, b) => sum + (b.quantity || b.animalIds.length), 0)) return { success: false, reason: 'Boarding capacity cannot be reduced below active stays.' };
  const result = await runTransaction(null, { label: `Save stable: ${next.name}`, changes: [journalStableChange(document, stableAfter(next))], authority: true }); return result.success ? { ...result, stable: next } : result;
}

async function doCheckout(details, message) {
  const actor = await resolveInventoryActor(details); const document = getStableDocument(details.stableId); const user = globalThis.game?.users?.get?.(message?.userId) ?? globalThis.game?.user; if (!actor || !document || !owns(user, actor)) return { success: false, reason: 'That character is not authorized to shop.' };
  const before = snapshotJournal(document); const current = getStableData(document); if (!current.accessible) return { success: false, reason: 'This stable is not currently accessible.' }; if (!stableOpeningStatus(current).open) return { success: false, reason: 'This stable is closed.' };
  const quote = quoteStable(current, details.quote?.lines ?? [], { actor }); if (!quote.success || details.quote?.revision !== current.revision || details.quote?.totalCp !== quote.totalCp) return { success: false, reason: quote.reason ?? 'Order changed; refresh before checkout.' };
  const placementLines = quote.lines.filter(line => line.kind !== 'boarding'); const placement = placementLines.length ? await placementAdapter(actor, placementLines) : { success: true, draftState: createDropDraft(actor), placements: [] }; if (!placement.success) return placement;
  const draft = placement.draftState ?? createDropDraft(actor); const paid = await stageStorePayment(draft.actor, quote.totalCp); if (!paid.success) return paid;
  const placementCheck = await validateAdapter(draft, placementLines);
  if (placementCheck === false || placementCheck?.allowed === false) return { success: false, reason: placementCheck?.reason ?? 'The resulting inventory cannot be carried.' };
  const fundsBefore = carriedFunds(actor), fundsAfter = carriedFunds(draft.actor);
  if (!fundsBefore.success || !fundsAfter.success || fundsBefore.totalCp - fundsAfter.totalCp !== quote.totalCp) return { success: false, reason: 'The carried coin payment could not be verified.' };
  const now = Number(globalThis.game?.time?.worldTime ?? 0); const fresh = getStableData(document); const freshQuote = quoteStable(fresh, details.quote?.lines ?? [], { actor, now }); if (!fresh.accessible || !stableOpeningStatus(fresh, now).open || fresh.revision !== quote.revision || !freshQuote.success || freshQuote.totalCp !== quote.totalCp) return { success: false, reason: 'Stable changed; refresh before completing.' }; const next = clone(fresh); next.revision += 1; const receipt = { id: currentInventoryOperation() ?? details.operationId, kind: 'purchase', stableId: document.id, stableName: document.name, actorId: actor.id, characterName: actor.name, timestamp: Date.now(), lines: quote.lines.map(line => ({ entryId: line.entryId, name: line.name, kind: line.kind, quantity: line.quantity, unitPriceCp: line.unitPriceCp })), totalCp: quote.totalCp, beforeCp: carriedFunds(actor).totalCp, afterCp: carriedFunds(draft.actor).totalCp }; next.history.push(receipt);
  for (const line of quote.lines.filter(line => line.kind !== 'boarding')) { const entry = next.entries.find(candidate => candidate.id === line.entryId); if (entry?.stock != null) entry.stock -= line.quantity; }
  for (const line of quote.lines.filter(line => line.kind === 'boarding')) next.bookings.push({ id: id(), actorId: actor.id, actorUuid: actor.uuid ?? null, actorName: actor.name, animalIds: line.animalIds, animalNames: line.animalIds.map(animalId => actorItems(actor).find(item => item.id === animalId)?.name ?? ''), quantity: line.quantity, startsAt: now, endsAt: now + line.nights * DAY, checkedOut: false });
  const changes = [...diffDropDraft(actor, draft), receiptChange(actor, receipt), { ...journalStableChange(document, stableAfter(next)), before }];
  return runTransaction(actor, { label: `Stable checkout: ${document.name}`, changes, authority: true, validate: () => { const latest = getStableData(document); const latestQuote = quoteStable(latest, details.quote?.lines ?? [], { actor }); return owns(user, actor) && unchangedDropInventory(draft) && latest.accessible && stableOpeningStatus(latest).open && latest.revision === fresh.revision && latestQuote.success && latestQuote.totalCp === quote.totalCp && JSON.stringify(snapshotJournal(document)) === JSON.stringify(before); } });
}
export function checkoutStable(actor, stableId, quote, operationId = null) { return requestInventoryMutation('stableCheckout', { ...inventoryActorReference(actor), stableId, quote }, null, operationId); }

function coinDestination(actor) { const items = actorItems(actor); const byId = new Map(items.map(item => [item.id, item])); const invalid = item => stableItemKind(item) === 'animal' || stableItemKind(item) === 'vehicle' || stableItemKind(item) === 'tack'; const carried = item => { const seen = new Set(); let parentId = item?.system?.containerId ?? null; while (parentId) { if (seen.has(parentId)) return false; seen.add(parentId); const parent = byId.get(parentId); if (!parent || invalid(parent) || !canBeParent(parent)) return false; parentId = parent.system?.containerId ?? null; } return Boolean(item?.system?.containerId); }; return items.find(item => item.type === 'coin' && carried(item))?.system?.containerId ?? items.find(item => item.type === 'container' && !invalid(item) && canBeParent(item))?.id ?? null; }
async function creditCoins(actor, totalCp) { const destination = coinDestination(actor); if (!destination) return { success: false, reason: 'A carried coin container is required for payment.' }; let remaining = totalCp; const quantities = { 'Gold Coins': Math.floor(remaining / 100) }; remaining %= 100; quantities['Silver Coins'] = Math.floor(remaining / 10); quantities['Copper Coins'] = remaining % 10; for (const [name, quantity] of Object.entries(quantities)) if (quantity) { const existing = actorItems(actor).find(item => item.type === 'coin' && item.name === name && item.system?.containerId === destination); if (existing) await actor.updateEmbeddedDocuments('Item', [{ _id: existing.id, 'system.quantity': Number(existing.system.quantity ?? 0) + quantity }]); else await actor.createEmbeddedDocuments('Item', [{ ...clone(COIN_TEMPLATES[name]), system: { ...clone(COIN_TEMPLATES[name].system), quantity, containerId: destination } }]); } return { success: true }; }
export function quoteStableSale(actor, stable, lines = []) { const data = normalizeStable(stable); if (!data.accessible || !data.buysFromPlayers || !actor || !Array.isArray(lines) || !lines.length || lines.length > 200) return { success: false, reason: 'This stable does not buy from players.' }; const boarded = bookingAnimalKeys(); const seen = new Set(); const quoted = []; let totalCp = 0; for (const line of lines) { const item = actorItems(actor).find(candidate => candidate.id === line?.itemId); const quantity = Number(line?.quantity); const kind = stableItemKind(item); let descendants = []; try { descendants = dropDescendants(actor, item?.id); } catch (_) { return { success: false, reason: 'That item has invalid containment.' }; } const parentId = item?.system?.containerId; const parent = parentId ? actorItems(actor).find(candidate => candidate.id === parentId) : null; if (!item || seen.has(item.id) || !kind || !eligible(item, { named: kind === 'animal' }) || boarded.has(actorAnimalKey(actor, item.id)) || item.system?.equipped || item.system?.lashed || item.system?.treasure || item.system?.magic || item.system?.isMagic || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > Number(item.system?.quantity ?? 1) || descendants.length || (parentId && !parent)) return { success: false, reason: 'That animal or equipment cannot be sold here.' }; const unitPriceCp = Math.round(Number(item.system?.cost ?? 0) * 10 * data.buybackRate / 100); if (!Number.isSafeInteger(unitPriceCp) || unitPriceCp <= 0) return { success: false, reason: 'That item has no buyback value.' }; totalCp += unitPriceCp * quantity; if (!Number.isSafeInteger(totalCp)) return { success: false, reason: 'The sale total is unsafe.' }; seen.add(item.id); quoted.push({ itemId: item.id, quantity, unitPriceCp, name: item.name, itemData: itemObject(item) }); } return { success: true, revision: data.revision, totalCp, lines: quoted, actorFingerprint: JSON.stringify(quoted.map(line => [line.itemId, line.quantity, line.itemData])) }; }
async function doSale(details, message) {
  const actor = await resolveInventoryActor(details), document = getStableDocument(details.stableId);
  const user = globalThis.game?.users?.get?.(message?.userId) ?? globalThis.game?.user;
  if (!actor || !document || !owns(user, actor)) return { success: false, reason: 'That character is not authorized to sell.' };
  const before = snapshotJournal(document), current = getStableData(document);
  if (!current.accessible || !stableOpeningStatus(current).open) return { success: false, reason: 'This stable is not open for sales.' };
  const quote = quoteStableSale(actor, current, details.quote?.lines ?? []);
  if (!quote.success || details.quote?.revision !== current.revision || details.quote?.totalCp !== quote.totalCp || details.quote?.actorFingerprint !== quote.actorFingerprint) return { success: false, reason: quote.reason ?? 'Sale changed; refresh before completing.' };
  if (current.restockPurchases && current.entries.length + quote.lines.length > 200) return { success: false, reason: 'The stable is full. Ask the GM to make room before selling more stock.' };
  const beforeFunds = carriedFunds(actor); if (!beforeFunds.success) return beforeFunds;
  const draft = createDropDraft(actor);
  for (const line of quote.lines) {
    const item = draft.items.get(line.itemId);
    if (!item) return { success: false, reason: 'Sold item changed; refresh before completing.' };
    if (line.quantity === Number(item.system.quantity)) await item.delete();
    else await draft.actor.updateEmbeddedDocuments('Item', [{ _id: item.id, 'system.quantity': Number(item.system.quantity) - line.quantity }]);
  }
  const paid = await creditCoins(draft.actor, quote.totalCp); if (!paid.success) return paid;
  const capacity = await validateAdapter(draft, quote.lines);
  if (capacity === false || capacity?.allowed === false) return { success: false, reason: capacity?.reason ?? 'The sale proceeds cannot be carried.' };
  const afterFunds = carriedFunds(draft.actor);
  if (!afterFunds.success || afterFunds.totalCp !== beforeFunds.totalCp + quote.totalCp) return { success: false, reason: 'Sale payment could not be placed in carried funds.' };
  const receipt = { id: currentInventoryOperation() ?? details.operationId, kind: 'sale', stableId: document.id, stableName: document.name, actorId: actor.id, characterName: actor.name, timestamp: Date.now(), beforeCp: beforeFunds.totalCp, afterCp: afterFunds.totalCp, totalCp: quote.totalCp, lines: quote.lines.map(({ itemId, name, quantity, unitPriceCp }) => ({ itemId, name, quantity, unitPriceCp })) };
  const changes = [...diffDropDraft(actor, draft), receiptChange(actor, receipt)], next = clone(current);
  next.revision += 1; next.history.push(receipt);
  if (next.restockPurchases) for (const line of quote.lines) {
    const entry = entryFromStableItem(line.itemData);
    if (!entry || line.quantity > 10000) return { success: false, reason: 'That item cannot become stable stock.' };
    entry.stock = line.quantity; next.entries.push(entry);
  }
  changes.push({ ...journalStableChange(document, stableAfter(next)), before });
  return runTransaction(actor, { label: 'Stable sale: ' + document.name, changes, authority: true, validate: () => {
    const live = getStableData(document), fresh = quoteStableSale(actor, live, details.quote?.lines ?? []);
    return owns(user, actor) && unchangedDropInventory(draft) && live.accessible && stableOpeningStatus(live).open && fresh.success && fresh.actorFingerprint === quote.actorFingerprint && fresh.totalCp === quote.totalCp && JSON.stringify(snapshotJournal(document)) === JSON.stringify(before);
  } });
}
export function completeStableSale(actor, stableId, quote, operationId = null) { return requestInventoryMutation('stableSale', { ...inventoryActorReference(actor), stableId, quote }, null, operationId); }
export function endStableBooking(stableId, bookingId) { return requestInventoryMutation('stableEndBooking', { stableId, bookingId }); }
async function doEndBooking(details, message) { const user = globalThis.game?.users?.get?.(message?.userId) ?? globalThis.game?.user; if (!user?.isGM) return { success: false, reason: 'Only the GM can check out boarding.' }; const doc = getStableDocument(details.stableId); if (!doc) return { success: false, reason: 'Stable unavailable.' }; const current = getStableData(doc); const booking = current.bookings.find(item => item.id === details.bookingId); if (!booking) return { success: false, reason: 'Booking unavailable.' }; const next = clone(current); next.revision += 1; next.bookings.find(item => item.id === booking.id).checkedOut = true; return runTransaction(null, { label: `End stable booking: ${doc.name}`, changes: [journalStableChange(doc, stableAfter(next))], authority: true }); }
export function initStables({ planPlacement, validatePlacement } = {}) { if (planPlacement) placementAdapter = planPlacement; if (validatePlacement) validateAdapter = validatePlacement; registerInventoryAuthority('stableSave', doSave); registerInventoryAuthority('stableCheckout', doCheckout); registerInventoryAuthority('stableSale', doSale); registerInventoryAuthority('stableEndBooking', doEndBooking); }
export const __test = { validateStableInput, normalizeEntry, activeBooking, itemObject };
