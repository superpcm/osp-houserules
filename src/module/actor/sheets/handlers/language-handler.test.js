import { describe, expect, it, vi } from 'vitest';
import { LanguageHandler, languageOverflowState, normalizeLanguageName } from './language-handler.js';

describe('BR-17 language editing', () => {
  it('removes alignment languages and normalizes approved names', () => {
    expect(['Alignment', 'Lawful', 'Neutral', 'Chaotic'].map(normalizeLanguageName)).toEqual(['', '', '', '']);
    expect(['Common', 'Hobbit', 'Hobbitish', undefined].map(normalizeLanguageName)).toEqual(['Trade Tongue', 'Hobbiton', 'Hobbiton', '']);
  });
  it('preserves existing custom languages when standard choices change', () => {
    const model = { languages: ['Trade Tongue', 'Old Oeridian', 'Elvish'], standardLanguages: ['Elvish'], renderTags: vi.fn() };
    const html = { find: selector => selector.includes(':checked') ? { each: () => {} } : selector.includes('customCheck') ? { is: () => false } : { val: () => '' } };
    LanguageHandler.prototype.onDialogSubmit.call(model, html);
    expect(model.languages).toEqual(['Trade Tongue', 'Old Oeridian']);
    expect(model.renderTags).toHaveBeenCalledOnce();
  });
  it('only exposes expansion when measured text exceeds the field width', () => {
    expect(languageOverflowState(120, 120)).toBe(false);
    expect(languageOverflowState(121, 120)).toBe(true);
    expect(languageOverflowState(140, 120)).toBe(true);
  });

  it('toggles the popover and accessible control without opening the edit dialog', () => {
    const icon = { className: '' };
    const attrs = {};
    const toggle = { setAttribute: (name, value) => { attrs[name] = value; }, querySelector: () => icon };
    const details = { hidden: true };
    const model = { _expanded: false, toggleElement: toggle, overflowText: [details], setExpanded: LanguageHandler.prototype.setExpanded };
    LanguageHandler.prototype.setExpanded.call(model, true);
    expect(details.hidden).toBe(false);
    expect(attrs['aria-expanded']).toBe('true');
    expect(attrs['aria-label']).toBe('Collapse languages');
    expect(icon.className).toContain('chevron-up');
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    LanguageHandler.prototype.onToggleOverflow.call(model, event);
    expect(details.hidden).toBe(true);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('shows the toggle only when measured text overflows the rendered field', () => {
    let measuredWidth = 180;
    const field = { classList: { toggle: vi.fn(), contains: () => false } };
    const element = { getBoundingClientRect: () => ({ width: 100 }) };
    const measure = { style: {}, scrollWidth: 180, textContent: '', getBoundingClientRect: () => ({ width: measuredWidth }), remove: vi.fn() };
    vi.stubGlobal('window', { getComputedStyle: () => ({ font: '22px Cooper', fontFamily: 'Cooper', fontSize: '22px', fontWeight: '400', letterSpacing: '0px' }) });
    vi.stubGlobal('document', { createElement: () => measure, body: { appendChild: vi.fn() } });
    const toggle = { hidden: true, setAttribute: vi.fn() };
    const model = { tags: Object.assign([element], { closest: () => [field] }), toggleElement: toggle, languages: ['Trade Tongue', 'Dwarvish'], _expanded: false, setExpanded: vi.fn() };
    LanguageHandler.prototype.measureOverflow.call(model);
    expect(toggle.hidden).toBe(false);
    expect(field.classList.toggle).toHaveBeenCalledWith('has-language-overflow', true);
    measuredWidth = 80;
    LanguageHandler.prototype.measureOverflow.call(model);
    expect(toggle.hidden).toBe(true);
    expect(model.setExpanded).toHaveBeenCalledWith(false);
  });

  it('rechecks against the full field after reserving space for the toggle', () => {
    const classes = new Set(['has-language-overflow']);
    const field = { getBoundingClientRect: () => ({ width: 130 }), classList: { contains: name => classes.has(name), toggle: (_name, value) => { if (value) classes.add('has-language-overflow'); else classes.delete('has-language-overflow'); } } };
    const element = { getBoundingClientRect: () => ({ width: 106 }) };
    const measure = { style: {}, scrollWidth: 110, textContent: '', getBoundingClientRect: () => ({ width: 110 }), remove: vi.fn() };
    vi.stubGlobal('window', { getComputedStyle: () => ({ font: '22px Cooper', fontFamily: 'Cooper', fontSize: '22px', fontWeight: '400', letterSpacing: '0px', paddingLeft: '0px', paddingRight: '0px' }) });
    vi.stubGlobal('document', { createElement: () => measure, body: { appendChild: vi.fn() } });
    const toggle = { hidden: false, setAttribute: vi.fn() };
    const model = { tags: Object.assign([element], { closest: () => [field] }), toggleElement: toggle, languages: ['Trade Tongue', 'Dwarvish'], _expanded: true, setExpanded: vi.fn() };
    LanguageHandler.prototype.measureOverflow.call(model);
    expect(toggle.hidden).toBe(true);
    expect(classes.has('has-language-overflow')).toBe(false);
    expect(model.setExpanded).toHaveBeenCalledWith(false);
  });

  it('keeps overflow stable while the toggle reserves its 24px', () => {
    const classes = new Set();
    const field = { getBoundingClientRect: () => ({ width: 434 }), classList: { contains: name => classes.has(name), toggle: (_name, value) => { if (value) classes.add('has-language-overflow'); else classes.delete('has-language-overflow'); } } };
    let tagWidth = 325;
    let naturalWidth = 380;
    const element = { getBoundingClientRect: () => ({ width: tagWidth }) };
    const measure = { style: {}, scrollWidth: 0, textContent: '', getBoundingClientRect: () => ({ width: naturalWidth }), remove: vi.fn() };
    vi.stubGlobal('window', { getComputedStyle: () => ({ font: '22px Cooper', fontFamily: 'Cooper', fontSize: '22px', fontWeight: '400', letterSpacing: '0px', paddingLeft: '0px', paddingRight: '0px' }) });
    vi.stubGlobal('document', { createElement: () => measure, body: { appendChild: vi.fn() } });
    const toggle = { hidden: true, setAttribute: vi.fn() };
    const model = { tags: Object.assign([element], { closest: () => [field] }), toggleElement: toggle, languages: ['Trade Tongue'], _expanded: false, setExpanded: vi.fn() };
    LanguageHandler.prototype.measureOverflow.call(model);
    expect(toggle.hidden).toBe(false);
    tagWidth = 301;
    LanguageHandler.prototype.measureOverflow.call(model);
    expect(toggle.hidden).toBe(false);
    naturalWidth = 300;
    LanguageHandler.prototype.measureOverflow.call(model);
    expect(toggle.hidden).toBe(true);
  });

  it('disconnects observers and pending measurement frames on destroy', () => {
    const off = vi.fn();
    const disconnect = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal('window', { removeEventListener });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    LanguageHandler.prototype.destroy.call({ html: { off }, _resizeObserver: { disconnect }, _measureFrame: 7, _onWindowResize: vi.fn() });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledOnce();
  });

  it('moves resize ownership and observer measurement to a new host window', () => {
    const oldWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn(), requestAnimationFrame: vi.fn(() => 11), cancelAnimationFrame: vi.fn() };
    const newWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn(), requestAnimationFrame: vi.fn(() => 22), cancelAnimationFrame: vi.fn() };
    const oldObserver = { disconnect: vi.fn() };
    const newObserver = { observe: vi.fn(), disconnect: vi.fn() };
    newWindow.ResizeObserver = vi.fn(() => newObserver);
    const element = { ownerDocument: { defaultView: oldWindow } };
    const tags = Object.assign([element], { empty: vi.fn(), text: vi.fn() });
    const hidden = { val: () => '' };
    const html = { find: selector => selector === '.languages-tags' ? tags : hidden };
    const handler = new LanguageHandler(html, { id: 'host-switch' });
    handler._resizeWindow = oldWindow;
    handler._resizeObserver = oldObserver;
    element.ownerDocument = { defaultView: newWindow };

    handler.onHostChange();

    expect(oldWindow.removeEventListener).toHaveBeenCalledWith('resize', handler._onWindowResize);
    expect(newWindow.addEventListener).toHaveBeenCalledWith('resize', handler._onWindowResize);
    expect(oldObserver.disconnect).toHaveBeenCalledOnce();
    expect(newObserver.observe).toHaveBeenCalledWith(element);
    expect(newWindow.requestAnimationFrame).toHaveBeenCalledOnce();
  });
});
