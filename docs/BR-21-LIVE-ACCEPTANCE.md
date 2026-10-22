# BR-21 — Live Foundry acceptance

Status: **open; browser testing blocked**, 2026-10-02.

The user approved a fresh test copy of the existing development Westford world. The original world was not used for testing. The existing development system points to a different checkout, so this run uses an independent data directory with the current repository connected explicitly.

## Verified environment

- Foundry VTT 14.367; Node 24.21.0; system manifest 1.0.12.
- Data directory: `/private/tmp/osp-br21-20261002` (temporary, permission 0700).
- Source copied from `/Users/paul/FoundryData/osp-dev/Data/worlds/westford`.
- Copied world retains ID `westford` for asset references; title is `BR-21 Acceptance — Westford Copy`.
- World databases and system compendiums are independent copies. Runtime source, templates and build assets reference this repository; legacy asset directories are linked for reading. Optional third-party modules are absent from this system-only baseline.
- The final successful launch used Foundry's native Unix socket with a TCP proxy bound only to `127.0.0.1:30021`. Core update checks and UPnP were disabled.
- The server loaded the world and compendiums and reported successful startup, then shut down cleanly after browser access was blocked.
- See `qa/BR-21-environment.json` for source/build SHA-256 identities and `qa/BR-21-startup.txt` for startup/shutdown evidence. No release commit identity is claimed.

## Blocking condition

The Codex in-app browser denied navigation to `http://127.0.0.1:30021` because its administrator-enforced security policy could not be verified. The tool explicitly prohibited bypassing the control or using an indirect workaround. No alternate browser or network route was used to evade that denial.

No GM/player session was opened. Browser version, client startup, rendering, permissions, gameplay and reconnect results remain unverified. Server startup alone does not satisfy BR-21.

## Acceptance checklist

Each criterion needs live client evidence, user/client identity, observed result, and console error review. Automated fixture tests from earlier work are supporting evidence only.

| ID | Live criterion | Status |
| --- | --- | --- |
| AC-1 | Record exact browser versions; GM and two distinct player sessions; clean client startup | Pending |
| AC-2 | World/client settings render, persist and affect behavior after reload | Pending |
| AC-3 | Character/monster creation, approved rules, resources, cancellation and persistence | Pending |
| AC-4 | Character, monster and ten item-type sheets open/save/close/reopen | Pending |
| AC-5 | BR-20 placement routes, nested deletion/drop/cancel, custom metadata and capacity | Pending |
| AC-6 | Combat, initiative, rounds, morale and token ruler | Pending |
| AC-7 | Chat visibility, damage/healing, target modes, conditions, criticals and recovery | Pending |
| AC-8 | Party XP/remainder, modifiers, level-up/HP choice, limits and persistence | Pending |
| AC-9 | Spellbook/copy checks, focus, memorization, casts, slots, rest and cancellation | Pending |
| AC-10 | Banks, party treasury, stores, balances and overlapping player operations | Pending |
| AC-11 | Owner, observer, unrelated player and GM permissions | Pending |
| AC-12 | Disconnect/reconnect, retry, durable receipts and no duplicate movement | Pending |
| AC-13 | Hotbar creation/invocation for supported weapon, spell, ability and table macros | Pending |
| AC-14 | Valid/malformed imports, errors and cancellation without partial writes | Pending |
| AC-15 | Virtual/manual/ask-every-time dice, cancellation and GM enforcement | Pending |
| AC-16 | No uncaught errors, duplicate actions or unexplained deprecations | Pending |
| AC-17 | Reproducible results/screenshots and final reload smoke across all clients | Pending |

## Resume

First restore normal browser-tool access; do not change security policy or bypass its checks. The temporary world is preserved and the server is stopped. Its local launcher is `/private/tmp/osp-br21-20261002/launch.cjs`; starting it requires permission to listen on the localhost socket. If the temporary directory has been removed, recreate the isolated copy before continuing. Do not use the campaign world as a substitute.

## Browser retry after app restart

At 2026-10-03T02:55:19.890051+00:00, the user requested a retry after restarting the desktop app. The isolated server was restarted, but the browser again denied localhost navigation because the administrator-enforced policy could not be verified. No live client test ran; BR-21 remains open.
