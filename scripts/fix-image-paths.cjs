const fs = require('fs');
const path = require('path');

// Get all actual image files
const imageDirs = ['weapons', 'gear', 'armor', 'tack', 'livestock', 'treasure'];
const actualFiles = new Map();

imageDirs.forEach(dir => {
  const dirPath = `assets/images/${dir}`;
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      actualFiles.set(`assets/images/${dir}/${file}`, true);
    });
  }
});

function fixImagePath(imgPath) {
  if (!imgPath) return imgPath;
  
  let fixedPath = imgPath;
  
  // Add system prefix if it starts with assets/
  if (fixedPath.startsWith('assets/')) {
    fixedPath = 'systems/osp-houserules/' + fixedPath;
  }
  
  // If it already has the prefix, don't change it
  if (fixedPath !== imgPath) {
    return fixedPath;
  }
  
  // For icons/ paths, add system prefix too
  if (fixedPath.startsWith('icons/')) {
    return 'systems/osp-houserules/' + fixedPath;
  }
  
  return imgPath;
}

// Fix all JSON files
const jsonFiles = [
  'data/weapons.json',
  'data/equipment.json',
  'data/armor.json',
  'data/ammunition.json',
  'data/livestock.json',
  'data/tack.json',
  'data/treasure.json'
];

let totalFixed = 0;

jsonFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    console.log(`Skipping ${file} (not found)`);
    return;
  }
  
  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  let fixedInFile = 0;
  
  items.forEach(item => {
    if (item.img) {
      const originalPath = item.img;
      const fixedPath = fixImagePath(item.img);
      if (originalPath !== fixedPath) {
        item.img = fixedPath;
        fixedInFile++;
        console.log(`${item.name}: ${originalPath} -> ${fixedPath}`);
      }
    }
  });
  
  if (fixedInFile > 0) {
    fs.writeFileSync(file, JSON.stringify(items, null, 2));
    console.log(`\n✓ Fixed ${fixedInFile} paths in ${file}\n`);
    totalFixed += fixedInFile;
  } else {
    console.log(`✓ No fixes needed in ${file}`);
  }
});

console.log(`\n========================================`);
console.log(`Total paths fixed: ${totalFixed}`);
console.log(`========================================`);
