# BR-25 — Closed-snapshot milestone 1

Status: original milestone 1 artifacts failed independent QA; R1 WAL correction independently passed; R2 SST correction awaits independent retest; actual-source capture blocked by active database locks. BR-25 remains open. Validation recorded here is implementer-reported, not release acceptance.

## Scope and authority

This increment supplies a standalone closed-snapshot/export/round-trip mechanism. It does not modify the release packager, original packs, catalogs, world data or the development overlay. Equipment catalogs remain authoritative under BR-07. Empty packs, catalog disagreements and overlay differences require reconciliation before release; successful database reopening does not establish rule fidelity or Foundry acceptance.

## Acceptance criteria

- AC-25-1: Capture fails closed for active source locks, unsupported platforms, unsafe/symlink inputs, missing inputs, source drift or corrupt databases. No accepted partial output is published.
- AC-25-2: Original databases are never opened by ClassicLevel, and their file hashes remain unchanged. Actual ClassicLevel lock contention is exercised.
- AC-25-3: The uniquely named output is atomically published with timestamp, source revision, dirty-workspace evidence, platform and dependency versions.
- AC-25-4: Every declared pack file and the specified catalog/system/template/dependency inputs is preserved and hashed. Database internals are retained rather than selectively removed.
- AC-25-5: Byte-key-sorted, base64 exports have stable content hashes; fresh rebuilt databases survive close/reopen with identical exported records.
- AC-25-6: Focused tests exercise capture, error paths, immutability, locking and round-trip behavior.
- AC-25-7: Documentation distinguishes this mechanism from full catalog reconciliation, installation and release acceptance.

## Reproduction

Stop every Foundry instance that opens the selected system's packs. Use the checkout and its locked dependencies; do not delete LOCK, WAL, manifest, SST/ldb or operational database files. A stale LOCK filename is normal: actual lock contention determines whether capture is permitted.

Run `rtk proxy node scripts/pack-snapshot.js --root "$PWD" --output "$PWD/release/br25-UNIQUE"`, choosing a fresh output name. Python 3 and a supported POSIX platform are required. The source capture uses existing LOCK files and never opens source databases through ClassicLevel. All pack locks are acquired before copying; hashes verify both the copied bytes and unchanged source inputs. Only disposable copies are opened for export. Windows support is pending and must fail closed. This increment supports Item packs at manifest paths `packs/<name>`; other layouts/types fail closed. Output inside the source checkout is permitted only under a new `release/` subdirectory. POSIX capture applies to cooperative LevelDB locking; source-file changes still fail the hash/inventory checks.

Canonical record hashes establish content reproducibility. Raw LevelDB directory bytes and archive bytes may differ after reopening or rebuilding; they are separate identities. A timestamped provenance report must not be treated as the canonical content hash.

## Handoff evidence

Raw evidence and provenance live under `docs/qa/BR-25-M1/`. The transferable QA bundle is `release/osp-br25-m1-qa-20261003.zip`; its full archive hash and timestamp are in `docs/qa/BR-25-M1/artifact-receipt.json`. This bundle contains synthetic QA data, the capture/export tool, its tests, locked dependency inputs and evidence. It supplies no campaign-pack or release acceptance.

The canonical pack/catalog identity is `cf5dcfbaae859c631228f8d93fed66470906686b767999d4b4a3571dac311c97`. The canonical pack export hash is `aa1a51a451dc71d0432f5ff85c5ec2c7925d082f86e96cf40f1d35507f5c0325`. Builds A and B used the same closed synthetic source under Node 22.22.3 and 24.21.0; C used A's saved snapshot inputs. All three identities match. Build A completed at `2026-10-03T04:29:33.704Z`. See `reproducibility.json` for exact timestamps and per-file hashes.

The real checkout capture was attempted under Node 24 and failed closed on `packs/armor`. A subsequent read-only lock probe found all three declared pack locks held (errno 35). No accepted output was published, no lock was bypassed and no server was stopped. All 26 original pack files matched the baseline hashes after the attempt. Their document counts remain unverified. The undeclared `westford-ammo` directory remains untouched. Read-only host inspection matched each LOCK inode to PID **3035** in container **foundryvtt_narlington** on **the-citadel**, image `ghcr.io/felddy/foundryvtt:14` (container init PID 2597). Raw kernel-lock and container metadata are retained in the QA evidence. Local lsof showed no owner; host lsof was incomplete because of Docker namespace permissions. No container was stopped or modified.

Minimum safe action: obtain approval for a quiet maintenance window and gracefully shut down that Foundry instance; verify lock release, capture the closed packs, then restart normally. A verified backup captured while the instance was closed is an alternative. Do not delete LOCK files or forcibly kill the process to obtain a snapshot. Exact running Foundry version is not established by the image's major-version tag. Actual source-versus-overlay reconciliation remains pending.

A Node 24 fixture attempt targeting the mounted release directory produced no output or staging progress and was interrupted (exit 130). Its cause is unproven. Both local-output builds succeeded, including Node 24. The interrupted attempt is retained in the evidence. The source is a dirty workspace on `main`, based on commit `327fbc73048223b9875045e6468fc53beca3de4a`; no release commit has been made. Existing unrelated edits are preserved. BR-19 still requires final release-commit verification.

The existing local project is OSP Houserules (`ef44a528-4804-48e7-a4b1-5a9d81735d9a`), at the current checkout. Paul clarified that the existing local OSP Houserules project folder is the project space. Readiness records and QA evidence remain there; no separate ChatGPT Space is needed or created. Earlier Page/Space discovery remains historical evidence, not a missing destination. No conflicting user instructions were found: this increment preserves approved rules, avoids destructive cleanup and stops before dependent work for independent QA.

## Immutable source handoff

A bounded, content-addressed source ZIP accompanies the QA fixture ZIP. Its entry manifest freezes the exact tool, tests, locked dependencies, maintained catalog inputs, source system/template manifests, approved rule authority and relevant readiness/build documents. It records every entry's SHA-256 and checks the selected originals again before publication. Source revision is the existing dirty `main` workspace; hashes identify uncommitted source bytes precisely.

This source snapshot is scoped to BR-25 milestone 1. Runtime modules, installed dependencies, large artwork and active real LevelDB directories are outside it. The separately supplied synthetic fixture provides the closed database input needed to execute the tests and reproduce the tool build. Full release-source and real-pack freezing remain later gates. Content-addressed archives are retained as read-only files; their checksums and entry manifests are the durable identities.

## Checks actually run

- All 11 focused tests passed on the final source: ordering and identical content identities, catalog changes affecting identity, unchanged originals, actual ClassicLevel lock contention, POSIX lock lifetime after hashing/copying, empty database round-trip, unsafe/existing outputs, missing/symlink/hardlink inputs, corrupt database rejection, changed/added source detection and simulated unsupported-platform rejection.
- Node syntax checks for the tool and tests, Python compilation for the helper/audit and repository quality lint passed.
- Three full synthetic fixture capture/export/rebuild/close/reopen runs succeeded. Separate read-only audit found no hash/order/uniqueness mismatch and confirmed two Item records.
- The internal verifier confirmed 21 copied input-file hashes, all manifest output hashes, required files, record counts and cleanup. This is implementer-team evidence; the requested independent QA acceptance remains pending.
- Initial focused validation found an empty-round-trip initialization defect and test-fixture errors. The fresh database now explicitly opens before close; lock fixtures avoid releasing a process's own lock by reading it through another descriptor. Final tests passed after these corrections.

No dependency reinstall, runtime build, full campaign regression suite, release ZIP build/install, Foundry launch or browser acceptance was performed for this milestone. Linux is allowed by the helper but was not executed; Windows was only simulated for fail-closed behavior. No forced round-trip mismatch injection was executed. Full catalog/schema and image checks were not executed on campaign packs because capture was refused.

## Reproduce the transferable QA bundle

Extract the ZIP into a new local directory and enter its top-level `BR25-M1-QA` directory. Install the exact lockfile with `rtk npm ci`; then run:

```sh
rtk npm test -- scripts/pack-snapshot.test.js --maxWorkers=2 --hookTimeout=30000
rtk proxy node scripts/pack-snapshot.js --root fixture --output /private/tmp/osp-br25-independent-UNIQUE
rtk proxy python3 evidence/verify-snapshot.py fixture
```

Choose a new output for each run. Compare its `snapshot-manifest.json` canonical identity with the value above. Python 3, a supported POSIX OS and ClassicLevel 3.0.0 are needed; Node 22.22.3 and 24.21.0 were exercised on macOS 27.0 arm64. The snapshot input is two deliberately synthetic Item documents, a two-entry gear catalog, empty other equipment catalogs and an empty spells object. All input bytes are bundled. The fixture references Foundry's core `icons/svg/item-bag.svg`; no UI/image check was made. Full runtime assets, campaign world data and licensed Foundry binaries are outside this tool-test bundle. Npm 10.9.8 and Vitest 3.2.7 were used.

Tool source files are new uncommitted files on the existing dirty `main` workspace. Their exact hashes are in the manifest and handoff. Raw `git-status-before.txt` preserves the existing changed/deleted/untracked files; the evidence bundle includes no assertion that the checkout is clean. Synthetic fixture Git provenance is correctly unavailable because its source is outside a Git checkout; tool revision is the separately recorded repository revision.

## Pending gates

Full document/schema/image/cost/weight/tag/armor/damage/range/spell-reference comparison to approved catalogs; checkout versus development-overlay reconciliation; exact packaged-database validation; integration into the release packager; clean installation; migrations and rollback; release commit/artifact acceptance. Live BR-21/22/30 remain blocked by browser-policy verification. No browser-policy workaround, production deployment, publishing, merging or release-gate completion is authorized by this milestone.

## R1 corrective handoff — WAL corruption

Independent QA rejected the original sealed source/QA archives (`af40be68fe43663f58b15afb50bc76f1b9268d5ce361527dc1fed8b4d15103a6` / `0a3fff34316664b8af24207898e2a3982e4dec62672e618e2fcbc6f254c5ac85`). Flipping byte 465 of the 466-byte synthetic WAL caused native recovery to silently drop a record; exporting and round-tripping the reduced set falsely passed. The original archives and reports remain preserved.

R1 validates captured numeric WAL files and MANIFEST logs before opening a disposable database: CRC32C, block boundaries, fragmentation and WAL write-batch structure must pass. Native recovery's current diagnostic log is checked for ignored corruption as an additional guard. This is a bounded correction of the independently reproduced WAL defect, not proof that every possible database corruption is detected. Independent SST/ldb block checksum validation remains pending; ClassicLevel's exposed read options do not enable strict checksum verification. Full AC-25-1 and BR-25 acceptance remain open.

New evidence, exact content-addressed artifact receipts, source-entry hashes and reproducible commands are under `docs/qa/BR-25-M1-R1/`. Run both `scripts/pack-snapshot.test.js` and `scripts/leveldb-log-integrity.test.js` in the new artifact. The retained independent reproducer is also included. No production files or real pack files were mutated, and no Foundry instance was stopped. Previous milestone checks above are historical results for the old artifact; use the R1 report for current checks and limitations.

## R2 corrective handoff — SST block checksums

Independent QA passed the exact R1 WAL correction (source `a7f0865b292bf353eb2771aabb1ea40c183c919b9fda5eaefd92dfa53663b3cd`, QA `ea6732720891baef66cecfcbf88ac003f48d04756f1c000e60f0d6c52f550e5f`). That result is distinct from full AC-25-1 and BR-25 acceptance. The same QA independently proved the documented SST gap: an equal-length uncompressed SST payload edit with a stale CRC was published. Evidence is retained under `docs/qa/BR-25-M1-R1-independent/`.

R2 adds independent SST/ldb physical block validation before native opening. Footer handles, compression, stored-block CRC32C, index/meta/data structure and complete block coverage must pass. Uncompressed and Snappy blocks are supported within explicit resource limits. Checksums address accidental corruption; they do not provide malicious-tamper resistance or establish catalog fidelity. The R1 statements above are historical limitations of R1, not a claim about R2 coverage.

R2 evidence, reproducible commands, source-entry hashes and new content-addressed artifact receipts are under `docs/qa/BR-25-M1-R2/`. Independent QA must retest the new exact artifacts. Full BR-25 remains open: real closed-pack capture, catalog/schema/image reconciliation, overlay comparison, exact release packaging/install and Foundry acceptance are still pending. Original failed and R1 artifacts/evidence remain untouched.
