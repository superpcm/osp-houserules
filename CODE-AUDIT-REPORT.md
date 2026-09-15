# OSP House Rules — Code Health Report

> **Audit date:** September 12, 2026  
> **Overall health:** **Needs targeted repair**  
> **Immediate status:** Source builds and unit tests pass, but the published install path is likely incomplete.

> **Remediation update:** The findings below were addressed on September 12, 2026. Release packaging is
> now allowlisted and versioned; character-template global scripts were removed; startup unpause is opt-in
> and GM-safe; lifecycle cleanup, strict incremental type checking, linting, CI, tests, and architecture
> documentation were added. This report retains the original findings as the rationale for those changes.

## Executive snapshot

| Area | Rating | Plain-English assessment |
|---|---:|---|
| Build | 🟢 Good | The JavaScript and CSS compile successfully. |
| Unit tests | 🟢 Good | 97/97 tests pass. The tested inventory, banking, capacity, treasure, and ammo logic is healthy. |
| Distribution | 🔴 Critical | `system.json` downloads the GitHub source branch, but `dist/` is ignored and untracked. A fresh install can therefore lack the JS/CSS Foundry is told to load. |
| Character sheet | 🔴 High risk | One template and one controller contain too much code and use page-wide browser state. Multiple open sheets can interfere with each other and leave timers/listeners running. |
| Maintainability | 🟠 Weak | Several files are thousands of lines long, making changes slow and regressions difficult to isolate. |
| Type safety / linting | 🟠 Weak | “Strict TypeScript” currently checks almost none of the JavaScript application. There is no lint gate. |
| Dependencies | 🟢 Good | Offline audit found no known vulnerabilities in installed production dependencies. |
| Repository hygiene | 🟠 Weak | Debug archives, logs, previews, database internals, and macOS metadata are mixed with product source. |

## Priority findings

### P0 — Published downloads likely omit the runnable application

**Evidence:** `system.json` loads `dist/ose.js` and `dist/ose.css` and downloads the `main` branch ZIP. However, `dist/` is excluded by `.gitignore` and has no tracked files.

**Why this breaks:** GitHub’s source ZIP only contains tracked files. A user can install the system successfully but receive neither file Foundry needs to start it.

**Improve it:** Publish a versioned release ZIP containing the built `dist/` output, point `download` to that release asset, and add a release check that opens the ZIP and verifies every manifest path exists. Avoid distributing directly from a moving branch.

### P1 — Character sheets can interfere with one another

**Evidence:** `templates/actors/character-sheet.html` contains roughly 1,000 lines of inline JavaScript, uses many global `document.querySelector(...)` calls and repeated IDs, temporarily replaces `window.FormData`, and starts a 500 ms interval. The full template is 3,369 lines.

**Why this is broken/inefficient:** Page-wide selectors usually find the first matching sheet, not necessarily the sheet being edited. Every rerender can add more listeners, observers, and intervals. This creates wrong-sheet updates, background CPU work, and hard-to-reproduce behavior.

**Improve it:** Move all inline logic into a sheet controller; scope every lookup to the current sheet root; use Foundry’s form/update lifecycle; format XP only when its value changes; and explicitly disconnect observers, remove listeners, and clear timers when the sheet closes.

### P1 — Core files are too large to change safely

| File | Approx. size | Main concern |
|---|---:|---|
| `src/module/actor/sheets/character-sheet.js` | 5,220 lines | UI, inventory, drag/drop, spells, skills, tooltips, and business rules are coupled. |
| `templates/actors/character-sheet.html` | 3,369 lines | Markup and application logic are mixed. |
| `src/styles/character-sheet-main.scss` | 3,119 lines | The sheet’s visual system is difficult to reason about or reuse. |
| `src/styles/gear.scss` | 2,776 lines | High risk of selector overlap and regressions. |
| `item-handler.js` | 2,249 lines | Inventory policies and UI actions are tightly coupled. |

**Why this is inefficient:** Small features require understanding large, unrelated areas. Merge conflicts rise, unit testing is harder, and duplicate logic becomes likely.

**Improve it:** Split by feature—XP, skills, spells, tooltips, inventory movement, containers, equipment, and sheet lifecycle. Keep business rules in pure modules and keep DOM work in small controllers.

### P1 — Automatic unpause changes the world without consent

**Evidence:** A `ready` hook calls `game.togglePause()` whenever the world starts paused.

**Why this is risky:** Startup state may be intentional, and a non-GM client may not be allowed to perform the action. It can surprise a GM or generate a permission failure.

**Improve it:** Make this an off-by-default world setting and run it only for the active GM.

### P2 — The safety net covers only a small part of the product

**Evidence:** The 97 passing tests cover six focused modules. The 5,000-line character sheet, actor calculations, dice/chat flows, migrations, dialogs, combat hooks, and Foundry startup are largely untested.

**Why this matters:** The most complex and user-visible code has the least automated protection.

**Improve it:** First add tests for XP/level calculation, actor preparation, inventory moves, hook registration, and multi-sheet lifecycle cleanup. Add one smoke test that starts a mocked Foundry environment and renders two character sheets.

### P2 — “Strict TypeScript” provides little protection

**Evidence:** Almost all source is JavaScript; `tsconfig.json` does not enable `allowJs`/`checkJs`, and the only TypeScript file declares Foundry globals as `any`.

**Why this is inefficient:** The build looks type-checked, but common mistakes—wrong property names, missing values, incompatible APIs—can pass unnoticed.

**Improve it:** Either migrate feature-by-feature to TypeScript with Foundry types or enable `checkJs` gradually with JSDoc. Add ESLint and make `typecheck`, `lint`, `test`, and `build` required CI checks.

### P2 — Release metadata can drift

**Evidence:** `package.json` is version `1.0.0` while `system.json` is `1.0.12`; the manifest URL targets a mutable branch; source maps are emitted by the normal build; and there is no visible CI/release definition.

**Why this matters:** It is easy to publish the wrong code or an incomplete package, and hard to reproduce a release later.

**Improve it:** Keep one canonical version, generate the other manifest value, publish immutable tagged assets, omit production source maps unless deliberately desired, and automate validation/release packaging.

### P3 — Repository layout mixes product code and workshop material

**Evidence:** The root contains conversation/session logs, standalone HTML tools and previews, many one-off migration scripts, an `archive/` of debug experiments, LevelDB internals, `__pycache__`, and AppleDouble `._*` files. The working tree already contains many such untracked metadata files.

**Why this is inefficient:** It is unclear what ships, what is maintained, and what is safe to run. Platform metadata can also pollute compendiums and release archives.

**Improve it:** Separate maintained tools from historical material, ignore `._*` and `__pycache__/`, keep logs out of Git, and build releases from an explicit allowlist.

## Recommended directory layout

```text
osp-houserules/
├── src/
│   ├── foundry/             # Hooks, registration, settings, adapters
│   ├── actor/
│   │   ├── model/           # Pure actor/XP/stat rules
│   │   └── sheets/character/# Small feature controllers
│   ├── inventory/
│   │   ├── domain/          # Pure capacity, storage, banking rules
│   │   └── ui/              # Dialog and drag/drop integration
│   ├── combat/
│   ├── items/
│   └── styles/              # Components, features, then one entry file
├── templates/
│   ├── actors/character/    # Partials: header, bio, skills, combat, gear
│   ├── dialogs/
│   └── shared/
├── data/                    # Runtime reference data only
├── packs/                   # Built compendiums only
├── tools/                   # Maintained import/build utilities
├── migrations/              # Ordered, documented, repeatable migrations
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/                    # Developer and architecture notes
└── release/                 # Generated package; never hand-edited
```

Move `archive/`, logs, scratch HTML, and conversation records outside the product repository (or into a separately ignored `scratch/` directory). Keep LevelDB working files out of source control; generate compendium artifacts through a documented build step.

## Practical improvement sequence

1. **Fix packaging first:** create and validate a release ZIP containing every path referenced by `system.json`.
2. **Stabilize sheet lifecycle:** remove inline script, global selectors, `window.FormData` replacement, and orphaned timers/listeners.
3. **Extract business rules:** move inventory, XP, spell, and skill decisions into small pure modules with tests.
4. **Add quality gates:** lint, real type checking, tests, build, manifest validation, and release smoke test in CI.
5. **Clean the repository:** separate migrations/tools/archive, remove metadata pollution, and document what is shipped.

## What was verified

- `npm test`: **6 test files, 97 tests passed**.
- `npm run build`: **successful**; generated approximately 184 KB of CSS plus the JavaScript bundle.
- `npm audit --offline --omit=dev`: **0 known vulnerabilities** in the installed production tree.
- Static inspection covered the manifest, build configuration, TypeScript configuration, entry hooks, actor/character sheet, inventory/bank logic, templates, styles, scripts, data, compendiums, and repository hygiene.

## Bottom line

The project has solid pockets of well-tested domain logic and currently compiles cleanly. The highest-value work is not a rewrite: repair release packaging, contain the character sheet to its own window and lifecycle, then split the largest files behind tests. Those changes will remove the most likely installation failure, reduce UI bugs, and make future features substantially safer and faster to deliver.
