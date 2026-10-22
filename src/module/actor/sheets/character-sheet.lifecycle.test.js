import { beforeAll, afterEach, expect, it, vi } from 'vitest';
let CharacterSheet;
const event = () => ({ preventDefault() {}, target: {} });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
beforeAll(async () => {
  // Match v14's non-reentrant submission and swallowed _updateObject error contract.
  class ActorSheet {
    async _onSubmit(_event, options) {
      if (this._submitting || !this.isEditable) return false;
      this._submitting = true; this.submitOptions.push(options);
      try { await this._updateObject(_event, options.updateData ?? this._getSubmitData()); }
      catch (_error) { /* v14 reports this, then resolves the submit */ }
      finally { this._submitting = false; }
      return options.updateData;
    }
    async _updateObject(_event, data) { return this.actor.update(data); }
    async close(options) { this.baseClose(options); }
    async saveEditor(name, options) { await this._onSubmit(event(), options); this.editors[name].changed = false; }
  }
  globalThis.foundry = { applications: { sheets: { ActorSheetV2: ActorSheet }, api: { HandlebarsApplicationMixin: Base => Base } }, utils: {} };
  globalThis.Application = class {};
  globalThis.Dialog = class {};
  globalThis.ui = { notifications: { error: vi.fn() } };
  ({ OspActorSheetCharacter: CharacterSheet } = await import('./character-sheet.js'));
});
afterEach(() => vi.useRealTimers());
function sheet() {
  const value = Object.create(CharacterSheet.prototype);
  value.options = { editable: true, submitOnClose: true }; value.isEditable = true;
  value.current = { 'system.details.background': 'background', 'system.details.notes': 'history', 'system.tabNotes': 'notes' };
  value._getSubmitData = extra => ({ ...structuredClone(value.current), ...extra });
  value.actor = { img: 'old.webp', system: { race: 'Human', class: 'Fighter', level: 1 }, update: vi.fn(async data => { Object.assign(value.persisted, data); }), prepareDerivedData: vi.fn() };
  value.persisted = {}; value.submitOptions = []; value.baseClose = vi.fn(); value.render = vi.fn();
  Object.defineProperty(value, 'form', { value: {}, configurable: true }); value.handlers = new Map(); value.destroyHandlers = vi.fn();
  value.editors = Object.fromEntries(Object.keys(value.current).map(name => [name, { instance: {}, changed: true }]));
  return value;
}
it('serializes rapid editor saves and preserves the latest content without rendering', async () => {
  const s = sheet(), gate = deferred(); let first = true;
  s.actor.update.mockImplementation(async data => { if (first) { first = false; await gate.promise; } Object.assign(s.persisted, data); });
  s.current['system.tabNotes'] = 'first';
  const a = s.saveEditor('system.tabNotes', { remove: false, preventRender: true });
  await Promise.resolve(); await Promise.resolve();
  s.current['system.tabNotes'] = 'second';
  const b = s.saveEditor('system.tabNotes', { remove: false, preventRender: true });
  expect(s.actor.update).toHaveBeenCalledTimes(1);
  gate.resolve(); await Promise.all([a, b]);
  expect(s.actor.update).toHaveBeenCalledTimes(2); expect(s.persisted['system.tabNotes']).toBe('second');
  expect(s.render).not.toHaveBeenCalled(); expect(s.actor.update.mock.calls.every(([, options]) => options.render === false)).toBe(true);
});
it('keeps two sheets independent while one save is waiting', async () => {
  const a = sheet(), b = sheet(), gate = deferred();
  a.actor.update.mockImplementation(async () => gate.promise);
  const pending = a._onSubmit(event(), { preventRender: true });
  await b._onSubmit(event(), { preventRender: true });
  expect(b.persisted['system.tabNotes']).toBe('notes'); expect(a.persisted).toEqual({});
  gate.resolve(); await pending;
});
it('flushes all live fields before teardown, including a close during an editor save', async () => {
  const s = sheet(), gate = deferred(); let first = true;
  s.actor.update.mockImplementation(async data => { if (first) { first = false; await gate.promise; } Object.assign(s.persisted, data); });
  const pending = s.saveEditor('system.details.background', { preventRender: true });
  await Promise.resolve(); await Promise.resolve();
  s.current['system.details.background'] = 'new background'; s.current['system.tabNotes'] = 'last keystroke';
  const close = s.close();
  expect(s.destroyHandlers).not.toHaveBeenCalled(); expect(s.baseClose).not.toHaveBeenCalled();
  gate.resolve(); await pending; await close;
  expect(s.persisted).toEqual(s.current); expect(s.baseClose).toHaveBeenCalledWith({ submit: false });
  expect(s.destroyHandlers).toHaveBeenCalledTimes(1); expect(s.render).not.toHaveBeenCalled();
});
it('surfaces swallowed v14 save failures and keeps the sheet open for retry', async () => {
  const s = sheet(); s.actor.update.mockRejectedValueOnce(new Error('disk unavailable'));
  expect(await s.close()).toBe(false); expect(s.baseClose).not.toHaveBeenCalled();
  expect(s.destroyHandlers).not.toHaveBeenCalled(); expect(s.editors['system.tabNotes'].instance).toBeDefined();
  expect(s._isClosing).toBe(false); expect(ui.notifications.error).toHaveBeenCalledWith(expect.stringContaining('disk unavailable'));
  await s.close(); expect(s.persisted).toEqual(s.current); expect(s.baseClose).toHaveBeenCalledTimes(1);
});
it('rejects a failed editor save and allows the next one to persist', async () => {
  const s = sheet(); s.actor.update.mockRejectedValueOnce(new Error('offline'));
  await expect(s.saveEditor('system.tabNotes', { preventRender: true })).rejects.toThrow('offline');
  expect(s.editors['system.tabNotes'].changed).toBe(true);
  s.current['system.tabNotes'] = 'retry'; await s.saveEditor('system.tabNotes', { preventRender: true });
  expect(s.persisted['system.tabNotes']).toBe('retry');
});
it('does not submit or persist collapse flags from a read-only sheet', async () => {
  const s = sheet(); s.isEditable = false; s.actor.setFlag = vi.fn();
  expect(await s._onSubmit(event())).toBe(false);
  for (const method of ['_onContainerToggle', '_onLashedToggle', '_onAttachmentToggle', '_onBeltRowToggle', '_onSlingStorageToggle']) await s[method](event());
  await s.close(); expect(s.actor.update).not.toHaveBeenCalled(); expect(s.actor.setFlag).not.toHaveBeenCalled();
  expect(s.baseClose).toHaveBeenCalledTimes(1);
});
it('preserves ordinary submit rendering and portrait synchronization', async () => {
  const s = sheet(); s.current['system.portrait'] = 'new.webp';
  await s._onSubmit(event()); expect(s.render).toHaveBeenCalledTimes(1);
  expect(s.actor.prepareDerivedData).toHaveBeenCalledTimes(1); expect(s.persisted.img).toBe('new.webp');
});
it('cleans only its own delayed work and disposers on close and rerender', async () => {
  vi.useFakeTimers(); const a = sheet(), b = sheet(), aCallback = vi.fn(), bCallback = vi.fn(), disposed = vi.fn();
  a._sheetDisposers = [disposed]; a._setSheetTimeout(aCallback, 100); b._setSheetTimeout(bCallback, 100);
  a._disposeSheetUi(); a._disposeSheetUi(); vi.runAllTimers();
  expect(disposed).toHaveBeenCalledTimes(1); expect(aCallback).not.toHaveBeenCalled(); expect(bCallback).toHaveBeenCalledTimes(1);
  a._setSheetTimeout(aCallback, 100); await a.close(); vi.runAllTimers();
  expect(aCallback).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
