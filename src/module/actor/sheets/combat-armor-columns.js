import { measureWeaponNameInk } from './combat-weapon-columns.js';

const GRID_VARIABLE = '--ej-combat-armor-columns';
const GAP_VARIABLE = '--ej-combat-armor-gap';
const FIXED = Object.freeze({ image: 48, controls: 88 });
const MINIMUMS = Object.freeze([48, 32, 60, 60, 52, 52, 38]);
const DEFAULT_FONT = 'normal 400 16px handwritten';
const combatRoot = root => root?.querySelector?.('.tab[data-tab="combat"]');
const textOf = node => String(node?.textContent ?? '').replace(/\s+/g, ' ').trim();

export function solveCombatArmorColumns({ availableWidth, nameInk = 0, valueWidths = [], gap = 5 } = {}) {
  if (!(Number.isFinite(availableWidth) && availableWidth > 0)) return null;
  const compact = availableWidth < 260;
  const scale = compact ? Math.min(1, availableWidth / 260) : 1;
  const image = Math.max(24, FIXED.image * scale);
  const controls = Math.max(42, FIXED.controls * scale);
  const actualGap = compact ? Math.min(gap, 1) : gap;
  const budget = Math.max(0, availableWidth - image - controls - actualGap * 9);
  const mins = MINIMUMS.map((minimum, index) => Math.max(minimum, Number(valueWidths[index]) || 0));
  const minsTotal = mins.reduce((sum, value) => sum + value, 0);
  const minimums = mins.map(width => width * (minsTotal > budget ? (budget * .84) / minsTotal : 1));
  const minimumAttrs = minimums.reduce((sum, width) => sum + width, 0);
  const name = Math.min(Math.max(72, nameInk + 12) + 15, Math.max(0, budget - minimumAttrs));
  const extra = Math.max(0, budget - name - minimumAttrs);
  const weights = [1, .75, 1.25, 1.15, 1.1, 1.1, .8];
  const total = weights.reduce((sum, value) => sum + value, 0);
  const columns = [image, name, ...minimums.map((width, index) => width + extra * weights[index] / total), controls]
    .map(width => Math.round(width * 100) / 100);
  const overflow = columns.reduce((sum, width) => sum + width, 0) + actualGap * 9 - availableWidth;
  if (overflow > 0) columns[8] = Math.max(0, Math.round((columns[8] - overflow) * 100) / 100);
  return columns;
}

function computedFont(window, element) {
  const style = window?.getComputedStyle?.(element);
  if (!style) return DEFAULT_FONT;
  return `${style.fontStyle || 'normal'} ${style.fontWeight || '400'} ${style.fontSize || '16px'} ${style.fontFamily || 'handwritten'}`;
}

function getAvailableWidth(combat) {
  const table = combat?.querySelector?.('.armor-title') ?? combat?.querySelector?.('.armor-header');
  const width = table?.clientWidth || table?.getBoundingClientRect?.().width;
  const style = table && combat?.ownerDocument?.defaultView?.getComputedStyle?.(table);
  const padding = (Number.parseFloat(style?.paddingLeft) || 0) + (Number.parseFloat(style?.paddingRight) || 0);
  return Number.isFinite(width) && width > 0 ? Math.max(0, width - padding) : 698;
}

export function activateArmorColumnSizing(root) {
  if (!root?.querySelectorAll || !root.querySelector) return () => {};
  const combat = combatRoot(root);
  if (!combat?.querySelectorAll || !combat?.querySelector) return () => {};
  const document = root.ownerDocument ?? globalThis.document;
  const window = document?.defaultView ?? globalThis.window;
  let context;
  try { context = document?.createElement?.('canvas')?.getContext?.('2d'); } catch { context = null; }
  if (!context) return () => {};
  let active = true;
  let frame = null;
  const requestFrame = window?.requestAnimationFrame?.bind(window) ?? globalThis.requestAnimationFrame?.bind(globalThis) ?? (callback => setTimeout(callback, 0));
  const cancelFrame = window?.cancelAnimationFrame?.bind(window) ?? globalThis.cancelAnimationFrame?.bind(globalThis) ?? clearTimeout;
  const rows = () => [...combat.querySelectorAll('.item-header.armor-header')];
  const restore = new Map();
  const update = () => {
    if (!active) return;
    const rowList = rows();
    const names = rowList.map(row => row.querySelector('.item-name')).filter(Boolean);
    if (!names.length) return;
    context.font = computedFont(window, names[0]);
    const nameInk = Math.max(...names.map(name => measureWeaponNameInk(context, textOf(name))), 0);
    const header = combat.querySelector('.armor-title');
    const values = Array.from({ length: 7 }, (_, index) => Math.max(0, ...[
      ...(header?.children ? [header.children[index + 2]] : []),
      ...rowList.map(row => row.children[index + 2])
    ].map(value => {
      context.font = computedFont(window, value || names[0]);
      return measureWeaponNameInk(context, textOf(value)) + 12;
    })));
    const columns = solveCombatArmorColumns({ availableWidth: getAvailableWidth(combat), nameInk, valueWidths: values });
    if (!columns) return;
    const value = columns.map(width => `${width}px`).join(' ');
    const targets = [...rowList, header].filter(Boolean);
    targets.forEach(target => {
      if (!restore.has(target)) restore.set(target, { grid: target.style.getPropertyValue(GRID_VARIABLE), gap: target.style.getPropertyValue(GAP_VARIABLE) });
      target.style.setProperty(GRID_VARIABLE, value);
      target.style.setProperty(GAP_VARIABLE, `${getAvailableWidth(combat) < 260 ? 1 : 5}px`);
    });
  };
  const schedule = () => {
    if (!active || frame !== null) return;
    frame = requestFrame(() => { frame = null; update(); });
  };
  const ResizeObserverCtor = window?.ResizeObserver ?? globalThis.ResizeObserver;
  const resizeObserver = ResizeObserverCtor ? new ResizeObserverCtor(schedule) : null;
  resizeObserver?.observe(combat);
  const MutationObserverCtor = window?.MutationObserver ?? globalThis.MutationObserver;
  const mutationObserver = MutationObserverCtor ? new MutationObserverCtor(schedule) : null;
  mutationObserver?.observe(combat, { childList: true, characterData: true, subtree: true });
  const tabLink = root.querySelector('.sheet-tabs a[data-tab="combat"]');
  tabLink?.addEventListener?.('click', schedule);
  update();
  window?.document?.fonts?.ready?.then?.(() => { if (active) schedule(); });
  return () => {
    active = false;
    if (frame !== null) cancelFrame(frame);
    frame = null;
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    tabLink?.removeEventListener?.('click', schedule);
    for (const [target, previous] of restore) {
      if (previous.grid) target.style.setProperty(GRID_VARIABLE, previous.grid); else target.style.removeProperty(GRID_VARIABLE);
      if (previous.gap) target.style.setProperty(GAP_VARIABLE, previous.gap); else target.style.removeProperty(GAP_VARIABLE);
    }
    restore.clear();
  };
}
