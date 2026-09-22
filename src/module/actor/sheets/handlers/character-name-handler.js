/**
 * CharacterNameHandler - Manages dynamic character name field sizing and behavior
 */
export class CharacterNameHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.nameInput = null;
    this.minimumScale = 0.55;
  }

  /**
   * Initialize the character name handler
   */
  initialize() {
    this.nameInput = this.html.find('#char-name');
    if (this.nameInput.length) {
      this.setupDynamicFontSize();
      this.bindEvents();
      this.adjustFontSize();

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
  setupDynamicFontSize() {
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

    document.body.appendChild(this.measureSpan);
    const input = this.nameInput[0];
    const computed = window.getComputedStyle(input);
    this.defaultFontSize = parseFloat(computed.fontSize) || 48;
    this.horizontalInset = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.paddingRight) || 0);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.adjustFontSize());
      this.resizeObserver.observe(input);
    }
  }

  /**
   * Bind events for dynamic width adjustment
   */
  bindEvents() {
    // Adjust width on input, keyup, paste, and focus
    this.nameInput.on('input keyup paste focus blur', () => {
      setTimeout(() => this.adjustFontSize(), 0);
    });

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
  adjustFontSize() {
    if (!this.nameInput || !this.measureSpan) return;

    const text = this.nameInput.val() || this.nameInput.attr('placeholder') || '';

    // Use the longer of actual text or placeholder for measurement
    const measureText = text.length > 0 ? text : (this.nameInput.attr('placeholder') || 'Character Name');

  // Set text in measure span and get width
  if (this.measureSpan) this.measureSpan.textContent = measureText;
  let textWidth = 0;
  if (this.measureSpan) textWidth = this.measureSpan.offsetWidth || this.measureSpan.getBoundingClientRect().width || 0;

    const input = this.nameInput[0];
    const availableWidth = Math.max(1, input.clientWidth - this.horizontalInset);
    const scale = textWidth > 0 ? Math.min(1, availableWidth / textWidth) : 1;
    const fontSize = Math.max(this.defaultFontSize * this.minimumScale, this.defaultFontSize * scale);
    input.style.setProperty('--ej-character-name-font-size', `${fontSize}px`);

    // Trigger a custom event for other handlers that might need to know about size changes
    this.nameInput.trigger('characterNameResize', { fontSize, textWidth, availableWidth });
  }

  /**
   * Force a width adjustment (useful after external changes)
   */
  refresh() {
    this.updateMeasureSpanFont();
    this.defaultFontSize = parseFloat(window.getComputedStyle(this.nameInput[0]).fontSize) || this.defaultFontSize;
    this.adjustFontSize();
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
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}
