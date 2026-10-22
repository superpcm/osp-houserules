import { createSheetDialog } from './sheet-dialog.js';
import { activateCombatValueSizing } from './combat-value-sizing.js';
import { activateChapterHeaderAlignment } from './chapter-header-alignment.js';

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/** Native v14 window lifecycle, with the journal's existing inner form and workflows. */
export class NativeCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    classes: ['window-app', 'osp-native-character'],
    window: { resizable: false },
    submitOnClose: true,
  };

  static PARTS = {
    sheet: {
      template: 'systems/osp-houserules/templates/actors/character-sheet.html',
      scrollable: ['.gear-scrollable-content', '.skill-abilities-content', '.spell-subtab-panel'],
      forms: {
        form: { submitOnChange: true, closeOnSubmit: false },
      },
    },
  };

  get form() { return this.element?.querySelector('form.osp.sheet.actor.character') ?? null; }
  get title() { return this.actor.name || super.title; }
  get sheetDocument() { return this.element?.ownerDocument ?? globalThis.document; }
  get sheetWindow() { return this.sheetDocument?.defaultView ?? globalThis.window; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, { actor: this.actor, items: this.actor.items, owner: this.actor.isOwner });
  }

  async _onRender(context, options) {
    // Native ActorSheetV2 owns the DragDrop controller; retain the journal's row selectors.
    this._dragDrop.dragSelector = '.item-list .item';
    await super._onRender(context, options);
    this._activateSheetListeners($(this.form));
    this._activateNativeEditors();
    this._chapterHeaderAlignment?.();
    this._chapterHeaderAlignment = activateChapterHeaderAlignment(this.form, this.element);
    this._sheetDisposers ??= [];
    this._sheetDisposers.push(() => {
      this._chapterHeaderAlignment?.();
      this._chapterHeaderAlignment = null;
    });
  }

  _onSubmitForm(_config, event) {
    return this._onSubmit(event, {
      preventRender: Boolean(event.target?.closest?.('prose-mirror')),
    }).catch(error => ui.notifications.error(error.message));
  }

  /** Snapshot before the serialized save queue runs, including the live ProseMirror content. */
  _getSubmitData(updateData = {}) {
    const data = this.form ? new foundry.applications.ux.FormDataExtended(this.form).object : {};
    for (const editor of this.form?.querySelectorAll('prose-mirror[name]') ?? []) {
      if (!editor.disabled) data[editor.name] = editor.value;
    }
    return { ...data, ...updateData };
  }

  async _onSubmit(event, options = {}) {
    if (!this.isEditable) return false;
    const data = options.updateData ?? this._getSubmitData();
    await this._updateObject(event, data);
    return data;
  }

  _updateObject(_event, data) {
    return this.actor.update(data, { render: false });
  }

  /** Save on blur; native editor saves must still update their own value before DOM adoption. */
  _activateNativeEditors() {
    const form = this.form;
    if (!form || !this.isEditable) return;
    const save = event => {
      const editor = event.target.closest?.('prose-mirror');
      if (!editor || editor.contains(event.relatedTarget)) return;
      this._onSubmit(event, { preventRender: true }).catch(error => ui.notifications.error(error.message));
    };
    form.addEventListener('focusout', save);
    this._sheetDisposers ??= [];
    this._sheetDisposers.push(() => {
      form.removeEventListener('focusout', save);
    });
  }

  saveEditor(_name, options = {}) {
    return this._onSubmit(null, { ...options, preventRender: true });
  }

  createDialog(data, options) { return createSheetDialog(this, data, options); }

  /** Window listeners travel with the same DOM when Foundry adopts it into another window. */
  _listenToSheetWindow(type, listener, options) {
    const binding = { type, listener, options, window: this.sheetWindow };
    binding.window.addEventListener(type, listener, options);
    this._sheetWindowBindings ??= new Set();
    this._sheetWindowBindings.add(binding);
    this._sheetDisposers ??= [];
    this._sheetDisposers.push(() => {
      binding.window.removeEventListener(type, listener, options);
      this._sheetWindowBindings.delete(binding);
    });
  }

  _refreshSheetHost() {
    for (const binding of this._sheetWindowBindings ?? []) {
      binding.window.removeEventListener(binding.type, binding.listener, binding.options);
      binding.window = this.sheetWindow;
      binding.window.addEventListener(binding.type, binding.listener, binding.options);
    }
    for (const handler of this.handlers?.values() ?? []) handler.onHostChange?.();
    this._chapterHeaderAlignment?.();
    this._chapterHeaderAlignment = activateChapterHeaderAlignment(this.form, this.element);
    this._combatValueSizing?.();
    this._combatValueSizing = activateCombatValueSizing(this.form);
    // Let each sheet's layout observers recalculate in its new viewport, without rebuilding drafts.
    this.sheetWindow?.dispatchEvent(new this.sheetWindow.Event('resize'));
  }

  _onDetach(from, to) {
    super._onDetach(from, to);
    this._refreshSheetHost();
  }

  _onAttach(from, to) {
    super._onAttach(from, to);
    this._refreshSheetHost();
  }
}
