# Update Item Images in Foundry

## What was fixed
Fixed 93 broken image paths in the JSON files:
- Changed `assets/items/` to `assets/images/` (the correct directory)
- Fixed hyphenation issues: `longsword.webp` → `long-sword.webp`, `shortsword.webp` → `short-sword.webp`

## To update existing items in Foundry

**Option 1: Re-import all items (Recommended)**
Run this in the Foundry console to update all existing items:
```javascript
await addItemsToFoundry(true);
```

**Option 2: Manual update of specific items**
If you only want to update a few items, open the Foundry console and run:
```javascript
// Update a specific item by name
const itemName = "Long Sword";
const item = game.items.getName(itemName);
if (item) {
  const newPath = item.img.replace('assets/items/', 'assets/images/').replace('longsword', 'long-sword').replace('shortsword', 'short-sword');
  await item.update({img: newPath});
  console.log(`Updated ${itemName}: ${item.img} → ${newPath}`);
}
```

## Verification
After updating, you can verify images load correctly by:
1. Opening Items directory in Foundry
2. Items should now display their images properly
3. Torch, Iron Spike, and Short bow were already working and remain unchanged
4. All weapons, armor, equipment, livestock, and tack items should now show images

## Note
12 items still have broken paths because the image files don't exist:
- Barrel, Bolt Case, Chest (Large/Small), Mallet (Wooden), Quiver, Quiver (Hip), Scroll Case, Vial or Bottle, Bronze plate, Great helm, Helmet

These will need proper image files added to the assets directory.
