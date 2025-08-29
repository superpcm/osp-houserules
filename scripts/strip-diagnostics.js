#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const root = process.cwd();
const patterns = ['**/*.js', '**/*.ts', '**/*.html'];
const ignore = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/assets/**'];

let totalRemoved = 0;
const changedFiles = [];

function countMatches(str, re) {
  const m = str.match(new RegExp(re.source, re.flags + 'g'));
  return m ? m.length : 0;
}

patterns.forEach(pattern => {
  const files = glob.sync(pattern, { cwd: root, nodir: true, ignore });
  files.forEach(rel => {
    const abs = path.join(root, rel);
    let content = fs.readFileSync(abs, 'utf8');
    const original = content;

    // Remove console.<method>(...); patterns (single-line)
    // This is a best-effort regex; complex multi-line calls may not be fully removed.
    const consoleRe = /console\.(log|warn|error|debug|trace)\s*\([^;]*\);?/g;
    const Re = /\bdebugger;?/g;

    const beforeConsole = (content.match(consoleRe) || []).length;
    const beforeDebugger = (content.match(Re) || []).length;

    content = content.replace(consoleRe, '');
    content = content.replace(Re, '');

    // Clean up double semicolons and empty statement leftovers
    content = content.replace(/;{2,}/g, ';');
    // Remove lines that are purely whitespace
    content = content.replace(/^[ \t]+$/gm, '');

    const removed = beforeConsole + beforeDebugger;
    if (removed > 0 && content !== original) {
      fs.writeFileSync(abs, content, 'utf8');
      totalRemoved += removed;
      changedFiles.push({ file: rel, removed });

    }
  });
});




if (changedFiles.length) 
changedFiles.forEach(f => 

process.exit(0);
