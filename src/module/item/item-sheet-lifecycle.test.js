import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeElement {
  constructor() { this.style = { setProperty: (key, value) => { this.style[key] = value; } }; this.handlers = new Map(); this.parentNode = null; this.options = [{ text: 'Item' }]; this.selectedIndex = 0; }
  appendChild(node) { node.parentNode = this; this.children = [...(this.children || []), node]; }
  removeChild(node) { this.children = (this.children || []).filter(child => child !== node); node.parentNode = null; }
  addEventListener() {}
  getBoundingClientRect() { return { left: 10, top: 20, width: 30 }; }
  get offsetWidth() { return 20; }
}

class FakeCollection {
  constructor(element) { this[0] = element; this.length = 1; }
  on(event, callback) { this[0].handlers.set(event, callback); return this; }
  off(namespace) { for (const key of this[0].handlers.keys()) if (!namespace || key.includes(namespace)) this[0].handlers.delete(key); return this; }
  trigger(event, payload = {}) { for (const [key, callback] of this[0].handlers) if (key.split('.')[0] === event) callback({ currentTarget: this[0], ...payload }); }
  find() { return new FakeCollection(new FakeElement()); }
}

let OspItemSheet;
beforeEach(async () => {
  vi.useRealTimers();
  const body = new FakeElement();
  globalThis.document = { body, createElement: () => new FakeElement() };
  globalThis.window = { getComputedStyle: () => ({ getPropertyValue: () => '' }) };
  globalThis.Application = class {};
  globalThis.foundry = { appv1: { sheets: { ItemSheet: class { activateListeners() {} async close() { return true; } } } }, utils: { mergeObject: (a, b) => ({ ...a, ...b }) } };
  globalThis.game = { user: { isGM: false } };
  globalThis.CONFIG = { OSE: {} };
  ({ OspItemSheet } = await import('./item-sheet.js'));
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const sheet = () => {
  const instance = new OspItemSheet();
  instance.item = { type: 'ability', system: { storedSize: 2 } };
  instance.options = { editable: false };
  return instance;
};

describe('item sheet lifecycle-owned tooltips', () => {
  it('keeps tooltip nodes and timers isolated across two active sheets', async () => {
    const first = sheet(); const second = sheet();
    const firstSize = new FakeCollection(new FakeElement()); const secondSize = new FakeCollection(new FakeElement());
    first.activateListeners({ find: selector => selector === '.is-pos-size' ? firstSize : new FakeCollection(new FakeElement()) });
    second.activateListeners({ find: selector => selector === '.is-pos-size' ? secondSize : new FakeCollection(new FakeElement()) });
    expect(document.body.children).toHaveLength(4);
    firstSize.trigger('mouseenter'); secondSize.trigger('mouseenter');
    await first.close();
    vi.advanceTimersByTime(500);
    expect(first._sizeTooltip).toBeNull();
    expect(second._sizeTooltip.parentNode).toBe(document.body);
    expect(document.body.children).toHaveLength(2);
  });

  it('cleans tooltip listeners and nodes when reactivated and closed', async () => {
    const instance = sheet(); const size = new FakeCollection(new FakeElement());
    const html = { find: selector => selector === '.is-pos-size' ? size : new FakeCollection(new FakeElement()) };
    instance.activateListeners(html);
    const firstTooltip = instance._sizeTooltip;
    instance.activateListeners(html);
    expect(firstTooltip.parentNode).toBeNull();
    expect(size[0].handlers.size).toBe(2);
    await instance.close();
    expect(instance._sizeTooltip).toBeNull();
    expect(size[0].handlers.size).toBe(0);
  });

  it('destroys owned handlers when the sheet closes', async () => {
    const instance = sheet();
    const destroy = vi.fn();
    instance.handlers.set('positionTool', { destroy });
    await instance.close();
    expect(destroy).toHaveBeenCalledOnce();
    expect(instance.handlers.size).toBe(0);
  });
});
