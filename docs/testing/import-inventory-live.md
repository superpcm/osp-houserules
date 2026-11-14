# Import Inventory live validation

Validated on Westford: https://westford.the-citadel.us/game

- All 11 bundled categories were previewed (191 catalog records).
- Existing unfiled catalog items were organized into 10 folders of like items.
- Existing item IDs, names, images, and customized fields were preserved; organization changed only folder placement and the expected modification timestamp.
- A mixed import made Amber genuinely missing by temporarily renaming the original. The importer created one new Amber directly in the existing Treasure folder, skipped 190 existing catalog items, and reported zero errors or folder moves.
- Torch had a custom image and merchant metadata in a temporarily renamed Adventuring Gear folder. Its complete exported JSON, including folder ID and modification timestamp, was identical before and after the mixed import.
- All 192 preexisting items retained their folder IDs during the mixed import.
- Rerunning showed zero missing items, zero items to organize, and 191 existing catalog records; the action was disabled.
- Original test values and names were restored. After explicit approval, only the new test copy was permanently deleted. A reload confirmed all 192 original items and 10 folder IDs/names matched the baseline, and the importer still had no work remaining.

Automated regression coverage lives in `src/module/inventory/inventory-import.test.js`, including mixed imports, custom-folder preservation, folder-only updates, repeated imports, folder reuse/ambiguity, and changes between preview and apply.
