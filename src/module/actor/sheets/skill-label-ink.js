// Use painted glyph pixels, including rotated textPath letters, rather than
// the SVG text element's line box to place the label above the bronze rim.
const GLYPH_CACHE_LIMIT = 256;
const glyphDocuments = new WeakMap();

function glyphDocumentState(document) {
  if (!document) return null;
  let state = glyphDocuments.get(document);
  if (state) return state;
  state = { glyphs: new Map(), canvas: null, context: null };
  glyphDocuments.set(document, state);
  const clear = () => {
    state.glyphs.clear();
    state.canvas = null;
    state.context = null;
  };
  const fonts = document.fonts;
  if (fonts?.addEventListener) fonts.addEventListener('loadingdone', clear);
  if (fonts?.status === 'loading' && fonts.ready?.then) fonts.ready.then(clear, () => {});
  return state;
}

function rasterGlyph(document, state, font, size, glyph, magnify, side) {
  const key = `${font}\u0000${size}\u0000${glyph}\u0000${magnify}`;
  const cached = state.glyphs.get(key);
  if (cached) return cached;
  if (!state.canvas) {
    state.canvas = document.createElement('canvas');
    state.context = state.canvas.getContext('2d', { willReadFrequently: true });
    if (!state.context) {
      state.canvas = null;
      return null;
    }
  }
  const { canvas, context } = state;
  canvas.width = canvas.height = side * magnify;
  context.setTransform?.(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.scale(magnify, magnify);
  context.font = font;
  const origin = size * 2;
  context.fillText(glyph, origin, origin);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const ink = [];
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] >= 64) {
        ink.push([(x + .5) / magnify - origin, (y + .5) / magnify - origin]);
      }
    }
  }
  state.glyphs.set(key, ink);
  while (state.glyphs.size > GLYPH_CACHE_LIMIT) state.glyphs.delete(state.glyphs.keys().next().value);
  return ink;
}

export function measureSkillLabelInk(label, { centralBand = null, centerX = null } = {}) {
  if (!label?.getNumberOfChars) return null;
  const doc = label.ownerDocument;
  if (doc.fonts?.status === 'loading') return null;
  const win = doc.defaultView;
  const matrix = label.getScreenCTM();
  if (!matrix || !Number.isFinite(matrix.d)) return null;
  const style = win.getComputedStyle(label);
  const size = Number.parseFloat(style.fontSize);
  const cache = glyphDocumentState(doc);
  if (!cache) return null;
  const magnify = 4;
  const side = Math.ceil(size * 5);
  const font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
  const rect = label.getBoundingClientRect?.() ?? null;
  const center = centerX ?? (rect ? rect.left + rect.width / 2 : null);
  const band = centralBand == null ? null : centralBand;
  let inkTop = Infinity;
  let inkBottom = -Infinity;
  const text = label.textContent;
  for (let i = 0; i < label.getNumberOfChars(); i++) {
    const position = label.getStartPositionOfChar(i);
    const angle = label.getRotationOfChar(i) * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const ink = rasterGlyph(doc, cache, font, size, text[i], magnify, side);
    if (!ink) return null;
    for (const [gx, gy] of ink) {
      const sx = position.x + gx * cos - gy * sin;
      const sy = position.y + gx * sin + gy * cos;
      const vx = matrix.a * sx + matrix.c * sy + matrix.e;
      if (band != null && center != null && Math.abs(vx - center) > band) continue;
      const vy = matrix.b * sx + matrix.d * sy + matrix.f;
      inkTop = Math.min(inkTop, vy);
      inkBottom = Math.max(inkBottom, vy);
    }
  }
  if (!Number.isFinite(inkTop) || !Number.isFinite(inkBottom)) return null;
  if (label.dataset) {
    label.dataset.measuredInkTop = String(inkTop);
    label.dataset.measuredInkBottom = String(inkBottom);
  }
  return { top: inkTop, bottom: inkBottom, matrix };
}

export function alignSkillLabelInk(label, target, gap = 3) {
  if (!label?.getNumberOfChars || !target?.offsetHeight) return;
  const doc = label.ownerDocument;
  if (!target.getBoundingClientRect) return;
  const win = doc.defaultView;
  const rect = target.getBoundingClientRect();
  const measured = measureSkillLabelInk(label, { centralBand: rect.width * .15, centerX: rect.left + rect.width / 2 });
  if (!measured) return;
  const matrix = measured.matrix;
  const rim = win.getComputedStyle(target, '::before');
  const scale = rect.height / target.offsetHeight;
  // The unchanged 1254px bronze artwork's first opaque row is row 25.
  const ringTop = rect.top + (Number.parseFloat(rim.top) + Number.parseFloat(rim.height) * 25 / 1254) * scale;
  const delta = ringTop - gap - measured.bottom;
  const shift = Number(label.dataset.inkShift || 0) + delta / matrix.d;
  label.dataset.inkShift = String(shift);
  label.dataset.inkGap = String(gap);
  label.setAttribute('transform', `translate(0 ${shift})`);
}
