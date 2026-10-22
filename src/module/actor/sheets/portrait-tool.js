/**
 * Portrait Positioning Tool
 * Handles interactive portrait adjustment functionality for character sheets.
 * Manages all 3 portrait interactions:
 *   - Double-click: open FilePicker to change portrait
 *   - Right-click (no modifier): position tool pass-through
 *   - Ctrl/Alt+Right-click: show zoom/move/reset adjustment controls
 *     (not Shift — Firefox always forces its native context menu on Shift+right-click,
 *     ignoring contextmenu's preventDefault(), so that combo can never open our panel there)
 */

export class PortraitTool {
  constructor(actorSheet) {
    this.actorSheet = actorSheet;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
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
    }, 500);
    this._timers.add(timer);
    this._timerHosts.set(timer, timerHost);
  }

  /**
   * Setup hover tooltip on the portrait
   */
  setupTooltip(portraitDisplay) {
    const root = this._sheetElement();
    const doc = this._sheetDocument();
    let tooltip = root?.querySelector?.('#portrait-tooltip');
    if (!tooltip) {
      tooltip = doc.createElement('div');
      tooltip.id = 'portrait-tooltip';
      tooltip.className = 'cs-tooltip cs-tooltip--portrait';
      root?.appendChild?.(tooltip);
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
        tooltip.textContent = 'Double-click to select portrait • Ctrl+Right-click to adjust position';
        tooltip.style.opacity = '1';
        const rect = portraitDisplay.getBoundingClientRect();
        const tipRect = tooltip.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width / 2 - tipRect.width / 2) + 'px';
        tooltip.style.top = (rect.top - tipRect.height - 8) + 'px';
      }, 500);
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
   * Plain right-click passes through; Ctrl/Alt+right-click shows controls.
   * Deliberately excludes Shift: Firefox always forces its native context menu on
   * Shift+right-click and ignores contextmenu's preventDefault(), so a Shift-based trigger
   * can never actually open our panel there.
   */
  setupRightClickHandler(portraitDisplay) {
    const handler = (event) => {
      // Plain right-click: pass through (no action)
      if (!event.ctrlKey && !event.altKey) return;

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

  /**
   * Handle button action clicks
   */
  handleButtonAction(action, event, controls, container) {
    let scaleStep = 0.1;
    let moveStep = 3;

    if (event.shiftKey && event.ctrlKey) {
      scaleStep = 0.01;
      moveStep = 0.5;
    } else if (event.shiftKey) {
      scaleStep = 0.02;
      moveStep = 1;
    } else if (event.ctrlKey) {
      scaleStep = 0.25;
      moveStep = 10;
    }

    switch (action) {
      case 'zoom-in':
        this.scale = Math.min(this.scale + scaleStep, 2.5);
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
      case 'reset':
        this.scale = 1;
        this.x = 0;
        this.y = 0;
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
  updatePortrait(container) {
    container.style.setProperty('--user-portrait-scale', this.scale);
    container.style.setProperty('--user-portrait-x', this.x + 'px');
    container.style.setProperty('--user-portrait-y', this.y + 'px');

    const scaleInput = this._query('input[name="system.userPortrait.scale"]');
    const xInput = this._query('input[name="system.userPortrait.x"]');
    const yInput = this._query('input[name="system.userPortrait.y"]');
    if (scaleInput) scaleInput.value = this.scale;
    if (xInput) xInput.value = this.x;
    if (yInput) yInput.value = this.y;
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
      'system.userPortrait.y': this.y
    };

    const syncHiddenInputs = () => {
      const s = this._query('input[name="system.userPortrait.scale"]');
      const x = this._query('input[name="system.userPortrait.x"]');
      const y = this._query('input[name="system.userPortrait.y"]');
      if (s) { s.value = this.scale; s.setAttribute('value', this.scale); }
      if (x) { x.value = this.x; x.setAttribute('value', this.x); }
      if (y) { y.value = this.y; y.setAttribute('value', this.y); }
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
