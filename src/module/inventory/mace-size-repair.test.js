import { describe, expect, it, vi } from 'vitest';
import { MACE_SIZE_REPAIR_FLAG, repairMaceSizes } from './mace-size-repair.js';

const makeItem = (name, storedSize) => { const value = { id: name, name, type: 'weapon', system: { storedSize, keep: true }, flags: {} }; value.update = vi.fn(async update => { value.system = { ...value.system, ...update.system }; value.flags['osp-houserules'] = { [MACE_SIZE_REPAIR_FLAG]: update[`flags.osp-houserules.${MACE_SIZE_REPAIR_FLAG}`] }; }); return value; };
describe('mace size repair', () => {
  it('repairs canonical and enchanted maces across world, actor, and token items idempotently', async () => {
    const mace = makeItem('Mace', 20), plus = makeItem('Mace +1', 20), custom = makeItem('Dagger', 2);
    const game = { user: { isGM: true }, items: [mace], actors: [{ id: 'a', items: [plus] }], scenes: [{ tokens: [{ actorLink: false, actor: { id: 't', items: [custom] } }] }], packs: [] };
    expect((await repairMaceSizes({ gameRef: game })).repaired).toHaveLength(2);
    expect(mace.system.storedSize).toBe(8); expect(plus.system.storedSize).toBe(8); expect(mace.system.keep).toBe(true); expect(custom.system.storedSize).toBe(2);
    expect((await repairMaceSizes({ gameRef: game })).repaired).toHaveLength(0); expect(mace.update).toHaveBeenCalledTimes(1);
  });
  it('is GM-only', async () => { expect((await repairMaceSizes({ gameRef: { user: { isGM: false } } })).skipped).toBe('not-gm'); });
  it('ignores non-mace weapons', async () => { const sword = makeItem('Sword', 10); const game = { user: { isGM: true }, items: [sword], actors: [], scenes: [], packs: [] }; await repairMaceSizes({ gameRef: game }); expect(sword.system.storedSize).toBe(10); expect(sword.update).not.toHaveBeenCalled(); });
  it('restores a locked weapons pack after migration', async () => { const mace = makeItem('Mace', 20); const pack = { collection: 'osp-houserules.weapons', documentName: 'Item', locked: true, getDocuments: vi.fn(async () => [mace]), configure: vi.fn(async ({ locked }) => { pack.locked = locked; }) }; const game = { user: { isGM: true }, items: [], actors: [], scenes: [], packs: [pack] }; await repairMaceSizes({ gameRef: game }); expect(mace.system.storedSize).toBe(8); expect(pack.locked).toBe(true); expect(pack.configure).toHaveBeenLastCalledWith({ locked: true }); });
});
