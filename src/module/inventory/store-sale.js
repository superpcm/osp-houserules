import { profileBuybackRate } from './store-profile-rules.js';
import { createDropDraft, diffDropDraft, dropDescendants, unchangedDropInventory } from './drop-transaction.js';
import { carriedFunds } from './store-payment.js';
import { COIN_TEMPLATES } from './treasure-cost.js';
import { canBeParent } from './containment.js';
import { flagChange, runTransaction, journalStoreChange, snapshotJournal } from './transaction-journal.js';
import { getStoreData, getStoreDocument, eligibleStoreItem, STORE_SCOPE, STORE_FLAG } from './store.js';
import { registerInventoryAuthority, requestInventoryMutation, resolveInventoryActor, inventoryActorReference, currentInventoryOperation } from './inventory-authority.js';
import { isArrowAmmo, ARROW_BUNDLE_LIMIT } from './arrow-bundle.js';
import { isTorch, isProtectedTorchBundle, TORCH_SALE_BUNDLE_QUANTITY } from './torch-bundle.js';
import { isBoltAmmo, isProtectedBoltBundle, BOLT_SALE_BUNDLE_QUANTITY } from './bolt-bundle.js';

const clone = value => structuredClone(value);
const writes = new Map();
const itemsOf = actor => actor?.items?.contents ?? (typeof actor?.items?.values === 'function' ? [...actor.items.values()] : [...(actor?.items ?? [])]);
const actorOwns = (user, actor) => Boolean(actor?.type === 'character' && (user?.isGM || (actor?.getFlag?.(STORE_SCOPE, 'party') === true && (actor.testUserPermission?.(user, 'OWNER') ?? ((actor.ownership?.[user?.id] ?? actor.ownership?.default ?? 0) >= 3)))));
const unitPrice = (store, item) => Math.round(Number(item?.system?.cost ?? 0) * 10 * profileBuybackRate(store, item?.type) / 100);

export function quoteStoreSale(actor, store, lines = []) {
  const data = getStoreData(store);
  if (!data.accessible || !data.buysFromPlayers) return { success: false, reason: 'This store does not buy from players.' };
  if (!actor || !Array.isArray(lines) || !lines.length || lines.length > 200) return { success: false, reason: 'Choose an item to sell.' };
  const allowed = new Set(data.buybackTypes); const seen = new Set(); const quoted = []; let totalCp = 0;
  for (const line of lines) {
    const item = itemsOf(actor).find(candidate => candidate.id === line?.itemId);
    const quantity = Number(line?.quantity);
    if (!item || seen.has(item.id) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > Number(item.system?.quantity ?? 0) || !eligibleStoreItem(item) || !allowed.has(item.type) || item.system?.equipped || item.system?.lashed || item.type === 'coin' || item.system?.treasure) return { success: false, reason: 'That item cannot be sold here.' };
    let descendants; try { descendants = dropDescendants({ ...actor, items: { ...actor.items, filter: fn => itemsOf(actor).filter(fn) } }, item.id); } catch (error) { return { success: false, reason: error.message }; }
    if (descendants.length) return { success: false, reason: 'Empty items before selling them.' };
    const unitPriceCp = unitPrice(data, item);
    if (!Number.isSafeInteger(unitPriceCp) || unitPriceCp <= 0) return { success: false, reason: 'That item has no buyback value.' };
    seen.add(item.id); totalCp += unitPriceCp * quantity;
    if (!Number.isSafeInteger(totalCp)) return { success: false, reason: 'The sale total is unsafe.' };
    quoted.push({ itemId: item.id, quantity, unitPriceCp, name: item.name, itemData: clone(item.toObject ? item.toObject() : item) });
  }
  return { success: true, revision: data.revision, totalCp, lines: quoted, actorFingerprint: JSON.stringify(quoted.map(line => [line.itemId, line.quantity, line.itemData])) };
}

function coinDestination(actor) {
  const items = itemsOf(actor); const byId = new Map(items.map(item => [item.id, item]));
  const invalid = item => ['vehicle', 'livestock', 'mount'].includes(item?.type) || ['vehicle', 'livestock', 'mount'].includes(item?.system?.transportType) || (item?.system?.tags ?? []).some(tag => ['vehicle', 'livestock', 'tack'].includes(tag));
  const carried = item => { const seen = new Set(); let parentId = item?.system?.containerId ?? null; while (parentId) { if (seen.has(parentId)) return false; seen.add(parentId); const parent = byId.get(parentId); if (!parent || invalid(parent) || !canBeParent(parent)) return false; parentId = parent.system?.containerId ?? null; } return Boolean(item?.system?.containerId); };
  return items.find(item => item.type === 'coin' && carried(item))?.system?.containerId ?? items.find(item => item.type === 'container' && !invalid(item) && canBeParent(item))?.id ?? null;
}
async function creditCoins(draft, totalCp) {
  const destination = coinDestination(draft); if (!destination) return { success: false, reason: 'A carried coin container is required for payment.' };
  let remaining = totalCp; const quantities = { 'Gold Coins': Math.floor(remaining / 100) }; remaining %= 100; quantities['Silver Coins'] = Math.floor(remaining / 10); quantities['Copper Coins'] = remaining % 10;
  for (const [name, quantity] of Object.entries(quantities)) if (quantity) {
    const existing = itemsOf(draft).find(item => item.type === 'coin' && item.name === name && item.system?.containerId === destination);
    if (existing) await draft.updateEmbeddedDocuments('Item', [{ _id: existing.id, 'system.quantity': Number(existing.system.quantity ?? 0) + quantity }]);
    else await draft.createEmbeddedDocuments('Item', [{ ...clone(COIN_TEMPLATES[name]), system: { ...clone(COIN_TEMPLATES[name].system), quantity, containerId: destination } }]);
  }
  return { success: true };
}
function actorReceiptChange(actor, receipt) { const before = actor.getFlag?.(STORE_SCOPE, 'storeReceipts') ?? []; return flagChange(actor, 'storeReceipts', [...before, receipt]); }
function nextStore(data, quote) {
  const next = clone(data); next.revision += 1;
  if (!next.restockPurchases) return next;
  for (const line of quote.lines) {
    if (isArrowAmmo(line.itemData) || isTorch(line.itemData) || isBoltAmmo(line.itemData)) {
      const torch = isTorch(line.itemData); const bolt = isBoltAmmo(line.itemData); const bundleSize = torch ? TORCH_SALE_BUNDLE_QUANTITY : bolt ? BOLT_SALE_BUNDLE_QUANTITY : ARROW_BUNDLE_LIMIT;
      const kind = item => torch ? isTorch(item) : bolt ? isBoltAmmo(item) : isArrowAmmo(item);
      const existing = next.entries.find(entry => kind(entry.itemData) && ((line.itemData.uuid && entry.sourceUuid === line.itemData.uuid) || entry.itemData.name === line.itemData.name));
      const matching = existing;
      if (matching && matching.stock === null) continue;
      const sold = Number(line.quantity);
      const bundles = Math.floor(sold / bundleSize);
      const remainder = sold % bundleSize;
      if (matching) {
        const carryField = torch ? 'torchRemainder' : bolt ? 'boltRemainder' : 'arrowRemainder';
        const carry = Number(matching[carryField] ?? 0) + remainder;
        matching.stock = Number(matching.stock ?? 0) + bundles + Math.floor(carry / bundleSize);
        matching[carryField] = carry % bundleSize;
      } else {
        next.entries.push({ id: globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2), sourceUuid: line.itemData?.uuid ?? null, itemData: { name: line.itemData.name, type: line.itemData.type, img: line.itemData.img, system: { ...clone(line.itemData.system ?? {}), quantity: 1, containerId: null, equipped: false, lashed: false } }, bundleQuantity: bundleSize, customPriceUnit: 'bundle', ...(torch ? { torchRemainder: remainder } : bolt ? { boltRemainder: remainder } : { arrowRemainder: remainder }), customPrice: null, stock: bundles, hidden: false });
      }
      continue;
    }
    if (next.entries.length >= 200) break;
    next.entries.push({ id: globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2), sourceUuid: line.itemData?.uuid ?? null, itemData: { name: line.itemData.name, type: line.itemData.type, img: line.itemData.img, system: { ...clone(line.itemData.system ?? {}), quantity: 1, containerId: null, equipped: false, lashed: false } }, customPrice: null, stock: line.quantity, hidden: false });
  }
  return next;
}
async function doSale(details, message) {
  const actor = await resolveInventoryActor(details); const document = getStoreDocument(details.storeId); const user = game.users?.get?.(message.userId) ?? game.user;
  if (!actor || !document || !actorOwns(user, actor)) return { success: false, reason: 'That character is not authorized to sell.' };
  const beforeStore = snapshotJournal(document); const current = getStoreData(document); const quote = quoteStoreSale(actor, current, details.quote?.lines ?? []);
  if (!quote.success || details.quote?.revision !== current.revision || details.quote?.totalCp !== quote.totalCp || details.quote?.actorFingerprint !== quote.actorFingerprint) return { success: false, reason: quote.reason ?? 'Sale changed; refresh before completing.' };
  const beforeFunds = carriedFunds(actor); if (!beforeFunds.success) return beforeFunds;
  const draft = createDropDraft(actor);
  for (const line of quote.lines) { const item = draft.items.get(line.itemId); if (!item) return { success: false, reason: 'Sold item changed; refresh before completing.' }; if (line.quantity === Number(item.system.quantity)) await item.delete(); else await draft.actor.updateEmbeddedDocuments('Item', [{ _id: item.id, 'system.quantity': Number(item.system.quantity) - line.quantity }]); }
  const paid = await creditCoins(draft.actor, quote.totalCp); if (!paid.success) return paid;
  const { validateStorePlacement } = await import('./store-placement.js');
  const capacity = validateStorePlacement(draft); if (!capacity?.allowed) return { success: false, reason: capacity?.reason ?? 'The resulting inventory cannot be carried.' };
  const afterFunds = carriedFunds(draft.actor); if (!afterFunds.success || afterFunds.totalCp !== beforeFunds.totalCp + quote.totalCp) return { success: false, reason: 'Sale payment could not be placed in carried funds.' };
  const receipt = { id: currentInventoryOperation() ?? details.operationId, kind: 'sale', storeId: document.id, storeName: document.name, actorId: actor.id, characterName: actor.name, timestamp: Date.now(), lines: quote.lines.map(line => ({ itemId: line.itemId, name: line.name, quantity: line.quantity, unitPriceCp: line.unitPriceCp, ...(isProtectedTorchBundle(line.itemData) ? { torchCount: line.quantity } : {}), ...(isProtectedBoltBundle(line.itemData) ? { boltCount: line.quantity } : {}) })), totalCp: quote.totalCp, beforeCp: beforeFunds.totalCp, afterCp: afterFunds.totalCp };
  const next = nextStore(current, quote); next.history = [...(next.history ?? []), receipt];
  const changes = [...diffDropDraft(actor, draft), actorReceiptChange(actor, receipt), { ...journalStoreChange(document, { name: next.name, ownership: { default: next.accessible ? 2 : 0 }, flags: clone(next) }), before: beforeStore }];
  return runTransaction(actor, { label: `Store sale: ${document.name}`, changes, authority: true, validate: () => actorOwns(user, actor) && unchangedDropInventory(draft) && getStoreData(document).accessible && JSON.stringify(snapshotJournal(document)) === JSON.stringify(beforeStore) });
}
export function completeStoreSale(actor, storeId, quote, operationId = null) { return requestInventoryMutation('storeSale', { ...inventoryActorReference(actor), storeId, quote }, null, operationId); }
function intentTarget(actor) { return game?.user ?? actor; }
function intentKey(actor, storeId) { return [actor?.uuid ?? actor?.id ?? 'actor', storeId].map(value => encodeURIComponent(value).replace(/\./g, '%2E')).join(':'); }
export function saveStoreSaleIntent(actor, storeId, intent) { const target = intentTarget(actor); const previous = writes.get(target?.id) ?? Promise.resolve(); const next = previous.catch(() => {}).then(async () => { if (target?.setFlag) { const intents = clone(target.getFlag?.(STORE_SCOPE, 'storeSaleIntents') ?? {}); if (intent == null) delete intents[intentKey(actor, storeId)]; else intents[intentKey(actor, storeId)] = clone({ ...intent, storeId }); await target.setFlag(STORE_SCOPE, 'storeSaleIntents', intents); } return intent; }); writes.set(target?.id, next); return next; }
export function loadStoreSaleIntent(actor, storeId) { const target = intentTarget(actor); return clone(target?.getFlag?.(STORE_SCOPE, 'storeSaleIntents')?.[intentKey(actor, storeId)] ?? null); }
export function receiptForSaleIntent(actor, intent) { const receipts = actor?.getFlag?.(STORE_SCOPE, 'storeReceipts'); return (Array.isArray(receipts) ? receipts : []).find(receipt => receipt.kind === 'sale' && receipt.id === intent?.operationId && receipt.storeId === intent?.storeId) ?? null; }
export function initStoreSales() { registerInventoryAuthority('storeSale', doSale); }
export const __test = { nextStore };
