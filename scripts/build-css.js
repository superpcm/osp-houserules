// build-css.js - compile SCSS to dist/ose.css using Dart Sass modern API
import { compile } from 'sass';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const input = resolve(process.cwd(), 'src/styles/ose.scss');
const out = resolve(process.cwd(), 'dist/ose.css');
const result = compile(input, { loadPaths: [resolve(process.cwd(), 'src/styles')] });
writeFileSync(out, result.css);

