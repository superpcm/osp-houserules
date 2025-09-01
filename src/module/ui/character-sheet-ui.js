/**
 * Character Sheet UI Module
 * Handles all client-side JavaScript for the character sheet template
 */

import { calculateXPModifier, getNextLevelXP } from '../../config/classes.js';

export class CharacterSheetUI {
  constructor() {
    this.xpHandlerUpdating = false;
  }

  /**
   * Initialize all UI handlers for the character sheet
   */
  initialize() {
    this.setupXPModifierUpdates();
    this.setupXPFieldFormatting();
    this.setupNextLevelUpdates();
    this.setupFormValidation();
  }

  /**
   * Update XP modifier display based on class and attributes
   */
  updateXPModifier() {
    const xpModField = document.getElementById('xp-mod-display');
    if (!xpModField) return;

    // Get current character data from form fields
    const characterClass = document.querySelector('.char-class')?.value || '';
    const attributes = {
      str: { value: parseInt(document.querySelector('.attr-str')?.value) || 10 },
      dex: { value: parseInt(document.querySelector('.attr-dex')?.value) || 10 },
      con: { value: parseInt(document.querySelector('.attr-con')?.value) || 10 },
      int: { value: parseInt(document.querySelector('.attr-int')?.value) || 10 },
      wis: { value: parseInt(document.querySelector('.attr-wis')?.value) || 10 },
      cha: { value: parseInt(document.querySelector('.attr-cha')?.value) || 10 }
    };

    // Calculate XP modifier using centralized logic
    const xpMod = calculateXPModifier(characterClass, attributes);

    // Format and display the modifier
    const formattedMod = xpMod >= 0 ? `+${xpMod}%` : `${xpMod}%`;
    xpModField.value = formattedMod;
  }

  /**
   * Format numbers with commas for better readability
   */
  formatNumberWithCommas(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Update XP display with proper formatting
   */
  updateXPDisplay() {
    const xpField = document.getElementById('xp-display');
    if (!xpField) return;

    // Check if we're in the middle of an XP update by our handler
    if (this.xpHandlerUpdating) return;

    // Only format if not currently focused (to avoid interfering with user input)
    if (document.activeElement !== xpField) {
      const currentXP = parseInt(xpField.value.replace(/,/g, '')) || 0;
      xpField.value = this.formatNumberWithCommas(currentXP);
    }
  }

  /**
   * Setup XP field formatting and event handlers
   */
  setupXPFieldFormatting() {
    const xpField = document.getElementById('xp-display');
    if (!xpField) return;

    // Format on blur (when user leaves the field)
    xpField.addEventListener('blur', () => {
      this.updateXPDisplay();
    });

    // Clean input on focus (remove commas for editing)
    xpField.addEventListener('focus', () => {
      const rawValue = xpField.value.replace(/,/g, '');
      xpField.value = rawValue;
    });

    // Initial formatting
    this.updateXPDisplay();
  }

  /**
   * Setup XP modifier update triggers
   */
  setupXPModifierUpdates() {
    // Update XP modifier when class or attributes change
    const classField = document.querySelector('.char-class');
    const attrFields = document.querySelectorAll('[class*="attr-"]');

    if (classField) {
      classField.addEventListener('change', () => this.updateXPModifier());
    }

    attrFields.forEach(field => {
      field.addEventListener('change', () => this.updateXPModifier());
      field.addEventListener('input', () => this.updateXPModifier());
    });

    // Initial calculation
    this.updateXPModifier();
  }

  /**
   * Setup next level XP calculation and display
   */
  setupNextLevelUpdates() {
    const levelField = document.querySelector('[name="system.level"]');
    const classField = document.querySelector('.char-class');
    const nextLevelField = document.getElementById('next-level-display');

    if (!nextLevelField) return;

    const updateNextLevel = () => {
      const level = parseInt(levelField?.value) || 1;
      const characterClass = classField?.value || 'fighter';
      
      const nextLevelXP = getNextLevelXP(characterClass, level);
      nextLevelField.value = this.formatNumberWithCommas(nextLevelXP);
    };

    if (levelField) {
      levelField.addEventListener('change', updateNextLevel);
    }
    if (classField) {
      classField.addEventListener('change', updateNextLevel);
    }

    // Initial calculation
    updateNextLevel();
  }

  /**
   * Setup basic form validation
   */
  setupFormValidation() {
    // Add validation for numeric fields
    const numericFields = document.querySelectorAll('input[type="number"]');
    
    numericFields.forEach(field => {
      field.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const min = parseInt(e.target.min);
        const max = parseInt(e.target.max);

        if (!isNaN(min) && value < min) {
          e.target.value = min;
        }
        if (!isNaN(max) && value > max) {
          e.target.value = max;
        }
      });
    });
  }

  /**
   * Cleanup event listeners when sheet is destroyed
   */
  destroy() {
    // Remove any global event listeners if needed
    this.xpHandlerUpdating = false;
  }
}

// Export for use in templates
export function initializeCharacterSheetUI() {
  const ui = new CharacterSheetUI();
  ui.initialize();
  return ui;
}
