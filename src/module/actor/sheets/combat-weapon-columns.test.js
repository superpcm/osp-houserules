import { describe, expect, it, vi } from 'vitest';
import { activateWeaponColumnSizing, measureWeaponNameInk, solveCombatWeaponColumns } from './combat-weapon-columns.js';

describe('combat weapon column solver', () => {
  it('sizes the name track from the longest displayed name', () => {
    const short = solveCombatWeaponColumns({ availableWidth: 698, nameInk: 70 });
    const long = solveCombatWeaponColumns({ availableWidth: 698, nameInk: 190 });
    expect(long[2]).toBeGreaterThan(short[2]);
    expect(long.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(698 + 1e-9);
  });

  it('keeps damage and range readable while bounded in narrow layouts', () => {
    const columns = solveCombatWeaponColumns({ availableWidth: 520, nameInk: 260, valueWidths: [72, 30, 28, 30, 30, 120, 34] });
    expect(columns).toHaveLength(11);
    expect(columns[2]).toBeGreaterThanOrEqual(0);
    expect(columns[3]).toBeGreaterThan(0);
    expect(columns[8]).toBeGreaterThan(columns[4]);
    expect(columns.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(520 + 1e-9);
  });

  it('stays within a compact budget and preserves a name track', () => {
    const columns = solveCombatWeaponColumns({ availableWidth: 200, nameInk: 180 });
    expect(columns.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(200 + 1e-9);
    expect(columns[2]).toBeGreaterThan(0);
  });

  it('uses canvas ink bounds and handles empty text', () => {
    expect(measureWeaponNameInk({ measureText: () => ({ actualBoundingBoxLeft: 2, actualBoundingBoxRight: 18 }) }, 'Bastard Sword')).toBe(20);
    expect(measureWeaponNameInk(null, '')).toBe(0);
  });
});

it('observes combat layout, waits for fonts, and cleans up', async () => {
  const listeners = {};
  const style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); }, getPropertyValue(name) { return this.values.get(name) || ''; }, removeProperty: vi.fn(function removeProperty(name) { this.values.delete(name); }) };
  const name = { textContent: 'Very Long Bastard Sword', style };
  const fields = ['1d10', 'S', 'M', '5', '1', '10/20/30', '6'].map(textContent => ({ textContent }));
  const row = { children: [{}, {}, name, ...fields], style, querySelector: () => name };
  const title = { style };
  const combat = { clientWidth: 698, querySelectorAll: selector => selector.includes('weapon-header') ? [row] : [], querySelector: () => title, getBoundingClientRect: () => ({ width: 698 }) };
  let resolveFonts;
  const fonts = new Promise(resolve => { resolveFonts = resolve; });
  const resize = { observe: vi.fn(), disconnect: vi.fn() };
  const mutation = { observe: vi.fn(), disconnect: vi.fn() };
  const win = { document: { fonts: { ready: fonts } }, ResizeObserver: vi.fn(() => resize), MutationObserver: vi.fn(() => mutation), getComputedStyle: () => ({ fontStyle: 'normal', fontWeight: '400', fontSize: '16px', fontFamily: 'handwritten' }), requestAnimationFrame: callback => { listeners.frame = callback; return 1; }, cancelAnimationFrame: vi.fn() };
  const context = { measureText: text => ({ width: String(text).length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(text).length * 8 }) };
  const root = { ownerDocument: { defaultView: win, createElement: () => ({ getContext: () => context }) }, querySelector: selector => selector.includes('[data-tab="combat"]') ? combat : null, querySelectorAll: () => [] };
  const dispose = activateWeaponColumnSizing(root);
  expect(resize.observe).toHaveBeenCalledWith(combat);
  expect(mutation.observe).toHaveBeenCalled();
  resolveFonts();
  await Promise.resolve();
  dispose();
  expect(resize.disconnect).toHaveBeenCalled();
  expect(mutation.disconnect).toHaveBeenCalled();
  expect(style.removeProperty).toHaveBeenCalledWith('--ej-combat-weapon-columns');
});
