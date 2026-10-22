import { inventoryItems, containedSubtree, orphanedItems } from './containment.js';
import { normalizeQuantity } from './encumbrance.js';
import { inventoryRemovalFingerprint, relocationTargets, removeInventoryItem } from './item-removal.js';
import { ospDialogOptions } from '../dialog/dialog-theme.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function ask(title, content, buttons) {
  return new Promise(resolve => new Dialog({ title, content, buttons: Object.fromEntries(Object.entries(buttons).map(([key, button]) => [key, { ...button, callback: html => resolve(button.value(html)) }])), default: 'cancel', close: () => resolve(null) }, ospDialogOptions({ width: 580 })).render(true));
}
function currentSceneId() {
  return globalThis.canvas?.scene?.id ?? game.scenes?.active?.id;
}
function tokenMatchesActor(token, actor) {
  return token?.actorId === actor?.id || token?.actor?.id === actor?.id || token?.actor?.uuid === actor?.uuid;
}
function sourceTokenIdFor(actor) {
  const exact = actor?.isToken ? actor.token?.id ?? actor.token?.document?.id : null;
  if (exact) return exact;
  const controlled = (globalThis.canvas?.tokens?.controlled ?? []).filter(token => tokenMatchesActor(token, actor));
  return controlled.length === 1 ? controlled[0].id : undefined;
}
async function quantityFor(item, action) {
  const available = normalizeQuantity(item.system?.quantity);
  if (available === 1) return 1;
  if (!Number.isSafeInteger(available) || available < 1) throw new Error('This item has an invalid or empty quantity.');
  return ask(`${action}: ${item.name}`, `<p>Current quantity: ${available}</p><label>Quantity<input type="number" name="quantity" min="1" max="${available}" step="1" value="1"></label>`, {
    selected: { label: action + ' quantity', value: html => Number(html.find('[name="quantity"]').val()) },
    all: { label: action + ' all', value: () => available }, cancel: { label: 'Cancel', value: () => null }
  });
}
async function report(actor, command) {
  const result = await removeInventoryItem(actor, command);
  if (!result.success) ui.notifications.warn(result.reason ?? 'Inventory action did not complete. Recover pending operations in DM Toolkit → Bank Ledgers before retrying.');
  else { actor.sheet?.render(false); ui.notifications.info('Inventory updated.'); }
  return result;
}
export async function deleteInventoryItem(actor, item) {
  const expected = inventoryRemovalFingerprint(actor);
  const quantity = await quantityFor(item, 'Delete');
  if (quantity === null) return { success: false, cancelled: true };
  let destinations = [];
  const children = inventoryItems(actor).filter(child => child.system?.containerId === item.id);
  if (quantity === normalizeQuantity(item.system?.quantity) && children.length) {
    const rows = children.map(child => `<label style="display:block;margin:8px 0">${esc(child.name)} (${normalizeQuantity(child.system?.quantity)})<select name="destination-${esc(child.id)}"><option value="">Choose destination</option>${relocationTargets(actor, item, child).map(target => `<option value="${esc(target.id)}">${esc(target.name)}</option>`).join('')}<option value="ground">Drop on ground</option></select></label>`).join('');
    destinations = await ask(`Delete ${item.name}`, `<p>Move or drop every item before deleting this container. Nested contents stay with their parent. Destinations must have enough space for all selected items together. Cancel leaves everything unchanged.</p>${rows}`, {
      move: { label: 'Apply destinations', value: html => children.map(child => ({ itemId: child.id, targetId: html.find(`[name="destination-${child.id}"]`).val() })) },
      drop: { label: 'Drop all contents', value: () => children.map(child => ({ itemId: child.id, targetId: 'ground' })) },
      cancel: { label: 'Cancel', value: () => null }
    });
    if (destinations === null) return { success: false, cancelled: true };
  }
  const sourceTokenId = sourceTokenIdFor(actor);
  return report(actor, { action: 'delete', itemId: item.id, quantity, destinations, expected, sceneId: currentSceneId(), ...(sourceTokenId ? { sourceTokenId } : {}) });
}
export async function dropInventoryItem(actor, item, { wholeStack = false } = {}) {
  const expected = inventoryRemovalFingerprint(actor);
  const quantity = wholeStack ? normalizeQuantity(item.system?.quantity) : await quantityFor(item, 'Drop');
  if (quantity === null) return { success: false, cancelled: true };
  const descendants = containedSubtree(inventoryItems(actor), item.id);
  if (descendants.length) {
    const confirmed = await ask(`Drop ${item.name}`, `<p>Drop this item together with all ${descendants.length} nested items? Their complete contents will be saved with the ground token.</p>`, {
      drop: { label: 'Drop with contents', value: () => true }, cancel: { label: 'Cancel', value: () => null }
    });
    if (!confirmed) return { success: false, cancelled: true };
  }
  const sourceTokenId = sourceTokenIdFor(actor);
  return report(actor, { action: 'drop', itemId: item.id, quantity, expected, sceneId: currentSceneId(), ...(sourceTokenId ? { sourceTokenId } : {}) });
}
export async function repairInventoryLinks(actor) {
  const expected = inventoryRemovalFingerprint(actor), orphans = orphanedItems(inventoryItems(actor));
  if (!orphans.length) { ui.notifications.info('No missing or invalid inventory parent links found.'); return; }
  const confirmed = await ask('Repair inventory links', `<p>These items refer to missing or invalid containers: ${orphans.map(item => esc(item.name)).join(', ')}.</p><p>Repair clears those broken parent links and their equipped/lashed state. The items become uncontained inventory; their own nested contents stay attached. No items are deleted.</p>`, {
    repair: { label: 'Repair links', value: () => true }, cancel: { label: 'Cancel', value: () => null }
  });
  if (confirmed) return report(actor, { action: 'repair', expected });
}

/** GM Toolkit entry point; the existing repair flow still previews changes. */
export async function repairInventoryLinksFromToolkit() {
  if (!game.user?.isGM) return;
  const characters = game.actors.filter(actor => actor.type === 'character').sort((a, b) => a.name.localeCompare(b.name));
  if (!characters.length) { ui.notifications.info('No characters available to repair.'); return; }
  const actorId = await ask('Repair inventory links', `<label>Character<select name="repair-actor">${characters.map(actor => `<option value="${esc(actor.id)}">${esc(actor.name)}</option>`).join('')}</select></label>`, {
    choose: { label: 'Continue', value: html => html.find('[name="repair-actor"]').val() },
    cancel: { label: 'Cancel', value: () => null }
  });
  if (!actorId) return;
  const actor = game.actors.get(actorId);
  if (!actor || actor.type !== 'character') { ui.notifications.warn('That character is no longer available.'); return; }
  return repairInventoryLinks(actor);
}
