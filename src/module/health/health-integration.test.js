import { beforeEach, expect, it, vi } from 'vitest';
const change = vi.hoisted(() => vi.fn());
vi.mock('./health-authority.js', () => ({ changeHealth: change }));
import { applyDamage } from '../helpers-chat.js';
let message, a, b;
beforeEach(() => {
  change.mockReset().mockResolvedValue({ success: true, beforeHP: 2, afterHP: -3 });
  message = { id: 'm1', flags: { 'osp-houserules': { combatDamage: true, combatDamageTotal: 5 } } };
  a = { id: 'a', uuid: 'Actor.a' }; b = { id: 'b', uuid: 'Actor.b' };
  vi.stubGlobal('game', { system: { id: 'osp-houserules' }, settings: { get: () => 'targeted' }, messages: { get: () => message }, user: { targets: new Set([{ actor: a }, { actor: b }, { actor: a }]) }, i18n: { localize: value => value } });
  vi.stubGlobal('ui', { notifications: { warn: vi.fn() } });
});
it('routes each unique target through authoritative damage with valid per-target IDs', async () => {
  await applyDamage('m1', 1);
  expect(change).toHaveBeenCalledTimes(2);
  expect(change.mock.calls[0].slice(0, 2)).toEqual([a, { action: 'damage', amount: 5 }]);
  const ids = change.mock.calls.map(call => call[2]); expect(new Set(ids).size).toBe(2);
  for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
  expect(message.flags['osp-houserules'].healthApplied).toBeUndefined();
});
it('does not reapply monster cards that already applied health changes', async () => {
  message.flags['osp-houserules'].healthApplied = true;
  await applyDamage('m1', 1); expect(change).not.toHaveBeenCalled();
});
it('routes explicit magical healing and reports pending failures', async () => {
  change.mockResolvedValue({ success: false, recoveryRequired: true, reason: 'Pending recovery' });
  await applyDamage('m1', -1);
  expect(change.mock.calls[0][1]).toEqual({ action: 'heal', amount: 5, magical: true });
  expect(ui.notifications.warn).toHaveBeenCalled();
});
