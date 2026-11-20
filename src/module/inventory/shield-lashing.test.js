import { describe, expect, it } from 'vitest';
import { hasFreeLashSlots, isShieldItem, isShieldLashingHost, lashSlotUsage } from './shield-lashing.js';

const shield = (name = 'Shield', type = 'medium', lashable = false) => ({ type: 'armor', name, system: { type, lashable } });
const host = (name, system = {}) => ({ type: 'container', name, id: name, system: { lashSlots: 1, ...system } });

describe('shield lashing policy', () => {
  it.each([
    [shield('Shield', 'shield'), true],
    [shield('Old Kite', 'medium'), false],
    [shield('old shield', 'medium'), true],
    [shield('Shield', 'medium', true), true],
  ])('recognizes shield subtype, legacy names, and explicit flags', (item, expected) => {
    expect(isShieldItem(item)).toBe(expected);
  });

  it.each([
    ['Backpack', true], ['Saddle', true], ['Saddle, Pack', true],
    ['Sidesack', false], ['Belt', false], ['Backpack ', true],
  ])('allows only realistic default host %s: %s', (name, expected) => {
    expect(isShieldLashingHost(host(name))).toBe(expected);
  });

  it('honors custom opt-in and opt-out overrides', () => {
    expect(isShieldLashingHost(host('Trunk', { supportsShieldLashing: true }))).toBe(true);
    expect(isShieldLashingHost(host('Backpack', { supportsShieldLashing: false }))).toBe(false);
    expect(isShieldLashingHost({ type: 'clothing', name: 'Belt', system: { supportsShieldLashing: true } })).toBe(false);
  });

  it('accounts for custom slot costs and excludes the moving item', () => {
    const saddle = host('Saddle', { lashSlots: 4 });
    saddle.id = 'saddle';
    const items = [
      { id: 'shield', system: { containerId: 'saddle', lashed: true, slotCost: 2 } },
      { id: 'rope', system: { containerId: 'saddle', lashed: true, slotCost: 1 } },
    ];
    expect(lashSlotUsage(items, 'saddle', 'shield')).toBe(1);
    expect(hasFreeLashSlots(saddle, items, { system: { slotCost: 2 } }, 'shield')).toBe(true);
    expect(hasFreeLashSlots(saddle, [...items, { id: 'other', system: { containerId: 'saddle', lashed: true, slotCost: 2 } }], { system: { slotCost: 2 } }, 'shield')).toBe(false);
  });
});
