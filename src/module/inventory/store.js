import { validateProfileEnvironment } from './store-profile-rules.js';
import { createDropDraft, diffDropDraft, unchangedDropInventory } from './drop-transaction.js';
import { runTransaction, journalStoreChange, snapshotJournal, flagChange } from './transaction-journal.js';
import { registerInventoryAuthority, requestInventoryMutation, resolveInventoryActor, inventoryActorReference, currentInventoryOperation } from './inventory-authority.js';
import { carriedFunds, stageStorePayment } from './store-payment.js';
import { isUniqueStackItem } from './stack-identity.js';
import { isArrowAmmo, ARROW_SALE_BUNDLE_QUANTITY, prepareArrowSaleBundle } from './arrow-bundle.js';
import { isTorch, TORCH_SALE_BUNDLE_QUANTITY, prepareTorchSaleBundle } from './torch-bundle.js';
import { isBoltAmmo, BOLT_SALE_BUNDLE_QUANTITY, prepareBoltSaleBundle } from './bolt-bundle.js';
import { isSaleBundle, saleBundleQuantity, prepareSaleBundle, saleBundleUnit } from './sale-bundle.js';

export const STORE_SCOPE = 'osp-houserules';
export const STORE_FLAG = 'store';
export const RECEIPTS_FLAG = 'storeReceipts';
const clone = value => structuredClone(value);
const values = collection => collection?.contents ?? (typeof collection?.values === 'function' ? [...collection.values()] : Array.isArray(collection) ? collection : []);
let placementAdapter = async () => ({ success: false, reason: 'Store placement adapter is unavailable.' });
let validateAdapter = async () => true;
export function emptyStore(name = 'New Store') { return normalizeStore({ name }); }

function cleanItemData(item) {
  const data = clone(item?.toObject ? item.toObject() : item);
  if (!data) return null;
  const clean = { name: data.name, type: data.type, img: data.img ?? '', system: data.system, flags: data.flags ?? {} };
  const result = clone(clean);
  result.system = { ...(result.system ?? {}), quantity: 1, containerId: null, equipped: false, lashed: false };
  return result;
}
const isArrowSaleItem = item => isArrowAmmo(item);
const isTorchSaleItem = item => isTorch(item);
const isBoltSaleItem = item => isBoltAmmo(item);
const bundleQuantityOf = item => saleBundleQuantity(item);
export function eligibleStoreItem(item) {
  const tags = item?.system?.tags ?? [];
  if (!item || ['vehicle', 'livestock', 'mount', 'tack'].includes(item.type) || tags.includes('vehicle') || tags.includes('livestock') || tags.includes('tack') || tags.includes('vehicle-parts')) return false;
  if (item.system?.treasure || item.type === 'treasure' || item.type === 'coin') return false;
  return ['weapon', 'armor', 'item', 'container', 'clothing', 'ammunition'].includes(item.type);
}
export function entryFromItem(item) {
  if (!eligibleStoreItem(item)) return null;
  const bundle = isSaleBundle(item);
  return { id: globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2), sourceUuid: item.uuid ?? null, itemData: cleanItemData(item), customPrice: null, ...(bundle ? { bundleQuantity: bundleQuantityOf(item), customPriceUnit: 'bundle' } : {}), stock: null, hidden: false };
}
function normalizeEntry(raw) {
  const itemData = cleanItemData(raw?.itemData ?? raw);
  if (!itemData) return null;
  const arrow = isArrowSaleItem(itemData);
  const torch = isTorchSaleItem(itemData);
  const bolt = isBoltSaleItem(itemData);
  const bundle = arrow || torch || bolt;
  const legacyBundle = bundle && raw?.bundleQuantity == null;
  const customPrice = raw?.customPrice == null ? null : Number(raw.customPrice) * (legacyBundle ? bundleQuantityOf(itemData) : 1);
  const stock = raw?.stock == null ? null : Number(raw.stock);
  const arrowRemainder = arrow && raw?.arrowRemainder != null && Number.isSafeInteger(Number(raw.arrowRemainder)) ? Math.max(0, Math.min(ARROW_SALE_BUNDLE_QUANTITY - 1, Number(raw.arrowRemainder))) : 0;
  const torchRemainder = torch && raw?.torchRemainder != null && Number.isSafeInteger(Number(raw.torchRemainder)) ? Math.max(0, Math.min(TORCH_SALE_BUNDLE_QUANTITY - 1, Number(raw.torchRemainder))) : 0;
  const boltRemainder = bolt && raw?.boltRemainder != null && Number.isSafeInteger(Number(raw.boltRemainder)) ? Math.max(0, Math.min(BOLT_SALE_BUNDLE_QUANTITY - 1, Number(raw.boltRemainder))) : 0;
  const bundleSize = bundleQuantityOf(itemData);
  // Legacy bolt stock was persisted as individual rounds; arrows and torches
  // already used bundle units and must retain their historical semantics.
  const stockBundles = bolt && raw?.bundleQuantity == null && stock != null ? Math.floor(stock / bundleSize) : stock;
  const remainder = torch ? torchRemainder || (raw?.bundleQuantity == null && stock != null ? stock % TORCH_SALE_BUNDLE_QUANTITY : 0) : bolt ? boltRemainder || (raw?.bundleQuantity == null && stock != null ? stock % BOLT_SALE_BUNDLE_QUANTITY : 0) : arrowRemainder;
  return { id: String(raw?.id ?? globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2)), sourceUuid: raw?.sourceUuid ?? null, itemData, customPrice: Number.isFinite(customPrice) && customPrice >= 0 ? customPrice : null, ...(bundle ? { bundleQuantity: bundleSize, customPriceUnit: 'bundle', ...(arrow ? { arrowRemainder: remainder } : torch ? { torchRemainder: remainder } : { boltRemainder: remainder }) } : {}), stock: stockBundles == null ? null : Number.isSafeInteger(stockBundles) && stockBundles >= 0 ? stockBundles : null, hidden: raw?.hidden === true };
}
export function normalizeStore(raw = {}) {
  const adjustment = Number(raw.adjustment ?? 0);
  const buybackRate = Number(raw.buybackRate ?? 50);
  const defaultTypes = ['weapon', 'armor', 'item', 'container', 'clothing', 'ammunition'];
  const buybackTypes = Array.isArray(raw.buybackTypes) ? [...new Set(raw.buybackTypes.filter(type => defaultTypes.includes(type)))] : defaultTypes;
  const stocking = raw.stocking && typeof raw.stocking === 'object' && !Array.isArray(raw.stocking) ? clone(raw.stocking) : {};
  return { version: 1, revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0, name: String(raw.name ?? 'New Store'), description: String(raw.description ?? ''), img: String(raw.img ?? ''), proprietorName: String(raw.proprietorName ?? ''), proprietorImg: String(raw.proprietorImg ?? ''), accessible: raw.accessible === true, adjustment: Number.isFinite(adjustment) ? Math.max(-100, adjustment) : 0, buysFromPlayers: raw.buysFromPlayers === true, buybackRate: Number.isFinite(buybackRate) ? Math.min(100, Math.max(0, buybackRate)) : 50, buybackTypes, restockPurchases: raw.restockPurchases !== false, stocking, entries: values(raw.entries).map(normalizeEntry).filter(Boolean), history: Array.isArray(raw.history) ? clone(raw.history) : [] };
}
function validateStoreInput(raw) {
  if (!raw || !Array.isArray(raw.entries) || raw.entries.length > 200) return 'Store products are invalid.';
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 100) return 'Give the store a name of 1–100 characters.';
  if (!Number.isFinite(Number(raw.adjustment)) || Number(raw.adjustment) < -100 || Number(raw.adjustment) > 10000) return 'Price adjustment must be between -100% and 10000%.';
  if (raw.proprietorName != null && (typeof raw.proprietorName !== 'string' || raw.proprietorName.length > 100)) return 'Proprietor name is invalid.';
  if (raw.proprietorImg != null && (typeof raw.proprietorImg !== 'string' || raw.proprietorImg.length > 500)) return 'Proprietor image is invalid.';
  if (raw.buybackRate != null && (!Number.isFinite(Number(raw.buybackRate)) || Number(raw.buybackRate) < 0 || Number(raw.buybackRate) > 100)) return 'Buyback rate must be between 0% and 100%.';
  if (raw.buybackTypes != null && (!Array.isArray(raw.buybackTypes) || raw.buybackTypes.some(type => !['weapon', 'armor', 'item', 'container', 'clothing', 'ammunition'].includes(type)))) return 'Buyback equipment types are invalid.';
  if (raw.stocking?.profileId && (!Number.isInteger(Number(raw.stocking.restockDays)) || Number(raw.stocking.restockDays) < 1 || Number(raw.stocking.restockDays) > 365)) return 'Restock interval must be a whole number from 1 to 365 in-game days.';
  const environmentError = validateProfileEnvironment(raw.stocking ?? {});
  if (environmentError) return environmentError;
  const ids = new Set();
  for (const entry of raw.entries) {
    if (!entry?.id || ids.has(entry.id) || !eligibleStoreItem(entry.itemData)) return 'Store products are invalid.';
    ids.add(entry.id);
    if (entry.customPrice != null && (!Number.isFinite(Number(entry.customPrice)) || Number(entry.customPrice) < 0)) return 'Store prices must be finite and nonnegative.';
    if (entry.stock != null && (!Number.isSafeInteger(Number(entry.stock)) || Number(entry.stock) < 0)) return 'Store stock must be a nonnegative whole number.';
  }
  return null;
}
function storeData(document) { return document?.getFlag?.(STORE_SCOPE, STORE_FLAG) ?? document?.flags?.[STORE_SCOPE]?.[STORE_FLAG] ?? null; }
export function getStoreData(document) { return normalizeStore(storeData(document) ?? document); }
export function getStoreDocument(id) { return game?.journal?.get?.(id) ?? values(game?.journal).find(journal => journal.id === id); }
export function listStores({ gm = Boolean(game?.user?.isGM) } = {}) { return values(game?.journal).filter(doc => storeData(doc)?.version === 1 && (gm || storeData(doc)?.accessible === true)); }
export function unitPriceCp(store, entry) {
  const bundle = isSaleBundle(entry?.itemData);
  if (entry.customPrice != null) { const cp = Math.round(entry.customPrice * 10); return Number.isSafeInteger(cp) && cp >= 0 ? cp : null; }
  const base = Number(entry.itemData?.system?.cost ?? 0);
  if (!Number.isFinite(base) || base < 0) return null;
  const cp = Math.round(base * 10 * (bundle ? bundleQuantityOf(entry.itemData) : 1) * (1 + Math.max(-100, Number(store.adjustment) || 0) / 100));
  return Number.isSafeInteger(cp) && cp >= 0 ? cp : null;
}
export function quoteStore(store, lines = []) {
  const data = normalizeStore(store);
  if (!Array.isArray(lines) || !lines.length || lines.length > 200) return { success: false, reason: 'The cart is empty or too large.' };
  const seen = new Set();
  const quoted = []; let totalCp = 0;
  for (const line of lines) {
    if (!line || typeof line.entryId !== 'string' || (line.destination != null && (typeof line.destination !== 'string' || line.destination.length > 160))) return { success: false, reason: 'Choose a valid product and carrying destination.' };
    const entry = data.entries.find(candidate => candidate.id === line.entryId);
    const quantity = Number(line.quantity);
    if (!entry || seen.has(line.entryId) || entry.hidden || !Number.isSafeInteger(quantity) || quantity <= 0 || (entry.stock != null && quantity > entry.stock) || isUniqueStackItem(entry.itemData) && quantity > 1) return { success: false, reason: 'The cart contains an unavailable product.' };
    seen.add(line.entryId);
    const unitPriceCp = unitPriceCpFor(data, entry);
    if (unitPriceCp == null) return { success: false, reason: 'The store contains an invalid price.' };
    totalCp += unitPriceCp * quantity;
    if (!Number.isSafeInteger(totalCp)) return { success: false, reason: 'The cart total is unsafe.' };
    quoted.push({ entryId: entry.id, quantity, bundleQuantity: entry.bundleQuantity ?? 1, unitPriceCp, itemData: prepareSaleBundle(entry.itemData), destination: line.destination ?? '' });
  }
  return { success: true, totalCp, lines: quoted, revision: data.revision };
}
const unitPriceCpFor = (store, entry) => unitPriceCp(store, entry);
export function formatSp(cp) {
  const totalCp = Number(cp);
  const normalizedCp = Number.isFinite(totalCp) ? Math.max(0, Math.trunc(totalCp)) : 0;
  const silver = Math.floor(normalizedCp / 10);
  const copper = normalizedCp % 10;
  if (!silver && copper) return `${copper} cp`;
  return copper ? `${silver} sp ${copper} cp` : `${silver} sp`;
}

function ownership(accessible = false) { return { default: accessible ? 2 : 0 }; }
async function createStoreDocument(data) {
  const normalized = normalizeStore(data);
  normalized.accessible = false;
  const create = game?.journal?.documentClass?.create ?? globalThis.JournalEntry?.create;
  if (!create) return { success: false, reason: 'Journal documents are unavailable.' };
  const document = await create.call(game?.journal?.documentClass ? game.journal.documentClass : globalThis.JournalEntry, { name: normalized.name, ownership: ownership(normalized.accessible), flags: { [STORE_SCOPE]: { [STORE_FLAG]: normalized } } });
  return { success: true, store: document, data: normalized };
}
export async function createStore(data = {}) { if (!game?.user?.isGM) return { success: false, reason: 'Only the GM can create stores.' }; return createStoreDocument(data); }
export async function duplicateStore(id) { const source = getStoreDocument(id); if (!source || !game?.user?.isGM) return { success: false, reason: 'Store unavailable.' }; const data = getStoreData(source); data.name = `${data.name} Copy`; data.accessible = false; data.revision = 0; data.history = []; return createStoreDocument(data); }
export async function saveStore(id, data, expectedRevision = null) { return requestInventoryMutation('storeSave', { id, data, expectedRevision }); }

function ownsCharacter(user, actor) {
  const owner = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  const owns = Boolean(actor?.type === 'character' && (actor.testUserPermission?.(user, 'OWNER') ?? ((actor.ownership?.[user?.id] ?? actor.ownership?.default ?? 0) >= owner)));
  return Boolean(user?.isGM || (actor?.getFlag?.(STORE_SCOPE, 'party') === true && owns));
}
function actorReceiptChange(actor, receipt) { const before = actor.getFlag(STORE_SCOPE, RECEIPTS_FLAG) ?? []; return flagChange(actor, RECEIPTS_FLAG, [...before, receipt]); }
function historyStoreAfter(document, data) { return { name: data.name ?? document.name, ownership: ownership(data.accessible === true), flags: clone(data) }; }

async function doSave(details, message) {
  const requester = game.users?.get?.(message?.userId) ?? game.user;
  if (!requester?.isGM) return { success: false, reason: 'Only the GM can edit stores.' };
  const document = getStoreDocument(details.id); if (!document) return { success: false, reason: 'Store unavailable.' };
  const before = snapshotJournal(document); const current = getStoreData(document);
  if (details.expectedRevision != null && details.expectedRevision !== current.revision) return { success: false, reason: 'Store changed; reload before saving.' };
  const validation = validateStoreInput(details.data); if (validation) return { success: false, reason: validation };
  const afterData = normalizeStore(details.data); afterData.history = clone(current.history); afterData.revision = current.revision + 1;
  const change = journalStoreChange(document, historyStoreAfter(document, afterData));
  const result = await runTransaction(null, { label: `Save store: ${afterData.name}`, changes: [change], authority: true });
  return result.success ? { ...result, store: afterData } : result;
}

async function doCheckout(details, message) {
  const actor = await resolveInventoryActor(details); const document = getStoreDocument(details.storeId);
  const user = game.users?.get?.(message.userId) ?? game.user;
  if (!actor || !document || !ownsCharacter(user, actor)) return { success: false, reason: 'That character is not authorized to shop.' };
  const storeBefore = snapshotJournal(document);
  const current = getStoreData(document); if (!current.accessible) return { success: false, reason: 'This store is not currently accessible.' };
  if (details.quote?.revision !== current.revision) return { success: false, reason: 'Store changed; refresh the cart.' };
  const quote = quoteStore(current, details.quote?.lines ?? []); if (!quote.success || quote.totalCp !== details.quote.totalCp || quote.lines.some((line, index) => line.unitPriceCp !== details.quote.lines[index]?.unitPriceCp)) return { success: false, reason: quote.reason ?? 'Cart changed; refresh before checkout.' };
  const placement = await placementAdapter(actor, quote.lines); if (!placement?.success) return placement;
  const draft = placement.draftState ?? createDropDraft(actor); const paid = await stageStorePayment(draft.actor, quote.totalCp); if (!paid.success) return paid;
  const placementCheck = await validateAdapter(draft, quote.lines, placement);
  if (placementCheck === false || placementCheck?.allowed === false) return { success: false, reason: placementCheck?.reason ?? 'Purchase placement is no longer valid.' };
  const changes = [...diffDropDraft(actor, draft), actorReceiptChange(actor, { id: currentInventoryOperation() ?? details.operationId, storeId: document.id, storeName: document.name, actorId: actor.id, characterName: actor.name, timestamp: Date.now(), lines: quote.lines.map(line => ({ entryId: line.entryId, name: line.itemData.name, quantity: line.quantity, bundleQuantity: line.bundleQuantity ?? 1, arrowCount: isArrowSaleItem(line.itemData) ? line.quantity * (line.bundleQuantity ?? ARROW_SALE_BUNDLE_QUANTITY) : null, torchCount: isTorchSaleItem(line.itemData) ? line.quantity * (line.bundleQuantity ?? TORCH_SALE_BUNDLE_QUANTITY) : null, boltCount: isBoltSaleItem(line.itemData) ? line.quantity * (line.bundleQuantity ?? BOLT_SALE_BUNDLE_QUANTITY) : null, unitPriceCp: line.unitPriceCp })), totalCp: quote.totalCp, tenderedCp: paid.payment.paidCp, changeCp: paid.payment.changeCp, beforeCp: carriedFunds(actor).totalCp, afterCp: carriedFunds(draft.actor).totalCp })];
  const next = clone(current); next.revision += 1; const history = next.history ?? []; history.push(changes.at(-1).after.at(-1)); next.history = history;
  for (const line of quote.lines) { const entry = next.entries.find(candidate => candidate.id === line.entryId); if (entry?.stock != null) entry.stock -= line.quantity; }
  changes.push({ ...journalStoreChange(document, historyStoreAfter(document, next)), before: storeBefore });
  return runTransaction(actor, { label: `Store checkout: ${document.name}`, changes, authority: true, validate: () => ownsCharacter(user, actor) && unchangedDropInventory(draft) && getStoreData(document).accessible && JSON.stringify(snapshotJournal(document)) === JSON.stringify(storeBefore) });
}

export function initStores({ planPlacement, validatePlacement } = {}) {
  if (planPlacement) placementAdapter = planPlacement;
  if (validatePlacement) validateAdapter = validatePlacement;
  registerInventoryAuthority('storeSave', doSave);
  registerInventoryAuthority('storeCheckout', doCheckout);
}
export function checkoutStore(actor, storeId, quote, operationId = null) { return requestInventoryMutation('storeCheckout', { ...inventoryActorReference(actor), storeId, quote }, null, operationId); }
export const __test = { cleanItemData, carriedFunds };
