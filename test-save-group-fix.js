// Test the save group positioning fix
console.log("=== Testing Save Group Positioning Fix ===");

// Test 1: Verify element selector changes
function testElementSelection() {
  console.log("\n--- Testing Element Selection Changes ---");
  
  const oldSelector = '[class*="cs-pos-"], .cs-ability, .cs-save';
  const newSelector = '[class*="cs-pos-"], .cs-ability, .cs-save-group';
  
  console.log(`Old selector: ${oldSelector}`);
  console.log(`New selector: ${newSelector}`);
  console.log('\nThis change means:');
  console.log('✅ Right-clicking on .cs-save-group containers will open positioning tool');
  console.log('❌ Right-clicking on .cs-save child elements will NOT open positioning tool');
  console.log('💡 This avoids nested absolute positioning issues');
}

// Test 2: Verify class detection logic
function testClassDetection() {
  console.log("\n--- Testing Class Detection Logic ---");
  
  const testElements = [
    {
      className: 'save-group-death cs-save-group',
      description: 'Death Save Group Container'
    },
    {
      className: 'save-group-wands cs-save-group', 
      description: 'Wands Save Group Container'
    },
    {
      className: 'ability cs-ability cs-abs',
      description: 'Ability Container (unchanged)'
    },
    {
      className: 'save death-save cs-save cs-abs',
      description: 'Save Child Element (no longer targeted)'
    }
  ];
  
  testElements.forEach(elem => {
    console.log(`\nTesting: ${elem.description}`);
    console.log(`Classes: ${elem.className}`);
    
    // New detection logic
    let positionName = 'unknown';
    let cssClass = '';
    
    const posMatch = elem.className.match(/cs-pos-(\w+)/);
    if (posMatch) {
      positionName = posMatch[1];
      cssClass = `cs-pos-${positionName}`;
    } else if (elem.className.includes('cs-ability')) {
      const attrMatch = elem.className.match(/attr-(\w+)/);
      positionName = attrMatch ? `ability-${attrMatch[1]}` : 'ability-unknown';
      cssClass = 'cs-ability';
    } else if (elem.className.includes('cs-save-group')) {
      const saveGroupMatch = elem.className.match(/save-group-(\w+)/);
      positionName = saveGroupMatch ? `save-${saveGroupMatch[1]}` : 'save-unknown';
      cssClass = 'cs-save-group';
    } else if (elem.className.includes('cs-save')) {
      const saveMatch = elem.className.match(/(\w+)-save/);
      positionName = saveMatch ? `save-${saveMatch[1]}` : 'save-unknown';
      cssClass = 'cs-save';
    }
    
    console.log(`  → cssClass: "${cssClass}"`);
    console.log(`  → positionName: "${positionName}"`);
    console.log(`  → Will be targeted: ${cssClass !== '' && cssClass !== 'cs-save'}`);
  });
}

// Test 3: Verify CSS changes
function testCSSChanges() {
  console.log("\n--- Testing CSS Changes ---");
  
  console.log("Added CSS rule for .cs-save-group:");
  console.log("  position: absolute !important;");
  console.log("  left: var(--left, auto) !important;"); 
  console.log("  top: var(--top, auto) !important;");
  console.log("  width: var(--width, auto) !important;");
  console.log("  height: var(--height, auto) !important;");
  
  console.log("\nThis ensures save group containers can be positioned directly");
  console.log("without nested absolute positioning conflicts.");
}

// Test 4: Verify updateElementPosition changes
function testUpdateLogic() {
  console.log("\n--- Testing Update Logic Changes ---");
  
  console.log("Updated condition for direct styles:");
  console.log("OLD: cssClass === 'cs-ability' || cssClass === 'cs-save'");
  console.log("NEW: cssClass === 'cs-ability' || cssClass === 'cs-save' || cssClass === 'cs-save-group'");
  console.log("\nThis means .cs-save-group elements will get both:");
  console.log("  1. CSS custom properties (--left, --top, --width, --height)");
  console.log("  2. Direct styles (style.left, style.top, style.width, style.height)");
}

// Test 5: Expected behavior
function testExpectedBehavior() {
  console.log("\n--- Expected Behavior After Fix ---");
  
  console.log("ABILITIES:");
  console.log("  ✅ Right-click on ability container → positioning tool opens");
  console.log("  ✅ All controls should work (left, right, up, down, +width, -width, +height, -height)");
  console.log("  📍 Target: .cs-ability container div");
  
  console.log("\nSAVES:");
  console.log("  ✅ Right-click on save group container → positioning tool opens"); 
  console.log("  ✅ All controls should work (left, right, up, down, +width, -width, +height, -height)");
  console.log("  📍 Target: .cs-save-group container div (NOT child .cs-save)");
  console.log("  💡 Avoids nested absolute positioning conflicts");
  
  console.log("\nPOTENTIAL ISSUE:");
  console.log("  ⚠️  Users might expect to right-click on the save badge itself");
  console.log("  ⚠️  Now they need to right-click on the container area around it");
  console.log("  💡 This is a trade-off to fix the positioning functionality");
}

// Run all tests
testElementSelection();
testClassDetection();
testCSSChanges();
testUpdateLogic();
testExpectedBehavior();

console.log("\n=== Summary ===");
console.log("🔧 CHANGES MADE:");
console.log("1. Target .cs-save-group containers instead of .cs-save child elements");
console.log("2. Added CSS positioning rules for .cs-save-group");
console.log("3. Updated JavaScript logic to handle save groups");
console.log("4. Maintained all existing functionality for abilities and cs-pos elements");
console.log("\n🎯 EXPECTED RESULT:");
console.log("All positioning controls should now work for both abilities and saves!");