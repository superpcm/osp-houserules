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
    const containerWidth = 115; // Conservative width to account for browser rendering differences
    const maxFontSize = 34; // Start at 34px like Languages
    const minFontSize = 8; // Lower minimum to allow more shrinking
    
  // Reset to maximum font size first (use CSS var hook)
  try { this.backgroundSelect[0].style.setProperty('--background-font-size', `${maxFontSize}px`); } catch (e) { if (this.backgroundSelect[0]) this.backgroundSelect[0].style.fontSize = maxFontSize + 'px'; }
    
    // Give browser time to render before measuring
    setTimeout(() => {
      let fontSize = maxFontSize;
      
      // Get the selected option text
      const selectedText = select.options[select.selectedIndex]?.text || '';
      
      // Create a temporary element to measure text width using native DOM
      const tempElement = document.createElement('span');
      try {
        const computed = window.getComputedStyle(this.backgroundSelect[0]);
        tempElement.style.fontFamily = computed.getPropertyValue('font-family') || '';
      } catch (e) {
        tempElement.style.fontFamily = '';
      }
      tempElement.style.fontSize = fontSize + 'px';
      tempElement.style.visibility = 'hidden';
      tempElement.style.position = 'absolute';
      tempElement.style.whiteSpace = 'nowrap';
      tempElement.textContent = selectedText;
      document.body.appendChild(tempElement);
      
      // Check if text overflows and reduce font size accordingly
      let textWidth = tempElement.offsetWidth || tempElement.getBoundingClientRect().width;
      
      while (textWidth > containerWidth && fontSize > minFontSize) {
        fontSize -= 0.5;
        tempElement.style.fontSize = fontSize + 'px';
        textWidth = tempElement.offsetWidth || tempElement.getBoundingClientRect().width;
      }
      
      // Apply the calculated font size via CSS var when possible
      try { 
        this.backgroundSelect[0].style.setProperty('--background-font-size', `${fontSize}px`); 
      } catch (e) { 
        if (this.backgroundSelect[0]) {
          this.backgroundSelect[0].style.fontSize = fontSize + 'px';
        }
      }
      
      // Clean up temporary element
      // Remove temporary element
      if (tempElement && tempElement.parentNode) tempElement.parentNode.removeChild(tempElement);
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
