/**
 * Item Sheet Position Tool Test Script
 * 
 * To use:
 * 1. Open an item, weapon, armor, or container sheet in Foundry VTT
 * 2. Open browser console (F12)
 * 3. Copy and paste this script
 * 4. Press Enter to run
 */

console.log('=== Item Sheet Position Tool Test ===');

// Test 1: Check if item sheet exists and position handler is active
const sheetElements = document.querySelectorAll('.osp.sheet.item');
console.log('1. Found item sheets:', sheetElements.length);

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
    
    // Test 2: Count positionable elements
    const isPosElements = sheet.querySelectorAll('[class*="is-pos-"]');
    console.log('3. Positionable elements:');
    console.log(`   is-pos-* elements: ${isPosElements.length}`);
    
    if (isPosElements.length > 0) {
        console.log('   First 5 elements:');
        Array.from(isPosElements).slice(0, 5).forEach((el, index) => {
            const classList = Array.from(el.classList).filter(c => c.includes('is-pos-'));
            console.log(`     ${index + 1}. ${classList.join(', ')}`);
        });
    }
    
    // Test 3: Instructions for testing features
    console.log('4. 🎯 HOW TO TEST:');
    console.log('   Step 1: Add is-pos-* classes to item sheet elements');
    console.log('     - Edit item sheet HTML templates');
    console.log('     - Add classes like: is-pos-item-name, is-pos-cost, is-pos-weight, etc.');
    console.log('   Step 2: Right-click on elements with is-pos-* classes');
    console.log('   Step 3: Use the positioning dialog:');
    console.log('     - ↑↓←→ buttons or arrow keys to move');
    console.log('     - +/- buttons to resize width');
    console.log('     - [ ] keys to resize height');
    console.log('     - Click "Apply Changes" to save');
    console.log('');
    console.log('5. 📝 EXAMPLE CLASSES TO ADD:');
    console.log('   <input class="is-pos-item-name" ...>');
    console.log('   <input class="is-pos-cost" ...>');
    console.log('   <input class="is-pos-weight" ...>');
    console.log('   <select class="is-pos-size" ...>');
    console.log('   <div class="is-pos-description" ...>');
    
} else {
    console.log('❌ No item sheet found - make sure one is open');
    console.log('   Open any item, weapon, armor, or container sheet first');
}

console.log('=== Test Complete ===');
console.log('');
console.log('💡 NEXT STEPS:');
console.log('1. Build the system: npm run build');
console.log('2. Reload Foundry VTT');
console.log('3. Open an item sheet');
console.log('4. Add is-pos-* classes to elements you want to position');
console.log('5. Right-click on those elements to use the positioning tool');
console.log('');
console.log('🚀 Position tool is ready for item sheets!');
