# BR-23 — Citadel Westford closed capture

Paul selected the current Citadel Westford instance as the representative test source and explicitly approved stopping only Westford, capturing/verifying a copy, and immediate restart. The capture completed on 2026-10-03 local time. Westford restarted healthy; Narlington and Greyhawk remain healthy.

The selected source is `/home/superpcm/foundry/westford-data/Data` in `foundryvtt_westford`, image `ghcr.io/felddy/foundryvtt:14`. The saved world manifest reports core 13.351, and installed OSP system reports 1.0.1. The image tag does not establish an exact Foundry build; matching application-version verification remains part of the test setup.

Captured world, installed system and installed modules total 3,205 inventory entries. Before/after closed-source inventories match. The transferred archive is 446,054,400 bytes with SHA-256 `9164c29161cd4da8b54c4abb8710bb8bd648a217b9833933a53af54c10858ed1`. Extracted baseline and independent working copy match every captured entry. Baseline files and archive are read-only. The generated remote temporary archive was transferred and removed; the durable local original remains.

Capture location: `/Users/paul/FoundryData/osp-test-captures/citadel-westford-20261003-778l8sif`. `baseline.tar` and `baseline/` are immutable originals; `working/` is a separate test copy that has not been launched or migrated. Private campaign data remains outside the distributable source/QA archives. Shared external assets and npm node_modules were excluded; asset dependencies must be resolved before visual testing. Foundry application binaries and credentials are outside this capture.

This proves a closed byte-consistent capture, not a migrated-world or native rollback result. The next work is baseline application/build verification, source reconciliation, native export into the offline migration contract, copy-only migration, idempotence and native restore tests. The existing browser still shows the earlier isolated development copy, not this fresh Citadel capture.

Minimal provenance and health evidence are recorded in `docs/qa/BR-23-CITADEL-WESTFORD/receipt.json`; full inventory and immutable bytes are stored privately at the capture location. Full BR-23 remains open.

Independent read-only verifier: PASS. All 2,908 payload files matched in the archive, baseline and working copy, with zero unsafe paths, symlinks, hardlinks, mismatches, missing files or extra payload files. Baseline and working files share no inodes. See `docs/qa/BR-23-CITADEL-WESTFORD/internal-verifier.json`.

## Authorized local test deployment — 2026-10-04

Following Paul's approval to deploy the copy for testing, the independent working copy is running at `http://127.0.0.1:30022/join`, titled **Citadel Westford — Local Test Copy**. The earlier development instance on port 30021 remains separate. Citadel production and the immutable baseline were not changed by this deployment.

Production logs established the matching application as Foundry 14.365. The local instance uses that exact vendor build, Node 24, and the captured OSP system 1.0.1. Its TCP listener binds only to 127.0.0.1 and forwards to a local Unix socket. The login background is a physical local asset copy; full interactive scene and asset coverage remains unverified.

After Paul authenticated to setup, Foundry's normal launch flow created a backup and migrated only the disposable working world from saved core 13.351 to 14.365. Startup logs reached `Launching World | Complete`; the browser displayed the titled world login form with Gamemaster selection and Join Game Session. The launch emitted duplicate core-setting query warnings. Foundry also warned that the captured system is not verified for core 14 and disabled modules and active scenes during its generation migration. Gameplay compatibility and module re-enablement require subsequent testing.

This is native Foundry launch evidence, not acceptance of the BR-23 offline migration contract, idempotence, or rollback. BR-23 remains open. The server log is private at `working/startup.log` within the capture location. The temporary application and launcher must remain available while the server runs; this is a local test session, not a persistent production service.

## Current workspace build installed — 2026-10-04

Paul reported missing system customizations and approved stopping/restarting only the local test server. The initial deployment had retained captured system 1.0.1 instead of installing the current workspace build. This was corrected by building the current workspace (production build and release validation passed), backing up the stopped working copy to private `pre-current-build-20261004.tar`, and installing system 1.0.12.

A single read-only archive transfer from the same mounted repository host avoided slow per-file NFS scans. The installer checked 1,376 source files; `system.json` intentionally adds the captured `westford-ammo` pack declaration. All six custom Ammo pack files matched their pre-install hashes before restart. The current standard weapons, armor and gear packs replaced the captured standard packs; the backup retains the prior versions. The private `current-build-deployment.json` records expected hashes and retained pack provenance.

The restarted local instance remains on Foundry 14.365 and port 30022. Its latest startup log reports successful world migration to system 1.0.12 and `Launching World | Complete`. Read-only inspection of a temporary settings copy found the original `core.moduleConfiguration` document value was `{}`, so there were no enabled modules to restore. Citadel production and immutable capture were not changed. Browser reload was blocked by browser URL security policy; refreshed interface and gameplay verification require manual browser refresh and subsequent testing. This does not complete BR-23's offline migration/rollback acceptance.

Independent deployment verification passed: all 1,350 static files outside compendium databases and the intentional manifest addition match the staged source hashes; the baseline archive hash remains unchanged; startup completed without fatal errors. A payload comparison opened only temporary before/after Ammo database copies and found both empty (zero document keys, zero differences). Its operational log and manifest files changed during startup, as expected for LevelDB. Preservation therefore refers to the captured empty compendium, not evidence that it contained additional campaign entries.
