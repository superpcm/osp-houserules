import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

const sizing = vi.hoisted(() => ({ activateCombatValueSizing: vi.fn(() => vi.fn()) }));
const alignment = vi.hoisted(() => ({ activateChapterHeaderAlignment: vi.fn(() => vi.fn()) }));
vi.mock('./combat-value-sizing.js', () => sizing);
vi.mock('./chapter-header-alignment.js', () => alignment);
let NativeCharacterSheet, createSheetDialog, ActorSheetV2;
beforeAll(async () => {
  ActorSheetV2 = class {
    async _prepareContext() { return { editable: true }; }
    async _onRender() {}
    _onDetach() {}
    _onAttach() {}
  };
  globalThis.foundry = { applications: {
    sheets: { ActorSheetV2 },
    api: { HandlebarsApplicationMixin: Base => Base, DialogV2: class {
      constructor(options) { this.options = options; this.element = {}; }
      async _onRender() {}
      _onClose() {}
    } },
    ux: { FormDataExtended: class { constructor(form) { this.object = { ...form.values }; } } },
  } };
  globalThis.$ = element => ({ 0: element, find: selector => element.querySelector?.(selector) });
  ({ NativeCharacterSheet } = await import('./native-character-sheet.js'));
  ({ createSheetDialog } = await import('./sheet-dialog.js'));
});
beforeEach(() => vi.clearAllMocks());

function fixture() {
  const form = { values: { name: 'A name', 'system.details.notes': 'stored text' }, querySelectorAll: () => [] };
  const s = Object.create(NativeCharacterSheet.prototype);
  s.element = { ownerDocument: { defaultView: {} }, querySelector: () => form };
  s.actor = { isOwner: true, items: [], update: vi.fn(async () => true) };
  s.options = Object.freeze({}); s.isEditable = true;
  return { s, form };
}

it('uses the native actor framework and a single inner form without replacing native window controls', () => {
  const { s } = fixture();
  expect(s).toBeInstanceOf(ActorSheetV2);
  expect(NativeCharacterSheet.DEFAULT_OPTIONS.window.controls).toBeUndefined();
  expect(NativeCharacterSheet.PARTS.sheet.forms.form.submitOnChange).toBe(true);
  expect(NativeCharacterSheet.PARTS.sheet.scrollable).toContain('.skill-abilities-content');
});

it('preserves document context and existing sheet listener initialization', async () => {
  const { s, form } = fixture();
  expect(await s._prepareContext({})).toMatchObject({ actor: s.actor, owner: true, editable: true });
  s._dragDrop = {}; s._activateSheetListeners = vi.fn(); s._activateNativeEditors = vi.fn();
  await s._onRender({}, {});
  expect(s._activateSheetListeners.mock.calls[0][0][0]).toBe(form);
  expect(s.isEditable).toBe(true);
  expect(s._dragDrop.dragSelector).toBe('.item-list .item');
  expect(alignment.activateChapterHeaderAlignment).toHaveBeenCalledWith(form, s.element);
});

it('captures live editor text before a queued save, with explicit updates taking precedence', () => {
  const { s, form } = fixture();
  const editor = { name: 'system.details.notes', value: '<p>last keystroke</p>', disabled: false };
  form.querySelectorAll = () => [editor, { name: 'protected', value: 'do not write', disabled: true }];
  const snapshot = s._getSubmitData({ name: 'New name' });
  editor.value = 'later';
  expect(snapshot).toEqual({ name: 'New name', 'system.details.notes': '<p>last keystroke</p>' });
});

it('honors ownership and propagates failures instead of losing pending text', async () => {
  const { s } = fixture();
  s.isEditable = false;
  expect(await s._onSubmit(null)).toBe(false);
  expect(s.actor.update).not.toHaveBeenCalled();
  s.isEditable = true;
  s.actor.update.mockRejectedValueOnce(new Error('offline'));
  await expect(s._onSubmit(null)).rejects.toThrow('offline');
  await s._onSubmit(null);
  expect(s.actor.update).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'A name' }), { render: false });
});

it('lets native editor saves update their value while keeping the editor alive during persistence', async () => {
  const { s, form } = fixture();
  form.addEventListener = vi.fn(); form.removeEventListener = vi.fn();
  s._activateNativeEditors();
  expect(form.addEventListener.mock.calls.map(([type]) => type)).toEqual(['focusout']);
  s._onSubmit = vi.fn(async () => true);
  const event = { target: { closest: () => ({}) } };
  await s._onSubmitForm({}, event);
  expect(s._onSubmit).toHaveBeenCalledWith(event, { preventRender: true });
});

it('moves window listeners to the current owner and cleans the current binding on teardown', () => {
  const { s } = fixture();
  const makeWindow = () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(), Event });
  const first = makeWindow(), second = makeWindow(), listener = vi.fn(), onHostChange = vi.fn();
  s.element.ownerDocument.defaultView = first;
  s.handlers = new Map([['language', { onHostChange }]]);
  s._listenToSheetWindow('resize', listener);
  s.element.ownerDocument.defaultView = second;
  s._onDetach({}, {});
  expect(first.removeEventListener).toHaveBeenCalledWith('resize', listener, undefined);
  expect(second.addEventListener).toHaveBeenCalledWith('resize', listener, undefined);
  expect(onHostChange).toHaveBeenCalledOnce();
  expect(sizing.activateCombatValueSizing).toHaveBeenCalledWith(s.form);
  s._sheetDisposers.forEach(dispose => dispose());
  expect(second.removeEventListener).toHaveBeenCalledWith('resize', listener, undefined);
  expect(s._sheetWindowBindings.size).toBe(0);
});

it('recreates header alignment when the native sheet changes host windows', () => {
  const { s } = fixture();
  const oldAlignment = vi.fn();
  const makeWindow = () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(), Event });
  const host = makeWindow();
  s.element.ownerDocument.defaultView = host;
  s._chapterHeaderAlignment = oldAlignment;
  s.handlers = new Map();
  s._refreshSheetHost();
  expect(oldAlignment).toHaveBeenCalledOnce();
  expect(alignment.activateChapterHeaderAlignment).toHaveBeenCalledWith(s.form, s.element);
});

it('parents native prompts to the sheet and preserves confirmation, render and cancel callbacks', async () => {
  const renderChild = vi.fn(async app => app), callback = vi.fn(), render = vi.fn(), close = vi.fn();
  const prompt = createSheetDialog({ renderChild }, {
    title: 'Move arrows', content: '<form><input name="quantity"></form>',
    buttons: { ok: { label: 'Move', callback } }, default: 'ok', render, close,
  });
  const app = await prompt.render(true);
  expect(renderChild).toHaveBeenCalledWith(app, { force: true });
  expect(app.options.content).toBe('<input name="quantity">');
  await app._onRender({}, {});
  app.options.form = {};
  await app.options.buttons[0].callback(null, null, app);
  app._onClose({});
  expect(render.mock.calls[0][0][0]).toBe(app.element);
  expect(callback.mock.calls[0][0][0]).toBe(app.element);
  expect(close).toHaveBeenCalledOnce();
});

it('keeps a native prompt open when its validation callback rejects the input', async () => {
  const renderChild = vi.fn(async app => app);
  const prompt = createSheetDialog({ renderChild }, {
    buttons: { ok: { label: 'Move', callback: () => false } },
  });
  const app = await prompt.render(); app.close = vi.fn();
  const result = await app.options.buttons[0].callback(null, null, app);
  await app.options.submit(result, app);
  expect(app.options.form.closeOnSubmit).toBe(false);
  expect(app.close).not.toHaveBeenCalled();
  await app.options.submit('ok', app);
  expect(app.close).toHaveBeenCalledWith({ submitted: true });
});
