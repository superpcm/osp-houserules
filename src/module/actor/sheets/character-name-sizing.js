const MAX_FONT_SIZE = 60;
const MIN_FONT_SIZE = 1;
const SAFETY = 4;

function inkWidth(context, text, letterSpacing = 0) {
  const metrics = context.measureText(text);
  const left = metrics.actualBoundingBoxLeft ?? 0;
  const right = metrics.actualBoundingBoxRight ?? metrics.width;
  return Math.max(metrics.width ?? 0, left + right) + Math.max(0, text.length - 1) * letterSpacing;
}

export function fitCharacterNameInput(input, windowObject = input?.ownerDocument?.defaultView ?? globalThis.window) {
  if (!input?.ownerDocument?.createElement || !input.clientWidth) return null;
  const context = input.ownerDocument.createElement('canvas')?.getContext?.('2d');
  if (!context) return null;
  const style = windowObject?.getComputedStyle?.(input) ?? {};
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const available = Math.max(1, input.clientWidth - padding - SAFETY);
  const text = String(input.value ?? input.textContent ?? '');
  const family = style.fontFamily || 'Handwritten, Georgia, serif';
  const weight = style.fontWeight || '400';
  const fontStyle = style.fontStyle || 'normal';
  const letterSpacing = parseFloat(style.letterSpacing) || 0;
  let low = MIN_FONT_SIZE, high = MAX_FONT_SIZE;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    context.font = `${fontStyle} ${weight} ${mid}px ${family}`;
    if (inkWidth(context, text, letterSpacing) <= available) low = mid;
    else high = mid - 1;
  }
  input.style.setProperty('--character-name-font-size', `${Math.max(MIN_FONT_SIZE, low)}px`);
  return low;
}

export function activateCharacterNameSizing(root) {
  const input = root?.querySelector?.('#char-name');
  if (!input) return () => {};
  const document = root.ownerDocument ?? input.ownerDocument;
  const windowObject = document?.defaultView ?? globalThis.window;
  let active = true;
  let frame = null;
  const requestFrame = windowObject?.requestAnimationFrame?.bind(windowObject) ?? (callback => setTimeout(callback, 0));
  const cancelFrame = windowObject?.cancelAnimationFrame?.bind(windowObject) ?? clearTimeout;
  const update = () => { frame = null; if (active) fitCharacterNameInput(input, windowObject); };
  const schedule = () => { if (active && frame === null) frame = requestFrame(update); };
  const resizeObserver = windowObject?.ResizeObserver ? new windowObject.ResizeObserver(schedule) : null;
  resizeObserver?.observe(input);
  input.addEventListener('input', schedule); input.addEventListener('change', schedule);
  root.querySelector('.sheet-tabs a[data-tab="bio"]')?.addEventListener('click', schedule);
  windowObject?.addEventListener('resize', schedule);
  document?.fonts?.ready?.then(() => { if (active) schedule(); });
  document?.fonts?.addEventListener?.('loadingdone', schedule);
  schedule();
  return () => {
    active = false; if (frame !== null) cancelFrame(frame); frame = null;
    resizeObserver?.disconnect(); input.removeEventListener('input', schedule); input.removeEventListener('change', schedule);
    root.querySelector('.sheet-tabs a[data-tab="bio"]')?.removeEventListener('click', schedule);
    windowObject?.removeEventListener('resize', schedule); document?.fonts?.removeEventListener?.('loadingdone', schedule);
  };
}
