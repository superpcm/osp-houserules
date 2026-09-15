import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreasureValueDialog } from './treasure-value-dialog.js';

describe('TreasureValueDialog', () => {
  let options;

  beforeEach(() => {
    options = null;
    globalThis.Dialog = class {
      constructor(dialogOptions) { options = dialogOptions; }
      render() { return this; }
    };
    globalThis.ui = { notifications: { error: vi.fn() } };
  });

  afterEach(() => {
    delete globalThis.Dialog;
    delete globalThis.ui;
  });

  it('prefills the catalog value and returns the GM override', async () => {
    const result = TreasureValueDialog.prompt({ itemName: 'Diamond', initialValue: 1000 });

    expect(options.content).toContain('value="1000"');
    options.buttons.add.callback({ find: () => ({ val: () => '875.5' }) });

    await expect(result).resolves.toBe(875.5);
  });

  it('rejects a negative value without creating the item', async () => {
    const result = TreasureValueDialog.prompt({ itemName: 'Diamond', initialValue: 1000 });
    options.buttons.add.callback({ find: () => ({ val: () => '-1' }) });

    await expect(result).resolves.toBeNull();
    expect(ui.notifications.error).toHaveBeenCalledOnce();
  });

  it('returns null when the GM cancels', async () => {
    const result = TreasureValueDialog.prompt({ itemName: 'Diamond', initialValue: 1000 });
    options.buttons.cancel.callback();

    await expect(result).resolves.toBeNull();
  });
});
