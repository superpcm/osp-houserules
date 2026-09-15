# Encumbrance System

This document describes the implemented encumbrance system for OSP House Rules.

## Overview

The encumbrance system tracks both **Weight** (total carrying capacity) and **Capacity** (how items fit in containers).

## Weight System

### Calculation
- **Maximum Weight**: `STR × 15` pounds
- **Total Weight**: Sum of ALL items (equipped + stored), including containers and their contents

### Encumbrance Levels

| Level | Threshold | Movement Penalty | Description |
|-------|-----------|------------------|-------------|
| **Unencumbered** | ≤ 1/3 max weight | 0 | No penalty |
| **Light** | ≤ 2/3 max weight | -10' | Slightly burdened |
| **Heavy** | ≤ max weight | -20' | Heavily burdened |
| **Overloaded** | > max weight | Cannot move | Too much weight |

### Base Movement Rates
- **Dwarves, Gnomes, Hobbits**: 30 feet
- **All other races**: 40 feet

### Example
Character with STR 12:
- Max Weight: 12 × 15 = 180 lbs
- Unencumbered: ≤ 60 lbs (no penalty)
- Light: ≤ 120 lbs (-10' movement)
- Heavy: ≤ 180 lbs (-20' movement)
- Overloaded: > 180 lbs (cannot move)

## Capacity System

### Size Categories

| Size | Coin Equivalent | Slots | Examples |
|------|----------------|-------|----------|
| **T** (Tiny) | 25 coins | 1 | Ring, potion, scroll |
| **S** (Small) | 50 coins | 2 | Dagger, torch, rope |
| **M** (Medium) | 100 coins | 4 | Sword, shield, backpack |
| **L** (Large) | 600 coins | 24 | Two-handed weapon, large sack |
| **W** (Worn) | - | 0 | Armor, cloak, helm |
| **B** (Beast) | - | 0 | Cart, mount equipment |

### Size Conversions
- 1L = 6M = 12S = 24T
- 1M = 3S = 6T
- 1S = 2T

### Container Capacities

| Container | Capacity | Slot Count |
|-----------|----------|------------|
| Backpack | 6M | 24 slots |
| Large Sack | 1L | 24 slots |
| Small Sack | 4M | 16 slots |

### Capacity Rules

1. **Equipped vs Stored**
   - `equipped: true` = Carried on person (doesn't use container capacity)
   - `equipped: false` = Stored in container (uses capacity)

2. **Worn Items**
   - Items with size "W" (armor, cloaks, helms) don't consume container capacity
   - They still count toward total weight

3. **Containers**
   - Containers have their own size (M or L)
   - When nested, the container itself uses capacity in the parent container
   - Example: Backpack (M) inside Large Sack uses 4 slots

### Body Slots (Optional)

The `carryLocation` field can track specific carrying locations:

- **Hands**: `hand-primary`, `hand-secondary`
- **Belt**: `belt-1`, `belt-2`, `belt-3` (typically 2-3 items of S-M size)
- **Slung**: `slung` (1 Medium item like a shield or quiver)
- **Lashed**: `lashed-top`, `lashed-bottom`, `lashed-side-1`, `lashed-side-2`
  - Top/Bottom: 1L or smaller
  - Sides: 1M or smaller
- **Worn**: `worn` (armor, cloak, helm)
- **Stored**: Empty or container ID

## Implementation Details

### Data Structure (template.json)

```json
{
  "character": {
    "encumbrance": {
      "weight": {
        "value": 0,     // Current total weight
        "max": 0        // STR × 15
      },
      "level": "",      // unencumbered/light/heavy/overloaded
      "movement": 0     // Final movement rate
    }
  },
  "item": {
    "carryLocation": "" // Optional: specific body slot
  }
}
```

### Actor Calculation (actor.js)

The `_calculateEncumbrance()` method:
1. Sums all item weights (ALL items count)
2. Calculates max weight from STR × 15
3. Determines encumbrance level based on thresholds
4. Calculates movement penalty
5. Updates `system.encumbrance` object

The `_calculateCapacity()` method:
1. Converts size categories to slot counts
2. Sums used capacity in each container
3. Updates container capacity tracking

### Character Sheet Display

The character sheet expects:
- `totalWeight` / `maxWeight` - For text display
- `encumbrancePercentage` - For progress bar
- These are calculated automatically from the encumbrance object

## Testing

To test the encumbrance system:

1. Create or open a character
2. Set the character's STR score
3. Add items to the character's inventory
4. Run the test script in browser console:

```javascript
// Copy and paste test-encumbrance.js into console
```

5. Verify:
   - Total weight matches sum of all items
   - Max weight = STR × 15
   - Encumbrance level is correct for weight thresholds
   - Movement rate shows correct penalty
   - Container capacity tracking works

## Future Enhancements

1. **Container Assignment**
   - Track which specific container holds each item
   - Prevent over-capacity warnings

2. **Body Slot Validation**
   - Enforce hand limits (2 hands)
   - Validate belt/slung/lashed limits

3. **UI Improvements**
   - Visual indicators for encumbrance level
   - Container capacity bars
   - Drag-and-drop between containers

4. **Coin Weight**
   - Track coin weight (600 coins = 1 lb)
   - Include in encumbrance calculations
