import { clothingWearRejection, isWornClothing, resolveClothingWearCategory } from '../inventory/clothing-wear.js';
import { normalizeQuantity, unitWeightPounds } from '../inventory/encumbrance.js';
import { handCost, handsUsed } from '../inventory/hand-capacity.js';
import { ARROW_BUNDLE_FLAG, SYSTEM_ID, getArrowBundleValidationError } from '../inventory/arrow-bundle.js';
import { getTorchBundleValidationError } from '../inventory/torch-bundle.js';
import { getBoltBundleValidationError } from '../inventory/bolt-bundle.js';
import { isBackpack, isRollableGarment } from '../inventory/long-item-transport.js';

export class OspItem extends Item {
  static async createDocuments(data = [], context = {}) {
    const actor = context?.parent?.type === 'character' ? context.parent : null;
    if (actor) {
      const incoming = Array.isArray(data) ? data : [data];
      const existing = actor.items ?? [];
      const prospectiveClothing = [...existing];
      for (const entry of incoming) {
        if (isWornClothing(entry)) {
          const reason = clothingWearRejection(entry, prospectiveClothing);
          if (reason) { globalThis.ui?.notifications?.error?.(reason); throw new Error(reason); }
        }
        prospectiveClothing.push(entry);
      }

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
    const bundleError = getArrowBundleValidationError({ ...data, type: data?.type ?? this.type, system: data?.system ?? this.system, flags: data?.flags ?? this.flags });
    if (bundleError) return false;
    const torchError = getTorchBundleValidationError({ ...data, type: data?.type ?? this.type, system: data?.system ?? this.system, flags: data?.flags ?? this.flags });
    if (torchError) return false;
    const boltError = getBoltBundleValidationError({ ...data, type: data?.type ?? this.type, system: data?.system ?? this.system, flags: data?.flags ?? this.flags });
    if (boltError) return false;
    const actor = this._handCapacityActor();
    const inventory = actor?.items ?? [];
    const prospective = { ...data, id: data?._id ?? data?.id ?? this.id, name: data?.name ?? this.name, type: data?.type ?? this.type,
      system: { ...(this.system ?? {}), ...(data?.system ?? {}) } };
    if (prospective.type === 'clothing') {
      const category = resolveClothingWearCategory(prospective);
      if (category && prospective.system.slot !== category) {
        this.updateSource?.({ 'system.slot': category });
        prospective.system.slot = category;
      }
      if (actor && isWornClothing(prospective)) {
        const reason = clothingWearRejection(prospective, inventory);
        if (reason) { globalThis.ui?.notifications?.error?.(reason); return false; }
      }
    }
    const parent = inventory.find(item => item?.id === prospective.system?.containerId);
    if (isRollableGarment(prospective) && prospective.system?.lashed) {
      if (!isBackpack(parent) || prospective.system?.equipped || inventory.some(item => item?.system?.containerId === prospective.id)) return false;
    }
    if (parent?.system?.lashed && isRollableGarment(parent)) return false;
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
    const bundleDottedSystem = Object.fromEntries(Object.entries(changes ?? {})
      .filter(([key]) => key.startsWith('system.')).map(([key, value]) => [key.slice(7), value]));
    // Match Foundry's recursive flag updates, including nested/dotted deletions.
    // Replacing a whole scope here would accidentally hide existing bundle flags.
    const mergeFlags = (target, patch) => {
      for (const [path, value] of Object.entries(patch ?? {})) {
        const parts = path.split('.');
        let parent = target;
        for (const part of parts.slice(0, -1)) {
          if (!parent[part] || typeof parent[part] !== 'object' || Array.isArray(parent[part])) parent[part] = {};
          parent = parent[part];
        }
        const key = parts.at(-1);
        if (key.startsWith('-=')) delete parent[key.slice(2)];
        else if (value && typeof value === 'object' && !Array.isArray(value)) {
          if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) parent[key] = {};
          mergeFlags(parent[key], value);
        } else parent[key] = structuredClone(value);
      }
      return target;
    };
    const nextFlags = options?.recursive === false && Object.hasOwn(changes ?? {}, 'flags') ? {} : structuredClone(this.flags ?? {});
    mergeFlags(nextFlags, changes?.flags);
    mergeFlags(nextFlags, Object.fromEntries(Object.entries(changes ?? {}).filter(([key]) => key.startsWith('flags.')).map(([key, value]) => [key.slice(6), value])));
    const next = {
      ...this.toObject?.(),
      name: changes?.name ?? this.name,
      type: changes?.type ?? this.type,
      system: { ...(this.system ?? {}), ...bundleDottedSystem, ...(changes?.system ?? {}) },
      flags: nextFlags,
    };
    const bundleError = getArrowBundleValidationError(next);
    if (bundleError) return false;
    const torchError = getTorchBundleValidationError(next);
    if (torchError) return false;
    const boltError = getBoltBundleValidationError(next);
    if (boltError) return false;
    const actor = this._handCapacityActor();
    const inventory = actor?.items ?? [];
    if (actor && isWornClothing(next)) {
      const beforeCategory = resolveClothingWearCategory(this);
      const nextCategory = resolveClothingWearCategory(next);
      const beforeQty = normalizeQuantity(this.system?.quantity);
      const nextQty = normalizeQuantity(next.system?.quantity);
      const alreadyWorn = isWornClothing(this);
      // Metadata-only updates must preserve legacy conflicts. Only new/worsened wear
      // is rejected; fixing an old worn stack down to one remains allowed.
      const samePosition = alreadyWorn && beforeCategory === nextCategory;
      const reducingOldStack = samePosition && beforeQty > 1 && nextQty === 1;
      if (!reducingOldStack && (!samePosition || beforeQty !== nextQty)) {
        const reason = clothingWearRejection(next, inventory, { excludeId: this.id });
        if (reason) { globalThis.ui?.notifications?.error?.(reason); return false; }
      }
    }
    const prospectiveParent = inventory.find(item => item?.id === next.system?.containerId);
    const prospectiveChildren = inventory.filter(item => item?.id !== this.id && item?.system?.containerId === this.id);
    if (isRollableGarment(next) && next.system?.lashed) {
      if (!isBackpack(prospectiveParent) || next.system?.equipped || prospectiveChildren.length) return false;
    }
    if (prospectiveParent?.system?.lashed && isRollableGarment(prospectiveParent)) return false;
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
