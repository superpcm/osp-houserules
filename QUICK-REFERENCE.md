# Bulk Item Import - Quick Reference Card

## ⚡ 30-Second Guide

```bash
1. Open Foundry → Your World
2. Press F12 → Console tab
3. Copy/paste: scripts/simple-import.js
4. Select dataset → Select pack → OK
5. Done! ✓
```

---

## 📂 Files You Need

| File | Purpose | Items |
|------|---------|-------|
| `data/weapons.json` | Testing | 4 weapons |
| `data/weapons-complete.json` | **Production** | 20 weapons + ammo |
| `data/armor.json` | Armor & shields | 4 armor types |
| `data/equipment.json` | Adventuring gear | 8 common items |

---

## 🎯 Import Script Locations

| Script | When to Use |
|--------|-------------|
| `scripts/simple-import.js` | ⭐ **USE THIS** - Copy/paste into console |
| `scripts/import-items.js` | Alternative with manual JSON input |

---

## 📋 Item Structure Cheat Sheet

### Weapon
```json
{
  "name": "Name",
  "type": "weapon",
  "img": "icons/weapons/.../icon.webp",
  "system": {
    "description": "...",
    "cost": 10,
    "weight": 50,
    "damage": "1d8",
    "bonus": 0,
    "melee": true,
    "missile": false,
    "slow": false,
    "range": { "short": 0, "medium": 0, "long": 0 }
  }
}
```

### Armor
```json
{
  "name": "Name",
  "type": "armor",
  "img": "icons/equipment/.../icon.webp",
  "system": {
    "description": "...",
    "cost": 50,
    "weight": 400,
    "ac": { "value": 5 },
    "aac": { "value": 14 },
    "type": "medium"
  }
}
```

### Item
```json
{
  "name": "Name",
  "type": "item",
  "img": "icons/sundries/.../icon.webp",
  "system": {
    "description": "...",
    "cost": 1,
    "weight": 10,
    "treasure": false
  }
}
```

---

## 🎲 Common Values

### Damage Dice
- 1d3 - Improvised/tiny
- 1d4 - Dagger, club
- 1d6 - Most weapons
- 1d8 - Larger weapons
- 1d10 - Two-handed

### Armor Class (Descending)
- AC 9 - Unarmored
- AC 7 - Leather
- AC 5 - Chain
- AC 3 - Plate

### Armor Class (Ascending)
- AAC 10 - Unarmored
- AAC 12 - Leather
- AAC 14 - Chain
- AAC 16 - Plate

### Weight (10 coins = 1 lb)
- Light weapon: 10-30
- Heavy weapon: 50-150
- Light armor: 200
- Heavy armor: 400-500
- Torch: 1
- Rope: 20

---

## 🔍 Icon Locations

| Type | Path |
|------|------|
| Weapons | `icons/weapons/` |
| Armor | `icons/equipment/` |
| Items | `icons/sundries/` |
| Containers | `icons/containers/` |
| Tools | `icons/tools/` |
| Consumables | `icons/consumables/` |

---

## ⚠️ Common Mistakes

| Mistake | Fix |
|---------|-----|
| Missing comma | Check JSON validator |
| Pack not found | Reload Foundry after system.json update |
| Wrong item type | Must be: weapon, armor, item, container |
| Image not found | Use relative path from Foundry root |
| Fields missing | Check template.json for required fields |

---

## 🚨 Troubleshooting

| Problem | Solution |
|---------|----------|
| "No Item compendiums found" | Create packs in Settings or reload Foundry |
| "Invalid JSON" | Validate at jsonlint.com |
| Items not visible | Check browser console (F12) for errors |
| Wrong data in item | Delete from compendium and re-import |

---

## 📖 Documentation

| Document | Purpose |
|----------|---------|
| `BULK-IMPORT-SUMMARY.md` | Complete overview |
| `ITEM-IMPORT-README.md` | Step-by-step guide |
| `docs/bulk-item-import.md` | Detailed documentation |
| `data/item-templates.js` | Copy/paste templates |

---

## ✅ Verification Checklist

After importing:

- [ ] Open Compendium Packs (right sidebar)
- [ ] See your items in the pack
- [ ] Drag one item to a character sheet
- [ ] Check that stats appear correctly
- [ ] Equipment weight calculates
- [ ] Weapon damage shows

---

## 🎓 Next Steps

1. **Test** - Import weapons.json (4 items)
2. **Verify** - Check they appear in compendium
3. **Customize** - Edit JSON files with your items
4. **Import** - Use weapons-complete.json (20 items)
5. **Build** - Create your full equipment library

---

## 💡 Pro Tips

1. Start with 2-3 items to test
2. Use item-templates.js for reference
3. Keep backups of JSON files
4. Validate JSON before importing
5. Use consistent naming conventions
6. Add good descriptions
7. Test items on character sheets

---

## 🔗 Quick Links

- JSON Validator: https://jsonlint.com
- Foundry Icons: Browse in Foundry file picker
- CSV to JSON: https://csvjson.com/csv2json

---

**Need help?** Check `BULK-IMPORT-SUMMARY.md` for detailed explanations!
