import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let OspActor;
beforeAll(async () => {
  vi.stubGlobal('Actor', class { async _preUpdate() { return 'base'; } });
  ({ OspActor } = await import('./actor.js'));
});

describe('GM ability score update guard', () => {
  beforeEach(() => {
    vi.stubGlobal('ui', { notifications: { warn: vi.fn() } });
    vi.stubGlobal('game', { user: { isGM: false } });
  });

  const makeActor = (type = 'character') => Object.assign(Object.create(OspActor.prototype), {
    type,
    system: { attributes: { str: { value: 12 } } }
  });

  it('cancels changed character scores for non-GM users after core preUpdate', async () => {
    const actor = makeActor();
    await expect(actor._preUpdate({ system: { attributes: { str: { value: 13 } } } }, {}, { isGM: false })).resolves.toBe(false);
    expect(ui.notifications.warn).toHaveBeenCalled();
  });

  it('allows GM, same-value, and non-character updates', async () => {
    expect(await makeActor()._preUpdate({ system: { attributes: { str: { value: 13 } } } }, {}, { isGM: true })).toBe('base');
    expect(await makeActor()._preUpdate({ system: { languages: 'Trade Tongue' } }, {}, { isGM: false })).toBe('base');
    expect(await makeActor('npc')._preUpdate({ system: { attributes: { str: { value: 13 } } } }, {}, { isGM: false })).toBe('base');
  });
});
