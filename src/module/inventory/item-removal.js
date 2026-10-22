import { snapshotItem, itemChange, createdTokenChange, runTransaction, getPendingTransaction } from './transaction-journal.js';
import { inventoryActorReference, resolveInventoryActor, inventoryRequester, registerInventoryAuthority, requestInventoryMutation } from './inventory-authority.js';
import { normalizeQuantity } from './encumbrance.js';
import { checkWithdrawTarget } from './container-capacity.js';
import { inventoryItems, physicalItemTypes, canBeParent, orphanedItems, assertNoContainmentCycles, containedSubtree } from './containment.js';

const clone = value => structuredClone(value);
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).filter(key => key !== '_stats').sort().map(key => [key, stable(value[key])])) : value;
export function inventoryRemovalFingerprint(actor) {
  return JSON.stringify(stable(inventoryItems(actor).map(snapshotItem).sort((a, b) => a._id.localeCompare(b._id))));
}
export function relocationTargets(actor, parent, child) {
  const items = inventoryItems(actor), excluded = new Set([parent.id, ...containedSubtree(items, parent.id).map(item => item.id)]);
  return items.filter(target => !excluded.has(target.id) && canBeParent(target) && target.type !== 'livestock' && checkWithdrawTarget(child, target, items.filter(item => item.id !== child.id)).allowed);
}
function itemUpdate(actor, item, system) {
  const before = snapshotItem(item);
  return { kind: 'item', ...inventoryActorReference(actor), id: item.id, before, after: { ...clone(before), system: { ...clone(before.system), ...system } } };
}
function tokenMatchesActor(token, actor) {
  if (!token || !actor) return false;
  if (actor.isToken || actor.token) {
    const exact = actor.token?.id ?? actor.token?.document?.id ?? actor.token?.uuid ?? actor.token?.document?.uuid;
    return Boolean(exact && (token.id === exact || token.uuid === exact));
  }
  return token.actorId === actor.id || token.actor?.id === actor.id || token.actor?.uuid === actor.uuid;
}
function dropTokenSource(actor, scene, sourceTokenId = null) {
  const tokens = scene.tokens?.contents ?? [...(scene.tokens?.values?.() ?? [])];
  const matching = tokens.filter(token => tokenMatchesActor(token, actor));
  if (sourceTokenId) {
    const selected = matching.find(token => token.id === sourceTokenId || token.uuid === sourceTokenId);
    if (!selected) throw new Error('Choose a placed token for this character before dropping an item.');
    return selected;
  }
  if (matching.length !== 1) {
    if (!matching.length) throw new Error('This character has no placed token in the current scene.');
    throw new Error('Choose which placed character token should receive the dropped item.');
  }
  return matching[0];
}
function adjacentDropPosition(scene, token) {
  const rawSize = Number(scene.grid?.size);
  const size = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 100;
  const dimensions = scene.dimensions ?? {};
  const minX = Number(dimensions.sceneX ?? 0), minY = Number(dimensions.sceneY ?? 0);
  const sceneWidth = Number(dimensions.sceneWidth ?? dimensions.width);
  const sceneHeight = Number(dimensions.sceneHeight ?? dimensions.height);
  const maxX = Number.isFinite(sceneWidth) && sceneWidth > 0 ? minX + sceneWidth : null;
  const maxY = Number.isFinite(sceneHeight) && sceneHeight > 0 ? minY + sceneHeight : null;
  const actualX = Number(token.x), actualY = Number(token.y);
  if (!Number.isFinite(actualX) || !Number.isFinite(actualY)) return null;
  const width = Number(token.width), height = Number(token.height);
  const sourceWidth = Number.isFinite(width) && width > 0 ? width * size : size;
  const sourceHeight = Number.isFinite(height) && height > 0 ? height * size : size;
  const x = minX + Math.floor((actualX - minX) / size) * size;
  const y = minY + Math.floor((actualY - minY) / size) * size;
  const right = minX + Math.ceil((actualX + sourceWidth - minX) / size) * size;
  const bottom = minY + Math.ceil((actualY + sourceHeight - minY) / size) * size;
  const candidates = [
    [right, y], [x, bottom], [x - size, y], [x, y - size]
  ];
  return candidates.find(([cx, cy]) => cx >= minX && cy >= minY && (maxX === null || cx + size <= maxX) && (maxY === null || cy + size <= maxY));
}
function groundData(actor, root, descendants, scene, position) {
  const [x, y] = position;
  const rootData = snapshotItem(root);
  Object.assign(rootData.system, { containerId: null, equipped: false, lashed: false });
  return { name: root.name, x, y, texture: { src: root.img || 'icons/svg/item-bag.svg' }, width: 1, height: 1, lockRotation: true, actorLink: false,
    displayName: globalThis.CONST?.TOKEN_DISPLAY_MODES?.ALWAYS ?? 50, displayBars: globalThis.CONST?.TOKEN_DISPLAY_MODES?.NONE ?? 0,
    flags: { 'osp-houserules': { droppedItem: true, payloadVersion: 2, itemData: rootData, containedItems: descendants.map(snapshotItem), originalActorId: actor.id, originalActorUuid: actor.uuid } } };
}
/** Prepare all actor and scene changes before the journal performs any write. */
export function planItemRemoval(actor, command, scene = null) {
  const items = inventoryItems(actor);
  assertNoContainmentCycles(items);
  if (command.expected !== inventoryRemovalFingerprint(actor)) throw new Error('Inventory changed while the dialog was open. Reopen it and choose destinations again.');
  if (command.action === 'repair') {
    return orphanedItems(items).map(item => itemUpdate(actor, item, { containerId: null, lashed: false, equipped: false }));
  }
  const item = actor.items.get(command.itemId);
  if (!item) throw new Error('The selected item no longer exists.');
  const available = normalizeQuantity(item.system?.quantity);
  const quantity = command.quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > available) throw new Error('Select a valid whole quantity from the current stack.');
  if (!['delete', 'drop'].includes(command.action)) throw new Error('Unknown inventory removal action.');
  if (command.action === 'drop' && !physicalItemTypes.has(item.type)) throw new Error('Only physical inventory can be dropped on the ground.');
  const descendants = containedSubtree(items, item.id);
  const orphanIds = new Set(orphanedItems(items).map(entry => entry.id));
  if ([item, ...descendants].some(entry => orphanIds.has(entry.id))) throw new Error('Repair missing or invalid parent links before removing this item.');
  if (command.action === 'delete' && quantity < available) return [itemChange(actor, item, available - quantity)];
  if (command.action === 'drop' && descendants.length && quantity < available) throw new Error('Drop a populated container or mount as a complete stack.');
  const changes = [], dropping = [];
  let dropContext = null;
  if (command.action === 'drop' || (command.action === 'delete' && command.destinations?.some(destination => destination.targetId === 'ground'))) {
    if (!scene) throw new Error('An available scene is required to drop contents.');
    const token = dropTokenSource(actor, scene, command.sourceTokenId);
    const position = adjacentDropPosition(scene, token);
    if (!position) throw new Error('There is no adjacent square available for the dropped item in this scene.');
    dropContext = { token, position };
  }
  if (command.action === 'drop') {
    const root = { ...snapshotItem(item), id: item.id, system: { ...clone(item.system), quantity } };
    dropping.push({ root, descendants });
    changes.push(itemChange(actor, item, available - quantity));
    for (const child of descendants) changes.push(itemChange(actor, child, null));
  } else {
    const children = items.filter(entry => entry.system?.containerId === item.id);
    const destinations = command.destinations;
    if (!Array.isArray(destinations) || destinations.length !== children.length || new Set(destinations.map(d => d.itemId)).size !== children.length) throw new Error('Choose one destination for every direct child before deleting the container.');
    const excluded = new Set([item.id, ...descendants.map(entry => entry.id)]);
    const simulated = items.map(entry => ({ ...snapshotItem(entry), id: entry.id }));
    for (const child of children) {
      const destination = destinations.find(d => d.itemId === child.id);
      if (!destination) throw new Error('A child has no destination.');
      const subtree = containedSubtree(items, child.id);
      if (destination.targetId === 'ground') {
        if (!physicalItemTypes.has(child.type)) throw new Error('Only physical inventory can be dropped.');
        dropping.push({ root: child, descendants: subtree });
        for (const entry of [child, ...subtree]) changes.push(itemChange(actor, entry, null));
      } else {
        const target = actor.items.get(destination.targetId);
        if (!target || excluded.has(target.id) || !canBeParent(target) || target.type === 'livestock') throw new Error('Choose a compatible container outside the contents being evacuated.');
        const admission = checkWithdrawTarget(child, target, simulated.filter(entry => entry.id !== child.id));
        if (!admission.allowed) throw new Error(admission.reason);
        const update = { containerId: target.id, equipped: false, lashed: false };
        Object.assign(simulated.find(entry => entry.id === child.id).system, update);
        changes.push(itemUpdate(actor, child, update));
      }
    }
    changes.push(itemChange(actor, item, null));
  }
  if (dropping.length) {
    // Tokens are created before sources disappear; the same journal compensates both endpoints.
    return [...dropping.map(({ root, descendants: nested }) => createdTokenChange(scene, groundData(actor, root, nested, scene, dropContext.position))), ...changes];
  }
  return changes;
}
export function registerItemRemovalAuthority() {
  registerInventoryAuthority('inventory.remove', async command => {
    const actor = await resolveInventoryActor(command), user = inventoryRequester();
    if (!actor || !user || !(user.isGM || actor.testUserPermission(user, 'OWNER'))) return { success: false, reason: 'An owned actor is required.' };
    try {
      const scene = command.sceneId ? game.scenes.get(command.sceneId) : null;
      if (scene && !user.isGM && !scene.testUserPermission?.(user, 'OBSERVER')) throw new Error('You cannot drop items onto that scene.');
      const changes = planItemRemoval(actor, command, scene);
      if (!changes.length) return { success: true };
      return await runTransaction(actor, { label: command.action === 'repair' ? 'Repair orphan inventory links' : `${command.action}: ${actor.items.get(command.itemId)?.name}`, changes, authority: true,
        validate: () => command.expected === inventoryRemovalFingerprint(actor) && (user.isGM || actor.testUserPermission(user, 'OWNER')) });
    } catch (error) { return { success: false, recoveryRequired: Boolean(getPendingTransaction(actor)), reason: error.message }; }
  });
}
export function removeInventoryItem(actor, command, operationId = null) {
  return requestInventoryMutation('inventory.remove', { ...inventoryActorReference(actor), ...command }, null, operationId);
}
