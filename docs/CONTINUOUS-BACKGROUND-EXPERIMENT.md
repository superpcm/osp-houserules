# Continuous Background Experiment

The Background tab uses the supplied concept as a single visual foundation, with two live Foundry editors layered over it.

## Assets

- `assets/character-sheet/explorers-journal/background-concept-reference.png` — untouched supplied concept.
- `assets/character-sheet/explorers-journal/background-continuous-foundation.png` — production foundation with dynamic content removed.

## Live elements

- Character name
- Both ProseMirror formatting toolbars
- Editable Origins and History content and scrollbars
- Sheet navigation tabs

The page title and subtitle, compass and mountain art, Origins and History headings, hint banners, panel frames, brass corners, and lower landscape artwork remain in the foundation image.

## Reverting

Remove `ej-sheet--continuous-background` from the character sheet form class and remove the `explorers-journal-continuous-background` import from `src/styles/ose.scss` to restore the earlier component-based Background tab.

## Foundation edit record

Built-in image generation was used in precise-object-edit mode with the supplied Background concept as the edit target. The edit removed only the baked character name, toolbar controls, editor placeholder copy, and navigation tabs, while preserving the complete design and healing those areas with matching parchment or leather texture. Output was requested at exactly 1185 × 1327.
