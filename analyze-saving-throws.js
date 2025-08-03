// Saving Throw Analysis Script
// This script compares the current implementation with the provided JSON data

const fs = require('fs');

// Load the JSON data from the file
const jsonData = JSON.parse(`{
  "Assassin": {
    "source": "Character_Classes_AF_1.3.pdf",
    "levels": [
      {"level": 1, "D": 13, "W": 14, "P": 13, "B": 16, "S": 15},
      {"level": 2, "D": 13, "W": 14, "P": 13, "B": 16, "S": 15},
      {"level": 3, "D": 13, "W": 14, "P": 13, "B": 16, "S": 15},
      {"level": 4, "D": 13, "W": 14, "P": 13, "B": 16, "S": 15},
      {"level": 5, "D": 12, "W": 13, "P": 11, "B": 14, "S": 13},
      {"level": 6, "D": 12, "W": 13, "P": 11, "B": 14, "S": 13},
      {"level": 7, "D": 12, "W": 13, "P": 11, "B": 14, "S": 13},
      {"level": 8, "D": 12, "W": 13, "P": 11, "B": 14, "S": 13},
      {"level": 9, "D": 10, "W": 11, "P": 9, "B": 12, "S": 10},
      {"level": 10, "D": 10, "W": 11, "P": 9, "B": 12, "S": 10},
      {"level": 11, "D": 10, "W": 11, "P": 9, "B": 12, "S": 10},
      {"level": 12, "D": 10, "W": 11, "P": 9, "B": 12, "S": 10},
      {"level": 13, "D": 8, "W": 9, "P": 7, "B": 10, "S": 8},
      {"level": 14, "D": 8, "W": 9, "P": 7, "B": 10, "S": 8}
    ]
  },
  "Fighter": {
    "source": "Character_Classes_AF_1.3.pdf",
    "levels": [
      {"level": 1, "D": 12, "W": 13, "P": 14, "B": 15, "S": 16},
      {"level": 2, "D": 12, "W": 13, "P": 14, "B": 15, "S": 16},
      {"level": 3, "D": 12, "W": 13, "P": 14, "B": 15, "S": 16},
      {"level": 4, "D": 10, "W": 11, "P": 12, "B": 13, "S": 14},
      {"level": 5, "D": 10, "W": 11, "P": 12, "B": 13, "S": 14},
      {"level": 6, "D": 10, "W": 11, "P": 12, "B": 13, "S": 14},
      {"level": 7, "D": 8, "W": 9, "P": 10, "B": 10, "S": 12},
      {"level": 8, "D": 8, "W": 9, "P": 10, "B": 10, "S": 12},
      {"level": 9, "D": 8, "W": 9, "P": 10, "B": 10, "S": 12},
      {"level": 10, "D": 6, "W": 7, "P": 8, "B": 8, "S": 10},
      {"level": 11, "D": 6, "W": 7, "P": 8, "B": 8, "S": 10},
      {"level": 12, "D": 6, "W": 7, "P": 8, "B": 8, "S": 10},
      {"level": 13, "D": 4, "W": 5, "P": 6, "B": 5, "S": 8},
      {"level": 14, "D": 4, "W": 5, "P": 6, "B": 5, "S": 8}
    ]
  },
  "Thief": {
    "source": "Character_Classes_AF_1.3.pdf",
    "levels": [
      {"level": 1, "D": 13, "W": 14, "P": 13, "B": 16, "S": 15},
      {"level": 2, "D": 13, "W": 14, "P": 13, "B": 16, "S": 15},
      {"level": 3, "D": 13, "W": 14, "P": 13, "B": 16, "S": 15},
      {"level": 4, "D": 13, "W": 14, "P": 13, "B": 16, "S": 15},
      {"level": 5, "D": 12, "W": 13, "P": 11, "B": 14, "S": 13},
      {"level": 6, "D": 12, "W": 13, "P": 11, "B": 14, "S": 13},
      {"level": 7, "D": 12, "W": 13, "P": 11, "B": 14, "S": 13},
      {"level": 8, "D": 12, "W": 13, "P": 11, "B": 14, "S": 13},
      {"level": 9, "D": 10, "W": 11, "P": 9, "B": 12, "S": 10},
      {"level": 10, "D": 10, "W": 11, "P": 9, "B": 12, "S": 10},
      {"level": 11, "D": 10, "W": 11, "P": 9, "B": 12, "S": 10},
      {"level": 12, "D": 10, "W": 11, "P": 9, "B": 12, "S": 10},
      {"level": 13, "D": 8, "W": 9, "P": 7, "B": 10, "S": 8},
      {"level": 14, "D": 8, "W": 9, "P": 7, "B": 10, "S": 8}
    ]
  }
});

// Current implementation data (extracted from actor.js)
const currentImplementation = {
  'fighter': {
    death: [12, 11, 10, 10, 8, 8, 6, 6, 4, 4, 2, 2, 2, 2, 2],
    wands: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2, 2],
    paralysis: [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 2],
    breath: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2],
    spells: [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
  },
  'thief': {
    death: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 2, 2, 2, 2, 2],
    wands: [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 3, 2, 2, 2, 2],
    paralysis: [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 2, 2, 2, 2, 2],
    breath: [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 5, 4, 3, 2, 2],
    spells: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 4, 3, 2, 2, 2]
  }
};

// Function to convert JSON data to arrays
function convertJsonToArrays(jsonClass) {
  const arrays = { death: [], wands: [], paralysis: [], breath: [], spells: [] };
  
  for (let level = 1; level <= 14; level++) {
    const levelData = jsonClass.levels.find(l => l.level === level);
    if (levelData) {
      arrays.death.push(levelData.D);
      arrays.wands.push(levelData.W);
      arrays.paralysis.push(levelData.P);
      arrays.breath.push(levelData.B);
      arrays.spells.push(levelData.S);
    } else {
      // If no data for this level, use previous level or default
      arrays.death.push(arrays.death[arrays.death.length - 1] || 15);
      arrays.wands.push(arrays.wands[arrays.wands.length - 1] || 15);
      arrays.paralysis.push(arrays.paralysis[arrays.paralysis.length - 1] || 15);
      arrays.breath.push(arrays.breath[arrays.breath.length - 1] || 15);
      arrays.spells.push(arrays.spells[arrays.spells.length - 1] || 15);
    }
  }
  
  return arrays;
}

// Comparison function
function compareImplementations() {
  console.log("SAVING THROW ANALYSIS");
  console.log("====================");
  console.log();

  const classesToCheck = ['Fighter', 'Thief'];
  
  classesToCheck.forEach(className => {
    const jsonClass = jsonData[className];
    const currentClass = currentImplementation[className.toLowerCase()];
    
    if (!jsonClass || !currentClass) {
      console.log(`❌ Missing data for ${className}`);
      return;
    }
    
    console.log(`=== ${className.toUpperCase()} ===`);
    
    const jsonArrays = convertJsonToArrays(jsonClass);
    
    // Compare each save type
    ['death', 'wands', 'paralysis', 'breath', 'spells'].forEach(saveType => {
      const jsonValues = jsonArrays[saveType];
      const currentValues = currentClass[saveType];
      
      console.log(`\\n${saveType.toUpperCase()} (D/W/P/B/S -> ${saveType}):`);
      console.log(`JSON Data:    [${jsonValues.join(', ')}]`);
      console.log(`Current Impl: [${currentValues.slice(0, 14).join(', ')}]`);
      
      // Compare values level by level
      let differences = [];
      for (let i = 0; i < 14; i++) {
        if (jsonValues[i] !== currentValues[i]) {
          differences.push(\`Level \${i+1}: \${currentValues[i]} -> \${jsonValues[i]}\`);
        }
      }
      
      if (differences.length > 0) {
        console.log(\`❌ DIFFERENCES: \${differences.join(', ')}\`);
      } else {
        console.log(\`✅ MATCHES\`);
      }
    });
    
    console.log();
  });
}

compareImplementations();
