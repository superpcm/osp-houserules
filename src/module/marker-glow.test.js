import { afterEach, describe, expect, it, vi } from 'vitest';

const setup = async (ticker = null, reduced = false) => {
  class Filter { constructor(_v, _f, uniforms) { this.uniforms = uniforms; } }
  vi.stubGlobal('PIXI', { Filter });
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.stubGlobal('canvas', ticker ? { app: { ticker }, tokens: { placeables: [] } } : {});
  vi.resetModules();
  return import('./marker-glow.js');
};

afterEach(() => vi.unstubAllGlobals());

describe('Marker glow', () => {
  it('only filters markers, preserves filters, and is idempotent', async () => {
    const { _markerGlowTest } = await setup();
    const base = {};
    const later = {};
    const marker = { actor: { type: 'marker' }, mesh: { filters: [base] } };
    const other = { actor: { type: 'character' }, mesh: { filters: [base] } };
    _markerGlowTest.apply(other);
    _markerGlowTest.apply(marker);
    const filters = marker.mesh.filters;
    _markerGlowTest.apply(marker);
    expect(other.mesh.filters).toEqual([base]);
    expect(filters).toHaveLength(2);
    expect(marker.mesh.filters).toBe(filters);
    marker.mesh.filters.push(later);
    _markerGlowTest.clear(marker);
    expect(marker.mesh.filters).toEqual([base, later]);
  });

  it('cleans the marker filter without revealing hidden tokens', async () => {
    const { _markerGlowTest } = await setup();
    const marker = { actor: { type: 'marker' }, mesh: { filters: [] }, visible: false };
    _markerGlowTest.apply(marker);
    _markerGlowTest.clear(marker);
    expect(marker.mesh.filters).toEqual([]);
    expect(marker.visible).toBe(false);
  });

  it('owns one ticker callback and keeps reduced motion static', async () => {
    const ticker = { add: vi.fn(), remove: vi.fn() };
    const { _markerGlowTest } = await setup(ticker, true);
    const marker = { actor: { type: 'marker' }, mesh: { filters: [] } };
    _markerGlowTest.apply(marker);
    expect(ticker.add).toHaveBeenCalledTimes(1);
    const callback = ticker.add.mock.calls[0][0];
    callback();
    expect(marker.mesh.filters[0].uniforms.time).toBe(0);
    _markerGlowTest.clear(marker);
    expect(ticker.remove).toHaveBeenCalledWith(callback);
  });
});
