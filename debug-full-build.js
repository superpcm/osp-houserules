// Debug build script to compare with original
import { compile } from 'sass';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

console.log('=== Debug CSS Build ===');

const input = resolve(process.cwd(), 'src/styles/ose.scss');
const out = resolve(process.cwd(), 'dist/ose.css');

console.log('Input file:', input);
console.log('Output file:', out);

try {
  console.log('Compiling...');
  const result = compile(input, { 
    loadPaths: [resolve(process.cwd(), 'src/styles')],
    style: 'expanded'
  });
  
  console.log('Compilation successful!');
  console.log('CSS length:', result.css.length);
  
  // Search for our content
  const hasRacialTargets = result.css.includes('racial-skill-targets');
  const hasSkillLayout = result.css.includes('skill-layout-dwarf');
  const hasCharacterSheet = result.css.includes('tab[data-tab="combat"]');
  
  console.log('Contains racial-skill-targets:', hasRacialTargets);
  console.log('Contains skill-layout-dwarf:', hasSkillLayout);
  console.log('Contains combat tab:', hasCharacterSheet);
  
  if (hasRacialTargets) {
    console.log('\n=== Found racial skill targets in CSS ===');
    const lines = result.css.split('\n');
    lines.forEach((line, index) => {
      if (line.includes('racial-skill-targets')) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
      }
    });
  }
  
  console.log('\nWriting to dist...');
  writeFileSync(out, result.css);
  console.log('Written successfully!');
  
} catch (error) {
  console.error('Error:', error);
}