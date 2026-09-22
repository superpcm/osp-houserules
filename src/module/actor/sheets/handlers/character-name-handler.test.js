import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import jquery from 'jquery';
import { CharacterNameHandler } from './character-name-handler.js';

let dom;

afterEach(() => {
  dom?.window.close();
  dom = null;
  vi.unstubAllGlobals();
});

function mount(name, textWidth, fieldWidth = 300) {
  dom = new JSDOM(`<form><input id="char-name" value="${name}"></form>`);
  const { document } = dom.window;
  const $ = jquery(dom.window);
  vi.stubGlobal('$', $);
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', dom.window);
  const input = document.querySelector('#char-name');
  Object.defineProperty(input, 'clientWidth', { value: fieldWidth });
  const originalCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const element = originalCreate(tag);
    if (tag === 'span') Object.defineProperty(element, 'offsetWidth', { get: () => textWidth });
    return element;
  });
  const handler = new CharacterNameHandler($(document.querySelector('form')), {});
  handler.initialize();
  handler.defaultFontSize = 54;
  handler.horizontalInset = 0;
  handler.adjustFontSize();
  return { handler, input };
}

describe('CharacterNameHandler', () => {
  it('keeps the default font size when the name fits', () => {
    const { handler, input } = mount('Fung Telt', 190);
    expect(input.style.getPropertyValue('--ej-character-name-font-size')).toBe('54px');
    handler.destroy();
  });

  it('shrinks long names proportionally to fit the fixed field', () => {
    const { handler, input } = mount('Alexandria Ravenshadow', 540);
    expect(input.style.getPropertyValue('--ej-character-name-font-size')).toBe('30px');
    expect(input.style.width).toBe('');
    handler.destroy();
  });

  it('uses a readable minimum for exceptionally long names', () => {
    const { handler, input } = mount('An exceptionally and improbably long adventurer name', 1200);
    expect(parseFloat(input.style.getPropertyValue('--ej-character-name-font-size'))).toBeCloseTo(29.7);
    handler.destroy();
  });
});
