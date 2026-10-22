# Data migrations

Move one-time world/data upgrades here as they are revisited. Name them in execution order, document
the affected schema, make repeat runs safe, and add a fixture-based test before use on a live world.
Existing scripts remain in place until their callers and operational notes can be migrated safely.

## BR-14 initiative defaults (version 1)

`src/module/combat/initiative-migration.js` runs from the active GM's ready hook. It sets world initiative to `individual` and round behavior to `reroll`, then writes the hidden `initiativeRulesVersion` marker last. New worlds register the same defaults. Repeat loads with version 1 preserve subsequent intentional settings, including group/keep/reset alternatives. A failed pre-marker write is retried on the next load. The migration does not alter existing combatant rolls or actor/item data. Fixture tests cover the one-time switch, repeat safety, active-GM restriction and interrupted writes.

## BR-23 offline fixture procedure

The bounded offline upgrade/backup/rollback increment is documented in `docs/BR-23-OFFLINE-MIGRATIONS.md`. It operates on plain JSON export fixtures and separate output directories. Legacy console macros remain historical tools and are not invoked by this procedure. Runtime registration, native database migration and production use are separate gates; no live campaign should be the first test.
