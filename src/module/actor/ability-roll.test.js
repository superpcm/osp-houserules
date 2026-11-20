import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('../dice.js', () => ({ ospRoll: vi.fn(), buildManualChatContent: vi.fn(() => '<div>manual</div>') }));
import { ospRoll } from '../dice.js';
import { abilityOutcome, rollAbility } from './ability-roll.js';

const item = (overrides = {}) => ({ type: 'ability', name: 'Test Ability', parent: { documentName: 'Actor', type: 'character', isOwner: true, system: {}, getRollData: () => ({}) }, system: { roll: '1d1+6', rollType: 'result', ...overrides } });
beforeEach(() => {
  globalThis.DOMPurify = { sanitize: value => value };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; } };
  globalThis.ChatMessage = { getSpeaker: vi.fn(() => ({})), applyRollMode: vi.fn(() => ({ whisper: ['gm'] })), create: vi.fn() };
  globalThis.game = { user: { isGM: true }, settings: { get: vi.fn((scope, key) => key === 'rollMode' ? 'publicroll' : false) } };
  ospRoll.mockReset();
});
describe('ability rolls', () => {
  it('uses inclusive comparisons', () => { expect(abilityOutcome(6, 'above', 6).success).toBe(true); expect(abilityOutcome(6, 'below', 6).success).toBe(true); });
  it('rejects non-finite targets', () => { expect(() => abilityOutcome(6, 'above', NaN)).toThrow(); expect(() => abilityOutcome(6, 'below', Infinity)).toThrow(); });
  it('rejects missing, blank, null, and unknown targets/types before rolling', async () => {
    for (const target of [undefined, null, '']) await expect(rollAbility(item({ rollType: 'above', rollTarget: target }))).rejects.toThrow(/target/i);
    await expect(rollAbility(item({ rollType: 'other', rollTarget: 4 }))).rejects.toThrow(/type/i);
    expect(ospRoll).not.toHaveBeenCalled();
  });
  it('rejects an invalid formula without posting and clears validation state', async () => {
    globalThis.Roll = class { constructor() { throw new Error('invalid formula'); } };
    await expect(rollAbility(item())).rejects.toThrow(/invalid formula/i);
    globalThis.Roll = class { constructor(formula) { this.formula = formula; } };
    ospRoll.mockResolvedValue({ cancelled: true });
    await expect(rollAbility(item())).resolves.toMatchObject({ cancelled: true });
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });
  it('does not post when cancelled', async () => { ospRoll.mockResolvedValue({ cancelled: true }); const result = await rollAbility(item()); expect(result.cancelled).toBe(true); expect(ChatMessage.create).not.toHaveBeenCalled(); });
  it('posts blind manual rolls', async () => { ospRoll.mockResolvedValue({ total: 7, manual: true, foundryRoll: null, dice: [{ faces: 1, results: [1] }], modifier: 6 }); await rollAbility(item({ blindroll: true })); expect(ChatMessage.applyRollMode).toHaveBeenCalledWith({}, 'blindroll'); expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({ whisper: ['gm'] })); });
  it('posts virtual blind rolls with applied privacy payload', async () => {
    const foundryRoll = { toMessage: vi.fn() };
    ospRoll.mockResolvedValue({ total: 7, manual: false, foundryRoll });
    await rollAbility(item({ blindroll: true }));
    expect(ChatMessage.applyRollMode).toHaveBeenCalledWith({}, 'blindroll');
    expect(foundryRoll.toMessage).toHaveBeenCalledWith(expect.objectContaining({ whisper: ['gm'] }), { rollMode: 'blindroll' });
  });
  it('keeps plain result output numeric without success/failure text', async () => {
    ospRoll.mockResolvedValue({ total: 7, manual: true, foundryRoll: null, dice: [{ faces: 1, results: [1] }], modifier: 6 });
    await rollAbility(item());
    const message = ChatMessage.create.mock.calls[0][0];
    expect(message.flavor).toContain('Result: 7');
    expect(message.flavor).not.toMatch(/Success|Failure/);
  });
  it('rejects unauthorized actors before rolling', async () => { globalThis.game.user.isGM = false; const unauthorized = item(); unauthorized.parent.isOwner = false; await expect(rollAbility(unauthorized)).rejects.toThrow(/permission/i); expect(ospRoll).not.toHaveBeenCalled(); });
  it('blocks non-GM player lock and permits an owned monster otherwise', async () => {
    globalThis.game.user.isGM = false;
    globalThis.game.settings.get.mockImplementation((scope, key) => key === 'playerLock');
    await expect(rollAbility(item())).rejects.toThrow(/lock/i);
    globalThis.game.settings.get.mockImplementation((scope, key) => key === 'rollMode' ? 'publicroll' : false);
    const monster = item(); monster.parent.type = 'monster';
    ospRoll.mockResolvedValue({ cancelled: true });
    await expect(rollAbility(monster)).resolves.toMatchObject({ cancelled: true });
  });
  it('allows only one concurrent roll and clears the guard after completion', async () => {
    let resolveRoll;
    ospRoll.mockReturnValue(new Promise(resolve => { resolveRoll = resolve; }));
    const shared = item();
    const first = rollAbility(shared);
    const second = await rollAbility(shared);
    expect(second.duplicate).toBe(true);
    expect(ChatMessage.create).not.toHaveBeenCalled();
    resolveRoll({ cancelled: true });
    await first;
    ospRoll.mockResolvedValue({ cancelled: true });
    await expect(rollAbility(shared)).resolves.toMatchObject({ cancelled: true });
  });
  it('clears the guard after a roll rejection', async () => {
    const shared = item();
    ospRoll.mockRejectedValueOnce(new Error('roll failed')).mockResolvedValueOnce({ cancelled: true });
    await expect(rollAbility(shared)).rejects.toThrow(/roll failed/);
    await expect(rollAbility(shared)).resolves.toMatchObject({ cancelled: true });
  });
});
