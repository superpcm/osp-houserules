# Quick Start: Bulk Item Import

## TL;DR - Fastest Method

1. **Start Foundry** with your osp-houserules system
2. **Press F12** to open browser console
3. **Copy/paste** the entire contents of `scripts/simple-import.js`
4. **Press Enter**
5. **Select** dataset (weapons/armor/equipment) and target pack
6. **Done!** Items are now in your compendium

---

## What's Been Set Up

I've created everything you need for bulk item importing:

### 📁 Data Files (JSON)
- `data/weapons.json` - Sample weapons (Battle Axe, Short Sword, Longbow, Dagger)
- `data/armor.json` - Sample armor (Leather, Chain Mail, Plate Mail, Shield)
- `data/equipment.json` - Sample equipment (Backpack, Rope, Torch, Rations, etc.)

### 🔧 Import Scripts
- `scripts/simple-import.js` - **USE THIS ONE** - Copy/paste into console, pick options, done
- `scripts/import-items.js` - Alternative with manual JSON pasting
- `docs/bulk-item-import.md` - Full documentation with all methods

### 📦 Compendium Packs (Pre-configured)
Your `system.json` now includes three compendium packs:
- **Weapons** (`packs/weapons`)
- **Armor** (`packs/armor`)
- **Equipment** (`packs/equipment`)

---

## Step-by-Step Instructions

### Method 1: Browser Console (Easiest - 2 minutes)

1. **Launch Foundry VTT**
   - Open your world using the osp-houserules system

2. **Open Browser Console**
   - Press `F12` (or `Ctrl+Shift+I` on Linux/Windows)
   - Click the "Console" tab

3. **Run Import Script**
   - Open `scripts/simple-import.js` in an editor
   - Copy the **entire file**
   - Paste into the console
   - Press `Enter`

4. **Select Import Options**
   - A dialog will appear
   - Choose dataset: weapons, armor, or equipment
   - Choose target compendium pack
   - Click OK

5. **Verify**
   - Open the Compendium tab (right sidebar)
   - Find your pack (e.g., "Weapons")
   - Your items should be there!

### Method 2: Foundry Macro (Reusable)

1. **Create Macro**
   - Click the **Macro Directory** icon (bottom of screen)
   - Click **Create Macro**
   - Name: "Import Items"
   - Type: **Script**
   
2. **Paste Script**
   - Copy content from `scripts/simple-import.js`
   - Paste into the macro editor
   - Save

3. **Run Macro**
   - Click the macro from your hotbar
   - Follow the dialog prompts

---

## Customizing Your Items

### Adding More Items

Edit the JSON files in the `data/` folder. Each item needs:

```json
{
  "name": "Item Name",
  "type": "weapon",  // or "armor", "item", "container"
  "img": "icons/path/to/icon.webp",
  "system": {
    // Fields from your template.json
  }
}
```

### Weapon Example
```json
{
  "name": "Longsword",
  "type": "weapon",
  "img": "icons/weapons/swords/sword-long-steel.webp",
  "system": {
    "description": "A versatile blade.",
    "cost": 10,
    "weight": 40,
    "quantity": 1,
    "equipped": false,
    "damage": "1d8",
    "bonus": 0,
    "tags": ["melee", "versatile"],
    "melee": true,
    "missile": false,
    "slow": false,
    "range": { "short": 0, "medium": 0, "long": 0 }
  }
}
```

### Finding Icons

Foundry includes thousands of icons:
- Weapons: `icons/weapons/`
- Armor: `icons/equipment/`
- Tools: `icons/tools/`
- Containers: `icons/containers/`
- Consumables: `icons/consumables/`

Browse them at: https://foundryvtt.com/api/icons

### Weight/Cost Guidelines

Standard OSR/B/X values:
- Coins: 10 coins = 1 lb
- Light weapons: 10-30 coins weight
- Heavy weapons: 50-80 coins weight
- Light armor: 200 coins weight
- Heavy armor: 400-500 coins weight

---

## Troubleshooting

### "No Item compendiums found"
**Solution**: The packs will be created automatically when you reload Foundry after updating `system.json`

### "Pack not found"
**Solution**: 
1. Check that you've reloaded Foundry after updating `system.json`
2. The pack folders in `packs/` will be created automatically by Foundry

### "Invalid JSON"
**Solution**: 
- Validate at [jsonlint.com](https://jsonlint.com)
- Check for missing commas between items
- Make sure all brackets `{}` and `[]` are closed

### Items not appearing
**Solution**:
1. Check browser console (F12) for error messages
2. Make sure item types match your `template.json` types
3. Verify all required fields are present

---

## Next Steps

1. **Add more items** to the JSON files
2. **Import them** using the simple-import.js script
3. **Drag items** from compendiums to character sheets
4. **Share your compendiums** by including the `packs/` folder in your system

---

## Advanced: Creating Items from Spreadsheet

If you have items in a spreadsheet:

1. Export to CSV
2. Use a CSV-to-JSON converter
3. Format according to your template.json structure
4. Import using the script

---

## Need More Help?

See `docs/bulk-item-import.md` for:
- Alternative import methods
- Full documentation
- Advanced techniques
- Module recommendations
