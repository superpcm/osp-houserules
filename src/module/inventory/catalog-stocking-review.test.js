import { describe, expect, it, vi } from 'vitest';
import { applyStockingMetadataChanges, catalogReviewRows, stockingMetadataUpdate } from './catalog-stocking-review.js';

const item = (id, type = 'item', system = {}) => ({ id, name: id, type, system });

describe('catalog stocking review helpers', () => {
  it('limits the review to world equipment and reports effective catalog sources', () => {
    const rows = catalogReviewRows([
      item('Rations', 'item'), item('Coin', 'coin'), item('Spell', 'spell'), item('Sword', 'weapon', { storeAvailability: 'rare' })
    ], [{ name: 'Rations', type: 'item', system: { storeAvailability: 'common', blacksmithEligible: false } }]);
    expect(rows.map(row => row.item.id)).toEqual(['Rations', 'Sword']);
    expect(rows[0]).toMatchObject({ availability: 'common', availabilitySource: 'catalog', blacksmithEligible: false });
    expect(rows[1]).toMatchObject({ availability: 'rare', availabilitySource: 'item' });
  });

  it('serializes null, false, and true overrides without touching unrelated fields', () => {
    expect(stockingMetadataUpdate({ availability: 'null', blacksmith: 'false' })).toEqual({
      'system.storeAvailability': null,
      'system.blacksmithEligible': false,
    });
    expect(stockingMetadataUpdate({ availability: 'exceptional', blacksmith: true })).toEqual({
      'system.storeAvailability': 'exceptional',
      'system.blacksmithEligible': true,
    });
    expect(stockingMetadataUpdate({})).toEqual({});
  });

  it('rejects invalid metadata and actor items before any batch writes', async () => {
    expect(() => stockingMetadataUpdate({ availability: 'legendary' })).toThrow('Availability');
    expect(() => stockingMetadataUpdate({ blacksmith: 'maybe' })).toThrow('blacksmith');
    const world = { ...item('world'), update: vi.fn() };
    const owned = { ...item('owned'), actor: { id: 'hero' }, update: vi.fn() };
    globalThis.game = { user: { isGM: true }, items: new Map([['world', world], ['owned', owned]]) };
    expect(catalogReviewRows([world, owned])).toHaveLength(1);
    await expect(applyStockingMetadataChanges(new Map([['world', { availability: 'common' }], ['owned', { availability: 'rare' }]]))).rejects.toThrow('world equipment');
    expect(world.update).not.toHaveBeenCalled();
    game.user.isGM = false;
    await expect(applyStockingMetadataChanges(new Map([['world', { availability: 'common' }]]))).rejects.toThrow('Only a GM');
  });

  it('applies only the two chosen metadata fields to world items', async () => {
    const system = { cost: 12, quantity: 8, description: 'Keep this', storeAvailability: 'rare' };
    const world = { ...item('world', 'item', system), update: vi.fn(async update => { for (const [key, value] of Object.entries(update)) system[key.slice(7)] = value; }) };
    globalThis.game = { user: { isGM: true }, items: new Map([['world', world]]) };
    expect(await applyStockingMetadataChanges(new Map([['world', { availability: 'uncommon', blacksmith: 'false' }]]))).toBe(1);
    expect(system).toEqual({ cost: 12, quantity: 8, description: 'Keep this', storeAvailability: 'uncommon', blacksmithEligible: false });
  });
});
