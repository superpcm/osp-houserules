import { describe, it, expect } from 'vitest';
import { checkWithdrawTarget, getUsedCapacity, getEffectiveDropSize } from './container-capacity.js';

function container(overrides = {}) {
  return { id: 'c1', name: 'Backpack', type: 'container', system: { capacity: 16, ...overrides } };
}

function item(overrides = {}) {
  return { name: 'Ruby', type: 'item', system: { storedSize: 0.04, quantity: 1, treasure: true, ...overrides } };
}

describe('checkWithdrawTarget — no-store gate', () => {
  it('rejects a no-store item into any container regardless of capacity', () => {
    const result = checkWithdrawTarget(item({ tags: ['no-store'] }), container(), []);
    expect(result.allowed).toBe(false);
    expect(result.reasonType).toBe('type');
  });

  it('rejects a no-vehicle-store item into a vehicle-tagged container', () => {
    const cart = container({ tags: ['vehicle'] });
    const result = checkWithdrawTarget(item({ tags: ['no-vehicle-store'] }), cart, []);
    expect(result.allowed).toBe(false);
    expect(result.reasonType).toBe('type');
  });
});

describe('checkWithdrawTarget — type acceptance', () => {
  it('rejects when the container has an allowedTypes whitelist the item does not match', () => {
    const quiver = container({ allowedTypes: ['arrows'] });
    const result = checkWithdrawTarget(item(), quiver, []);
    expect(result.allowed).toBe(false);
    expect(result.reasonType).toBe('type');
  });

  it('allows when the item matches an allowedTypes whitelist by tag', () => {
    const quiver = container({ allowedTypes: ['arrows'] });
    const result = checkWithdrawTarget(item({ tags: ['arrows'], storedSize: 0.1 }), quiver, []);
    expect(result.allowed).toBe(true);
  });

  it('rejects using the BUILT_IN_BLOCKED_TYPES fallback for a well-known container by name', () => {
    const smallPouch = { id: 'p1', name: 'Belt Pouch (S)', type: 'container', system: { capacity: 4 } };
    const result = checkWithdrawTarget({ name: 'Dagger', type: 'weapon', system: { storedSize: 1, tags: ['dagger'] } }, smallPouch, []);
    expect(result.allowed).toBe(false);
    expect(result.reasonType).toBe('type');
  });

  it('rejects an item restricted by system.allowedContainers to a different container', () => {
    const backpack = container();
    const barding = item({ allowedContainers: ['Cart', 'Wagon'] });
    const result = checkWithdrawTarget(barding, backpack, []);
    expect(result.allowed).toBe(false);
    expect(result.reasonType).toBe('type');
  });
});

describe('checkWithdrawTarget — capacity', () => {
  it('rejects when the container is full, with a capacity reasonType and required/available in the message', () => {
    const small = container({ capacity: 1 });
    const existing = [{ id: 'x1', type: 'item', system: { containerId: 'c1', storedSize: 0.9, quantity: 1 } }];
    const result = checkWithdrawTarget(item({ storedSize: 0.5 }), small, existing);
    expect(result.allowed).toBe(false);
    expect(result.reasonType).toBe('capacity');
    expect(result.reason).toMatch(/Not enough space/);
  });

  it('allows when there is enough remaining capacity', () => {
    const result = checkWithdrawTarget(item({ storedSize: 0.04 }), container({ capacity: 16 }), []);
    expect(result.allowed).toBe(true);
  });

  it('skips the capacity gate entirely when hideCapacity is true', () => {
    const beltLoop = container({ capacity: 0, hideCapacity: true });
    const result = checkWithdrawTarget(item({ storedSize: 0.04 }), beltLoop, []);
    expect(result.allowed).toBe(true);
  });
});

describe('getUsedCapacity / getEffectiveDropSize', () => {
  it('sums storedSize * quantity of direct, non-lashed children', () => {
    const items = [
      { id: 'a', type: 'item', system: { containerId: 'c1', storedSize: 0.5, quantity: 2, lashed: false } },
      { id: 'b', type: 'item', system: { containerId: 'c1', storedSize: 1, quantity: 1, lashed: true } }, // excluded — lashed
      { id: 'd', type: 'item', system: { containerId: 'other', storedSize: 99, quantity: 1 } }, // excluded — different container
    ];
    expect(getUsedCapacity(container(), items)).toBe(1); // 0.5 * 2
  });

  it('includes nested sub-container contents recursively', () => {
    const items = [
      { id: 'sub', type: 'container', system: { containerId: 'c1', storedSize: 1, quantity: 1, lashed: false } },
      { id: 'inner', type: 'item', system: { containerId: 'sub', storedSize: 2, quantity: 1, lashed: false } },
    ];
    expect(getUsedCapacity(container(), items)).toBe(1 + 2);
  });

  it('effective drop size scales with quantity for the item being dropped', () => {
    expect(getEffectiveDropSize({ type: 'item', system: { storedSize: 0.5, quantity: 4 } }, [])).toBe(2);
  });
});
