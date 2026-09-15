# Bulk Item Import Guide

## Overview
This guide explains how to bulk-import weapons, armor, and equipment into your Foundry VTT system.

## Method 1: Using Foundry's Browser Console (Easiest)

### Step 1: Create Compendium Packs
1. Launch Foundry VTT and open your world
2. Click the **Settings** gear icon (right sidebar)
3. Click **Configure Settings** → **Compendium Packs**
4. Click **Create Compendium** for each pack:
   - **Label**: "Weapons", **Type**: Item, **Package**: osp-houserules
   - **Label**: "Armor", **Type**: Item, **Package**: osp-houserules
   - **Label**: "Equipment", **Type**: Item, **Package**: osp-houserules

### Step 2: Import Items
1. Press **F12** to open browser console
2. Copy and paste the content from `scripts/import-items.js`
3. When the dialog appears, paste the JSON from `data/weapons.json`, `data/armor.json`, or `data/equipment.json`
4. Click OK to import

## Method 2: Using a Macro (Recommended)

### Step 1: Create a Macro
1. In Foundry, click the **Macro Directory** icon at the bottom
2. Click **Create Macro**
3. Name it "Import Items"
4. Type: **Script**
5. Paste the content from `scripts/import-items.js`
6. Save and execute

### Step 3: Run the Macro
1. Click the macro from your hotbar or macro directory
2. Follow the dialog prompts

## Method 3: Using fvtt CLI Tool (Advanced)

If you have Node.js installed, you can use the `fvtt` CLI tool:

\`\`\`bash
npm install -g @foundryvtt/foundryvtt-cli
fvtt package workon "osp-houserules"
fvtt package pack "weapons" --in data/weapons.json
\`\`\`

## Method 4: Manual LevelDB Creation (Most Control)

Use the `@foundryvtt/foundryvtt-cli` package to pack items directly into LevelDB format.

## JSON File Structure

Each item follows this structure:

\`\`\`json
{
  "name": "Item Name",
  "type": "weapon|armor|item|container",
  "img": "path/to/icon.webp",
  "system": {
    // ... item-specific fields from template.json
  }
}
\`\`\`

## Customizing Your Items

Edit the JSON files in the `data/` folder:
- `data/weapons.json` - Weapons
- `data/armor.json` - Armor and shields
- `data/equipment.json` - General adventuring gear

### Example Weapon Entry
\`\`\`json
{
  "name": "Longsword",
  "type": "weapon",
  "img": "icons/weapons/swords/sword-long-steel.webp",
  "system": {
    "description": "A versatile blade.",
    "cost": 10,
    "weight": 40,
    "damage": "1d8",
    "bonus": 0,
    "melee": true,
    "missile": false,
    "slow": false
  }
}
\`\`\`

## Icons

Foundry comes with many icons. Common paths:
- Weapons: `icons/weapons/`
- Armor: `icons/equipment/`
- Items: `icons/sundries/`, `icons/tools/`, `icons/containers/`

You can also use your own images in `systems/osp-houserules/assets/`.

## Tips

1. **Start Small**: Import a few items first to test
2. **Backup**: Always backup your world before bulk operations
3. **Use Compendiums**: Keep items in compendiums, then drag to actors as needed
4. **Icons**: Use the built-in Foundry icons or add your own to the assets folder
5. **Validation**: Check your JSON syntax with a JSON validator before importing

## Troubleshooting

**Error: Pack not found**
- Make sure you created the compendium packs first

**Error: Invalid JSON**
- Validate your JSON at jsonlint.com
- Check for missing commas, brackets, or quotes

**Items not showing up**
- Check the browser console (F12) for errors
- Verify the compendium pack name matches exactly
