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
          console.log('Character name drag handle removed');
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
    // Create a hidden span to measure text width
    this.measureSpan = $('<span></span>');
    this.measureSpan.css({
      'visibility': 'hidden',
      'position': 'absolute',
      'white-space': 'nowrap',
      'font-family': this.nameInput.css('font-family'),
      'font-size': this.nameInput.css('font-size'),
      'font-weight': this.nameInput.css('font-weight'),
      'letter-spacing': this.nameInput.css('letter-spacing')
    });
    
    // Add to DOM for measurement
    $('body').append(this.measureSpan);

    // Set initial CSS properties for the input
    this.nameInput.css({
      'width': 'auto',
      'min-width': `${this.minWidth}px`,
      'max-width': `${this.maxWidth}px`,
      'box-sizing': 'border-box'
    });
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
      this.measureSpan.css({
        'font-family': this.nameInput.css('font-family'),
        'font-size': this.nameInput.css('font-size'),
        'font-weight': this.nameInput.css('font-weight'),
        'letter-spacing': this.nameInput.css('letter-spacing')
      });
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
    this.measureSpan.text(measureText);
    let textWidth = this.measureSpan.width();

    // Add padding and constrain to min/max
    let newWidth = Math.max(textWidth + this.padding, this.minWidth);
    newWidth = Math.min(newWidth, this.maxWidth);

    // Apply the new width
    this.nameInput.css('width', `${newWidth}px`);

    // Trigger a custom event for other handlers that might need to know about size changes
    this.nameInput.trigger('characterNameResize', { width: newWidth, textWidth: textWidth });
  }

  /**
   * Set minimum and maximum width constraints
   */
  setWidthConstraints(minWidth, maxWidth) {
    this.minWidth = minWidth;
    this.maxWidth = maxWidth;
    
    this.nameInput.css({
      'min-width': `${this.minWidth}px`,
      'max-width': `${this.maxWidth}px`
    });
    
    this.adjustWidth();
  }

  /**
   * Get current width information
   */
  getWidthInfo() {
    const currentWidth = this.nameInput.width();
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
