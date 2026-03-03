// Debug positioning issues for abilities and saves
console.log("=== Debugging Positioning Issues ===");

// Test the class detection logic from getElementPositionData
function testClassDetection() {
  console.log("\n--- Testing Class Detection Logic ---");
  
  const testElements = [
    {
      className: 'ability cs-ability cs-abs attr-str cs-ability-select',
      description: 'STR Ability Field'
    },
    {
      className: 'save death-save cs-save cs-abs',
      description: 'Death Save Field'
    },
    {
      className: 'save wands-save cs-save cs-abs', 
      description: 'Wands Save Field'
    },
    {
      className: 'cs-pos-armor-class cs-abs',
      description: 'Armor Class Field (working)'
    }
  ];
  
  testElements.forEach(elem => {
    console.log(`\nTesting: ${elem.description}`);
    console.log(`Class list: ${elem.className}`);
    
    // Simulate the detection logic from getElementPositionData
    let positionName = 'unknown';
    let cssClass = '';
    
    const posMatch = elem.className.match(/cs-pos-(\w+)/);
    if (posMatch) {
      positionName = posMatch[1];
      cssClass = `cs-pos-${positionName}`;
    } else if (elem.className.includes('cs-ability')) {
      // For ability scores, use the attribute type (str, dex, etc.)
      const attrMatch = elem.className.match(/attr-(\w+)/);
      positionName = attrMatch ? `ability-${attrMatch[1]}` : 'ability-unknown';
      cssClass = 'cs-ability';
    } else if (elem.className.includes('cs-save')) {
      // For saving throws, use the save type
      const saveMatch = elem.className.match(/(\w+)-save/);
      positionName = saveMatch ? `save-${saveMatch[1]}` : 'save-unknown';
      cssClass = 'cs-save';
    }
    
    console.log(`  Detected cssClass: "${cssClass}"`);
    console.log(`  Detected positionName: "${positionName}"`);
    console.log(`  Should get direct styles: ${cssClass === 'cs-ability' || cssClass === 'cs-save'}`);
  });
}

// Test the updateElementPosition logic
function testUpdateLogic() {
  console.log("\n--- Testing Update Logic ---");
  
  // Mock element for testing
  const mockElement = {
    0: {
      className: 'save death-save cs-save cs-abs',
      style: {
        properties: {},
        setProperty: function(prop, value) {
          this.properties[prop] = value;
          console.log(`    CSS Property: ${prop} = ${value}`);
        },
        getPropertyValue: function(prop) {
          return this.properties[prop] || '';
        },
        left: '',
        top: '',
        width: '',
        height: '',
        position: ''
      },
      classList: {
        contains: function(className) {
          return ['cs-save', 'cs-abs'].includes(className);
        },
        add: function(className) {
          console.log(`    Added class: ${className}`);
        }
      }
    }
  };
  
  const newData = {
    name: 'save-death',
    cssClass: 'cs-save',
    left: 100,
    top: 150,
    width: 80,
    height: 40
  };
  
  console.log(`Simulating position update for: ${newData.cssClass}`);
  console.log(`New data:`, newData);
  
  // Simulate the CSS custom properties setting (should work for all)
  console.log(`  Setting CSS custom properties...`);
  if (newData.left !== undefined) {
    mockElement[0].style.setProperty('--left', `${newData.left}px`);
  }
  if (newData.top !== undefined) {
    mockElement[0].style.setProperty('--top', `${newData.top}px`);
  }
  if (newData.width !== undefined) {
    mockElement[0].style.setProperty('--width', `${newData.width}px`);
  }
  if (newData.height !== undefined) {
    mockElement[0].style.setProperty('--height', `${newData.height}px`);
  }
  
  // Simulate the direct styles for cs-ability/cs-save (legacy fallback)
  if (newData.cssClass === 'cs-ability' || newData.cssClass === 'cs-save') {
    console.log(`  Setting direct styles for ${newData.cssClass}...`);
    if (newData.left !== undefined) {
      mockElement[0].style.left = `${newData.left}px`;
      console.log(`    Direct style: left = ${newData.left}px`);
    }
    if (newData.top !== undefined) {
      mockElement[0].style.top = `${newData.top}px`;
      console.log(`    Direct style: top = ${newData.top}px`);
    }
    if (newData.width !== undefined) {
      mockElement[0].style.width = `${newData.width}px`;
      console.log(`    Direct style: width = ${newData.width}px`);
    }
    if (newData.height !== undefined) {
      mockElement[0].style.height = `${newData.height}px`;
      console.log(`    Direct style: height = ${newData.height}px`);
    }
  }
  
  console.log('\nFinal styles applied:');
  console.log('  CSS Properties:', mockElement[0].style.properties);
  console.log('  Direct Styles:', {
    left: mockElement[0].style.left,
    top: mockElement[0].style.top,
    width: mockElement[0].style.width,
    height: mockElement[0].style.height
  });
}

// Test potential CSS specificity issues
function testCSSSpecificity() {
  console.log("\n--- Testing CSS Specificity Issues ---");
  
  console.log("Checking for potential CSS conflicts...");
  console.log("1. .cs-abs should have: position: absolute !important");
  console.log("2. .cs-ability and .cs-save should inherit from .cs-abs");
  console.log("3. Direct styles should override CSS variables if needed");
  console.log("4. Check if parent containers have positioning that interferes");
  
  console.log("\nPotential issues to check:");
  console.log("❓ Are save elements inside containers that override positioning?");
  console.log("❓ Do ability elements have different parent structure than save elements?");
  console.log("❓ Are there competing CSS rules for .cs-save vs .cs-ability?");
}

// Run all tests
testClassDetection();
testUpdateLogic();
testCSSSpecificity();

console.log("\n=== Next Steps ===");
console.log("1. Check if save elements are being selected correctly");
console.log("2. Verify CSS specificity doesn't interfere with saves");
console.log("3. Test if the issue is with up/down/size controls vs left/right");
console.log("4. Check browser console for any JavaScript errors during positioning");