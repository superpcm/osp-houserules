/* Pointer-driven handle ordering. Item/image drags remain native Foundry drags. */
export const GEAR_ORDER_MIME = 'application/x-osp-gear-order';
const HANDLE = '.gear-order-handle';
const ROW = '[data-gear-order-row]';
const ACTIVE = 'data-gear-order-pointer-active';
export function isGearOrderDrag(event) {
  return Boolean(Array.from(event?.dataTransfer?.types || []).includes(GEAR_ORDER_MIME) ||
    (event?.type === 'dragstart' && (event.target?.closest?.(HANDLE) || event.target?.closest?.(`[${ACTIVE}]`))));
}
export function insertionOrder(rows, source, target, after = false) {
  if (!rows.includes(source) || !rows.includes(target) || source === target) return null;
  const ordered = rows.filter(row => row !== source);
  ordered.splice(ordered.indexOf(target) + (after ? 1 : 0), 0, source);
  return ordered.every((row, index) => row === rows[index]) ? null : ordered;
}
export function targetInGroup(group, target) {
  let node = target?.nodeType === 1 ? target : target?.parentElement;
  while (node) { if (group.rows.includes(node)) return node; node = node.parentElement; }
  return null;
}
const headerFor = row => row.matches('.item-header') ? row : row.querySelector(':scope > .item-header');
const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };

export function setupGearOrderDrag({root, actor, groups = [], editable = true, getControls,
  getRowId, bundleFor = row => [row], commitOrder, isBusy = () => false} = {}) {
  if (!root || !actor || !getControls || !getRowId || !commitOrder) return () => {};
  const doc = root.ownerDocument, view = doc.defaultView;
  const scroll = root.querySelector('.gear-scrollable-content');
  let session = null, frame = 0, disposed = false;
  const canEdit = () => !disposed && editable && actor.isOwner !== false && !isBusy() && root.isConnected;
  for (const group of groups) for (const row of group.rows) {
    const controls = getControls(row);
    let handle = controls.querySelector(':scope > .gear-order-handle');
    if (!handle) {
      handle = doc.createElement('button'); handle.type = 'button'; handle.className = 'gear-order-handle';
      handle.innerHTML = '<i class="fas fa-grip-vertical" aria-hidden="true"></i>'; controls.append(handle);
    }
    const name = actor.items.get(getRowId(row))?.name || headerFor(row)?.querySelector('.item-name')?.textContent.trim() || 'item';
    handle.setAttribute('aria-label', `Drag to reorder ${name}`); handle.title = handle.getAttribute('aria-label');
    handle.disabled = !editable || actor.isOwner === false || group.rows.length < 2;
    handle.draggable = false; // A handle must never initiate an ancestor's Item drag.
  }
  const validSession = () => session && canEdit() && session.source.isConnected &&
    root.contains(session.source) && session.group.rows.includes(session.source);
  const cancelFrame = () => { if (frame) view.cancelAnimationFrame(frame); frame = 0; };
  const cleanup = () => {
    const old = session; session = null; cancelFrame();
    root.removeAttribute(ACTIVE); root.classList.remove('gear-order-pointer-active');
    if (!old) return;
    old.header.classList.remove('gear-order-dragging'); old.indicator?.remove(); old.ghost?.remove();
    try { if (old.handle.hasPointerCapture?.(old.pointerId)) old.handle.releasePointerCapture(old.pointerId); } catch { /* Pointer may already have been cancelled by the browser. */ }
  };
  const makeOverlay = className => {
    const node = doc.createElement('div'); node.className = className; node.setAttribute('aria-hidden','true');
    doc.body.append(node); return node;
  };
  const activate = () => {
    session.active = true; session.header.classList.add('gear-order-dragging');
    root.classList.add('gear-order-pointer-active');
    session.indicator = makeOverlay('gear-order-drop-indicator osp-gear-order-drop-indicator');
    session.indicator.hidden = true;
    session.ghost = makeOverlay('osp-gear-order-pointer-ghost');
    session.ghost.textContent = actor.items.get(getRowId(session.source))?.name ||
      session.header.querySelector('.item-name')?.textContent.trim() || 'Gear';
  };
  const measure = () => {
    // Rows do not move until release. Cache their geometry; scrolling uses a cheap Y offset.
    session.cache = {
      scrollTop: scroll?.scrollTop || 0,
      scaleY: scroll ? scroll.getBoundingClientRect().height / scroll.offsetHeight || 1 : 1,
      parent: session.group.parent.getBoundingClientRect(),
      rows: session.group.rows.map(row => {
        const rect = row.getBoundingClientRect(), header = (headerFor(row) || row).getBoundingClientRect();
        const last = bundleFor(row).at(-1) || row;
        return {row,left:rect.left,right:rect.right,top:rect.top,bottom:last.getBoundingClientRect().bottom,
          middle:header.top + header.height / 2};
      }),
    };
  };
  const logicalRow = hit => {
    const direct = targetInGroup(session.group, hit); if (direct) return direct;
    const nested = hit?.closest?.(ROW), visited = new Set();
    let parentId = actor.items.get(nested?.dataset?.itemId)?.system?.containerId;
    while (parentId && !visited.has(parentId)) {
      const match = session.group.rows.find(row => getRowId(row) === parentId); if (match) return match;
      visited.add(parentId); parentId = actor.items.get(parentId)?.system?.containerId;
    }
    return null;
  };
  const placementAt = () => {
    if (!validSession()) return null;
    if (!session.cache) measure();
    const point = session.point, cache = session.cache;
    const delta = ((scroll?.scrollTop || 0) - cache.scrollTop) * cache.scaleY;
    const viewport = scroll?.getBoundingClientRect();
    if (viewport && (point.x < viewport.left || point.x > viewport.right || point.y < viewport.top || point.y > viewport.bottom)) return null;
    const hit = doc.elementFromPoint(point.x,point.y), row = logicalRow(hit);
    let entry = row && cache.rows.find(entry => entry.row === row);
    if (!entry) {
      // Accept gaps in this list, but never a row from another container or lash group.
      const nearest = hit?.closest?.(ROW), owner = session.group.parent.closest?.(ROW);
      if (nearest && nearest !== owner) return null;
      const parent = cache.parent;
      if (point.x < parent.left || point.x > parent.right || point.y < parent.top - delta || point.y > parent.bottom - delta) return null;
      entry = cache.rows.find(entry => point.y <= entry.bottom - delta) || cache.rows.at(-1);
    }
    if (!entry) return null;
    const after = point.y >= entry.middle - delta;
    const ordered = insertionOrder(session.group.rows,session.source,entry.row,after);
    return ordered ? {entry,after,ordered,delta,viewport} : null;
  };
  const paint = placement => {
    const {point,indicator,ghost} = session;
    ghost.style.transform = `translate3d(${point.x + 12}px, ${point.y + 12}px, 0)`;
    ghost.classList.toggle('is-invalid',!placement);
    if (!placement) { indicator.hidden = true; return; }
    const {entry,after,delta,viewport} = placement;
    const y = (after ? entry.bottom : entry.top) - delta;
    const left = Math.max(entry.left,viewport?.left ?? entry.left), right = Math.min(entry.right,viewport?.right ?? entry.right);
    indicator.hidden = Boolean(viewport && (y < viewport.top || y > viewport.bottom));
    const position = `${left}|${y}|${right-left}`;
    if (session.indicatorPosition !== position) {
      indicator.style.transform = `translate3d(${left}px, ${y}px, 0)`;
      indicator.style.width = `${Math.max(0,right-left)}px`; session.indicatorPosition = position;
    }
  };
  const autoScroll = elapsed => {
    if (!scroll) return false;
    const rect = scroll.getBoundingClientRect(), {x,y} = session.point, edge = 32;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
    const distance = y < rect.top + edge ? y - rect.top - edge : y > rect.bottom - edge ? y - rect.bottom + edge : 0;
    const speed = Math.max(-8,Math.min(8,distance / edge * 8));
    const before = scroll.scrollTop, max = Math.max(0,scroll.scrollHeight-scroll.clientHeight);
    const next = Math.max(0,Math.min(max,before + speed * elapsed / 16.67));
    if (next === before) return false;
    scroll.scrollTop = next; return scroll.scrollTop !== before;
  };
  const tick = time => {
    frame = 0; if (!session?.active) return;
    if (!validSession()) { cleanup(); return; }
    const elapsed = session.lastTime === null ? 16.67 : Math.max(0,Math.min(32,time-session.lastTime));
    session.lastTime = time;
    const moved = autoScroll(elapsed);
    paint(placementAt());
    if (moved) schedule();
  };
  const schedule = () => { if (!frame) frame = view.requestAnimationFrame(tick); };
  const matchesPointer = event => session && event.pointerId === session.pointerId;
  const onPointerDown = event => {
    const handle = event.target.closest?.(HANDLE); if (!handle) return;
    if (event.button !== 0 || event.isPrimary === false) return;
    consume(event);
    const source = handle.closest(ROW), group = groups.find(group => group.rows.includes(source));
    if (!canEdit() || handle.disabled || !group) return;
    cleanup();
    const point = {x:event.clientX,y:event.clientY};
    session = {handle,source,group,pointerId:event.pointerId,origin:point,point,header:headerFor(source)||source,
      active:false,cache:null,lastTime:null};
    root.setAttribute(ACTIVE,''); handle.focus({preventScroll:true});
    try { handle.setPointerCapture(event.pointerId); } catch { /* Document listeners still track release outside the row. */ }
  };
  const onPointerMove = event => {
    if (!matchesPointer(event)) return;
    consume(event); session.point = {x:event.clientX,y:event.clientY};
    if (!validSession()) { cleanup(); return; }
    if (!session.active) {
      if (Math.hypot(session.point.x-session.origin.x,session.point.y-session.origin.y) < 4) return;
      activate();
    }
    schedule();
  };
  const onPointerUp = async event => {
    if (!matchesPointer(event)) return;
    consume(event); session.point = {x:event.clientX,y:event.clientY};
    const current = session, placement = current.active ? placementAt() : null;
    cleanup();
    if (placement) await commitOrder(current.group,placement.ordered,{rowId:getRowId(current.source),handle:true});
  };
  const onPointerCancel = event => { if (matchesPointer(event)) cleanup(); };
  const onKeyDown = event => { if (event.key === 'Escape' && session) { event.stopImmediatePropagation(); cleanup(); } };
  const onNativeDragStart = event => { if (session || isGearOrderDrag(event)) consume(event); };
  const onLegacyNative = event => { if (isGearOrderDrag(event)) consume(event); };
  const onClick = event => { if (event.target.closest?.(HANDLE)) consume(event); };
  const onScroll = event => {
    if (!session?.active) return;
    if (event.target !== scroll) session.cache = null;
    schedule();
  };
  const onResize = () => { if (session?.active) { session.cache = null; schedule(); } };
  const onVisibility = () => { if (doc.visibilityState === 'hidden') cleanup(); };
  const rootListeners = [['pointerdown',onPointerDown],['click',onClick],['dragstart',onNativeDragStart],
    ['dragenter',onLegacyNative],['dragover',onLegacyNative],['drop',onLegacyNative]];
  const docListeners = [['pointermove',onPointerMove],['pointerup',onPointerUp],['pointercancel',onPointerCancel],
    ['lostpointercapture',onPointerCancel],['keydown',onKeyDown],['scroll',onScroll],['visibilitychange',onVisibility]];
  for (const [type,listener] of rootListeners) root.addEventListener(type,listener,true);
  for (const [type,listener] of docListeners) doc.addEventListener(type,listener,true);
  view.addEventListener('blur',cleanup); view.addEventListener('resize',onResize);
  return () => {
    if (disposed) return; disposed = true; cleanup();
    for (const [type,listener] of rootListeners) root.removeEventListener(type,listener,true);
    for (const [type,listener] of docListeners) doc.removeEventListener(type,listener,true);
    view.removeEventListener('blur',cleanup); view.removeEventListener('resize',onResize);
  };
}
