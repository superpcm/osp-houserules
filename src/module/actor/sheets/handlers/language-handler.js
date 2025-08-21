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
    console.log('LanguageHandler initializing...', {
      tags: this.tags.length,
      hidden: this.hidden.length,
      openDialog: this.openDialog.length
    });
    
    this.renderTags();
    this.tags.on('click', '.remove-lang', this.onRemoveLanguage.bind(this));
    
    // Use event delegation on the entire form for the language dialog
    this.html.on('click', '.open-language-dialog', this.onOpenDialog.bind(this));
    
    // Also try direct binding if elements exist
    if (this.openDialog.length > 0) {
      this.openDialog.on('click', this.onOpenDialog.bind(this));
    }
    
    // Create a global test function for debugging
    window.testLanguageDialog = () => {
      console.log('Test language dialog called');
      this.onOpenDialog();
    };
    
    console.log('LanguageHandler initialized successfully');
  }

  /**
   * Render language tags
   */
  renderTags() {
    this.tags.empty();
    this.languages.forEach(lang => {
      const canRemove = lang !== "Common";
      const tagHtml = `
        <span class="lang-tag">
          ${lang}
          ${canRemove ? `<button type="button" class="remove-lang" data-lang="${lang}" aria-label="Remove ${lang}">&times;</button>` : ""}
        </span>
      `;
      this.tags.append(tagHtml);
    });
    this.hidden.val(this.languages.join(", "));
  }

  /**
   * Handle removing a language
   */
  onRemoveLanguage(event) {
    const lang = $(event.currentTarget).data('lang');
    this.languages = this.languages.filter(l => l !== lang && l !== "Common");
    this.languages.unshift("Common");
    this.renderTags();
  }

  /**
   * Handle opening the language selection dialog
   */
  async onOpenDialog(event) {
    console.log('LanguageHandler: onOpenDialog called!', event);
    
    const dialogContent = this.buildDialogContent();
    
    new Dialog({
      title: "Add Language",
      content: dialogContent,
      buttons: {
        ok: {
          label: "Add",
          callback: this.onDialogSubmit.bind(this)
        },
        cancel: { label: "Cancel" }
      },
      default: "ok"
    }).render(true);
  }

  /**
   * Build dialog content HTML
   */
  buildDialogContent() {
    return `<form>
      <div style="margin-bottom:8px;">
        <label><b>Select Languages:</b></label><br/>
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px;">
          ${this.standardLanguages.map(lang =>
            `<label style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" name="lang" value="${lang}" ${this.languages.includes(lang) ? "checked disabled" : ""}/>
              <span>${lang}</span>
            </label>`
          ).join("")}
        </div>
      </div>
      <div style="text-align: center;">
        <label><b>Custom Language:</b></label><br/>
        <input type="text" name="custom" style="width: 80%;" placeholder="Enter custom language"/>
      </div>
    </form>`;
  }

  /**
   * Handle dialog submission
   */
  onDialogSubmit(htmlDialog) {
    // Add checked standard languages
    htmlDialog.find('input[name="lang"]:checked:not(:disabled)').each((i, el) => {
      const val = $(el).val();
      if (val && !this.languages.includes(val)) {
        this.languages.push(val);
      }
    });

    // Add custom language
    const custom = htmlDialog.find('input[name="custom"]').val().trim();
    if (custom && !this.languages.includes(custom)) {
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
