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
    this.html.on('click', '.open-language-dialog', this.onOpenDialog.bind(this));
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
    
    // Auto-adjust font size to fit content
    this.adjustFontSize();
  }

  /**
   * Automatically adjust font size to fit content within container width
   */
  adjustFontSize() {
    const container = this.tags;
    const containerWidth = 272; // Fixed width from CSS
    const maxFontSize = 19; // Default font size
    const minFontSize = 10; // Minimum readable font size
    
    // Reset to maximum font size first
    container.css('font-size', maxFontSize + 'px');
    
    // Give browser time to render before measuring
    setTimeout(() => {
      let fontSize = maxFontSize;
      
      // Check if text overflows and reduce font size accordingly
      while (container[0].scrollWidth > containerWidth && fontSize > minFontSize) {
        fontSize -= 0.5;
        container.css('font-size', fontSize + 'px');
      }
    }, 10); // Small delay to ensure rendering is complete
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
      <div style="margin-bottom:8px;">
        <label><b>Select Languages:</b></label><br/>
        <div style="display: flex; gap: 40px;">
          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px;">
            ${firstColumn.map(lang =>
              `<label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" name="lang" value="${lang}" ${this.languages.includes(lang) ? "checked" : ""}/>
                <span>${lang}</span>
              </label>`
            ).join("")}
            <label style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" name="customCheck" id="customCheck"/>
              <input type="text" name="custom" id="customInput" style="width: 145px;" placeholder="Enter custom language" disabled/>
            </label>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px;">
            ${secondColumn.map(lang =>
              `<label style="display: flex; align-items: center; gap: 8px;">
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
