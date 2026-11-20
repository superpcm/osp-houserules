import { createDropDraft } from './drop-transaction.js';
import { planStorePlacement, validateStorePlacement } from './store-placement.js';
import { stableItemKind } from './stable.js';
import { parseVehicleDestination, vehicleDestination } from './vehicle-lashing.js';

const clone = value => structuredClone(value);
const stableId = () => globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2);

function rank(line) {
  if (['vehicle', 'animal'].includes(stableItemKind(line.itemData))) return 0;
  return line.itemData?.system?.tackSlot === 'bags' ? 2 : 1;
}

function vehicleData(line) {
  const data = clone(line.itemData);
  data._id = stableId();
  data.system = { ...(data.system ?? {}), quantity: 1, containerId: null, equipped: false, lashed: false };
  return data;
}

/**
 * Stable-specific placement. Vehicles must remain root inventory objects because
 * the character sheet treats them as cargo carriers; animals and tack continue
 * through the shared character-sheet placement planner.
 */
export async function planStablePlacement(actor, lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 200) return { success: false, reason: 'Choose at least one stable product.' };
  if (lines.some(line => !line?.itemData?.system || !stableItemKind(line.itemData) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 10000)) return { success: false, reason: 'Choose valid stable products and whole-number quantities.' };
  const ordered = [...lines].sort((a, b) => rank(a) - rank(b));
  const state = createDropDraft(actor);
  const rootEntries = new Map();
  const rootLines = ordered.filter(line => ['vehicle', 'animal'].includes(stableItemKind(line.itemData)));
  if (rootLines.reduce((sum, line) => sum + line.quantity, 0) > 200) return { success: false, reason: 'Purchase at most 200 individual animals or vehicles per order.' };
  for (const line of rootLines) {
    if (!['', '__open_gear__'].includes(String(line.destination ?? ''))) return { success: false, entryId: line.entryId, reason: 'Animals and vehicles must arrive in the character’s livestock and transport inventory.' };
    const hasCartReference = lines.some(other => {
      const destination = String(other.destination ?? '');
      const virtual = parseVehicleDestination(destination);
      return destination === `cart:${line.entryId}` || virtual?.hostId === `cart:${line.entryId}`;
    });
    if (line.quantity !== 1 && hasCartReference) return { success: false, entryId: line.entryId, reason: `Buy one ${line.itemData.name} when assigning tack to it in this order.` };
    if (line.itemData.system.unique && line.quantity !== 1) return { success: false, reason: 'An individual animal can only be purchased once.' };
    for (let index = 0; index < line.quantity; index += 1) {
      const [created] = await state.actor.createEmbeddedDocuments('Item', [vehicleData(line)], { keepId: true });
      if (!created?.id) return { success: false, reason: 'The animal or vehicle could not be prepared.' };
      if (line.quantity === 1) rootEntries.set(line.entryId, created.id);
    }
  }
  const remaining = ordered.filter(line => !['vehicle', 'animal'].includes(stableItemKind(line.itemData))).map(line => {
    const destination = String(line.destination ?? '');
    const virtual = parseVehicleDestination(destination);
    if (virtual?.hostId?.startsWith('cart:') && rootEntries.has(virtual.hostId.slice(5))) {
      return { ...line, destination: vehicleDestination(rootEntries.get(virtual.hostId.slice(5)), { mode: virtual.mode, position: virtual.position }) };
    }
    return { ...line, destination: destination.startsWith('cart:') && rootEntries.has(destination.slice(5)) ? rootEntries.get(destination.slice(5)) : destination };
  });
  let result = { success: true, draftState: state, placements: [] };
  if (remaining.length) result = await planStorePlacement(state.actor, remaining);
  if (!result.success) return result;
  const draftState = result.draftState ?? state;
  // planStorePlacement starts from the detached actor (which already includes
  // direct vehicle deliveries), so restore the original transaction baseline.
  draftState.before = state.before;
  draftState.live = state.live;
  const placement = validateStorePlacement(draftState);
  if (!placement?.allowed) return { success: false, reason: placement?.reason ?? 'The resulting inventory cannot be carried.' };
  const rootPlacements = rootLines.map(line => ({ entryId: line.entryId, destination: '', label: 'Livestock & transport' }));
  const placements = (result.placements ?? []).map(placed => {
    const virtual = parseVehicleDestination(placed.destination);
    const hostId = virtual?.hostId ?? placed.destination;
    const source = [...rootEntries].find(([, itemId]) => itemId === hostId)?.[0];
    if (!source) return placed;
    const destination = virtual
      ? vehicleDestination(`cart:${source}`, { mode: virtual.mode, position: virtual.position })
      : `cart:${source}`;
    return { ...placed, destination, label: `${placed.label} (in cart)` };
  });
  return { success: true, draftState, placements: [...rootPlacements, ...placements] };
}

export const __test = { rank, vehicleData };
