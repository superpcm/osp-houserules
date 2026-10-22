/** Handles character language display and editing. */
import { createSheetDialog } from '../sheet-dialog.js';

export function normalizeLanguageName(language) {
  const name = String(language ?? '').trim();
  if (['alignment', 'lawful', 'neutral', 'chaotic', 'lawful alignment', 'neutral alignment', 'chaotic alignment'].includes(name.toLowerCase())) return '';
  if (name.toLowerCase() === 'common') return 'Trade Tongue';
  if (name === 'Hobbit' || name === 'Hobbitish') return 'Hobbiton';
  return name;
}

export function languageOverflowState(naturalWidth, availableWidth) {
  return Number.isFinite(naturalWidth) && Number.isFinite(availableWidth) && naturalWidth > availableWidth;
}

let languageInstanceId = 0;

const ownerDocumentFor = handler => handler.tags?.[0]?.ownerDocument ?? handler.html?.[0]?.ownerDocument ?? globalThis.document;
const ownerWindowFor = handler => ownerDocumentFor(handler)?.defaultView ?? globalThis.window;

export class LanguageHandler {
  constructor(html, actor, sheet) {
    this.html = html;
    this.actor = actor;
    this.sheet = sheet;
    this.tags = html.find('.languages-tags');
    this.hidden = html.find('.char-languages');
    this.openDialog = html.find('.open-language-dialog');
    this.standardLanguages = ['Dwarvish', 'Elvish', 'Gnomish', 'Hobbiton', 'Orcish'];
    this._expanded = false;
    this._resizeObserver = null;
    this._measureFrame = null;
    this._resizeWindow = null;
    this._toggleId = `languages-${this.actor?.id || 'actor'}-${++languageInstanceId}`;
    this._onWindowResize = () => this.scheduleOverflowMeasurement();
    this.languages = (this.hidden.val() || '').split(',').map(normalizeLanguageName).filter(language => language && language !== 'Trade Tongue');
    this.languages = [...new Set(this.languages)];
    this.languages.unshift('Trade Tongue');
  }

  initialize() {
    this.ensureOverflowControl();
    this.renderTags();
    this.html.on('dblclick', '.open-language-dialog', this.onOpenDialog.bind(this));
    this.html.on('dblclick', '.cs-languages-toggle', event => event.stopPropagation());
    this.html.on('click', '.cs-languages-toggle', this.onToggleOverflow.bind(this));
    this._bindResizeListener();
    this._bindResizeObserver();
  }

  _bindResizeObserver() {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    const ResizeObserverCtor = this._ownerWindow()?.ResizeObserver ?? globalThis.ResizeObserver;
    if (typeof ResizeObserverCtor !== 'undefined' && this.tags?.[0]) {
      this._resizeObserver = new ResizeObserverCtor(() => this.scheduleOverflowMeasurement());
      this._resizeObserver.observe(this.tags[0]);
    }
  }

  _ownerDocument() {
    return ownerDocumentFor(this);
  }

  _ownerWindow() {
    return ownerWindowFor(this);
  }

  _bindResizeListener() {
    const currentWindow = this._ownerWindow();
    if (this._resizeWindow && this._resizeWindow !== currentWindow) this._resizeWindow.removeEventListener('resize', this._onWindowResize);
    if (currentWindow && this._resizeWindow !== currentWindow) {
      currentWindow.addEventListener('resize', this._onWindowResize);
      this._resizeWindow = currentWindow;
    }
  }

  onHostChange() {
    this._bindResizeListener();
    this._bindResizeObserver();
    this.scheduleOverflowMeasurement();
  }

  renderTags() {
    const languageText = this.languages.join(', ');
    this.tags.empty();
    this.tags.text(languageText);
    this.hidden.val(languageText);
    const tagsElement = this.tags?.[0];
    if (tagsElement) {
      tagsElement.style.setProperty('white-space', 'nowrap', 'important');
      tagsElement.style.setProperty('overflow', 'hidden', 'important');
      tagsElement.style.setProperty('text-overflow', 'ellipsis', 'important');
    }
    if (this.overflowText) this.overflowText.text(languageText);
    this.scheduleOverflowMeasurement();
  }

  ensureOverflowControl() {
    const field = this.html.find('.cs-languages-field')[0];
    if (!field || !this.tags?.[0]) return;
    let toggle = field.querySelector('.cs-languages-toggle');
    if (!toggle) {
      toggle = this._ownerDocument().createElement('button');
      toggle.type = 'button';
      toggle.className = 'cs-languages-toggle';
      toggle.setAttribute('aria-controls', `${this._toggleId}-details`);
      toggle.setAttribute('aria-label', 'Show all languages');
      toggle.innerHTML = '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
      field.appendChild(toggle);
    }
    this.toggleElement = toggle;
    let details = field.querySelector('.cs-languages-expanded');
    if (!details) {
      details = this._ownerDocument().createElement('div');
      details.id = `${this._toggleId}-details`;
      details.className = 'cs-languages-expanded';
      details.setAttribute('role', 'region');
      details.setAttribute('aria-label', 'All languages');
      details.hidden = true;
      field.appendChild(details);
    }
    this.overflowText = $(details);
  }

  scheduleOverflowMeasurement() {
    const win = this._ownerWindow();
    const requestFrame = win?.requestAnimationFrame ?? globalThis.requestAnimationFrame;
    const cancelFrame = win?.cancelAnimationFrame ?? globalThis.cancelAnimationFrame;
    if (typeof requestFrame !== 'function') return this.measureOverflow();
    if (this._measureFrame) cancelFrame?.(this._measureFrame);
    this._measureFrame = requestFrame.call(win, () => { this._measureFrame = null; this.measureOverflow(); });
  }

  measureOverflow() {
    const el = this.tags?.[0];
    if (!el || !this.toggleElement) return;
    const doc = ownerDocumentFor(this);
    const win = ownerWindowFor(this);
    const style = win.getComputedStyle(el);
    const measure = doc.createElement('span');
    measure.textContent = this.languages.join(', ');
    Object.assign(measure.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', font: style.font, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, letterSpacing: style.letterSpacing });
    doc.body.appendChild(measure);
    const naturalWidth = measure.getBoundingClientRect().width || measure.scrollWidth;
    const field = this.tags.closest('.cs-languages-field')[0];
    const tagWidth = el.getBoundingClientRect().width || el.clientWidth;
    const hasOverflowClass = field?.classList?.contains?.('has-language-overflow');
    const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    const availableWidth = tagWidth + (hasOverflowClass ? 24 : 0) - padding;
    measure.remove();
    const overflowing = languageOverflowState(naturalWidth, availableWidth);
    field?.classList.toggle('has-language-overflow', overflowing);
    this.toggleElement.hidden = !overflowing;
    if (!overflowing) this.setExpanded(false);
    else this.toggleElement.setAttribute('aria-expanded', String(this._expanded));
  }

  onToggleOverflow(event) {
    event.preventDefault();
    event.stopPropagation();
    this.setExpanded(!this._expanded);
  }

  setExpanded(expanded) {
    this._expanded = Boolean(expanded);
    if (this.overflowText?.[0]) this.overflowText[0].hidden = !this._expanded;
    if (!this.toggleElement) return;
    this.toggleElement.setAttribute('aria-expanded', String(this._expanded));
    this.toggleElement.setAttribute('aria-label', this._expanded ? 'Collapse languages' : 'Show all languages');
    const icon = this.toggleElement.querySelector('i');
    if (icon) icon.className = `fa-solid fa-chevron-${this._expanded ? 'up' : 'down'}`;
  }

  adjustFontSize() { this.scheduleOverflowMeasurement(); }

  async onOpenDialog(event) {
    if (event?.target?.closest?.('.cs-languages-toggle')) return;
    const dialogContent = this.buildDialogContent();
    createSheetDialog(this.sheet, { title: 'Add Language', content: dialogContent,
      buttons: { ok: { label: 'OK', callback: html => { this.onDialogSubmit(html); return true; } }, cancel: { label: 'Cancel' } }, default: 'ok',
      render: html => {
        html.closest('.window-app').addClass('osp-language-dialog theme-parchment');
        const customCheck = html.find('#customCheck');
        const customInput = html.find('#customInput');
        customCheck.on('change', function () { if (this.checked) customInput.prop('disabled', false).focus(); else customInput.prop('disabled', true).val(''); });
      }
    }, { classes: ['osp-language-dialog', 'theme-parchment'] }).render(true);
  }

  buildDialogContent() {
    const choices = list => list.map(language => `<label class="cs-dialog-label"><input type="checkbox" name="lang" value="${language}" ${this.languages.includes(language) ? 'checked' : ''}/><span>${language}</span></label>`).join('');
    return `<form><div class="cs-dialog-row"><label><b>Select Languages:</b></label><br/><div class="cs-dialog-columns"><div class="cs-dialog-column">${choices(this.standardLanguages.slice(0, 3))}</div><div class="cs-dialog-column">${choices(this.standardLanguages.slice(3))}<label class="cs-dialog-label"><input type="checkbox" name="customCheck" id="customCheck"/><input type="text" name="custom" id="customInput" class="cs-custom-input" placeholder="Custom" disabled/></label></div></div></div></form>`;
  }

  onDialogSubmit(htmlDialog) {
    this.languages = ['Trade Tongue', ...this.languages.filter(language => language !== 'Trade Tongue' && !this.standardLanguages.includes(language))];
    htmlDialog.find('input[name="lang"]:checked').each((_index, element) => { const language = normalizeLanguageName($(element).val()); if (language && !this.languages.includes(language)) this.languages.push(language); });
    const custom = normalizeLanguageName(htmlDialog.find('input[name="custom"]').val());
    if (htmlDialog.find('input[name="customCheck"]').is(':checked') && custom && !this.languages.includes(custom)) this.languages.push(custom);
    this.renderTags();
  }

  destroy() {
    this.html?.off('click', '.cs-languages-toggle');
    this.html?.off('dblclick', '.open-language-dialog');
    this.html?.off('dblclick', '.cs-languages-toggle');
    const resizeWindow = this._resizeWindow ?? ownerWindowFor(this);
    resizeWindow?.removeEventListener?.('resize', this._onWindowResize);
    this._resizeWindow = null;
    this._resizeObserver?.disconnect();
    const ownerWindow = ownerWindowFor(this);
    const cancelFrame = ownerWindow?.cancelAnimationFrame ?? globalThis.cancelAnimationFrame;
    if (this._measureFrame && typeof cancelFrame === 'function') cancelFrame.call(ownerWindow, this._measureFrame);
    this._measureFrame = null;
  }
}
