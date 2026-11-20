import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initializeTooltips, resolveTooltipLabel, TOOLTIP_DELAY_MS } from './tooltips.js';

class FakeElement {
  constructor(parent = null) {
    this.parentElement = parent;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
  }
  closest() { return this.tooltipOwner || this; }
  contains(node) { return node === this || this.children.includes(node); }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[name.slice(5)] = String(value); }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelectorAll() { return this.children; }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.body = new FakeElement();
    this.documentElement = { style: { setProperty: vi.fn() } };
  }
  addEventListener(type, listener, capture) { this.listeners.set(type, { listener, capture }); }
  removeEventListener(type) { this.listeners.delete(type); }
  createElement() { return { set textContent(value) { this.innerHTML = value; }, innerHTML: '' }; }
  fire(type, target, relatedTarget = null) { this.listeners.get(type)?.listener({ target, relatedTarget }); }
}

const setup = (element = null) => {
  const document = new FakeDocument();
  if (element) document.body.children.push(element);
  globalThis.document = document;
  globalThis.Element = FakeElement;
  globalThis.HTMLElement = FakeElement;
  globalThis.Node = FakeElement;
  globalThis.MutationObserver = class { observe() {} };
  const manager = {
    constructor: { TOOLTIP_ACTIVATION_MS: 0 },
    element,
    clearPending: vi.fn(),
    deactivate: vi.fn(() => { manager.element = null; })
  };
  globalThis.game = {
    tooltip: manager,
    i18n: {
      has: key => key === 'EDITOR.Font.Color.Title' || key === 'EDITOR.BulletList',
      localize: key => ({
        'EDITOR.Font.Color.Title': 'Color',
        'EDITOR.BulletList': 'Bulleted List'
      })[key] ?? key
    }
  };
  initializeTooltips();
  return { document, manager };
};

describe('tooltip hover timing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); delete globalThis.document; delete globalThis.game; });

  it('keeps Foundry reveal delay at two seconds', () => {
    const { manager } = setup();
    expect(TOOLTIP_DELAY_MS).toBe(2000);
    expect(manager.constructor.TOOLTIP_ACTIVATION_MS).toBe(2000);
  });

  it('resolves known editor keys and preserves ordinary labels', () => {
    setup();
    expect(resolveTooltipLabel('EDITOR.Font.Color.Title')).toBe('Color');
    expect(resolveTooltipLabel('EDITOR.Unknown')).toBe('EDITOR.Unknown');
    expect(resolveTooltipLabel('Move Up')).toBe('Move Up');
  });

  it('normalizes editor keys on dynamically-created tooltip owners', () => {
    const owner = new FakeElement();
    owner.setAttribute('title', 'EDITOR.Font.Color.Title');
    const { document } = setup(owner);
    expect(owner.getAttribute('title')).toBeNull();
    expect(owner.getAttribute('data-tooltip')).toBe('Color');
    expect(owner.getAttribute('aria-label')).toBe('Color');
    expect(document.documentElement.style.setProperty).toHaveBeenCalledWith('--osp-tooltip-delay', '2000ms');
  });

  it('localizes existing data tooltip attributes without altering literal text', () => {
    const owner = new FakeElement();
    owner.setAttribute('data-tooltip', 'EDITOR.BulletList');
    owner.setAttribute('data-tooltip-text', 'Plain text');
    owner.setAttribute('aria-label', 'EDITOR.BulletList');
    setup(owner);
    expect(owner.getAttribute('data-tooltip')).toBe('Bulleted List');
    expect(owner.getAttribute('data-tooltip-text')).toBe('Plain text');
    expect(owner.getAttribute('aria-label')).toBe('Bulleted List');
  });

  it('cancels a pending tooltip immediately on leaving its owner', () => {
    const owner = new FakeElement();
    const { document, manager } = setup();
    document.fire('pointerenter', owner);
    document.fire('pointerleave', owner);
    expect(manager.clearPending).toHaveBeenCalledOnce();
    expect(manager.deactivate).toHaveBeenCalledOnce();
  });

  it('dismisses an active tooltip immediately on leaving its owner', () => {
    const owner = new FakeElement();
    const { document, manager } = setup(owner);
    document.fire('pointerleave', owner);
    expect(manager.deactivate).toHaveBeenCalledOnce();
  });

  it('starts a fresh hover when moving between tooltip owners', () => {
    const first = new FakeElement();
    const second = new FakeElement();
    const { document, manager } = setup(first);
    document.fire('pointerenter', second);
    expect(manager.clearPending).toHaveBeenCalledOnce();
    expect(manager.deactivate).toHaveBeenCalledOnce();
    expect(manager.element).toBeNull();
  });

  it('does not dismiss when moving within the same owner', () => {
    const owner = new FakeElement();
    const child = new FakeElement(owner);
    child.tooltipOwner = owner;
    owner.children.push(child);
    const { document, manager } = setup(owner);
    document.fire('pointerenter', owner);
    document.fire('pointerleave', child, owner);
    expect(manager.clearPending).not.toHaveBeenCalled();
    expect(manager.deactivate).not.toHaveBeenCalled();
  });
});
