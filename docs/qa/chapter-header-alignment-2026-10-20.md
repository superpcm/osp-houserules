# Chapter header alignment — 2026-10-20

All seven primary character-sheet chapter headings now start with their visible letters 90 viewport CSS pixels below the native sheet window's top edge. Bio is excluded. Paired subtitles receive the same displacement, retaining their existing spacing. Sheet scaling is included in the calculation.

## Live verification

Screenshot pixel measurements independently found exactly 90px on Skills, Combat, Gear, Spells, Details, Background, and Notes. Evidence: `output/qa/chapter-header-pixel-measurements-20261020.json`, DOM rectangles in `output/qa/chapter-header-dom-20261020.json`, and a screenshot per tab. Repeated switching back to Skills remained aligned.

Bio name and saving-throw section rectangles matched the recorded baseline exactly; Bio has no alignment mapping. Its existing automatic title/subtitle spacing logic remains independent.

The helper runs after the existing two-frame ink-spacing calculation, observes tab changes and resizing, handles font readiness, and is recreated on native host changes. Cleanup restores the original inline position/top values and removes its observers, listeners, and pending frame. The existing text transforms remain intact.

Live promotion replaced only the native sheet class and injected the new self-contained helper into the existing live bundle. Independent live artwork, templates, styles, and body layout were preserved.

JavaScript build, repository lint, and type checking passed. Both focused test files passed: 14 tests, zero failures. Automated coverage checks scaled ink conversion, tab mappings, Bio exclusion, paired spacing, three-frame scheduling, host rebinding, and cleanup. Independent implementation review passed. Detached-window header geometry was not separately captured; native detach/attach itself was verified by the user during the preceding migration.
