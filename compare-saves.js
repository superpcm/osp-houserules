// Saving Throw Comparison Tool
// This script will help identify discrepancies between JSON data and current implementation

console.log("=== CURRENT SAVING THROW IMPLEMENTATION ANALYSIS ===");
console.log();

// Current implementation from actor.js
const currentTables = {
  'fighter': {
    death: [12, 11, 10, 10, 8, 8, 6, 6, 4, 4, 2, 2, 2, 2, 2],
    wands: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2, 2],
    paralysis: [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2],
    breath: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2],
    spells: [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
  },
  'cleric': {
    death: [11, 10, 9, 8, 7, 6, 5, 4, 2, 2, 2, 2, 2, 2, 2],
    wands: [12, 11, 10, 9, 8, 7, 6, 5, 3, 2, 2, 2, 2, 2, 2],
    paralysis: [14, 13, 12, 11, 10, 9, 8, 7, 5, 4, 3, 2, 2, 2, 2],
    breath: [16, 15, 14, 13, 12, 11, 10, 9, 7, 6, 5, 4, 3, 2, 2],
    spells: [15, 14, 13, 12, 11, 10, 9, 8, 6, 5, 4, 3, 2, 2, 2]
  },
  'magic-user': {
    death: [13, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 6],
    wands: [14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7],
    paralysis: [13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
    breath: [16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 8],
    spells: [15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 7]
  },
  'thief': {
    death: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 2, 2, 2, 2, 2],
    wands: [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 3, 2, 2, 2, 2],
    paralysis: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 2, 2, 2, 2, 2],
    breath: [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 5, 4, 3, 2, 2],
    spells: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 4, 3, 2, 2, 2]
  }
};

// Current class mappings
const classMapping = {
  'assassin': 'thief',
  'barbarian': 'fighter', 
  'bard': 'thief',
  'beast master': 'fighter',
  'druid': 'cleric',
  'knight': 'fighter',
  'paladin': 'cleric',
  'ranger': 'fighter',
  'warden': 'fighter',
  'illusionist': 'magic-user',
  'mage': 'magic-user',
  'dwarf': 'fighter',
  'elf': 'fighter',
  'gnome': 'cleric',
  'half-elf': 'fighter',
  'half-orc': 'fighter',
  'hobbit': 'thief'
};

// Display current implementation
console.log("CURRENT TABLES (15 levels each):");
console.log("=================================");

Object.keys(currentTables).forEach(className => {
  console.log(`\n${className.toUpperCase()}:`);
  const table = currentTables[className];
  
  console.log("Level:     1  2  3  4  5  6  7  8  9 10 11 12 13 14 15");
  console.log("------    -----------------------------------------------");
  console.log(`Death:    ${table.death.map(v => v.toString().padStart(2)).join(' ')}`);
  console.log(`Wands:    ${table.wands.map(v => v.toString().padStart(2)).join(' ')}`);
  console.log(`Paralysis:${table.paralysis.map(v => v.toString().padStart(2)).join(' ')}`);
  console.log(`Breath:   ${table.breath.map(v => v.toString().padStart(2)).join(' ')}`);
  console.log(`Spells:   ${table.spells.map(v => v.toString().padStart(2)).join(' ')}`);
});

console.log("\n\nCLASS MAPPINGS:");
console.log("===============");
Object.keys(classMapping).forEach(cls => {
  console.log(`${cls.padEnd(15)} -> ${classMapping[cls]}`);
});

console.log("\n\nTo compare with JSON data:");
console.log("1. Place your JSON file in this directory");
console.log("2. Update this script to load and compare the data");
console.log("3. Look for discrepancies in D/W/P/B/S values by level");

// Function that can be used to compare with JSON data
function compareWithJson(jsonData) {
  console.log("\n=== COMPARISON WITH JSON DATA ===");
  
  Object.keys(jsonData).forEach(className => {
    const lowerClassName = className.toLowerCase();
    const mappedClass = classMapping[lowerClassName] || lowerClassName;
    const currentTable = currentTables[mappedClass];
    
    if (!currentTable) {
      console.log(`\nNo current table found for ${className} (mapped to ${mappedClass})`);
      return;
    }
    
    console.log(`\n${className.toUpperCase()} comparison:`);
    
    const jsonLevels = jsonData[className].levels;
    
    // Check each save type
    ['D', 'W', 'P', 'B', 'S'].forEach((saveCode, index) => {
      const saveType = ['death', 'wands', 'paralysis', 'breath', 'spells'][index];
      const currentValues = currentTable[saveType];
      
      console.log(`\n${saveType.toUpperCase()} (${saveCode}):`);
      
      let differences = [];
      for (let level = 1; level <= Math.min(jsonLevels.length, 14); level++) {
        const jsonValue = jsonLevels.find(l => l.level === level)?.[saveCode];
        const currentValue = currentValues[level - 1];
        
        if (jsonValue !== undefined && jsonValue !== currentValue) {
          differences.push(`L${level}: ${currentValue}->${jsonValue}`);
        }
      }
      
      if (differences.length > 0) {
        console.log(`  DIFFERENCES: ${differences.join(', ')}`);
      } else {
        console.log(`  ✓ MATCHES`);
      }
    });
  });
}

// Load and compare with JSON data
const fs = require('fs');

try {
  const jsonData = JSON.parse(fs.readFileSync('./saving_throws_in_use.json', 'utf8'));
  compareWithJson(jsonData);
} catch (error) {
  console.log(`\nError loading JSON file: ${error.message}`);
}

// Export for potential use
if (typeof module !== 'undefined') {
  module.exports = { currentTables, classMapping, compareWithJson };
}
