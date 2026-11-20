// build-css.js - compile SCSS to dist/ose.css using Dart Sass modern API
import { compile } from 'sass';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const input = resolve(process.cwd(), 'src/styles/ose.scss');
const out = resolve(process.cwd(), 'dist/ose.css');
const baseline = resolve(process.cwd(), 'src/styles/pre-store-baseline.css');
console.log('Compiling:', input);
const result = compile(input, { 
  loadPaths: [resolve(process.cwd(), 'src/styles')],
  silenceDeprecations: ['import'] // Suppress @import deprecation warnings
});
const baselineCss = readFileSync(baseline);
const outputCss = Buffer.concat([baselineCss, Buffer.from('\n'), Buffer.from(result.css)]);
console.log('Baseline CSS length:', baselineCss.length, 'bytes');
console.log('CSS output length:', outputCss.length, 'bytes');
console.log('Searching for test class...');
const hasTest = outputCss.toString('utf8').includes('test-character-sheet-import');
console.log('Contains test class:', hasTest);
writeFileSync(out, outputCss);
console.log('Written to:', out);

