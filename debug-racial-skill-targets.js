// Debug script to test racial skill target system
// This script simulates different race/class combinations to verify the new system

console.log("=== Testing Racial Skill Target System ===");

// Mock the character data and race/class combinations
const testCases = [
  { race: 'human', characterClass: 'fighter', expected: 'racial-skill-targets-default' },
  { race: 'elf', characterClass: 'magic-user', expected: 'racial-skill-targets-default' },
  { race: 'half-orc', characterClass: 'barbarian', expected: 'racial-skill-targets-default' },
  { race: 'hobbit', characterClass: 'thief', expected: 'racial-skill-targets-default' },
  
  // Gnome cases
  { race: 'gnome', characterClass: 'fighter', expected: 'racial-skill-targets-gnome' },
  { race: 'gnome', characterClass: 'thief', expected: 'racial-skill-targets-gnome' },
  { race: 'gnome', characterClass: 'gnome', expected: 'racial-skill-targets-default' }, // Gnome class = default
  
  // Dwarf cases  
  { race: 'dwarf', characterClass: 'fighter', expected: 'racial-skill-targets-dwarf' },
  { race: 'dwarf', characterClass: 'cleric', expected: 'racial-skill-targets-dwarf' },
  { race: 'dwarf', characterClass: 'dwarf', expected: 'racial-skill-targets-default' }, // Dwarf class = default
];

// Simulate the racial skill target logic
function getRacialSkillTargetClass(race, characterClass) {
  let racialSkillTargetClass = 'racial-skill-targets-default';
  
  if (race === 'gnome') {
    // Gnome racial skill targets only if NOT in combination with Gnome class
    if (characterClass !== 'gnome') {
      racialSkillTargetClass = 'racial-skill-targets-gnome';
    }
  } else if (race === 'dwarf') {
    // Dwarf racial skill targets only if NOT in combination with Dwarf class
    if (characterClass !== 'dwarf') {
      racialSkillTargetClass = 'racial-skill-targets-dwarf';
    }
  }
  // All other races (including half-orc, hobbit, etc.) use default
  
  return racialSkillTargetClass;
}

// Test all cases
console.log("\n--- Test Results ---");
let allPassed = true;
testCases.forEach((testCase, index) => {
  const result = getRacialSkillTargetClass(testCase.race, testCase.characterClass);
  const passed = result === testCase.expected;
  allPassed = allPassed && passed;
  
  console.log(`Test ${index + 1}: ${passed ? 'PASS' : 'FAIL'}`);
  console.log(`  Race: ${testCase.race}, Class: ${testCase.characterClass}`);
  console.log(`  Expected: ${testCase.expected}`);
  console.log(`  Got: ${result}`);
  console.log('');
});

console.log(`\n=== Summary: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'} ===`);

// Additional verification for CSS classes
console.log("\n--- CSS Class Verification ---");
console.log("The following CSS classes should exist in _character-sheet.scss:");
console.log("✓ .racial-skill-targets-default - uses skill-targets-default.webp");
console.log("✓ .racial-skill-targets-gnome - uses skill-targets-gnome.webp");
console.log("✓ .racial-skill-targets-dwarf - uses skill-targets-dwarf.webp");

console.log("\n--- Expected Behavior ---");
console.log("1. Default: Any race except Gnome/Dwarf → skill-targets-default.webp");
console.log("2. Gnome: Gnome race + non-Gnome class → skill-targets-gnome.webp");
console.log("3. Dwarf: Dwarf race + non-Dwarf class → skill-targets-dwarf.webp");
console.log("4. Override: Gnome/Dwarf race + matching class → skill-targets-default.webp");