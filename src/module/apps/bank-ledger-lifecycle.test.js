import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
let BankLedgerView, hooks;
beforeAll(async () => {
  globalThis.Application = class {};
  globalThis.Dialog = class {};
  globalThis.foundry = { applications: { api: { ApplicationV2: class { async close() {} }, HandlebarsApplicationMixin: Base => Base } } };
  ({ BankLedgerView } = await import('./bank-ledger-view.js'));
});
beforeEach(() => {
  hooks = new Map(); globalThis.game = { system: { id: 'osp-houserules' } };
  globalThis.Hooks = { on: (n, cb) => { const set = hooks.get(n) ?? new Set(); set.add(cb); hooks.set(n, set); }, off: (n, cb) => hooks.get(n)?.delete(cb) };
});
const emit = (name, value) => { for (const cb of hooks.get(name) ?? []) cb(value); };
it('keeps actor/account refresh hooks isolated and removes them through repeated close/reopen cycles', async () => {
  const a = new BankLedgerView({ actor: { id: 'a' } }), b = new BankLedgerView({ actor: { id: 'b' } });
  a.render = vi.fn(); b.render = vi.fn();
  for (let i = 0; i < 3; i++) {
    a._onFirstRender({}, {}); b._onFirstRender({}, {});
    expect(hooks.get('updateActor').size).toBe(2);
    emit('updateActor', { id: 'a' }); expect(a.render).toHaveBeenCalledTimes(i + 1); expect(b.render).not.toHaveBeenCalled();
    await a.close(); expect(hooks.get('updateActor').size).toBe(1);
    emit('updateActor', { id: 'a' }); expect(a.render).toHaveBeenCalledTimes(i + 1);
    await b.close(); expect(hooks.get('updateActor').size).toBe(0); expect(hooks.get('updateSetting').size).toBe(0);
  }
});
it('refreshes party treasury only in a window displaying that account', async () => {
  const a = new BankLedgerView({ actor: { id: 'a' } }), b = new BankLedgerView({ actor: { id: 'b' } });
  a.render = vi.fn(); b.render = vi.fn(); b.account = 'party';
  a._onFirstRender({}, {}); b._onFirstRender({}, {});
  emit('updateSetting', { key: 'osp-houserules.partyTreasury' });
  expect(a.render).not.toHaveBeenCalled(); expect(b.render).toHaveBeenCalledTimes(1);
  await a.close(); await b.close();
});
