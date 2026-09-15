# Visual Text Centering System

## Overview

This system provides precise text centering that accounts for both mathematical and visual weight. Different font sizes and characters require different compensation for optimal visual centering, especially with serif fonts like Minion Pro.

## How It Works

The system uses CSS transforms, flexbox alignment, and font metrics to achieve centering that looks correct to the human eye, not just mathematically centered.

### Core Principles

1. **Mathematical vs Visual Centering**: Mathematical centering places text at the exact pixel center, but visual centering accounts for how the eye perceives the text weight.

2. **Font Metrics Compensation**: Serif fonts have different baseline relationships and descender weights that affect perceived centering.

3. **Container Context**: Text centering needs differ based on whether the container is circular, rectangular, or has visual borders/shadows.

4. **Character Type Sensitivity**: Numbers, single characters, and text strings each need different adjustments.

## Base Centering Classes

### Size-Based Centering

- `%visual-center-large` - For text 40px+ (saves, ability scores)
- `%visual-center-medium` - For text 20-39px (names, levels, XP)
- `%visual-center-small` - For text 12-19px (labels, small fields)

### Content-Based Centering

- `%numeric-center` - Optimized for numbers and numeric values
- `%single-character-center` - For single letters/numbers (ability scores)
- `%input-visual-center` - For form inputs (accounts for border visual weight)

### Container-Based Centering

- `%round-container-center` - For circular/rounded containers
- `%rectangular-container-center` - For standard rectangular fields

## Applied Classes

### Character Sheet Fields

| Class | Purpose | Adjustments |
|-------|---------|-------------|
| `.cs-save-value` | Saving throw numbers in circles | Large + single char + round container |
| `.cs-ability-label` | Ability score numbers | Large + single character |
| `.cs-level-display` | Character level in rectangular field | Medium + numeric + rectangular |
| `.cs-char-name` | Character name input | Medium + input compensation |
| `.cs-xp-display` | Experience points | Medium + numeric + input |
| `.cs-combat-input` | Combat stats (AC, HP, etc.) | Medium + numeric + input |

### Form Elements

- `.cs-field` - Base field styling with input centering
- `.cs-select-large` - Large select dropdowns
- `.cs-select-small` - Small select dropdowns  
- `.cs-ability-select` - Ability score selectors (special large + round)

## Manual Fine-Tuning

When automatic centering needs adjustment, use utility classes:

### Vertical Nudging

```css
.cs-center-nudge-up-xs    /* -0.01em */
.cs-center-nudge-up-sm    /* -0.02em */
.cs-center-nudge-up-md    /* -0.04em */
.cs-center-nudge-up-lg    /* -0.06em */
.cs-center-nudge-up-xl    /* -0.08em */

.cs-center-nudge-down-xs  /* +0.01em */
.cs-center-nudge-down-sm  /* +0.02em */
.cs-center-nudge-down-md  /* +0.04em */
.cs-center-nudge-down-lg  /* +0.06em */
.cs-center-nudge-down-xl  /* +0.08em */
```

### Horizontal Nudging

```css
.cs-center-nudge-left-xs   /* -0.01em text-indent */
.cs-center-nudge-left-sm   /* -0.02em text-indent */
.cs-center-nudge-left-md   /* -0.04em text-indent */

.cs-center-nudge-right-xs  /* +0.01em text-indent */
.cs-center-nudge-right-sm  /* +0.02em text-indent */
.cs-center-nudge-right-md  /* +0.04em text-indent */
```

### Letter Spacing

```css
.cs-letter-spacing-tight   /* -0.02em */
.cs-letter-spacing-normal /* 0 */
.cs-letter-spacing-loose  /* +0.02em */
```

### Font Weight Compensation

```css
.cs-visual-weight-light    /* 300 weight + slight up adjustment */
.cs-visual-weight-normal   /* 400 weight */
.cs-visual-weight-bold     /* 600 weight + slight down adjustment */
```

## Implementation Examples

### Adding New Centered Field

```scss
.my-new-field {
  @extend %visual-center-medium;  // Size category
  @extend %numeric-center;        // If it contains numbers
  @extend %input-visual-center;   // If it's an input field
  
  // Field-specific properties
  width: 100px;
  height: 30px;
  font-size: 18px;
  
  // Custom adjustment if needed
  transform: translateY(-0.03em);
}
```

### Applying Manual Adjustments

```html
<!-- If a field needs slight upward adjustment -->
<input class="cs-field cs-center-nudge-up-sm" />

<!-- If text appears too tight -->
<div class="cs-save-value cs-letter-spacing-loose">8</div>

<!-- If you need to disable automatic centering -->
<span class="cs-manual-center">Custom positioned text</span>
```

## Browser Compatibility

The system includes specific handling for:

- **WebKit browsers**: Custom placeholder centering
- **Firefox**: Number input appearance reset
- **Edge/IE**: Placeholder text centering
- **All browsers**: Spinner arrow removal for number inputs

## Troubleshooting

### Text appears too high
- Add `.cs-center-nudge-down-sm` or similar
- Check if container has unexpected padding/borders

### Text appears too low
- Add `.cs-center-nudge-up-sm` or similar
- Verify the correct base centering mixin is applied

### Numbers look off-center
- Ensure `%numeric-center` is applied
- Consider `.cs-letter-spacing-tight` for single digits

### Single characters need adjustment
- Use `%single-character-center`
- Apply `%round-container-center` if in circular container

### Form inputs behave inconsistently
- Verify `%input-visual-center` is applied
- Check browser-specific placeholder styles

## Testing Changes

After modifying centering rules:

1. Build CSS: `npm run build:css`
2. Test in Foundry VTT with different content:
   - Single digits (1-9)
   - Double digits (10-20)
   - Character names (short and long)
   - Mixed content
3. Check across different browsers
4. Verify with different zoom levels

## Technical Notes

- Uses `em` units for scaling with font size
- Combines `transform`, `text-align`, `flexbox` for maximum compatibility
- Maintains `line-height: 1` to prevent line-height interference
- Uses `box-sizing: border-box` for predictable sizing
- Applies `font-variant-numeric: tabular-nums` for consistent number spacing
