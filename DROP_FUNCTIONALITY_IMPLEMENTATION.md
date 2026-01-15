# Drop Functionality Implementation

## Summary
Successfully implemented Item Piles integration to allow dropping items onto the Foundry scene from the character sheet.

## Features Implemented

### 1. **Drop Button UI**
- Added "Drop" button to all item sections in both Combat and Gear tabs:
  - ✅ Combat tab: Weapons, Armor
  - ✅ Gear tab: Weapons, Armor, Clothing, Containers
  - ✅ Nested items: Clothing pockets, Container contents, Lashed items
- Button icon: `assets/images/icons/drop-icon.webp` (16x16px)
- Positioned after the delete button in all control sections

### 2. **Drop Handler Logic** (`item-handler.js`)
The `onItemDrop()` method handles:

#### Validation
- Checks if Item Piles module is installed and active
- Verifies an active scene exists
- Ensures user has a controlled token selected

#### Quantity Handling
- Single items: Drop immediately
- Stacked items (quantity > 1): Show dialog with options:
  - **Drop All**: Drop entire stack
  - **Drop Quantity**: Specify amount to drop (1 to max)
  - **Cancel**: Abort the operation

#### Drop Position Calculation
- Drops item **1 grid square in front** of the controlled token
- Uses token rotation to determine direction:
  - 0° = Right
  - 90° = Down
  - 180° = Left
  - 270° = Up
- Formula: `position = token.position + (rotation_vector * gridSize)`

#### Equipment Handling
- Automatically **unequips** equipped items before dropping
- Re-equips if drop fails (error handling)

#### Item Pile Creation
Uses Item Piles API: `game.itempiles.API.createItemPile()`
- Sets pile image to item's image
- Sets pile name to item's name
- Creates pile at calculated position

#### Inventory Management
- **Full drop** (all quantity): Deletes item from inventory
- **Partial drop**: Reduces item quantity by dropped amount
- Displays notification with result

## Technical Details

### Files Modified

1. **templates/actors/character-sheet.html**
   - Added drop button HTML to 8 item control sections
   - Uses Handlebars data attribute: `data-item-id="{{item.id}}"`

2. **src/module/actor/sheets/handlers/item-handler.js**
   - Added `.item-drop` click handler binding in `initialize()`
   - Implemented `onItemDrop()` method (~150 lines)

### Dependencies
- **Required**: Item Piles module must be installed and active
- **Runtime**: Active scene + controlled token required

## Usage

1. **Select your token** on the scene
2. **Open character sheet** 
3. **Click the drop icon** next to any item
4. For stacked items: **Choose quantity** in dialog
5. Item appears **1 grid square ahead** of token

## Error Handling

The implementation handles:
- ❌ Item Piles module not active → Error notification
- ❌ No active scene → Error notification
- ❌ No controlled token → Error notification
- ❌ Drop operation fails → Re-equips item, shows error
- ✅ User cancels quantity dialog → Aborts cleanly

## Testing Checklist

- [ ] Drop single weapon from Combat tab
- [ ] Drop armor piece with auto-unequip
- [ ] Drop stacked items with quantity prompt
- [ ] Drop items from containers
- [ ] Drop lashed items
- [ ] Verify drop position matches token facing
- [ ] Verify pile uses item's image
- [ ] Test with no Item Piles module installed
- [ ] Test with no controlled token
- [ ] Test error recovery (re-equip on failure)

## Next Steps

If you want to enhance this feature:

1. **Container Dropping**: Currently drops containers but not their contents. Could add option to drop with all nested items.

2. **Custom Drop Distance**: Allow dropping 2-3 grid squares away instead of just 1.

3. **Drop Target Selection**: Click on scene to choose exact drop location instead of automatic positioning.

4. **Batch Dropping**: Select multiple items to drop at once.

5. **Drop Sounds**: Add sound effects when items are dropped.

## Build Command

```bash
npm run build
```

Build completed successfully with no errors.
