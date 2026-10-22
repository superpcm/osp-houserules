import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundHandler } from './background-handler.js';

class Element {
  constructor() { this.style = { setProperty: (k, v) => { this.style[k] = v; } }; this.handlers = new Map(); this.options = [{ text: 'A very long background' }]; this.selectedIndex = 0; this.parentNode = null; }
  get offsetWidth() { if (this.throwWidth) throw new Error('measure failed'); return 400; }
  getBoundingClientRect() { return { width: 400 }; }
}
class Collection {
  constructor(element) { this[0] = element; this.length = 1; }
  on(event, callback) { this[0].handlers.set(event, callback); return this; }
  off(namespace) { for (const key of this[0].handlers.keys()) if (key.includes(namespace)) this[0].handlers.delete(key); return this; }
  trigger(event) { for (const [key, callback] of this[0].handlers) if (key.split('.')[0] === event) callback(); }
}
class Html {
  constructor(collection) { this.collection = collection; }
  find() { return this.collection; }
}

beforeEach(() => {
  vi.useFakeTimers();
  const body = { children: [], appendChild(node) { node.parentNode = body; body.children.push(node); }, removeChild(node) { body.children = body.children.filter(child => child !== node); node.parentNode = null; } };
  globalThis.document = { body, createElement: () => new Element() };
  globalThis.window = { getComputedStyle: () => ({ getPropertyValue: () => '' }) };
});
afterEach(() => vi.useRealTimers());

const setup = () => { const select = new Element(); select.parentNode = document.body; const handler = new BackgroundHandler(new Html(new Collection(select)), {}); handler.initialize(); return { handler, select }; };

describe('BackgroundHandler lifecycle', () => {
  it('tracks and cancels every delayed sizing callback on destroy', () => {
    const { handler } = setup();
    expect(handler._timers.size).toBe(1);
    handler.destroy();
    vi.runAllTimers();
    expect(handler._timers.size).toBe(0);
    expect(document.body.children).toHaveLength(0);
  });

  it('reactivation removes only its namespaced listener and leaves another instance active', () => {
    const first = setup(); const second = setup();
    first.handler.initialize();
    expect(first.select.handlers.size).toBe(1);
    expect(second.select.handlers.size).toBe(1);
    second.select.handlers.get([...second.select.handlers.keys()][0])();
    expect(second.handler._timers.size).toBe(2);
    first.handler.destroy();
    expect(second.select.handlers.size).toBe(1);
  });

  it('completes delayed sizing and removes the measuring node', () => {
    const { handler } = setup();
    vi.advanceTimersByTime(110);
    expect(document.body.children).toHaveLength(0);
    expect(handler._timers.size).toBe(0);
  });

  it('removes the measuring node when measurement throws', () => {
    setup();
    vi.advanceTimersByTime(100);
    document.createElement = () => { const node = new Element(); node.throwWidth = true; return node; };
    expect(() => vi.advanceTimersByTime(10)).toThrow('measure failed');
    expect(document.body.children).toHaveLength(0);
  });
});
