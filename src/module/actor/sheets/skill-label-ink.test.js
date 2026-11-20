import { expect, it } from 'vitest';
import { alignSkillLabelInk, measureSkillLabelInk } from './skill-label-ink.js';

it('uses painted glyph pixels for a three-pixel gap and does not drift on reapply', () => {
  const label = {
    dataset: {}, textContent: 'A',
    getNumberOfChars: () => 1,
    getStartPositionOfChar: () => ({ x: 50, y: 50 }),
    getRotationOfChar: () => 0,
    getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: Number(label.dataset.inkShift || 0) }),
    setAttribute() {},
  };
  const canvas = {
    getContext: () => ({
      scale() {}, clearRect() {}, fillText() {},
      getImageData() {
        const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
        // One painted pixel at the glyph baseline, independent of its box.
        data[(96 * canvas.width + 95) * 4 + 3] = 255;
        data[(96 * canvas.width + 96) * 4 + 3] = 255;
        return { data };
      },
    }),
  };
  label.ownerDocument = {
    fonts: { status: 'loaded' }, createElement: () => canvas,
    defaultView: { getComputedStyle: (_e, pseudo) => pseudo
      ? { top: '-34px', height: '168px' }
      : { fontSize: '12px', fontStyle: 'normal', fontWeight: '400', fontFamily: 'serif' } },
  };
  const target = { offsetHeight: 100, getBoundingClientRect: () => ({ top: 100, left: 0, width: 100, height: 100 }) };
  alignSkillLabelInk(label, target);
  const shift = Number(label.dataset.inkShift);
  const rimTop = 100 - 34 + 168 * 25 / 1254;
  expect(rimTop - (50.125 + shift)).toBeCloseTo(3, 8);
  alignSkillLabelInk(label, target);
  expect(Number(label.dataset.inkShift)).toBeCloseTo(shift, 8);
});

it('waits for the real font before measuring glyph ink', () => {
  const label = {
    getNumberOfChars: () => 1,
    ownerDocument: { fonts: { status: 'loading' }, createElement: () => { throw new Error('font not ready'); } },
  };
  expect(() => alignSkillLabelInk(label, { offsetHeight: 100 })).not.toThrow();
});

it('reports the painted bounds of rotated glyphs instead of their line box', () => {
  const canvas = {
    getContext: () => ({
      scale() {}, clearRect() {}, fillText() {},
      getImageData() {
        const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
        data[(96 * canvas.width + 95) * 4 + 3] = 255;
        data[(96 * canvas.width + 96) * 4 + 3] = 255;
        return { data };
      },
    }),
  };
  const label = {
    textContent: 'A', getNumberOfChars: () => 1,
    getStartPositionOfChar: () => ({ x: 50, y: 50 }),
    getRotationOfChar: () => 90,
    getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getBoundingClientRect: () => ({ left: 0, width: 100 }),
    ownerDocument: {
      fonts: { status: 'loaded' }, createElement: () => canvas,
      defaultView: { getComputedStyle: () => ({ fontSize: '12px', fontStyle: 'normal', fontWeight: '400', fontFamily: 'serif' }) },
    },
  };
  const bounds = measureSkillLabelInk(label);
  expect(bounds.top).toBeLessThan(bounds.bottom);
  expect(bounds.top).toBeCloseTo(49.875, 8);
  expect(bounds.bottom).toBeCloseTo(50.125, 8);
});

it('reuses per-document glyph rasterization and invalidates it after fonts finish loading', () => {
  let scans = 0;
  let loadingDone;
  const canvas = {
    getContext: () => ({
      scale() {}, clearRect() {}, fillText() {},
      getImageData() {
        scans++;
        const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
        data[(96 * canvas.width + 95) * 4 + 3] = 255;
        return { data };
      },
    }),
  };
  const document = {
    fonts: { status: 'loaded', addEventListener: (_type, listener) => { loadingDone = listener; } },
    createElement: () => canvas,
    defaultView: { getComputedStyle: () => ({ fontSize: '12px', fontStyle: 'normal', fontWeight: '400', fontFamily: 'serif' }) },
  };
  const makeLabel = () => ({
    dataset: {}, textContent: 'A', getNumberOfChars: () => 1,
    getStartPositionOfChar: () => ({ x: 50, y: 50 }), getRotationOfChar: () => 0,
    getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), ownerDocument: document,
  });
  measureSkillLabelInk(makeLabel());
  measureSkillLabelInk(makeLabel());
  expect(scans).toBe(1);
  loadingDone();
  measureSkillLabelInk(makeLabel());
  expect(scans).toBe(2);
});

it('recovers when a document canvas context is unavailable before becoming ready', () => {
  let contexts = 0;
  const canvas = {
    getContext: () => {
      contexts++;
      if (contexts === 1) return null;
      return {
        scale() {}, clearRect() {}, fillText() {},
        getImageData() {
          const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
          data[(96 * canvas.width + 95) * 4 + 3] = 255;
          return { data };
        },
      };
    },
  };
  const document = {
    fonts: { status: 'loaded' }, createElement: () => canvas,
    defaultView: { getComputedStyle: () => ({ fontSize: '12px', fontStyle: 'normal', fontWeight: '400', fontFamily: 'serif' }) },
  };
  const label = () => ({
    dataset: {}, textContent: 'A', getNumberOfChars: () => 1,
    getStartPositionOfChar: () => ({ x: 50, y: 50 }), getRotationOfChar: () => 0,
    getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), ownerDocument: document,
  });
  expect(measureSkillLabelInk(label())).toBeNull();
  expect(measureSkillLabelInk(label())).not.toBeNull();
  expect(contexts).toBe(2);
});
