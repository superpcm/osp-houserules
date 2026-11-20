import { beforeEach, expect, it, vi } from 'vitest';
import { fitCharacterNameInput, activateCharacterNameSizing } from './character-name-sizing.js';

function fixture(value, clientWidth = 307) {
  const style = { paddingLeft: '2px', paddingRight: '2px', fontFamily: 'Handwritten', fontWeight: '400', fontStyle: 'normal', letterSpacing: '0px' };
  const context = { font: '', measureText(text) { const size = Number(this.font.match(/(\d+)px/)?.[1] ?? 60); return { width: text.length * size * .6, actualBoundingBoxLeft: 0, actualBoundingBoxRight: text.length * size * .6 }; } };
  const document = { createElement: () => ({ getContext: () => context }), defaultView: { getComputedStyle: () => style } };
  const input = { ownerDocument: document, value, clientWidth, style: { setProperty: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  return { input, document, context };
}

beforeEach(() => vi.restoreAllMocks());

it('shrinks a long name to the available ink width', () => {
  const { input } = fixture('Madoc Brookhouse');
  const size = fitCharacterNameInput(input);
  expect(size).toBeLessThan(60);
  expect(input.style.setProperty).toHaveBeenCalledWith('--character-name-font-size', `${size}px`);
});

it('keeps a short name at the 60px maximum', () => {
  const { input } = fixture('Myr');
  expect(fitCharacterNameInput(input)).toBe(60);
});

it('releases activation listeners and observers on cleanup', () => {
  const { input, document } = fixture('Madoc Brookhouse');
  const resize = vi.fn(), fonts = { ready: Promise.resolve(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  document.defaultView.addEventListener = resize; document.defaultView.removeEventListener = vi.fn(); document.defaultView.ResizeObserver = class { observe = vi.fn(); disconnect = vi.fn(); };
  document.fonts = fonts;
  const tab = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const root = { ownerDocument: document, querySelector: selector => selector === '#char-name' ? input : tab };
  const dispose = activateCharacterNameSizing(root); dispose();
  expect(input.removeEventListener).toHaveBeenCalledWith('input', expect.any(Function));
  expect(document.defaultView.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  expect(fonts.removeEventListener).toHaveBeenCalledWith('loadingdone', expect.any(Function));
});


it.each(['Bianca', 'Edvin Thue', 'Fung Telt', 'Madoc Brookhouse', 'Myr Ragmussen'])('fits %s without changing field geometry', name => {
  const { input } = fixture(name);
  input.style.width = '100%';
  const size = fitCharacterNameInput(input);
  expect(name.length * size * .6).toBeLessThanOrEqual(299);
  expect(input.clientWidth).toBe(307);
  expect(input.style.width).toBe('100%');
  expect(input.style.setProperty.mock.calls.every(([property]) => property === '--character-name-font-size')).toBe(true);
});

it('grows back to the original scale after a long name becomes short', () => {
  const { input } = fixture('A Very Long Adventuring Character Name');
  expect(fitCharacterNameInput(input)).toBeLessThan(60);
  input.value = 'Myr';
  expect(fitCharacterNameInput(input)).toBe(60);
});

it('refits after input, resize, font loading, and hidden Bio activation', async () => {
  const { input, document, context } = fixture('Madoc Brookhouse', 0);
  const frames = new Map(); let nextFrame = 0, onResize, fontReady;
  const inputEvents = new Map(), fontEvents = new Map(), tabEvents = new Map();
  const win = document.defaultView;
  win.requestAnimationFrame = fn => { frames.set(++nextFrame, fn); return nextFrame; };
  win.cancelAnimationFrame = id => frames.delete(id);
  win.addEventListener = vi.fn(); win.removeEventListener = vi.fn();
  win.ResizeObserver = class { constructor(fn) { onResize = fn; } observe() {} disconnect() {} };
  input.addEventListener = (type, fn) => inputEvents.set(type, fn);
  input.removeEventListener = (type, fn) => { if (inputEvents.get(type) === fn) inputEvents.delete(type); };
  document.fonts = { ready: new Promise(resolve => { fontReady = resolve; }), addEventListener: (type, fn) => fontEvents.set(type, fn), removeEventListener: type => fontEvents.delete(type) };
  const tab = { addEventListener: (type, fn) => tabEvents.set(type, fn), removeEventListener: type => tabEvents.delete(type) };
  const root = { ownerDocument: document, querySelector: selector => selector === '#char-name' ? input : tab };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const dispose = activateCharacterNameSizing(root);
  flush();
  expect(input.style.setProperty).not.toHaveBeenCalled();
  input.clientWidth = 307; tabEvents.get('click')(); flush();
  const initial = input.style.setProperty.mock.calls.at(-1)[1];
  input.value = 'Myr'; inputEvents.get('input')(); flush();
  expect(input.style.setProperty).toHaveBeenLastCalledWith('--character-name-font-size', '60px');
  input.value = 'Madoc Brookhouse'; input.clientWidth = 200; onResize(); flush();
  expect(Number(input.style.setProperty.mock.calls.at(-1)[1].replace('px', ''))).toBeLessThan(Number(initial.replace('px', '')));
  const measured = context.measureText.bind(context);
  context.measureText = text => { const metrics = measured(text); return { width: metrics.width * 2, actualBoundingBoxRight: metrics.width * 2 }; };
  const beforeFont = input.style.setProperty.mock.calls.at(-1)[1];
  fontReady(); await Promise.resolve(); flush();
  expect(Number(input.style.setProperty.mock.calls.at(-1)[1].replace('px', ''))).toBeLessThan(Number(beforeFont.replace('px', '')));
  fontEvents.get('loadingdone')(); flush();
  dispose();
  expect(inputEvents.size).toBe(0);
  expect(fontEvents.size).toBe(0);
  expect(tabEvents.size).toBe(0);
  expect(frames.size).toBe(0);
});
