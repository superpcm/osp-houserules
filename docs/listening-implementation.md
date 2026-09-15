# Listening at Doors Field Implementation

## Overview
A new "Listening at Doors" field has been added to the Combat tab of the character sheet, implementing OSE (Old-School Essentials) rules for racial hearing abilities.

## Implementation Details

### 1. Field Location
- **Tab**: Combat tab
- **Position**: Right side of the Combat tab (coordinates: left: 550px, top: 120px)

### 2. Field Behavior

#### Auto-Population by Race (Non-Thief/Assassin Classes)
- **Human, Half-Elf, Half-Orc**: 1-in-6 chance
- **Dwarf, Elf, Halfling/Hobbit, Gnome**: 2-in-6 chance
- Field is **read-only** for all classes except Thief and Assassin

#### Thief and Assassin Classes
- Field is **editable** (not read-only)
- Default value: 1-in-6 (can be improved through class advancement)
- Options: 1-in-6, 2-in-6, 3-in-6, 4-in-6, 5-in-6

### 3. Technical Implementation

#### Files Modified
1. **templates/actors/character-sheet.html**
   - Added listening field HTML structure
   - Added JavaScript logic for auto-population and read-only state management

2. **src/styles/_character-sheet.scss**
   - Added styling for `.listening-group` and `.cs-listening-select`
   - Includes disabled state styling

3. **template.json**
   - Added `listeningAtDoors: "1-in-6"` to character system data

4. **docs/listening-at-doors.md**
   - Created reference documentation with OSE racial hearing chances

#### JavaScript Logic
- **updateListeningAtDoors()** function handles:
  - Race-based auto-population for non-Thief/Assassin classes
  - Read-only state management
  - Default values for Thief/Assassin classes
- Event listeners on race and class fields trigger updates
- Initialized on character sheet load

### 4. Data Storage
- Stored in: `system.listeningAtDoors`
- Data type: String
- Valid values: "1-in-6", "2-in-6", "3-in-6", "4-in-6", "5-in-6"

### 5. Reference Documentation
See `docs/listening-at-doors.md` for the complete OSE racial hearing table that this implementation follows.

## Usage
1. The field automatically populates based on character race
2. For Thief/Assassin classes, manually adjust the value as the character advances
3. For all other classes, the value is determined by race and cannot be edited
4. Changes to race or class immediately update the field value and edit state
