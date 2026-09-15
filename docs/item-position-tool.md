# Item Sheet Position Tool

The position tool has been extended to work with all item sheet types (item, weapon, armor, container).

## How It Works

The position tool allows you to visually adjust the position and size of elements on item sheets by right-clicking on them.

### Setup

1. **Mark elements as positionable** by adding `is-pos-*` classes to them in the HTML templates:
   - `templates/items/item-sheet.html`
   - `templates/items/weapon-sheet.html`
   - `templates/items/armor-sheet.html`
   - `templates/items/container-sheet.html`

2. **Naming convention**: Use descriptive names after `is-pos-`:
   ```html
   <input class="is-pos-item-name" ...>
   <input class="is-pos-cost" ...>
   <input class="is-pos-weight" ...>
   <select class="is-pos-size" ...>
   <textarea class="is-pos-description" ...>
   ```

### Using the Tool

1. Open an item sheet in Foundry VTT
2. Right-click on any element with an `is-pos-*` class
3. A dialog will appear with controls:
   - **X/Y Position**: Numeric inputs for precise positioning
   - **Arrow buttons** (↑↓←→): Move element 1px at a time
   - **Width/Height**: Adjust dimensions with +/- buttons
   - **Keyboard shortcuts**:
     - Arrow keys: Move position
     - `+` / `-`: Adjust width
     - `[` / `]`: Adjust height

4. Click "Apply Changes" to save
5. Click "Reset to Default" to remove custom positioning

### How Positioning Works

The tool uses CSS custom properties (variables) to store positions:

```css
.is-abs {
  position: absolute !important;
  left: var(--left, 0) !important;
  top: var(--top, 0) !important;
  width: var(--width, auto) !important;
  height: var(--height, auto) !important;
}
```

When you adjust an element:
1. The tool adds the `is-abs` class to the element
2. Sets CSS custom properties: `--left`, `--top`, `--width`, `--height`
3. The element immediately repositions using these variables

### Example: Adding Positioning to Cost Field

In `templates/items/item-sheet.html`:

```html
<!-- Before -->
<input type="number" value="{{system.cost}}" readonly disabled />

<!-- After -->
<input type="number" class="is-pos-cost" value="{{system.cost}}" readonly disabled />
```

Now you can right-click the cost field and position it anywhere on the sheet.

### Differences from Character Sheet Tool

The item sheet position tool:
- Uses `is-pos-*` classes instead of `cs-pos-*`
- Uses `is-abs` class instead of `cs-abs`
- Works on all item types (item, weapon, armor, container)
- Targets the item object instead of actor

Otherwise, the functionality is identical to the character sheet position tool.

### Testing

Use the test script `test-item-position-tool.js`:

1. Open an item sheet
2. Open browser console (F12)
3. Paste the contents of `test-item-position-tool.js`
4. Press Enter

The script will check if the position tool is active and show available positionable elements.

### Permissions

The position tool is available to:
- GMs (always)
- Item owners
- Users with editable item sheets
- Development mode users

### Tips

1. **Start with key fields**: Add `is-pos-*` classes to the most important fields first
2. **Use descriptive names**: `is-pos-item-name` is better than `is-pos-field1`
3. **Test positioning**: Right-click immediately after adding classes to test
4. **Save CSS values**: When you find good positions, you can copy the CSS variables and add them to your SCSS files for permanent positioning
5. **Reset if needed**: Use "Reset to Default" button to remove custom positioning and start over

### Files Modified

- `src/module/item/handlers/item-position-tool-handler.js` - New handler class
- `src/module/item/item-sheet.js` - Integration with item sheets
- `src/styles/equipment.scss` - CSS support for `is-abs` and positioning
- `test-item-position-tool.js` - Test script

### Future Enhancements

Potential improvements:
- Auto-save positions to item flags
- Import/export position presets
- Grid snapping
- Alignment guides
- Copy positions between similar items
