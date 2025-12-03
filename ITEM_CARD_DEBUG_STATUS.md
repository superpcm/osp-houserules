# Item Card Rendering - Debug Status

## Current Implementation Status

✅ **Completed**:
- ItemCardRenderer (Canvas API-based, client-side rendering)
- ItemCardDialog (Foundry Application wrapper)
- Click handlers in item-handler.js (eyeball icon + item name)
- Download functionality removed
- Code compiled successfully

## Reported Issues

❌ **Problem 1**: Single clicks not working
- Clicking eyeball icon (.item-show) → No card appears
- Clicking item name (.item-name) → No card appears

❌ **Problem 2**: Visual appearance doesn't match reference
- Double-clicking item opens something but looks wrong
- Card should match reference project exactly

## Debug Changes Made (Just Now)

Added console.log statements to both click handlers:

### onItemShow (eyeball icon):
```javascript
console.log('onItemShow called', event.target);
// ... get item ...
console.log('Item retrieved:', item);
```

### onItemNameClick (item name):
```javascript
console.log('onItemNameClick called', event.target);
// ... check if clicking controls ...
console.log('Clicked on control, ignoring');  // if clicking control
console.log('Processing item name click');    // if valid click
// ... get item ...
console.log('Item retrieved:', item);
```

## Next Testing Steps

### 1. Check Browser Console for Click Handler Execution
Open Foundry VTT and:
1. Open browser developer tools (F12)
2. Go to Console tab
3. Open a character sheet with items
4. Click an item's eyeball icon
5. Click an item's name

**Expected Console Output (if working)**:
```
onItemShow called <a class="item-show">...</a>
Item retrieved: Item {...}
```

OR

```
onItemNameClick called <h4 class="item-name">...</h4>
Processing item name click
Item retrieved: Item {...}
```

**If NO console output**: Event handlers aren't being bound or are being overridden

**If console shows "undefined" for item**: `getItemFromEvent()` isn't finding the item correctly

### 2. Visual Rendering Issues

The reference project uses 300 PPI coordinates, but we're using 72 PPI (web display). Current coordinates:

```javascript
COORDS = {
  item_image: [300, 180],         // Center X, Top Y
  item_name: [300, 450],          // Center X, Y
  item_type: [300, 500],          // Center X, Y
  description: [50, 600],         // Left X, Top Y
  equipment_metadata: [300, 780], // Center X, Y
  weapon_metadata_offset: 10      // Offset below name
};
```

**Potential Issues**:
- These coordinates may not match the actual reference (need field_coordinates_item.json from reference)
- Font sizes scaled from 300 PPI but may need adjustment
- Missing icon images (weapon.webp, dot.webp, coin-icon.webp, weight-icon.webp, capacity-icon.webp, lash.webp, shield.webp)
- Template background is programmatic (no item-card.webp yet)

### 3. Double-Click Behavior

The user reports double-clicking shows "something" but wrong appearance. This is likely:
- Foundry's default item sheet editor (not our card)
- To override, would need to prevent default item sheet behavior
- Our single-click handlers SHOULD work for showing the card

## Debugging Checklist

- [ ] Verify console logs appear when clicking eyeball
- [ ] Verify console logs appear when clicking item name  
- [ ] Check if item object is correctly retrieved
- [ ] Verify ItemCardDialog.render() is called
- [ ] Check browser Network tab for canvas rendering errors
- [ ] Compare rendered canvas with reference project screenshot
- [ ] Verify coordinate accuracy (measure pixel positions)
- [ ] Check if fonts load correctly
- [ ] Verify Foundry item data structure matches expectations

## Reference Project Comparison Needed

From reference (Python/PIL at 300 PPI):
- Card size: 600x900 pixels (at 72 PPI for web export)
- Font: handwritten.ttf (we use system serif fonts currently)
- Template: item-card.webp (we use programmatic parchment)
- Icons: weapon.webp, dot.webp, coin-icon.webp, etc. (we have programmatic fallbacks)
- Coordinates: field_coordinates_item.json (need exact values)

We need to:
1. Get exact coordinates from field_coordinates_item.json
2. Compare font sizes/positioning
3. Add missing icons or improve programmatic alternatives
4. Match template background

## Code Files Modified

1. `/src/module/actor/sheets/handlers/item-handler.js` - Added debug logs to onItemShow() and onItemNameClick()
2. Previously: `/src/module/cards/item-card-renderer.js` - Canvas rendering logic
3. Previously: `/src/module/cards/item-card-dialog.js` - Dialog wrapper  
4. Previously: `/templates/dialogs/item-card-dialog.html` - Dialog template

## Build Command

```bash
cd /home/superpcm/narlingtondata/Data/systems/osp-houserules
npm run build
```

Code has been rebuilt with debug logging. Ready for testing.
