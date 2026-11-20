import { TOOLTIP_DELAY_MS } from '../../ui/tooltips.js';
/**
 * Portrait Positioning Tool
 * Handles interactive portrait adjustment functionality for character sheets.
 * Manages portrait interactions:
 *   - Double-click: open FilePicker to change portrait
 *   - Right-click: show zoom/move/reset adjustment controls
 */

const MAX_PORTRAIT_ZOOM = 10;

export class PortraitTool {
  constructor(actorSheet) {
    this.actorSheet = actorSheet;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.rotation = 0;
    this._timers = new Set();
    this._timerHosts = new Map();
    this._listeners = [];
    this._observers = new Set();
    this._tooltip = null;
    this._tooltipTimer = null;
    this._destroyed = false;
  }

  /**
   * Scopes a query to this sheet's own DOM instead of the whole document. With more than one
   * character sheet rendered at once (or a previous instance's DOM not yet torn down from a
   * re-render), an unscoped document.querySelector('.portrait-display') can silently bind the
   * dblclick handler to a different sheet's node — double-clicking the visible portrait then
   * does nothing, since the working listener is on a background sheet the user isn't looking at.
   */
  _sheetElement() {
    const element = this.actorSheet?.element;
    if (element?.nodeType === 1 || element?.nodeType === 9) return element;
    if (element?.[0]) return element[0];
    return globalThis.document;
  }

  _sheetDocument() {
    return this._sheetElement()?.ownerDocument ?? globalThis.document;
  }

  _sheetWindow() {
    return this._sheetDocument()?.defaultView ?? globalThis.window;
  }

  _query(selector) {
    return this._sheetElement()?.querySelector?.(selector) ?? null;
  }

  _listen(target, type, handler, options) {
    target?.addEventListener?.(type, handler, options);
    if (target) this._listeners.push(() => target.removeEventListener?.(type, handler, options));
  }

  /**
   * Initialize the portrait tool
   */
  initialize() {
    // Belt-and-suspenders: the sheet only calls initializeHandlers() when options.editable is
    // true (itself tied to actor ownership), but that gate lives one level up in
    // character-sheet.js — check ownership here too so upload/reposition stays owner-only (GMs
    // included, since isOwner is always true for them) even if that outer gate ever changes.
    if (!this.actorSheet?.actor?.isOwner) return;

    const timerHost = this._sheetWindow() ?? globalThis;
    const schedule = timerHost.setTimeout ?? globalThis.setTimeout;
    const timer = schedule.call(timerHost, () => {
      this._timers.delete(timer);
      this._timerHosts.delete(timer);
      if (this._destroyed) return;
      const portraitDisplay = this._query('.portrait-display');
      if (!portraitDisplay) return;

      this.setupTooltip(portraitDisplay);
      this.setupDblClickHandler(portraitDisplay);
      this.setupRightClickHandler(portraitDisplay);
      this.setupPortraitAdjustment();
      this.setupPortraitGestures(portraitDisplay);
    }, 500);
    this._timers.add(timer);
    this._timerHosts.set(timer, timerHost);
  }

  /**
   * Setup hover tooltip on the portrait
   */
  setupTooltip(portraitDisplay) {
    const doc = this._sheetDocument();
    let tooltip = this._tooltip;
    if (!tooltip) {
      tooltip = doc.createElement('div');
      tooltip.id = 'portrait-tooltip';
      tooltip.className = 'cs-tooltip cs-tooltip--portrait';
      // Bounding-client coordinates belong to the viewport. Keep the tooltip out of
      // the sheet's positioned/transformed ancestors (including popped-out sheets).
      tooltip.style.position = 'fixed';
      doc.body.appendChild(tooltip);
    }

    this._tooltip = tooltip;
    const onEnter = () => {
      const timerHost = this._sheetWindow() ?? globalThis;
      const previousHost = this._timerHosts.get(this._tooltipTimer) ?? timerHost;
      if (this._tooltipTimer) previousHost.clearTimeout?.(this._tooltipTimer);
      const schedule = timerHost.setTimeout ?? globalThis.setTimeout;
      const timer = schedule.call(timerHost, () => {
        this._timers.delete(timer);
        this._timerHosts.delete(timer);
        tooltip.textContent = 'Double-click to select portrait • Right-click to adjust, then drag to move or scroll to zoom';
        tooltip.style.opacity = '1';
        const rect = portraitDisplay.getBoundingClientRect();
        const tipRect = tooltip.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width / 2 - tipRect.width / 2) + 'px';
        tooltip.style.top = (rect.top - tipRect.height - 8) + 'px';
      }, TOOLTIP_DELAY_MS);
      this._tooltipTimer = timer;
      this._timers.add(timer);
      this._timerHosts.set(timer, timerHost);
    };

    const onLeave = () => {
      const timerHost = this._timerHosts.get(this._tooltipTimer) ?? this._sheetWindow() ?? globalThis;
      if (this._tooltipTimer) timerHost.clearTimeout?.(this._tooltipTimer);
      tooltip.style.opacity = '0';
    };
    this._listen(portraitDisplay, 'mouseenter', onEnter);
    this._listen(portraitDisplay, 'mouseleave', onLeave);
  }

  /**
   * Setup double-click handler to open FilePicker for portrait selection
   */
  setupDblClickHandler(portraitDisplay) {
    const handler = async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const applyPortrait = (path) => {
        const img = portraitDisplay.querySelector('.portrait-img, .cs-portrait-img');
        if (img) img.src = path;
        const input = this._sheetElement().querySelector('input[name="system.portrait"]');
        if (input) {
          input.value = path;
          const EventCtor = this._sheetWindow()?.Event ?? globalThis.Event;
          input.dispatchEvent(new EventCtor('change', { bubbles: true }));
        }
      };

      const canBrowse = game.user.can('FILES_BROWSE');

      if (canBrowse) {
        // GMs and users with browse permission: use the full FilePicker
        try {
          const fp = new FilePicker({
            type: 'image',
            current: this._sheetElement().querySelector('input[name="system.portrait"]')?.value || '',
            callback: applyPortrait,
          });
          fp.render(true);
        } catch (err) {
          ui.notifications?.error('Failed to open file picker for portrait selection.');
        }
      } else {
        // Players without browse permission: upload via a hidden file input
        const fileInput = this._sheetDocument().createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files[0];
          if (!file) return;
          try {
            const response = await FilePicker.upload('data', 'portraits', file, {});
            if (response?.path) applyPortrait(response.path);
          } catch (err) {
            ui.notifications?.error('Failed to upload portrait image.');
          }
        });
        fileInput.click();
      }
    };
    this._listen(portraitDisplay, 'dblclick', handler);
  }

  /**
   * Setup right-click handler to show portrait adjustment controls
   * Plain right-click shows the adjustment controls.
   */
  setupRightClickHandler(portraitDisplay) {
    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();

      const controls = this._query('#portrait-controls');
      const container = this._query('#portrait-container');

      if (controls) {
        controls.style.display = 'block';

        const MutationObserverCtor = this._sheetWindow()?.MutationObserver ?? globalThis.MutationObserver;
        const observer = new MutationObserverCtor(() => {});
        observer.observe(controls, { attributes: true, attributeFilter: ['style'] });
        controls._observer = observer;
        this._observers.add(observer);
      }

      if (container) container.classList.add('adjusting');
    };
    this._listen(portraitDisplay, 'contextmenu', handler);
  }

  /**
   * Setup portrait adjustment functionality (zoom/move/reset button panel)
   */
  setupPortraitAdjustment() {
    const controls = this._query('#portrait-controls');
    const container = this._query('#portrait-container');

    if (!controls || !container) return;

    // Read current values from CSS variables
    const getStyle = this._sheetWindow()?.getComputedStyle ?? globalThis.getComputedStyle;
    this.scale = parseFloat(getStyle(container).getPropertyValue('--user-portrait-scale')) || 1;
    this.x = parseFloat(getStyle(container).getPropertyValue('--user-portrait-x')) || 0;
    this.y = parseFloat(getStyle(container).getPropertyValue('--user-portrait-y')) || 0;
    this.rotation = this._normalizeRotation(parseFloat(getStyle(container).getPropertyValue('--user-portrait-rotation')) || 0);

    this.updateZoomReadout();

    const buttons = controls.querySelectorAll('button');
    buttons.forEach((button) => {
      ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'].forEach(eventType => {
        this._listen(button, eventType, (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          if (eventType !== 'click') return;
          this.handleButtonAction(button.dataset.action, event, controls, container);
        }, true);
      });
    });
  }

  /** Direct manipulation is active only while the portrait adjustment toolbar is open. */
  setupPortraitGestures(display) {
    const container = this._query('#portrait-container');
    if (!container) return;
    let drag = null;
    const finish = () => {
      const pointer = drag;
      drag = null;
      if (pointer && display.hasPointerCapture?.(pointer.id)) display.releasePointerCapture(pointer.id);
      display.classList.remove('portrait-dragging');
    };
    this._listeners.push(finish);
    this._listen(display, 'dragstart', event => event.preventDefault());
    this._listen(display, 'pointerdown', event => {
      if (event.button !== 0 || !container.classList.contains('adjusting')) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = container.getBoundingClientRect();
      // The sheet scales the frame, and the image transform scales its translation.
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
        startX: this.x, startY: this.y,
        factorX: (rect.width / container.offsetWidth || 1) * this.scale,
        factorY: (rect.height / container.offsetHeight || 1) * this.scale };
      display.setPointerCapture?.(event.pointerId);
      display.classList.add('portrait-dragging');
    });
    this._listen(display, 'pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      event.preventDefault();
      event.stopPropagation();
      this.x = drag.startX + (event.clientX - drag.x) / drag.factorX;
      this.y = drag.startY + (event.clientY - drag.y) / drag.factorY;
      this.updatePortrait(container);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this._listen(display, type, event => {
        if (drag?.id === event.pointerId) finish();
      });
    }
    this._listen(display, 'wheel', event => {
      if (!container.classList.contains('adjusting') || !event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      finish();
      this.scale = Math.max(0.5, Math.min(MAX_PORTRAIT_ZOOM, this.scale + (event.deltaY < 0 ? 0.1 : -0.1)));
      this.updatePortrait(container);
    }, { passive: false });
  }

  /**
   * Handle button action clicks
   */
  handleButtonAction(action, event, controls, container) {
    let scaleStep = 0.1;
    let moveStep = 1;

    if (event.shiftKey && event.ctrlKey) {
      scaleStep = 0.01;
      moveStep = 0.5;
    } else if (event.shiftKey) {
      scaleStep = 0.02;
      moveStep = 5;
    } else if (event.ctrlKey) {
      scaleStep = 0.25;
      moveStep = 10;
    }
    const rotationStep = event.shiftKey ? 5 : event.ctrlKey ? 15 : 1;

    switch (action) {
      case 'zoom-in':
        this.scale = Math.min(this.scale + scaleStep, MAX_PORTRAIT_ZOOM);
        this.updatePortrait(container);
        break;
      case 'zoom-out':
        this.scale = Math.max(this.scale - scaleStep, 0.5);
        this.updatePortrait(container);
        break;
      case 'move-up':
        this.y -= moveStep;
        this.updatePortrait(container);
        break;
      case 'move-down':
        this.y += moveStep;
        this.updatePortrait(container);
        break;
      case 'move-left':
        this.x -= moveStep;
        this.updatePortrait(container);
        break;
      case 'move-right':
        this.x += moveStep;
        this.updatePortrait(container);
        break;
      case 'rotate-left':
        this.rotation = this._normalizeRotation(this.rotation - rotationStep);
        this.updatePortrait(container);
        break;
      case 'rotate-right':
        this.rotation = this._normalizeRotation(this.rotation + rotationStep);
        this.updatePortrait(container);
        break;
      case 'reset':
        this.scale = 1;
        this.x = 0;
        this.y = 0;
        this.rotation = 0;
        this.updatePortrait(container);
        break;
      case 'done':
        this.handleDone(controls, container);
        break;
    }
  }

  /**
   * Update portrait CSS variables and hidden form inputs
   */
  updateZoomReadout() {
    const readout = this._query('[data-portrait-zoom]');
    if (readout) readout.textContent = `${Number(this.scale.toFixed(2))}×`;
  }

  updatePortrait(container) {
    this.updateZoomReadout();
    container.style.setProperty('--user-portrait-scale', this.scale);
    container.style.setProperty('--user-portrait-x', this.x + 'px');
    container.style.setProperty('--user-portrait-y', this.y + 'px');
    container.style.setProperty('--user-portrait-rotation', this.rotation + 'deg');

    const scaleInput = this._query('input[name="system.userPortrait.scale"]');
    const xInput = this._query('input[name="system.userPortrait.x"]');
    const yInput = this._query('input[name="system.userPortrait.y"]');
    const rotationInput = this._query('input[name="system.userPortrait.rotation"]');
    if (scaleInput) scaleInput.value = this.scale;
    if (xInput) xInput.value = this.x;
    if (yInput) yInput.value = this.y;
    if (rotationInput) rotationInput.value = this.rotation;
  }

  _normalizeRotation(value) {
    return ((Number(value) % 360) + 360) % 360;
  }

  /**
   * Handle the Done button — save and hide the control panel
   */
  handleDone(controls, container) {
    const win = this._sheetWindow() ?? globalThis;
    if (win.pauseXPMonitoring) win.pauseXPMonitoring();
    win.isFormSubmitting = true;

    this.savePortraitData();

    const schedule = win.setTimeout ?? globalThis.setTimeout;
    const timer = schedule.call(win, () => {
      this._timers.delete(timer);
      this._timerHosts.delete(timer);
      win.isFormSubmitting = false;
      if (win.resumeXPMonitoring) win.resumeXPMonitoring();
      const xpField = this._query('#xp-display');
      if (xpField?.value && !xpField.value.includes(',')) {
        const n = parseInt(xpField.value) || 0;
        if (n >= 1000) xpField.value = n.toLocaleString();
      }
    }, 2000);
    this._timers.add(timer);
    this._timerHosts.set(timer, win);

    if (controls._observer) {
      controls._observer.disconnect();
      this._observers.delete(controls._observer);
      controls._observer = null;
    }
    controls.style.display = 'none';
    container.classList.remove('adjusting');
  }

  /**
   * Save portrait position data to the actor
   */
  savePortraitData() {
    // Clean XP field before save
    const xpField = this._query('#xp-display');
    if (xpField?.value) xpField.value = xpField.value.replace(/,/g, '');

    const updateData = {
      'system.userPortrait.scale': this.scale,
      'system.userPortrait.x': this.x,
      'system.userPortrait.y': this.y,
      'system.userPortrait.rotation': this.rotation
    };

    const syncHiddenInputs = () => {
      const s = this._query('input[name="system.userPortrait.scale"]');
      const x = this._query('input[name="system.userPortrait.x"]');
      const y = this._query('input[name="system.userPortrait.y"]');
      const rotation = this._query('input[name="system.userPortrait.rotation"]');
      if (s) { s.value = this.scale; s.setAttribute('value', this.scale); }
      if (x) { x.value = this.x; x.setAttribute('value', this.x); }
      if (y) { y.value = this.y; y.setAttribute('value', this.y); }
      if (rotation) { rotation.value = this.rotation; rotation.setAttribute('value', this.rotation); }
    };

    const actor = this.actorSheet?.actor;
    if (actor) {
      return actor.update(updateData, { render: false })
        .then(() => syncHiddenInputs())
        .catch(err => console.error('Portrait save failed:', err));
    }

    // Fallback: sync inputs and fire form change
    console.warn('Portrait save: no actor reference, using form fallback');
    syncHiddenInputs();
    const form = this._query('form.flexcol') ?? this._query('form');
    const EventCtor = this._sheetWindow()?.Event ?? globalThis.Event;
    form?.dispatchEvent(new EventCtor('submit', { bubbles: true, cancelable: true }));
  }

  destroy() {
    this._destroyed = true;
    if (this._tooltipTimer) (this._timerHosts.get(this._tooltipTimer) ?? this._sheetWindow() ?? globalThis).clearTimeout?.(this._tooltipTimer);
    for (const timer of this._timers) this._timerHosts.get(timer)?.clearTimeout?.(timer);
    this._timers.clear();
    this._timerHosts.clear();
    this._listeners.splice(0).forEach(remove => remove());
    this._observers.forEach(observer => observer.disconnect?.());
    this._observers.clear();
    this._tooltipTimer = null;
    this._tooltip?.remove?.();
    this._tooltip = null;
  }
}
