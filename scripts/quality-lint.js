import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const fullPath = path.join(directory, entry.name);
  if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'release') return [];
  return entry.isDirectory() ? walk(fullPath) : [fullPath];
});

for (const file of walk(root)) {
  const relative = path.relative(root, file);
  // Finder metadata is ignored and stripped by the release packager. Some shared-volume
  // filesystems recreate it immediately, so its local presence is not a lint failure.
  if (!relative.startsWith(`templates${path.sep}`) || !/\.(?:html|hbs)$/.test(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  if (/<script(?:\s|>)/i.test(source)) errors.push(`${relative}: inline scripts are not allowed in templates`);
}

if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exit(1);
}
console.log('Repository quality checks passed.');
