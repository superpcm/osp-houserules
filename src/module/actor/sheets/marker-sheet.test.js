import { describe, expect, it, vi } from 'vitest';

describe('Marker sheet scaling', () => {
  it('updates every active token while preserving flip signs', async () => {
    vi.stubGlobal('foundry', { appv1: { sheets: { ActorSheet: class { activateListeners() {} } } }, utils: { mergeObject: (a, b) => ({ ...a, ...b }) } });
    const { OspActorSheetMarker } = await import('./marker-sheet.js');
    const updates = [vi.fn(), vi.fn()];
    const actor = { id: 'marker', isOwner: true, prototypeToken: { texture: { scaleX: 1, scaleY: 1 } }, update: vi.fn() };
    vi.stubGlobal('game', { scenes: { contents: [{ tokens: [{ actorId: 'marker', actorLink: true, texture: { scaleX: 1, scaleY: 1 }, update: updates[0] }, { actorId: 'marker', actorLink: true, texture: { scaleX: -1, scaleY: 1 }, update: updates[1] }] }] }, user: { isGM: false } });
    const sheet = Object.create(OspActorSheetMarker.prototype);
    sheet.actor = actor;
    sheet.render = vi.fn();
    const input = { value: '2' };
    const output = { length: 1, text: vi.fn() };
    const html = { find: selector => selector.includes('scale-value') ? output : { on: (_event, callback) => { if (selector.includes('marker-scale')) html.callback = callback; } } };
    sheet.activateListeners(html);
    await html.callback({ currentTarget: input });
    expect(actor.update).toHaveBeenCalledWith({ 'prototypeToken.texture.scaleX': 2, 'prototypeToken.texture.scaleY': 2 });
    expect(updates[0]).toHaveBeenCalledWith({ 'texture.scaleX': 2, 'texture.scaleY': 2 });
    expect(updates[1]).toHaveBeenCalledWith({ 'texture.scaleX': -2, 'texture.scaleY': 2 });
    expect(output.text).toHaveBeenCalledWith('2.00');
  });
});
