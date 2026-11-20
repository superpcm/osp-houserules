import { describe, expect, it } from 'vitest';
import {
  ARROW_BUNDLE_LIMIT,
  getArrowBundleLashDecision,
  getArrowBundleValidationError,
  isArrowAmmo,
  isProtectedArrowBundle,
  isArrowQuiver,
  prepareArrowQuiverPlacement,
  prepareArrowSaleBundle,
  repairQuiverArrowBundles,
} from './arrow-bundle.js';

const arrow = (quantity, protectedBundle = false, type = 'ammunition', tags = ['arrows']) => ({
  name: 'Arrow', type, system: { quantity, tags },
  flags: protectedBundle ? { 'osp-houserules': { protectedArrowBundle: true } } : {},
});

describe('protected arrow bundles', () => {
  it('accepts only integer quantities from one through twenty', () => {
    expect(getArrowBundleValidationError(arrow(1, true))).toBeNull();
    expect(getArrowBundleValidationError(arrow(ARROW_BUNDLE_LIMIT, true))).toBeNull();
    expect(getArrowBundleValidationError(arrow(0, true))).toMatch(/1-20/);
    expect(getArrowBundleValidationError(arrow(21, true))).toMatch(/1-20/);
    expect(getArrowBundleValidationError(arrow(1.5, true))).toMatch(/1-20/);
  });

  it('requires arrow ammunition and protects the state from invalid type changes', () => {
    expect(isArrowAmmo(arrow(2))).toBe(true);
    expect(isProtectedArrowBundle(arrow(2, true))).toBe(true);
    expect(getArrowBundleValidationError(arrow(2, true, 'item'))).toMatch(/arrow ammunition/);
    expect(getArrowBundleValidationError(arrow(2, true, 'ammunition', []))).toMatch(/arrow ammunition/);
  });

  it('allows protected bundles only on a Backpack lash host', () => {
    const bundle = arrow(20, true);
    expect(getArrowBundleLashDecision(bundle, { name: 'Backpack' })).toEqual({ allowed: true, reason: null });
    expect(getArrowBundleLashDecision(bundle, { name: 'Belt' }).allowed).toBe(false);
    expect(getArrowBundleLashDecision(arrow(21, true), { name: 'Backpack' }).allowed).toBe(false);
    expect(getArrowBundleLashDecision(arrow(2), { name: 'Backpack' })).toEqual({ allowed: null, reason: null });
  });

  it('normalizes only protected arrows placed in a quiver and sells catalog arrows as twenty', () => {
    const quiver = { type: 'container', name: 'Quiver, Hip', system: { allowedTypes: ['arrows'] } };
    const bundle = { ...arrow(20, true), system: { quantity: 20, storedSize: 0.25, tags: ['arrows'], cost: 2 }, flags: { 'osp-houserules': { protectedArrowBundle: true }, custom: { keep: true } } };
    expect(isArrowQuiver(quiver)).toBe(true);
    expect(isArrowQuiver({ ...quiver, name: 'Bolt Case' })).toBe(false);
    const loose = prepareArrowQuiverPlacement(bundle, quiver);
    expect(loose.system).toEqual(bundle.system);
    expect(loose.flags).toEqual({ custom: { keep: true } });
    const sale = prepareArrowSaleBundle({ ...bundle, system: { ...bundle.system, quantity: 1 } });
    expect(sale.system.quantity).toBe(20);
    expect(sale.system.cost).toBe(2);
    expect(isProtectedArrowBundle(sale)).toBe(true);
  });

  it('repairs protected arrows in quivers with explicit flag deletion and is idempotent', async () => {
    const item = { id: 'arrows', flags: { 'osp-houserules': { protectedArrowBundle: true }, custom: { keep: true } }, system: { quantity: 20, tags: ['arrows'], containerId: 'quiver' }, toObject() { return { id: this.id, flags: structuredClone(this.flags), system: structuredClone(this.system), type: 'ammunition', name: 'Arrows' }; }, async update(changes) {
      if (changes['flags.osp-houserules.-=protectedArrowBundle'] !== undefined) delete this.flags['osp-houserules'].protectedArrowBundle;
      if (changes['flags.-=osp-houserules'] !== undefined) delete this.flags['osp-houserules'];
    } };
    const quiver = { id: 'quiver', type: 'container', name: 'Quiver', system: { allowedTypes: ['arrows'] } };
    const actor = { id: 'actor', items: { contents: [quiver, item] } };
    const gameRef = { user: { isGM: true }, actors: { contents: [actor] } };
    expect(await repairQuiverArrowBundles({ gameRef })).toMatchObject({ success: true, repaired: 1 });
    expect(isProtectedArrowBundle(item)).toBe(false);
    expect(await repairQuiverArrowBundles({ gameRef })).toMatchObject({ success: true, repaired: 0 });
  });
});
