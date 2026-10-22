# BR-23 — Offline migration and rollback

Status: offline synthetic increment passes 21 focused regressions and internal verifier review; independent review accepted by user report, with unspecified formatting issues noted. Full BR-23 is open.

## Authorized boundary

This increment reads plain JSON fixture exports and writes new copies. It does not connect to Foundry, open native world/compendium databases, register runtime migrations, or modify production files. Paul authorized subsequent bounded Production Readiness milestones and QA fix/retest instructions from Gygax to this task. Production data changes, Foundry shutdown, publishing, deployment and merge still require Paul's approval.

No representative historical campaign export has been validated in this increment. Synthetic fixtures prove transform and rollback behavior; they do not prove native Foundry import, database rollback, or live campaign readiness. Native database capture depends on the closed-source and release gates. Do not run the older console macros against the live campaign as part of this procedure.

## Input contract

The offline envelope uses `format: osp-br23-world-export-v1`, an integer `migrationVersion`, an ordered `migrationHistory`, source provenance, world `items`, `actors` with embedded items and flags, `settings` keyed by full setting name, exported `compendiums`, and an `assetIndex` of explicitly available target image paths. Unknown fields are retained. IDs remain in their original collection scopes; record creation, deletion and rekeying are outside this increment.

Compendiums contain exported plain documents and pack identity. This is not a LevelDB adapter. Bank/storehouse snapshots retain entry IDs, quantities, itemData and audit/receipt data. The asset index is a fixture assertion; actual installation asset validation remains a separate gate.

## Ordered transforms

| ID | Scope | Preservation rule |
| --- | --- | --- |
| BR23-001-unit-weight | Explicit pound-based legacy item weight | Copy to missing unitWeight; existing modern values are retained |
| BR23-002-item-defaults | Missing physical fields, lashing, clothing and containers | Current catalogs and template defaults; existing valid custom values retained |
| BR23-003-images | Eligible OSP full-image paths | Only indexed thumbnail targets; external/custom images retained |
| BR23-004-progression | Missing character progression baseline | Runtime level derived from class, XP and race; no historical HP, XP or skill awards |
| BR23-005-ledgers | Missing bank/storehouse structures | Registered empty defaults; existing balances, entries, logs and receipts retained |

The same transforms apply to world, embedded and exported compendium items. They do not execute the historical weight-correction maps: BR-07's current catalogs supply authoritative defaults, while discrepancies are reported for review. Ambiguous legacy names/types, old currency conventions, destructive scabbard conversion, malformed container data, orphan/cyclic placements, missing image targets, unknown versions and unresolved transaction journals must not be silently repaired.

Migration IDs and the version marker are committed only after all transforms and validation pass. Repeat runs must produce no additional changes. This output marker belongs to the offline envelope; it is not a Foundry world setting and does not alter the existing active-GM initiative or progression migrations.

## Procedure

1. Keep the original export immutable. Compute and retain its SHA-256 and its source provenance.
2. Run dry-run against the fixture. Review ordered changes, ambiguities and before/after counts, quantities, references, HP, XP, balances and flags. Dry-run writes no migrated file.
3. Apply only to a new output directory. The result must contain original backup bytes, migrated world JSON and a hash/provenance manifest. Blocking issues must produce no successful output.
4. Apply again to the migrated copy, in another fresh output directory. Require no further changes and stable document content.
5. Restore the verified backup into a third fresh output directory. Require the original byte hash and original summaries. Never overwrite an input or an existing output.
6. Preserve all failed runs and evidence. Obtain independent review before any representative-world or native Foundry validation.

The CLI usage, exact executed commands and verification reports will be recorded under `docs/qa/BR-23-M1/`. Fixture tests cover both successful transforms and failures; reports distinguish internal verification from independent QA.

Use absolute paths and fresh output directories whose parents already exist:

```text
node scripts/br23-world-migrate.js dry-run --input /absolute/path/fixture.json
node scripts/br23-world-migrate.js apply-copy --input /absolute/path/fixture.json --output /absolute/path/new-copy
node scripts/br23-world-migrate.js restore --backup /absolute/path/new-copy --output /absolute/path/new-restore
```

The copy contains `backup.json`, `world.json`, and `manifest.json`. Restore verifies these files and writes the original bytes to `restored.json`. The manifest records the source and output hashes, version IDs, individual document and account comparisons, and hashes of the catalogs, template, migration implementation and dependency lockfile. Checksums detect accidental corruption; the manifest is not a signed authenticity certificate.

Character baseline creation uses the runtime's class/XP/race progression calculation. Existing progression state, including the legacy system field, remains intact. A conflicting last-known level without existing state blocks baseline creation for review. No HP, XP, skill points, quantities or currency are inferred. Unknown physical items receive only safe schema defaults; unknown weight and capacity are retained for review rather than invented.

## Remaining acceptance

Representative old-world provenance and reconciliation; real closed backups; native Foundry import and ordered runtime integration; compendium database upgrade/restore; actual assets; permissions and interrupted network operations; exact release-version upgrade and rollback. Production execution remains a separately approved action.

## Executed evidence — 2026-10-03

The 21 regressions passed in a byte-matched local copy with copied locked test dependencies. This was not a clean dependency installation or a full system suite. Separate CLI executions passed dry-run, copy-apply, repeat, restore, and corrupt-backup rejection. Original, backup, and restored SHA-256 all equal `1b67fe050379a8da1fcae2ce3580effc799f08ff13233d64d8942c163e04d6d3`; the repeated world bytes also match the first migrated output. The source remained unchanged, the repeat had zero changes, and corrupt restore created no output.

An internal verifier independently reran the 21 tests, checked hashes and the ordered version markers, and accepted the bounded offline increment. Evidence, failed initial runs, fixture outputs, and receipts are retained under `docs/qa/BR-23-M1/`. New content-addressed source and QA archives are prepared for external independent review. No production data was changed and no runtime migration was registered.

## Independent review follow-up

Paul reports the independent review is complete and that all looks good apart from formatting issues. This accepts the bounded offline increment; it does not close the remaining representative-world, native rollback or runtime integration gates. Formatting details have not been specified. The review is recorded separately in `docs/qa/BR-23-M1/independent-review.json`, linked to the original source and QA checksums. Published local archives and their capture manifests remain unchanged.
