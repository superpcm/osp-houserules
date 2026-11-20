import { describe, expect, it } from 'vitest';
import gear from '../../../data/gear.json';
import { checkAllowedContainers } from './container-allowlist.js';
import { getLashSlotCost } from './lash-slot-cost.js';
import {
  backpackLashDecision,
  getBackpackStorageRejection,
  isBackpack,
  isBackpackInternalForbidden,
} from './long-item-transport.js';
import { getArrowBundleLashDecision } from './arrow-bundle.js';
import { getBoltBundleLashDecision } from './bolt-bundle.js';
import { getTorchBundleLashDecision } from './torch-bundle.js';

const traveler = gear.find((entry) => entry.name === "Traveler's Backpack");
const pack = { id: 'traveler', ...traveler };
const item = (id, name, system = {}) => ({
  id,
  name,
  type: 'item',
  system: { storedSize: 1, quantity: 1, tags: [], ...system },
});

describe("Traveler's Backpack", () => {
  it('has the catalog stats and canonical backpack identity', () => {
    expect(traveler).toMatchObject({
      name: "Traveler's Backpack",
      type: 'container',
      img: 'systems/osp-houserules/assets/thumbs/images/gear/travelers-backpack_thumb.webp',
    });
    expect(traveler.system).toMatchObject({
      capacity: 40,
      storedSize: 8,
      unitWeight: 4,
      cost: 10,
      lashSlots: 4,
    });
    expect(isBackpack(pack)).toBe(true);
  });

  it('accepts legacy Backpack allowlists without widening portable-profile detection', () => {
    const torch = item('torch', 'Torch', { allowedContainers: ['Backpack'] });
    expect(checkAllowedContainers(torch, pack)).toEqual({ allowed: true, reason: null });
    const ordinary = item('ordinary', 'Ordinary Item', { allowedContainers: ['Backpack'] });
    expect(checkAllowedContainers(ordinary, { name: 'Sack, Large', type: 'container' }).allowed).toBe(false);
  });

  it('preserves long-item, nested, tent, and garment restrictions', () => {
    const sack = { id: 'sack', name: 'Sack, Small', type: 'container', system: { containerId: pack.id, storedSize: 2 } };
    const pole = item('pole', 'Pole, Ten Foot', { containerId: sack.id });
    expect(isBackpackInternalForbidden(sack, pack, [pack, sack, pole])).toBe(true);
    expect(getBackpackStorageRejection(item('poles', 'Tent Poles, 2-person', { tags: ['tent-poles'] }), pack, [pack])).toMatch(/outside/i);
    expect(backpackLashDecision(item('cloak', 'Cloak', { equipped: false }), pack, [pack])).toEqual({ allowed: true, reason: null });
  });

  it('uses the traveler pack for protected bundle lash rules and costs', () => {
    for (const [decision, bundle] of [
      [getArrowBundleLashDecision, { flags: { 'osp-houserules': { protectedArrowBundle: true } }, type: 'ammunition', system: { quantity: 20, tags: ['arrows'] } }],
      [getBoltBundleLashDecision, { flags: { 'osp-houserules': { protectedBoltBundle: true } }, type: 'ammunition', system: { quantity: 20, tags: ['bolts'] } }],
      [getTorchBundleLashDecision, { flags: { 'osp-houserules': { protectedTorchBundle: true } }, type: 'item', name: 'Torch', system: { quantity: 6 } }],
    ]) {
      expect(decision(bundle, pack)).toEqual({ allowed: true, reason: null });
      expect(getLashSlotCost(bundle, pack)).toBe(1);
    }
  });
});
