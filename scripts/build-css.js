// build-css.js - compile SCSS to dist/ose.css using Dart Sass modern API
import { compile } from 'sass';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const input = resolve(process.cwd(), 'src/styles/ose.scss');
const out = resolve(process.cwd(), 'dist/ose.css');
console.log('Compiling:', input);
const result = compile(input, { 
  loadPaths: [resolve(process.cwd(), 'src/styles')],
  silenceDeprecations: ['import'] // Suppress @import deprecation warnings
});
console.log('CSS output length:', result.css.length, 'bytes');
console.log('Searching for test class...');
const hasTest = result.css.includes('test-character-sheet-import');
console.log('Contains test class:', hasTest);
writeFileSync(out, result.css);
console.log('Written to:', out);

