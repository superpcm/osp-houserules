import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateCauseFearScroll } from './item-spell-migration.js';
afterEach(() => vi.unstubAllGlobals());
describe('existing Cause Fear scroll repair', () => {
  it('links the named scroll to the fixed reversed spell and repairs a missing image', async () => {
    const item = { name: 'Scroll of Cause Fear', system: {}, img: 'missing.webp', update: vi.fn() };
    vi.stubGlobal('game', { user: { id: 'gm' }, users: { activeGM: { id: 'gm' } }, items: [item], actors: [] });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    await migrateCauseFearScroll();
    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({ 'system.spellKey': 'remove_fear', 'system.spellClass': 'cleric', 'system.spellReversed': true, img: 'systems/osp-houserules/assets/thumbs/images/magic/scroll-cause-fear_thumb.webp' }));
  });
});
