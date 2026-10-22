import { describe, expect, it, vi } from 'vitest';
import { activateArmorColumnSizing, solveCombatArmorColumns } from './combat-armor-columns.js';

describe('combat armor column solver', () => {
  it('allocates a measured name track and stays within the table', () => {
    const short = solveCombatArmorColumns({ availableWidth: 698, nameInk: 50 });
    const long = solveCombatArmorColumns({ availableWidth: 698, nameInk: 190 });
    expect(long[1]).toBeGreaterThan(short[1]);
    expect(long).toHaveLength(10);
    expect(long.reduce((sum, value) => sum + value, 0) + 45).toBeLessThanOrEqual(698 + 1e-9);
  });

  it('bounds narrow sheets without losing the image or controls tracks', () => {
    const columns = solveCombatArmorColumns({ availableWidth: 220, nameInk: 180, valueWidths: [90, 45, 90, 90, 70, 70, 50] });
    expect(columns).toHaveLength(10);
    expect(columns[0]).toBeGreaterThanOrEqual(24);
    expect(columns[9]).toBeGreaterThanOrEqual(42);
    expect(columns.reduce((sum, value) => sum + value, 0) + 9).toBeLessThanOrEqual(220 + 1e-9);
  });
});

it('measures armor rows after setup and disposes observers and inline styles', async () => {
  const style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); }, getPropertyValue(name) { return this.values.get(name) || ''; }, removeProperty: vi.fn(function removeProperty(name) { this.values.delete(name); }) };
  const makeField = textContent => ({ textContent });
  const name = makeField('Plate Armor');
  const row = { children: [makeField(''), name, ...['Plate', '6', '10m', '1m', '2', '3', '60'].map(makeField)], style, querySelector: () => name };
  const header = { children: [makeField(''), makeField('Armor'), ...['Type', 'AC', 'Don', 'Doff', 'maxDex', 'minSTR', 'WT'].map(makeField)], style };
  const combat = { clientWidth: 698, querySelectorAll: selector => selector.includes('armor-header') ? [row] : [], querySelector: selector => selector.includes('armor-title') ? header : null, getBoundingClientRect: () => ({ width: 698 }), ownerDocument: null };
  let resolveFonts;
  const fonts = new Promise(resolve => { resolveFonts = resolve; });
  const resize = { observe: vi.fn(), disconnect: vi.fn() };
  const mutation = { observe: vi.fn(), disconnect: vi.fn() };
  const win = { document: { fonts: { ready: fonts } }, ResizeObserver: vi.fn(() => resize), MutationObserver: vi.fn(() => mutation), getComputedStyle: () => ({ fontStyle: 'normal', fontWeight: '400', fontSize: '16px', fontFamily: 'handwritten' }), requestAnimationFrame: callback => { callback(); return 1; }, cancelAnimationFrame: vi.fn() };
  const context = { measureText: text => ({ width: String(text).length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(text).length * 8 }) };
  const document = { defaultView: win, createElement: () => ({ getContext: () => context }) };
  combat.ownerDocument = document;
  const tabLink = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const root = { ownerDocument: document, querySelector: selector => selector.includes('[data-tab="combat"]') ? combat : tabLink, querySelectorAll: () => [] };
  const dispose = activateArmorColumnSizing(root);
  expect(resize.observe).toHaveBeenCalledWith(combat);
  expect(mutation.observe).toHaveBeenCalled();
  expect(style.values.has('--ej-combat-armor-columns')).toBe(true);
  resolveFonts();
  await Promise.resolve();
  dispose();
  expect(resize.disconnect).toHaveBeenCalled();
  expect(mutation.disconnect).toHaveBeenCalled();
  expect(style.removeProperty).toHaveBeenCalledWith('--ej-combat-armor-columns');
});
