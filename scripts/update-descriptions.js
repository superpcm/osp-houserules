/**
 * Update item descriptions from reference project
 * Replaces all local descriptions with reference descriptions
 * 
 * Usage: node scripts/update-descriptions.js
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REFERENCE_BASE_URL = 'https://raw.githubusercontent.com/superpcm/npc-card-generator/main/assets/json';
const DATA_DIR = path.join(__dirname, '../data');

const FILE_MAPPINGS = {
  'ammunition.json': 'ammunition.json',
  'armor.json': 'armor.json',
  'gear.json': 'gear.json',
  'livestock.json': 'livestock.json',
  'tack.json': 'tack.json',
  'treasure.json': 'treasure.json',
  'weapons.json': 'weapons.json'
};

const report = {
  updated: {},
  noMatch: {},
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
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, (redirectRes) => {
          const chunks = [];
          redirectRes.on('data', (chunk) => chunks.push(chunk));
          redirectRes.on('end', () => {
            try {
              const data = Buffer.concat(chunks).toString('utf8');
              resolve(JSON.parse(data));
            } catch (err) {
              reject(new Error(`Failed to parse ${filename}: ${err.message}`));
            }
          });
        }).on('error', reject);
        return;
      }
      
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const data = Buffer.concat(chunks).toString('utf8');
          resolve(JSON.parse(data));
        } catch (err) {
          // Save problematic data for debugging
          fs.writeFileSync(`/tmp/debug-${filename}`, data);
          reject(new Error(`Failed to parse ${filename}: ${err.message} (saved to /tmp/debug-${filename})`));
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
 * Update descriptions in local data
 */
function updateDescriptions(referenceData, localData, filename) {
  const refByName = new Map();
  referenceData.forEach(item => {
    refByName.set(item.name.toLowerCase(), item);
  });
  
  const updated = [];
  const noMatch = [];
  
  localData.forEach(localItem => {
    const refItem = refByName.get(localItem.name.toLowerCase());
    if (refItem && refItem.description) {
      // Update description
      if (!localItem.system) {
        localItem.system = {};
      }
      localItem.system.description = refItem.description;
      updated.push(localItem.name);
    } else if (!refItem) {
      noMatch.push(localItem.name);
    }
  });
  
  // Store in report
  if (updated.length > 0) {
    report.updated[filename] = updated;
  }
  if (noMatch.length > 0) {
    report.noMatch[filename] = noMatch;
  }
  
  return localData;
}

/**
 * Main process
 */
async function main() {
  console.log('Updating descriptions from reference project...\n');
  
  try {
    for (const [refFile, localFile] of Object.entries(FILE_MAPPINGS)) {
      console.log(`Processing ${localFile}...`);
      
      try {
        const referenceData = await fetchReferenceData(refFile);
        const localData = loadLocalData(localFile);
        
        console.log(`  Reference items: ${referenceData.length}`);
        console.log(`  Local items: ${localData.length}`);
        
        const updated = updateDescriptions(referenceData, localData, localFile);
        
        // Backup original
        const backupPath = path.join(DATA_DIR, `${localFile}.desc-backup`);
        const originalPath = path.join(DATA_DIR, localFile);
        fs.writeFileSync(backupPath, fs.readFileSync(originalPath));
        
        // Write updated
        fs.writeFileSync(
          originalPath,
          JSON.stringify(updated, null, 2)
        );
        
        console.log(`  ✓ Updated descriptions\n`);
      } catch (err) {
        report.errors.push(`${localFile}: ${err.message}`);
        console.error(`  ✗ Error: ${err.message}\n`);
      }
    }
    
    // Print report
    console.log('\n' + '='.repeat(60));
    console.log('DESCRIPTION UPDATE REPORT');
    console.log('='.repeat(60) + '\n');
    
    if (Object.keys(report.updated).length > 0) {
      console.log('DESCRIPTIONS UPDATED:');
      for (const [file, items] of Object.entries(report.updated)) {
        console.log(`\n${file} (${items.length} items):`);
        items.forEach(name => console.log(`  ✓ ${name}`));
      }
      console.log('');
    }
    
    if (Object.keys(report.noMatch).length > 0) {
      console.log('\nNO REFERENCE MATCH (descriptions unchanged):');
      for (const [file, items] of Object.entries(report.noMatch)) {
        console.log(`\n${file} (${items.length} items):`);
        items.forEach(name => console.log(`  - ${name}`));
      }
      console.log('');
    }
    
    if (report.errors.length > 0) {
      console.log('\nERRORS:');
      report.errors.forEach(err => console.log(`  ✗ ${err}`));
      console.log('');
    }
    
    console.log('='.repeat(60));
    console.log('\n✓ Description update complete!');
    console.log('✓ Original files backed up with .desc-backup extension\n');
    
  } catch (err) {
    console.error('\n✗ Fatal error:', err.message);
    process.exit(1);
  }
}

// Run
main();
