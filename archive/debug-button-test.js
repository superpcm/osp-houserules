/**
 * Debug Arrow and Size Button Test Script
 * 
 * This script helps diagnose button click issues in the position tool dialog.
 * 
 * To use:
 * 1. Open character sheet in Foundry VTT
 * 2. Right-click any positionable element to open position dialog
 * 3. Open browser console (F12) 
 * 4. Copy and paste this script
 * 5. Press Enter to run
 */

console.log('=== Position Tool Button Debug Test ===');

// Find the position dialog if it's open
const positionDialog = document.querySelector('.cs-position-dialog');
if (!positionDialog) {
    console.log('❌ No position dialog found. Please:');
    console.log('   1. Right-click any positionable element to open the dialog');
    console.log('   2. Then run this test script');
    console.log('=== Test Aborted ===');
} else {
    console.log('✅ Position dialog found!');
    
    // Test 1: Check button existence
    console.log('1. Checking button elements...');
    const arrowButtons = positionDialog.querySelectorAll('.cs-arrow-btn');
    const sizeButtons = positionDialog.querySelectorAll('.cs-size-btn');
    
    console.log(`   Arrow buttons found: ${arrowButtons.length} (should be 4)`);
    console.log(`   Size buttons found: ${sizeButtons.length} (should be 4)`);
    
    // Test 2: Check arrow button data attributes
    console.log('2. Arrow button details:');
    arrowButtons.forEach((btn, index) => {
        const direction = btn.getAttribute('data-direction');
        const title = btn.getAttribute('title');
        const text = btn.textContent;
        console.log(`   Button ${index + 1}: direction="${direction}", title="${title}", text="${text}"`);
    });
    
    // Test 3: Check size button data attributes  
    console.log('3. Size button details:');
    sizeButtons.forEach((btn, index) => {
        const dimension = btn.getAttribute('data-dimension');
        const change = btn.getAttribute('data-change');
        const title = btn.getAttribute('title');
        const text = btn.textContent;
        console.log(`   Button ${index + 1}: dimension="${dimension}", change="${change}", title="${title}", text="${text}"`);
    });
    
    // Test 4: Check input fields
    console.log('4. Input field check:');
    const leftInput = positionDialog.querySelector('#pos-left');
    const topInput = positionDialog.querySelector('#pos-top');
    const widthInput = positionDialog.querySelector('#pos-width');
    const heightInput = positionDialog.querySelector('#pos-height');
    
    console.log(`   Left input: ${leftInput ? '✅ found' : '❌ missing'} (value: ${leftInput?.value})`);
    console.log(`   Top input: ${topInput ? '✅ found' : '❌ missing'} (value: ${topInput?.value})`);
    console.log(`   Width input: ${widthInput ? '✅ found' : '❌ missing'} (value: ${widthInput?.value})`);
    console.log(`   Height input: ${heightInput ? '✅ found' : '❌ missing'} (value: ${heightInput?.value})`);
    
    // Test 5: Test button click simulation
    console.log('5. 🎯 Button Click Tests:');
    console.log('   Watch for console messages when you click buttons...');
    console.log('   Expected messages:');
    console.log('     - "Arrow button clicked: [direction]"');
    console.log('     - "handleArrowClick called with direction: [direction]"');
    console.log('     - "Size button clicked: [dimension] +/-1"');
    console.log('     - "handleSizeClick called - dimension: [dimension], change: [±1]"');
    
    // Test 6: Add manual test buttons (as backup)
    if (!window.manualTestAdded) {
        console.log('6. Adding manual test buttons to console...');
        
        window.testArrowButton = function(direction) {
            console.log(`🔧 Manual test: Arrow ${direction}`);
            const btn = positionDialog.querySelector(`[data-direction="${direction}"]`);
            if (btn) {
                btn.click();
                console.log('   Button click triggered');
            } else {
                console.log('   ❌ Button not found');
            }
        };
        
        window.testSizeButton = function(dimension, change) {
            console.log(`🔧 Manual test: Size ${dimension} ${change > 0 ? '+' : ''}${change}`);
            const btn = positionDialog.querySelector(`[data-dimension="${dimension}"][data-change="${change}"]`);
            if (btn) {
                btn.click();
                console.log('   Button click triggered');
            } else {
                console.log('   ❌ Button not found');
            }
        };
        
        console.log('   ✅ Manual test functions added:');
        console.log('     testArrowButton("up"), testArrowButton("down"), testArrowButton("left"), testArrowButton("right")');
        console.log('     testSizeButton("width", 1), testSizeButton("width", -1)');
        console.log('     testSizeButton("height", 1), testSizeButton("height", -1)');
        
        window.manualTestAdded = true;
    }
}

console.log('=== Debug Test Complete ===');
console.log('');
console.log('📋 TESTING CHECKLIST:');
console.log('✅ 1. Try clicking each arrow button (↑↓←→)');
console.log('✅ 2. Try clicking each size button (+/-)');  
console.log('✅ 3. Watch console for debug messages');
console.log('✅ 4. Check if input values change');
console.log('✅ 5. Check if element position/size updates visually');
console.log('');
console.log('🔧 If buttons still don\'t work, use manual test functions above!');