# Continuous Skills experiment

The Explorer's Journal Skills tab uses a single full-page foundation image, with live Foundry controls layered over the artwork. Skill targets still come from the selected race and class, and ability cards remain expandable.

## Reversibility

Remove `ej-sheet--continuous-skills` from the character-sheet form to restore the previous component-based Skills presentation. The Bio experiment is independent.

## Assets

- `skills-continuous-page.png`: the supplied visual reference.
- `skills-continuous-foundation.png`: the production foundation with dynamic character content removed.
- `skills-continuous-foundation-v2.png`: the active foundation with the two oversized baked headings removed so smaller live headings can be used.

## Foundation edit

The production foundation was made with the built-in image generation editor using this prompt:

> Use case: precise-object-edit. Asset type: full-page Foundry VTT character-sheet background, 1185 x 1327. Input image 1 is the edit target. Preserve the exact canvas size, camera, framing, dark green stitched leather cover, brass outer corners, layered/torn parchment, paper texture, shadows, compass, trees, mountains, contour lines, route marks, static Skill Targets title and subtitle, horizontal separator, static Abilities heading and subtitle. Remove the handwritten character name, all four skill medallions with their curved labels and values, all five ability-row cards, and all seven protruding right-side tab panels. Heal those areas to matching parchment or leather as appropriate. Preserve every other element. Add no new text or shapes, do not redesign or recolor, and leave no patch rectangles or visible seams. The result must look like one naturally aged continuous journal page ready for live controls.

The v2 foundation used a second built-in precise-object edit:

> Remove only the two large baked section-title texts “Skill Targets” and “Abilities”, healing each vacated title area to seamless matching aged parchment. Preserve the exact 1185 x 1327 canvas, leather, brass, torn parchment, texture, compass, trees, mountains, contour lines, route marks, ornamental rules, separator, and both existing subtitle lines verbatim in their original positions. Change no other element and add no new text or shapes.

## Live overlays

- Character name
- Race/class-derived skill medallions, curved labels, and editable targets
- Race/class-derived expandable ability cards and source badges
- Existing sheet navigation tabs
