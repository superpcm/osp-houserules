/**
 * Merge reference project data into osp-houserules JSON files
 * Preserves Foundry structure while updating values from reference
 * 
 * Usage: node scripts/merge-reference-data.js
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REFERENCE_BASE_URL = 'https://raw.githubusercontent.com/superpcm/npc-card-generator/main/assets/json';
const DATA_DIR = path.join(__dirname, '../data');

// Files to process (reference filename -> osp-houserules filename)
const FILE_MAPPINGS = {
  'ammunition.json': 'ammunition.json',
  'armor.json': 'armor.json',
  'gear.json': 'gear.json',
  'livestock.json': 'livestock.json',
  'tack.json': 'tack.json',
  'treasure.json': 'treasure.json',
  'weapons.json': 'weapons.json'
};

// Track changes
const report = {
  updated: {},
  added: {},
  orphans: {},
  errors: []
};

/**
 * Fetch JSON from GitHub
 */
async function fetchReferenceData(filename) {
  return new Promise((resolve, reject) => {
    const url = `${REFERENCE_BASE_URL}/${filename}`;
    console.log(`Fetching ${url}...`);
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Failed to parse ${filename}: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Load local JSON file
 */
function loadLocalData(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Convert reference item to Foundry structure
 */
function convertToFoundryStructure(refItem, existingItem = null) {
  const foundryItem = existingItem || {
    name: refItem.name,
    type: refItem.type || 'item',
    img: refItem.img || '',
    system: {
      quantity: { value: 1, max: null },
      equipped: false,
      tags: []
    }
  };
  
  // Update common fields
  foundryItem.name = refItem.name;
  foundryItem.img = refItem.img || foundryItem.img;
  foundryItem.type = refItem.type || foundryItem.type;
  
  // Update system data
  if (refItem.description !== undefined) {
    foundryItem.system.description = refItem.description;
  }
  if (refItem.cost !== undefined) {
    foundryItem.system.cost = refItem.cost;
  }
  if (refItem.weight !== undefined) {
    foundryItem.system.unitWeight = refItem.weight;
  }
  if (refItem.stored_size !== undefined) {
    foundryItem.system.storedSize = refItem.stored_size;
  }
  if (refItem.lashable !== undefined) {
    foundryItem.system.lashable = refItem.lashable;
  }
  
  // Container-specific fields
  if (refItem.capacity !== undefined) {
    foundryItem.system.capacity = refItem.capacity;
  }
  if (refItem.lash_slots !== undefined) {
    foundryItem.system.lashSlots = refItem.lash_slots;
  }
  
  // Weapon-specific fields
  if (refItem.damage !== undefined) {
    foundryItem.system.damage = refItem.damage;
  }
  if (refItem.range !== undefined) {
    foundryItem.system.range = refItem.range;
  }
  if (refItem.slow !== undefined) {
    foundryItem.system.slow = refItem.slow;
  }
  if (refItem.two_handed !== undefined) {
    foundryItem.system.twoHanded = refItem.two_handed;
  }
  
  // Armor-specific fields
  if (refItem.aac !== undefined) {
    foundryItem.system.aac = { value: refItem.aac };
  }
  if (refItem.armor_type !== undefined) {
    foundryItem.system.type = refItem.armor_type;
  }
  
  // Ammunition-specific fields
  if (refItem.quantity !== undefined) {
    foundryItem.system.quantity.value = refItem.quantity;
  }
  
  return foundryItem;
}

/**
 * Merge reference data into local data
 */
function mergeData(referenceData, localData, filename) {
  const localByName = new Map();
  localData.forEach(item => {
    localByName.set(item.name.toLowerCase(), item);
  });
  
  const refByName = new Map();
  referenceData.forEach(item => {
    refByName.set(item.name.toLowerCase(), item);
  });
  
  const merged = [];
  const updated = [];
  const added = [];
  
  // Update existing items and keep orphans
  localData.forEach(localItem => {
    const refItem = refByName.get(localItem.name.toLowerCase());
    if (refItem) {
      // Update from reference
      const updatedItem = convertToFoundryStructure(refItem, localItem);
      merged.push(updatedItem);
      updated.push(localItem.name);
    } else {
      // Keep orphan
      merged.push(localItem);
      if (!report.orphans[filename]) report.orphans[filename] = [];
      report.orphans[filename].push(localItem.name);
    }
  });
  
  // Add new items from reference
  referenceData.forEach(refItem => {
    if (!localByName.has(refItem.name.toLowerCase())) {
      const newItem = convertToFoundryStructure(refItem);
      merged.push(newItem);
      added.push(refItem.name);
    }
  });
  
  // Sort by name
  merged.sort((a, b) => a.name.localeCompare(b.name));
  
  // Store in report
  if (updated.length > 0) {
    report.updated[filename] = updated;
  }
  if (added.length > 0) {
    report.added[filename] = added;
  }
  
  return merged;
}

/**
 * Main merge process
 */
async function main() {
  console.log('Starting data merge from reference project...\n');
  
  try {
    // First, merge containers.json into gear.json locally
    console.log('Step 1: Merging containers.json into gear.json...');
    const containersPath = path.join(DATA_DIR, 'containers.json');
    if (fs.existsSync(containersPath)) {
      const containers = loadLocalData('containers.json');
      let equipment = loadLocalData('equipment.json');
      
      // Add containers to equipment
      containers.forEach(container => {
        if (!equipment.find(e => e.name.toLowerCase() === container.name.toLowerCase())) {
          equipment.push(container);
        }
      });
      
      gear.sort((a, b) => a.name.localeCompare(b.name));
      
      // Save merged gear
      fs.writeFileSync(
        path.join(DATA_DIR, 'gear.json'),
        JSON.stringify(gear, null, 2)
      );
      
      console.log(`  ✓ Merged ${containers.length} containers into gear.json`);
      
      // Backup and remove containers.json
      fs.renameSync(containersPath, path.join(DATA_DIR, 'containers.json.backup'));
      console.log('  ✓ Backed up containers.json to containers.json.backup\n');
    }
    
    // Process each file
    console.log('Step 2: Merging reference data...\n');
    for (const [refFile, localFile] of Object.entries(FILE_MAPPINGS)) {
      console.log(`Processing ${localFile}...`);
      
      try {
        const referenceData = await fetchReferenceData(refFile);
        const localData = loadLocalData(localFile);
        
        console.log(`  Reference items: ${referenceData.length}`);
        console.log(`  Local items: ${localData.length}`);
        
        const merged = mergeData(referenceData, localData, localFile);
        
        // Backup original
        const backupPath = path.join(DATA_DIR, `${localFile}.backup`);
        fs.writeFileSync(backupPath, JSON.stringify(localData, null, 2));
        
        // Write merged
        fs.writeFileSync(
          path.join(DATA_DIR, localFile),
          JSON.stringify(merged, null, 2)
        );
        
        console.log(`  ✓ Merged: ${merged.length} items`);
        console.log('');
      } catch (err) {
        report.errors.push(`${localFile}: ${err.message}`);
        console.error(`  ✗ Error: ${err.message}\n`);
      }
    }
    
    // Print report
    console.log('\n' + '='.repeat(60));
    console.log('MERGE REPORT');
    console.log('='.repeat(60) + '\n');
    
    if (Object.keys(report.updated).length > 0) {
      console.log('UPDATED ITEMS:');
      for (const [file, items] of Object.entries(report.updated)) {
        console.log(`\n${file} (${items.length} items):`);
        items.forEach(name => console.log(`  - ${name}`));
      }
      console.log('');
    }
    
    if (Object.keys(report.added).length > 0) {
      console.log('\nADDED ITEMS:');
      for (const [file, items] of Object.entries(report.added)) {
        console.log(`\n${file} (${items.length} items):`);
        items.forEach(name => console.log(`  + ${name}`));
      }
      console.log('');
    }
    
    if (Object.keys(report.orphans).length > 0) {
      console.log('\nORPHANED ITEMS (in osp-houserules but not in reference):');
      for (const [file, items] of Object.entries(report.orphans)) {
        console.log(`\n${file} (${items.length} items):`);
        items.forEach(name => console.log(`  ? ${name}`));
      }
      console.log('');
    }
    
    if (report.errors.length > 0) {
      console.log('\nERRORS:');
      report.errors.forEach(err => console.log(`  ✗ ${err}`));
      console.log('');
    }
    
    console.log('='.repeat(60));
    console.log('\n✓ Merge complete!');
    console.log('✓ Original files backed up with .backup extension');
    console.log('\nNext steps:');
    console.log('1. Review the changes in data/*.json files');
    console.log('2. Run: node scripts/add-items-to-foundry.js in Foundry console');
    console.log('3. Delete .backup files when satisfied\n');
    
  } catch (err) {
    console.error('\n✗ Fatal error:', err.message);
    process.exit(1);
  }
}

// Run
main();
