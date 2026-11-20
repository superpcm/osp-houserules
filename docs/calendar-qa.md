# Calendar verification

## Acceptance

The independent verifier marked AC-1 through AC-8 PASS: calendar arithmetic, shared display and month view, world-clock authority/business integration, events and privacy, reminder stopping, resumable Award Rest, corrections/history, and validation/preservation of existing work.

The initial builder draft was revised before verification. Final tests and screenshots refer to the completed implementation, not that draft.

## Automated checks

- Before changes: 129 test files, 1,899 tests passed.
- Final full suite: 133 test files, 1,941 tests passed (42 calendar/application/business tests added).
- Lint, TypeScript quality checks, full CSS/JS build, release manifest validation, and diff whitespace checks passed.
- The independent verifier reran all four focused calendar suites: 42 tests passed.
- Date and recurrence tests include rollover, month/year periods, instant events at midnight, and all-day reminders at 08:00.
- Authority tests include private/public batching, no private reminder content in public messages, active-DM authorization, operation-ID validation/reuse, pausing/resuming/canceling rest, recovery failure/retry, and no double healing after a lost response.
- Business tests use an existing arbitrary world-time anchor, including a timestamp different from the current one, to verify consistent opening hours.

## Interface checks

The isolated fixture used the actual CalendarApp, event template, compiled stylesheet, calendar math, and authority modules with in-memory Foundry documents/time APIs. Its events were explicitly labeled sample data and were not added to the campaign.

Verified in that fixture:

- An eight-hour rest stopped at simultaneous public/private reminders after three hours. Character HP and spell recovery remained unchanged. Continuing advanced the remaining five hours and recovered once.
- Created a public two-day all-day event with a three-month recurrence and 60/1,440-minute earlier reminders through the editor. It appeared on both expected dates.
- Player mode hid private events, DM controls, and private reminder cards while allowing public read-only event details.
- Desktop and compact desktop layouts were inspected. The agenda scrolls independently of the month grid (measured height 515px, content 2,033px in the sample desktop view).

Actual Foundry v14 was then reloaded and the calendar opened from the persistent clock. It displayed Crownday, Longnight 4, Year 742 at 08:00 with no calendar JavaScript errors. The calendar was left open. No campaign time advances, rests, character recovery, or sample events were performed in the live game. The feature's one-time calendar anchor was initialized.

A Foundry theme heading-color conflict discovered in the live view was corrected. Computed month, agenda, and tools headings are dark ink (`rgb(48, 35, 21)`) against parchment. The independent verifier inspected the corrected live screenshot and marked that fix resolved.

Screenshots in `output/qa/calendar/`:

- `foundry-live.jpg`: actual Foundry, empty-event starting state.
- `desktop.jpg`: isolated fixture with sample events, 1728 × 906.
- `compact.jpg`: isolated fixture at 760 × 900.
- `player-details.jpg`: isolated read-only player details.

## Design documentation check

This is an ordinary extension of the established visual world. `PRODUCT.md`, `DESIGN.md`, and their incumbent sidecar were preserved. The supplied verifier role performed the independent finish review because a dedicated Impeccable reviewer role was unavailable. The documentation comparison was performed in the parent thread.

- Palette: existing parchment, walnut, ink, brass, and burgundy base tokens are retained.
- Typography: Georgia family; 30px calendar heading, 14px controls, smaller compact calendar entries.
- Structure: the user-approved five-column/six-row calendar with a separate agenda.
- Controls: existing burgundy actions, parchment secondary controls, keyboard focus, native form fields.
- Scoping: calendar rules stay within its application and clock selectors; existing character sheets are untouched.

The mechanical design detector ran once. Its findings were advisory palette/type-scale differences against pre-existing design metadata, not functional or blocked defects. Pre-existing product-record/sidecar drift was not repaired or canonized as part of this feature.

## Limits

External combat/module time updates cannot be stopped retroactively. Native Foundry ownership and interface filtering provide event privacy; this is not encryption against a modified client. Same-origin browser locks and active-DM/revision checks protect calendar operations; do not run simultaneous calendar mutations from separate browsers sharing one GM account. These boundaries are explained in the user guide.
# Bound Almanac redesign — 2026-10-26

- Approved reference: `output/qa/calendar/approved-almanac.png`.
- Live Foundry capture: `output/qa/calendar/almanac-live.jpg`. Campaign remains Longnight 4, Year 742, 8:00 AM. Existing market and holiday events remain present.
- Isolated captures: `almanac-desktop.jpg`, `almanac-compact.jpg`, `almanac-editor.jpg`, `almanac-player.jpg` in the same directory.
- Preview advance from 8:00 to 8:10 produced hour/minute rotations 245°/60°. A further update to 8:20 preserved an unsaved event title. Player view had thirty days, no private sample event, no Award Rest control, and no History bookmark.
- Live Award Rest prompt opened with eight hours and was dismissed without advancing time. More time controls exposed custom duration, future date, and correction fields.
- Calendar app tests: 17 passed, including midnight/noon/fractional-hour angles, hook-driven draft preservation, player History restriction, Today navigation, and rest prompt/cancellation. Original calendar/domain baseline: 42 tests passed before redesign.
- Full-suite run: 1,942 passed and one pack-snapshot test timed out. Separate rerun of that unchanged pack-snapshot file: 14/14 passed. Seven additional app cases subsequently passed. Lint, typecheck, build, release validation, and diff whitespace checks passed.
- Independent verifier: SHIP across AC-1 through AC-6, including direct approved-reference comparison and documentation review. Decorative event ribbons in the concept are represented by runtime event text and privacy locks; composition, materials, and functionality pass.


## Render fidelity correction — 2026-10-26

Compared the second user-supplied reference directly with the live Foundry window. Revised wide 1280×760 proportions, serif headings, larger handwritten dates, decorated clock, event ribbons, six inline upcoming entries, icon bookmarks and ornate footer frames. Desktop capture: `output/qa/calendar/fidelity-desktop.png`. Compact capture: `output/qa/calendar/fidelity-compact.png`; upcoming entries scroll horizontally and longer event labels truncate.

53 focused calendar/application tests passed. Lint, typecheck, build, and release validation passed. Live campaign time stayed Year 742, Longnight 4, 8:00 AM.

### Follow-up layout correction

Added header inset, reduced oversized dates, set explicit automatic date-button height to override the global 56px control height, retained event-label space, separated the last grid row from the upcoming strip, and inset footer controls from botanical corners. CSS build and lint passed; layout detector returned no findings. Independent visual review passed desktop and 800px compact captures (`layout-desktop.png`, `layout-compact.png`). This pass changes presentation only.

### Upcoming tab and top time controls — 2026-10-26

Replaced the bottom disclosure with a framed Time Controls button immediately after New Event. Moved the authority-filtered upcoming list into a public Upcoming bookmark. Generated a matching upper-right botanical corner and moved the live clock inward to clear it. The fixed 1280×760 window remains unchanged.

Live local Foundry verification: month shows no upcoming strip; Time Controls opens/closes the complete custom duration, advance-to, correction, and history panel; Upcoming displays its own list/empty state. Campaign remains Longnight 4, Year 742 at 8:00 AM. Captures: `upcoming-tab-month.png`, `time-controls-panel.png`, `upcoming-tab.png`.

21 focused app tests passed. Handlebars compiled and rendered all four tab branches with and without drafts; strict HTML nesting checks passed. Build, lint and typecheck passed. Independent final review passed all acceptance criteria.

### Separate analogue clock window

Clock now appears after Time Controls in the centered toolbar and opens a reusable Campaign Clock window. Both players and GMs can open it. World-time and calendar-time hooks refresh its hands and are removed when closed. Local browser verified ordering, opening and singleton reuse at unchanged 8:00 AM. Capture: `clock-window.png`. Focused tests 23/23 passed; both templates compiled for GM/player, build/lint/typecheck passed.

### Lunar cycle and category icons

User confirmed a 30-day cycle aligned to months, new moon day 1 and full moon day 16. Added eight named SVG phases, illumination tooltips, current-phase label, six persisted event categories with editor selection and consistent list/grid icons. Legacy uncategorized markets/festivals/religious events infer their category without migration. Explicit categories override inference.

71 focused domain/authority/application tests passed; build, lint, typecheck and independent GM/player template checks passed. Live local check verified 30 phase markers, category selector and no campaign-time changes. Captures: `lunar-calendar.png`, `category-editor.png`.

### Session notes and seasons

Added separate versioned `sessionNote` Journal flags with normalized day dates, bounded plain text, default-private/public ownership, active-DM CRUD and stale-revision guards. Notes never enter event/reminder APIs. Notes tab and selected-day Agenda display share the filtered note data. Both event/note drafts survive tab changes and live hooks; list deletion targets the clicked record.

Season display derives from current campaign time: Winter 12/1/2, Spring 3–5, Summer 6–8, Autumn 9–11. It sits beside the moon phase. Five bookmarks fit the fixed window without widening the toolbar.

91 focused tests passed across calendar domain, notes, authority, business integration and app behavior. Build, lint, typecheck and independent escaped GM/player template checks passed. Local browser verified Winter, new note defaults at Longnight 4/742/DM-only, and title/body/visibility draft round-trip between tabs. The temporary draft was cancelled without saving. Campaign time remains 8:00 AM. Captures: `season-display.png`, `session-notes-editor.png`.

### Multi-day event bars

Added a pure deterministic week/lane layout for authority-filtered occurrences. All-day/timed multi-day events wrap across five-day weeks, clip at month edges and retain occurrence context for clicks. Single-day events occupy transparent text-link lanes. Two visible lanes and per-day overflow links preserve access to the full Agenda. Hidden overflow segments are omitted from rendering; private occurrences are filtered before layout.

99 focused tests passed across six files, including half-open midnight boundaries, recurring instance keys, month clipping, overlap capacity, no input mutation, player privacy and existing app actions. Lint, typecheck, build and independent functional/visual review passed. Strict HTML nesting checks covered all five tab branches for GM/player contexts.

Isolated rendered fixtures used sample events without campaign writes. GM/player captures are `event-bars-preview.png` and `event-bars-player.png`; the private sample and its overflow count disappear for players. Live game retains 1280×760, 30 day cells, a 10px toolbar gap and unchanged campaign date/time. Temporary preview server and serving symlinks were removed after verification.

### Buffalo-style weather with private forecasts

Added a pure seeded 360-day weather model with twelve Buffalo monthly climate baselines, eight three-hour periods, multi-day fronts, diurnal temperature/wind variation and advisory guidance. Severity includes temperature, wind and precipitation hazards. All four guidance fields are condition-specific; no mechanics are changed.

Separate private `weatherControl` and public `weatherCurrent` Journal flags protect the seed/forecast. Only the active DM initializes/publishes current weather through a serialized lock. Both getters are read-only; players never generate or receive forecasts, future daily high/lows or the private seed. Current snapshots become unavailable when stale and refresh on calendar/world-time hooks. Reload/correction tests reproduce the original weather, and repeated updates in a slot do not rewrite journals.

115 focused tests across eight files passed. Build, lint, typecheck and independent GM/player rendered-template privacy checks passed. Live local Foundry initialized one private seed and one public current report, retained conditions across reload, and displayed all four guidance sections plus seven DM-only days with eight periods each. Calendar time stayed Longnight 4, 742, 8:00 AM. Capture: `weather-report.png`.

### Cartographer clock appearance

Applied user-selected concept 2 with a handless stationary face and separately rotating brass/ruby SVG hands. Existing time-derived angles, singleton window, player access and refresh hooks remain unchanged. The live window shows 8:00 AM with hand rotations 240°/0°; template smoke checks also cover 10:30. All 33 calendar app tests and CSS build passed. Capture: `cartographers-clock-live.png`.
