/**
 * Handles auto-sizing font for the Background select field
 */
export class BackgroundHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.backgroundSelect = null;
  }

  /**
   * Initialize the background handler
   */
  initialize() {
    this.backgroundSelect = this.html.find('.char-background');
    
    if (this.backgroundSelect.length) {
      // Bind change event to adjust font size when selection changes
      this.backgroundSelect.on('change', () => {
        setTimeout(() => this.adjustFontSize(), 10);
      });
      
      // Initial font size adjustment
      setTimeout(() => this.adjustFontSize(), 100);
    }
  }

  /**
   * Automatically adjust font size to fit content within select field
   */
  adjustFontSize() {
    if (!this.backgroundSelect || !this.backgroundSelect.length) return;
    
    const select = this.backgroundSelect[0];
    const containerWidth = 132; // Fixed width from CSS (132px minus padding)
    const maxFontSize = 24; // Default font size
    const minFontSize = 10; // Minimum readable font size
    
    // Reset to maximum font size first
    this.backgroundSelect.css('font-size', maxFontSize + 'px');
    
    // Give browser time to render before measuring
    setTimeout(() => {
      let fontSize = maxFontSize;
      
      // Get the selected option text
      const selectedText = select.options[select.selectedIndex]?.text || '';
      
      // Create a temporary element to measure text width
      const tempElement = $('<span>')
        .css({
          'font-family': this.backgroundSelect.css('font-family'),
          'font-size': fontSize + 'px',
          'visibility': 'hidden',
          'position': 'absolute',
          'white-space': 'nowrap'
        })
        .text(selectedText)
        .appendTo('body');
      
      // Check if text overflows and reduce font size accordingly
      while (tempElement.width() > (containerWidth - 8) && fontSize > minFontSize) { // -8px for padding
        fontSize -= 0.5;
        tempElement.css('font-size', fontSize + 'px');
      }
      
      // Apply the calculated font size
      this.backgroundSelect.css('font-size', fontSize + 'px');
      
      // Clean up temporary element
      tempElement.remove();
    }, 10);
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    if (this.backgroundSelect) {
      this.backgroundSelect.off('change');
    }
  }
}
