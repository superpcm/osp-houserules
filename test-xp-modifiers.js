// Test script to demonstrate the corrected XP modifier logic
// This shows how the new logic differs from the old averaging approach

// Test data for different scenarios
const testCases = [
  {
    description: "Paladin with STR 18, CHA 16 (ALL ≥ 16)",
    class: "Paladin",
    attributes: { str: { value: 18 }, cha: { value: 16 } },
    expectedOld: 12.5, // Average of +15% and +10% = 12.5%
    expectedNew: 10    // ALL ≥ 16 → +10%
  },
  {
    description: "Paladin with STR 18, CHA 18 (ALL ≥ 18)",
    class: "Paladin",
    attributes: { str: { value: 18 }, cha: { value: 18 } },
    expectedOld: 15,   // Average of +15% and +15% = 15%
    expectedNew: 15    // ALL ≥ 18 → +15%
  },
  {
    description: "Paladin with STR 13, CHA 8 (ANY ≤ 8)",
    class: "Paladin",
    attributes: { str: { value: 13 }, cha: { value: 8 } },
    expectedOld: -2.5, // Average of +5% and -10% = -2.5%
    expectedNew: -10   // ANY ≤ 8 → -10%
  },
  {
    description: "Paladin with STR 13, CHA 14 (ALL ≥ 13)",
    class: "Paladin",
    attributes: { str: { value: 13 }, cha: { value: 14 } },
    expectedOld: 5,    // Average of +5% and +5% = 5%
    expectedNew: 5     // ALL ≥ 13 → +5%
  },
  {
    description: "Paladin with STR 12, CHA 14 (NOT all ≥ 13)",
    class: "Paladin",
    attributes: { str: { value: 12 }, cha: { value: 14 } },
    expectedOld: 2.5,  // Average of 0% and +5% = 2.5%
    expectedNew: 0     // NOT all ≥ 13 → 0%
  },
  {
    description: "Fighter with STR 16 (single prime)",
    class: "Fighter",
    attributes: { str: { value: 16 } },
    expectedOld: 10,   // Single prime +10%
    expectedNew: 10    // ALL (single) ≥ 16 → +10%
  }
];

console.log("XP Modifier Logic Comparison");
console.log("============================");
console.log();

// Prime requisite mapping
const primeRequisites = {
  'fighter': ['str'],
  'paladin': ['str', 'cha'],
  // ... other classes
};

// Old averaging logic
function calculateOldXPModifier(characterClass, attributes) {
  const classReqs = primeRequisites[characterClass.toLowerCase()] || ['str'];
  
  const getXPModifier = (score) => {
    const numScore = parseInt(score) || 10;
    if (numScore <= 8) return -10;
    if (numScore <= 12) return 0;
    if (numScore <= 15) return 5;
    if (numScore <= 17) return 10;
    return 15;
  };

  if (classReqs.length === 1) {
    const reqScore = attributes[classReqs[0]]?.value || 10;
    return getXPModifier(reqScore);
  } else {
    let modifierSum = 0;
    for (const req of classReqs) {
      const reqScore = attributes[req]?.value || 10;
      modifierSum += getXPModifier(reqScore);
    }
    return Math.round(modifierSum / classReqs.length);
  }
}

// New threshold-based logic
function calculateNewXPModifier(characterClass, attributes) {
  const classReqs = primeRequisites[characterClass.toLowerCase()] || ['str'];
  const primeScores = classReqs.map(req => parseInt(attributes[req]?.value) || 10);
  
  if (primeScores.some(score => score <= 8)) return -10;
  if (primeScores.every(score => score >= 18)) return 15;
  if (primeScores.every(score => score >= 16)) return 10;
  if (primeScores.every(score => score >= 13)) return 5;
  return 0;
}

// Run tests
testCases.forEach(test => {
  const oldResult = calculateOldXPModifier(test.class, test.attributes);
  const newResult = calculateNewXPModifier(test.class, test.attributes);
  
  console.log(`${test.description}:`);
  console.log(`  Old Logic (Average): ${oldResult}%`);
  console.log(`  New Logic (AF/OSE):  ${newResult}%`);
  console.log(`  Difference: ${newResult - oldResult}%`);
  console.log();
});

console.log("Key Changes:");
console.log("- Multi-prime classes now require ALL primes to meet thresholds");
console.log("- ANY prime ≤ 8 results in -10% (no averaging)");
console.log("- Thresholds are now consistent with AF/OSE rules");
