/**
 * Debug script to test position tool element selection
 * Run this in the browser console when the character sheet is open
 */

// Test if we can find cs-pos-* elements
console.log('=== Position Tool Debug ===');

const sheet = $('.osp.sheet.actor.character');
console.log('Found character sheet:', sheet.length > 0 ? 'YES' : 'NO');

if (sheet.length > 0) {
    // Test the same selector our handler uses
    const positionableElements = sheet.find('[class*="cs-pos-"]');
    console.log(`Found ${positionableElements.length} elements with cs-pos-* classes`);
    
    if (positionableElements.length > 0) {
        console.log('First 5 elements found:');
        positionableElements.slice(0, 5).each((index, el) => {
            console.log(`  ${index + 1}. ${el.id} - ${el.className}`);
        });
        
        // Test binding a right-click event to first element
        const firstElement = $(positionableElements[0]);
        console.log(`Testing right-click on first element: ${firstElement[0].className}`);
        
        firstElement.on('contextmenu.debug', (event) => {
            event.preventDefault();
            console.log('DEBUG: Right-click detected on element!');
            alert('Right-click test successful!');
        });
        
        console.log('Right-click test event bound. Try right-clicking the first element.');
    } else {
        console.log('No cs-pos-* elements found. Checking if any elements exist at all...');
        const allElements = sheet.find('*');
        console.log(`Total elements in sheet: ${allElements.length}`);
        
        // Look for elements that might have the cs-pos classes
        const elementsWithPos = sheet.find('*').filter((index, el) => {
            return el.className && el.className.includes('cs-pos-');
        });
        console.log(`Elements with cs-pos- in className: ${elementsWithPos.length}`);
    }
    
    // Check if sheet has editable class
    console.log('Sheet has editable class:', sheet.hasClass('editable'));
    console.log('Sheet classes:', sheet[0].className);
} else {
    console.log('No character sheet found. Make sure a character sheet is open.');
}