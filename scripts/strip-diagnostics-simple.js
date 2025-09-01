#!/usr/bin/env node

/**
 * Simple diagnostic stripper for production builds
 * Removes console.* and debugger statements from built files
 */

const fs = require('fs');
const { glob } = require('glob');

async function stripDiagnostics() {
  const patterns = ['dist/**/*.js'];
  let totalRemoved = 0;
  let filesProcessed = 0;

  try {
    const files = await glob(patterns, { ignore: ['**/node_modules/**'] });
    
    for (const file of files) {
      let content = fs.readFileSync(file, 'utf8');
      const original = content;

      // Remove console statements (handles single and multi-line)
      content = content.replace(/console\.(log|warn|error|debug|trace|info)\s*\([^;]*?\);?/gs, '');
      
      // Remove debugger statements
      content = content.replace(/\bdebugger\s*;?/g, '');
      
      // Clean up extra whitespace and empty lines
      content = content.replace(/^\s*$/gm, '').replace(/\n{3,}/g, '\n\n');

      if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        const removed = (original.match(/(console\.|debugger)/g) || []).length;
        totalRemoved += removed;
        filesProcessed++;
      }
    }

    if (filesProcessed > 0) {
      console.log(`✓ Stripped ${totalRemoved} diagnostic statements from ${filesProcessed} files`);
    } else {
      console.log('✓ No diagnostic statements found in build output');
    }

  } catch (error) {
    console.error('Error stripping diagnostics:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  stripDiagnostics();
}

module.exports = { stripDiagnostics };
