import { expect, it, vi } from 'vitest';
import { activateChapterHeaderAlignment } from './chapter-header-alignment.js';

function makeFixture(tab = 'skills', titleBase = 140, subtitleBase = 160, scale = 1) {
  const rafQueue = [];
  const styleFor = () => {
    const values = new Map();
    return {
      setProperty: (name, value, priority = '') => values.set(name, { value: String(value), priority }),
      removeProperty: name => values.delete(name),
      getPropertyValue: name => values.get(name)?.value ?? '',
      getPropertyPriority: name => values.get(name)?.priority ?? '',
      set cssText(value) { values.set('cssText', { value }); },
      values,
    };
  };
  const makeElement = (baseTop, text = 'Header', fontFamily = '') => ({
    ownerDocument: null, style: styleFor(), dataset: {}, textContent: text, offsetHeight: 20, _fontFamily: fontFamily,
    firstChild: { textContent: text }, appendChild(child) { this.firstChild = child; return child; },
    querySelector: () => null,
    getBoundingClientRect() { const top = baseTop + (Number.parseFloat(this.style.getPropertyValue('top')) || 0); const height = 20 * scale; return { top, bottom: top + height, width: 100, height }; },
  });
  const title = makeElement(titleBase, 'Primary header');
  const subtitle = makeElement(subtitleBase, 'Subtitle');
  const document = {
    createElement(type) {
      if (type === 'canvas') return { getContext: () => ({ font: '', measureText: () => ({ actualBoundingBoxAscent: 20 }) }) };
      return { dataset: {}, style: styleFor(), firstChild: null, appendChild(child) { this.firstChild = child; return child; }, querySelector: () => null, getBoundingClientRect: () => ({ top: 0, width: 0, height: 0 }) };
    },
    fonts: { ready: Promise.resolve() },
  };
  const wrap = (element, baselineTop) => {
    const text = document.createElement('span');
    text.dataset.inkGapText = '1';
    const baseline = document.createElement('span');
    baseline.dataset.inkGapBaseline = '1';
    baseline.getBoundingClientRect = () => ({ top: baselineTop + (Number.parseFloat(element.style.getPropertyValue('top')) || 0), width: 0, height: 0 });
    text.querySelector = selector => selector.includes('data-ink-gap-baseline') ? baseline : null;
    text.appendChild(baseline);
    element.querySelector = selector => selector.includes('data-ink-gap-text') ? text : null;
    element.appendChild(text);
    element.ownerDocument = document;
  };
  wrap(title, titleBase + 20); wrap(subtitle, subtitleBase + 20);
  const panel = { ownerDocument: document, style: styleFor(), parentElement: null, _pseudo: { top: '121.148px', translate: '0px -33.7287px' }, getBoundingClientRect: () => ({ top: 100, width: 500, height: 400 }), querySelector: () => null };
  const panelTwo = { ownerDocument: document, style: styleFor(), parentElement: null, _pseudo: { top: '90px', translate: '0px -12px' }, getBoundingClientRect: () => ({ top: 100, width: 500, height: 400 }), querySelector: () => null };
  const panelTitle = makeElement(200, 'Panel title');
  const panelHint = makeElement(225, 'Panel hint');
  const panelEditor = makeElement(250, 'Panel editor');
  wrap(panelTitle, 220); wrap(panelHint, 245); wrap(panelEditor, 270);
  const panelTwoTitle = makeElement(180, 'Second title');
  const panelTwoHint = makeElement(205, 'Second hint');
  const panelTwoEditor = makeElement(230, 'Second editor');
  wrap(panelTwoTitle, 200); wrap(panelTwoHint, 225); wrap(panelTwoEditor, 250);
  const notesEditor = makeElement(250, 'Notes editor');
  wrap(notesEditor, 270);
  const handwritten = makeElement(300, 'Handwritten text', 'Handwritten');
  const svgText = makeElement(320, 'Handwritten SVG', 'Handwritten');
  svgText.tagName = 'text';
  handwritten.style.setProperty('color', 'rgb(1, 2, 3)', '');
  svgText.style.setProperty('fill', 'rgb(4, 5, 6)', 'author');
  const parts = [panelTitle, panelHint, panelEditor];
  const partsTwo = [panelTwoTitle, panelTwoHint, panelTwoEditor];
  panel.querySelector = selector => selector === '.bg-panel-title' ? panelTitle : selector === '.bg-panel-hint' ? panelHint : selector === '.bg-panel-editor' ? panelEditor : null;
  panel.querySelectorAll = selector => selector.includes('.bg-panel-title') ? parts : [];
  panelTwo.querySelector = selector => selector === '.bg-panel-title' ? panelTwoTitle : selector === '.bg-panel-hint' ? panelTwoHint : selector === '.bg-panel-editor' ? panelTwoEditor : null;
  panelTwo.querySelectorAll = selector => selector.includes('.bg-panel-title') ? partsTwo : [];
  const ancestorTwo = { ownerDocument: document, offsetHeight: 669, parentElement: null, getBoundingClientRect: () => ({ top: 80, width: 600, height: 628.86 }) };
  const active = {
    ownerDocument: document, dataset: { tab }, offsetHeight: 669, style: styleFor(),
    _pseudo: tab === 'notes' ? { top: '0px', translate: 'none', transform: 'matrix(1, 0, 0, 1, 0, -33.7287)' } : { top: '0px', translate: 'none', transform: 'none' },
    querySelector: selector => selector === '.bg-panel' ? panel : selector === '.bg-panel-editor' && tab === 'notes' ? notesEditor : (selector.includes('subtitle') || selector.includes('gear-subtitle') ? subtitle : selector.includes('title') || selector.includes('ej-running-head') ? title : null),
    querySelectorAll: selector => selector === '.bg-panel' ? [panel, panelTwo] : selector === '*' ? [handwritten, svgText] : [],
    getBoundingClientRect: () => ({ top: 60.07, width: 600, height: 628.86 }),
  };
  panel.parentElement = active;
  panelTwo.parentElement = ancestorTwo;
  const form = { querySelector: () => active, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const mutation = { observe: vi.fn(), disconnect: vi.fn() };
  const resize = { observe: vi.fn(), disconnect: vi.fn() };
  const win = {
    requestAnimationFrame: callback => { rafQueue.push(callback); return rafQueue.length; }, cancelAnimationFrame: vi.fn(),
    getComputedStyle: (element, pseudo) => pseudo === '::before'
      ? { top: (element._pseudo ?? {}).top ?? '0px', height: '529.289px', translate: (element._pseudo ?? {}).translate ?? 'none', transform: (element._pseudo ?? {}).transform ?? 'none' }
      : element === active
        ? { top: '0px', position: 'relative', height: '669px', boxSizing: 'border-box', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' }
        : element === ancestorTwo
          ? { top: '0px', position: 'relative', height: '669px', boxSizing: 'border-box', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' }
        : { top: element.style.getPropertyValue('top') || '0px', position: element.style.getPropertyValue('position') || 'static', height: '20px', boxSizing: 'border-box', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px', fontStyle: '', fontWeight: '', fontSize: '16px', fontFamily: element._fontFamily || 'sans-serif' },
    MutationObserver: class { constructor() { return mutation; } }, ResizeObserver: class { constructor() { return resize; } },
    document, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  };
  const root = { ownerDocument: { defaultView: win }, querySelector: () => null, getBoundingClientRect: () => ({ top: 100, width: 600, height: 800 }) };
  return { form, root, win, title, subtitle, panel, panelTwo, panelTitle, panelHint, panelEditor, panelTwoTitle, panelTwoHint, panelTwoEditor, notesEditor, handwritten, svgText, active, mutation, resize, rafQueue, flush: () => { while (rafQueue.length) rafQueue.shift()(); } };
}

it('aligns visible baseline ink to root top plus 90px and keeps title/subtitle spacing', () => {
  const fixture = makeFixture();
  const cleanup = activateChapterHeaderAlignment(fixture.form, fixture.root);
  expect(fixture.rafQueue).toHaveLength(1); fixture.flush();
  expect(fixture.title.style.getPropertyValue('top')).toBe('50px');
  expect(fixture.subtitle.style.getPropertyValue('top')).toBe('50px');
  expect(fixture.subtitle.getBoundingClientRect().top - fixture.title.getBoundingClientRect().top).toBe(20);
  cleanup();
});

it('converts the visible delta through a scaled native viewport', () => {
  const fixture = makeFixture('skills', 140, 160, 0.94);
  const cleanup = activateChapterHeaderAlignment(fixture.form, fixture.root); fixture.flush();
  expect(Number.parseFloat(fixture.title.style.getPropertyValue('top'))).toBeCloseTo(48.8 / 0.94, 6);
  cleanup();
});

it('leaves Bio unchanged and maps every non-Bio primary tab', () => {
  for (const tab of ['combat', 'gear', 'spells', 'character', 'details', 'attributes', 'background', 'notes']) {
    const fixture = makeFixture(tab); const cleanup = activateChapterHeaderAlignment(fixture.form, fixture.root); fixture.flush();
    expect(fixture.title.style.getPropertyValue('top')).toBe('50px'); cleanup();
  }
  const bio = makeFixture('bio'); const cleanup = activateChapterHeaderAlignment(bio.form, bio.root); bio.flush();
  expect(bio.title.style.getPropertyValue('top')).toBe(''); cleanup();
});

it('queues three frames, reschedules idempotently, and disconnects observers/listeners', () => {
  const fixture = makeFixture(); const cleanup = activateChapterHeaderAlignment(fixture.form, fixture.root);
  expect(fixture.rafQueue).toHaveLength(1);
  fixture.rafQueue.shift()(); expect(fixture.rafQueue).toHaveLength(1);
  fixture.rafQueue.shift()(); expect(fixture.rafQueue).toHaveLength(1);
  fixture.rafQueue.shift()();
  const resizeListener = fixture.win.addEventListener.mock.calls.find(([type]) => type === 'resize')[1]; resizeListener();
  expect(fixture.rafQueue).toHaveLength(1); fixture.flush(); cleanup();
  expect(fixture.mutation.disconnect).toHaveBeenCalledOnce(); expect(fixture.resize.disconnect).toHaveBeenCalledOnce();
  expect(fixture.win.removeEventListener).toHaveBeenCalledWith('resize', resizeListener, undefined);
});

it('restores original position/top while preserving existing transforms', () => {
  const fixture = makeFixture(); fixture.title.style.setProperty('position', 'absolute'); fixture.title.style.setProperty('top', '7px'); fixture.title.style.setProperty('transform', 'translateY(4px)');
  const cleanup = activateChapterHeaderAlignment(fixture.form, fixture.root); fixture.flush();
  expect(fixture.title.style.getPropertyValue('transform')).toBe('translateY(4px)'); cleanup();
  expect(fixture.title.style.getPropertyValue('position')).toBe('absolute'); expect(fixture.title.style.getPropertyValue('top')).toBe('7px'); expect(fixture.title.style.getPropertyValue('transform')).toBe('translateY(4px)');
});

it('anchors Background and Details writing panels to 674px below the sheet window top and restores custom properties', () => {
  for (const tab of ['background', 'character']) {
    const fixture = makeFixture(tab);
    fixture.panel.style.setProperty('--osp-writing-panel-height', 'original', 'important');
    fixture.panel.style.setProperty('--osp-writing-panel-top', 'original-top', 'important');
    fixture.panelTwo.style.setProperty('--osp-writing-panel-height', 'original-two', 'important');
    fixture.panelTwo.style.setProperty('--osp-writing-panel-top', 'original-top-two', 'important');
    const cleanup = activateChapterHeaderAlignment(fixture.form, fixture.root); fixture.flush();
    const expectedTop = (232 - 60.07) / 0.94 - (-33.7287);
    const expectedHeight = (774 - 60.07) / 0.94 - expectedTop - (-33.7287);
    expect(Number.parseFloat(fixture.panel.style.getPropertyValue('--osp-writing-panel-top'))).toBeCloseTo(expectedTop, 3);
    expect(Number.parseFloat(fixture.panel.style.getPropertyValue('--osp-writing-panel-height'))).toBeCloseTo(expectedHeight, 3);
    const expectedTopTwo = (232 - 80) / 0.94 - (-12);
    const expectedHeightTwo = (774 - 80) / 0.94 - expectedTopTwo - (-12);
    expect(Number.parseFloat(fixture.panelTwo.style.getPropertyValue('--osp-writing-panel-top'))).toBeCloseTo(expectedTopTwo, 3);
    expect(Number.parseFloat(fixture.panelTwo.style.getPropertyValue('--osp-writing-panel-height'))).toBeCloseTo(expectedHeightTwo, 3);
    cleanup();
    expect(fixture.panel.style.getPropertyValue('--osp-writing-panel-height')).toBe('original');
    expect(fixture.panel.style.getPropertyValue('--osp-writing-panel-top')).toBe('original-top');
    expect(fixture.panelTwo.style.getPropertyValue('--osp-writing-panel-height')).toBe('original-two');
    expect(fixture.panelTwo.style.getPropertyValue('--osp-writing-panel-top')).toBe('original-top-two');
  }
});

it('keeps Background ink five pixels below its panel border and restores editor geometry', () => {
  const fixture = makeFixture('background');
  const cleanup = activateChapterHeaderAlignment(fixture.form, fixture.root); fixture.flush();
  expect(fixture.panelTitle.style.getPropertyValue('top')).not.toBe('');
  expect(Number.parseFloat(fixture.panelTitle.style.getPropertyValue('top')) - Number.parseFloat(fixture.panelHint.style.getPropertyValue('top'))).toBeCloseTo(2, 6);
  expect(fixture.panelEditor.getBoundingClientRect().top).toBeCloseTo(fixture.panelTitle.getBoundingClientRect().bottom - 2, 1);
  expect(fixture.panelEditor.style.getPropertyValue('height')).not.toBe('');
  const titleInkTop = 220 + (Number.parseFloat(fixture.panelTitle.style.getPropertyValue('top')) || 0) - 20;
  const borderY = 100 + 132;
  expect(titleInkTop).toBeCloseTo(borderY + 7, 1);
  const titleTop = fixture.panelTitle.style.getPropertyValue('top');
  const hintTop = fixture.panelHint.style.getPropertyValue('top');
  const editorTop = fixture.panelEditor.style.getPropertyValue('top');
  const editorHeight = fixture.panelEditor.style.getPropertyValue('height');
  const panelTop = fixture.panel.style.getPropertyValue('--osp-writing-panel-top');
  const panelHeight = fixture.panel.style.getPropertyValue('--osp-writing-panel-height');
  const resizeListener = fixture.win.addEventListener.mock.calls.find(([type]) => type === 'resize')[1];
  resizeListener(); fixture.flush();
  expect(fixture.panelTitle.style.getPropertyValue('top')).toBe(titleTop);
  expect(fixture.panelHint.style.getPropertyValue('top')).toBe(hintTop);
  expect(fixture.panelEditor.style.getPropertyValue('top')).toBe(editorTop);
  expect(fixture.panelEditor.style.getPropertyValue('height')).toBe(editorHeight);
  expect(fixture.panel.style.getPropertyValue('--osp-writing-panel-top')).toBe(panelTop);
  expect(fixture.panel.style.getPropertyValue('--osp-writing-panel-height')).toBe(panelHeight);
  cleanup();
  expect(fixture.panelTitle.style.getPropertyValue('top')).toBe('');
  expect(fixture.panelEditor.style.getPropertyValue('height')).toBe('');
});

it('raises each Details editor to its own panel title bottom', () => {
  const fixture = makeFixture('character');
  const cleanup = activateChapterHeaderAlignment(fixture.form, fixture.root); fixture.flush();
  expect(fixture.panelEditor.getBoundingClientRect().top - fixture.panelTitle.getBoundingClientRect().bottom).toBeCloseTo(-2, 1);
  expect(fixture.panelTwoEditor.getBoundingClientRect().top - fixture.panelTwoTitle.getBoundingClientRect().bottom).toBeCloseTo(-2, 1);
  cleanup();
});

it('anchors the Notes panel and editor to the sheet bottom using matrix translation and restores them', () => {
  const fixture = makeFixture('notes', 140, 160, 0.94);
  fixture.active.style.setProperty('--osp-writing-panel-height', 'notes-original', 'important');
  fixture.active.style.setProperty('--osp-writing-panel-top', 'notes-original-top', 'important');
  const cleanup = activateChapterHeaderAlignment(fixture.form, fixture.root); fixture.flush();
  const expectedTop = (232 - 60.07) / 0.94 - (-33.7287);
  const expectedHeight = (774 - 60.07) / 0.94 - expectedTop - (-33.7287);
  expect(Number.parseFloat(fixture.active.style.getPropertyValue('--osp-writing-panel-top'))).toBeCloseTo(expectedTop, 3);
  expect(Number.parseFloat(fixture.active.style.getPropertyValue('--osp-writing-panel-height'))).toBeCloseTo(expectedHeight, 3);
  expect(fixture.notesEditor.style.getPropertyValue('height')).not.toBe('');
  cleanup();
  expect(fixture.active.style.getPropertyValue('--osp-writing-panel-height')).toBe('notes-original');
  expect(fixture.active.style.getPropertyValue('--osp-writing-panel-top')).toBe('notes-original-top');
  expect(fixture.notesEditor.style.getPropertyValue('height')).toBe('');
});

it('applies the handwritten ink color to text and SVG text, including Bio, then restores inline colors', () => {
  const fixture = makeFixture('bio');
  const cleanup = activateChapterHeaderAlignment(fixture.form, fixture.root); fixture.flush();
  expect(fixture.handwritten.style.getPropertyValue('color')).toBe('#78694D');
  expect(fixture.svgText.style.getPropertyValue('color')).toBe('#78694D');
  expect(fixture.svgText.style.getPropertyValue('fill')).toBe('#78694D');
  cleanup();
  expect(fixture.handwritten.style.getPropertyValue('color')).toBe('rgb(1, 2, 3)');
  expect(fixture.svgText.style.getPropertyValue('color')).toBe('');
  expect(fixture.svgText.style.getPropertyValue('fill')).toBe('rgb(4, 5, 6)');
});

