import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
let ItemCardDialog, listeners;
beforeAll(async () => {
  globalThis.Application = class { async close() { return true; } };
  ({ ItemCardDialog } = await import('./item-card-dialog.js'));
});
beforeEach(() => {
  listeners = new Map();
  globalThis.document = {
    querySelectorAll: () => [],
    addEventListener: (name, callback) => { const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set); },
    removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
  };
});
const canvas = () => { const events = new Map(); return { style: {}, events, addEventListener: (n, f) => events.set(n, f), removeEventListener: (n, f) => { if (events.get(n) === f) events.delete(n); } }; };
function card() { const c = Object.create(ItemCardDialog.prototype); c.canvas = canvas(); c.element = [{ style: {}, offsetLeft: 0, offsetTop: 0 }]; return c; }
it('closing a dragging card removes only its own document listeners', async () => {
  const a = card(), b = card(); a._setupDragging(); b._setupDragging();
  const click = { button: 0, detail: 1, clientX: 1, clientY: 1, preventDefault() {} };
  a.canvas.events.get('mousedown')(click); b.canvas.events.get('mousedown')(click);
  expect(listeners.get('mousemove').size).toBe(2);
  const aCanvas = a.canvas; await a.close();
  expect(aCanvas.events.size).toBe(0); expect(listeners.get('mousemove').size).toBe(1);
  for (const callback of [...listeners.get('mouseup')]) callback();
  expect(listeners.get('mousemove').size).toBe(0);
});
it('does not install a card render that finishes after close', async () => {
  const c = card(); let resolve; c.renderer = { renderCard: () => new Promise(r => { resolve = r; }) };
  const appendChild = vi.fn(); const html = { find: () => [{ appendChild }] };
  const rendering = c._renderCard(html); await c.close(); resolve(canvas()); await rendering;
  expect(c.canvas).toBeNull(); expect(appendChild).not.toHaveBeenCalled();
});
it('replaces the canvas listener instead of accumulating drag handlers', () => {
  const c = card(), node = c.canvas;
  c._setupDragging(); c._setupDragging(); expect(node.events.size).toBe(1);
  c._disposeCard(); expect(node.events.size).toBe(0);
});

it('shows Cast only on owned linked cards and disables exhausted or pending uses', () => {
  const c = card();
  c.item = { type: 'item', actor: { isOwner: true, getFlag: () => null }, system: { spellKey: 'light', spellClass: 'magic-user', spellSourceKind: 'scroll', quantity: 1 } };
  const button = { hidden: true };
  const selection = { 0: button, off() { return this; }, on() { return this; } };
  const html = { find: () => selection };
  c._setupSpellControls(html);
  expect(button.hidden).toBe(false); expect(button.disabled).toBe(false);
  c.item.system.quantity = 0; c._setupSpellControls(html);
  expect(button.disabled).toBe(true);
  c.item.system.quantity = 1; c.item.actor.getFlag = () => ({ stage: 'planned' }); c._setupSpellControls(html);
  expect(button.disabled).toBe(true);
  c.item.actor.isOwner = false; c._setupSpellControls(html);
  expect(button.hidden).toBe(true);
});
