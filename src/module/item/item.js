export class OspItem extends Item {
  /** @override — all players can view (observe) any item in the world directory */
  testUserPermission(user, permission, { exact = false } = {}) {
    const level = typeof permission === "string"
      ? CONST.DOCUMENT_OWNERSHIP_LEVELS[permission]
      : permission;
    if (level <= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) return true;
    return super.testUserPermission(user, permission, { exact });
  }

  /** @override */
  prepareData() {
    super.prepareData();
    
    // Calculate cumulative properties for items
    if (this.type === "item" && this.system.treasure) {
      const quantity = this.system.quantity || 1;
      
      this.system.cumulativeCost = this.system.cost * quantity;
      this.system.cumulativeWeight = this.system.unitWeight * quantity;
    }
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /**
   * Get the item's tags for display
   */
  get displayTags() {
    if (this.type === "weapon" && this.system.tags) {
      return this.system.tags.map(tag => {
        return {
          value: tag,
          title: tag
        };
      });
    }
    return [];
  }

  /**
   * Check if the item is a weapon that can be used for attacks
   */
  get isWeapon() {
    return this.type === "weapon";
  }

  /**
   * Check if the item is equipped
   */
  get isEquipped() {
    return this.system.equipped || false;
  }
}
