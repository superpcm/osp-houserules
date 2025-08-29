/**
 * CharacterNameHandler - Manages dynamic character name field sizing and behavior
 */
export class CharacterNameHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.nameInput = null;
    this.minWidth = 150; // minimum width in pixels
    this.maxWidth = 400; // maximum width in pixels
    this.padding = 20; // extra padding for comfortable typing
  }

  /**
   * Initialize the character name handler
   */
  initialize() {
    this.nameInput = this.html.find('#char-name');
    if (this.nameInput.length) {
      this.setupDynamicWidth();
      this.bindEvents();
      this.adjustWidth(); // Initial adjustment

      // Remove any drag handle from character name container
      this.ensureDragHandle();
    }
  }

  /**
   * Remove any drag handle from character name container
   */
  ensureDragHandle() {
    // Use a slight delay to ensure DOM is fully rendered
    setTimeout(() => {
      const container = this.nameInput.closest('.character-name-section');
      if (container.length) {
        // Remove any existing drag handle
        const dragHandle = container.find('.drag-handle');
        if (dragHandle.length) {
          dragHandle.remove();

        }

        // Remove any drag-related event handlers
        container.off('mouseenter.charname mouseleave.charname');
      }
    }, 300);
  }

  /**
   * Setup dynamic width functionality
   */
  setupDynamicWidth() {
    // Create a hidden span to measure text width (native DOM)
  this.measureSpan = document.createElement('span');
  // Use direct DOM style assignment for measurement span
  const ms = this.measureSpan;
  ms.style.visibility = 'hidden';
  ms.style.position = 'absolute';
  ms.style.whiteSpace = 'nowrap';
  try {
    const computed = window.getComputedStyle(this.nameInput[0]);
    ms.style.fontFamily = computed.getPropertyValue('font-family') || '';
    ms.style.fontSize = computed.getPropertyValue('font-size') || '';
    ms.style.fontWeight = computed.getPropertyValue('font-weight') || '';
    ms.style.letterSpacing = computed.getPropertyValue('letter-spacing') || '';
  } catch (e) {
    // Fallback to empty values
    ms.style.fontFamily = '';
    ms.style.fontSize = '';
    ms.style.fontWeight = '';
    ms.style.letterSpacing = '';
  }

  // Add to DOM for measurement
  document.body.appendChild(this.measureSpan);

    // Set initial CSS properties for the input via DOM styles
    const ni = this.nameInput[0];
    if (ni) {
      ni.style.width = 'auto';
      ni.style.boxSizing = 'border-box';
    }
  }

  /**
   * Bind events for dynamic width adjustment
   */
  bindEvents() {
    // Adjust width on input, keyup, paste, and focus
    this.nameInput.on('input keyup paste focus blur', () => {
      setTimeout(() => this.adjustWidth(), 0);
    });

    // Also adjust when font properties change (from Council font handler)
    const observer = new MutationObserver(() => {
      this.updateMeasureSpanFont();
      this.adjustWidth();
    });

    observer.observe(this.nameInput[0], {
      attributes: true,
      attributeFilter: ['style']
    });

    // Store observer for cleanup
    this.fontObserver = observer;
  }

  /**
   * Update measure span font properties to match input
   */
  updateMeasureSpanFont() {
    if (this.measureSpan) {
      const ms2 = this.measureSpan;
      if (ms2) {
        try {
          const computed2 = window.getComputedStyle(this.nameInput[0]);
          ms2.style.fontFamily = computed2.getPropertyValue('font-family') || '';
          ms2.style.fontSize = computed2.getPropertyValue('font-size') || '';
          ms2.style.fontWeight = computed2.getPropertyValue('font-weight') || '';
          ms2.style.letterSpacing = computed2.getPropertyValue('letter-spacing') || '';
        } catch (e) {
          ms2.style.fontFamily = '';
          ms2.style.fontSize = '';
          ms2.style.fontWeight = '';
          ms2.style.letterSpacing = '';
        }
      }
    }
  }

  /**
   * Adjust the width of the input based on content
   */
  adjustWidth() {
    if (!this.nameInput || !this.measureSpan) return;

    const text = this.nameInput.val() || this.nameInput.attr('placeholder') || '';

    // Use the longer of actual text or placeholder for measurement
    const measureText = text.length > 0 ? text : (this.nameInput.attr('placeholder') || 'Character Name');

  // Set text in measure span and get width
  if (this.measureSpan) this.measureSpan.textContent = measureText;
  let textWidth = 0;
  if (this.measureSpan) textWidth = this.measureSpan.offsetWidth || this.measureSpan.getBoundingClientRect().width || 0;

    // Add padding and constrain to min/max
    let newWidth = Math.max(textWidth + this.padding, this.minWidth);
    newWidth = Math.min(newWidth, this.maxWidth);

  // Apply the new width via DOM style
  const ni2 = this.nameInput[0];
  if (ni2) ni2.style.width = `${newWidth}px`;

    // Trigger a custom event for other handlers that might need to know about size changes
    this.nameInput.trigger('characterNameResize', { width: newWidth, textWidth: textWidth });
  }

  /**
   * Set minimum and maximum width constraints
   */
  setWidthConstraints(minWidth, maxWidth) {
    this.minWidth = minWidth;
    this.maxWidth = maxWidth;

  // No inline styles to update here; width constraints applied via DOM in adjustWidth

    this.adjustWidth();
  }

  /**
   * Get current width information
   */
  getWidthInfo() {
    const currentWidth = (this.nameInput && this.nameInput[0]) ? (this.nameInput[0].getBoundingClientRect().width || this.nameInput[0].offsetWidth || 0) : 0;
    const text = this.nameInput.val() || '';

    return {
      currentWidth: currentWidth,
      textLength: text.length,
      minWidth: this.minWidth,
      maxWidth: this.maxWidth,
      isAtMin: currentWidth <= this.minWidth,
      isAtMax: currentWidth >= this.maxWidth
    };
  }

  /**
   * Force a width adjustment (useful after external changes)
   */
  refresh() {
    this.updateMeasureSpanFont();
    this.adjustWidth();
  }

  /**
   * Cleanup handler
   */
  destroy() {
    if (this.nameInput) {
      this.nameInput.off('input keyup paste focus blur');
    }

    if (this.measureSpan) {
      this.measureSpan.remove();
    }

    if (this.fontObserver) {
      this.fontObserver.disconnect();
    }
  }
}
