import { activateWeaponColumnSizing } from './combat-weapon-columns.js';
import { activateArmorColumnSizing } from './combat-armor-columns.js';

const SVG_FONT_SIZE = 100;

function inkBounds(metrics) {
  const left = metrics.actualBoundingBoxLeft ?? 0;
  const right = metrics.actualBoundingBoxRight ?? metrics.width;
  const ascent = metrics.actualBoundingBoxAscent ?? 70;
  const descent = metrics.actualBoundingBoxDescent ?? 0;
  return { width: left + right, height: ascent + descent };
}

/** Approved BR-19: visible ink targets 38% of frame height, capped at 70% width. */
export function combatNumeralGeometry(metrics, digitMetrics, frameWidth, frameHeight) {
  const value = inkBounds(metrics);
  const references = [...digitMetrics.map(inkBounds), value];
  const maxWidth = Math.max(...references.map(box => box.width));
  const maxHeight = Math.max(...references.map(box => box.height));
  if (!(Number.isFinite(frameWidth) && Number.isFinite(frameHeight) && frameWidth > 0 && frameHeight > 0 && maxWidth > 0 && maxHeight > 0)) return null;
  const targetHeight = frameHeight * .76 * .50;
  const targetWidth = frameWidth * .70;
  const scale = Math.min(targetHeight / maxHeight, targetWidth / maxWidth);
  if (!(scale > 0 && Number.isFinite(scale))) return null;
  return { fontSize: SVG_FONT_SIZE * scale, inkWidth: value.width * scale, inkHeight: value.height * scale };
}

const VALUE_SELECTOR = '.tab[data-tab="combat"] .combat-hpac-image :is(.cs-unarmored-box, .cs-combat-input)';

/** Keep native combat inputs editable while sizing their visible ink responsively. */
export function activateCombatValueSizing(root) {
  if (!root?.querySelectorAll || !root.querySelector) return () => {};
  const weaponDispose = activateWeaponColumnSizing(root);
  const armorDispose = activateArmorColumnSizing(root);
  const document = root.ownerDocument ?? globalThis.document;
  const window = document?.defaultView ?? globalThis.window;
  let context;
  try { context = document?.createElement('canvas')?.getContext('2d'); } catch { context = null; }
  if (!context) return () => { weaponDispose(); armorDispose(); };
  let active = true;
  let frame = null;
  const requestFrame = window?.requestAnimationFrame?.bind(window)
    ?? globalThis.requestAnimationFrame?.bind(globalThis)
    ?? (callback => setTimeout(callback, 0));
  const cancelFrame = window?.cancelAnimationFrame?.bind(window)
    ?? globalThis.cancelAnimationFrame?.bind(globalThis)
    ?? clearTimeout;
  const values = () => [...root.querySelectorAll(VALUE_SELECTOR)];
  const update = () => {
    if (!active) return;
    for (const value of values()) {
      const frame = value.closest('.combat-stat');
      const rect = frame?.getBoundingClientRect();
      if (!(Number.isFinite(rect?.width) && rect.width > 0 && Number.isFinite(rect?.height) && rect.height > 0)) continue;
      const style = window?.getComputedStyle?.(value) ?? { fontStyle: 'normal', fontWeight: '400', fontFamily: 'handwritten' };
      context.font = `${style.fontStyle} ${style.fontWeight} 100px ${style.fontFamily}`;
      const text = 'value' in value ? value.value : value.textContent.trim();
      const geometry = combatNumeralGeometry(context.measureText(text), Array.from('0123456789', digit => context.measureText(digit)), rect.width, rect.height);
      if (geometry) value.style.setProperty('--ej-combat-value-font-size', `${geometry.fontSize}px`);
    }
  };
  const scheduleUpdate = () => {
    if (!active || frame !== null) return;
    frame = requestFrame(() => { frame = null; update(); });
  };
  const inputs = values().filter(value => 'value' in value);
  inputs.forEach(input => input.addEventListener('input', scheduleUpdate));
  const combatTab = root.querySelector('.tab[data-tab="combat"]');
  const ResizeObserverCtor = window?.ResizeObserver ?? globalThis.ResizeObserver;
  const resizeObserver = ResizeObserverCtor && combatTab ? new ResizeObserverCtor(scheduleUpdate) : null;
  resizeObserver?.observe(combatTab);
  const tabLink = root.querySelector('.sheet-tabs a[data-tab="combat"]');
  tabLink?.addEventListener('click', scheduleUpdate);
  update();
  window?.document?.fonts?.ready?.then(() => { if (active) update(); });
  return () => {
    weaponDispose();
    armorDispose();
    active = false;
    if (frame !== null) cancelFrame(frame);
    frame = null;
    resizeObserver?.disconnect();
    inputs.forEach(input => input.removeEventListener('input', scheduleUpdate));
    tabLink?.removeEventListener('click', scheduleUpdate);
  };
}
