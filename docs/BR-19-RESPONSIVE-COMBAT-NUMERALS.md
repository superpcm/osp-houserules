# BR-19 — Responsive combat numerals

Status: sizing implementation and workspace test baseline verified — 2026-10-02. Final release-commit verification remains pending.

## Approved sizing

On 2026-10-02 the user chose responsive sizing. Visible numeral ink targets 38% of its frame height: half of the original 76% inner-area allowance. Width is capped at 70% of the frame. The more restrictive limit wins. The tallest/widest digit reference prevents single digits from changing size merely because their glyph outlines differ; the full value is also measured so negative and multi-digit values fit.

For a 100 × 100 frame, a 40 × 70 measured numeral therefore has 38 pixels of visible height. A 200 × 70 wide value instead reaches the 70-pixel width cap and has 24.5 pixels of visible height. The earlier 37.75-pixel expectation had no matching rule in the implementation and is superseded by the explicit user-approved 38% target.

## Implementation

The character sheet activates the existing canvas-measured sizing helper and its CSS custom property. It recalculates after input changes, combat-tab activation, container resize and font readiness. Rendering again disposes the prior observer/listeners; closing the sheet disposes them too. Scheduled updates are coalesced and cancelled on cleanup. Hidden or invalid frames wait for a usable size, and unavailable canvas support preserves the existing 54px CSS fallback.

Fonts, colors, shapes, labels, game values and read-only HP behavior remain unchanged. This is responsive numeral fitting, not a redesign of the full sheet. The existing Foundry sheet resize setting is unchanged; the helper also handles programmatic/container size changes and other supported embedding contexts.

## Visual evidence

[Representative values at three component widths](qa/BR-19-responsive-numerals.png) and [measured bounds](qa/BR-19-responsive-numerals.json).

The reproducible `scripts/verify-combat-sizing.cjs` fixture uses installed Chrome and Playwright (`BR19_PLAYWRIGHT_MODULE` can identify an existing external installation). Build CSS first, then run the script from the repository root; it blocks all network requests.

The isolated headless Chrome fixture uses the production combat markup, built stylesheet and actual sizing helper with locally available font fallback. Its outer sheet dimensions are overridden to exercise 960px, 720px and 540px containers. All 21 numeral samples fit their measured height/width constraints, including 0, 8, 88, 120, 999, −1 and −12. Browser glyph rasterization permits a 2px measurement tolerance; pure calculation tests assert precise geometry separately.

Visual inspection confirmed readable, unclipped numeral ink. Existing long labels clip in narrow stress cases, and Max HP wraps at the smallest width; these labels/layout constraints were not introduced or altered by this numeral-only change. The fixture is not a claim of full-sheet mobile support or live Foundry verification.

The Impeccable detector found two pre-existing width-transition warnings elsewhere in the stylesheet (lines 2458 and 2698); neither is in the changed numeral rule.

## Validation

- All **1,233 tests passed across 61 files**, including all nine numeral geometry/lifecycle cases, using `npm test -- --hookTimeout 30000 --maxWorkers 2`. Test assertions and the default five-second test timeout were unchanged. The earlier unrestricted-worker run hit an unrelated spellcasting import timeout and a subsequent cascading failure; both passed with bounded concurrency.
- Lint, typecheck and full build passed. Built JS includes sheet activation/disposal, and built CSS consumes the sizing variable.
- Release manifest validation passed for v1.0.12. Independent read-only review passed all four implementation criteria and independently ran all nine focused tests; it correctly leaves the release-commit criterion pending.
- No live world data was modified and no live Foundry acceptance is claimed.
- The requested release-commit check is still outstanding: these results are for the current shared workspace. A read-only Git status attempt exceeded ten seconds on the mounted checkout. No commit was created or represented as tested. Rerun the complete suite against the final release commit before closing the BR-19 release gate.
