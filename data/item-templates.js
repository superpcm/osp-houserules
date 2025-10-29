/**
 * ITEM TEMPLATE GENERATOR
 * 
 * Quick reference for creating new items.
 * Copy the appropriate template and fill in the values.
 */

// ============================================
// WEAPON TEMPLATE
// ============================================
const weaponTemplate = {
  name: "Weapon Name",
  type: "weapon",
  img: "icons/weapons/path/to/icon.webp",
  system: {
    description: "Description of the weapon",
    cost: 10,              // Cost in gold pieces
    weight: 50,            // Weight in coins (10 coins = 1 lb)
    quantity: { 
      value: 1,            // Current quantity
      max: 0               // Max quantity (0 = unlimited)
    },
    equipped: false,       // Is it currently equipped?
    damage: "1d8",         // Damage dice
    bonus: 0,              // Magic bonus (usually 0 for normal items)
    tags: [],              // Tags like ["melee", "two-handed", "slow"]
    melee: true,           // Can be used in melee?
    missile: false,        // Can be used as missile weapon?
    slow: false,           // Does it have slow weapon property?
    range: {               // Missile weapon ranges (0 if not missile)
      short: 0,
      medium: 0,
      long: 0
    }
  }
};

// ============================================
// ARMOR TEMPLATE
// ============================================
const armorTemplate = {
  name: "Armor Name",
  type: "armor",
  img: "icons/equipment/path/to/icon.webp",
  system: {
    description: "Description of the armor",
    cost: 50,              // Cost in gold pieces
    weight: 400,           // Weight in coins
    quantity: { 
      value: 1, 
      max: 0 
    },
    equipped: false,
    ac: {                  // Ascending AC (descending, lower is better)
      value: 5             // Armor Class value
    },
    aac: {                 // Ascending AC (ascending, higher is better)
      value: 14
    },
    type: "medium"         // "light", "medium", "heavy", or "shield"
  }
};

// ============================================
// ITEM TEMPLATE
// ============================================
const itemTemplate = {
  name: "Item Name",
  type: "item",
  img: "icons/sundries/path/to/icon.webp",
  system: {
    description: "Description of the item",
    cost: 1,               // Cost in gold pieces
    weight: 10,            // Weight in coins
    quantity: { 
      value: 1, 
      max: 0 
    },
    equipped: false,
    treasure: false        // Is this a treasure item?
  }
};

// ============================================
// CONTAINER TEMPLATE
// ============================================
const containerTemplate = {
  name: "Container Name",
  type: "container",
  img: "icons/containers/path/to/icon.webp",
  system: {
    description: "Description of the container",
    cost: 5,
    weight: 20,
    quantity: { 
      value: 1, 
      max: 0 
    },
    equipped: false,
    capacity: {
      type: "weight",      // Capacity type
      value: 0,            // Current capacity used
      max: 400             // Maximum capacity
    }
  }
};

// ============================================
// COMMON WEAPON VALUES
// ============================================

// DAMAGE BY WEAPON TYPE
const damageValues = {
  tiny: "1d3",          // Very small weapons
  small: "1d4",         // Dagger, sling, club
  normal: "1d6",        // Most one-handed weapons
  large: "1d8",         // Larger one-handed weapons, smaller two-handed
  huge: "1d10",         // Large two-handed weapons
  massive: "1d12"       // Massive two-handed weapons (rare in OSR)
};

// WEAPON RANGES (in feet)
const ranges = {
  thrown: {
    short: 10,
    medium: 20,
    long: 30
  },
  throwingAxe: {
    short: 10,
    medium: 20,
    long: 30
  },
  spear: {
    short: 20,
    medium: 40,
    long: 60
  },
  sling: {
    short: 40,
    medium: 80,
    long: 160
  },
  shortBow: {
    short: 50,
    medium: 100,
    long: 150
  },
  longBow: {
    short: 70,
    medium: 140,
    long: 210
  },
  crossbow: {
    short: 60,
    medium: 120,
    long: 180
  }
};

// WEAPON TAGS
const weaponTags = [
  "melee",           // Can be used in melee
  "missile",         // Can be used as ranged weapon
  "two-handed",      // Requires two hands
  "slow",            // Cannot attack every round
  "brace",           // Can be set against charge
  "versatile",       // Can be used one or two handed
  "finesse",         // Can use DEX instead of STR
  "silver"           // Made of silver (for special creatures)
];

// ============================================
// COMMON COSTS (in Gold Pieces)
// ============================================

const commonCosts = {
  // Weapons
  club: 0.02,
  dagger: 3,
  handAxe: 4,
  mace: 5,
  spear: 3,
  shortSword: 7,
  sword: 10,
  battleAxe: 7,
  twoHandedSword: 15,
  poleArm: 7,
  shortBow: 25,
  longBow: 40,
  crossbow: 30,
  sling: 0.02,
  
  // Armor
  leather: 20,
  chainMail: 40,
  plateMail: 60,
  shield: 10,
  
  // Equipment
  backpack: 5,
  rope50ft: 1,
  torch: 0.01,
  lantern: 10,
  oilFlask: 2,
  ironRationsWeek: 15,
  waterskin: 1,
  crowbar: 10,
  spikes12: 1,
  hammerSmall: 2,
  whetstone: 0.02,
  tinderBox: 0.08
};

// ============================================
// COMMON WEIGHTS (in coins, 10 coins = 1 lb)
// ============================================

const commonWeights = {
  // Light weapons
  dagger: 10,
  club: 50,
  handAxe: 30,
  mace: 30,
  
  // Medium weapons
  sword: 60,
  shortSword: 30,
  spear: 30,
  battleAxe: 50,
  
  // Heavy weapons
  twoHandedSword: 150,
  poleArm: 150,
  
  // Ranged
  shortBow: 30,
  longBow: 30,
  crossbow: 50,
  sling: 2,
  
  // Ammunition
  arrows20: 10,
  bolts30: 10,
  stones20: 10,
  
  // Armor
  leather: 200,
  chainMail: 400,
  plateMail: 500,
  shield: 100,
  
  // Equipment
  backpack: 20,
  rope50ft: 20,
  torch: 1,
  lantern: 20,
  oilFlask: 10,
  ironRationsWeek: 70,
  waterskin: 10
};

// ============================================
// ARMOR CLASS VALUES
// ============================================

const armorValues = {
  unarmored: { ac: 9, aac: 10 },
  leather: { ac: 7, aac: 12 },
  studded: { ac: 7, aac: 12 },
  chainMail: { ac: 5, aac: 14 },
  bandedMail: { ac: 4, aac: 15 },
  plateMail: { ac: 3, aac: 16 },
  shield: { ac: -1, aac: 1 }  // Bonus, not replacement
};

// ============================================
// EXAMPLE COMPLETE ITEMS
// ============================================

const examples = [
  // Melee weapon
  {
    name: "Longsword +1",
    type: "weapon",
    img: "icons/weapons/swords/sword-guard-engraved-gold.webp",
    system: {
      description: "A finely crafted blade with a +1 magical bonus to attack and damage.",
      cost: 1000,
      weight: 60,
      quantity: { value: 1, max: 0 },
      equipped: false,
      damage: "1d8",
      bonus: 1,
      tags: ["melee", "magic"],
      melee: true,
      missile: false,
      slow: false,
      range: { short: 0, medium: 0, long: 0 }
    }
  },
  
  // Missile weapon
  {
    name: "Composite Longbow",
    type: "weapon",
    img: "icons/weapons/bows/bow-recurve-ornate.webp",
    system: {
      description: "A powerful composite bow that adds STR bonus to damage.",
      cost: 100,
      weight: 30,
      quantity: { value: 1, max: 0 },
      equipped: false,
      damage: "1d6",
      bonus: 0,
      tags: ["missile", "two-handed", "composite"],
      melee: false,
      missile: true,
      slow: false,
      range: { short: 70, medium: 140, long: 210 }
    }
  },
  
  // Magic armor
  {
    name: "Chain Mail +1",
    type: "armor",
    img: "icons/equipment/chest/breastplate-layered-steel-grey.webp",
    system: {
      description: "Enchanted chain mail that provides better protection than normal.",
      cost: 2000,
      weight: 400,
      quantity: { value: 1, max: 0 },
      equipped: false,
      ac: { value: 4 },
      aac: { value: 15 },
      type: "medium"
    }
  },
  
  // Consumable item
  {
    name: "Healing Potion",
    type: "item",
    img: "icons/consumables/potions/potion-bottle-corked-labeled-red.webp",
    system: {
      description: "Restores 1d8 hit points when consumed.",
      cost: 50,
      weight: 1,
      quantity: { value: 1, max: 0 },
      equipped: false,
      treasure: true
    }
  }
];

// ============================================
// QUICK TIPS
// ============================================

/*
TIPS FOR CREATING ITEMS:

1. CONSISTENCY
   - Keep naming conventions consistent
   - Use standard OSR values for familiarity
   - Match damage/AC to class tables

2. BALANCE
   - Magic items should be rare and valuable
   - Cost should reflect power and availability
   - Weight affects encumbrance

3. DESCRIPTION
   - Include mechanical effects in description
   - Note special properties (two-handed, slow, etc.)
   - Mention usage restrictions

4. ICONS
   - Use descriptive, clear icons
   - Match icon to item type/appearance
   - Browse Foundry's built-in icon library

5. TAGS
   - Use tags for filtering and searching
   - Include damage type if using house rules
   - Add special properties as tags

6. TESTING
   - Import a few items first
   - Test on character sheet
   - Verify calculations work correctly
*/

// Export templates for easy copying
export {
  weaponTemplate,
  armorTemplate,
  itemTemplate,
  containerTemplate,
  damageValues,
  ranges,
  weaponTags,
  commonCosts,
  commonWeights,
  armorValues,
  examples
};
