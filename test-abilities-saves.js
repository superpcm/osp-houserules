/**
 * Test script to verify ability scores and saving throws work with position tool
 * 
 * To use:
 * 1. Open character sheet in Foundry VTT
 * 2. Open browser console (F12)
 * 3. Copy and paste this script
 * 4. Press Enter to run
 */

console.log('=== Position Tool Abilities & Saves Test ===');

// Test 1: Check if sheet exists
const sheetElements = document.querySelectorAll('.osp.sheet.actor.character');
console.log('1. Found character sheets:', sheetElements.length);

if (sheetElements.length > 0) {
    const sheet = sheetElements[0];
    
    // Test 2: Check ability score elements
    console.log('2. Testing ability score elements...');
    const abilityElements = sheet.querySelectorAll('.cs-ability');
    console.log('   Found cs-ability elements:', abilityElements.length);
    
    if (abilityElements.length > 0) {
        console.log('   Sample abilities:');
        for (let i = 0; i < Math.min(3, abilityElements.length); i++) {
            const el = abilityElements[i];
            console.log(`     ${i + 1}. ${el.className}`);
        }
    }
    
    // Test 3: Check saving throw elements  
    console.log('3. Testing saving throw elements...');
    const saveElements = sheet.querySelectorAll('.cs-save');
    console.log('   Found cs-save elements:', saveElements.length);
    
    if (saveElements.length > 0) {
        console.log('   Sample saves:');
        for (let i = 0; i < Math.min(3, saveElements.length); i++) {
            const el = saveElements[i];
            console.log(`     ${i + 1}. ${el.className}`);
        }
    }
    
    // Test 4: Check position tool detection
    console.log('4. Testing position tool selector...');
    const allPositionable = sheet.querySelectorAll('[class*="cs-pos-"], .cs-ability, .cs-save');
    console.log('   Total positionable elements (cs-pos + cs-ability + cs-save):', allPositionable.length);
    
    const csPos = sheet.querySelectorAll('[class*="cs-pos-"]').length;
    const csAbility = sheet.querySelectorAll('.cs-ability').length;
    const csSave = sheet.querySelectorAll('.cs-save').length;
    
    console.log('   Breakdown:');
    console.log(`     cs-pos-* elements: ${csPos}`);
    console.log(`     cs-ability elements: ${csAbility}`);
    console.log(`     cs-save elements: ${csSave}`);
    console.log(`     Total: ${csPos + csAbility + csSave} (should match ${allPositionable.length})`);
    
    // Test 5: Check position tool handler exists
    console.log('5. Checking for position tool handler...');
    const appId = sheet.dataset.appid || sheet.id;
    let sheetApp = null;
    
    if (window.ui && window.ui.windows) {
        for (let [id, app] of Object.entries(window.ui.windows)) {
            if (app.element && app.element[0] === sheet) {
                sheetApp = app;
                break;
            }
        }
    }
    
    if (sheetApp && sheetApp.handlers && sheetApp.handlers.has('positionTool')) {
        console.log('   ✅ PositionTool handler found and ready');
        console.log('   Right-click should now work on abilities and saves!');
    } else {
        console.log('   ❌ PositionTool handler not found');
        console.log('   Wait a few seconds for the safety net to activate...');
    }
    
} else {
    console.log('❌ No character sheet found - make sure one is open');
}

console.log('=== Test Complete ===');
console.log('Try right-clicking on:');
console.log('- Ability score dropdowns (STR, DEX, CON, INT, WIS, CHA)');
console.log('- Saving throw values (Death, Wands, Paralysis, Breath, Spells)');
console.log('- Any other cs-pos-* elements');