import { describe, it, expect } from 'vitest';
import { BOLT_SALE_BUNDLE_QUANTITY, getBoltBundleLashDecision, getBoltBundleValidationError, isBoltCase, isProtectedBoltBundle, prepareBoltCasePlacement, prepareBoltSaleBundle } from './bolt-bundle.js';

const bolt = (quantity = 1, flags = {}) => ({ type: 'ammunition', name: 'Crossbow Bolt, Light', system: { tags: ['bolts'], quantity }, flags });
const protectedBolt = (quantity = 20) => bolt(quantity, { 'osp-houserules': { protectedBoltBundle: true } });

describe('bolt bundle rules', () => {
  it('prepares a twenty-bolt protected sale bundle and preserves unit data', () => {
    const source = bolt(); source.system.cost = 0.3; source.system.storedSize = 0.2; source.system.unitWeight = 0.1;
    const result = prepareBoltSaleBundle(source);
    expect(BOLT_SALE_BUNDLE_QUANTITY).toBe(20);
    expect(result.system.quantity).toBe(20);
    expect(result.system.cost).toBe(0.3);
    expect(result.system.storedSize).toBe(0.2);
    expect(isProtectedBoltBundle(result)).toBe(true);
  });
  it('only allows protected bundles to lash to a Backpack at one slot', () => {
    const item = protectedBolt();
    expect(getBoltBundleLashDecision(item, { name: 'Backpack' })).toEqual({ allowed: true, reason: null });
    expect(getBoltBundleLashDecision(item, { name: 'Belt' }).allowed).toBe(false);
  });
  it('validates size and clears protection in a Bolt Case', () => {
    expect(getBoltBundleValidationError(protectedBolt(21))).toMatch(/1-20/);
    const caseItem = { type: 'container', name: 'Bolt Case', system: { allowedTypes: ['bolts'] } };
    expect(isBoltCase(caseItem)).toBe(true);
    expect(isProtectedBoltBundle(prepareBoltCasePlacement(protectedBolt(), caseItem))).toBe(false);
  });
});
