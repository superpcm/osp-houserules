# Drop/Pickup System Documentation

## Overview
This system allows players to drop items from their inventory onto the scene and pick them back up without requiring any external modules like Item Piles.

## Architecture

### Drop System
- **Location**: `src/module/actor/sheets/handlers/item-handler.js`
- **Method**: `onItemDrop(event)`
- **How it works**:
  1. Player clicks the drop icon on any item in their inventory
  2. If quantity > 1, shows dialog to select how many to drop
  3. Calculates drop position: 1 grid square in front of controlled token
  4. Creates an **unlinked token** (no actor) on the scene
  5. Stores complete item data in token flags: `flags['osp-houserules'].itemData`
  6. Removes or reduces item quantity from actor inventory

### Pickup System
- **Location**: `src/ose.js`
- **Hook**: `Hooks.on("controlToken", ...)`
- **How it works**:
  1. Player selects (clicks) a dropped item token
  2. System detects `flags['osp-houserules'].droppedItem` flag
  3. Shows confirmation dialog
  4. Adds item to controlled character's inventory (stacks if duplicate)
  5. Deletes token from scene

## Key Features

### No External Dependencies
- **Zero module dependencies**: No Item Piles or other modules required
- **Self-contained**: All code is in the system itself
- **Maintainable**: ~150 lines of code total

### Clean Implementation
- **No actor documents**: Dropped items are pure tokens with data in flags
- **No sidebar pollution**: Tokens don't create "Player" entries in sidebar
- **Proper stacking**: Identical items merge quantities automatically

### Position Calculation
- Uses token rotation to drop items in front of player
- Rotation angles:
  - 0° = right
  - 90° = down
  - 180° = left
  - 270° = up
- Distance: 1 grid square

## Token Structure

### Dropped Item Token
```javascript
{
  name: "Rope (50')",
  x: <calculated>,
  y: <calculated>,
  texture: {
    src: "path/to/item/image.webp"
  },
  width: 1,
  height: 1,
  lockRotation: true,
  flags: {
    'osp-houserules': {
      droppedItem: true,           // Identifies this as a dropped item
      itemData: {                  // Complete item data
        name: "Rope (50')",
        type: "item",
        img: "path/to/item/image.webp",
        system: {
          quantity: 1,
          cost: "1gp",
          weight: 0.6,
          tags: ["gear", "rope"],
          // ... all other item properties
        }
      },
      originalActorId: "actor-uuid"  // Optional: track who dropped it
    }
  }
}
```

## User Experience

### Dropping Items
1. Open character sheet
2. Click drop icon next to any item
3. If stacked, choose quantity or "Drop All"
4. Item appears on scene in front of token

### Picking Up Items
1. Select your character token
2. Click on a dropped item token
3. Confirm pickup in dialog
4. Item added to inventory
5. Token removed from scene

## Technical Benefits

### Compared to Item Piles
| Feature | Item Piles | Homegrown |
|---------|-----------|-----------|
| Module dependency | Yes | No |
| Creates actors | Yes (sidebar pollution) | No |
| Code complexity | High | Low (~150 lines) |
| Control over behavior | Limited | Complete |
| Maintenance risk | External updates | Internal only |

### Token Flags Approach
- **flags['osp-houserules']**: Namespaced to avoid conflicts
- **droppedItem**: Boolean flag for quick identification
- **itemData**: Complete item object for restoration
- **originalActorId**: Optional tracking (not currently used but available)

## Future Enhancements (Optional)

### Possible Additions
1. **Bulk Pickup**: Pick up multiple items at once
2. **Item Stacks**: Multiple different items in one token
3. **Permissions**: Restrict pickup to original owner
4. **Animation**: Token creation/deletion effects
5. **Sound Effects**: Drop/pickup audio feedback
6. **Drag to Pick Up**: Alternative to click-to-select
7. **Container Tokens**: Drop entire containers with contents

### Implementation Notes
All enhancements can be added to the existing system without breaking changes. The token flags structure is extensible.

## Debugging

### Check if Token is Dropped Item
```javascript
const token = canvas.tokens.controlled[0];
const isDroppedItem = token.document.flags?.['osp-houserules']?.droppedItem;
console.log("Is dropped item:", isDroppedItem);
```

### Get Item Data from Token
```javascript
const token = canvas.tokens.controlled[0];
const itemData = token.document.flags?.['osp-houserules']?.itemData;
console.log("Item data:", itemData);
```

### List All Dropped Items on Scene
```javascript
const droppedItems = canvas.tokens.placeables.filter(t => 
  t.document.flags?.['osp-houserules']?.droppedItem
);
console.log("Dropped items:", droppedItems.map(t => t.name));
```

## Migration Notes

### Removed from System
- Item Piles module integration
- Item Piles API calls
- Actor creation for dropped items
- `game.itempiles.API.createItemPile()`
- `game.itempiles.API.turnTokensIntoItemPiles()`
- `game.itempiles.API.addItems()`

### Added to System
- Unlinked token creation
- Token flag-based item storage
- controlToken hook for pickup
- Confirmation dialogs

### Breaking Changes
None - drop buttons and functionality work exactly the same from user perspective.

### Backward Compatibility
Any items dropped with the old Item Piles system will remain as Item Piles tokens. They won't be automatically converted but can be picked up normally through Item Piles if the module is still active, or manually cleaned up.
