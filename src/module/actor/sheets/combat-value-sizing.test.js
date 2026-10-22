import { describe, expect, it, vi } from 'vitest';
import { activateCombatValueSizing, combatNumeralGeometry } from './combat-value-sizing.js';

const metrics = (width, height) => ({ width, actualBoundingBoxLeft: width / 2, actualBoundingBoxRight: width / 2, actualBoundingBoxAscent: height, actualBoundingBoxDescent: 0 });

describe('combat numeral fitting', () => {
  it('targets the approved 38% of frame height', () => {
    const result = combatNumeralGeometry(metrics(40, 70), [metrics(40, 70)], 100, 100);
    expect(result.inkHeight).toBeCloseTo(38);
  });
  it('shrinks wide values to the inner width cap', () => {
    const result = combatNumeralGeometry(metrics(200, 70), [metrics(200, 70)], 100, 100);
    expect(result.inkWidth).toBeCloseTo(70);
    expect(result.inkHeight).toBeCloseTo(24.5);
  });
  it('rejects hidden or invalid frames', () => {
    expect(combatNumeralGeometry(metrics(40, 70), [metrics(40, 70)], 0, 100)).toBeNull();
    expect(combatNumeralGeometry(metrics(40, 70), [metrics(40, 70)], Infinity, 100)).toBeNull();
    expect(combatNumeralGeometry(metrics(-40, 70), [metrics(-40, 70)], 100, 100)).toBeNull();
    expect(combatNumeralGeometry(metrics(180, 70), [metrics(180, 70)], 100, 100).inkWidth).toBeCloseTo(70);
  });

  it('coalesces input, tab, resize, and font updates and disposes every listener', async () => {
    const listeners = {};
    const input = {
      value: '12', style: { setProperty: vi.fn() },
      addEventListener: (name, callback) => { listeners[`input:${name}`] = callback; },
      removeEventListener: (name, callback) => { expect(listeners[`input:${name}`]).toBe(callback); delete listeners[`input:${name}`]; },
      closest: () => ({ getBoundingClientRect: () => ({ width: 100, height: 100 }) })
    };
    const tabLink = { addEventListener: (name, callback) => { listeners[`tab:${name}`] = callback; }, removeEventListener: (name, callback) => { expect(listeners[`tab:${name}`]).toBe(callback); } };
    const resize = { observe: vi.fn(), disconnect: vi.fn() };
    const raf = vi.fn(callback => { listeners.raf = callback; return 1; });
    let resolveFonts;
    const fontsReady = new Promise(resolve => { resolveFonts = resolve; });
    const win = { requestAnimationFrame: raf, cancelAnimationFrame: vi.fn(), ResizeObserver: vi.fn(callback => { listeners.resize = callback; return resize; }), getComputedStyle: () => ({ fontStyle: 'normal', fontWeight: '400', fontFamily: 'handwritten' }) };
    win.document = { fonts: { ready: fontsReady } };
    const context = { font: '', measureText: () => metrics(40, 70) };
    const root = {
      ownerDocument: { defaultView: win, createElement: () => ({ getContext: () => context }) },
      querySelectorAll: () => [input],
      querySelector: selector => selector.includes('sheet-tabs') ? tabLink : {}
    };
    const dispose = activateCombatValueSizing(root);
    expect(input.style.setProperty).toHaveBeenCalled();
    listeners['input:input'](); listeners['tab:click']();
    listeners.resize();
    expect(raf).toHaveBeenCalledTimes(1);
    listeners.raf();
    listeners['input:input']();
    const callsAfterUpdate = input.style.setProperty.mock.calls.length;
    dispose();
    expect(resize.disconnect).toHaveBeenCalled();
    expect(win.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(listeners['input:input']).toBeUndefined();
    resolveFonts();
    await Promise.resolve();
    expect(input.style.setProperty).toHaveBeenCalledTimes(callsAfterUpdate);
    listeners['tab:click']?.();
    expect(raf).toHaveBeenCalledTimes(2);
  });
});


it.each([[100, 100], [60, 92], [200, 180]])('fits full negative/multidigit ink in a %s by %s frame', (width, height) => {
  const digits = Array.from({ length: 10 }, () => metrics(40, 70));
  for (const ink of [metrics(120, 70), metrics(180, 75)]) {
    const fitted = combatNumeralGeometry(ink, digits, width, height);
    expect(fitted.inkWidth).toBeLessThanOrEqual(width * .70 + 1e-9);
    expect(fitted.inkHeight).toBeLessThanOrEqual(height * .38 + 1e-9);
    expect(fitted.fontSize).toBeGreaterThan(0);
  }
  expect(combatNumeralGeometry(metrics(30, 60), digits, width, height).fontSize)
    .toBe(combatNumeralGeometry(metrics(40, 70), digits, width, height).fontSize);
});

it('waits for a visible frame and measures negative text again when fonts become ready', async () => {
  let rect = { width: 0, height: 0 }, ready, resized, queued;
  const style = { setProperty: vi.fn() };
  const context = { measureText: vi.fn(text => metrics(text === '-12' ? 180 : 40, 70)) };
  const element = { value: '-12', style, closest: () => ({ getBoundingClientRect: () => rect }), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const fonts = new Promise(resolve => { ready = resolve; });
  const win = { document: { fonts: { ready: fonts } }, requestAnimationFrame: cb => { queued = cb; return 1; }, cancelAnimationFrame: vi.fn(), getComputedStyle: () => ({ fontFamily: 'serif', fontWeight: '400', fontStyle: 'normal' }), ResizeObserver: class { constructor(cb) { resized = cb; } observe() {} disconnect() {} } };
  const root = { ownerDocument: { defaultView: win, createElement: () => ({ getContext: () => context }) }, querySelectorAll: () => [element], querySelector: selector => selector.includes('sheet-tabs') ? null : {} };
  const dispose = activateCombatValueSizing(root);
  expect(style.setProperty).not.toHaveBeenCalled();
  rect = { width: 60, height: 92 }; resized(); queued();
  expect(context.measureText).toHaveBeenCalledWith('-12');
  const first = Number.parseFloat(style.setProperty.mock.lastCall[1]);
  rect = { width: 120, height: 92 }; ready(); await Promise.resolve();
  expect(Number.parseFloat(style.setProperty.mock.lastCall[1])).toBeGreaterThan(first);
  dispose();
});

it('preserves CSS fallback when canvas is unavailable or throws', () => {
  for (const getContext of [() => null, () => { throw new Error('no canvas'); }]) {
    const root = { querySelectorAll: vi.fn(), querySelector: vi.fn(), ownerDocument: { createElement: () => ({ getContext }) } };
    expect(() => activateCombatValueSizing(root)()).not.toThrow();
    expect(root.querySelectorAll).not.toHaveBeenCalled();
  }
});
