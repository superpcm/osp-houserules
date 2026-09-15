# OSP House Rules architecture

## Boundaries

- `src/module/actor`, `combat`, and `inventory` contain game rules. Prefer pure functions for new rules.
- Sheet classes coordinate Foundry documents and feature handlers; they should not own unrelated rules.
- `templates/` contains presentation only. Do not add inline scripts or global DOM selectors.
- `scripts/` contains maintained build/import utilities. One-time data upgrades belong in `migrations/`.
- `archive/`, local logs, and scratch previews are historical development material and are never packaged.

## Character sheet lifecycle

Every handler receives the current sheet root, binds only within that root, and removes its listeners,
observers, and timers from `destroy()`. Derived values belong in the actor model or a pure domain module,
not in template scripts.

## Release contract

`npm run package:release` is the only supported packaging path. It builds production assets and creates
an allowlisted ZIP in `release/`. `npm run check` must pass before publishing the ZIP as the immutable
GitHub release asset referenced by `system.json`.
