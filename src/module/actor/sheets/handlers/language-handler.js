/**
 * Handles language management functionality
 */
export class LanguageHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this.tags = html.find('.languages-tags');
    this.hidden = html.find('.char-languages');
    this.openDialog = html.find('.open-language-dialog');
    this.standardLanguages = ["Dwarvish", "Elvish", "Gnomish", "Hobbitish", "Humanish", "Orcish"];
    
    // Guard to prevent infinite loops during font adjustment
    this._adjustingFont = false;
    
    // Initialize languages with Common as default
    this.languages = (this.hidden.val() || "").split(",")
      .map(l => l.trim())
      .filter(l => l && l !== "Common");
    this.languages.unshift("Common");
  }

  /**
   * Initialize language management
   */
  initialize() {
    this.renderTags();
    // Remove the click handler for remove buttons since we're using plain text now
    // this.tags.on('click', '.remove-lang', this.onRemoveLanguage.bind(this));
    
    // Use event delegation on the entire form for the language dialog
    this.html.on('dblclick', '.open-language-dialog', this.onOpenDialog.bind(this));
    
    // Temporarily disable additional font sizing call to prevent infinite loops
    // setTimeout(() => {
    //   this.adjustFontSize();
    // }, 500);
  }

  /**
   * Render language text
   */
  renderTags() {
    this.tags.empty();
    // Join languages with commas for plain text display
    const languageText = this.languages.join(", ");
    this.tags.text(languageText);
    this.hidden.val(this.languages.join(", "));
    
    // Temporarily disable auto-adjust font size to prevent infinite loops
    // this.adjustFontSize();
  }

  /**
   * Automatically adjust font size to fit content within container width
   */
  adjustFontSize() {
    // Prevent infinite loops
    if (this._adjustingFont) return;
    this._adjustingFont = true;
    
    const container = this.tags;
    const el = container && container[0];
    const containerWidth = 267; // Available width accounting for padding
    const maxFontSize = 34; // Start at 24px as specified
    const minFontSize = 24; // Minimum readable font size (increased from 10)

    // If the container element isn't present, bail out safely
    if (!el) {
      this._adjustingFont = false;
      return;
    }

    // Create a temporary measurement element
    const measureElement = document.createElement('span');
    measureElement.style.visibility = 'hidden';
    measureElement.style.position = 'absolute';
    measureElement.style.whiteSpace = 'nowrap';
    measureElement.style.fontFamily = window.getComputedStyle(el).fontFamily;
    measureElement.textContent = el.textContent;
    document.body.appendChild(measureElement);

    let fontSize = maxFontSize;
    
    // Function to measure text width at a given font size
    const getTextWidth = (size) => {
      measureElement.style.fontSize = `${size}px`;
      return measureElement.scrollWidth;
    };

    // Set the font size on the actual element
    const setFontSize = (size, allowWrap = false) => {
      el.style.setProperty('--languages-font-size', `${size}px`);
      el.style.fontSize = `${size}px`;
      if (allowWrap) {
        el.style.whiteSpace = 'normal';
        el.style.wordWrap = 'break-word';
      } else {
        el.style.whiteSpace = 'nowrap';
        el.style.wordWrap = 'normal';
      }
    };

    // Start with max font size
    setFontSize(fontSize);
    let textWidth = getTextWidth(fontSize);
    
    // Debug: Font sizing logic (disabled to prevent infinite loops)
    // console.log('Font sizing debug (improved):', {
    //   text: el.textContent,
    //   containerWidth: containerWidth,
    //   initialTextWidth: textWidth,
    //   fontSize: fontSize
    // });
    
    // Check if we even need to reduce the font size
    if (textWidth <= containerWidth) {
      // console.log('Text fits at', fontSize + 'px, no adjustment needed');
      document.body.removeChild(measureElement);
      this._adjustingFont = false;
      return;
    }
    
    // Reduce font size by 0.5px until text fits or we reach minimum
    while (textWidth > containerWidth && fontSize > minFontSize) {
      fontSize -= 0.5;
      textWidth = getTextWidth(fontSize);
      
      // console.log('Reduced font to', fontSize + 'px, textWidth:', textWidth);
    }
    
    // If we've reached minimum font size and text still doesn't fit, enable wrapping
    if (fontSize <= minFontSize && textWidth > containerWidth) {
      // console.log('Reached minimum font size, enabling text wrapping');
      setFontSize(minFontSize, true); // Enable wrapping
    } else {
      // Apply final font size without wrapping
      setFontSize(fontSize, false);
    }
    
    // console.log('Final font size:', fontSize + 'px', textWidth > containerWidth ? '(with wrapping)' : '(single line)');
    
    // Clean up measurement element
    document.body.removeChild(measureElement);
    
    // Reset the guard
    this._adjustingFont = false;
  }

  /**
   * Handle removing a language (no longer used with plain text display)
   */
  /*
  onRemoveLanguage(event) {
    event.stopPropagation(); // Prevent triggering the dialog
    const lang = $(event.currentTarget).data('lang');
    this.languages = this.languages.filter(l => l !== lang && l !== "Common");
    this.languages.unshift("Common");
    this.renderTags();
  }
  */

  /**
   * Handle opening the language selection dialog
   */
  async onOpenDialog(event) {
    const dialogContent = this.buildDialogContent();
    
    const dialog = new Dialog({
      title: "Add Language",
      content: dialogContent,
      buttons: {
        ok: {
          label: "OK",
          callback: (html) => {
            this.onDialogSubmit(html);
            return true; // This allows the dialog to close
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "ok",
      render: (html) => {
        // Add event listener for custom checkbox
        const customCheck = html.find('#customCheck');
        const customInput = html.find('#customInput');
        
        customCheck.on('change', function() {
          if (this.checked) {
            customInput.prop('disabled', false).focus();
          } else {
            customInput.prop('disabled', true).val('');
          }
        });
      }
    }).render(true);
  }

  /**
   * Build dialog content HTML
   */
  buildDialogContent() {
    // Split standard languages into two columns: 3 in first column, 3 in second
    const firstColumn = this.standardLanguages.slice(0, 3);
    const secondColumn = this.standardLanguages.slice(3, 6);
    
    return `<form>
      <div class="cs-dialog-row">
        <label><b>Select Languages:</b></label><br/>
        <div class="cs-dialog-columns">
          <div class="cs-dialog-column">
            ${firstColumn.map(lang =>
              `<label class="cs-dialog-label">
                <input type="checkbox" name="lang" value="${lang}" ${this.languages.includes(lang) ? "checked" : ""}/>
                <span>${lang}</span>
              </label>`
            ).join("")}
            <label class="cs-dialog-label">
              <input type="checkbox" name="customCheck" id="customCheck"/>
              <input type="text" name="custom" id="customInput" class="cs-custom-input" placeholder="Enter custom language" disabled/>
            </label>
          </div>
          <div class="cs-dialog-column">
            ${secondColumn.map(lang =>
              `<label class="cs-dialog-label">
                <input type="checkbox" name="lang" value="${lang}" ${this.languages.includes(lang) ? "checked" : ""}/>
                <span>${lang}</span>
              </label>`
            ).join("")}
          </div>
        </div>
      </div>
    </form>`;
  }

  /**
   * Handle dialog submission
   */
  onDialogSubmit(htmlDialog) {
    // Start with Common (always included)
    this.languages = ["Common"];
    
    // Add all checked standard languages
    htmlDialog.find('input[name="lang"]:checked').each((i, el) => {
      const val = $(el).val();
      if (val && !this.languages.includes(val)) {
        this.languages.push(val);
      }
    });

    // Add custom language if checkbox is checked and text is provided
    const customCheck = htmlDialog.find('input[name="customCheck"]').is(':checked');
    const custom = htmlDialog.find('input[name="custom"]').val().trim();
    if (customCheck && custom && !this.languages.includes(custom)) {
      this.languages.push(custom);
    }

    this.renderTags();
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    this.tags.off('click', '.remove-lang');
    this.openDialog.off('click');
  }
}
