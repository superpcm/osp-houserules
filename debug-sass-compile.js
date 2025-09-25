// Test Sass compilation
import { compile } from 'sass';
import { resolve } from 'path';

console.log('Testing Sass compilation...');

const input = resolve(process.cwd(), 'src/styles/ose.scss');
console.log('Input file:', input);

try {
  const result = compile(input, { 
    loadPaths: [resolve(process.cwd(), 'src/styles')],
    style: 'expanded'
  });
  
  console.log('Compilation successful!');
  console.log('CSS length:', result.css.length);
  
  // Check for our racial skill targets
  if (result.css.includes('racial-skill-targets')) {
    console.log('✓ Found racial-skill-targets in compiled CSS');
  } else {
    console.log('✗ racial-skill-targets NOT found in compiled CSS');
  }
  
  // Check for other known rules
  if (result.css.includes('skill-layout-dwarf')) {
    console.log('✓ Found skill-layout-dwarf in compiled CSS');
  } else {
    console.log('✗ skill-layout-dwarf NOT found in compiled CSS');
  }
  
} catch (error) {
  console.error('Compilation error:', error);
}