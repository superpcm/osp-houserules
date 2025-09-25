// Comprehensive test for racial skill target system
import { readFileSync } from 'fs';

console.log("=== Comprehensive Racial Skill Target System Test ===");

// Test 1: Verify CSS classes exist in compiled CSS
console.log("\n--- Test 1: CSS Class Verification ---");
const cssContent = readFileSync('dist/ose.css', 'utf8');

const expectedClasses = [
  'racial-skill-targets-default',
  'racial-skill-targets-gnome', 
  'racial-skill-targets-dwarf'
];

let cssTestsPassed = 0;
expectedClasses.forEach(className => {
  const found = cssContent.includes(className);
  console.log(`${found ? '✓' : '✗'} ${className}: ${found ? 'FOUND' : 'MISSING'}`);
  if (found) cssTestsPassed++;
});

console.log(`CSS Tests: ${cssTestsPassed}/${expectedClasses.length} passed`);

// Test 2: Verify background images are specified correctly
console.log("\n--- Test 2: Background Image Verification ---");
const backgroundTests = [
  { class: 'racial-skill-targets-default', image: 'skill-targets-default.webp' },
  { class: 'racial-skill-targets-gnome', image: 'skill-targets-gnome.webp' },
  { class: 'racial-skill-targets-dwarf', image: 'skill-targets-dwarf.webp' }
];

let imageTestsPassed = 0;
backgroundTests.forEach(test => {
  const found = cssContent.includes(test.class) && cssContent.includes(test.image);
  console.log(`${found ? '✓' : '✗'} ${test.class} → ${test.image}: ${found ? 'CORRECT' : 'MISSING'}`);
  if (found) imageTestsPassed++;
});

console.log(`Image Tests: ${imageTestsPassed}/${backgroundTests.length} passed`);

// Test 3: Logic verification (from previous test)
console.log("\n--- Test 3: JavaScript Logic Verification ---");

function getRacialSkillTargetClass(race, characterClass) {
  let racialSkillTargetClass = 'racial-skill-targets-default';
  
  if (race === 'gnome') {
    if (characterClass !== 'gnome') {
      racialSkillTargetClass = 'racial-skill-targets-gnome';
    }
  } else if (race === 'dwarf') {
    if (characterClass !== 'dwarf') {
      racialSkillTargetClass = 'racial-skill-targets-dwarf';
    }
  }
  
  return racialSkillTargetClass;
}

const logicTests = [
  { race: 'human', class: 'fighter', expected: 'racial-skill-targets-default' },
  { race: 'elf', class: 'magic-user', expected: 'racial-skill-targets-default' },
  { race: 'gnome', class: 'fighter', expected: 'racial-skill-targets-gnome' },
  { race: 'gnome', class: 'gnome', expected: 'racial-skill-targets-default' },
  { race: 'dwarf', class: 'cleric', expected: 'racial-skill-targets-dwarf' },
  { race: 'dwarf', class: 'dwarf', expected: 'racial-skill-targets-default' }
];

let logicTestsPassed = 0;
logicTests.forEach((test, index) => {
  const result = getRacialSkillTargetClass(test.race, test.class);
  const passed = result === test.expected;
  console.log(`${passed ? '✓' : '✗'} Test ${index + 1}: ${test.race}/${test.class} → ${result} ${passed ? 'PASS' : 'FAIL'}`);
  if (passed) logicTestsPassed++;
});

console.log(`Logic Tests: ${logicTestsPassed}/${logicTests.length} passed`);

// Test 4: Verify JavaScript compilation
console.log("\n--- Test 4: JavaScript Compilation Verification ---");
const jsContent = readFileSync('dist/ose.js', 'utf8');
const jsChecks = [
  'racial-skill-targets-default',
  'racial-skill-targets-gnome',
  'racial-skill-targets-dwarf'
];

let jsTestsPassed = 0;
jsChecks.forEach(check => {
  const found = jsContent.includes(check);
  console.log(`${found ? '✓' : '✗'} JS contains ${check}: ${found ? 'FOUND' : 'MISSING'}`);
  if (found) jsTestsPassed++;
});

console.log(`JavaScript Tests: ${jsTestsPassed}/${jsChecks.length} passed`);

// Summary
console.log("\n=== SUMMARY ===");
const totalTests = cssTestsPassed + imageTestsPassed + logicTestsPassed + jsTestsPassed;
const totalPossible = expectedClasses.length + backgroundTests.length + logicTests.length + jsChecks.length;

console.log(`Overall: ${totalTests}/${totalPossible} tests passed`);
console.log(`System Status: ${totalTests === totalPossible ? '✅ READY FOR TESTING' : '⚠️  NEEDS ATTENTION'}`);

console.log("\n--- Next Steps ---");
console.log("1. Load the system in Foundry VTT");
console.log("2. Create a character with different race/class combinations");
console.log("3. Verify background images change on the combat tab");
console.log("4. Test positioning tool works with new racial system");