/**
 * Position Update Analysis Script
 * 
 * This script helps analyze why elements aren't visually updating.
 * 
 * To use:
 * 1. Open character sheet and position dialog
 * 2. Open console (F12)
 * 3. Run this script
 * 4. Try using arrow/size buttons
 * 5. Check the detailed debug output
 */

console.log('=== Position Update Analysis ===');

// Find the position dialog and the element being positioned
const dialog = document.querySelector('.cs-position-dialog');
if (!dialog) {
    console.log('❌ No position dialog found. Please open one first.');
    console.log('=== Analysis Aborted ===');
} else {
    console.log('✅ Position dialog found');
    
    // Try to find what element is being positioned by looking for the one with border guide
    const allElements = document.querySelectorAll('.osp.sheet.actor.character *');
    let targetElement = null;
    
    for (let el of allElements) {
        if (el.style.border && el.style.border.includes('dotted red')) {
            targetElement = el;
            break;
        }
    }
    
    if (targetElement) {
        console.log('🎯 Found target element with border guide:');
        console.log('   Class:', targetElement.className);
        console.log('   Tag:', targetElement.tagName);
        console.log('   ID:', targetElement.id);
        
        // Analyze current positioning
        const computed = window.getComputedStyle(targetElement);
        const inline = targetElement.style;
        
        console.log('📊 Current element analysis:');
        console.log('   Computed styles:', {
            position: computed.position,
            left: computed.left,
            top: computed.top,
            width: computed.width,
            height: computed.height,
            display: computed.display
        });
        
        console.log('   Inline styles:', {
            position: inline.position,
            left: inline.left,
            top: inline.top,
            width: inline.width,
            height: inline.height
        });
        
        // Check for CSS custom properties if it's a cs-pos element
        if (targetElement.className.includes('cs-pos-')) {
            const posMatch = targetElement.className.match(/cs-pos-(\w+)/);
            if (posMatch) {
                const name = posMatch[1];
                const root = document.documentElement;
                console.log('🔧 CSS Custom Properties for cs-pos-' + name + ':');
                console.log('   --cs-pos-' + name + '-left:', root.style.getPropertyValue(`--cs-pos-${name}-left`) || 'not set');
                console.log('   --cs-pos-' + name + '-top:', root.style.getPropertyValue(`--cs-pos-${name}-top`) || 'not set');
                console.log('   --cs-pos-' + name + '-width:', root.style.getPropertyValue(`--cs-pos-${name}-width`) || 'not set');
                console.log('   --cs-pos-' + name + '-height:', root.style.getPropertyValue(`--cs-pos-${name}-height`) || 'not set');
            }
        }
        
        // Check parent positioning context
        console.log('📍 Parent positioning context:');
        let parent = targetElement.parentElement;
        while (parent && parent !== document.body) {
            const parentComputed = window.getComputedStyle(parent);
            if (parentComputed.position !== 'static') {
                console.log(`   Positioned parent found: ${parent.tagName}.${parent.className}`);
                console.log(`     Position: ${parentComputed.position}`);
                break;
            }
            parent = parent.parentElement;
        }
        
        // Add a test function to manually try positioning
        window.testElementPosition = function(left, top, width, height) {
            console.log(`🧪 Testing manual position: left=${left}, top=${top}, width=${width}, height=${height}`);
            
            // Try direct style application
            if (left !== undefined) targetElement.style.left = left + 'px';
            if (top !== undefined) targetElement.style.top = top + 'px';  
            if (width !== undefined) targetElement.style.width = width + 'px';
            if (height !== undefined) targetElement.style.height = height + 'px';
            
            // Ensure positioning
            if (!targetElement.style.position || targetElement.style.position === 'static') {
                targetElement.style.position = 'absolute';
            }
            
            console.log('   Applied styles directly to element');
            
            // Check result
            const newComputed = window.getComputedStyle(targetElement);
            console.log('   New computed styles:', {
                left: newComputed.left,
                top: newComputed.top,
                width: newComputed.width,
                height: newComputed.height,
                position: newComputed.position
            });
        };
        
        console.log('');
        console.log('🛠️  MANUAL TEST FUNCTION ADDED:');
        console.log('   testElementPosition(100, 50, 200, 30) - try moving to 100,50 with size 200x30');
        console.log('   This tests if direct style application works');
        
    } else {
        console.log('❌ No target element found with border guide');
        console.log('   Make sure to right-click an element first');
    }
}

console.log('');
console.log('📋 DEBUGGING CHECKLIST:');
console.log('1. ✅ Try using arrow/size buttons and watch console');  
console.log('2. ✅ Check if "🔧 updateElementPosition called" appears');
console.log('3. ✅ Check if styles are being set correctly'); 
console.log('4. ✅ Check if computed styles change after updates');
console.log('5. ✅ Try testElementPosition() to see if manual positioning works');
console.log('');
console.log('=== Analysis Ready ===');