/**
 * Number formatting utilities for the character sheet
 */

export class NumberFormatter {
  /**
   * Format a number with commas for thousands separators
   * @param {number|string} num - The number to format
   * @returns {string} Formatted number string
   */
  static formatWithCommas(num) {
    if (num == null || num === '') return '';
    const numValue = typeof num === 'string' ? parseInt(num.replace(/,/g, '')) : num;
    return isNaN(numValue) ? '' : numValue.toLocaleString();
  }

  /**
   * Remove commas from a formatted number string
   * @param {string} str - The formatted number string
   * @returns {number} Clean number value
   */
  static parseFormatted(str) {
    if (typeof str !== 'string') return parseInt(str) || 0;
    return parseInt(str.replace(/,/g, '')) || 0;
  }

  /**
   * Format XP modifier with proper + or - sign
   * @param {number} modifier - The modifier value
   * @returns {string} Formatted modifier (e.g., "+10%", "-5%")
   */
  static formatXPModifier(modifier) {
    const sign = modifier >= 0 ? '+' : '';
    return `${sign}${modifier}%`;
  }

  /**
   * Set up automatic formatting for a numeric input field
   * @param {HTMLElement} field - The input field to format
   * @param {Object} options - Formatting options
   */
  static setupAutoFormat(field, options = {}) {
    if (!field) return;

    const { useCommas = true, allowNegative = false } = options;

    // Format on blur (when user leaves field)
    field.addEventListener('blur', () => {
      if (field.value && useCommas) {
        const value = this.parseFormatted(field.value);
        if (!allowNegative && value < 0) {
          field.value = '0';
        } else {
          field.value = this.formatWithCommas(value);
        }
      }
    });

    // Clean on focus (remove formatting for editing)
    field.addEventListener('focus', () => {
      if (useCommas && field.value) {
        field.value = this.parseFormatted(field.value).toString();
      }
    });

    // Validate input as user types
    field.addEventListener('input', (e) => {
      const value = e.target.value;
      // Allow only numbers, commas, and optionally minus sign
      const pattern = allowNegative ? /[^0-9,-]/g : /[^0-9,]/g;
      if (pattern.test(value)) {
        e.target.value = value.replace(pattern, '');
      }
    });
  }
}

// Make available globally for template usage
if (typeof window !== 'undefined') {
  window.NumberFormatter = NumberFormatter;
}
