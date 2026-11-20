import { beforeEach, describe, expect, it, vi } from 'vitest';

const changeHealth = vi.hoisted(() => vi.fn());
vi.mock('./health/health-authority.js', () => ({ changeHealth }));

import {
  addChatMessageButtons,
  addChatMessageContextOptions,
  applyDamage,
  canApplyChatHealth,
  getChatDamageTotal,
} from './helpers-chat.js';

let message;
const actor = { id: 'target', uuid: 'Actor.target', name: 'Target' };

beforeEach(() => {
  changeHealth.mockReset().mockResolvedValue({ success: true });
  message = { id: 'm1', flags: { 'osp-houserules': { combatDamage: true, combatDamageTotal: 5 } }, rolls: [] };
  vi.stubGlobal('game', {
    system: { id: 'osp-houserules' },
    settings: { get: () => 'controlled' },
    messages: new Map([['m1', message]]),
    user: { targets: new Set() },
    i18n: { localize: value => value },
  });
  vi.stubGlobal('canvas', { tokens: { controlled: [{ actor }] } });
  vi.stubGlobal('ui', { notifications: { warn: vi.fn() } });
});

describe('chat health eligibility', () => {
  it('keeps legacy damage totals readable but rejects unmarked cards on every apply path', async () => {
    const legacy = { id: 'legacy', rolls: [{ total: 7 }] };
    expect(getChatDamageTotal(legacy)).toBe(7);
    expect(canApplyChatHealth(legacy)).toBe(false);

    const options = [];
    game.messages.set('legacy', legacy);
    addChatMessageContextOptions(null, options);
    expect(options.every(option => option.condition({ data: () => 'legacy' }) === false)).toBe(true);
    await applyDamage('legacy', 1);

    let click;
    const html = { querySelector: () => ({ appendChild: button => button }) };
    vi.stubGlobal('document', { createElement: () => ({ addEventListener: (_event, callback) => { click = callback; } }) });
    addChatMessageButtons(legacy, html, null);
    expect(click).toBeUndefined();
    expect(changeHealth).not.toHaveBeenCalled();
  });

  it('accepts flagged manual/virtual totals and preserves effective cap and routing', async () => {
    message.flags['osp-houserules'].manualRoll = true;
    message.flags['osp-houserules'].manualDamageTotal = 9;
    message.flags['osp-houserules'].nonProficiencyCap = 4;
    expect(canApplyChatHealth(message)).toBe(true);
    const options = [];
    addChatMessageContextOptions(null, options);
    expect(options[0].condition({ data: () => 'm1' })).toBe(true);
    await options[0].callback({ data: () => 'm1' });
    expect(changeHealth).toHaveBeenCalledWith(actor, { action: 'damage', amount: 4 }, expect.any(String));
  });

  it('excludes applied cards from button, context, and direct application', async () => {
    message.flags['osp-houserules'].healthApplied = true;
    expect(canApplyChatHealth(message)).toBe(false);
    const options = [];
    addChatMessageContextOptions(null, options);
    expect(options.every(option => option.condition({ data: () => 'm1' }) === false)).toBe(true);
    let appended = false;
    addChatMessageButtons(message, { querySelector: () => ({ appendChild: () => { appended = true; } }) }, null);
    await applyDamage('m1', 1);
    expect(appended).toBe(false);
    expect(changeHealth).not.toHaveBeenCalled();
  });
});
