// Simple test to check if we can detect the simplified positioning elements
console.log('=== POSITIONING TOOL DEBUG TEST ===');

// Test 1: Check if elements exist
const abilityElements = document.querySelectorAll('.cs-ability');
const saveElements = document.querySelectorAll('.cs-save');
console.log('Found .cs-ability elements:', abilityElements.length);
console.log('Found .cs-save elements:', saveElements.length);

// Test 2: Check combined selector
const combinedElements = document.querySelectorAll('[class*="cs-pos-"], .cs-ability, .cs-save');
console.log('Found combined elements:', combinedElements.length);

// Test 3: Check if elements have the right-click listeners
abilityElements.forEach((el, index) => {
  console.log(`Ability ${index}:`, el.className);
  console.log(`Has position listener:`, el.hasAttribute('data-position-listener'));
  console.log(`Title:`, el.title);
  console.log(`Cursor:`, el.style.cursor);
});

saveElements.forEach((el, index) => {
  console.log(`Save ${index}:`, el.className);
  console.log(`Has position listener:`, el.hasAttribute('data-position-listener'));
  console.log(`Title:`, el.title);
  console.log(`Cursor:`, el.style.cursor);
});

// Test 4: Try to manually trigger createPositionTool
if (abilityElements.length > 0) {
  console.log('Testing createPositionTool on first ability element...');
  try {
    if (typeof createPositionTool === 'function') {
      createPositionTool(abilityElements[0]);
      console.log('createPositionTool executed successfully');
    } else {
      console.error('createPositionTool function not found');
    }
  } catch (error) {
    console.error('Error calling createPositionTool:', error);
  }
}
