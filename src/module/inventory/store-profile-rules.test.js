import { describe, expect, it } from 'vitest';
import { ECONOMIES, profileSourceKey, profileSourceUuid, profileRarityOverride, profileBuybackRate, profileEnvironmentDefaults, validateProfileEnvironment } from './store-profile-rules.js';

describe('store profile environment rules', () => {
  it('provides neutral defaults while preserving valid saved values', () => {
    expect(profileEnvironmentDefaults({ economy: 'mining', event: 'war' })).toMatchObject({ economy: 'mining', event: 'war', wealth: 'comfortable', supply: 'reliable' });
    expect(ECONOMIES.map(item => item.id)).toEqual(['mixed', 'farming', 'mining', 'hunting', 'trade', 'frontier']);
  });
  it('validates enums, source lists, overrides, and conflicts', () => {
    expect(validateProfileEnvironment({ economy: 'unknown' })).toContain('economy');
    expect(validateProfileEnvironment({ alwaysStock: ['Item.a'], neverStock: ['Item.a'] })).toContain('both');
    expect(validateProfileEnvironment({ rarityOverrides: { 'Item.a': 'legendary' } })).toContain('Rarity');
    expect(validateProfileEnvironment({ buybackRates: { weapon: 101 } })).toContain('Buyback');
    expect(validateProfileEnvironment({ alwaysStock: [1] })).toContain('source UUID');
    expect(validateProfileEnvironment({ buybackRates: { magic: 50 } })).toContain('Buyback');
    expect(validateProfileEnvironment({ minProducts: 0 })).toContain('Product');
    expect(validateProfileEnvironment({ minProducts: 70, maxProducts: 40 })).toContain('Product minimum');
    expect(validateProfileEnvironment({ minProducts: true })).toContain('Product');
    expect(validateProfileEnvironment({ minProducts: [40] })).toContain('Product');
    expect(validateProfileEnvironment({})).toBeNull();
  });
  it('uses zero buyback overrides and falls back to store rate', () => {
    expect(profileBuybackRate({ buybackRate: 50, stocking: { buybackRates: { weapon: 0 } } }, 'weapon')).toBe(0);
    expect(profileBuybackRate({ buybackRate: 35, stocking: { buybackRates: {} } }, 'armor')).toBe(35);
  });
});


it('keeps catalog UUID map keys safe for Foundry dot-path persistence and reads earlier raw keys', () => {
  const key = profileSourceKey('Item.torch');
  expect(key).not.toContain('.'); expect(profileSourceUuid(key)).toBe('Item.torch');
  expect(profileRarityOverride({ rarityOverrides: { [key]: 'rare' } }, 'Item.torch')).toBe('rare');
  expect(profileRarityOverride({ rarityOverrides: { 'Item.torch': 'uncommon' } }, 'Item.torch')).toBe('uncommon');
  expect(validateProfileEnvironment({ buybackRates: { weapon: true } })).toContain('Buyback');
});
