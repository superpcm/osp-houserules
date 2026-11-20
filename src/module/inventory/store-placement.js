import { OspActorSheetCharacter } from '../actor/sheets/character-sheet.js';
import { ItemHandler } from '../actor/sheets/handlers/item-handler.js';
import { createDropDraft, validDropQuantity } from './drop-transaction.js';
import { parseVehicleDestination, readableVehicleAttachmentLabel, vehicleDestination } from './vehicle-lashing.js';
import { isArrowAmmo, isProtectedArrowBundle } from './arrow-bundle.js';
import { isTorch, isProtectedTorchBundle } from './torch-bundle.js';
import { isProtectedBoltBundle } from './bolt-bundle.js';
import { isSaleBundle, saleBundleQuantity } from './sale-bundle.js';
import { isBackpack } from './long-item-transport.js';

// Run the character sheet's actual placement rules against a detached actor. No chooser,
// notification, item creation, or payment touches the live character during review.
function planner(state, destination) {
  const sheet = Object.create(OspActorSheetCharacter.prototype);
  Object.defineProperty(sheet, 'actor', { value: state.actor });
  sheet.handlers = new Map();
  sheet._dropMessages = [];
  sheet._dropPlanning = true;
  sheet._dropProbe = true;
  sheet._dropOperation = 'store';
  sheet._dropPlacementTarget = destination;
  sheet._dropHasContents = true;
  const handler = new ItemHandler(null, state.actor, sheet);
  handler._dropItem = async () => sheet._rejectDropPlacement('Choose a valid carrying location.');
  handler._showArmorNoStorageDialog = async () => sheet._rejectDropPlacement('No suitable storage is available.');
  sheet._showSlingNoRoomDialog = async () => sheet._rejectDropPlacement('There is no room to wear this item.');
  sheet.handlers.set('item', handler);
  return sheet;
}

const count = (items, data) => items.filter(item => item.name === data.name && item.type === data.type)
  .reduce((sum, item) => sum + Number(item.system.quantity ?? 1), 0);

async function tryPlacement(state, line, destination) {
  const trial = createDropDraft(state.actor);
  const beforeIds = new Set(trial.items.contents.map(item => item.id));
  const beforeCount = count(trial.items.filter(() => true), line.itemData);
  const data = structuredClone(line.itemData);
  const deliveryQuantity = isSaleBundle(line.itemData) ? saleBundleQuantity(line.itemData) : line.quantity;
  data.system = { ...data.system, quantity: deliveryQuantity, equipped: false, lashed: false, containerId: null };
  const [incoming] = await trial.actor.createEmbeddedDocuments('Item', [data]);
  incoming.actor = null;
  incoming._deleted = true;
  const sheet = planner(trial, destination);
  if (isSaleBundle(data) && (isProtectedArrowBundle(data) || isProtectedTorchBundle(data) || isProtectedBoltBundle(data)) && isBackpack(trial.items.get(destination))) sheet._forceStorageDestination = true;
  sheet._dropSelectedQuantity = line.quantity;
  let result;
  try { result = await sheet._planDropItem({ target: { closest: () => null } }, {}, incoming); }
  catch (error) { return { success: false, reason: error.message }; }
  if (result === false || result === null || sheet._dropRejected || sheet._dropRejectedReason) {
    return { success: false, reason: sheet._dropRejectedReason || 'This item cannot be placed there.' };
  }
  const live = trial.items.filter(() => true);
  if (count(live, data) - beforeCount !== Number(data.system.quantity)) return { success: false, reason: 'That destination cannot accept the entire quantity.' };
  const added = live.filter(item => !beforeIds.has(item.id));
  if (added.some(item => item.name !== data.name || item.type !== data.type)) {
    return { success: false, reason: 'A required carrier is missing. Add a suitable sheath, scabbard, or sling to your cart, or choose existing storage.' };
  }
  // Draft collections retain tombstones for diffs. Remove them before making the next
  // planning draft; the original live baseline remains attached below for final validation.
  trial.items.contents.splice(0, trial.items.contents.length, ...live);
  trial.before = state.before;
  trial.live = state.live;
  const check = validateStorePlacement(trial);
  if (!check.allowed) return { success: false, reason: check.reason };
  const delivered = added.find(item => item.name === data.name && item.type === data.type);
  const virtual = parseVehicleDestination(destination);
  const host = virtual && trial.items.get(virtual.hostId);
  return { success: true, state: trial, itemId: delivered?.id, destination,
    label: virtual && host ? `${host.name} — ${readableVehicleAttachmentLabel(virtual)}` : destination === '__open_gear__' ? 'Wear or carry' : trial.items.get(destination)?.name || 'Stored' };
}

export function validateStorePlacement(state) {
  return planner(state, '__open_gear__')._validateGearPlacementDraft(state);
}

export async function planStorePlacement(actor, lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 200) return { success: false, reason: 'Choose at least one product.' };
  let state = createDropDraft(actor);
  const remaining = [...lines].sort((a, b) => Number(['container', 'clothing'].includes(b.itemData?.type)) - Number(['container', 'clothing'].includes(a.itemData?.type)));
  const cartItems = new Map();
  const placements = [];
  while (remaining.length) {
    const index = remaining.findIndex(line => {
      const destination = String(line.destination ?? '');
      const virtual = parseVehicleDestination(destination);
      const cartKey = virtual?.hostId?.startsWith('cart:') ? virtual.hostId.slice(5) : destination.startsWith('cart:') ? destination.slice(5) : null;
      return !cartKey || cartItems.has(cartKey);
    });
    if (index < 0) return { success: false, reason: 'Purchased containers cannot be placed inside each other in a circle. Choose another destination.' };
    const [line] = remaining.splice(index, 1);
    if (!validDropQuantity(line.quantity) || !line.itemData?.system) return { success: false, reason: 'Choose a valid whole-number quantity.' };
    if (lines.some(other => other.destination === `cart:${line.entryId}`) && line.quantity !== 1) {
      return { success: false, reason: `Buy one ${line.itemData.name} when using it as a destination for other purchases.` };
    }
    let destination = line.destination || '';
    const virtualDestination = parseVehicleDestination(destination);
    if (virtualDestination?.hostId?.startsWith('cart:')) {
      const host = cartItems.get(virtualDestination.hostId.slice(5));
      if (!host) return { success: false, reason: 'The purchased destination is not available.' };
      destination = vehicleDestination(host, { mode: virtualDestination.mode, position: virtualDestination.position });
    } else if (destination.startsWith('cart:')) {
      destination = cartItems.get(destination.slice(5));
      if (!destination) return { success: false, reason: 'The purchased destination is not available.' };
    }
    // Exterior fittings require an explicit choice; automatic storage stays ordinary cargo.
    const bundleLines = isSaleBundle(line.itemData) ? Array.from({ length: line.quantity }, (_, bundleIndex) => ({ ...line, entryId: `${line.entryId}#bundle-${bundleIndex}`, quantity: 1 })) : [line];
    for (const bundleLine of bundleLines) {
      let candidates = destination ? [{ id: destination }] : planner(state)._dropPlacementCandidates(bundleLine.itemData).filter(candidate => !parseVehicleDestination(candidate.id));
      if (isSaleBundle(bundleLine.itemData)) {
        const backpack = candidates.find(candidate => isBackpack(state.items.get(candidate.id)));
        if (backpack) candidates = [backpack, ...candidates.filter(candidate => candidate !== backpack)];
      }
      let attempt;
      for (const candidate of candidates) {
        attempt = await tryPlacement(state, bundleLine, candidate.id);
        if (attempt.success) break;
      }
      if (!attempt?.success) return { success: false, entryId: line.entryId, reason: `${line.itemData.name}: ${attempt?.reason || 'No suitable carrying location is available.'}` };
      state = attempt.state;
      const attemptedVirtual = parseVehicleDestination(attempt.destination);
      const purchasedDestination = attemptedVirtual
        ? [...cartItems].find(([, itemId]) => itemId === attemptedVirtual.hostId)?.[0]
        : [...cartItems].find(([, itemId]) => itemId === attempt.destination)?.[0];
      cartItems.set(bundleLine.entryId, attempt.itemId);
      const outputDestination = purchasedDestination
        ? attemptedVirtual
          ? vehicleDestination(`cart:${purchasedDestination}`, { mode: attemptedVirtual.mode, position: attemptedVirtual.position })
          : `cart:${purchasedDestination}`
        : attempt.destination;
      placements.push({ entryId: line.entryId, destination: outputDestination, label: `${attempt.label}${purchasedDestination ? ' (in cart)' : ''}` });
    }
  }
  return { success: true, draftState: state, placements };
}
