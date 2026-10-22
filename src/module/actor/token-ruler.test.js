import { beforeAll, describe, expect, it, vi } from 'vitest';

let TokenRulerOSP;

beforeAll(async () => {
  vi.stubGlobal('foundry', { canvas: { placeables: { tokens: { TokenRuler: class { _getGridHighlightStyle() { return 'base'; } } } } } });
  ({ TokenRulerOSP } = await import('./token-ruler.js'));
});

describe('BR-13 token ruler', () => {
  it('uses tactical movement in combat and overland outside combat', () => {
    const ruler = Object.create(TokenRulerOSP.prototype);
    ruler.token = { actor: { system: { movement: { tactical: 20, overland: 60 } } } };
    vi.stubGlobal('game', { combat: { started: true } });
    expect(ruler._getGridHighlightStyle(21)).toMatchObject({ color: 0x990000 });
    vi.stubGlobal('game', { combat: { started: false } });
    expect(ruler._getGridHighlightStyle(61)).toMatchObject({ color: 0x990000 });
    expect(ruler._getGridHighlightStyle(60)).toBe('base');
  });
  it('uses zero overloaded movement rather than a default fallback', () => {
    const ruler = Object.create(TokenRulerOSP.prototype);
    ruler.token = { actor: { system: { movement: { tactical: 0, overland: 0 } } } };
    vi.stubGlobal('game', { combat: { started: true } });
    expect(ruler._getGridHighlightStyle(1)).toMatchObject({ color: 0x990000 });
  });
});
