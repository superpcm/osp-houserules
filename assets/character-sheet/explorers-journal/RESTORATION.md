# Tab artwork restoration — 2026-09-22

Generated using the built-in image-generation tool. Gear's `journal-page.png`
was the material/clarity reference and remains unchanged. Original artwork is
retained for rollback. The six continuous-tab SCSS files now reference the new
assets; all positioning, spacing, sizing and control logic remain unchanged.

| Tab/layer | Original | Restored |
| --- | --- | --- |
| Bio | bio-without-portrait-frame-v11.png | bio-crisp-v1.png |
| Skills | skills-continuous-foundation-v14.png | skills-crisp-v1.png |
| Combat | combat-continuous-foundation-v9.png | combat-crisp-v1.png |
| Spells and its overlay | spells-continuous-foundation-v6.png | spells-crisp-v1.png |
| Background base/compass | background-continuous-foundation-v4.png | background-crisp-v1.png |
| Background adjusted layers | background-continuous-foundation-v5.png | background-layer-crisp-v1.png |
| Notes | notes-continuous-foundation-v4.png | notes-crisp-v1.png |

## Restoration prompt specification

Restore the existing production RPG sheet image, using Gear only as the
reference for material clarity. Preserve the 1185:1327 aspect ratio and exact
relative positions and sizes of every panel, medallion, badge, frame, separator,
icon, illustration and blank writing space. Preserve the torn parchment and
dark forest-green leather tome style. Recreate muddy blurred surfaces as fine
natural parchment fibers, crisp sepia engraving, detailed tooled leather,
well-defined bronze fittings and clean torn edges. Do not redesign, rearrange,
add objects or introduce numbers/text. Avoid blur, heavy grunge, noise and
sharpening halos.

Per-image constraints used in the prompt set:

- Bio: six medallions and blank brass label plates, empty portrait area, all
  writing panels and separators stay registered to the original.
- Skills: no circles, values or headings; keep center blank and corner scenery
  and compass at the original positions.
- Combat: retain all existing labels exactly: Death · Poison, Wands,
  Paralysis · Petrification, Breath Attacks, HP, Max HP, Tactical, Explore,
  Travel, AC and uAC. Keep fifth upper label area blank and all values empty.
- Spells: preserve empty bronze banner, star/moon artwork and lower writing
  panel; add no text.
- Background: preserve Origins/History titles and both existing prompt strips
  verbatim, together with column boundaries and corner brackets.
- Background adjusted layer: use restored base as the texture/color reference
  while retaining v5's separate compass and mountain/tree coordinates.
- Notes: preserve the large writing panel, bronze corners, two banner rules,
  bottom scenery and empty header area.

## Validation

CSS compilation completed successfully. Browser visual verification was blocked
by the browser's unavailable admin-policy security check; it was not bypassed.
The source and output assets were visually inspected directly.
