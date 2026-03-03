// Simple test to check if we can detect the positioning elements
console.log('=== POSITIONING ELEMENTS DEBUG TEST ===');

// Test 1: Check if elements exist
const abilityElements = document.querySelectorAll('.cs-ability');
const saveElements = document.querySelectorAll('.cs-save');
console.log('Found .cs-ability elements:', abilityElements.length);
console.log('Found .cs-save elements:', saveElements.length);

// Test 2: Check combined selector for positioned elements
const combinedElements = document.querySelectorAll('[class*="cs-pos-"], .cs-ability, .cs-save');
console.log('Found combined elements:', combinedElements.length);

// Test 3: Check element positions and styling
abilityElements.forEach((el, index) => {
  console.log(`Ability ${index}:`, el.className);
  const styles = window.getComputedStyle(el);
  console.log(`  Position: ${styles.position}`);
  console.log(`  Left: ${styles.left}`);
  console.log(`  Top: ${styles.top}`);
});

saveElements.forEach((el, index) => {
  console.log(`Save ${index}:`, el.className);
  const styles = window.getComputedStyle(el);
  console.log(`  Position: ${styles.position}`);
  console.log(`  Left: ${styles.left}`);
  console.log(`  Top: ${styles.top}`);
});

console.log('=== Position Variables Test ===');
// Test CSS custom properties if any elements found
if (abilityElements.length > 0) {
  const el = abilityElements[0];
  const styles = window.getComputedStyle(el);
  console.log('First ability element CSS properties:');
  console.log('  --left:', styles.getPropertyValue('--left'));
  console.log('  --top:', styles.getPropertyValue('--top'));
  console.log('  --width:', styles.getPropertyValue('--width'));
  console.log('  --height:', styles.getPropertyValue('--height'));
}
