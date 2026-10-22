# Notes, handwritten ink, and wand fixes

- Notes border bottom measured 673.995px below the native sheet window top; editor bottom measured 673.995px. The rule handles both individual translate and matrix transforms.
- The marked top Background panel line measured approximately 131.124px below the sheet window top in the current rendered layout.
- The live wand thumbnail was absent. Restored the existing 6070-byte `assets/thumbs/images/gear/wand_thumb.webp` from the source tree; artwork renders again on Gear.
- Skills subtitle is now `Roll ≤ chance on d6.` in both source and live templates.
- Handwritten-font text receives #78694D, including Bio identity controls, native editor menus, and SVG text. Inline values restore on cleanup. Late-created editor nodes trigger a bounded alignment pass; already-correct colors are left untouched to avoid redundant ProseMirror mutations.

Nineteen focused tests passed. CSS build, lint, type checking, and JavaScript build passed. Independent review found no regression. UI checks confirmed the Notes geometry, shortened subtitle, restored wand, Bio color, and settled editor menu colors. No actor data was edited.
