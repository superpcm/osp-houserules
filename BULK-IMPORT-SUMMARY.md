# Bulk Item Creation - Summary

## What I've Set Up For You

### ✅ Complete Solution Ready to Use

I've created a complete bulk item import system for your Foundry VTT system. Everything is ready to go!

---

## 📁 Files Created

### JSON Data Files
1. **`data/weapons.json`** - 4 sample weapons (quick test)
2. **`data/weapons-complete.json`** - 20 complete weapons + ammunition (full OSR arsenal)
3. **`data/armor.json`** - 4 armor types (Leather, Chain, Plate, Shield)
4. **`data/equipment.json`** - 8 common adventuring items

### Import Scripts
1. **`scripts/simple-import.js`** ⭐ **USE THIS ONE** - Single script, copy/paste into console
2. **`scripts/import-items.js`** - Alternative with dialog-based JSON input

### Documentation
1. **`ITEM-IMPORT-README.md`** ⭐ **START HERE** - Quick start guide
2. **`docs/bulk-item-import.md`** - Comprehensive documentation

### System Configuration
- **`system.json`** - Updated to include 3 compendium packs (weapons, armor, equipment)

---

## 🚀 Quick Start (2 Minutes)

### Option 1: Console Method (Fastest)

```
1. Open Foundry VTT with your world
2. Press F12 → Console tab
3. Copy entire contents of scripts/simple-import.js
4. Paste and press Enter
5. Select dataset and target pack
6. Done!
```

### Option 2: Edit Script and Run

1. Open `scripts/simple-import.js`
2. Replace the `WEAPONS`, `ARMOR`, `EQUIPMENT` arrays with your own items
3. Copy and run in console

---

## 📊 Items Included

### Weapons (weapons-complete.json)
- **Swords**: Battle Axe, Sword, Short Sword, Two-Handed Sword
- **Axes**: Hand Axe, Battle Axe
- **Bows**: Longbow, Short Bow, Crossbow
- **Polearms**: Spear, Pole Arm
- **Blunt**: Mace, War Hammer, Club, Quarterstaff
- **Throwing**: Dagger, Hand Axe, Spear
- **Ranged**: Sling
- **Ammunition**: Arrows (20), Crossbow Bolts (30), Silver Arrow, Sling Stones (20)

### Armor
- Leather Armor (AC 7 / AAC 12)
- Chain Mail (AC 5 / AAC 14)
- Plate Mail (AC 3 / AAC 16)
- Shield (AC -1 / AAC +1)

### Equipment
- Backpack (container, 400 coin capacity)
- Rope, 50'
- Torch
- Iron Rations (1 week)
- Waterskin
- Crowbar
- Lantern
- Oil Flask

---

## 🔧 Customization

### Adding Your Own Items

Edit the JSON files or the arrays in `simple-import.js`:

```json
{
  "name": "Magic Sword +1",
  "type": "weapon",
  "img": "icons/weapons/swords/sword-guard-glowing.webp",
  "system": {
    "description": "A sword with a +1 magical bonus",
    "cost": 1000,
    "weight": 60,
    "damage": "1d8",
    "bonus": 1,
    "melee": true,
    "missile": false
  }
}
```

### Finding Icons

Foundry includes thousands of icons:
- Browse in Foundry: Create item → Click image → Browse
- Icons are in `icons/` folder
- Common paths:
  - `icons/weapons/`
  - `icons/equipment/`
  - `icons/tools/`
  - `icons/containers/`

---

## 📖 How It Works

### System Structure

Your `template.json` defines 4 item types:
1. **weapon** - Melee and ranged weapons
2. **armor** - Armor and shields
3. **item** - General items and consumables
4. **container** - Bags, backpacks, etc.

### Compendium Packs

Foundry stores items in **Compendium Packs** (LevelDB databases):
- `packs/weapons/` - Weapon compendium
- `packs/armor/` - Armor compendium
- `packs/equipment/` - Equipment compendium

These are automatically created when you reload Foundry.

### Import Process

1. Script reads item data (JSON arrays)
2. Creates a dialog for user selection
3. Uses Foundry API: `Item.create(data, { pack: "pack-name" })`
4. Items appear in compendium

---

## 🎯 Next Steps

### 1. Test the Import (Now)
```
- Run scripts/simple-import.js
- Import weapons.json
- Check the Weapons compendium
- Drag an item to a character sheet
```

### 2. Customize Your Items
```
- Edit data/weapons-complete.json
- Add your specific house rule items
- Adjust costs, weights, damage
```

### 3. Build Full Equipment Library
```
- Add more armor types
- Add magic items
- Add spell components
- Add treasure
```

### 4. Share Your Compendiums
```
- The packs/ folder can be shared
- Include in your system repository
- Players can drag items from compendiums
```

---

## 💡 Pro Tips

1. **Start Small**: Import 2-3 items first to test
2. **Use Spreadsheets**: Build items in Google Sheets → Export to CSV → Convert to JSON
3. **Validate JSON**: Use jsonlint.com before importing
4. **Backup**: Always backup your world before bulk imports
5. **Icons Matter**: Good icons make items easier to identify
6. **Tags**: Use the `tags` array for filtering and searching
7. **Templates**: Create item templates for magic weapons (+1, +2, etc.)

---

## ❓ Common Questions

**Q: Can I import 100+ items at once?**
A: Yes! Just add them all to the JSON array.

**Q: What if I make a mistake?**
A: Delete items from the compendium and re-import. No harm done.

**Q: Can I export items later?**
A: Yes, you can export from compendiums to JSON for backup.

**Q: Do I need to know JavaScript?**
A: No! Just edit the JSON files and run the script.

**Q: Can I use this for spells/monsters/etc?**
A: Yes! Same process works for any Foundry document type.

---

## 🐛 Troubleshooting

**Problem**: "No Item compendiums found"
- **Solution**: Reload Foundry after updating system.json

**Problem**: Items not appearing after import
- **Solution**: Check browser console (F12) for errors

**Problem**: "Invalid JSON" error
- **Solution**: Validate JSON at jsonlint.com, check for missing commas

**Problem**: Wrong item fields/structure
- **Solution**: Check template.json for the correct field names

---

## 📚 Additional Resources

- **Foundry API Docs**: https://foundryvtt.com/api/
- **JSON Validator**: https://jsonlint.com/
- **Icon Browser**: Browse icons in Foundry's file picker
- **CSV to JSON**: https://csvjson.com/csv2json

---

## ✨ Summary

You now have:
- ✅ 3 compendium packs configured
- ✅ Sample items ready to import (32 items total)
- ✅ Simple one-click import script
- ✅ Complete documentation
- ✅ Customizable JSON structure

**Ready to go!** Open Foundry, run the script, and start importing! 🎉
