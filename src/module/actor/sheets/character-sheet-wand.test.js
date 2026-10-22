import { beforeAll, describe, expect, it } from 'vitest';

let isEquippedWandCombatItem;
beforeAll(async () => {
  globalThis.Application = class {};
  globalThis.foundry = {
    applications: {
      sheets: { ActorSheetV2: class {} },
      api: { HandlebarsApplicationMixin: Base => Base },
    },
  };
  ({ isEquippedWandCombatItem } = await import('./character-sheet.js'));
});

const item = (overrides = {}) => ({
  id: 'wand-1',
  type: 'item',
  name: 'Wand',
  system: { tags: ['wand'], equipped: false },
  ...overrides,
});

describe('equipped wand combat classification', () => {
  it('promotes an equipped wand into the Combat weapon list', () => {
    expect(isEquippedWandCombatItem(item({ system: { tags: ['wand'], equipped: true } }))).toBe(true);
  });

  it('returns an unequipped wand to Gear', () => {
    expect(isEquippedWandCombatItem(item())).toBe(false);
  });

  it('does not promote other held items or non-wand foci', () => {
    expect(isEquippedWandCombatItem(item({ name: 'Staff', system: { tags: ['staff'], equipped: true } }))).toBe(false);
    expect(isEquippedWandCombatItem(item({ name: 'Oil Flask', system: { tags: [], equipped: true } }))).toBe(false);
  });
});
