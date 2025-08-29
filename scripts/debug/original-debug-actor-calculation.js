// Original debug-actor-calculation.js moved to scripts/debug

function testLevelIndex(level) {
  const levelIndex = Math.min(Math.max(level - 1, 0), 14);
  return levelIndex;
}

// Test various levels
for (let level = 1; level <= 15; level++) {
  testLevelIndex(level);
}

const fighterTable = {
  death: [12, 12, 12, 10, 10, 10, 8, 8, 8, 6, 6, 6, 4, 4],
  wands: [13, 13, 13, 11, 11, 11, 9, 9, 9, 7, 7, 7, 5, 5],
  paralysis: [14, 14, 14, 12, 12, 12, 10, 10, 10, 8, 8, 8, 6, 6],
  breath: [15, 15, 15, 13, 13, 13, 10, 10, 10, 8, 8, 8, 5, 5],
  spells: [16, 16, 16, 14, 14, 14, 12, 12, 12, 10, 10, 10, 8, 8]
};

function testFighterValues(level) {
  const levelIndex = Math.min(Math.max(level - 1, 0), 14);
  const values = {
    death: fighterTable.death[levelIndex],
    wands: fighterTable.wands[levelIndex],
    paralysis: fighterTable.paralysis[levelIndex],
    breath: fighterTable.breath[levelIndex],
    spells: fighterTable.spells[levelIndex]
  };
  return values;
}

testFighterValues(7);
testFighterValues(13);
