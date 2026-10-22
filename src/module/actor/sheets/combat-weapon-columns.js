const GRID_VARIABLE = '--ej-combat-weapon-columns';
const FIXED = Object.freeze({ roll: 24, image: 48, controls: 88 });
const MINIMUMS = Object.freeze([58, 30, 28, 30, 30, 74, 34]);
const DEFAULT_FONT = 'normal 400 16px handwritten';

const combatRoot = root => root?.querySelector?.('.tab[data-tab="combat"]');

function textOf(node) {
  return String(node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Measure visible text ink, retaining a safe fallback for jsdom and older canvas APIs. */
export function measureWeaponNameInk(context, text) {
  if (!context?.measureText) return text.length * 8;
  const metrics = context.measureText(text);
  const left = metrics.actualBoundingBoxLeft ?? 0;
  const right = metrics.actualBoundingBoxRight ?? metrics.width ?? 0;
  return Math.max(0, left + right || metrics.width || 0);
}

/** Pure bounded solver for the eleven combat weapon tracks. */
export function solveCombatWeaponColumns({ availableWidth, nameInk = 0, valueWidths = [], gap = 5 } = {}) {
  if (!(Number.isFinite(availableWidth) && availableWidth > 0)) return null;
  const compact = availableWidth < 210;
  const trackScale = compact ? Math.min(1, availableWidth / 210) : 1;
  const fixedTracks = compact
    ? { roll: Math.max(16, FIXED.roll * trackScale), image: Math.max(24, FIXED.image * trackScale), controls: Math.max(36, FIXED.controls * trackScale) }
    : FIXED;
  const actualGap = compact ? Math.min(gap, 1) : gap;
  const gaps = actualGap * 10;
  const fixed = fixedTracks.roll + fixedTracks.image + fixedTracks.controls;
  const minimumName = Math.max(72, nameInk + 12) + 15;
  const attrMinimums = MINIMUMS.map((minimum, index) => Math.max(minimum, Number(valueWidths[index]) || 0));
  const attrsMinimum = attrMinimums.reduce((sum, width) => sum + width, 0);
  const budget = Math.max(0, availableWidth - fixed - gaps);
  if (budget <= 0) return [fixedTracks.roll, fixedTracks.image, 0, ...attrMinimums.map(() => 0), fixedTracks.controls];
  const scale = attrsMinimum > budget ? (budget * .84) / attrsMinimum : 1;
  const boundedMinimums = attrMinimums.map(width => width * scale);
  const boundedAttrsMinimum = boundedMinimums.reduce((sum, width) => sum + width, 0);
  const name = Math.min(minimumName, Math.max(0, budget - boundedAttrsMinimum));
  const extra = Math.max(0, budget - name - boundedAttrsMinimum);
  const weights = [1.35, .8, .75, .8, .8, 1.5, .8];
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const attrs = boundedMinimums.map((width, index) => width + extra * weights[index] / weightTotal);
  return [fixedTracks.roll, fixedTracks.image, name, ...attrs, fixedTracks.controls]
    .map(value => Math.round(value * 100) / 100);
}

function computedFont(window, element) {
  const style = window?.getComputedStyle?.(element);
  if (!style) return DEFAULT_FONT;
  return `${style.fontStyle || 'normal'} ${style.fontWeight || '400'} ${style.fontSize || '16px'} ${style.fontFamily || 'handwritten'}`;
}

function getAvailableWidth(combat) {
  const table = combat?.querySelector?.('.weapons-title') ?? combat?.querySelector?.('.weapon-header');
  const width = table?.clientWidth || table?.getBoundingClientRect?.().width;
  const style = table && combat?.ownerDocument?.defaultView?.getComputedStyle?.(table);
  const padding = (Number.parseFloat(style?.paddingLeft) || 0) + (Number.parseFloat(style?.paddingRight) || 0);
  return Number.isFinite(width) && width > 0 ? Math.max(0, width - padding) : 698;
}

/** Attach measured CSS grid sizing to combat weapon rows and their shared header. */
export function activateWeaponColumnSizing(root) {
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
  const rows = () => [...combat.querySelectorAll('.item-header.weapon-header')];
  const restore = new Map();
  const update = () => {
    if (!active) return;
    const rowList = rows();
    const names = rowList.map(row => row.querySelector('.item-name')).filter(Boolean);
    if (!names.length) return;
    const font = computedFont(window, names[0]);
    context.font = font;
    const nameInk = Math.max(...names.map(name => measureWeaponNameInk(context, textOf(name))), 0);
    const header = combat.querySelector('.weapons-title');
    const values = Array.from({ length: 7 }, (_, index) => Math.max(0, ...[
      ...(header?.children ? [header.children[index + 1]] : []),
      ...rowList.map(row => row.children[index + 3])
    ].map(value => {
      context.font = computedFont(window, value || names[0]);
      return measureWeaponNameInk(context, textOf(value)) + 12;
    })));
    const columns = solveCombatWeaponColumns({ availableWidth: getAvailableWidth(combat), nameInk, valueWidths: values });
    if (!columns) return;
    const value = columns.map(width => `${width}px`).join(' ');
    const targets = [...rowList, combat.querySelector('.weapons-title')].filter(Boolean);
    targets.forEach(target => {
      if (!restore.has(target)) restore.set(target, {
        grid: target.style.getPropertyValue(GRID_VARIABLE),
        gap: target.style.getPropertyValue('--ej-combat-weapon-gap')
      });
      target.style.setProperty(GRID_VARIABLE, value);
      target.style.setProperty('--ej-combat-weapon-gap', `${getAvailableWidth(combat) < 210 ? 1 : 5}px`);
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
  const fontsReady = window?.document?.fonts?.ready;
  fontsReady?.then?.(() => { if (active) schedule(); });
  return () => {
    active = false;
    if (frame !== null) cancelFrame(frame);
    frame = null;
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    tabLink?.removeEventListener?.('click', schedule);
    for (const [target, previous] of restore) {
      if (previous.grid) target.style.setProperty(GRID_VARIABLE, previous.grid);
      else target.style.removeProperty(GRID_VARIABLE);
      if (previous.gap) target.style.setProperty('--ej-combat-weapon-gap', previous.gap);
      else target.style.removeProperty('--ej-combat-weapon-gap');
    }
    restore.clear();
  };
}

