import { afterEach, describe, expect, it, vi } from 'vitest';
import { nameDroppedSpellbook } from './spellbook-drop.js';

const book = () => ({
  _id: 'book-1',
  type: 'item',
  name: 'Spellbook',
  system: { quantity: 1, nested: { keep: true } },
  flags: { custom: { retained: true } }
});

afterEach(() => {
  delete globalThis.Dialog;
});

describe('nameDroppedSpellbook', () => {
  it('returns nonbooks unchanged without prompting', async () => {
    globalThis.Dialog = vi.fn();
    const item = { type: 'item', name: 'Lantern' };
    expect(await nameDroppedSpellbook(item)).toBe(item);
    expect(globalThis.Dialog).not.toHaveBeenCalled();
  });

  it('escapes the initial name and preserves metadata when renamed', async () => {
    let config;
    globalThis.Dialog = vi.fn((options, windowOptions) => {
      config = { options, windowOptions };
      return { render: vi.fn() };
    });
    const item = book();
    const resultPromise = nameDroppedSpellbook(item);
    expect(config.options.content).toContain('value="Spellbook"');
    expect(config.options.content).toContain('maxlength="80"');
    expect(config.windowOptions).toEqual({ width: 360, classes: ['osp', 'osp-dialog', 'osp-spellbook-rename'] });
    const html = { find: () => ({ val: () => "  Fung Telt's Grimoire  " }) };
    config.options.buttons.confirm.callback(html);
    const result = await resultPromise;
    expect(result).toEqual({ ...item, name: "Fung Telt's Grimoire", flags: { custom: { retained: true }, 'osp-houserules': { spellbook: true } } });
    expect(result.system).not.toBe(item.system);
    expect(item.name).toBe('Spellbook');
  });

  it('uses Spellbook for a blank name', async () => {
    let config;
    globalThis.Dialog = vi.fn(options => {
      config = options;
      return { render: vi.fn() };
    });
    const resultPromise = nameDroppedSpellbook(book());
    config.buttons.confirm.callback({ find: () => ({ val: () => '   ' }) });
    expect((await resultPromise).name).toBe('Spellbook');
  });

  it('returns null when cancelled or closed', async () => {
    let config;
    globalThis.Dialog = vi.fn(options => {
      config = options;
      return { render: vi.fn() };
    });
    const cancelled = nameDroppedSpellbook(book());
    config.buttons.cancel.callback();
    expect(await cancelled).toBeNull();

    const closed = nameDroppedSpellbook(book());
    config.close();
    expect(await closed).toBeNull();
  });
});
