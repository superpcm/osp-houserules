# Continuous Bio foundation experiment

Enabled September 15, 2026, only in the isolated Explorer’s Journal source at `/Users/paul/FoundryData/osp-explorers-journal/source`. Preview: http://localhost:30001/game.

## What changed

The Bio tab uses one intact `bio-continuous-page.png` background (1185 × 1327). There are no separate raster crops behind the photo frame, motto/mountains, Abilities, or writing sections. Native character fields and controls are positioned in that image’s coordinate system. The page and controls scale proportionally to fit the window, without stretching the circles or independently resizing parchment sections. Extra window space uses a dark leather-colored surround.

Race and Class now share their 400-unit reference span as 180/220 (previously 160/240), giving “Half-Orc” room without moving or resizing XP. The earlier Alignment/Background allocation is preserved proportionally. The final row gives Languages a little more space so the existing text remains readable. Appearance and Goals use native, editable, internally scrollable textareas instead of expanding the paper artwork. Character data, portrait selection and saved pan/zoom, permissions, rules, and other tabs are unchanged.

The new styling lives in `src/styles/explorers-journal-continuous-bio.scss`, imported after the previous theme. It is gated by `ej-sheet--continuous-bio` on the character form AND an active Bio tab. Switching tabs automatically restores the existing common foundation.

## Return to the previous version

The previous component-based CSS and artwork are still present and unchanged. To switch back, remove only `ej-sheet--continuous-bio` from the opening form in `templates/actors/character-sheet.html`, then refresh the experimental client (save pending edits first). That disables the new stylesheet’s selectors. Re-adding the class re-enables this experiment. Do not reset the whole repository or restore older character/world data.

An additional pre-change source snapshot is saved at:

`/Users/paul/FoundryData/osp-explorers-journal/backups/pre-continuous-bio-2026-09-15/`

It includes the previous character template, main theme stylesheet, stylesheet entry point, character-sheet module, and experiment notes. Leave subsequent unrelated work intact if restoring individual files later. The original system at `/Users/Shared/foundry/narlington-data/Data/systems/osp-houserules` was not modified.

## Verification

- Full quality checks passed: lint, type checking, 161 automated tests, build, and release validation.
- Live checks at 850 × 920 and 680 × 730 sheet sizes confirmed proportional artwork and aligned, unobstructed native score and writing controls.
- “Tallow Chandler” remains on one line, and Languages fits without overlapping its label.
- All six tabs available for this character opened correctly; only Bio uses the new foundation. The existing conditional Spells navigation remains unchanged.
- Read-only layout inspection confirmed that the portrait container, motto, Abilities section and heading, writing cards and headings each have no background image of their own. The portrait frame and mountain decoration pseudo-elements are disabled.
- No test character values were written during verification. This is a visual/layout experiment, not a new game-mechanics implementation.

## Race/Class dropdown synchronization

Fixed September 15, 2026. The native class selector already applied the existing race restrictions correctly, but the themed menu retained its original options when Race changed without a full sheet render. The themed controls now use the current native options as their sole source of truth, refreshing after changes and observed option mutations. They also reject stale option buttons and clean up their listeners/observers when the sheet re-renders or closes.

The eligibility table and existing Fighter fallback are unchanged. Synchronizing the display does not emit an extra class-change event or invoke XP/level changes. Fifteen new DOM integration tests exercise the actual race handler and template class inventory, covering all seven races, repeated switching, fallback display, newly eligible selections, stale-button rejection, and cleanup. JSDOM and jQuery were added only as development/test dependencies; Foundry continues to supply its own runtime environment.

A fresh test-world browser client confirmed Elf's nine native choices exactly match the themed menu, with Fighter preserved and normal scrolling. No character values were changed, and the user's existing client was left open without refreshing. Save pending edits and refresh that client to load the fix.

## Bio field readability refinements

Added September 15, 2026. Themed dropdown scrollbars now use the dark forest-green leather color from the journal cover, with a parchment-colored track. The character-name field retains its existing default size when the name fits and reduces only its font size for longer names; the field geometry and surrounding artwork remain fixed. A resize observer recalculates the fit when the sheet itself changes size.

XP is displayed with thousands separators (for example, `5,240`) while remaining display-only on the Bio form. XP awards and other XP changes continue to update actor data through the existing XP mechanisms; ordinary edits to unrelated Bio fields do not resubmit or rewrite XP. Nine focused tests cover name fitting and XP formatting/submission isolation. A clean Foundry client confirmed the default Fung Telt size, the comma-formatted XP display, and the computed green scrollbar colors without writing character data.

Ability scores are centered horizontally and vertically across the full live medallion area, intentionally allowing the number to overlap the decorative icon beneath it. The STR/INT/WIS/DEX/CON/CHA pseudo-labels use flex centering within their brass badge regions, with a 0.55cqw optical downward correction for the display font. Live inspection at the reviewed 1302 × 964 viewport confirmed identical score/control rectangles, zero padding, centered alignment, and consistent badge transforms for all six abilities.

Dependency audit note: npm reported eleven pre-existing advisories (four moderate, seven high) in unchanged packages. None concern the newly added DOM test dependencies. Unrelated dependency upgrades were not performed as part of this dropdown fix.

## Artwork provenance

Saved file: `assets/character-sheet/explorers-journal/bio-continuous-page.png`.

Created with the built-in image-generation tool from the existing `bio-artwork-atlas.png`. Output ID: `exec-b40e010e-09d1-4214-a5fa-e2f32602664c`. The image-generation skill guided minimal cleanup of baked-in form rules, title-rule gaps and blank tabs so native controls could occupy those areas without pasted background patches. The complete decorative image is used as one CSS background, not sliced into components.

Final prompt:

> Use case: precise-object-edit.
> Input image 1 is the EDIT TARGET: the existing cleaned Explorer's Journal Bio page, 1185 × 1327. This is a minimal preparation pass for using the WHOLE image as one continuous production background, not a redesign.
> Keep the exact camera, framing, canvas proportions, coordinates, palette, paper texture, shadows, torn paper boundaries, four-corner brass portrait frame, every medallion and its tiny illustration, blank brass plaques, vegetation, compass roses, mountains, contour lines, leather cover and stitching.
> Change ONLY these tiny UI-conflicting details:
> 1. Remove the thin ruled form-field lines in the upper right region x440..1085, y75..438 (all straight horizontal/vertical form rules and their small corner flourishes). Heal to seamless matching parchment. Keep the mountain/sun drawing under that region at y448..504 UNCHANGED.
> 2. In the long horizontal ornamental line of the Abilities section at y548, remove just the central segment x480..720 to leave a clean title gap. Preserve the rest of that rule.
> 3. In the ornamental heading line at y864 of the Appearance section, remove only x168..605 for a live title. Preserve the right-hand rule and little mountains.
> 4. In the ornamental heading line at y1085 of the Goals section, remove only x168..520 for a live title. Preserve the right-hand rule and compass.
> 5. Remove the seven empty protruding right-hand tab panels in x1112..1176, y85..1219 and heal their small area to the dark green leather backing. The live UI will supply clickable tabs. Preserve the outer brass book corners and the torn right edge of the central paper.
> EVERYTHING ELSE MUST STAY UNCHANGED. No text, numbers, new drawings, new layout, recoloring, panels, patch edges or other alterations. Especially do not remove, flatten or recolor any torn-paper layer, portrait corner or botanical/map artwork. Keep this as one natural continuous journal image with no visible edit seams.
