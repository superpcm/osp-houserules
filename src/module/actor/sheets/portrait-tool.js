/**
 * Portrait Positioning Tool
 * Handles interactive portrait adjustment functionality for character sheets
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
      const portraitDisplay = document.getElementById('portrait-display');
      
      if (portraitDisplay) {
        console.log('Initializing portrait positioning tool...');
        
        // Setup right-click handler for portrait controls
        this.setupRightClickHandler(portraitDisplay);
        
        // Setup portrait adjustment functionality
        this.setupPortraitAdjustment();
        
        console.log('Portrait setup completed successfully!');
      } else {
        console.log('Portrait element not found!');
      }
    }, 500);
  }

  /**
   * Setup right-click handler to show portrait adjustment controls
   */
  setupRightClickHandler(portraitDisplay) {
    portraitDisplay.addEventListener('contextmenu', (event) => {
      console.log('Portrait right-click event triggered!', 'Shift:', event.shiftKey, 'Ctrl:', event.ctrlKey, 'Alt:', event.altKey);
      
      // Allow positioning tool to work with plain right-click
      // Only handle portrait controls when Shift is held (or other modifier)
      if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
        // Let the positioning tool handle this event
        console.log('Letting positioning tool handle this event');
        return;
      }
      
      console.log('Processing portrait controls...');
      event.preventDefault();
      event.stopPropagation();

      const controls = document.getElementById('portrait-controls');
      const container = document.getElementById('portrait-container');

      // Show controls and enter adjustment mode
      if (controls) {
        controls.style.display = 'block';

        // Add a global observer to see if something else is hiding the controls
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.target === controls && mutation.attributeName === 'style') {
              // Observer callback (can be extended if needed)
            }
          });
        });
        observer.observe(controls, { attributes: true, attributeFilter: ['style'] });

        // Store observer for cleanup
        controls._observer = observer;
      }
      
      if (container) {
        container.classList.add('adjusting');
      }
    });
  }

  /**
   * Setup portrait adjustment functionality
   */
  setupPortraitAdjustment() {
    const controls = document.getElementById('portrait-controls');
    const container = document.getElementById('portrait-container');

    if (!controls || !container) {
      return;
    }

    // Get current values from CSS variables or defaults
    this.scale = parseFloat(getComputedStyle(container).getPropertyValue('--user-portrait-scale')) || 1;
    this.x = parseFloat(getComputedStyle(container).getPropertyValue('--user-portrait-x')) || 0;
    this.y = parseFloat(getComputedStyle(container).getPropertyValue('--user-portrait-y')) || 0;

    // Add individual event listeners to each button
    const buttons = controls.querySelectorAll('button');

    buttons.forEach((button) => {
      // Block all possible events that could bubble
      ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'].forEach(eventType => {
        button.addEventListener(eventType, (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          // Only execute action on 'click'
          if (eventType !== 'click') return;

          this.handleButtonAction(button.dataset.action, event, controls, container);
        }, true); // Use capture phase
      });
    });
  }

  /**
   * Handle button action clicks
   */
  handleButtonAction(action, event, controls, container) {
    // Determine adjustment step size based on modifier keys
    let scaleStep = 0.1;  // Normal scale step
    let moveStep = 3;     // Normal move step (pixels)
    
    if (event.shiftKey && event.ctrlKey) {
      // Very fine adjustments (Shift + Ctrl)
      scaleStep = 0.01;
      moveStep = 0.5;
    } else if (event.shiftKey) {
      // Fine adjustments (Shift only)
      scaleStep = 0.02;
      moveStep = 1;
    } else if (event.ctrlKey) {
      // Coarse adjustments (Ctrl only)
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
   * Update portrait transform
   */
  updatePortrait(container) {
    // Update CSS variables
    container.style.setProperty('--user-portrait-scale', this.scale);
    container.style.setProperty('--user-portrait-x', this.x + 'px');
    container.style.setProperty('--user-portrait-y', this.y + 'px');

    // Update hidden form inputs for persistence
    const scaleInput = document.querySelector('input[name="system.userPortrait.scale"]');
    const xInput = document.querySelector('input[name="system.userPortrait.x"]');
    const yInput = document.querySelector('input[name="system.userPortrait.y"]');

    if (scaleInput) scaleInput.value = this.scale;
    if (xInput) xInput.value = this.x;
    if (yInput) yInput.value = this.y;
  }

  /**
   * Handle the Done button click
   */
  handleDone(controls, container) {
    // Pause XP monitoring and mark form as submitting
    if (window.pauseXPMonitoring) {
      window.pauseXPMonitoring();
    }
    window.isFormSubmitting = true;

    this.savePortraitData();

    // Resume normal operation after a delay
    setTimeout(() => {
      window.isFormSubmitting = false;
      if (window.resumeXPMonitoring) {
        window.resumeXPMonitoring();
      }
      // Restore XP formatting
      const xpField = document.getElementById('xp-display');
      if (xpField && xpField.value && !xpField.value.includes(',')) {
        const numericValue = parseInt(xpField.value) || 0;
        if (numericValue >= 1000) {
          const formattedValue = numericValue.toLocaleString();
          xpField.value = formattedValue;
        }
      }
    }, 2000);

    if (controls._observer) {
      controls._observer.disconnect();
    }
    controls.style.display = 'none';
    container.classList.remove('adjusting');
  }

  /**
   * Save portrait data to actor
   */
  savePortraitData() {
    // Clean XP field before save operations
    const xpField = document.getElementById('xp-display');
    if (xpField && xpField.value) {
      const cleanValue = xpField.value.replace(/,/g, '');
      if (cleanValue !== xpField.value) {
        xpField.value = cleanValue;
      }
    }

    // Gather update payload
    const updateData = {
      'system.userPortrait.scale': this.scale,
      'system.userPortrait.x': this.x,
      'system.userPortrait.y': this.y
    };

    // Helper: update hidden inputs to keep form in sync
    const syncHiddenInputs = () => {
      const scaleInput = document.querySelector('input[name="system.userPortrait.scale"]');
      const xInput = document.querySelector('input[name="system.userPortrait.x"]');
      const yInput = document.querySelector('input[name="system.userPortrait.y"]');
      if (scaleInput) { scaleInput.value = this.scale; scaleInput.setAttribute('value', this.scale); }
      if (xInput) { xInput.value = this.x; xInput.setAttribute('value', this.x); }
      if (yInput) { yInput.value = this.y; yInput.setAttribute('value', this.y); }
    };

    // Attempt 1: Use the sheet instance stored on the window
    try {
      if (window.currentActorSheet && window.currentActorSheet.actor) {
        const actor = window.currentActorSheet.actor;
        return actor.update(updateData, {render: false})
          .then(() => { syncHiddenInputs(); })
          .catch(err => { /* ignored */ });
      }
    } catch (err) {
      // Continue to next attempt
    }

    // Attempt 2: Resolve via the containing window-app
    try {
      const container = document.getElementById('portrait-container');
      if (container) {
        const windowApp = container.closest('.window-app');
        if (windowApp) {
          const appId = windowApp.getAttribute('data-appid');
          if (appId && ui && ui.windows && ui.windows[appId] && ui.windows[appId].actor) {
            const actor = ui.windows[appId].actor;
            return actor.update(updateData, {render: false})
              .then(() => { syncHiddenInputs(); })
              .catch(err => { /* ignored */ });
          }
        }
      }
    } catch (err) {
      // Continue to next attempt
    }

    // Attempt 3: Look for a form-bound actor id
    try {
      const actorIdInput = document.querySelector('input[name="id"]');
      if (actorIdInput && actorIdInput.value) {
        const actor = game.actors.get(actorIdInput.value);
        if (actor) {
          return actor.update(updateData, {render: false})
            .then(() => { syncHiddenInputs(); })
            .catch(err => { /* ignored */ });
        }
      }
    } catch (err) {
      // Continue to next attempt
    }

    // Attempt 4: Try to find actor id from URL
    try {
      const urlMatch = window.location.href.match(/actors\/([a-zA-Z0-9]+)/);
      if (urlMatch) {
        const actor = game.actors.get(urlMatch[1]);
        if (actor) {
          return actor.update(updateData, {render: false})
            .then(() => { syncHiddenInputs(); })
            .catch(err => { /* ignored */ });
        }
      }
    } catch (err) {
      // Continue to fallback
    }

    // Final fallback: update hidden inputs and trigger form change
    console.warn('All direct actor save methods failed; using form fallback');
    try {
      syncHiddenInputs();
      const nearestForm = document.getElementById('portrait-container')?.closest('form') || 
                         document.querySelector('form.flexcol') || 
                         document.querySelector('form');
      if (nearestForm) {
        const changeEvent = new Event('change', { bubbles: true });
        const scaleInput = document.querySelector('input[name="system.userPortrait.scale"]');
        if (scaleInput) scaleInput.dispatchEvent(changeEvent);
        nearestForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        return Promise.resolve();
      }
    } catch (err) {
      console.error('Portrait save failed:', err);
    }
  }
}
