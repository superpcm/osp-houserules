import { healthSnapshot, conditionEffects } from '../health/health-rules.js';
import { calculateXPModifier, getLevelFromXP, getNextLevelXP, getPrimeRequisites } from "../../config/classes.js";
import { deriveExplorationSkills } from "./exploration-skills.js";
import { createCharacterFromPrompt } from "./character-creation-dialog.js";
import { getSavingThrowModifiers, getSavingThrowTarget } from './saving-throws.js';
import { calculatePersonalEncumbrance, isCarriedByMountOrVehicle } from '../inventory/encumbrance.js';
import { getUnauthorizedAbilityScoreChanges } from './ability-score-permissions.js';
import { ospDialogOptions } from '../dialog/dialog-theme.js';

export class OspActor extends Actor {
  constructor(data, context) {

    super(data, context);
  }

  /** Character ability scores are GM-managed; preserve all other actor updates. */
  async _preUpdate(changes, options, user) {
    const result = await super._preUpdate(changes, options, user);
    if (result === false) return false;
    const requester = user ?? globalThis.game?.user;
    if (this.type !== 'character' || requester?.isGM) return result;
    const blocked = getUnauthorizedAbilityScoreChanges(changes, this.system);
    if (!blocked.length) return result;
    globalThis.ui?.notifications?.warn?.('Only the Game Master can change ability scores.');
    return false;
  }

  /** Use the OSP creation flow before Foundry's callback can render an undefined document. */
  static async createDialog(data = {}, createOptions = {}, dialogOptions = {}, renderOptions = {}) {
    const type = data.type || 'character';
    const attrs = data.system?.attributes;
    const blankCharacter = type === 'character'
      && !(attrs && Object.values(attrs).some((attribute) => Number(attribute?.value) > 0));
    if (!blankCharacter || createOptions.osprSkipDialog) return super.createDialog(data, createOptions, dialogOptions, renderOptions);

    return new Promise((resolve) => {
      let settled = false;
      let submitting = false;
      const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
      const dialog = new foundry.applications.api.DialogV2(ospDialogOptions({
        window: { title: game.i18n?.localize?.('OSE.dialog.CharacterCreation') || 'Create Actor' },
        content: `<div class="form-group"><label for="osp-create-name">Name</label><input id="osp-create-name" name="name" type="text" value="${foundry.utils.escapeHTML(data.name || '')}" autofocus></div><div class="form-group"><label for="osp-create-type">Type</label><select id="osp-create-type" name="type"><option value="character">Character</option><option value="monster">Monster</option></select></div><div class="form-group"><label for="osp-create-folder">Folder</label><select id="osp-create-folder" name="folder"><option value="">— None —</option>${game.folders.filter((folder) => folder.type === 'Actor').map((folder) => `<option value="${folder.id}"${folder.id === data.folder ? ' selected' : ''}>${foundry.utils.escapeHTML(folder.name)}</option>`).join('')}</select></div>`,
        buttons: [{ action: 'create', label: 'Create', default: true, callback: async (_event, _button, app) => {
          submitting = true;
          const root = app?.element || dialog.element;
          const value = (selector) => root?.querySelector(selector)?.value || '';
          const sourceData = foundry.utils.deepClone(data);
          sourceData.name = value('[name="name"]') || data.name || 'New Actor';
          sourceData.type = value('[name="type"]') || 'character';
          sourceData.folder = value('[name="folder"]') || null;
          let actor;
          if (sourceData.type === 'character') {
            actor = await createCharacterFromPrompt(sourceData, {
              create: (actorData, helperOptions) => this.create(actorData, { ...createOptions, ...helperOptions, renderSheet: false })
            });
          } else {
            actor = await this.create(sourceData, { ...createOptions, renderSheet: false });
          }
          if (actor) await actor.sheet?.render(true, renderOptions);
          finish(actor || null);
        } }, { action: 'cancel', label: 'Cancel', callback: () => finish(null) }],
        close: () => { if (!submitting) finish(null); },
        ...dialogOptions,
      }));
      dialog.render({ force: true });
    });
  }

    /**
   * Calculate saving throws based on class, level, and race
   * @private
   */
  _calculateSavingThrows() {
    if (!this.system.saves) this.system.saves = {};
    const attributes = this.system.attributes || {};
    const options = {
      className: this.system.class || '', level: this.system.level,
      race: this.system.race, con: attributes.con?.value ?? 10, wis: attributes.wis?.value ?? 10,
      situationalBonus: conditionEffects(healthSnapshot(this)).savePenalty
    };
    for (const saveType of ['death', 'wands', 'paralysis', 'breath', 'spells']) {
      if (!this.system.saves[saveType]) this.system.saves[saveType] = {};
      this.system.saves[saveType].value = getSavingThrowTarget({ ...options, saveType });
    }
    this.system.saves.death.poisonValue = getSavingThrowTarget({ ...options, saveType: 'death', poison: true });
    const modifiers = getSavingThrowModifiers(options);
    this.system.saves.magicModifier = modifiers.magic;
    this.system.saves.resilienceBonus = modifiers.wands;
  }

  /**
   * Derive level from current XP and class. Must run before other calculations that read system.level.
   */
  _calculateLevel() {
    const characterClass = this.system.class || '';
    if (!characterClass) return;
    const xp = parseInt(String(this.system.xp ?? 0).replace(/,/g, '')) || 0;
    this.system.level = getLevelFromXP(characterClass, xp, this.system.race || '');
  }

  /**
   * Calculate next level XP based on class and current level
   * @private
   */
  _calculateNextLevelXP() {
    const characterClass = this.system.class || '';
    const level = parseInt(this.system.level) || 1;

    this.system.nextLevelXP = getNextLevelXP(characterClass, level, this.system.race || '');
  }

  /**
   * Calculate XP modifier based on class prime requisites
   * @private
   */
  _calculateXPModifier() {
    const characterClass = this.system.class || '';
    const attributes = this.system.attributes || {};
    
    this.system.xpModifier = calculateXPModifier(characterClass, attributes);
  }

  /** @override */
  get displayName() {
    return "Actor";
  }

  /** @override */
  get displayNamePlural() {
    return "Actors";
  }

  /** @override */
  prepareData() {
    super.prepareData();
    // Add any system-specific actor prep here
  }

  /** @override */
  prepareDerivedData() {

    super.prepareDerivedData();

    // Prepare character-specific data
    if (this.type === "character") {

      this._prepareCharacterData();
    }
  }

  /**
   * Prepare character-specific data
   * @private
   */
  _prepareCharacterData() {


    // Organize items by type
    this.system.weapons = this.items.filter(item => item.type === "weapon");
    this.system.armor = this.items.filter(item => item.type === "armor");
    this.system.containers = this.items.filter(item => item.type === "container");
    this.system.items = this.items.filter(item => (item.type === "item" || item.type === "coin" || item.type === "clothing" || item.type === "ammunition" || item.type === "livestock") && !item.system.treasure);
    this.system.treasures = this.items.filter(item => item.type === "item" && item.system.treasure);

    // Sync container equipped state based on location
    // Top-level containers = equipped, nested containers = unequipped
    this.system.containers.forEach(container => {
      const shouldBeEquipped = !container.system.containerId;
      if (container.system.equipped !== shouldBeEquipped) {
        // Silently sync the state (don't trigger update, just fix display)
        container.system.equipped = shouldBeEquipped;
      }
    });

    // Derive level from XP — must run first; saves, HP, and nextLevelXP all depend on it
    this._calculateLevel();

    // Calculate encumbrance
    this._calculateEncumbrance();

    // Calculate saving throws
    this._calculateSavingThrows();

    // Calculate next level XP
    this._calculateNextLevelXP();

    // Calculate XP modifier
    this._calculateXPModifier();

    // Derive read-only racial/class exploration values without page-global DOM scripts.
    Object.assign(this.system, deriveExplorationSkills(this.system));

    // Calculate Armor Class
    this._calculateArmorClass();
  }

  /**
   * Calculate encumbrance for the character
   * @private
   */
  /**
   * True if `item` is a Vehicle/Livestock, or is nested (directly or transitively, via
   * containerId) inside one — cargo in a Cart's bed, tack worn by a mount, or anything lashed/
   * stored inside that tack (e.g. a sword lashed to a Saddle). All of that weight is carried by
   * the vehicle/animal, not the character, so none of it should count toward personal
   * encumbrance no matter how deep the nesting goes.
   * @private
   */
  _isCarriedByMountOrVehicle(item, visited = new Set()) {
    return isCarriedByMountOrVehicle(item, id => this.items.get(id), visited);
  }

  _calculateEncumbrance() {
    const result = calculatePersonalEncumbrance({ items: [...this.items], strength: this.system.attributes?.str?.value, race: this.system.race, getParent: id => this.items.get(id) });

    // Update the encumbrance object in system data (matches template.json structure)
    this.system.encumbrance = {
      weight: {
        value: result.totalWeight,
        max: result.maxWeight
      },
      level: result.level,
      movement: result.tactical,
      // Legacy properties for character sheet compatibility
      totalWeight: result.totalWeight,
      maxWeight: result.maxWeight,
      percentage: Math.round(result.percentage),
      encumbered: result.level !== 'unencumbered'
    };

    // Calculate movement rates
    this.system.movement = {
      tactical: result.tactical,
      overland: result.explore,
      dash: result.dash
    };
  }

  /**
   * Calculate Armor Class
   * @private
   */
  _calculateArmorClass() {
    // Start with base AC (unarmored)
    let calculatedAC = 10;

    // Add DEX modifier (AC modifier from dexterity attribute), capped by equipped armor's maxDex
    const dexScore = parseInt(this.system.attributes?.dex?.value) || 10;
    const rawDexMod = this._getAttributeModifier(dexScore);

    // Get equipped armor (non-shield armor pieces)
    const equippedNonShield = this.system.armor.filter(item =>
      item.system.equipped && item.system.type !== "shield"
    );

    // "Underarmor" (e.g. Gambeson) acts as a base armor when worn alone, but as a
    // shield-like +1 bonus when worn beneath another equipped armor from its allow list.
    const isPairedUnderArmor = (item) => {
      const tags = item.system.tags || [];
      if (!tags.includes("underarmor")) return false;
      const allowList = item.system.allowedArmors || [];
      return equippedNonShield.some(other =>
        other !== item && allowList.includes(other.name)
      );
    };

    const pairedUnderArmor = equippedNonShield.filter(isPairedUnderArmor);
    const equippedArmor = equippedNonShield.filter(item => !isPairedUnderArmor(item));

    // Determine effective DEX mod: lowest maxDex among equipped armor caps the bonus
    let dexMod = rawDexMod;
    if (equippedArmor.length > 0) {
      const lowestMaxDex = Math.min(...equippedArmor.map(armor => {
        const max = armor.system.maxDex;
        return (max !== null && max !== undefined && max !== "") ? parseInt(max) : Infinity;
      }));
      if (isFinite(lowestMaxDex)) dexMod = Math.min(rawDexMod, lowestMaxDex);
    }
    calculatedAC += dexMod;

    // Use the highest armor AAC value as base (armor AAC replaces base 10, doesn't add to it)
    if (equippedArmor.length > 0) {
      const highestArmorAC = Math.max(...equippedArmor.map(armor =>
        (parseInt(armor.system.aac?.value) || 0) + (parseInt(armor.system.bonus) || 0)
      ));
      // Only apply if the armor actually provides AC; 0 means unset, not "AC 0"
      if (highestArmorAC > 0) {
        calculatedAC = calculatedAC - 10 + highestArmorAC;
      }
    }

    // Add shield bonuses (shields add to AC, they don't replace it)
    const equippedShields = this.system.armor.filter(item =>
      item.system.equipped && item.system.type === "shield"
    );
    equippedShields.forEach(shield => {
      const shieldBonus = (parseInt(shield.system.aac?.value) || 0) + (parseInt(shield.system.bonus) || 0);
      calculatedAC += shieldBonus;
    });

    // Add paired underarmor bonuses (e.g. Gambeson worn beneath compatible armor)
    pairedUnderArmor.forEach(item => {
      calculatedAC += parseInt(item.system.pairedBonus) || 0;
    });

    // Store the calculated AC
    this.system.ac = calculatedAC;
  }

  /**
   * Get attribute modifier for a given attribute score
   * @param {number} score - The attribute score
   * @returns {number} The modifier
   * @private
   */
  _getAttributeModifier(score) {
    // Standard B/X D&D attribute modifier table
    if (score <= 3) return -3;
    if (score <= 5) return -2;
    if (score <= 8) return -1;
    if (score <= 12) return 0;
    if (score <= 15) return 1;
    if (score <= 17) return 2;
    return 3; // 18+
  }
}
