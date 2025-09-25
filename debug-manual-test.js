/**
 * Manual test script for PositionToolHandler debugging
 * 
 * To use:
 * 1. Open character sheet in Foundry VTT
 * 2. Open browser console (F12)
 * 3. Copy and paste this entire script
 * 4. Press Enter to run
 */

console.log('=== PositionToolHandler Manual Test ===');

// Test 1: Check if system classes are available
console.log('1. Checking system classes...');
console.log('  window.OSPDebug:', !!window.OSPDebug);
if (window.OSPDebug) {
    console.log('  OspActorSheetCharacter:', !!window.OSPDebug.OspActorSheetCharacter);
    console.log('  PositionToolHandler:', !!window.OSPDebug.PositionToolHandler);
}

// Test 2: Find character sheet instance
console.log('2. Looking for character sheet...');
const sheetElements = document.querySelectorAll('.osp.sheet.actor.character');
console.log('  Found sheet elements:', sheetElements.length);

if (sheetElements.length > 0) {
    const sheetElement = sheetElements[0];
    console.log('  Sheet element classes:', sheetElement.className);
    
    // Test 3: Find the Foundry VTT app instance
    console.log('3. Looking for sheet app instance...');
    const appId = sheetElement.dataset.appid || sheetElement.id;
    console.log('  App ID:', appId);
    
    let sheetApp = null;
    
    // Try to find the app instance
    if (window.ui && window.ui.windows) {
        for (let [id, app] of Object.entries(window.ui.windows)) {
            if (app.element && app.element[0] === sheetElement) {
                sheetApp = app;
                break;
            }
        }
    }
    
    if (sheetApp) {
        console.log('  Found sheet app:', sheetApp.constructor.name);
        console.log('  App has handlers:', !!sheetApp.handlers);
        if (sheetApp.handlers) {
            console.log('  Handler count:', sheetApp.handlers.size);
            console.log('  Handler names:', Array.from(sheetApp.handlers.keys()));
            
            const hasPositionTool = sheetApp.handlers.has('positionTool');
            console.log('  Has positionTool handler:', hasPositionTool);
            
            if (hasPositionTool) {
                const handler = sheetApp.handlers.get('positionTool');
                console.log('  PositionTool handler type:', handler.constructor.name);
                console.log('  Right-click should already work!');
            } else {
                console.log('  PositionTool handler missing - will create manually');
            }
        }
        
        // Test 4: Manual position tool initialization (only if needed)
        console.log('4. Testing/fixing PositionToolHandler...');
        
        const hasPositionTool = sheetApp.handlers && sheetApp.handlers.has('positionTool');
        
        if (hasPositionTool) {
            console.log('  PositionTool handler already exists - no manual creation needed');
            console.log('  Right-click functionality should work automatically');
        } else {
            console.log('  PositionTool handler missing - creating manually...');
            try {
                // Try using the debug window first
                if (window.OSPDebug && window.OSPDebug.PositionToolHandler) {
                    console.log('  Using PositionToolHandler from OSPDebug...');
                    const handler = new window.OSPDebug.PositionToolHandler($(sheetElement), sheetApp.actor);
                    console.log('  Handler created successfully');
                    
                    handler.initialize();
                    console.log('  Handler initialized successfully');
                    
                    // Try to add it to the app's handlers
                    sheetApp.handlers.set('positionTool', handler);
                    console.log('  Handler added to app.handlers');
                    
                } else {
                    console.log('  PositionToolHandler not available in OSPDebug');
                    
                    // Fallback: Try importing from the built module
                    const { PositionToolHandler } = await import('/systems/osp-houserules/dist/ose.js');
                    console.log('  PositionToolHandler imported from module');
                    
                    const handler = new PositionToolHandler($(sheetElement), sheetApp.actor);
                    console.log('  Handler created successfully');
                    
                    handler.initialize();
                    console.log('  Handler initialized successfully');
                }
                
            } catch (error) {
                console.error('  Failed to create handler:', error);
            }
        }
        
    } else {
        console.log('  Could not find sheet app instance');
    }
    
    // Test 5: Check for positioning elements
    console.log('5. Checking for positioning elements...');
    const posElements = sheetElement.querySelectorAll('[class*="cs-pos-"]');
    console.log('  Found cs-pos elements:', posElements.length);
    
    if (posElements.length > 0) {
        console.log('  Sample elements:');
        for (let i = 0; i < Math.min(3, posElements.length); i++) {
            const el = posElements[i];
            console.log(`    ${i + 1}. ${el.tagName}#${el.id} - ${el.className}`);
        }
    }
    
} else {
    console.log('  No character sheet found - make sure one is open');
}

console.log('=== Test Complete ===');