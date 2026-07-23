import { describe, it, expect } from 'vitest';
import {
  isConsumableWeapon,
  resolveAmmoRequirement,
  findAmmoStacks,
  pickAmmoStack,
  checkAmmoAvailability,
} from './ammo-logic.js';

function weapon({ name = 'Test Weapon', ...systemOverrides } = {}) {
  return {
    type: 'weapon',
    name,
    system: {
      tags: [],
      quantity: 1,
      melee: false,
      missile: false,
      ammoTag: '',
      ...systemOverrides,
    },
  };
}

function ammo(name, tag, quantity) {
  return { type: 'ammunition', name, system: { tags: [tag], quantity } };
}

describe('ammo-based attack (launcher weapon)', () => {
  it('is available when a matching ammo stack exists, and selects it', () => {
    const longbow = weapon({ name: 'Longbow', missile: true, ammoTag: 'arrows' });
    const arrows = ammo('Arrow', 'arrows', 12);
    const result = checkAmmoAvailability(longbow, [arrows]);

    expect(result.ok).toBe(true);
    expect(result.requirement).toEqual({ kind: 'external', tag: 'arrows' });
    expect(result.ammoItem).toBe(arrows);
  });

  it('does not deduct the launcher itself', () => {
    const longbow = weapon({ name: 'Longbow', missile: true, ammoTag: 'arrows' });
    expect(isConsumableWeapon(longbow)).toBe(false);
  });
});

describe('thrown-weapon attack (self-consumed)', () => {
  it('is available and marked kind:self for a missile-only weapon with stock', () => {
    const javelin = weapon({ name: 'Javelin', missile: true, melee: false, quantity: 2 });
    const result = checkAmmoAvailability(javelin, []);

    expect(result.ok).toBe(true);
    expect(result.requirement).toEqual({ kind: 'self' });
    expect(result.ammoItem).toBeNull();
  });

  it('treats a dual-use weapon thrown as self-consumed', () => {
    const dagger = weapon({ name: 'Dagger', melee: true, missile: true, quantity: 1 });
    const result = checkAmmoAvailability(dagger, [], { isThrown: true });

    expect(result.ok).toBe(true);
    expect(result.requirement).toEqual({ kind: 'self' });
  });

  it('does not consume a dual-use weapon used in melee', () => {
    const dagger = weapon({ name: 'Dagger', melee: true, missile: true, quantity: 1 });
    const result = checkAmmoAvailability(dagger, [], { isThrown: false });

    expect(result.requirement).toBeNull();
  });
});

describe('insufficient inventory', () => {
  it('blocks a launcher attack with no matching ammo and returns a clear message', () => {
    const longbow = weapon({ name: 'Longbow', missile: true, ammoTag: 'arrows' });
    const result = checkAmmoAvailability(longbow, []);

    expect(result.ok).toBe(false);
    expect(result.ammoItem).toBeNull();
    expect(result.message).toMatch(/Longbow/);
  });

  it('ignores ammo stacks of the wrong type', () => {
    const longbow = weapon({ name: 'Longbow', missile: true, ammoTag: 'arrows' });
    const bolts = ammo('Bolt', 'bolts', 10);
    const result = checkAmmoAvailability(longbow, [bolts]);

    expect(result.ok).toBe(false);
  });

  it('blocks a thrown-weapon attack at zero quantity', () => {
    const javelin = weapon({ name: 'Javelin', missile: true, quantity: 0 });
    const result = checkAmmoAvailability(javelin, []);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Javelin/);
  });
});

describe('weapon requiring no ammo', () => {
  it('a melee-only weapon has no requirement and is always available', () => {
    const sword = weapon({ name: 'Sword', melee: true, missile: false });
    const result = checkAmmoAvailability(sword, []);

    expect(result.requirement).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.ammoItem).toBeNull();
  });
});

describe('crossbow tag-collision regression', () => {
  it('a launcher tagged missile+reload is not treated as self-consumable once ammoTag is set', () => {
    const crossbow = weapon({ name: 'Crossbow, Light', tags: ['missile', 'reload'], missile: true, ammoTag: 'bolts' });
    expect(isConsumableWeapon(crossbow)).toBe(false);
    expect(resolveAmmoRequirement(crossbow)).toEqual({ kind: 'external', tag: 'bolts' });
  });

  it('a dart (same tags, no ammoTag) is still correctly self-consumable', () => {
    const dart = weapon({ name: 'Dart', tags: ['missile', 'reload'], missile: true });
    expect(isConsumableWeapon(dart)).toBe(true);
    expect(resolveAmmoRequirement(dart)).toEqual({ kind: 'self' });
  });
});

describe('stale-data guard (missing ammoTag on a known launcher)', () => {
  it('blocks a Longbow with no ammoTag instead of self-consuming it', () => {
    const staleLongbow = weapon({ name: 'Longbow', missile: true, melee: false, tags: ['missile', 'two-handed'] });
    const result = checkAmmoAvailability(staleLongbow, []);

    expect(result.ok).toBe(false);
    expect(result.requirement).toEqual({ kind: 'stale' });
    expect(result.message).toMatch(/out of date/i);
  });

  it('does not delete or otherwise select the weapon as its own ammo', () => {
    const staleSling = weapon({ name: 'Sling', missile: true, melee: false, quantity: 1 });
    const result = checkAmmoAvailability(staleSling, [ammo('Sling Stone', 'stones', 20)]);

    expect(result.ok).toBe(false);
    expect(result.ammoItem).toBeNull();
  });

  it('does not affect a genuinely self-thrown weapon like Javelin', () => {
    const javelin = weapon({ name: 'Javelin', missile: true, melee: false, quantity: 1 });
    const result = checkAmmoAvailability(javelin, []);

    expect(result.ok).toBe(true);
    expect(result.requirement).toEqual({ kind: 'self' });
  });

  it('is bypassed once ammoTag is present (post-refresh)', () => {
    const migratedLongbow = weapon({ name: 'Longbow', missile: true, melee: false, ammoTag: 'arrows' });
    const result = checkAmmoAvailability(migratedLongbow, [ammo('Arrow', 'arrows', 5)]);

    expect(result.ok).toBe(true);
    expect(result.requirement).toEqual({ kind: 'external', tag: 'arrows' });
  });
});

describe('findAmmoStacks / pickAmmoStack', () => {
  it('filters by type, tag, and positive quantity', () => {
    const arrows = ammo('Arrow', 'arrows', 5);
    const silverArrows = ammo('Silver-tipped Arrow', 'arrows', 2);
    const emptyArrows = ammo('Arrow', 'arrows', 0);
    const bolts = ammo('Bolt', 'bolts', 5);
    const notAmmo = weapon({ name: 'Longbow' });

    const stacks = findAmmoStacks([arrows, silverArrows, emptyArrows, bolts, notAmmo], 'arrows');
    expect(stacks).toEqual([arrows, silverArrows]);
  });

  it('picks the largest matching stack', () => {
    const small = ammo('Arrow', 'arrows', 3);
    const large = ammo('Arrow', 'arrows', 9);
    expect(pickAmmoStack([small, large])).toBe(large);
  });

  it('returns null for no stacks', () => {
    expect(pickAmmoStack([])).toBeNull();
  });
});
