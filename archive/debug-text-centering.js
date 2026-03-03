// Text Centering Debug Helper
// Run this in the browser console to test centering adjustments

function applyTextCenteringFixes() {
    console.log('Applying text centering fixes...');
    
    // Level field adjustment
    const levelDisplay = document.querySelector('.cs-level-display');
    if (levelDisplay) {
        levelDisplay.classList.add('cs-level-field-adjust');
        console.log('Applied level field adjustment');
    }
    
    // XP Mod field adjustment
    const xpModDisplay = document.querySelector('.cs-xp-mod-display');
    if (xpModDisplay) {
        xpModDisplay.classList.add('cs-xp-mod-field-adjust');
        console.log('Applied XP mod field adjustment');
    }
    
    // Number-only fields
    const numberFields = document.querySelectorAll('.cs-save-value, .cs-ability-select');
    numberFields.forEach(field => {
        if (field.textContent && /^\d+$/.test(field.textContent.trim())) {
            field.classList.add('cs-number-only-center');
        }
    });
    console.log(`Applied number-only centering to ${numberFields.length} fields`);
    
    // Mixed alphanumeric fields (like XP mod with + and %)
    const mixedFields = document.querySelectorAll('.cs-xp-mod-display');
    mixedFields.forEach(field => {
        if (field.textContent && /[+\-].*%/.test(field.textContent.trim())) {
            field.classList.add('cs-mixed-alphanumeric-center');
        }
    });
    console.log(`Applied mixed alphanumeric centering to ${mixedFields.length} fields`);
}

function removeTextCenteringFixes() {
    console.log('Removing text centering fixes...');
    const classes = [
        'cs-level-field-adjust',
        'cs-xp-mod-field-adjust', 
        'cs-number-only-center',
        'cs-mixed-alphanumeric-center'
    ];
    
    classes.forEach(className => {
        document.querySelectorAll(`.${className}`).forEach(el => {
            el.classList.remove(className);
        });
    });
    console.log('Removed all centering fix classes');
}

function analyzeFieldCentering() {
    console.log('Analyzing field centering...');
    
    const fields = document.querySelectorAll('.cs-level-display, .cs-xp-mod-display, .cs-xp-display, .cs-next-level-display, .cs-char-name');
    
    fields.forEach(field => {
        const rect = field.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(field);
        
        console.log(`Field: ${field.className}`);
        console.log(`  Content: "${field.textContent || field.value || 'empty'}"`);
        console.log(`  Size: ${rect.width}x${rect.height}`);
        console.log(`  Transform: ${computedStyle.transform}`);
        console.log(`  Text-align: ${computedStyle.textAlign}`);
        console.log(`  Line-height: ${computedStyle.lineHeight}`);
        console.log(`  Font-size: ${computedStyle.fontSize}`);
        console.log('---');
    });
}

// Usage:
// applyTextCenteringFixes() - applies additional centering fixes
// removeTextCenteringFixes() - removes all applied fixes  
// analyzeFieldCentering() - logs detailed field information for debugging

console.log('Text centering helper loaded. Available functions:');
console.log('- applyTextCenteringFixes()');
console.log('- removeTextCenteringFixes()'); 
console.log('- analyzeFieldCentering()');
