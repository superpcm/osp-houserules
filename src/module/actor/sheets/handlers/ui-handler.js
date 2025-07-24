/**
 * Handles UI state management (category toggles, etc.)
 */
export class UIHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
  }

  /**
   * Initialize UI state management
   */
  initialize() {
    this.html.find('.category-caret').click(this.onCategoryToggle.bind(this));
  }

  /**
   * Handle toggling category visibility
   */
  onCategoryToggle(event) {
    event.preventDefault();
    const caret = event.currentTarget;
    const category = $(caret).closest('.item-category');
    const list = category.find('.item-list');
    
    list.slideToggle(200);
    $(caret).find('i').toggleClass('fa-caret-down fa-caret-right');
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    this.html.find('.category-caret').off('click');
  }
}
