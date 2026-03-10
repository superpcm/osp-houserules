/**
 * Portrait Positioning Tool
 * Handles interactive portrait adjustment functionality for character sheets.
 * Manages all 3 portrait interactions:
 *   - Double-click: open FilePicker to change portrait
 *   - Right-click (no modifier): position tool pass-through
 *   - Shift+Right-click: show zoom/move/reset adjustment controls
 */

export class PortraitTool {
  constructor(actorSheet) {
    this.actorSheet = actorSheet;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
  }

  /**
   * Initialize the portrait tool
   */
  initialize() {
    setTimeout(() => {
      const portraitDisplay = document.querySelector('.portrait-display');
      if (!portraitDisplay) return;

      this.setupTooltip(portraitDisplay);
      this.setupDblClickHandler(portraitDisplay);
      this.setupRightClickHandler(portraitDisplay);
      this.setupPortraitAdjustment();
    }, 500);
  }

  /**
   * Setup hover tooltip on the portrait
   */
  setupTooltip(portraitDisplay) {
    let tooltip = document.getElementById('portrait-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'portrait-tooltip';
      tooltip.className = 'cs-tooltip cs-tooltip--portrait';
      document.body.appendChild(tooltip);
    }

    let timeout;
    portraitDisplay.addEventListener('mouseenter', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        tooltip.textContent = 'Double-click to select portrait • Right-click to adjust position';
        tooltip.style.opacity = '1';
        const rect = portraitDisplay.getBoundingClientRect();
        const tipRect = tooltip.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width / 2 - tipRect.width / 2) + 'px';
        tooltip.style.top = (rect.top - tipRect.height - 8) + 'px';
      }, 500);
    });

    portraitDisplay.addEventListener('mouseleave', () => {
      clearTimeout(timeout);
      tooltip.style.opacity = '0';
    });
  }

  /**
   * Setup double-click handler to open FilePicker for portrait selection
   */
  setupDblClickHandler(portraitDisplay) {
    portraitDisplay.addEventListener('dblclick', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        const fp = new FilePicker({
          type: 'image',
          current: document.querySelector('input[name="system.portrait"]')?.value || '',
          callback: (path) => {
            const img = portraitDisplay.querySelector('.portrait-img, .cs-portrait-img');
            if (img) img.src = path;
            const input = document.querySelector('input[name="system.portrait"]');
            if (input) {
              input.value = path;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        });
        fp.render(true);
      } catch (err) {
        ui.notifications?.error('Failed to open file picker for portrait selection.');
      }
    });
  }

  /**
   * Setup right-click handler to show portrait adjustment controls
   * Plain right-click passes through; Shift/Ctrl/Alt+right-click shows controls
   */
  setupRightClickHandler(portraitDisplay) {
    portraitDisplay.addEventListener('contextmenu', (event) => {
      // Plain right-click: pass through (no action)
      if (!event.shiftKey && !event.ctrlKey && !event.altKey) return;

      event.preventDefault();
      event.stopPropagation();

      const controls = document.getElementById('portrait-controls');
      const container = document.getElementById('portrait-container');

      if (controls) {
        controls.style.display = 'block';

        const observer = new MutationObserver(() => {});
        observer.observe(controls, { attributes: true, attributeFilter: ['style'] });
        controls._observer = observer;
      }

      if (container) container.classList.add('adjusting');
    });
  }

  /**
   * Setup portrait adjustment functionality (zoom/move/reset button panel)
   */
  setupPortraitAdjustment() {
    const controls = document.getElementById('portrait-controls');
    const container = document.getElementById('portrait-container');

    if (!controls || !container) return;

    // Read current values from CSS variables
    this.scale = parseFloat(getComputedStyle(container).getPropertyValue('--user-portrait-scale')) || 1;
    this.x = parseFloat(getComputedStyle(container).getPropertyValue('--user-portrait-x')) || 0;
    this.y = parseFloat(getComputedStyle(container).getPropertyValue('--user-portrait-y')) || 0;

    const buttons = controls.querySelectorAll('button');
    buttons.forEach((button) => {
      ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'].forEach(eventType => {
        button.addEventListener(eventType, (event) => {
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

    const scaleInput = document.querySelector('input[name="system.userPortrait.scale"]');
    const xInput = document.querySelector('input[name="system.userPortrait.x"]');
    const yInput = document.querySelector('input[name="system.userPortrait.y"]');
    if (scaleInput) scaleInput.value = this.scale;
    if (xInput) xInput.value = this.x;
    if (yInput) yInput.value = this.y;
  }

  /**
   * Handle the Done button — save and hide the control panel
   */
  handleDone(controls, container) {
    if (window.pauseXPMonitoring) window.pauseXPMonitoring();
    window.isFormSubmitting = true;

    this.savePortraitData();

    setTimeout(() => {
      window.isFormSubmitting = false;
      if (window.resumeXPMonitoring) window.resumeXPMonitoring();
      const xpField = document.getElementById('xp-display');
      if (xpField?.value && !xpField.value.includes(',')) {
        const n = parseInt(xpField.value) || 0;
        if (n >= 1000) xpField.value = n.toLocaleString();
      }
    }, 2000);

    if (controls._observer) controls._observer.disconnect();
    controls.style.display = 'none';
    container.classList.remove('adjusting');
  }

  /**
   * Save portrait position data to the actor
   */
  savePortraitData() {
    // Clean XP field before save
    const xpField = document.getElementById('xp-display');
    if (xpField?.value) xpField.value = xpField.value.replace(/,/g, '');

    const updateData = {
      'system.userPortrait.scale': this.scale,
      'system.userPortrait.x': this.x,
      'system.userPortrait.y': this.y
    };

    const syncHiddenInputs = () => {
      const s = document.querySelector('input[name="system.userPortrait.scale"]');
      const x = document.querySelector('input[name="system.userPortrait.x"]');
      const y = document.querySelector('input[name="system.userPortrait.y"]');
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
    const form = document.querySelector('form.flexcol') ?? document.querySelector('form');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }
}
