import { describe, expect, it } from 'vitest';
import { isCompleteTent, separateTentData } from './tent-components.js';

const tent = (name = 'Tent, 1-person', quantity = 1, extra = {}) => ({
  name, type: 'item', img: 'tent.webp', flags: { custom: { keep: true } },
  system: { quantity, storedSize: Number(name.match(/\d/)?.[0] ?? 1) * 10, unitWeight: Number(name.match(/\d/)?.[0] ?? 1) * 10, cost: Number(name.match(/\d/)?.[0] ?? 1) * 5, tags: ['shelter'], ...extra },
});

describe('tent components', () => {
  it('recognizes canonical complete tents and preserves custom suffixes', () => {
    expect(isCompleteTent(tent())).toBe(true);
    expect(isCompleteTent(tent('Tent, 1-person +1'))).toBe(true);
    expect(isCompleteTent({ ...tent(), flags: { 'osp-houserules': { tentComponent: { kind: 'fabric' } } } })).toBe(false);
  });

  it('splits a one-person tent into exact approved totals', () => {
    const result = separateTentData(tent());
    expect(result.fabric).toMatchObject({ name: 'Tent Fabric, 1-person', system: { storedSize: 6, unitWeight: 7, cost: 3.5, quantity: 1 } });
    expect(result.poles).toMatchObject({ name: 'Tent Poles, 1-person', system: { storedSize: 4, unitWeight: 3, cost: 1.5, quantity: 1 } });
    expect(result.fabric.system.storedSize + result.poles.system.storedSize).toBe(10);
    expect(result.fabric.system.unitWeight + result.poles.system.unitWeight).toBe(10);
    expect(result.fabric.system.cost + result.poles.system.cost).toBe(5);
    expect(result.fabric.flags.custom.keep).toBe(true);
  });

  it('splits only the requested quantity from a stack', () => {
    const result = separateTentData(tent('Tent, 2-person', 3), 2);
    expect(result.fabric.system.quantity).toBe(2);
    expect(result.poles.system.quantity).toBe(2);
  });
});
