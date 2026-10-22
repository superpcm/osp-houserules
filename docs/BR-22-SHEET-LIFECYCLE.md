# BR-22 — Sheet isolation, persistence and usability

Status: **in progress; live usability acceptance pending**. BR-21 remains open. No browser-policy workaround was attempted.

## Corrected behavior

Character-sheet submissions now capture their form/editor content and queue per sheet instance. This avoids Foundry v14's overlapping-submission guard dropping a second save. Explicit `preventRender` requests are honored instead of being replaced by the race-change check and then followed by an unconditional sheet render. Portrait synchronization and ordinary submit rendering remain intact.

Closing an editable character sheet submits its latest form content, including active ProseMirror fields, after earlier queued writes and before teardown. Foundry v14 normally logs `_updateObject` failures without rejecting the submit promise; the sheet now carries that failure back to editor/close callers. A failed close leaves the handlers and editors intact, reports the error, and permits retry. Read-only submissions and collapse controls do not write actor data. Read-only sheets initialize scoped tabs.

Character tooltip, tab and font timers are tracked and cleared on rerender/close. Bio and editor focus handlers use scoped namespaces. Prior handlers are destroyed when activating a new sheet root, including transitions to read-only display.

Item sheets own their tooltip DOM nodes, listener namespaces and timers, cleaning them up on rerender/close. Background font-sizing handlers cancel delayed work, remove only their own change listeners, and remove measurement nodes in `finally`. Item cards, used by normal physical inventory, remove drag listeners on close and reject asynchronous canvas renders that finish after close or replacement.

Bank ledger hooks already had proper close cleanup. Added tests verify two actor ledgers and party-account refreshes remain isolated across close/reopen cycles; banking behavior was not changed.

## Automated evidence

| Criterion | Evidence | Limit |
| --- | --- | --- |
| AC-1 Independent character saves | Two sheet instances; one save waiting while the other completes | Foundry base submission contract modeled in a fixture |
| AC-2 Safe close and persistence | Rapid editor saves retain latest data; close waits and flushes all narrative fields | Actual browser blur and reload remain pending |
| AC-3 Save failure and retry | Swallowed v14 update error surfaced; failed close preserves handlers/editors; retry succeeds | No live network outage simulated |
| AC-4 Read-only and render behavior | No read-only writes; preventRender honored; normal render and portrait sync preserved | Player visual presentation remains pending |
| AC-5 Character lifecycle cleanup | Owned timers/disposers canceled without affecting a second sheet | Native DOM behavior still needs live acceptance |
| AC-6 Item windows | Instance-owned tooltips; reactivation/close cleanup; drag close and late canvas resolution | Appearance and browser dragging remain pending |
| AC-7 Background sizing | Delayed work canceled; measuring nodes cleaned up | Font metrics not established by fake DOM |
| AC-8 Bank windows | Actor/account hooks isolated and removed through repeated cycles | Live multi-window integration remains pending |

Tests: `character-sheet.lifecycle.test.js`, `item-card-dialog.lifecycle.test.js`, `item-sheet-lifecycle.test.js`, `background-handler.test.js`, and `bank-ledger-lifecycle.test.js`. Build, repository lint, TypeScript checks and release-manifest validation passed on 2026-10-02. Full suite: **1,319 tests passed across 71 files**, including 20 new lifecycle tests (`npm test -- --maxWorkers=2 --hookTimeout=30000`). Independent source review also passed; live browser acceptance remains pending.

## Remaining live acceptance

Use the isolated BR-21 world once ordinary browser-tool access is restored. Open two different characters, a physical item card, an item sheet, and both personal/party bank windows together. Repeat open/render/close, including closing during a hover timer, drag, and save. Check each action affects only its own window and remains single after repeated cycles.

Edit appearance/goals and Background, History and Notes rich text. Blur, close without first blurring, reopen, and reload. Check latest content and formatting, failed-save recovery, and player read-only behavior.

At normal browser zoom on a laptop-sized viewport, verify long names, large numbers, scrolling, keyboard activation/focus, tooltips, loaded and missing fonts, and missing-image fallback. Preserve the existing design; any visual fixes need observed evidence. These results cannot be inferred from Node tests, source inspection, or server startup.
