import { describe, expect, it } from 'vitest';
import { canStackItems } from './stack-identity.js';

const arrow = (quantity, protectedBundle = false) => ({
  name: 'Arrow', type: 'ammunition', system: { quantity, tags: ['arrows'], storedSize: 0.25 },
  flags: protectedBundle ? { 'osp-houserules': { protectedArrowBundle: true } } : {},
});

describe('arrow bundle stack identity', () => {
  it('never merges protected bundles with loose or protected arrows', () => {
    expect(canStackItems(arrow(2), arrow(3))).toBe(true);
    expect(canStackItems(arrow(20, true), arrow(1))).toBe(false);
    expect(canStackItems(arrow(10, true), arrow(10, true))).toBe(false);
  });
});
