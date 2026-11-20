import { describe, expect, it, vi } from 'vitest';
import { setupGearOrderDrag } from './gear-order-drag.js';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

function fixture({ editable = true, owner = true, busy = false } = {}) {
  const rootListeners = new Map(), docListeners = new Map(), viewListeners = new Map();
  const raf = [], cancelled = new Set(), appended = [];
  const body = { append(node) { appended.push(node); node.parentElement = body; } };
  const doc = {
    body,
    visibilityState: 'visible',
    defaultView: {
      addEventListener: (type, listener) => viewListeners.set(type, listener),
      removeEventListener: type => viewListeners.delete(type),
      requestAnimationFrame: callback => { raf.push(callback); return raf.length; },
      cancelAnimationFrame: id => cancelled.add(id)
    },
    addEventListener: (type, listener) => docListeners.set(type, listener),
    removeEventListener: type => docListeners.delete(type),
    createElement: tag => element(tag, doc),
    elementFromPoint: () => target
  };
  const makeHeader = top => element('div', doc, {
    className: 'item-header',
    rect: { left: 10, top, width: 180, height: 40, right: 190, bottom: top + 40 }
  });
  const source = element('li', doc, { dataset: { itemId: 'a' } });
  const target = element('li', doc, { dataset: { itemId: 'b' } });
  const third = element('li', doc, { dataset: { itemId: 'c' } });
  source.header = makeHeader(10); target.header = makeHeader(60); third.header = makeHeader(110);
  const rows = [source, target, third];
  for (const row of rows) row.querySelector = selector => selector.includes('item-header') ? row.header : null;
  const handles = new Map();
  const controls = row => ({ querySelector: () => handles.get(row) || null, append: node => handles.set(row, node) });
  for (const row of rows) {
    const handle = element('button', doc, { className: 'gear-order-handle' });
    handle.closest = selector => selector === '.gear-order-handle' ? handle : row;
    handles.set(row, handle);
  }
  const scrollSurface = element('div', doc, {
    className: 'gear-scrollable-content',
    rect: { left: 0, top: 0, width: 220, height: 180, right: 220, bottom: 180 }
  });
  scrollSurface.scrollTop = 0; scrollSurface.clientTop = 0; scrollSurface.scrollLeft = 0;
  scrollSurface.offsetHeight = 180; scrollSurface.scrollHeight = 360; scrollSurface.clientHeight = 180;
  const root = element('section', doc, { rect: { left: 0, top: 0, width: 220, height: 200, right: 220, bottom: 200 } });
  rootListeners.clear();
  for (const [type, listener] of root._listeners) rootListeners.set(type, listener);
  root.isConnected = true; root.querySelector = selector => selector === '.gear-scrollable-content' ? scrollSurface : null;
  root.contains = node => rows.includes(node) || node === root || node === scrollSurface;
  root.append = node => { appended.push(node); node.parentElement = root; };
  const actor = { id: 'actor-a', isOwner: owner, items: new Map(rows.map(row => [row.dataset.itemId, { name: row.dataset.itemId }])) };
  const commitOrder = vi.fn();
  const dispose = setupGearOrderDrag({ root, actor, groups: [{ key: 'gear', rows, parent: root }], editable,
    getControls: controls, getRowId: row => row.dataset.itemId, commitOrder, isBusy: () => busy });
  rootListeners.clear();
  for (const [type, listener] of root._listeners) rootListeners.set(type, listener);
  const emit = (map, type, event = {}) => map.get(type)?.({ type, target: source, ...event });
  const flushRaf = (time = 16.67) => { while (raf.length) raf.shift()(time); };
  return { root, source, target, third, handles, rootListeners, docListeners, viewListeners,
    appended, raf, cancelled, scrollSurface, commitOrder, dispose, emit, flushRaf };
}

function pointer(type, target, x, y, extra = {}) {
  return { type, target, clientX: x, clientY: y, pointerId: 7, button: 0,
    preventDefault: vi.fn(), stopPropagation: vi.fn(), stopImmediatePropagation: vi.fn(),
    ...extra };
}

describe('pointer gear-order lifecycle', () => {
  it('requires an editable owned non-busy connected source and primary pointer', () => {
    for (const options of [{ editable: false }, { owner: false }, { busy: true }]) {
      const f = fixture(options); const event = pointer('pointerdown', f.handles.get(f.source), 20, 20, { button: 0 });
      f.emit(f.rootListeners, 'pointerdown', event);
      expect(event.preventDefault).toHaveBeenCalled();
      f.dispose();
    }
    const f = fixture(); const event = pointer('pointerdown', f.handles.get(f.source), 20, 20, { button: 2 });
    f.emit(f.rootListeners, 'pointerdown', event);
    expect(event.preventDefault).not.toHaveBeenCalled(); f.dispose();
  });

  it('waits for the four-pixel threshold, coalesces moves, and commits once on pointerup', () => {
    const f = fixture(); const handle = f.handles.get(f.source);
    let captured = false;
    const capture = vi.fn(() => { captured = true; }); handle.setPointerCapture = capture;
    handle.hasPointerCapture = () => captured;
    handle.releasePointerCapture = vi.fn(() => { captured = false; f.emit(f.docListeners,'lostpointercapture',pointer('lostpointercapture',handle,30,100)); });
    f.emit(f.rootListeners, 'pointerdown', pointer('pointerdown', handle, 20, 20));
    expect(capture).toHaveBeenCalledWith(7);
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 22, 22));
    expect(f.appended).toHaveLength(0); expect(f.commitOrder).not.toHaveBeenCalled();
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 90));
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 100));
    expect(f.commitOrder).not.toHaveBeenCalled(); f.flushRaf();
    expect(f.appended.filter(node => node.className.includes('gear-order-drop-indicator'))).toHaveLength(1);
    f.emit(f.docListeners, 'pointerup', pointer('pointerup', f.target, 30, 100));
    expect(f.commitOrder).toHaveBeenCalledTimes(1);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(captured).toBe(false);
    expect(f.commitOrder.mock.calls[0][0].key).toBe('gear');
    expect(f.commitOrder.mock.calls[0][1]).toEqual([f.target, f.source, f.third]);
    expect(f.commitOrder.mock.calls[0][2]).toEqual(expect.objectContaining({ rowId: 'a', handle: true }));
    f.dispose();
  });

  it('keeps burst moves to one queued frame and reuses one indicator across frames', () => {
    const f = fixture(); const handle = f.handles.get(f.source);
    f.emit(f.rootListeners, 'pointerdown', pointer('pointerdown', handle, 20, 20));
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 90));
    expect(f.raf).toHaveLength(1);
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 100));
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 110));
    expect(f.raf).toHaveLength(1); f.flushRaf();
    const indicators = f.appended.filter(node => node.className.includes('gear-order-drop-indicator'));
    expect(indicators).toHaveLength(1);
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 120));
    expect(f.raf).toHaveLength(1); f.flushRaf();
    expect(f.appended.filter(node => node.className.includes('gear-order-drop-indicator'))).toHaveLength(1);
    f.dispose();
  });

  it('bounds auto-scroll at the scroll maximum and stops scheduling there', () => {
    const f = fixture(); const handle = f.handles.get(f.source);
    f.emit(f.rootListeners, 'pointerdown', pointer('pointerdown', handle, 20, 20));
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 179));
    for (let index = 0; index < 80 && f.raf.length; index += 1) f.raf.shift()(16.67 * index);
    expect(f.scrollSurface.scrollTop).toBe(180);
    expect(f.raf).toHaveLength(0); f.dispose();
  });

  it('cancels when the source becomes disconnected during an active gesture', () => {
    const f = fixture(); const handle = f.handles.get(f.source);
    f.emit(f.rootListeners, 'pointerdown', pointer('pointerdown', handle, 20, 20));
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 90));
    f.source.isConnected = false;
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 100));
    f.emit(f.docListeners, 'pointerup', pointer('pointerup', f.target, 30, 100));
    expect(f.commitOrder).not.toHaveBeenCalled(); f.dispose();
  });

  it('cancels on outside/cancel/lost capture/Escape, while leaving outside-and-back movement valid', () => {
    const f = fixture(); const handle = f.handles.get(f.source); handle.setPointerCapture = vi.fn();
    f.emit(f.rootListeners, 'pointerdown', pointer('pointerdown', handle, 20, 20));
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 90));
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 100)); f.flushRaf();
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 500, 500));
    f.emit(f.docListeners, 'pointermove', pointer('pointermove', f.target, 30, 100));
    f.emit(f.docListeners, 'pointerup', pointer('pointerup', f.target, 30, 100));
    expect(f.commitOrder).toHaveBeenCalledTimes(1);
    f.dispose();

    const cancelled = fixture(); const h = cancelled.handles.get(cancelled.source); h.setPointerCapture = vi.fn();
    cancelled.emit(cancelled.rootListeners, 'pointerdown', pointer('pointerdown', h, 20, 20));
    cancelled.emit(cancelled.docListeners, 'pointercancel', pointer('pointercancel', h, 20, 20));
    expect(cancelled.commitOrder).not.toHaveBeenCalled();
    cancelled.emit(cancelled.rootListeners, 'pointerdown', pointer('pointerdown', h, 20, 20));
    cancelled.emit(cancelled.docListeners, 'lostpointercapture', pointer('lostpointercapture', h, 20, 20));
    cancelled.emit(cancelled.rootListeners, 'pointerdown', pointer('pointerdown', h, 20, 20));
    cancelled.emit(cancelled.docListeners, 'keydown', { key: 'Escape', stopImmediatePropagation: vi.fn() });
    expect(cancelled.commitOrder).not.toHaveBeenCalled(); cancelled.dispose();
  });

  it('leaves image drag untouched and suppresses native handle drag fallback', () => {
    const f = fixture(); const image = element('img', f.root.ownerDocument);
    image.closest = () => null;
    const imagePointer = pointer('pointerdown', image, 20, 20);
    f.emit(f.rootListeners, 'pointerdown', imagePointer);
    expect(imagePointer.preventDefault).not.toHaveBeenCalled();
    const imageDrag = { type: 'dragstart', target: image, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), dataTransfer: { types: [] } };
    f.emit(f.rootListeners, 'dragstart', imageDrag); expect(imageDrag.preventDefault).not.toHaveBeenCalled();
    const native = { type: 'dragstart', target: f.handles.get(f.source), preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(),
      dataTransfer: { types: [], setData: vi.fn(), setDragImage: vi.fn() } };
    f.emit(f.rootListeners, 'dragstart', native); expect(native.preventDefault).toHaveBeenCalled();
    f.dispose();
    expect(f.root._listeners.size + f.docListeners.size + f.viewListeners.size).toBe(0);
  });
});

function element(tag, ownerDocument, options = {}) {
  const listeners = new Map();
  const node = { nodeType: 1, tagName: tag.toUpperCase(), ownerDocument, parentElement: null,
    className: options.className || '', classList: new FakeClassList(), dataset: options.dataset || {},
    style: {}, children: [], isConnected: true, disabled: false, draggable: true,
    rect: options.rect || { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: type => listeners.delete(type),
    querySelector: () => null, matches: selector => selector === `.${options.className}`,
    closest: () => null, append(child) { this.children.push(child); child.parentElement = this; },
    remove() { this.removed = true; }, getBoundingClientRect() { return this.rect; },
    setAttribute(key, value) { this[key] = value; }, getAttribute(key) { return this[key]; },
    setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => false,
    focus: vi.fn(), _listeners: listeners };
  node.classList.toggle = (value, force) => { if (force) node.classList.add(value); else node.classList.remove(value); };
  node.removeAttribute = key => { delete node[key]; };
  return node;
}
