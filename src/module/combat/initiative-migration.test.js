import { describe, expect, it } from 'vitest';
import { migrateInitiativeDefaults } from './initiative-migration.js';

function fakeGame({ version = 0, gm = true, failOn = null } = {}) {
  const values = new Map([['initiativeRulesVersion', version]]);
  const writes = [];
  let failed = false;
  return {
    game: {
      system: { id: 'osp-houserules' },
      user: { id: 'gm', isGM: gm },
      users: { activeGM: { id: 'gm' } },
      settings: {
        get: (_, key) => values.get(key) ?? 0,
        set: async (_, key, value) => {
          writes.push([key, value]);
          if (key === failOn && !failed) { failed = true; throw new Error('write failed'); }
          values.set(key, value);
        },
      },
    },
    values,
    writes,
  };
}

describe('initiative default migration', () => {
  it('writes defaults in order and marks complete last', async () => {
    const fixture = fakeGame();
    await expect(migrateInitiativeDefaults({ gameRef: fixture.game })).resolves.toMatchObject({ migrated: true });
    expect(fixture.writes).toEqual([
      ['initiative', 'individual'],
      ['rerollInitiative', 'reroll'],
      ['initiativeRulesVersion', 1],
    ]);
  });

  it('is active-GM only and preserves chosen alternate settings after migration', async () => {
    const skipped = fakeGame({ gm: false });
    await expect(migrateInitiativeDefaults({ gameRef: skipped.game })).resolves.toMatchObject({ skipped: true });
    const later = fakeGame({ version: 1 });
    later.values.set('initiative', 'group');
    later.values.set('rerollInitiative', 'keep');
    await migrateInitiativeDefaults({ gameRef: later.game });
    expect(later.writes).toEqual([]);
    expect(later.values.get('initiative')).toBe('group');
    expect(later.values.get('rerollInitiative')).toBe('keep');
  });

  it('leaves the marker unchanged on failure so a later call retries', async () => {
    const fixture = fakeGame({ failOn: 'rerollInitiative' });
    await expect(migrateInitiativeDefaults({ gameRef: fixture.game })).rejects.toThrow('write failed');
    expect(fixture.values.get('initiativeRulesVersion')).toBe(0);
    await migrateInitiativeDefaults({ gameRef: fixture.game });
    expect(fixture.values.get('initiativeRulesVersion')).toBe(1);
    expect(fixture.values.get('initiative')).toBe('individual');
    expect(fixture.values.get('rerollInitiative')).toBe('reroll');
  });
});

