import { createDropDraft, diffDropDraft, unchangedDropInventory } from './drop-transaction.js';
import { carriedFunds, stageStorePayment } from './store-payment.js';
import { flagChange, journalInnChange, runTransaction, snapshotJournal } from './transaction-journal.js';
import { registerInventoryAuthority, requestInventoryMutation, resolveInventoryActor, inventoryActorReference, currentInventoryOperation } from './inventory-authority.js';
import { eligibleStoreItem, entryFromItem } from './store.js';
import { isUniqueStackItem } from './stack-identity.js';
import { innProfileDefaults, validateInnProfile, specialtyIdentity, normalizeSpecialtyName } from './inn-profiles.js';
import { calendarMinuteOfDay } from '../calendar/calendar-authority.js';

export const INN_SCOPE = 'osp-houserules';
export const INN_FLAG = 'inn';
export const INN_RECEIPTS_FLAG = 'innReceipts';
const clone = value => structuredClone(value);
const values = collection => collection?.contents ?? (typeof collection?.values === 'function' ? [...collection.values()] : Array.isArray(collection) ? collection : []);
const id = () => globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2);
const DAY = 24 * 60 * 60;
const kinds = new Set(['meal', 'drink', 'room', 'bed', 'stabling', 'takeaway']);
const establishmentTypes = new Set(['tavern', 'inn', 'both']);
let placementAdapter = async () => ({ success: false, reason: 'Takeaway placement adapter is unavailable.' });
let validateAdapter = async () => ({ allowed: true });

function normalizeOffering(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const kind = String(raw.kind ?? 'meal');
  if (!kinds.has(kind)) return null;
  if (typeof raw.priceCp !== 'number' || raw.quantity != null && typeof raw.quantity !== 'number' || raw.capacity != null && typeof raw.capacity !== 'number') return null;
  const priceCp = Number(raw.priceCp);
  const quantity = raw.quantity == null ? null : Number(raw.quantity);
  const capacity = Number(raw.capacity ?? (kind === 'bed' ? 1 : 1));
  if (!Number.isSafeInteger(priceCp) || priceCp < 0 || (quantity != null && (!Number.isSafeInteger(quantity) || quantity < 0)) || !Number.isSafeInteger(capacity) || capacity < 1) return null;
  if ((kind === 'room' || kind === 'bed' || kind === 'stabling') && quantity == null) return null;
  if (kind === 'bed' && capacity !== 1 || quantity > 10000 || capacity > 1000) return null;
  const amenities = Array.isArray(raw.amenities) ? raw.amenities.map(value => String(value)).join(', ') : String(raw.amenities ?? '');
  return { id: String(raw.id ?? id()), name: String(raw.name ?? '').slice(0, 160), description: String(raw.description ?? '').slice(0, 1000), amenities: amenities.slice(0, 1000), kind, priceCp, originalBasePriceCp: Number.isSafeInteger(raw.originalBasePriceCp) && raw.originalBasePriceCp >= 0 ? raw.originalBasePriceCp : priceCp, quantity, capacity, enabled: raw.enabled !== false, managed: raw.managed === true, signature: raw.signature === true, specialtyKey: typeof raw.specialtyKey === 'string' ? raw.specialtyKey.slice(0, 240) : null, sourceId: raw.sourceId == null ? null : String(raw.sourceId), catalogItemUuid: raw.catalogItemUuid == null ? null : String(raw.catalogItemUuid) };
}

function normalizeBooking(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !Array.isArray(raw.lines)) return null;
  return { id: raw.id, actorId: raw.actorId == null ? null : String(raw.actorId), actorName: String(raw.actorName ?? ''), createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : 0, endsAt: Number.isFinite(Number(raw.endsAt)) ? Number(raw.endsAt) : 0, checkedOut: raw.checkedOut === true, guests: Array.isArray(raw.guests) ? raw.guests.map(g => ({ id: String(g.id ?? ''), name: String(g.name ?? '') })).filter(g => g.id) : [], lines: raw.lines.map(line => ({ offeringId: String(line.offeringId ?? ''), quantity: Number(line.quantity), nights: Number(line.nights), capacity: Number(line.capacity), unitPriceCp: Number(line.unitPriceCp) })).filter(line => line.offeringId && Number.isSafeInteger(line.quantity) && line.quantity > 0) };
}

export function emptyInn(name = 'New Inn') {
  return normalizeInn({ name, type: 'both', offerings: [], bookings: [], history: [], replenishment: { enabled: false, intervalDays: 7, lastReplenishedWorldTime: null } });
}

export function normalizeInn(raw = {}) {
  const replenishment = raw.replenishment && typeof raw.replenishment === 'object' ? raw.replenishment : {};
  const intervalDays = Number.isSafeInteger(Number(replenishment.intervalDays ?? replenishment.days)) && Number(replenishment.intervalDays ?? replenishment.days) >= 1 && Number(replenishment.intervalDays ?? replenishment.days) <= 365 ? Number(replenishment.intervalDays ?? replenishment.days) : 7;
  const profile = innProfileDefaults({ ...replenishment, type: replenishment.type ?? raw.type, intervalDays });
  delete profile.invalidBounds;
  const todaySpecialRaw = raw.todaySpecial && typeof raw.todaySpecial === 'object' ? raw.todaySpecial : {};
  const discount = Number.isSafeInteger(todaySpecialRaw.discountPercent) && todaySpecialRaw.discountPercent >= 0 && todaySpecialRaw.discountPercent <= 100 ? todaySpecialRaw.discountPercent : 0;
  const openingRaw = raw.openingHours && typeof raw.openingHours === 'object' ? raw.openingHours : {};
  const openingHours = {
    enabled: openingRaw.enabled === true,
    openMinute: Number.isSafeInteger(openingRaw.openMinute) && openingRaw.openMinute >= 0 && openingRaw.openMinute < 1440 ? openingRaw.openMinute : 480,
    closeMinute: Number.isSafeInteger(openingRaw.closeMinute) && openingRaw.closeMinute >= 0 && openingRaw.closeMinute < 1440 ? openingRaw.closeMinute : 1380,
    override: ['auto', 'open', 'closed'].includes(openingRaw.override) ? openingRaw.override : 'auto'
  };
  const revealedRumors = Array.isArray(raw.revealedRumors) ? raw.revealedRumors.slice(0, 50).map(entry => ({ id: String(entry?.id ?? id()), text: String(entry?.text ?? '').slice(0, 1000) })).filter(entry => entry.text.trim()) : [];
  return { version: 1, revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0, name: String(raw.name ?? 'New Inn'), description: String(raw.description ?? ''), img: String(raw.img ?? ''), proprietorName: String(raw.proprietorName ?? ''), proprietorImg: String(raw.proprietorImg ?? ''), type: establishmentTypes.has(raw.type) ? raw.type : 'both', accessible: raw.accessible === true, todaySpecial: { offeringId: todaySpecialRaw.offeringId == null ? null : String(todaySpecialRaw.offeringId), discountPercent: discount }, openingHours, revealedRumors, offerings: values(raw.offerings).map(normalizeOffering).filter(Boolean), bookings: values(raw.bookings).map(normalizeBooking).filter(Boolean), history: Array.isArray(raw.history) ? clone(raw.history) : [], replenishment: { ...profile, enabled: replenishment.enabled === true, intervalDays, lastReplenishedWorldTime: Number.isFinite(Number(replenishment.lastReplenishedWorldTime ?? replenishment.lastAt)) ? Number(replenishment.lastReplenishedWorldTime ?? replenishment.lastAt) : null } };
}

export function innOfferingPrice(inn, offering) {
  const data = normalizeInn(inn); const item = typeof offering === 'string' ? data.offerings.find(entry => entry.id === offering) : offering;
  if (!item) return 0;
  const special = data.todaySpecial?.offeringId === item.id && ['meal', 'drink'].includes(item.kind) && item.enabled;
  const discount = special ? data.todaySpecial.discountPercent : 0;
  return Math.max(0, Math.round(item.priceCp * (100 - discount) / 100));
}

export function innOpeningStatus(inn, at = Number(globalThis.game?.time?.worldTime ?? 0)) {
  const data = normalizeInn(inn); const hours = data.openingHours;
  if (hours.override === 'open') return { open: true, label: 'Open by GM override', reason: 'Open by GM override.' };
  if (hours.override === 'closed') return { open: false, label: 'Closed by GM override', reason: 'Closed by GM override.' };
  if (!hours.enabled || hours.openMinute === hours.closeMinute) return { open: true, label: 'Open 24 hours (in-game)', reason: 'Open 24 hours.' };
  const minute = calendarMinuteOfDay(at);
  const open = hours.openMinute < hours.closeMinute ? minute >= hours.openMinute && minute < hours.closeMinute : minute >= hours.openMinute || minute < hours.closeMinute;
  const format = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  const label = `${format(hours.openMinute)}–${format(hours.closeMinute)} (in-game)`;
  return { open, label, reason: open ? `Open for service (${label}).` : `Closed for service (${label}).` };
}

function innRaw(document) { return document?.getFlag?.(INN_SCOPE, INN_FLAG) ?? document?.flags?.[INN_SCOPE]?.[INN_FLAG] ?? null; }
export function getInnData(document) { return normalizeInn(innRaw(document) ?? document); }
export function getInnDocument(idValue) { const document = globalThis.game?.journal?.get?.(idValue) ?? values(globalThis.game?.journal).find(j => j.id === idValue); return innRaw(document)?.version === 1 ? document : null; }
export function listInns({ gm = Boolean(globalThis.game?.user?.isGM) } = {}) { return values(globalThis.game?.journal).filter(doc => innRaw(doc)?.version === 1 && (gm || innRaw(doc)?.accessible === true)); }

const specialtyName = normalizeSpecialtyName;
export function innSpecialtyReservations(exceptId = null, additionalOfferings = []) {
  const offerings = [...listInns({ gm: true }).filter(doc => doc.id !== exceptId).flatMap(doc => getInnData(doc).offerings), ...additionalOfferings].filter(offering => specialtyIdentity(offering));
  return { reservedSpecialtyKeys: offerings.map(specialtyIdentity), reservedSpecialtyNames: offerings.map(offering => offering.name) };
}
function validateSpecialties(data, exceptId = null, previous = null) {
  const reserved = innSpecialtyReservations(exceptId);
  const keys = new Set(reserved.reservedSpecialtyKeys); const names = new Set(reserved.reservedSpecialtyNames.map(specialtyName));
  for (const offering of data.offerings) {
    const key = specialtyIdentity(offering); if (!key) continue;
    const old = previous?.offerings.find(entry => entry.id === offering.id);
    const unchanged = old && specialtyIdentity(old) === key && specialtyName(old.name) === specialtyName(offering.name);
    if (!unchanged && (keys.has(key) || names.has(specialtyName(offering.name)))) return 'A house specialty is already served elsewhere. Regenerate the menu preview before saving.';
    keys.add(key); names.add(specialtyName(offering.name));
  }
  return null;
}

function validateInnInput(raw) {
  if (!raw || !Array.isArray(raw.offerings) || raw.offerings.length > 200 || !Array.isArray(raw.bookings) || !Array.isArray(raw.history)) return 'Inn data is invalid.';
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 100) return 'Give the inn a name of 1–100 characters.';
  if (!establishmentTypes.has(raw.type)) return 'Inn type is invalid.';
  if (raw.accessible != null && typeof raw.accessible !== 'boolean') return 'Accessibility is invalid.';
  if (raw.todaySpecial != null) {
    if (!raw.todaySpecial || typeof raw.todaySpecial !== 'object' || (raw.todaySpecial.offeringId != null && typeof raw.todaySpecial.offeringId !== 'string') || !Number.isSafeInteger(raw.todaySpecial.discountPercent) || raw.todaySpecial.discountPercent < 0 || raw.todaySpecial.discountPercent > 100) return 'Today\'s special is invalid.';
    if (raw.todaySpecial.offeringId != null) {
      const selected = raw.offerings.find(entry => String(entry?.id ?? '') === raw.todaySpecial.offeringId);
      if (!selected || selected.enabled === false || !['meal', 'drink'].includes(selected.kind)) return 'Today\'s special must be an enabled meal or drink.';
    }
  }
  if (raw.openingHours != null) {
    const hours = raw.openingHours;
    if (!hours || typeof hours !== 'object' || typeof hours.enabled !== 'boolean' || !Number.isSafeInteger(hours.openMinute) || hours.openMinute < 0 || hours.openMinute >= 1440 || !Number.isSafeInteger(hours.closeMinute) || hours.closeMinute < 0 || hours.closeMinute >= 1440 || !['auto', 'open', 'closed'].includes(hours.override ?? 'auto')) return 'Opening hours are invalid.';
  }
  if (raw.revealedRumors != null && (!Array.isArray(raw.revealedRumors) || raw.revealedRumors.length > 50 || raw.revealedRumors.some(entry => !entry || typeof entry.text !== 'string' || entry.text.length > 1000))) return 'Revealed rumors are invalid.';
  const profileError = validateInnProfile(raw.replenishment ?? {});
  if (profileError) return profileError;
  const ids = new Set();
  for (const rawOffering of raw.offerings) { const offering = normalizeOffering(rawOffering); if (!offering || !offering.name || ids.has(offering.id)) return 'Inn offerings are invalid.'; ids.add(offering.id); }
  return null;
}

function ownership(accessible) { return { default: accessible ? 2 : 0 }; }
function innAfter(document, data) { return { name: data.name, ownership: ownership(data.accessible), flags: clone(data), flag: INN_FLAG }; }
async function createInnDocument(data) {
  const validation = validateInnInput(data);
  if (validation) return { success: false, reason: validation };
  const normalized = normalizeInn(data); normalized.accessible = false;
  const specialtyError = validateSpecialties(normalized); if (specialtyError) return { success: false, reason: specialtyError };
  normalized.bookings = []; normalized.history = []; normalized.revision = 0;
  const create = globalThis.game?.journal?.documentClass?.create ?? globalThis.JournalEntry?.create;
  if (!create) return { success: false, reason: 'Journal documents are unavailable.' };
  const journal = await create.call(globalThis.game?.journal?.documentClass ? globalThis.game.journal.documentClass : globalThis.JournalEntry, { name: normalized.name, ownership: ownership(false), flags: { [INN_SCOPE]: { [INN_FLAG]: normalized } } });
  return { success: true, inn: journal, data: normalized };
}
export async function createInn(data = {}) { return globalThis.game?.user?.isGM ? createInnDocument(data) : { success: false, reason: 'Only the GM can create inns.' }; }
export function saveInn(idValue, data, expectedRevision = null) { return requestInventoryMutation('innSave', { id: idValue, data, expectedRevision }); }

function activeBooking(booking, now) { return !booking.checkedOut && booking.endsAt > now; }
export function availableInnQuantity(inn, offering, now = Number(globalThis.game?.time?.worldTime ?? 0)) {
  const data = normalizeInn(inn); const item = typeof offering === 'string' ? data.offerings.find(o => o.id === offering) : offering;
  if (!item) return 0; if (item.quantity == null) return Infinity;
  const used = data.bookings.filter(b => activeBooking(b, now)).flatMap(b => b.lines).filter(line => line.offeringId === item.id).reduce((sum, line) => sum + line.quantity, 0);
  return Math.max(0, item.quantity - used);
}

function partyActors() { return values(globalThis.game?.actors); }
function guestLookup(ids) { return ids.map(idValue => partyActors().find(actor => actor.id === idValue)).filter(Boolean); }
function ownsCharacter(user, actor) { const owner = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3; return Boolean(actor?.type === 'character' && (user?.isGM || (actor.getFlag?.(INN_SCOPE, 'party') === true && (actor.testUserPermission?.(user, 'OWNER') ?? ((actor.ownership?.[user?.id] ?? actor.ownership?.default ?? 0) >= owner))))); }

export function quoteInn(inn, lines = [], { now = Number(globalThis.game?.time?.worldTime ?? 0) } = {}) {
  const data = normalizeInn(inn); if (!Array.isArray(lines) || !lines.length || lines.length > 100) return { success: false, reason: 'The order is empty or too large.' };
  const seen = new Set(); const guests = new Set(); let totalCp = 0; const quoted = [];
  for (const line of lines) {
    if (!line || typeof line.offeringId !== 'string' || seen.has(line.offeringId)) return { success: false, reason: 'The order contains an invalid offering.' };
    const offering = data.offerings.find(o => o.id === line.offeringId); const quantity = Number(line.quantity); const nights = Number(line.nights ?? 1); const guestIds = Array.isArray(line.guestIds) ? line.guestIds.map(String) : [];
    if (!offering || !offering.enabled || !Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(nights) || nights < 1 || nights > 365 || new Set(guestIds).size !== guestIds.length || guestIds.some(idValue => guests.has(idValue)) || (partyActors().length > 0 && guestIds.some(idValue => !guestLookup([idValue]).length))) return { success: false, reason: 'The order contains an unavailable offering or guest.' };
    if (['room', 'bed'].includes(offering.kind) && guestIds.length === 0) return { success: false, reason: 'Select at least one guest for a room or bed.' };
    if (!['room', 'bed', 'stabling'].includes(offering.kind) && guestIds.length) return { success: false, reason: 'Guests may only be assigned to lodging.' };
    if ((offering.kind === 'room' || offering.kind === 'bed' || offering.kind === 'stabling') && quantity > availableInnQuantity(data, offering, now)) return { success: false, reason: 'There is not enough lodging capacity available.' };
    if (offering.kind !== 'room' && offering.kind !== 'bed' && offering.kind !== 'stabling' && offering.quantity != null && quantity > offering.quantity) return { success: false, reason: 'There is not enough stock available.' };
    if ((offering.kind === 'room' || offering.kind === 'bed') && guestIds.length > quantity * offering.capacity) return { success: false, reason: 'The selected rooms cannot accommodate the guests.' };
    guestIds.forEach(idValue => guests.add(idValue)); const unitPriceCp = innOfferingPrice(data, offering); const lineTotalCp = unitPriceCp * quantity * ((offering.kind === 'room' || offering.kind === 'bed' || offering.kind === 'stabling') ? nights : 1);
    if (!Number.isSafeInteger(lineTotalCp) || (totalCp += lineTotalCp) > Number.MAX_SAFE_INTEGER) return { success: false, reason: 'The order total is unsafe.' };
    seen.add(line.offeringId); quoted.push({ offeringId: offering.id, name: offering.name, kind: offering.kind, quantity, nights, guestIds, unitPriceCp, originalUnitPriceCp: offering.priceCp, discountPercent: data.todaySpecial?.offeringId === offering.id ? data.todaySpecial.discountPercent : 0, lineTotalCp, capacity: offering.capacity, catalogItemUuid: offering.catalogItemUuid ?? null });
  }
  return { success: true, revision: data.revision, totalCp, lines: quoted, now };
}

async function doSave(details, message) {
  const requester = globalThis.game?.users?.get?.(message?.userId) ?? globalThis.game?.user; if (!requester?.isGM) return { success: false, reason: 'Only the GM can edit inns.' };
  const document = getInnDocument(details.id); if (!document) return { success: false, reason: 'Inn unavailable.' }; const current = getInnData(document);
  if (details.expectedRevision != null && details.expectedRevision !== current.revision) return { success: false, reason: 'Inn changed; reload before saving.' };
  const validation = validateInnInput(details.data); if (validation) return { success: false, reason: validation }; const next = normalizeInn(details.data);
  const specialtyError = validateSpecialties(next, document.id, current); if (specialtyError) return { success: false, reason: specialtyError };
  const active = current.bookings.filter(b => activeBooking(b, Number(globalThis.game?.time?.worldTime ?? 0)));
  const occupied = new Map();
  for (const booking of active) for (const line of booking.lines) {
    const currentUse = occupied.get(line.offeringId) ?? { quantity: 0, capacity: 0 };
    currentUse.quantity += line.quantity;
    currentUse.capacity = Math.max(currentUse.capacity, line.capacity ?? 1);
    occupied.set(line.offeringId, currentUse);
  }
  for (const [offeringId, use] of occupied) { const before = current.offerings.find(o => o.id === offeringId); const after = next.offerings.find(o => o.id === offeringId); if (!after || after.kind !== before?.kind || after.capacity < use.capacity || (after.quantity != null && after.quantity < use.quantity)) return { success: false, reason: 'Active bookings prevent removing or reducing that offering.' }; }
  next.bookings = clone(current.bookings); next.history = clone(current.history); next.revision = current.revision + 1;
  const result = await runTransaction(null, { label: `Save inn: ${next.name}`, changes: [journalInnChange(document, innAfter(document, next))], authority: true, validate: () => !validateSpecialties(next, document.id, current) });
  return result.success ? { ...result, inn: next } : result;
}

async function doCheckout(details, message) {
  const actor = await resolveInventoryActor(details); const document = getInnDocument(details.innId); const user = globalThis.game?.users?.get?.(message.userId) ?? globalThis.game?.user;
  if (!actor || !document || !ownsCharacter(user, actor)) return { success: false, reason: 'That character is not authorized to book here.' };
  const before = snapshotJournal(document); const current = getInnData(document); if (!current.accessible) return { success: false, reason: 'This establishment is not currently accessible.' };
  const now = Number(globalThis.game?.time?.worldTime ?? 0);
  if (!innOpeningStatus(current, now).open) return { success: false, reason: innOpeningStatus(current, now).reason };
  const inputLines = (details.quote?.lines ?? []).map(line => ['room', 'bed'].includes(current.offerings.find(o => o.id === line?.offeringId)?.kind) && (!Array.isArray(line.guestIds) || !line.guestIds.length) ? { ...line, guestIds: [actor.id] } : line);
  const requestedGuests = [...new Set(inputLines.flatMap(line => Array.isArray(line.guestIds) ? line.guestIds.map(String) : []))];
  if (requestedGuests.some(guestId => !partyActors().some(candidate => candidate.id === guestId && candidate.type === 'character' && (user?.isGM || candidate.getFlag?.(INN_SCOPE, 'party') === true)))) return { success: false, reason: 'A selected guest is no longer a valid party character.' };
  const quote = quoteInn(current, inputLines, { now }); if (!quote.success || quote.revision !== details.quote?.revision || quote.totalCp !== details.quote?.totalCp) return { success: false, reason: quote.reason ?? 'The order changed; refresh before checkout.' };
  const takeawayLines = quote.lines.filter(line => line.kind === 'takeaway');
  let placement = { success: true, draftState: null };
  if (takeawayLines.length) {
    const prepared = [];
    for (const line of takeawayLines) {
      const item = await resolveCatalogItem(line.catalogItemUuid);
      if (!item || !eligibleStoreItem(item) || isUniqueStackItem(item) && line.quantity > 1) return { success: false, reason: 'A takeaway catalog item is no longer available or cannot be stacked.' };
      const entry = entryFromItem(item);
      if (!entry) return { success: false, reason: 'A takeaway catalog item is invalid.' };
      prepared.push({ ...line, entryId: line.offeringId, itemData: entry.itemData });
    }
    placement = await placementAdapter(actor, prepared);
    if (!placement?.success) return placement;
    if (!placement.draftState) return { success: false, reason: 'Takeaway placement did not produce an inventory draft.' };
  }
  const draft = placement.draftState ?? createDropDraft(actor); const paid = await stageStorePayment(draft.actor, quote.totalCp); if (!paid.success) return paid;
  const placementCheck = await validateAdapter(draft, takeawayLines);
  if (placementCheck === false || placementCheck?.allowed === false) return { success: false, reason: placementCheck?.reason ?? 'This item cannot be placed.' };
  const next = clone(current); next.revision += 1;
  const bookingLines = quote.lines.filter(line => ['room', 'bed', 'stabling'].includes(line.kind));
  const bookings = bookingLines.map(line => ({ id: id(), actorId: actor.id, actorName: actor.name, createdAt: now, endsAt: now + line.nights * DAY, checkedOut: false, guests: line.guestIds.map(idValue => { const guest = partyActors().find(a => a.id === idValue); return { id: idValue, name: guest?.name ?? idValue }; }), lines: [{ offeringId: line.offeringId, quantity: line.quantity, nights: line.nights, capacity: line.capacity, unitPriceCp: line.unitPriceCp }] }));
  next.bookings.push(...bookings);
  for (const line of quote.lines) { const offering = next.offerings.find(o => o.id === line.offeringId); if (offering?.quantity != null && !['room', 'bed', 'stabling'].includes(line.kind)) offering.quantity -= line.quantity; }
  const receipt = { id: currentInventoryOperation() ?? details.operationId, innId: document.id, innName: document.name, actorId: actor.id, characterName: actor.name, timestamp: Date.now(), lines: clone(quote.lines), totalCp: quote.totalCp, beforeCp: carriedFunds(actor).totalCp, afterCp: carriedFunds(draft.actor).totalCp, bookingIds: bookings.map(booking => booking.id) };
  next.history.push(receipt);
  const changes = [...diffDropDraft(actor, draft), flagChange(actor, INN_RECEIPTS_FLAG, [...(actor.getFlag(INN_SCOPE, INN_RECEIPTS_FLAG) ?? []), receipt]), journalInnChange(document, innAfter(document, next))]; changes.at(-1).before = before;
  return runTransaction(actor, { label: `Inn checkout: ${document.name}`, changes, authority: true, validate: () => {
    const live = getInnData(document); const fresh = quoteInn(live, inputLines, { now: Number(globalThis.game?.time?.worldTime ?? 0) });
    const funds = carriedFunds(actor);
    return live.revision === current.revision && JSON.stringify(snapshotJournal(document)) === JSON.stringify(before) && live.accessible && innOpeningStatus(live, Number(globalThis.game?.time?.worldTime ?? 0)).open && ownsCharacter(user, actor) && fresh.success && fresh.totalCp === quote.totalCp && funds.success && funds.totalCp >= quote.totalCp && unchangedDropInventory(draft);
  } });
}

export function checkoutInn(actor, innId, quote, operationId = null) { return requestInventoryMutation('innCheckout', { ...inventoryActorReference(actor), innId, quote }, null, operationId); }
export function endInnBooking(innId, bookingId) { return requestInventoryMutation('innEndBooking', { innId, bookingId }); }
async function doEndBooking(details, message) {
  if (!(globalThis.game?.users?.get?.(message.userId) ?? globalThis.game?.user)?.isGM) return { success: false, reason: 'Only the GM can check out guests.' };
  const document = getInnDocument(details.innId); if (!document) return { success: false, reason: 'Inn unavailable.' }; const current = getInnData(document); const booking = current.bookings.find(b => b.id === details.bookingId); if (!booking) return { success: false, reason: 'Booking unavailable.' }; const next = clone(current); next.revision += 1; next.bookings.find(b => b.id === booking.id).checkedOut = true; return runTransaction(null, { label: `End inn booking: ${document.name}`, changes: [journalInnChange(document, innAfter(document, next))], authority: true });
}
async function resolveCatalogItem(uuid) {
  if (!uuid) return null;
  const resolve = globalThis.fromUuid ?? globalThis.foundry?.utils?.fromUuid;
  if (resolve) { try { const item = await resolve(uuid); if (item?.uuid === uuid) return item; } catch (_) { /* fall through */ } }
  return values(globalThis.game?.items).find(item => item.uuid === uuid) ?? null;
}
export function initInns({ planPlacement, validatePlacement } = {}) { if (planPlacement) placementAdapter = planPlacement; if (validatePlacement) validateAdapter = validatePlacement; registerInventoryAuthority('innSave', doSave); registerInventoryAuthority('innCheckout', doCheckout); registerInventoryAuthority('innEndBooking', doEndBooking); }

export const __test = { validateInnInput, normalizeOffering, activeBooking, validateSpecialties };
