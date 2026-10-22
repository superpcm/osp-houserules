import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { prompt } = vi.hoisted(() => ({ prompt: vi.fn() }));
vi.mock('./character-creation-dialog.js', () => ({ createCharacterFromPrompt: prompt }));
let OspActor;
let dialog;
let fields;
const coreDialog = vi.fn();
const create = vi.fn();

beforeAll(async () => {
  vi.stubGlobal('Actor', class { static createDialog = coreDialog; static create = create; });
  ({ OspActor } = await import('./actor.js'));
});
beforeEach(() => {
  vi.clearAllMocks();
  fields = { name: 'Test Character', type: 'character', folder: 'folder-1' };
  vi.stubGlobal('game', { folders: [{ id: 'folder-1', name: 'Players', type: 'Actor' }], i18n: { localize: () => 'Create Actor' } });
  vi.stubGlobal('foundry', {
    utils: { deepClone: structuredClone, escapeHTML: value => value },
    applications: { api: { DialogV2: class {
      constructor(config) { this.config = config; dialog = this; this.element = { querySelector: selector => ({ value: fields[selector.match(/name="(.*?)"/)[1]] }) }; }
      render() { return Promise.resolve(this); }
    } } }
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

const submit = () => dialog.config.buttons.find(button => button.action === 'create').callback(null, null, dialog);

describe('BR-08 Foundry create dialog integration', () => {
  it('awaits custom creation, preserves metadata and folder, and renders once', async () => {
    const render = vi.fn();
    const actor = { sheet: { render } };
    let complete;
    prompt.mockImplementation((data, options) => new Promise(resolve => { complete = () => resolve(options.create(data, { osprSkipDialog: true })); }));
    create.mockResolvedValue(actor);
    const source = { name: 'Original', folder: 'folder-1', flags: { custom: true } };
    const result = OspActor.createDialog(source, { pack: 'test' }, {}, { focus: true });
    const submission = submit();
    expect(create).not.toHaveBeenCalled();
    dialog.config.close();
    complete();
    await submission;
    expect(await result).toBe(actor);
    expect(create).toHaveBeenCalledWith({ name: 'Test Character', type: 'character', folder: 'folder-1', flags: { custom: true } }, { pack: 'test', osprSkipDialog: true, renderSheet: false });
    expect(render).toHaveBeenCalledExactlyOnceWith(true, { focus: true });
    expect(source.name).toBe('Original');
    expect(dialog.config.content).toContain('value="folder-1" selected');
  });
  it('returns null on custom cancellation without rendering or creating a partial actor', async () => {
    prompt.mockResolvedValue(null);
    const result = OspActor.createDialog();
    await submit();
    expect(await result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
  it('allows Monster selection in the initial directory dialog', async () => {
    const actor = { sheet: { render: vi.fn() } };
    create.mockResolvedValue(actor);
    const result = OspActor.createDialog();
    fields.type = 'monster';
    await submit();
    expect(await result).toBe(actor);
    expect(prompt).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: 'monster' }), { renderSheet: false });
  });
  it.each([
    [{ type: 'monster' }, {}],
    [{ type: 'character', system: { attributes: { str: { value: 12 } } } }, {}],
    [{}, { osprSkipDialog: true }]
  ])('delegates imports, explicit monsters and bypass requests to Foundry', async (data, options) => {
    coreDialog.mockResolvedValue('core');
    expect(await OspActor.createDialog(data, options)).toBe('core');
    expect(coreDialog).toHaveBeenCalledWith(data, options, {} , {});
    expect(prompt).not.toHaveBeenCalled();
  });
  it('returns null when the initial dialog closes', async () => {
    const result = OspActor.createDialog();
    dialog.config.close();
    expect(await result).toBeNull();
    expect(prompt).not.toHaveBeenCalled();
  });
});
