import { beforeEach, describe, expect, it, vi } from 'vitest';
const cast = vi.hoisted(() => vi.fn());
vi.mock('./spellcasting-ui.js', () => ({ castSpellItem: cast }));
vi.mock('../actor/sheets/handlers/item-handler.js', () => ({ ItemHandler: class {} }));
beforeEach(() => {
  cast.mockReset(); cast.mockResolvedValue({ success: true });
  vi.stubGlobal('ui', { notifications: { warn: vi.fn(), error: vi.fn() } });
  vi.stubGlobal('ChatMessage', { getSpeaker: () => ({}), create: vi.fn() });
});
describe('spell macro routing', () => {
  it('uses the shared cast entry for an owned spell macro', async () => {
    const item = { name: 'Light', type: 'spell' }; const actor = { items: [item] };
    vi.stubGlobal('game', { actors: new Map([['actor', actor]]) });
    const { rollItemMacro } = await import('../helpers-macros.js');
    await rollItemMacro('Light', 'actor');
    expect(cast).toHaveBeenCalledWith(actor, item); expect(ChatMessage.create).not.toHaveBeenCalled();
  });
  it('keeps unlinked items descriptive without directing users to External spell', async () => {
    const item = { name: 'Wand', type: 'item', system: { description: 'Wand description' } }; const actor = { items: [item] };
    vi.stubGlobal('game', { user: { id: 'player' }, actors: new Map([['actor', actor]]) });
    const { rollItemMacro } = await import('../helpers-macros.js');
    await rollItemMacro('Wand', 'actor');
    expect(cast).not.toHaveBeenCalled(); expect(ChatMessage.create.mock.calls[0][0].content).not.toContain('External spell');
  });
});

it('routes a linked inventory item macro directly to its item cast', async () => {
  const item = { name: 'Scroll of Light', type: 'item', system: { spellKey: 'light', spellClass: 'magic-user', tags: ['scroll'] } };
  const actor = { items: [item] };
  vi.stubGlobal('game', { actors: new Map([['actor', actor]]) });
  const { rollItemMacro } = await import('../helpers-macros.js');
  await rollItemMacro(item.name, 'actor');
  expect(cast).toHaveBeenCalledWith(actor, item);
});
