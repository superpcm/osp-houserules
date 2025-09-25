/**
 * Simple Position Tool Debug - Focuses on our direct initialization approaches
 */

console.log('=== Simple Position Tool Debug ===');

// Check 1: System initialization logs
console.log('1. Looking for system initialization logs in console...');
console.log('   Expected: "OSP SYSTEM INIT - DIRECT POSITION TOOL FIX"');
console.log('   Expected: "Position tool safety check #1"');

// Check 2: Classes available  
console.log('2. Checking available classes...');
if (window.OSPDebug) {
    console.log('  ✅ OSPDebug available');
    console.log('  PositionToolHandler:', !!window.OSPDebug.PositionToolHandler);
} else {
    console.log('  ❌ OSPDebug not available');
}

// Check 3: Character sheet status
const sheets = document.querySelectorAll('.osp.sheet.actor.character');
console.log(`3. Found ${sheets.length} character sheet(s)`);

if (sheets.length > 0) {
    // Find app for first sheet
    const sheet = sheets[0];
    let app = null;
    
    if (window.ui && window.ui.windows) {
        for (let [id, appInstance] of Object.entries(window.ui.windows)) {
            if (appInstance.element && appInstance.element[0] === sheet) {
                app = appInstance;
                break;
            }
        }
    }
    
    if (app) {
        console.log('  Sheet app found:', app.constructor.name);
        console.log('  Has handlers:', !!app.handlers);
        
        if (app.handlers) {
            console.log('  Handler names:', Array.from(app.handlers.keys()));
            const hasPositionTool = app.handlers.has('positionTool');
            
            if (hasPositionTool) {
                console.log('  ✅ Position tool handler EXISTS');
                console.log('  🎯 Right-click should work!');
            } else {
                console.log('  ❌ Position tool handler MISSING');
                console.log('  Wait for safety net timer to fix it...');
            }
        }
    }
}

// Check 4: Test right-click on first element
if (sheets.length > 0) {
    const firstPosElement = sheets[0].querySelector('[class*="cs-pos-"]');
    if (firstPosElement) {
        console.log('4. Testing right-click on first positioning element...');
        console.log('  Element:', firstPosElement.className);
        console.log('  👆 Try right-clicking this element now!');
        
        // Add a temporary test listener
        const testHandler = (e) => {
            e.preventDefault();
            console.log('🎯 RIGHT-CLICK TEST DETECTED! The positioning should work.');
            firstPosElement.removeEventListener('contextmenu', testHandler);
        };
        firstPosElement.addEventListener('contextmenu', testHandler);
    }
}

console.log('=== Debug Complete ===');
console.log('Watch the console for safety net timer logs every 3 seconds...');