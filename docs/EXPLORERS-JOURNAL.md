# Explorer’s Journal experiment

Implemented September 15, 2026, in the isolated `codex/explorers-journal` worktree. Preview: http://localhost:30001/game. The original system checkout and world are not deployment targets for this experiment.

## Scope

The current Bio tab additionally has a reversible [continuous-background experiment](CONTINUOUS-BIO-EXPERIMENT.md). That document describes the current foundation, scaling behavior, artwork provenance and simple return to the prior component-based layout. Other tabs retain the implementation below.

All seven character-sheet tabs share the green leather binding, aged parchment, brass fittings, Cooper headings, and handwritten values. Character data and controls remain HTML/Foundry components, not text baked into artwork. The Bio portrait retains the character’s existing crop settings.

- Bio: live ruled field grid, ability medallions, writing cards, existing GM-only ability editing.
- Skills: generated medallions and circular SVG text paths driven by the existing class/race skill rules; controls reposition on resize.
- Combat: saving medallions, regular movement hexagons, AC shields, inventory actions.
- Gear: live encumbrance and inventory/container hierarchy.
- Spells: existing slot, spellbook/catalog, learn, memorize, and cast controls.
- Background and Notes: native rich-text editors, wrapping toolbars, compact first-line spacing.

Default size is 850 × 920; the window is resizable. Long content scrolls. Wide inventory tables scroll horizontally in narrow windows instead of hiding actions. This is a functional adaptation of the approved concept, not a flattened or pixel-identical reproduction of the mockups.

## Isolation and rollback

Experimental source: `/Users/paul/FoundryData/osp-explorers-journal/source`.

Original source: `/Users/Shared/foundry/narlington-data/Data/systems/osp-houserules`.

Baseline: commit `327fbc73048223b9875045e6468fc53beca3de4a`, tag `checkpoint/pre-explorers-journal-2026-09-15`. Source and world backups also exist under the experiment’s `backups/pre-explorers-journal-2026-09-15/` directory.

The easiest way to stop exploring is to return to the original instance; no rollback there is needed. To restore the experimental preview itself, first preserve any later experiment changes, stop its Foundry process, and restore/rebuild the saved baseline in this worktree. Do not reset or overwrite the original checkout, and do not copy a running world database over another world.

Theme implementation is isolated in `src/styles/explorers-journal.scss`, the character template, presentation-only sheet changes, and `src/module/actor/journal-skill-diagram.js`. No actor schema, migration, game-rule calculation, compendium, or persistent permission change is part of this theme.

## Verification

- Full project quality checks: lint, TypeScript, automated tests, production assets build, release validation.
- Layout tests cover every count from 1 to all 18 supported skill types, collision/boundary checks, deduplication, empty data, independent SVG IDs, and save-label bindings.
- Live Foundry review covers all seven tabs, resizing, ability disclosures, spell catalog switching, and editor formatting-menu access.
- Existing game-mechanics tests remain in the suite. This visual pass is not an exhaustive playthrough of every roll, class/race pairing, and third-party module combination.

## Bio artwork fidelity pass — September 15, 2026

The Bio tab now reuses detailed decoration cleaned from the user’s approved Bio concept instead of the initial simplified vector frames. The four brass portrait corners, six illustrated medallions and blank riveted name plaques, green-leather-backed torn Abilities parchment, two separate torn writing cards, trees, compass roses, mountains and map contours are CSS crops from one artwork atlas. All values, names, headings and text areas remain live HTML. The portrait’s stored zoom/offsets remain untouched; rendering limits panning at narrow sizes to avoid exposing a blank area inside a zoomed photograph.

The latest Race/XP and Alignment/Background column widths are retained. A non-editable decorative quotation from the approved concept appears under the fields. No character data, rules, permissions or other tabs were changed by this pass.

Verification for this pass: all 137 automated tests, lint, type checks, build and release validation passed. Live Foundry checks at 680, 850 and 970px sheet widths confirmed proportional artwork and no panel overflow; taller wide layouts remain scrollable. All six native score inputs were enabled and unobstructed, both writing fields retained their document bindings, the portrait remained directly interactive, and the saved portrait zoom/offsets did not change. “Tallow Chandler” remained on one line. The Skills tab was also opened successfully. No test character values were written during visual verification.

Saved asset: `assets/character-sheet/explorers-journal/bio-artwork-atlas.png` (1185 × 1327 PNG). Generated with the built-in image-generation tool, output ID `exec-2d48c567-f5c7-4f7d-9eb9-f149771b73c0`, using the user’s approved `codex-clipboard-fe8bd7fd-63cb-4c97-a995-ba19cfb81852.png` as the edit reference. The image-generation skill guided removal of all baked-in data and preparation of reusable decorative artwork, not a replacement screenshot UI.

Generation prompt:

> Use case: precise-object-edit.
> Asset type: lossless-looking cleaned artwork atlas for a live Foundry character sheet, NOT a new design.
> Input image 1 is the edit target: the approved Explorer's Journal Bio concept.
> Primary request: preserve this EXACT image's composition, 1184 by 1328 portrait canvas, coordinates, materials, ornament details, paper tears, shadows, leather, metals and colours. Make only these removals:
> 1. Remove every word, letter and numeric score on the entire image, including all headings, field labels, handwritten values, quotations, caption, tab names, STR/INT/WIS/DEX/CON/CHA letters, instruction lines and textarea placeholders. Heal each small area using its existing paper or brass texture. The SIX brass name plaques must remain, but blank.
> 2. Remove the gnome photograph inside its frame and fill only the photograph area with plain cream paper. Keep its exact frame, all FOUR dimensional triangular aged brass corner protectors, lower caption strip and tiny mushroom engraving.
> Preserve EVERYTHING else, especially the separate green-leather-backed torn parchment Abilities strip; its compass rose at upper left and detailed fern/oak vegetation on both edges; ALL SIX exact circular green-and-brass score medallions and blank riveted brass plaques in the same positions. Keep the little bottom illustrations inside the circles in order: oak sprig, open book, owl, feather, mountains, sun. Keep both separate torn Appearance and Goals paper sections with their fine inset writing-area borders, ornamental horizontal header rules, trees, mountains, compass rose, contour lines and dotted trail. Keep the small mountains/sun drawing underneath the upper fields. Do not flatten or simplify any details. NO new text, no new icons, no reflow, no change in framing or scale, no extra decorations. This will be cropped into components by CSS with all headings and character data drawn as live text on top.

## Artwork provenance

`assets/character-sheet/explorers-journal/journal-page.png` was created with Codex’s built-in image-generation tool using the approved `design-reference/07-notes.png` concept as its reference. Generated output ID: `exec-d781bc83-153d-4d01-8cd6-a25048b11703`. The bitmap contains only the decorative blank journal; no live fields or controls. The medallion, corner, and compass SVGs were authored as reusable vector decorations.

Generation prompt:

> Use case: precise-object-edit. Asset type: production background texture for a fully functional fantasy character-sheet web UI. Edit target: the supplied Explorer's Journal reference. Create a clean BLANK version of this journal page, preserving the exact dark forest-green pebbled leather outer cover, stitched binding/spine at left, small aged-brass corner protectors, dimensional deckled-edge layered cream paper, sepia engraved pine trees/mountains/contour lines and compass rose only in the bottom 12% and a faint small compass at top left. Remove ALL writing, headings, numbers, lines for handwriting, character names, toolbar icons, all inner panel frames, and ALL tabs on the right. Replace their areas with clean subtle cream paper matching the reference. There must be ONE large blank continuous rectangular parchment sheet occupying x=6%..94% and y=3%..96%, with extremely quiet empty center for live HTML content. No circles, no buttons, no text, no portrait, no labels, no fake controls, no watermarks. Straight-on orthographic view filling the complete portrait canvas, about 1184 by 1328 aspect ratio. Preserve tactile realistic leather and paper detail; dark moss green and warm antique brass, NOT yellow gold or orange paper. The only illustrations are delicate muted sepia corner accents, not in the central writing area. This is a reusable background asset, not a new mockup.
