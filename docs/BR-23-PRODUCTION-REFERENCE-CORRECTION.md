# Production-reference correction

The original Citadel capture remains preserved at `/Users/paul/FoundryData/osp-test-captures/citadel-westford-20261003-778l8sif`. It must not be overwritten or used as evidence of visual production parity.

## Source identity gate — 2026-10-05

Read-only infrastructure inspection found two different services configured for a world with ID `westford`:

| Service | Configured hostname | Installed OSP | Saved world core | Saved world system version |
| --- | --- | --- | --- | --- |
| `foundryvtt_westford` | `westford.the-citadel.us` | 1.0.1 | 13.351 | 1.0.1 |
| `foundryvtt_narlington` | `narlington.the-citadel.us` | 1.0.12 | 14.365 | 2.1.0 |

The prior capture selected the Westford service by name. The current development repository is under Narlington's data root. World title alone cannot identify the intended production reference. Paul has been asked which production URL displays the desired customizations. That answer is required before selecting the source; neither source should be silently substituted.

Narlington's read-only mount inspection shows `/home/superpcm/foundry/narlington-data` at `/data`, plus shared `additional-assets`, `forgotten-adventures`, and `portraits` mounted under `/data/Data/assets`. These external mounts must be resolved as physical local copies of all required dependencies. Copying the host Data directory alone misses mounted content. Current system manifest version and saved world system version disagree; capture both rather than rewriting the reference to conceal that difference.

## Approved workflow and acceptance criteria

- AC-1: Confirm the user-selected URL, container, actual data path, world ID, runtime build, installed system, module configuration, active scenes, and relevant settings.
- AC-2: Independently verify original baseline hashes remain unchanged. Store a fresh source capture and provenance separately.
- AC-3: Create a faithful reference using the selected source's runtime, system, compendiums, settings and required assets. Verify scene/document payloads and asset paths before launch, then runtime rendering and UI. Record environment-only differences explicitly.
- AC-4: Only after reference fidelity passes, create an independent updated test copy and apply the current workspace build there. Preserve the reference and all custom compendiums in backups.
- AC-5: Independent QA must distinguish source fidelity, asset completeness, visual validation, and update behavior. No production-parity claim based only on file installation checks.
- AC-6: Ask Paul before changing or stopping production. Gygax may coordinate bounded correction and QA instructions in this task; that authorization does not authorize production changes.

If a fresh closed database capture requires stopping the selected production container, prepare the bounded capture/restart operation first and obtain explicit approval. Live LevelDB files must not be opened directly or represented as a consistent closed capture. Never launch the reference against production paths or shared production assets.

Paul confirmed `narlington.the-citadel.us` as the authoritative source. Read-only logs confirm Foundry 14.365, `/data`, and successful world launch. The source is `foundryvtt_narlington`, world ID `westford`, host Data root `/home/superpcm/foundry/narlington-data/Data`. Shared asset roots measure approximately 1.4 GB additional-assets, 11 GB forgotten-adventures, and 2.4 MB portraits; both hosts have sufficient available storage.

A bounded capture script is prepared locally at `/private/tmp/osp-narlington-reference-capture.py`. It will stop only Narlington, inventory the closed world/system/modules, create a separate archive, verify unchanged source hashes, and immediately restart Narlington in guaranteed cleanup with health checks. Shared asset copying and dependency checks occur after restart; they are not included in the shutdown interval. The old Westford capture remains untouched. Production settings must be recorded with credentials excluded from distributable evidence; local launch configuration will explicitly isolate network and filesystem paths.

Paul approved the bounded Narlington stop/capture/restart. It completed on 2026-10-05: closed capture SHA-256 `a9d96b367f0c56639c98d78db741d7635e99699abe6b1b8cbdd769ec92984870`, 633,559,040 bytes, 9,002 entries; closed-source inventories matched, and Narlington restarted healthy. Verified stop/restart interval was approximately 16 seconds. No production migration or configuration edit was performed by the capture script.

New private capture: `/Users/paul/FoundryData/osp-test-captures/citadel-narlington-reference-20261005`. `baseline.tar` and `baseline/Data` are preserved originals; `reference/` is an independent local runtime copy. Independent initial QA confirmed world/system/module equality, no reference symlinks, and the original Westford archive's unchanged checksum.

Complete shared asset roots were captured with production online. All 360,872 files were checked unchanged during archiving, transferred, and verified against checksums after local extraction. The read-only asset archive is 12,981,196,800 bytes, SHA-256 `16d1fb96ce45b57cc8641be71d8c41512fbf7d24696193572fb97b969400e9e9`. A separately verified legacy OSE default item image was also copied. All assets are physical local files.

Inspection opened only temporary database copies. It found 2,795 actor rows, 183 setting rows, two scenes, and eight enabled modules. `Testing Grounds` is active. Both scene backgrounds and custom font references resolve locally. Of 1,110 distinct world/document asset references, 928 resolve and 182 are missing in production itself; the reference preserves those existing defects. This is not a claim that every legacy image path works. External web links were inventoried separately.

The reference launched successfully on matching Foundry 14.365 at `http://127.0.0.1:30023/join`, with its production title and users preserved. Network/data-path/license-host differences are intentional local isolation. Existing account authentication is required; no password was reset. Authenticated visual comparison remains pending Paul sign-in.

A fresh update build was prepared solely in `/private/tmp/osp-narlington-updated-build` using captured source and identical-lockfile local dependencies. Build and release validation passed. Its JS/CSS hashes match captured Narlington's current runtime files exactly: the latest workspace build was already on this production source. Updates have not yet been installed into a second world; that step follows the reference fidelity gate. Minimal provenance and explicit acceptance limits are in `docs/qa/BR-23-NARLINGTON-REFERENCE/capture.json`.

## Correction completed — 2026-10-05

After Paul signed in, authenticated reference checks confirmed the grass scene background, production actor directory, module controls, customized Edvin Thue Bio sheet, Skills panel, and Gear panel rendered. The observed client-error log was empty. The reference screenshot was independently reviewed. This is an authenticated reference smoke check, supported by byte-exact captured source and asset checks, not a pixel comparison against a separate authenticated production browser.

The independent `updated/` copy was created from preserved `baseline/Data`, with separate APFS copy-on-write asset files and the verified legacy OSE image. Captured compendium packs were retained. The staged build's runtime files were installed only into `updated/Data/systems/osp-houserules`. Local configuration uses port 30024 and a separate Unix socket; reference remains on port 30023. Both normal account credentials and source world title remain unchanged. Source and reference were not modified by this installation.

Independent final QA passed all 1,351 staged/installed runtime hashes and all 360,872 updated asset hashes with zero mismatches. Canonical document comparison opened only temporary before/updated LevelDB copies: 25 collections, 3,356 rows, zero differences, including 2,795 actor rows, 17 scene rows including embedded records, and 183 setting rows. Both servers reached `Launching World | Complete` on matching Foundry 14.365. Updated login/player-list flow was observed; authenticated updated gameplay remains for user testing.

Use `http://127.0.0.1:30023/game` for the reference and `http://127.0.0.1:30024/join` for testing. Port 30022 is the earlier incorrect-source copy and must not be used as this correction's evidence. Final scoped evidence is in `docs/qa/BR-23-NARLINGTON-REFERENCE/final-qa.json`. Remote temporary capture archives were removed only after durable local copies and checksums were verified. The original Westford archive and the new Narlington baseline/asset archives remain preserved. Full BR-23 migration/rollback acceptance remains separate and open.
