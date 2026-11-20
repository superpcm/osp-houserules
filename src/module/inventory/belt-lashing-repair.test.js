import { describe, expect, it, vi } from 'vitest';
import { BELT_LASHING_FLAG, repairBeltLashing } from './belt-lashing-repair.js';

const item = (name, slotCost, custom = false) => {
  const value = { id: name, name, type: 'container', system: { slotCost, description: 'old', containerId: 'belt', lashed: true }, flags: { 'osp-houserules': custom ? { custom: true } : {} } };
  value.update = vi.fn(async update => { value.system = { ...value.system, ...update.system }; value.flags['osp-houserules'][BELT_LASHING_FLAG] = update[`flags.osp-houserules.${BELT_LASHING_FLAG}`]; });
  return value;
};

describe('belt lashing repair', () => {
  it('updates old copies once and preserves placement', async () => {
    const hip = item('Quiver, Hip', 1), bolt = item('Bolt Case', 1), purse = item('Coin Purse', 1), large = item('Belt Pouch (L)', 1), small = item('Belt Pouch (S)', 2);
    const game = { user: { isGM: true }, items: [hip, bolt, purse], actors: [{ items: [large, small] }], packs: [] };
    const result = await repairBeltLashing({ gameRef: game });
    expect(result.repaired).toHaveLength(5);
    expect(hip.system.slotCost).toBe(2);
    expect(bolt.system.slotCost).toBe(2);
    expect(purse.system.slotCost).toBe(0);
    expect(large.system.slotCost).toBe(2);
    expect(small.system.slotCost).toBe(1);
    expect(hip.system.containerId).toBe('belt');
    await repairBeltLashing({ gameRef: game });
    expect(hip.update).toHaveBeenCalledTimes(1);
  });

  it('skips custom items and non-GMs', async () => {
    const custom = item('Coin Purse', 1, true);
    const game = { user: { isGM: true }, items: [custom], actors: [], packs: [] };
    expect((await repairBeltLashing({ gameRef: game })).repaired).toHaveLength(0);
    expect(custom.update).not.toHaveBeenCalled();
    expect((await repairBeltLashing({ gameRef: { user: { isGM: false }, items: [custom], actors: [] } })).skipped).toBe('not-gm');
  });

  it('restores a locked gear pack after an update error', async () => {
    const broken = item('Coin Purse', 1);
    broken.update = vi.fn(async () => { throw new Error('locked'); });
    const calls = [];
    const pack = { collection: 'osp-houserules.gear', documentName: 'Item', locked: true,
      getDocuments: vi.fn(async () => [broken]), configure: vi.fn(async ({ locked }) => { calls.push(locked); pack.locked = locked; }) };
    await repairBeltLashing({ gameRef: { user: { isGM: true }, items: [], actors: [], packs: [pack] } });
    expect(calls).toEqual([false, true]);
    expect(pack.locked).toBe(true);
  });
});
