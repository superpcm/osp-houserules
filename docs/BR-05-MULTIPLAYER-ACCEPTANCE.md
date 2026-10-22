# BR-05 multiplayer acceptance

Status: live Foundry multi-client acceptance completed on September 30, 2026; socket transport defect corrected and rechecked.

## Execution evidence — September 30, 2026

The direct runner completed successfully from the mounted checkout:

```sh
rtk node node_modules/vitest/vitest.mjs run src/module/inventory/inventory-authority.test.js --pool=forks --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Initial result: **12 passed**, Vitest 3.2.7, 59.02 seconds total, 41 ms of test execution. After the live transport correction, the authority suite passed **13 tests** in 66.62 seconds (30 ms test execution). These are mocked runtime tests, not live multiplayer evidence. The earlier “Vitest hangs; unverified” report is superseded.

A disposable Foundry v14.367 instance was prepared at `/private/tmp/osp-br05-rehearsal`, world `br05-rehearsal`, port 30005, using Node 24.21.0. No campaign actors, settings, users, or packs were copied. The license owner completed EULA/license activation and the isolated world launched. No agreement was accepted by the agent.

Initial live transport reproduction: two same-profile GM tabs and Owner A were connected. At 16:17:32 UTC, Owner A submitted two personal deposits with operation ID `br05-double`. Both returned the same acknowledgment timeout at 16:17:42 UTC. Both client snapshots still showed 40 gold and no receipts. The authority used an unsupported `system.osp-houserules-inventory-authority` channel and the manifest omitted `socket: true`. Foundry only relays an enabled system’s `system.<id>` channel ([official system development documentation](https://foundryvtt.com/article/system-development/)). A focused correction enables relay and identifies inventory messages within `system.osp-houserules`; post-fix evidence is recorded below.

Chrome automation was blocked by an extension popup. The rehearsal continued in the in-app browser using independent cookie origins: `localhost` for two same-profile GM tabs, `127.0.0.1` for Owner A, and IPv6 `[::1]` for Owner B and subsequently the successor GM. All clients reported secure context and Web Locks support. No campaign data was used.

The disposable adapter was bundled with the production imports into one module graph, then driven through its visible UI buttons. It called the real authority/domain exports against real Foundry documents, settings, sockets, and browser Web Locks. Failure injection wrapped only test-world document/settings/socket methods. This tests live service behavior; it does not claim an exhaustive visual audit of each production dialog.

The build output is isolated under that data directory. Launch command:

```sh
rtk /opt/homebrew/opt/node@24/bin/node /Users/paul/Applications/FoundryVTT-Node-14.367/main.js --dataPath=/private/tmp/osp-br05-rehearsal --port=30005 --world=br05-rehearsal --noupnp --noupdate
```

Source identity at closeout (SHA-256):

- Authority: `4287396e71118be326269b774a54a0c6221195cea8c6d6bc5028538794bb4209`
- Authority tests: `cf5af190d90c09432829e5809f8547ca5b14df0de0ea11457b7ba5bee1fe8c2e`
- Manifest: `d6aef8c8a49463c1f9b9526a143d4d5afa3fe3f02b02879207bd4b180a01b312`

## Fixture and client setup

Use this disposable world only. Sign in as one GM, two distinct player users, and a second GM for handover. Grant both players OWNER permission on the same test character and mark that character as a party member. Use two tabs in the first GM’s browser profile, and distinct sessions/profiles for the two players. Record browser versions and system build identity.

The actual fixture was seeded with 40 gold coins, a stack of 20 ordinary gear items, one suitable empty container, and empty personal/party accounts. Record inventory quantities, currency, account item quantities, audit logs, and the `inventoryOperationReceipts` setting before each case. Use fresh fixtures between cases rather than deleting receipts or pending journals.

Browser authority requires Web Locks in a secure context. Keep each active GM signed in through one browser profile/device. Same-profile GM tabs share the authority lease; different profiles/devices do not share browser locks. Handover may involve a different GM profile after the old GM becomes inactive.

## Acceptance matrix

| Criterion | Exercise | Required evidence | Live result |
|---|---|---|---|
| AC-1 | Owner A deposits 5 gold personally while owner B deposits 7 to the party; overlap a GM ledger item grant and personal/party gear deposits | Gold changes by −12 inventory, +5 personal, +7 party; all successful item grants preserved; audit requester IDs correct | Passed; see records below |
| AC-1 | Repeat mixed operations with two tabs logged in as the same GM | Only one tab executes; follower receives the result; no missing/duplicated quantities | Passed; see records below |
| AC-2 | Both owners withdraw 2 from a shared gear entry containing 3 | One withdrawal succeeds, the other fails; shared quantity 1 and inventory increase 2 | Passed; see records below |
| AC-2 | Double-click a deposit/withdrawal; replay its exact request ID multiple times | One value movement and one completed receipt; recorded result returned on replay | Passed; see records below |
| AC-2 | Delay a GM result beyond 10 seconds, retry while acknowledgment is delayed, then deliver the old result | Timeout retains the ID; retry resolves the recorded result; one movement; old result does not resolve a different operation | Passed; see records below |
| AC-2 | Reload/disconnect the requester after sending and before acknowledgment; reconnect and retry | Session intent ID survives; committed result replayed, or a pending operation remains blocked for recovery | Passed; see records below |
| AC-2 | Reuse an operation ID with a changed payload/requester | Rejected without domain writes; original successful transaction preserved | Passed; see records below |
| AC-3 | Handover GM between transaction writes and during compensation | Former GM stops before its next write; new authority sees the receipt and blocks new edits; recovery confirms committed/restored state | Passed; see records below |
| AC-3 | Repeat after a lost completion receipt and after a cancelled operation followed by a successful one | Recovery/replay never repeats value movement or overwrites the later successful transaction | Passed; see records below |
| AC-3 | Introduce an endpoint state matching neither snapshot | Recovery refuses to overwrite it; pending evidence remains available | Passed; see records below |

## Live records (UTC, September 30)

Fixture: `Actor.fWc4QcQ97JYsjaco`, 40 gold, 20 rope, one empty chest, initially empty accounts. GM `IBLrI0cYTcUPMnvZ`; Owner A `PcgCeAmQwZAGnz72`; Owner B `a0jouVFVyscbOPlc`; successor GM `h5T7vBjhDpszE189`. Cases reused this disposable fixture, preserving all receipts; totals below account for earlier successful cases.

| Case | Actual observations |
|---|---|
| Transport / double click | Pre-fix request at 16:17:32 timed out with gold 40 / no receipt. Post-fix at 16:23:44 both calls for `br05-double` succeeded with the identical audit timestamp, personal gold 1, and only one movement. |
| Replay / reuse | At 16:24:46 exact replay returned the stored success. Quantity 2 reuse and a GM requester reuse were rejected as another request. Original receipt and movement remained intact. |
| Delayed ACK / reload | `4SlTLWei8Ht1E5hQ` committed with inventory 38, bank 1, party 1, completed receipt, null journal. Player timed out at 16:25:21; after reload, retry at 16:25:59 returned that ID’s recorded success. |
| Cancelled replay / later success | `br05-cancelled` rejected the ledger write and compensated. `br05-later` then deposited 2. Replaying cancellation at 16:26:30 returned the original failure, leaving inventory 36 / bank 3 / party 1. Both receipts remained completed. |
| Receipt loss / unknown state | `br05-receipt-loss` applied gold 35 / bank 4, but completion receipt write was rejected at 16:26:50. New `br05-fresh` work was blocked. Test drift set gold 45; recovery at 16:27:31 refused and retained the started receipt without overwriting 45. Restoring the recorded before quantity 36 permitted snapshot recovery, restoring bank 3. A later fresh deposit succeeded; replay of the cancelled receipt preserved it. |
| Mixed owner / GM overlap | All five requests armed for 16:29:13 succeeded: IDs `br05-overlap-A-bank`, `br05-overlap-B-party`, `br05-overlap-GM-grant`, `br05-overlap-A-locker`, `br05-overlap-B-store`. Snapshot: inventory gold 23 / personal 9 / party 8 = 40; rope inventory 15 / personal 2 / party 3 = 20. GM gem grant retained; audit IDs identify each requester. Both same-GM tabs were connected and the follower’s GM request received its result. |
| Shared depletion race | Both owners armed for 16:30:21, IDs `br05-withdraw-<userId>`, requested 2 of shared quantity 3. Owner A succeeded; Owner B failed because only 1 remained. Inventory gained exactly 2. |
| Handover after domain write | `br05-handover` started 16:31:58. After the coin write the test demoted the old GM, causing Foundry to disconnect both old-GM tabs. Successor snapshot at 16:32:49: inventory 21, personal 9, party 9; started receipt and journal `jBfDwqlUQZEqbH71` retained. Next ledger write did not occur. New ID `QqRwBAJwzQc4dld1` was blocked. Recovery restored gold 22, cleared journal, retained completed cancellation. Replay returned cancellation without writes. |
| Handover during compensation | `br05-compensation` started 16:35:03 with a rejected ledger write. After the second coin write (rollback), successor GM was demoted/disconnected. Original GM reconnected: gold 22 / bank 9 unchanged, started receipt and journal `RTRCNtD0DskpxvwL` retained. Recovery at 16:36:10 restored/cleared the record; replay returned cancellation. |
| Reconnect before delayed ACK / new intent | Delay increased to 45 seconds. `QqRwBAJwzQc4dld1` committed at 16:37:29 and timed out at 16:37:39. Player reloaded before its scheduled acknowledgment. After restoring the socket wrapper, retry at 16:38:08 returned the same recorded ID. A distinct new deposit `4hconCrYNzrCfYKK` succeeded immediately. The original delayed callback remained scheduled for approximately 16:38:14; subsequent snapshots preserved both successful movements. |

Direct treasury overlap at 16:40:27: `br05-direct-treasury` (GM item grant) and `br05-direct-player` (player gold deposit) both succeeded. Both requester audit entries and the treasury gem remained present.

Final snapshot at **16:42:39 UTC**: inventory gold **19**, personal gold **9**, party gold **12** (total **40**); inventory rope **15 + 2**, personal rope **2**, party rope **1** (total **20**). Both GM grants remained present. All **20 receipts** were retained as completed, including failed/cancelled outcomes; pending actor journal was null. Both disposable GM roles were restored to 4. Failure-injection wrappers were cleared or destroyed by reload/disconnect.

Validation: focused authority suite **13 passed**, repository quality lint passed, type check passed, isolated same-module-graph Rollup bundle built successfully (58.5 seconds), and independent socket-source review passed. Post-fix inventory regression: **632 passed** across **17 files**, 46.36 seconds, 473 ms test execution. The earlier 631-test inventory run is superseded for this scope. Independent acceptance-record review found the case records consistent with the matrix; that review did not independently observe the browser session.

The dev server remains running at the user’s requested port so the isolated world can be inspected. Stop it when the rehearsal world is no longer needed.

## Recording and closeout

For every row, record case ID, users, authority tab, operation IDs, before/after snapshots, result messages, and receipt/journal states. Delayed acknowledgment injection must restore the original socket method afterward. Handover injection must restore any wrapped document methods. Record writes already submitted before authority loss separately from writes attempted afterward.

An already-submitted Foundry write may complete after authority changes; no server-side compare-and-swap is available. Unknown drift must remain pending for reconciliation rather than being erased. Retain receipts after successful/cancelled recovery.

Close BR-05 only after all rows have actual multi-client evidence and any reproduced defects are fixed and rechecked. Stop the disposable server when inspection is complete. Do not change the campaign world or claim that mocked tests establish real transport behavior.
