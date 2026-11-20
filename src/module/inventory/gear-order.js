import { setupGearOrderDrag } from './gear-order-drag.js';

/* Character-specific Gear presentation order; never changes Item data or combat sort. */
export const GEAR_ORDER_FLAG = 'gearOrder';
const ROW_SELECTOR = 'li.item-entry[data-item-id], li.body-section-entry, li.slung-section-entry, .slung-item[data-item-id], .lashed-attachment[data-item-id], .item-header.lashed-stored-item[data-item-id], .item-header.lashed-sub-stored-item[data-item-id], .item-header.lashed-deep-stored-item[data-item-id]';
const focusRequests = new WeakMap();
const pendingActors = new WeakSet();

export function saveGearOrder(actor, key, ids) {
  const latest = actor.getFlag?.('osp-houserules', GEAR_ORDER_FLAG) || {};
  return actor.update({ [`flags.osp-houserules.${GEAR_ORDER_FLAG}`]: { ...latest, [key]: [...ids] } }, { render: false });
}

export const rowId = row => row?.classList?.contains('body-section-entry') ? '__body__'
  : row?.classList?.contains('slung-section-entry') ? '__slung__' : row?.dataset?.itemId;

export function orderedRows(rows, saved = []) {
  const remaining = new Map(rows.map(row => [rowId(row), row]));
  const result = [];
  for (const id of Array.isArray(saved) ? saved : []) {
    if (remaining.has(id)) { result.push(remaining.get(id)); remaining.delete(id); }
  }
  for (const row of rows) if (remaining.delete(rowId(row))) result.push(row);
  return result;
}

// Fill the original row slots with whole bundles. Non-row headers stay in their slots.
export function reorderBundles(rows, ordered, bundleFor = row => [row]) {
  if (!rows.length || rows.every((row, i) => row === ordered[i])) return;
  const parent = rows[0].parentNode;
  if (!parent || rows.some(row => row.parentNode !== parent)) return;
  const bundles = new Map(rows.map(row => [row, bundleFor(row)]));
  const slots = rows.map(row => {
    const slot = row.ownerDocument.createComment('gear-order-slot');
    parent.insertBefore(slot, row);
    return slot;
  });
  for (const bundle of bundles.values()) for (const node of bundle) parent.removeChild(node);
  ordered.forEach((row, index) => {
    for (const node of bundles.get(row)) parent.insertBefore(node, slots[index]);
  });
  for (const slot of slots) parent.removeChild(slot);
}

export function moveWithinGroup(rows, row, direction, bundleFor = candidate => [candidate]) {
  const index = rows.indexOf(row), target = index + direction;
  if (index < 0 || ![-1, 1].includes(direction) || target < 0 || target >= rows.length) return false;
  const ordered = [...rows];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  reorderBundles(rows, ordered, bundleFor);
  return true;
}

function isDescendant(actor, childId, parentId) {
  const visited = new Set();
  let current = actor.items.get(childId)?.system?.containerId;
  while (current && !visited.has(current)) {
    if (current === parentId) return true;
    visited.add(current);
    current = actor.items.get(current)?.system?.containerId;
  }
  return false;
}

export function flatBundle(row, actor) {
  const bundle = [row], id = rowId(row);
  let next = row.nextElementSibling;
  while (next?.matches(ROW_SELECTOR) && isDescendant(actor, rowId(next), id)) {
    bundle.push(next);
    next = next.nextElementSibling;
  }
  return bundle;
}

function itemDepth(actor, id) {
  let depth = 1, current = actor.items.get(id)?.system?.containerId;
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current); depth++;
    current = actor.items.get(current)?.system?.containerId;
  }
  return depth;
}

export function gearOrderGroups(root, actor) {
  const rootList = root.querySelector('.containers-title + .item-category > .item-list')
    || root.querySelector('.item-category > .item-list');
  const groups = [], seen = new Set();
  for (const row of root.querySelectorAll(ROW_SELECTOR)) {
    const id = rowId(row);
    // Tack wrappers and their own headers both carry the same real ID.
    const ancestor = row.parentElement?.closest(ROW_SELECTOR);
    if (!id || rowId(ancestor) === id || seen.has(id)) continue;
    const parent = row.parentElement;
    const item = actor.items.get(id);
    let key, depth;
    if (parent === rootList) { key = 'top-level'; depth = 0; }
    else if (parent.matches('.body-items-list')) { key = 'body'; depth = 1; }
    else if (parent.matches('.slung-items-list')) { key = 'slung'; depth = 1; }
    else if (row.matches('.vehicle-entry')) { key = 'vehicles'; depth = 0; }
    else if (row.matches('.livestock-entry')) { key = 'livestock'; depth = 0; }
    else if (item?.system?.containerId) {
      key = `${item.system.lashed ? 'lashed' : 'stored'}:${item.system.containerId}`;
      depth = itemDepth(actor, id);
    } else continue;
    seen.add(id);
    let group = groups.find(group => group.key === key && group.parent === parent);
    if (!group) { group = { key, parent, depth, rows: [] }; groups.push(group); }
    group.rows.push(row);
  }
  return groups.sort((a, b) => a.depth - b.depth);
}

function updateMarkers(rows) {
  rows.forEach((row, index) => {
    for (const prefix of ['slung-item', 'lashed-item', 'lashed-attachment']) {
      if (!row.classList.contains(prefix)) continue;
      row.classList.toggle(`first-${prefix}`, index === 0);
      row.classList.toggle(`last-${prefix}`, index === rows.length - 1);
    }
  });
}

function labelFor(row, actor) {
  const id = rowId(row);
  return id === '__body__' ? 'Clothing' : id === '__slung__' ? 'Slung Items'
    : actor.items.get(id)?.name || row.querySelector('.item-name')?.textContent.trim() || 'item';
}

function controlsFor(row, actor) {
  // Keep both first- and last-child grid indices of bare headers intact.
  const host = row.matches('.item-header') ? row.querySelector(':scope > .item-controls') || row : row;
  let controls = host.querySelector(':scope > .item-sort-controls');
  if (!controls) {
    controls = row.ownerDocument.createElement('div');
    controls.className = 'item-sort-controls';
    if (host === row && !row.matches('.item-header')) host.prepend(controls);
    else host.append(controls);
  }
  for (const [direction, name, icon] of [[-1, 'up', 'up'], [1, 'down', 'down']]) {
    let button = controls.querySelector(`button.item-sort-${name}`);
    if (!button) {
      controls.querySelectorAll(`.item-sort-${name}`).forEach(old => old.remove());
      button = row.ownerDocument.createElement('button');
      button.type = 'button'; button.className = `item-sort-${name}`;
      button.innerHTML = `<i class="fas fa-caret-${icon}" aria-hidden="true"></i>`;
      controls.append(button);
    }
    button.dataset.gearOrderDirection = String(direction);
    button.setAttribute('aria-label', `Move ${labelFor(row, actor)} ${name}`);
    button.title = button.getAttribute('aria-label');
  }
  return controls;
}

function refreshControls(group, actor, editable) {
  updateMarkers(group.rows);
  group.rows.forEach((row, index) => {
    row.dataset.gearOrderRow = rowId(row);
    const controls = controlsFor(row, actor);
    controls.querySelector('.item-sort-up').disabled = !editable || index === 0;
    controls.querySelector('.item-sort-down').disabled = !editable || index === group.rows.length - 1;
  });
}

function restoreFocus(root, actor, groups) {
  const request = focusRequests.get(actor);
  if (!request || request.windowId !== root.closest('.window-app')?.id) return;
  const group = groups.find(group => group.key === request.groupKey);
  const row = group?.rows.find(row => rowId(row) === request.rowId);
  if (!row) return;
  root.ownerDocument.defaultView.requestAnimationFrame(() => {
    if (!root.isConnected || focusRequests.get(actor) !== request) return;
    const controls = controlsFor(row, actor);
    let button = request.handle ? controls.querySelector('.gear-order-handle:not(:disabled)')
      : controls.querySelector(`button[data-gear-order-direction="${request.direction}"]`);
    if (button?.disabled) button = controls.querySelector('button:not(:disabled)');
    button?.focus(request.handle ? { preventScroll: true } : undefined);
    focusRequests.delete(actor);
  });
}

export function setupGearOrdering({ root, actor, editable = true }) {
  if (!root || !actor) return () => {};
  const groups = gearOrderGroups(root, actor);
  const saved = actor.getFlag?.('osp-houserules', GEAR_ORDER_FLAG) || {};
  for (const group of groups) {
    const ordered = orderedRows(group.rows, saved[group.key]);
    reorderBundles(group.rows, ordered, row => flatBundle(row, actor));
    group.rows = ordered;
    refreshControls(group, actor, editable);
  }
  // Both arrows and handles commit through this presentation-only transaction.
  const commitOrder = async (group, ordered, focus = {}) => {
    if (!editable || actor.isOwner === false || pendingActors.has(actor)) return false;
    const previous = [...group.rows];
    if (!Array.isArray(ordered) || ordered.length !== previous.length ||
      new Set(ordered).size !== previous.length || ordered.some(row => !previous.includes(row)) ||
      ordered.every((row, index) => row === previous[index])) return false;
    pendingActors.add(actor);
    reorderBundles(previous, ordered, row => flatBundle(row, actor));
    group.rows = ordered;
    refreshControls(group, actor, editable);
    focusRequests.set(actor, { windowId: root.closest('.window-app')?.id,
      groupKey: group.key, ...focus });
    try {
      await saveGearOrder(actor, group.key, ordered.map(rowId));
      restoreFocus(root, actor, groups);
      return true;
    } catch (error) {
      reorderBundles(group.rows, previous, row => flatBundle(row, actor));
      group.rows = previous;
      refreshControls(group, actor, editable);
      focusRequests.delete(actor);
      globalThis.ui?.notifications?.error?.(`Could not save Gear order: ${error.message}`);
      return false;
    } finally { pendingActors.delete(actor); }
  };
  const disposeDrag = setupGearOrderDrag({ root, actor, groups, editable,
    getControls: row => controlsFor(row, actor), getRowId: rowId,
    bundleFor: row => flatBundle(row, actor), commitOrder,
    isBusy: () => pendingActors.has(actor) });
  restoreFocus(root, actor, groups);
  const onClick = async event => {
    const button = event.target.closest?.('button.item-sort-up, button.item-sort-down');
    if (!button || !root.contains(button)) return;
    event.preventDefault(); event.stopPropagation();
    if (button.disabled) return;
    const row = button.closest('[data-gear-order-row]');
    const group = groups.find(group => group.rows.includes(row));
    if (!group) return;
    const direction = Number(button.dataset.gearOrderDirection);
    const index = group.rows.indexOf(row), target = index + direction;
    if (![-1, 1].includes(direction) || target < 0 || target >= group.rows.length) return;
    const ordered = [...group.rows];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await commitOrder(group, ordered, { rowId: rowId(row), direction });
  };
  root.addEventListener('click', onClick, true);
  return () => { disposeDrag(); root.removeEventListener('click', onClick, true); };
}
