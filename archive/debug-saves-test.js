// Quick test to debug saving throw calculations
// This simulates what should happen for a 7th level Ranger

const savingThrowTables = {
  fighter: [
    { levels: [1, 2, 3], saves: { death: 12, wands: 13, paralysis: 14, breath: 15, spells: 16 } },
    { levels: [4, 5, 6], saves: { death: 10, wands: 11, paralysis: 12, breath: 13, spells: 14 } },
    { levels: [7, 8, 9], saves: { death: 8, wands: 9, paralysis: 10, breath: 10, spells: 12 } },
    { levels: [10, 11, 12], saves: { death: 6, wands: 7, paralysis: 8, breath: 8, spells: 10 } },
    { levels: [13, 14], saves: { death: 4, wands: 5, paralysis: 6, breath: 6, spells: 8 } }
  ]
};

const classMapping = {
  'ranger': 'fighter'
};

function testSavingThrows(characterClass, level) {


  const tableKey = classMapping[characterClass.toLowerCase()] || 'fighter';
  const table = savingThrowTables[tableKey];



  // Find the appropriate tier
  let currentTier = null;
  for (const tier of table) {
    if (tier.levels.includes(level)) {
      currentTier = tier;
      break;
    }
  }

  if (currentTier) {


  } else {

  }

  return currentTier?.saves || { death: 15, wands: 15, paralysis: 15, breath: 15, spells: 15 };
}

// Test the problematic case
testSavingThrows('ranger', 7);

// Test a few other levels for comparison
testSavingThrows('ranger', 1);
testSavingThrows('ranger', 10);
testSavingThrows('ranger', 13);
