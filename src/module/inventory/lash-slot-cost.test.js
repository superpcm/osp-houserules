import { describe, expect, it } from 'vitest';
import { beltToolLashDecision, getLashSlotCost } from './lash-slot-cost.js';
import { hasFreeLashSlots, lashSlotUsage } from './shield-lashing.js';

describe('belt lash slot costs', () => {
  it('makes the coin purse free while preserving legacy zero fallback', () => {
    expect(getLashSlotCost({ name: 'Coin Purse', system: { slotCost: 0 } })).toBe(0);
    expect(getLashSlotCost({ name: 'Coin Purse', system: { slotCost: 1 } })).toBe(0);
    expect(getLashSlotCost({ name: 'Old Item', system: { slotCost: 0 } })).toBe(1);
    expect(getLashSlotCost({ name: 'Quiver, Hip', system: { slotCost: 2 } })).toBe(2);
    expect(getLashSlotCost({ name: 'Bolt Case', system: { slotCost: 2 } })).toBe(2);
  });

  it('accepts a free purse on a full six-slot belt', () => {
    const belt = { id: 'belt', type: 'container', system: { lashSlots: 6 } };
    const occupied = Array.from({ length: 6 }, (_, index) => ({ id: String(index), system: { containerId: 'belt', lashed: true, slotCost: 1 } }));
    const purse = { name: 'Coin Purse', system: { slotCost: 0 } };
    expect(lashSlotUsage(occupied, 'belt')).toBe(6);
    expect(hasFreeLashSlots(belt, occupied, purse)).toBe(true);
  });

  it('accepts a stale free purse on an already overfull belt', () => {
    const belt = { id: 'belt', type: 'container', system: { lashSlots: 6 } };
    const occupied = Array.from({ length: 7 }, (_, index) => ({ id: String(index), system: { containerId: 'belt', lashed: true, slotCost: 1 } }));
    expect(hasFreeLashSlots(belt, occupied, { name: 'Coin Purse', system: { slotCost: 1 } })).toBe(true);
  });

  it('counts each javelin in a backpack stack but preserves ordinary host behavior', () => {
    const javelin = { name: 'Javelin', system: { quantity: 2 } };
    expect(getLashSlotCost(javelin, { name: 'Backpack' })).toBe(2);
    expect(getLashSlotCost(javelin, { name: 'Belt' })).toBe(1);
  });

  it('charges one slot per Cloak in a Backpack despite stale metadata', () => {
    expect(getLashSlotCost({ name: 'Cloak', system: { lashable: false, slotCost: 2, quantity: 4 } }, { name: 'Backpack' })).toBe(4);
  });

  it.each(['Shovel', 'Shovel +1', 'Crowbar', 'Crowbar +1'])('rejects %s on a Belt but allows Backpack hosts', name => {
    const tool = { name, type: 'weapon', system: { lashable: true } };
    const belt = { name: 'Belt', type: 'clothing', system: { lashSlots: 2, equipped: true } };
    expect(beltToolLashDecision(tool, belt)).toMatchObject({ allowed: false });
    expect(beltToolLashDecision(tool, { name: 'Backpack', type: 'container' })).toEqual({ allowed: null, reason: null });
  });

  it.each([
    'Bedroll', 'Pole, Ten Foot', 'Tent, 4-person', 'Lantern, Mount', 'Banded mail', 'Javelin', 'Battle Axe', 'Instrument',
    'Bedroll +1', 'Javelin +2', 'Battle Axe +1',
  ])('rejects clear Belt restriction %s without changing its lash cost', name => {
    const item = { name, type: name === 'Banded mail' ? 'armor' : 'item', system: { slotCost: 3, lashable: true } };
    const belt = { name: 'Belt', type: 'clothing', system: { lashSlots: 6 } };
    expect(beltToolLashDecision(item, belt)).toMatchObject({ allowed: false });
    expect(getLashSlotCost(item, belt)).toBe(3);
    expect(beltToolLashDecision(item, { name: 'Backpack', type: 'container' })).toEqual({ allowed: null, reason: null });
  });

  it.each([
    { name: 'renamed canvas', system: { tags: ['tent-fabric'] } },
    { name: 'renamed supports', system: { tags: ['tent-poles'] } },
    { name: 'custom shelter', flags: { 'osp-houserules': { canonicalname: 'Tent, 2-person' } }, system: {} },
    { name: 'custom poles', flags: { 'osp-houserules': { tentComponent: { kind: 'poles' } } }, system: {} },
  ])('rejects tent components identified by metadata', item => {
    expect(beltToolLashDecision(item, { name: 'Belt', type: 'clothing' })).toMatchObject({ allowed: false });
  });

  it('leaves ordinary belt items unchanged', () => {
    expect(beltToolLashDecision({ name: 'Mace', type: 'weapon' }, { name: 'Belt', type: 'clothing' })).toEqual({ allowed: null, reason: null });
  });

  it.each(['Spellbook', 'Lantern, Hooded', 'Lantern, Bullseye', "Rope, Hempen (50')", "Rope, Silken (50')", 'Grappling Hook', 'Club', 'Sickle', "Butcher's Cleaver"])('leaves borderline Belt item %s unchanged', name => {
    expect(beltToolLashDecision({ name }, { name: 'Belt', type: 'clothing' })).toEqual({ allowed: null, reason: null });
  });
});
