# Native character-sheet pop-out — 2026-10-20

Status: complete. Native character-sheet pop-out is active. The user verified Detach, tab navigation and Attach with PopOut disabled. The old module was then preserved outside the active Data directory and Foundry restarted successfully.

## Recovery snapshot

Complete backup: `/Users/paul/FoundryData/backups/osp-before-native-popout-20261020-153618`.

`RESTORE.md` records the restore procedure and `manifest.json` records the original paths. The snapshot includes the entire workspace (including Git state, ignored and untracked files), the complete active Foundry data directory, and the Foundry 14.367 runtime. Foundry was stopped before capture. Every archived file was read back and hash-checked, and an independent verifier checked the three archive SHA-256 values and extracted representative world, configuration and runtime files.

- Workspace: 14,644 archive entries.
- Live Foundry data: 376,206 archive entries.
- Foundry runtime: 21,820 archive entries.

The live system and workspace differed before this migration. Each is backed up independently; restore each to its own manifest path. The backup contains the PopOut module and its world activation settings.

## Implementation

`OspActorSheetCharacter` now extends a native `HandlebarsApplicationMixin(ActorSheetV2)` base. The existing journal remains a single template part with an inner form, manual tabs, and scroll restoration. Foundry supplies native Detach/Attach controls through its window menu.

The migration preserves the serialized form queue and close-time saves, reads live native ProseMirror values, and leaves the native editor save event uncanceled so text survives disconnection and adoption into another window. Editor submissions avoid a form rebuild. Inventory placement and transaction logic remain in the existing sheet methods, with native drag/drop ownership and the standard drop hook.

Language, inventory and spell-choice prompts use native child dialogs. Window listeners follow the sheet's owner window, and portrait/language/sizing helpers use the appropriate document. Older auxiliary item-card applications continue to open in the main workspace.

The local live bundle was patched by specific classes and methods. Its independent journal artwork, dimensions, portrait rotation/plain right-click controls and layout adjustments were retained. Its entire generated bundle, template or stylesheet was not replaced with the workspace build.

## Verification

- Before changes: 112 focused lifecycle, inventory, language, background, talent and spell tests passed.
- Final full test run: 1,522 passed; 6 failed; 0 pending. All six failures are in the BR23 catalog/migration tests and also fail in the extracted pre-migration backup, with the same test names and duplicate Staff catalog error.
- Final focused run: 117 passed across native lifecycle/editor/dialog, sheet close/queue, inventory drop, language, portrait, spell-choice and progression tests.
- Build, lint, type checking, release validation and whitespace checks passed, including independent review against installed official v14.367 source.
- Live journal layout and all eight chapters were checked after reloading the final scoped patch. Native header icons render correctly with the engine's Font Awesome variable; character name remains centered.
- A temporary Notes entry persisted after close/reopen, then was cleared with normal keyboard editing and remained empty after close/reopen and a full page reload. Browser automation's synthetic empty `fill` did not reliably update ProseMirror; keyboard editing did. No test text remains.
- Two native character sheets opened together and one closed independently. A native Add Language dialog opened and canceled without changing languages.
- Native Detach opened a separate window. The in-app browser does not expose that popup, and Chrome refused automated clicks after the user dismissed its extension panel. The user performed the native-only check and explicitly confirmed: "Yes, it displays and reattaches correctly." The reattached sheet was subsequently observed in the main game.
- PopOut was unchecked in Module Management, saved, and the world reloaded. The module's extra header icon is absent while native Detach remains available. Installed module manifests contain no dependency on PopOut.
- Screenshot of the native window menu with PopOut disabled: `output/qa/native-popout-only-controls-20261020.png`.
- The inactive `Data/modules/popout` directory was moved to the backup's `removed-modules/popout`; all 18 preserved entries were recorded and regular-file hashes rechecked. The original three backup archives remain unchanged.
- After a graceful server restart, Module Management showed 26 installed modules and 7 active modules (previously 27 installed and 8 active). PopOut was absent from the installed module list.
- Fung Telt reopened successfully after the restart, retaining the centered name, journal layout and native Detach control. Final screenshot: `output/qa/native-popout-complete-20261020.png`. Module removal screenshot: `output/qa/native-popout-module-removed-20261020.png`.
- Independent final verification confirmed the original module directory is absent, rehashed all 18 preserved module files, and checked the recovery guide and the documented coverage limits.

## Live checks and coverage limits

Completed live checks: journal layout and centered name; all eight chapters; keyboard Notes edit, clearing and close/reopen persistence; two sheets open at once; native Add Language dialog cancellation; native Detach and Attach with tab navigation (user verified); module deactivation, archival and clean restart.

Detailed inventory moves, portrait manipulation, spell mutations, read-only access and external actor/item updates were not all manually repeated inside the detached window. Relevant transaction, ownership, helper host-switching, spell-choice, lifecycle and editor behavior is covered by the focused automated tests. These limits do not replace the user-confirmed basic detached-window check.

PopOut is removed from the active Foundry installation and retained in the verified backup. No character/world migration or bulk actor data rewrite is required by the native sheet conversion.
