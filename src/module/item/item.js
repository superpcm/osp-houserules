import { unitWeightPounds } from '../inventory/encumbrance.js';
import { handCost, handsUsed } from '../inventory/hand-capacity.js';

export class OspItem extends Item {
  static async createDocuments(data = [], context = {}) {
    const actor = context?.parent?.type === 'character' ? context.parent : null;
    if (actor) {
      const incoming = Array.isArray(data) ? data : [data];
      const existing = actor.items ?? [];
      const incomingCost = incoming
        .filter(entry => entry?.system?.equipped)
        .reduce((sum, entry) => sum + handCost(entry), 0);
      const existingCost = handsUsed(existing);
      if (incomingCost > 0 && existingCost + incomingCost > 2) {
        globalThis.ui?.notifications?.error?.('These items cannot be equipped together — no free hand is available.');
        throw new Error('Item creation would exceed the character hand capacity.');
      }
    }
    return super.createDocuments?.(data, context);
  }

  _handCapacityActor() {
    const actor = this.parent?.documentName === 'Actor' || this.parent?.type === 'character' ? this.parent : this.actor;
    return actor?.type === 'character' ? actor : null;
  }

  _handCapacityItems(actor) {
    return actor?.items ?? [];
  }

  _handCapacityAllows(actor, item = this, excludeId = this.id) {
    return handsUsed(this._handCapacityItems(actor), excludeId) + handCost(item) <= 2;
  }

  /** Prevent direct creation of an equipped character item that exceeds two hands. */
  async _preCreate(data, options, user) {
    const result = await super._preCreate?.(data, options, user);
    if (result === false) return false;
    const actor = this._handCapacityActor();
    if (!actor || !(data?.system?.equipped ?? this.system?.equipped) || !handCost(this)) return result;
    if (!this._handCapacityAllows(actor, this, null)) {
      globalThis.ui?.notifications?.error?.(`${this.name} cannot be equipped — no free hand is available.`);
      return false;
    }
    return result;
  }

  /** Prevent direct equip transitions while allowing neutral updates to legacy overfull actors. */
  async _preUpdate(changes, options, user) {
    const result = await super._preUpdate?.(changes, options, user);
    if (result === false) return false;
    const actor = this._handCapacityActor();
    if (!actor) return result;
    const dottedSystem = Object.fromEntries(Object.entries(changes ?? {})
      .filter(([key]) => key.startsWith('system.'))
      .map(([key, value]) => [key.slice(7), value]));
    const changedSystem = { ...dottedSystem, ...(changes?.system ?? {}) };
    const nextEquipped = changedSystem.equipped ?? this.system?.equipped;
    const wasEquipped = Boolean(this.system?.equipped);
    const wasCost = handCost(this);
    const source = this.toObject?.() ?? { name: this.name, type: this.type, system: this.system };
    const nextItem = { ...source, name: changes?.name ?? source.name, type: changes?.type ?? source.type,
      system: { ...source.system, ...changedSystem } };
    const nextCost = handCost(nextItem);
    const increasesHandUse = nextEquipped === true && (!wasEquipped || nextCost > wasCost);
    if (!increasesHandUse || !nextCost) return result;
    if (!this._handCapacityAllows(actor, nextItem, this.id)) {
      globalThis.ui?.notifications?.error?.(`${this.name} cannot be equipped — no free hand is available.`);
      return false;
    }
    return result;
  }

  /** @override */
  prepareData() {
    super.prepareData();
    
    // Calculate cumulative properties for items
    if (this.type === "item" && this.system.treasure) {
      const rawQuantity = this.system.quantity && typeof this.system.quantity === 'object' ? this.system.quantity.value : this.system.quantity;
      const parsedQuantity = Number(rawQuantity);
      const quantity = rawQuantity === undefined || rawQuantity === null || rawQuantity === '' ? 1 : (Number.isFinite(parsedQuantity) && parsedQuantity >= 0 ? parsedQuantity : 0);
      
      const rawCost = Number(this.system.cost);
      const rawWeight = unitWeightPounds(this);
      const cost = Number.isFinite(rawCost) && rawCost >= 0 ? rawCost : 0;
      const unitWeight = rawWeight;
      this.system.cumulativeCost = cost * quantity;
      this.system.cumulativeWeight = unitWeight * quantity;
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
