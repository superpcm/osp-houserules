import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { roll, rollCritical, changeHealth, posted } = vi.hoisted(() => ({
  roll: vi.fn(),
  rollCritical: vi.fn(),
  changeHealth: vi.fn(),
  posted: []
}));

vi.mock('../dice.js', () => ({
  ospRoll: roll,
  buildManualChatContent: result => `raw:${result.total}`
}));
vi.mock('./critical-authority.js', () => ({ rollCritical }));
vi.mock('./health-authority.js', () => ({ changeHealth }));

let MonsterSheet;
const handlers = {};

beforeAll(async () => {
  vi.stubGlobal('foundry', {
    utils: { mergeObject: (base, extra) => ({ ...base, ...extra }), randomID: () => 'rid' },
    appv1: { sheets: { ActorSheet: class { _getHeaderButtons() { return []; } activateListeners() {} } } }
  });
  ({ OspActorSheetMonster: MonsterSheet } = await import('../actor/sheets/monster-sheet.js'));
});

const result = (total, naturalD20 = total) => ({ total, naturalD20, manual: false, foundryRoll: null });

function makeActor(overrides = {}) {
  const weapon = { id: 'claw', type: 'weapon', name: 'Claw', sort: 0, img: '', system: { damage: '1d6', bonus: 0, attacksPerRound: 1, melee: true } };
  const items = [weapon];
  items.get = id => items.find(item => item.id === id);
  items.filter = predicate => Array.prototype.filter.call(items, predicate);
  return {
    id: 'monster', uuid: 'Actor.monster', name: 'Goblin', type: 'monster', isOwner: true,
    system: { hitpoints: 8, maxhitpoints: 8, thac0: { bba: 0 }, ac: 10, details: {} },
    items,
    ...overrides
  };
}

function setup({ attacker = makeActor(), target = { id: 'target', uuid: 'Actor.target', name: 'Target', system: { ac: 10, hitpoints: 10, maxhitpoints: 10 } } } = {}) {
  const targetToken = { name: target.name, actor: target };
  globalThis.DOMPurify = { sanitize: value => value };
  globalThis.ui = { notifications: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } };
  globalThis.game = {
    user: { targets: new Set([targetToken]) },
    settings: { get: () => 'publicroll' }
  };
  globalThis.ChatMessage = {
    getSpeaker: () => ({ actor: attacker.id }),
    applyRollMode: () => ({}),
    create: async data => posted.push(data)
  };
  handlers['.attack-roll'] = null;
  const html = { find: selector => ({ on: (_event, callback) => { handlers[selector] = callback; } }) };
  const sheet = new MonsterSheet(attacker);
  sheet.actor = attacker;
  sheet.isEditable = false;
  sheet.activateListeners(html);
  return { sheet, attacker, target, weapon: attacker.items[0] };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  posted.length = 0;
  rollCritical.mockResolvedValue({ success: true, rerollOnes: false });
  changeHealth.mockResolvedValue({ success: true, beforeHP: 10, afterHP: 7 });
});

afterEach(() => vi.useRealTimers());

async function clickAttack(attacker = makeActor(), target) {
  const context = setup({ attacker, target });
  roll.mockResolvedValueOnce(result(15, 15)).mockResolvedValueOnce(result(3));
  await handlers['.attack-roll']({ currentTarget: { closest: () => ({ dataset: { itemId: 'claw' } }) } });
  await vi.advanceTimersByTimeAsync(3000);
  return context;
}

describe('monster health authority integration', () => {
  it('routes a completed attack through changeHealth and marks the applied card', async () => {
    const { target } = await clickAttack();
    expect(changeHealth).toHaveBeenCalledWith(target, { action: 'damage', amount: 3 }, 'monster-rid');
    expect(posted.at(-1).flags['osp-houserules']).toMatchObject({ combatDamage: true, healthApplied: true });
  });

  it('critical natural 20 doubles damage and carries reroll-ones guidance', async () => {
    rollCritical.mockResolvedValue({ success: true, rerollOnes: true });
    const context = setup();
    roll.mockResolvedValueOnce(result(20, 20)).mockResolvedValueOnce(result(4));
    await handlers['.attack-roll']({ currentTarget: { closest: () => ({ dataset: { itemId: 'claw' } }) } });
    await vi.advanceTimersByTimeAsync(3000);
    expect(rollCritical).toHaveBeenCalledWith(context.attacker, 'hit');
    expect(roll.mock.calls[1][0]).toBe('2d6rr1');
    expect(changeHealth).toHaveBeenCalledWith(context.target, { action: 'damage', amount: 4 }, 'monster-rid');
  });

  it('incapacitated monsters cannot attack', async () => {
    const attacker = makeActor({ flags: { 'osp-houserules': { healthState: { zeroIncapacitated: true } } } });
    setup({ attacker });
    await handlers['.attack-roll']({ currentTarget: { closest: () => ({ dataset: { itemId: 'claw' } }) } });
    expect(roll).not.toHaveBeenCalled();
    expect(changeHealth).not.toHaveBeenCalled();
  });

  it('does not post an applied damage card when health mutation fails', async () => {
    changeHealth.mockResolvedValue({ success: false, reason: 'pending' });
    await clickAttack();
    expect(changeHealth).toHaveBeenCalledTimes(1);
    expect(posted.some(message => message.flags?.['osp-houserules']?.healthApplied)).toBe(false);
  });
});
