import { describe, expect, it, vi } from 'vitest';
import { LONG_WEAPON_SIZE_REPAIR_FLAG, repairLongWeaponSizes } from './long-weapon-size-repair.js';

const makeItem = (name, storedSize) => { const value = { id: name, name, type: 'weapon', system: { storedSize, keep: true, containerId: 'bag' }, flags: {} }; value.update = vi.fn(async update => { value.system = { ...value.system, ...update.system }; value.flags['osp-houserules'] = { [LONG_WEAPON_SIZE_REPAIR_FLAG]: update[`flags.osp-houserules.${LONG_WEAPON_SIZE_REPAIR_FLAG}`] }; }); return value; };
describe('long weapon size repair', () => {
  it('repairs canonical and enchanted items across world, actor, and token copies idempotently', async () => {
    const javelin = makeItem('Javelin', 15), bow = makeItem('Shortbow +1', 16), untouched = makeItem('Staff', 15);
    const game = { user: { isGM: true }, items: [javelin], actors: [{ items: [bow] }], scenes: [{ tokens: [{ actorLink: false, actor: { items: [untouched] } }] }], packs: [] };
    expect((await repairLongWeaponSizes({ gameRef: game })).repaired).toHaveLength(2);
    expect(javelin.system.storedSize).toBe(10); expect(bow.system.storedSize).toBe(12); expect(javelin.system.keep).toBe(true); expect(javelin.system.containerId).toBe('bag'); expect(untouched.update).not.toHaveBeenCalled();
    expect((await repairLongWeaponSizes({ gameRef: game })).repaired).toHaveLength(0); expect(javelin.update).toHaveBeenCalledTimes(1);
  });
  it('is GM-only', async () => { expect((await repairLongWeaponSizes({ gameRef: { user: { isGM: false } } })).skipped).toBe('not-gm'); });
  it('restores a locked weapons pack after migration', async () => { const bow = makeItem('Longbow', 20); const pack = { collection: 'osp-houserules.weapons', documentName: 'Item', locked: true, getDocuments: vi.fn(async () => [bow]), configure: vi.fn(async ({ locked }) => { pack.locked = locked; }) }; const game = { user: { isGM: true }, items: [], actors: [], scenes: [], packs: [pack] }; await repairLongWeaponSizes({ gameRef: game }); expect(bow.system.storedSize).toBe(18); expect(pack.locked).toBe(true); });
  it('attempts lock restoration when a compendium item update throws', async () => { const bow = makeItem('Longbow', 20); bow.update = vi.fn(async () => { throw new Error('write failed'); }); const pack = { collection: 'osp-houserules.weapons', documentName: 'Item', locked: true, getDocuments: vi.fn(async () => [bow]), configure: vi.fn(async ({ locked }) => { pack.locked = locked; }) }; const game = { user: { isGM: true }, items: [], actors: [], scenes: [], packs: [pack] }; await expect(repairLongWeaponSizes({ gameRef: game })).rejects.toThrow('write failed'); expect(pack.configure).toHaveBeenNthCalledWith(1, { locked: false }); expect(pack.configure).toHaveBeenNthCalledWith(2, { locked: true }); });
});
