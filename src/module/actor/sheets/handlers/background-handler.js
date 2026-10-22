/**
 * Handles auto-sizing font for the Background select field
 */
export class BackgroundHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.backgroundSelect = null;
    this._timers = new Set();
    this._destroyed = false;
    this._eventNamespace = `.backgroundHandler${BackgroundHandler._nextId++}`;
  }

  /**
   * Initialize the background handler
   */
  initialize() {
    this.destroy();
    this._destroyed = false;
    this.backgroundSelect = this.html.find('.char-background');
    
    if (this.backgroundSelect.length) {
      // Bind change event to adjust font size when selection changes
      this.backgroundSelect.on(`change${this._eventNamespace}`, () => {
        this._schedule(() => this.adjustFontSize(), 10);
      });
      
      // Initial font size adjustment
      this._schedule(() => this.adjustFontSize(), 100);
    }
  }

  _schedule(callback, delay) {
    const timer = setTimeout(() => {
      this._timers.delete(timer);
      if (this._destroyed) return;
      callback();
    }, delay);
    this._timers.add(timer);
    return timer;
  }

  _ownerDocument() {
    return this.backgroundSelect?.[0]?.ownerDocument ?? this.html?.[0]?.ownerDocument ?? globalThis.document;
  }

  _ownerWindow() {
    return this._ownerDocument()?.defaultView ?? globalThis.window;
  }

  /**
   * Automatically adjust font size to fit content within select field
   */
  adjustFontSize() {
    if (this._destroyed || !this.backgroundSelect || !this.backgroundSelect.length) return;
    
    const select = this.backgroundSelect[0];
    const containerWidth = 115; // Conservative width to account for browser rendering differences
    const maxFontSize = 34; // Start at 34px like Languages
    const minFontSize = 8; // Lower minimum to allow more shrinking
    
  // Reset to maximum font size first (use CSS var hook)
  try { this.backgroundSelect[0].style.setProperty('--background-font-size', `${maxFontSize}px`); } catch (e) { if (this.backgroundSelect[0]) this.backgroundSelect[0].style.fontSize = maxFontSize + 'px'; }
    
    // Give browser time to render before measuring
    this._schedule(() => {
      if (this._destroyed || !select.isConnected && !select.parentNode) return;
      let fontSize = maxFontSize;
      
      // Get the selected option text
      const selectedText = select.options[select.selectedIndex]?.text || '';
      
      // Create a temporary element to measure text width using native DOM
      const doc = this._ownerDocument();
      const win = this._ownerWindow();
      const tempElement = doc.createElement('span');
      try {
        const computed = win.getComputedStyle(this.backgroundSelect[0]);
        tempElement.style.fontFamily = computed.getPropertyValue('font-family') || '';
      } catch (e) {
        tempElement.style.fontFamily = '';
      }
      tempElement.style.fontSize = fontSize + 'px';
      tempElement.style.visibility = 'hidden';
      tempElement.style.position = 'absolute';
      tempElement.style.whiteSpace = 'nowrap';
      tempElement.textContent = selectedText;
      doc.body.appendChild(tempElement);
      try {
        let textWidth = tempElement.offsetWidth || tempElement.getBoundingClientRect().width;
        while (textWidth > containerWidth && fontSize > minFontSize) {
          fontSize -= 0.5;
          tempElement.style.fontSize = fontSize + 'px';
          textWidth = tempElement.offsetWidth || tempElement.getBoundingClientRect().width;
        }
        try {
          this.backgroundSelect[0].style.setProperty('--background-font-size', `${fontSize}px`);
        } catch (e) {
          if (this.backgroundSelect[0]) this.backgroundSelect[0].style.fontSize = fontSize + 'px';
        }
      } finally {
        if (tempElement?.parentNode) tempElement.parentNode.removeChild(tempElement);
      }
    }, 10);
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    this._destroyed = true;
    if (this.backgroundSelect) this.backgroundSelect.off(this._eventNamespace);
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
  }
}

BackgroundHandler._nextId = 0;
