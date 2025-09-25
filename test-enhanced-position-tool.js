/**
 * Enhanced Position Tool Test Script
 * 
 * To use:
 * 1. Open character sheet in Foundry VTT
 * 2. Open browser console (F12)
 * 3. Copy and paste this script
 * 4. Press Enter to run
 */

console.log('=== Enhanced Position Tool Test ===');

// Test 1: Check if sheet exists and position handler is active
const sheetElements = document.querySelectorAll('.osp.sheet.actor.character');
console.log('1. Found character sheets:', sheetElements.length);

if (sheetElements.length > 0) {
    const sheet = sheetElements[0];
    
    // Find the app instance
    let sheetApp = null;
    if (window.ui && window.ui.windows) {
        for (let [id, app] of Object.entries(window.ui.windows)) {
            if (app.element && app.element[0] === sheet) {
                sheetApp = app;
                break;
            }
        }
    }
    
    const hasPositionTool = sheetApp && sheetApp.handlers && sheetApp.handlers.has('positionTool');
    console.log('2. Position tool handler status:', hasPositionTool ? '✅ READY' : '❌ NOT FOUND');
    
    // Test 2: Count positionable elements (all types)
    const csPos = sheet.querySelectorAll('[class*="cs-pos-"]').length;
    const csAbility = sheet.querySelectorAll('.cs-ability').length;
    const csSave = sheet.querySelectorAll('.cs-save').length;
    const total = csPos + csAbility + csSave;
    
    console.log('3. Positionable elements:');
    console.log(`   cs-pos-* elements: ${csPos}`);
    console.log(`   cs-ability elements: ${csAbility} (ability scores)`);
    console.log(`   cs-save elements: ${csSave} (saving throws)`);
    console.log(`   Total positionable: ${total}`);
    
    // Test 3: Instructions for testing new features
    console.log('4. 🎯 NEW FEATURES TO TEST:');
    console.log('   ✅ Visual Border Guide:');
    console.log('     - Right-click any positionable element');
    console.log('     - Should see a dotted red border around the element');
    console.log('     - Border disappears when dialog closes');
    console.log('');
    console.log('   ✅ Arrow Controls:');
    console.log('     - Use ↑↓←→ buttons to move element 1px at a time');
    console.log('     - Changes apply immediately (live preview)');
    console.log('     - Arrows are in a cross pattern in the dialog');
    console.log('');
    console.log('   ✅ Size Controls:');
    console.log('     - Use +/- buttons next to Width and Height');
    console.log('     - Adjusts dimensions by 1px increments');
    console.log('     - Minimum size is 10px');
    console.log('');
    console.log('   ✅ Error Fix:');
    console.log('     - "cssClass startsWith" error should be resolved');
    console.log('     - Apply Changes button should work without errors');
    
    // Test 4: Element samples for testing
    console.log('5. 🎯 SUGGESTED TEST TARGETS:');
    
    // Find sample elements
    const sampleAbility = sheet.querySelector('.cs-ability');
    const sampleSave = sheet.querySelector('.cs-save');
    const samplePos = sheet.querySelector('[class*="cs-pos-"]');
    
    if (sampleAbility) {
        console.log(`   Ability Score: ${sampleAbility.className}`);
    }
    if (sampleSave) {
        console.log(`   Saving Throw: ${sampleSave.className}`);
    }
    if (samplePos) {
        console.log(`   Positioned Element: ${samplePos.className}`);
    }
    
} else {
    console.log('❌ No character sheet found - make sure one is open');
}

console.log('=== Test Complete ===');
console.log('');
console.log('💡 TESTING STEPS:');
console.log('1. Right-click on any ability score dropdown (STR, DEX, etc.)');
console.log('2. Verify dotted red border appears around the element');
console.log('3. Use arrow buttons (↑↓←→) to move the element');
console.log('4. Use +/- buttons to resize width and height');
console.log('5. Click "Apply Changes" - should work without errors');
console.log('6. Close dialog - border should disappear');
console.log('');
console.log('🚀 All new features are ready to test!');