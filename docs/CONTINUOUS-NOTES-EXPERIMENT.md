# Continuous Notes Experiment

The Notes tab uses the complete supplied concept as a single visual foundation, with live Foundry controls layered over it.

## Assets

- `assets/character-sheet/explorers-journal/notes-concept-reference.png` — untouched supplied concept.
- `assets/character-sheet/explorers-journal/notes-continuous-foundation.png` — production foundation with dynamic content removed.
- `assets/character-sheet/explorers-journal/notes-continuous-foundation-v2.png` — active corrected foundation with a smaller title and no toolbar divider.

## Live elements

- Character name
- ProseMirror formatting toolbar
- Editable notes content and scrollbar
- Sheet navigation tabs

The printed title, subtitle, Discoveries banner, parchment frame, brass corners, and lower map artwork remain in the foundation image.

## Reverting

Remove `ej-sheet--continuous-notes` from the character sheet form class and remove the `explorers-journal-continuous-notes` import from `src/styles/ose.scss` to restore the earlier component-based Notes tab.

## Foundation edit record

Built-in image generation was used in precise-object-edit mode with the supplied Notes concept as the edit target. The edit request was:

> Prepare this supplied concept as a clean production background for live Foundry controls. Remove only the handwritten character name, the entire baked toolbar while preserving the thin rule below it, the placeholder text, and the right-side tabs healed back to leather. Preserve the large title and subtitle, Discoveries banner, whole writing frame and brass corners, lower map artwork, leather and brass frame, parchment texture, and torn edges. Do not redesign, recompose, relight, or recolor anything else. Output exactly 1185 × 1327.
