/** Exact bundled OSE AF Tome v1.3 progression, with approved v1.5 custom replacements.
 * Synchronous constants let actor preparation use the rules without async loading.
 * Source-parity tests compare every row against the bundled documents.
 */

export const CLASS_PROGRESSION = {
  "assassin": {
    "id": "assassin",
    "name": "Assassin",
    "maximumLevel": 14,
    "hitDie": "1d4",
    "primeRequisites": [
      "DEX"
    ],
    "xp": [
      0,
      1500,
      3000,
      6000,
      12000,
      25000,
      50000,
      100000,
      200000,
      300000,
      425000,
      575000,
      750000,
      900000
    ],
    "attack": [
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2,
      5,
      5,
      5,
      5,
      7,
      7
    ],
    "hitPoints": [
      "1d4",
      "2d4",
      "3d4",
      "4d4",
      "5d4",
      "6d4",
      "7d4",
      "8d4",
      "9d4",
      "9d4+2*",
      "9d4+4*",
      "9d4+6*",
      "9d4+8*",
      "9d4+10*"
    ]
  },
  "barbarian": {
    "id": "barbarian",
    "name": "Barbarian",
    "maximumLevel": 14,
    "hitDie": "1d8",
    "primeRequisites": [
      "STR",
      "CON"
    ],
    "xp": [
      0,
      2500,
      5000,
      10000,
      18500,
      37000,
      85000,
      140000,
      270000,
      400000,
      530000,
      660000,
      790000,
      920000
    ],
    "attack": [
      0,
      0,
      0,
      2,
      2,
      2,
      5,
      5,
      5,
      7,
      7,
      7,
      9,
      9
    ],
    "hitPoints": [
      "1d8",
      "2d8",
      "3d8",
      "4d8",
      "5d8",
      "6d8",
      "7d8",
      "8d8",
      "9d8",
      "9d8+3*",
      "9d8+6*",
      "9d8+9*",
      "9d8+12*",
      "9d8+15*"
    ]
  },
  "bard": {
    "id": "bard",
    "name": "Bard",
    "maximumLevel": 14,
    "hitDie": "1d6",
    "primeRequisites": [
      "CHA"
    ],
    "xp": [
      0,
      2000,
      4000,
      8000,
      16000,
      32000,
      64000,
      120000,
      240000,
      360000,
      480000,
      600000,
      720000,
      840000
    ],
    "attack": [
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2,
      5,
      5,
      5,
      5,
      7,
      7
    ],
    "hitPoints": [
      "1d6",
      "2d6",
      "3d6",
      "4d6",
      "5d6",
      "6d6",
      "7d6",
      "8d6",
      "9d6",
      "9d6+2*",
      "9d6+4*",
      "9d6+6*",
      "9d6+8*",
      "9d6+10*"
    ]
  },
  "cleric": {
    "id": "cleric",
    "name": "Cleric",
    "maximumLevel": 14,
    "hitDie": "1d6",
    "primeRequisites": [
      "WIS"
    ],
    "xp": [
      0,
      1500,
      3000,
      6000,
      12000,
      25000,
      50000,
      100000,
      200000,
      300000,
      400000,
      500000,
      600000,
      700000
    ],
    "attack": [
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2,
      5,
      5,
      5,
      5,
      7,
      7
    ],
    "hitPoints": [
      "1d6",
      "2d6",
      "3d6",
      "4d6",
      "5d6",
      "6d6",
      "7d6",
      "8d6",
      "9d6",
      "9d6+1*",
      "9d6+2*",
      "9d6+3*",
      "9d6+4*",
      "9d6+5*"
    ]
  },
  "druid": {
    "id": "druid",
    "name": "Druid",
    "maximumLevel": 14,
    "hitDie": "1d6",
    "primeRequisites": [
      "WIS"
    ],
    "xp": [
      0,
      2000,
      4000,
      7500,
      12500,
      20000,
      35000,
      60000,
      90000,
      125000,
      200000,
      300000,
      750000,
      1500000
    ],
    "attack": [
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2,
      5,
      5,
      5,
      5,
      7,
      7
    ],
    "hitPoints": [
      "1d6",
      "2d6",
      "3d6",
      "4d6",
      "5d6",
      "6d6",
      "7d6",
      "8d6",
      "9d6",
      "9d6+1*",
      "9d6+2*",
      "9d6+3*",
      "9d6+4*",
      "9d6+5*"
    ]
  },
  "dwarf": {
    "id": "dwarf",
    "name": "Dwarf",
    "maximumLevel": 12,
    "hitDie": "1d8",
    "primeRequisites": [
      "STR"
    ],
    "xp": [
      0,
      2200,
      4400,
      8800,
      17000,
      35000,
      70000,
      140000,
      270000,
      400000,
      530000,
      660000
    ],
    "attack": [
      0,
      0,
      0,
      2,
      2,
      2,
      5,
      5,
      5,
      7,
      7,
      7
    ],
    "hitPoints": [
      "1d8",
      "2d8",
      "3d8",
      "4d8",
      "5d8",
      "6d8",
      "7d8",
      "8d8",
      "9d8",
      "9d8+3*",
      "9d8+6*",
      "9d8+9*"
    ]
  },
  "elf": {
    "id": "elf",
    "name": "Elf",
    "maximumLevel": 10,
    "hitDie": "1d6",
    "primeRequisites": [
      "INT",
      "STR"
    ],
    "xp": [
      0,
      4000,
      8000,
      16000,
      32000,
      64000,
      120000,
      250000,
      400000,
      600000
    ],
    "attack": [
      0,
      0,
      0,
      2,
      2,
      2,
      5,
      5,
      5,
      7
    ],
    "hitPoints": [
      "1d6",
      "2d6",
      "3d6",
      "4d6",
      "5d6",
      "6d6",
      "7d6",
      "8d6",
      "9d6",
      "9d6+2*"
    ]
  },
  "fighter": {
    "id": "fighter",
    "name": "Fighter",
    "maximumLevel": 14,
    "hitDie": "1d8",
    "primeRequisites": [
      "STR"
    ],
    "xp": [
      0,
      2000,
      4000,
      8000,
      16000,
      32000,
      64000,
      120000,
      240000,
      360000,
      480000,
      600000,
      720000,
      840000
    ],
    "attack": [
      0,
      0,
      0,
      2,
      2,
      2,
      5,
      5,
      5,
      7,
      7,
      7,
      9,
      9
    ],
    "hitPoints": [
      "1d8",
      "2d8",
      "3d8",
      "4d8",
      "5d8",
      "6d8",
      "7d8",
      "8d8",
      "9d8",
      "9d8+2*",
      "9d8+4*",
      "9d8+6*",
      "9d8+8*",
      "9d8+10*"
    ]
  },
  "gnome": {
    "id": "gnome",
    "name": "Gnome",
    "maximumLevel": 8,
    "hitDie": "1d4",
    "primeRequisites": [
      "DEX",
      "INT"
    ],
    "xp": [
      0,
      3000,
      6000,
      12000,
      30000,
      60000,
      120000,
      240000
    ],
    "attack": [
      0,
      0,
      0,
      0,
      0,
      2,
      2,
      2
    ],
    "hitPoints": [
      "1d4",
      "2d4",
      "3d4",
      "4d4",
      "5d4",
      "6d4",
      "7d4",
      "8d4"
    ]
  },
  "half_elf": {
    "id": "half_elf",
    "name": "Half-Elf",
    "maximumLevel": 12,
    "hitDie": "1d6",
    "primeRequisites": [
      "INT",
      "STR"
    ],
    "xp": [
      0,
      2500,
      5000,
      10000,
      20000,
      40000,
      80000,
      150000,
      300000,
      450000,
      600000,
      750000
    ],
    "attack": [
      0,
      0,
      0,
      2,
      2,
      2,
      5,
      5,
      5,
      7,
      7,
      7
    ],
    "hitPoints": [
      "1d6",
      "2d6",
      "3d6",
      "4d6",
      "5d6",
      "6d6",
      "7d6",
      "8d6",
      "9d6",
      "9d6+2*",
      "9d6+4*",
      "9d6+6*"
    ]
  },
  "hobbit": {
    "id": "hobbit",
    "name": "Hobbit",
    "maximumLevel": 8,
    "hitDie": "1d6",
    "primeRequisites": [
      "DEX",
      "STR"
    ],
    "xp": [
      0,
      2000,
      4000,
      8000,
      16000,
      32000,
      64000,
      120000
    ],
    "attack": [
      0,
      0,
      0,
      2,
      2,
      2,
      5,
      5
    ],
    "hitPoints": [
      "1d6",
      "2d6",
      "3d6",
      "4d6",
      "5d6",
      "6d6",
      "7d6",
      "8d6"
    ]
  },
  "half_orc": {
    "id": "half_orc",
    "name": "Half-Orc",
    "maximumLevel": 8,
    "hitDie": "1d6",
    "primeRequisites": [
      "DEX",
      "STR"
    ],
    "xp": [
      0,
      1800,
      3600,
      7000,
      14000,
      28000,
      60000,
      120000
    ],
    "attack": [
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2
    ],
    "hitPoints": [
      "1d6",
      "2d6",
      "3d6",
      "4d6",
      "5d6",
      "6d6",
      "7d6",
      "8d6"
    ]
  },
  "illusionist": {
    "id": "illusionist",
    "name": "Illusionist",
    "maximumLevel": 14,
    "hitDie": "1d4",
    "primeRequisites": [
      "INT"
    ],
    "xp": [
      0,
      2500,
      5000,
      10000,
      20000,
      40000,
      80000,
      150000,
      300000,
      450000,
      600000,
      750000,
      900000,
      1050000
    ],
    "attack": [
      0,
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2,
      2,
      5,
      5,
      5,
      5
    ],
    "hitPoints": [
      "1d4",
      "2d4",
      "3d4",
      "4d4",
      "5d4",
      "6d4",
      "7d4",
      "8d4",
      "9d4",
      "9d4+1*",
      "9d4+2*",
      "9d4+3*",
      "9d4+4*",
      "9d4+5*"
    ]
  },
  "knight": {
    "id": "knight",
    "name": "Knight",
    "maximumLevel": 14,
    "hitDie": "1d8",
    "primeRequisites": [
      "STR"
    ],
    "xp": [
      0,
      2500,
      5000,
      10000,
      18500,
      37000,
      85000,
      140000,
      270000,
      400000,
      530000,
      660000,
      790000,
      920000
    ],
    "attack": [
      0,
      0,
      0,
      2,
      2,
      2,
      5,
      5,
      5,
      7,
      7,
      7,
      9,
      9
    ],
    "hitPoints": [
      "1d8",
      "2d8",
      "3d8",
      "4d8",
      "5d8",
      "6d8",
      "7d8",
      "8d8",
      "9d8",
      "9d8+2*",
      "9d8+4*",
      "9d8+6*",
      "9d8+8*",
      "9d8+10*"
    ]
  },
  "magic_user": {
    "id": "magic_user",
    "name": "Magic-User",
    "maximumLevel": 14,
    "hitDie": "1d4",
    "primeRequisites": [
      "INT"
    ],
    "xp": [
      0,
      2500,
      5000,
      10000,
      20000,
      40000,
      80000,
      150000,
      300000,
      450000,
      600000,
      750000,
      900000,
      1050000
    ],
    "attack": [
      0,
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2,
      2,
      5,
      5,
      5,
      5
    ],
    "hitPoints": [
      "1d4",
      "2d4",
      "3d4",
      "4d4",
      "5d4",
      "6d4",
      "7d4",
      "8d4",
      "9d4",
      "9d4+1*",
      "9d4+2*",
      "9d4+3*",
      "9d4+4*",
      "9d4+5*"
    ]
  },
  "paladin": {
    "id": "paladin",
    "name": "Paladin",
    "maximumLevel": 14,
    "hitDie": "1d8",
    "primeRequisites": [
      "STR",
      "WIS"
    ],
    "xp": [
      0,
      2750,
      5500,
      12000,
      24000,
      45000,
      95000,
      175000,
      350000,
      500000,
      650000,
      800000,
      950000,
      1100000
    ],
    "attack": [
      0,
      0,
      0,
      2,
      2,
      2,
      5,
      5,
      5,
      7,
      7,
      7,
      9,
      9
    ],
    "hitPoints": [
      "1d8",
      "2d8",
      "3d8",
      "4d8",
      "5d8",
      "6d8",
      "7d8",
      "8d8",
      "9d8",
      "9d8+2*",
      "9d8+4*",
      "9d8+6*",
      "9d8+8*",
      "9d8+10*"
    ]
  },
  "ranger": {
    "id": "ranger",
    "name": "Ranger",
    "maximumLevel": 14,
    "hitDie": "1d8",
    "primeRequisites": [
      "STR"
    ],
    "xp": [
      0,
      2250,
      4500,
      10000,
      20000,
      40000,
      90000,
      150000,
      300000,
      425000,
      550000,
      675000,
      800000,
      925000
    ],
    "attack": [
      0,
      0,
      0,
      2,
      2,
      2,
      5,
      5,
      5,
      7,
      7,
      7,
      9,
      9
    ],
    "hitPoints": [
      "1d8",
      "2d8",
      "3d8",
      "4d8",
      "5d8",
      "6d8",
      "7d8",
      "8d8",
      "9d8",
      "9d8+2*",
      "9d8+4*",
      "9d8+6*",
      "9d8+8*",
      "9d8+10*"
    ]
  },
  "thief": {
    "id": "thief",
    "name": "Thief",
    "maximumLevel": 14,
    "hitDie": "1d4",
    "primeRequisites": [
      "DEX"
    ],
    "xp": [
      0,
      1200,
      2400,
      4800,
      9600,
      20000,
      40000,
      80000,
      160000,
      280000,
      400000,
      520000,
      640000,
      760000
    ],
    "attack": [
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2,
      5,
      5,
      5,
      5,
      7,
      7
    ],
    "hitPoints": [
      "1d4",
      "2d4",
      "3d4",
      "4d4",
      "5d4",
      "6d4",
      "7d4",
      "8d4",
      "9d4",
      "9d4+2*",
      "9d4+4*",
      "9d4+6*",
      "9d4+8*",
      "9d4+10*"
    ]
  },
  "beast_master": {
    "id": "beast_master",
    "name": "Beast Master",
    "maximumLevel": 14,
    "hitDie": "1d6",
    "primeRequisites": [
      "STR",
      "WIS"
    ],
    "xp": [
      0,
      1800,
      3600,
      7250,
      15000,
      30000,
      60000,
      120000,
      240000,
      360000,
      480000,
      600000,
      720000,
      840000
    ],
    "attack": [
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2,
      5,
      5,
      5,
      5,
      7,
      7
    ],
    "hitPoints": [
      "1d6",
      "2d6",
      "3d6",
      "4d6",
      "5d6",
      "6d6",
      "7d6",
      "8d6",
      "9d6",
      "9d6+2*",
      "9d6+4*",
      "9d6+6*",
      "9d6+8*",
      "9d6+10*"
    ]
  },
  "mage": {
    "id": "mage",
    "name": "Mage",
    "maximumLevel": 14,
    "hitDie": "1d6",
    "primeRequisites": [
      "INT",
      "WIS"
    ],
    "xp": [
      0,
      2800,
      5600,
      12000,
      24000,
      48000,
      100000,
      200000,
      400000,
      460000,
      620000,
      880000,
      1040000,
      1200000
    ],
    "attack": [
      0,
      0,
      0,
      0,
      0,
      2,
      2,
      2,
      2,
      2,
      5,
      5,
      5,
      5
    ],
    "hitPoints": [
      "1d6",
      "2d6",
      "3d6",
      "4d6",
      "5d6",
      "6d6",
      "7d6",
      "8d6",
      "9d6",
      "9d6+1*",
      "9d6+2*",
      "9d6+3*",
      "9d6+4*",
      "9d6+5*"
    ]
  },
  "warden": {
    "id": "warden",
    "name": "Warden",
    "maximumLevel": 14,
    "hitDie": "1d8",
    "primeRequisites": [
      "STR"
    ],
    "xp": [
      0,
      2000,
      4000,
      8000,
      16000,
      32000,
      64000,
      120000,
      240000,
      360000,
      480000,
      600000,
      720000,
      840000
    ],
    "attack": [
      0,
      0,
      0,
      2,
      2,
      2,
      5,
      5,
      5,
      7,
      7,
      7,
      9,
      9
    ],
    "hitPoints": [
      "1d8",
      "2d8",
      "3d8",
      "4d8",
      "5d8",
      "6d8",
      "7d8",
      "8d8",
      "9d8",
      "9d8+2*",
      "9d8+4*",
      "9d8+6*",
      "9d8+8*",
      "9d8+10*"
    ]
  }
};

const CLASS_ALIASES = {
  'magic-user': 'magic_user', 'magic user': 'magic_user', 'half-elf': 'half_elf',
  'half-orc': 'half_orc', 'beast master': 'beast_master', halfling: 'hobbit'
};

const RACE_CAPS = {
  dwarf: { assassin: 9, cleric: 8, fighter: 10, thief: 9, dwarf: 12 },
  elf: { assassin: 10, cleric: 7, druid: 8, fighter: 7, knight: 11, magic_user: 11, ranger: 11, thief: 10, elf: 10 },
  gnome: { assassin: 6, cleric: 7, fighter: 6, illusionist: 7, thief: 8, gnome: 8 },
  hobbit: { druid: 6, fighter: 6, thief: 8, hobbit: 8 },
  half_orc: { assassin: 8, cleric: 4, fighter: 10, thief: 8, half_orc: 8 },
  drow: {},
  half_elf: { assassin: 11, bard: 12, cleric: 5, druid: 12, fighter: 8, knight: 12, magic_user: 8, paladin: 12, ranger: 8, thief: 12, half_elf: 12 },
  human: {}
};

const CUSTOM_RACE_CAPS = {
  mage: { human: 14 },
  beast_master: { human: 14, half_elf: 8 },
  warden: { human: 14, half_elf: 11, elf: 11, hobbit: 6 }
};

const NPC_ONLY = new Set(['dwarf/cleric', 'elf/cleric', 'gnome/cleric']);

const XP_BONUS_RULES = {
  // OSE: one prime at 13 grants +5; named classes have the printed second-prime rule.
  assassin: 'single', barbarian: 'one-or-both16', bard: 'single', cleric: 'single', druid: 'single',
  dwarf: 'single', elf: 'first16second13', fighter: 'single', gnome: 'first13second16',
  half_elf: 'one16other13', hobbit: 'either13-both13', half_orc: 'both13-both16',
  illusionist: 'single', knight: 'single', magic_user: 'single', paladin: 'one-or-both16',
  ranger: 'single', thief: 'single', beast_master: 'either13-both16', warden: 'single',
  mage: 'mage'
};

export function normalizeProgressionKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'halfling') return 'hobbit';
  return CLASS_ALIASES[key] || key;
}

export function getClassProgression(characterClass) {
  return CLASS_PROGRESSION[normalizeProgressionKey(characterClass)] || null;
}

export function getMaximumLevel(characterClass, race = '') {
  const key = normalizeProgressionKey(characterClass);
  const profile = CLASS_PROGRESSION[key];
  if (!profile) return 1;
  const raceKey = normalizeProgressionKey(race);
  if (!raceKey) return profile.maximumLevel;
  if (CUSTOM_RACE_CAPS[key]?.[raceKey]) return CUSTOM_RACE_CAPS[key][raceKey];
  if (raceKey === 'human') return ['dwarf', 'elf', 'gnome', 'hobbit', 'half_elf', 'half_orc'].includes(key) ? 1 : profile.maximumLevel;
  if (Object.prototype.hasOwnProperty.call(RACE_CAPS, raceKey)) {
    if (Object.prototype.hasOwnProperty.call(RACE_CAPS[raceKey], key)) return RACE_CAPS[raceKey][key];
    // A known race/class pairing not listed by its authoritative profile is unavailable.
    return 1;
  }
  return 1;
}

export function isClassAvailableForRace(characterClass, race = '') {
  const key = normalizeProgressionKey(characterClass);
  const raceKey = normalizeProgressionKey(race);
  if (!CLASS_PROGRESSION[key]) return false;
  if (!raceKey || raceKey === 'human') return !['dwarf','elf','gnome','hobbit','half_elf','half_orc'].includes(key);
  if (NPC_ONLY.has(`${raceKey}/${key}`)) return false;
  if (CUSTOM_RACE_CAPS[key]?.[raceKey]) return true;
  return Object.prototype.hasOwnProperty.call(RACE_CAPS[raceKey] || {}, key);
}

export function getProgressionLevel(characterClass, xp, race = '') {
  const profile = getClassProgression(characterClass);
  if (!profile) return 1;
  const value = Number(xp) || 0;
  let level = 1;
  for (let i = 0; i < profile.xp.length; i += 1) {
    if (value >= profile.xp[i]) level = i + 1;
    else break;
  }
  return Math.min(level, getMaximumLevel(characterClass, race));
}

export function getNextProgressionXP(characterClass, level, race = '') {
  const profile = getClassProgression(characterClass);
  if (!profile) return 0;
  const max = getMaximumLevel(characterClass, race);
  const next = Math.min(Math.max(1, Number(level) || 1) + 1, max);
  return profile.xp[next - 1] ?? profile.xp[max - 1] ?? profile.xp.at(-1);
}

export function getProgressionPrimeRequisites(characterClass) {
  return getClassProgression(characterClass)?.primeRequisites?.map(value => value.toLowerCase()) || ['str'];
}

export function getProgressionHitDie(characterClass) {
  return Number(String(getClassProgression(characterClass)?.hitDie || '').match(/d(\d+)/)?.[1]) || 6;
}

/** Fixed HP gained at this level; null indicates a die roll or unsupported level. */
export function getLevelHitPointGain(characterClass, level) {
  const profile = getClassProgression(characterClass);
  const index = Math.floor(Number(level)) - 1;
  if (!profile || index < 0 || index >= profile.maximumLevel) return null;
  const row = profile.hitPoints[index];
  const previous = profile.hitPoints[index - 1];
  if (!row.includes('*') || !previous) return null;
  const fixed = value => Number(String(value).match(/\+(\d+)/)?.[1] || 0);
  return fixed(row) - fixed(previous);
}

/** Eligibility and referee-only metadata for creation and existing documents. */
export function getRaceClassPolicy(characterClass, race = '') {
  const key = normalizeProgressionKey(characterClass);
  const raceKey = normalizeProgressionKey(race);
  const npcOnlyAtRefereeOption = NPC_ONLY.has(`${raceKey}/${key}`);
  return {
    allowed: isClassAvailableForRace(characterClass, race) || npcOnlyAtRefereeOption,
    playerAllowed: isClassAvailableForRace(characterClass, race),
    npcOnlyAtRefereeOption,
    maximumLevel: getMaximumLevel(characterClass, race)
  };
}

export function getProgressionXPModifier(characterClass, attributes = {}) {
  const key = normalizeProgressionKey(characterClass);
  const score = name => Number(attributes[name.toLowerCase()]?.value ?? attributes[name.toLowerCase()] ?? 10);
  if (key === 'mage') {
    if (score('INT') >= 16 && score('WIS') >= 13) return 10;
    if (score('INT') >= 13 && score('WIS') >= 13) return 5;
    return 0;
  }
  const scores = getProgressionPrimeRequisites(characterClass).map(score);
  const rule = XP_BONUS_RULES[key] || 'single';
  const penalty = scores.some(value => value <= 5) ? -20 : scores.some(value => value <= 8) ? -10 : 0;
  const multiPenalty = 0;
  if (rule === 'single') return scores[0] >= 16 ? 10 : scores[0] >= 13 ? 5 : penalty;
  if (rule === 'one-or-both16') return scores.every(value => value >= 16) ? 10 : scores.some(value => value >= 13) ? 5 : multiPenalty;
  if (rule === 'either13-both13') return scores.every(value => value >= 13) ? 10 : scores.some(value => value >= 13) ? 5 : multiPenalty;
  if (rule === 'either13-both16') return scores.every(value => value >= 16) ? 10 : scores.some(value => value >= 13) ? 5 : multiPenalty;
  if (rule === 'both13-both16') return scores.every(value => value >= 16) ? 10 : scores.every(value => value >= 13) ? 5 : multiPenalty;
  if (rule === 'first16second13') return scores[0] >= 16 && scores[1] >= 13 ? 10 : scores.every(value => value >= 13) ? 5 : multiPenalty;
  if (rule === 'first13second16') return scores[0] >= 13 && scores[1] >= 16 ? 10 : scores.every(value => value >= 13) ? 5 : multiPenalty;
  if (rule === 'one16other13') return scores.some(value => value >= 16) && scores.every(value => value >= 13) ? 10 : scores.every(value => value >= 13) ? 5 : multiPenalty;
  return penalty;
}
