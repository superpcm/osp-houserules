// Test to identify specific control issues
console.log("=== Testing Specific Control Issues ===");

// Simulate what happens when different controls are activated
function testControlActivation() {
  console.log("\n--- Simulating Control Activation ---");
  
  // Mock the element data that would be passed to update functions
  const abilityElement = {
    name: 'ability-str',
    cssClass: 'cs-ability',
    element: { /* mock element */ }
  };
  
  const saveElement = {
    name: 'save-death',
    cssClass: 'cs-save', 
    element: { /* mock element */ }
  };
  
  // Test different control actions
  const controlTests = [
    { action: 'left arrow', property: 'left', change: -1 },
    { action: 'right arrow', property: 'left', change: 1 },
    { action: 'up arrow', property: 'top', change: -1 },
    { action: 'down arrow', property: 'top', change: 1 },
    { action: 'width +', property: 'width', change: 1 },
    { action: 'width -', property: 'width', change: -1 },
    { action: 'height +', property: 'height', change: 1 },
    { action: 'height -', property: 'height', change: -1 }
  ];
  
  console.log("Testing controls for ABILITIES:");
  controlTests.forEach(test => {
    console.log(`  ${test.action}: Modifies ${test.property} by ${test.change}`);
    console.log(`    Should work: YES (same logic for all controls)`);
  });
  
  console.log("\nTesting controls for SAVES:");
  controlTests.forEach(test => {
    console.log(`  ${test.action}: Modifies ${test.property} by ${test.change}`);
    console.log(`    Should work: YES (same logic for all controls)`);
  });
}

// Test the difference between working and non-working controls
function testWorkingVsNonWorking() {
  console.log("\n--- Analyzing Working vs Non-Working Controls ---");
  
  console.log("WORKING: Left/Right arrows for abilities");
  console.log("  - Modifies: CSS left property");
  console.log("  - Method: Sets --left custom property + direct style.left");
  console.log("  - Target: .cs-ability.cs-abs container div");
  
  console.log("\nNOT WORKING: Up/Down arrows for abilities");
  console.log("  - Modifies: CSS top property"); 
  console.log("  - Method: Sets --top custom property + direct style.top");
  console.log("  - Target: .cs-ability.cs-abs container div");
  console.log("  - IDENTICAL LOGIC TO LEFT/RIGHT!");
  
  console.log("\nNOT WORKING: +/- size buttons for abilities");
  console.log("  - Modifies: CSS width/height properties");
  console.log("  - Method: Sets --width/--height custom property + direct style");
  console.log("  - Target: .cs-ability.cs-abs container div");
  console.log("  - IDENTICAL LOGIC TO LEFT/RIGHT!");
  
  console.log("\nNOT WORKING: All controls for saves");
  console.log("  - Target: .cs-save.cs-abs container div");
  console.log("  - Nested inside: .cs-save-group (position: absolute)");
  console.log("  - POSSIBLE ISSUE: Nested absolute positioning!");
}

// Test potential fixes
function testPotentialFixes() {
  console.log("\n--- Potential Fixes ---");
  
  console.log("1. CSS Specificity Issue:");
  console.log("   - FIXED: Added !important to positioning rules");
  console.log("   - Added specific overrides for .cs-ability.cs-abs and .cs-save.cs-abs");
  
  console.log("2. Nested Positioning Context:");
  console.log("   - ISSUE: Save elements are inside .cs-save-group (position: absolute)");
  console.log("   - FIX: Target parent .cs-save-group instead of child .cs-save?");
  
  console.log("3. JavaScript Logic Issue:");
  console.log("   - All controls use IDENTICAL update logic");
  console.log("   - If left/right work, up/down/size SHOULD work too");
  console.log("   - Unless there's a CSS rendering issue");
  
  console.log("4. Browser Rendering Issue:");
  console.log("   - Check if changes are applied but not visible");
  console.log("   - Check computed styles in browser dev tools");
  
  console.log("5. Event Handler Issue:");
  console.log("   - Check if all buttons are properly bound to events");
  console.log("   - Check browser console for JavaScript errors");
}

function identifyNextSteps() {
  console.log("\n--- Next Debugging Steps ---");
  
  console.log("1. Check browser console when using controls:");
  console.log("   - Are all button clicks registering?");
  console.log("   - Are updateElementPosition calls being made?");
  console.log("   - Are there any JavaScript errors?");
  
  console.log("2. Check computed styles in browser dev tools:");
  console.log("   - Do CSS custom properties get set? (--left, --top, --width, --height)"); 
  console.log("   - Do direct styles get set? (style.left, style.top, etc.)");
  console.log("   - Are styles being overridden by other CSS rules?");
  
  console.log("3. Test positioning hierarchy:");
  console.log("   - Try positioning .cs-save-group instead of .cs-save");
  console.log("   - Check if parent containers interfere with child positioning");
  
  console.log("4. Create minimal test case:");
  console.log("   - Test positioning on a simple div with same classes");
  console.log("   - Isolate the issue to CSS vs JavaScript");
}

// Run all tests
testControlActivation();
testWorkingVsNonWorking();
testPotentialFixes();
identifyNextSteps();

console.log("\n=== Primary Hypothesis ===");
console.log("🔍 NESTED POSITIONING CONTEXT ISSUE");
console.log("Save elements are inside absolutely positioned parent containers (.cs-save-group)");
console.log("This creates nested positioning that might interfere with direct child positioning");
console.log("\n🔧 Recommended Fix: Target the parent .cs-save-group containers for positioning");