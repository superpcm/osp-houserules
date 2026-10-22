import { ospDialogOptions } from '../../dialog/dialog-theme.js';

/** Keep character-sheet prompts in the sheet's native Foundry window. */
export function createSheetDialog(sheet, data, options = {}) {
  if (!sheet?.renderChild) return new Dialog(data, ospDialogOptions(options));
  const { DialogV2 } = foundry.applications.api;
  class SheetDialog extends DialogV2 {
    async _onRender(context, renderOptions) {
      await super._onRender(context, renderOptions);
      data.render?.($(this.element));
    }
    _onClose(closeOptions) {
      super._onClose(closeOptions);
      data.close?.($(this.element));
    }
  }
  const app = new SheetDialog(ospDialogOptions({
    classes: ['window-app', ...(options.classes ?? [])],
    window: { title: data.title ?? '', resizable: options.resizable ?? false },
    position: { width: options.width ?? 400, height: options.height ?? 'auto' },
    form: { closeOnSubmit: false },
    submit: async (result, dialog) => { if (result !== false) await dialog.close({ submitted: true }); },
    // DialogV2 supplies the form; retain the prompt fields without nesting another form.
    content: String(data.content ?? '').replace(/<\/?form\b[^>]*>/gi, ''),
    buttons: Object.entries(data.buttons ?? {}).map(([action, button]) => ({
      action, label: button.label, default: action === data.default,
      callback: async (_event, _button, dialog) => {
        const result = await button.callback?.($(dialog.element));
        return result;
      },
    })),
  }));
  return {
    render: (force = true, renderOptions = {}) => sheet.renderChild(app,
      typeof force === 'object' ? force : { ...renderOptions, force }),
    close: options => app.close(options),
  };
}
