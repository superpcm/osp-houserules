import { currentCalendarLabel } from './calendar-authority.js';
import { openCalendar } from '../apps/calendar-app.js';
let initialized = false;

function makeClockMovable(button) {
  const storageKey = `osp-calendar-position:${game.world?.id || 'world'}:${game.user?.id || 'user'}`;
  let positioned = false, drag = null, suppressClick = false;
  const place = (x, y) => {
    const rect = button.getBoundingClientRect();
    const left = Math.max(0, Math.min(x, window.innerWidth - rect.width));
    const top = Math.max(0, Math.min(y, window.innerHeight - rect.height));
    Object.assign(button.style, { left: `${left}px`, top: `${top}px`, bottom: 'auto', transform: 'none' });
    positioned = true;
    return { left, top };
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) place(saved.left, saved.top);
  } catch { /* Position persistence is optional when browser storage is unavailable. */ }
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = button.getBoundingClientRect();
    suppressClick = false;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    button.classList.add('is-dragging');
    place(drag.left + dx, drag.top + dy);
  });
  const finish = event => {
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation();
    suppressClick = drag.moved;
    if (drag.moved) {
      const rect = button.getBoundingClientRect();
      try { localStorage.setItem(storageKey, JSON.stringify({ left: rect.left, top: rect.top })); } catch { /* Keep dragging usable without storage. */ }
    }
    drag = null;
    button.classList.remove('is-dragging');
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };
  button.addEventListener('pointerup', finish);
  button.addEventListener('pointercancel', finish);
  button.addEventListener('lostpointercapture', finish);
  button.addEventListener('click', event => {
    if (suppressClick && event.detail !== 0) { suppressClick = false; return; }
    openCalendar();
  });
  window.addEventListener('resize', () => {
    if (!positioned) return;
    const rect = button.getBoundingClientRect();
    place(rect.left, rect.top);
  });
}
/** A lightweight, always-visible clock; it has no DM-only data or editing controls. */
export function initializeCalendarDisplay() {
  if (initialized) return; initialized = true;
  const mount = () => {
    if (!document.body || document.getElementById('osp-campaign-clock')) return;
    const button = document.createElement('button');
    button.id = 'osp-campaign-clock'; button.type = 'button'; button.className = 'osp-persistent-clock';
    button.setAttribute('aria-label', 'Open campaign calendar'); button.title = 'Click to open calendar · Drag to move';
    const icon = document.createElement('i'); icon.className = 'fas fa-calendar-alt'; icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.setAttribute('aria-live', 'polite'); label.textContent = currentCalendarLabel();
    button.append(icon, label); document.body.append(button); makeClockMovable(button);
  };
  const refresh = () => { mount(); const label = document.querySelector('#osp-campaign-clock span'); if (label) label.textContent = currentCalendarLabel(); };
  Hooks.on('ospCalendarTimeChanged', refresh);
  Hooks.on('renderSidebar', refresh);
  refresh();
}
