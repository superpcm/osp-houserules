# BR-12 — XP awards and resumable level-up

Status: complete — 2026-10-01.

## Approved decisions

- Party XP remainder: split the pool into equal whole-number base shares. Save any leftover XP and add it to the next award for that party, before applying individual class XP modifiers. User approval: “Save and add to next award”, 2026-10-01.
- Individual XP modifier rounding: apply the approved modifier to the whole-number base award/share, then round to the nearest whole XP; fractions of .5 or above round up, lower fractions round down. No individual fractional carry. User approval: “No, round up .5 and above, otherwise round down”, 2026-10-01.
- Interrupted multi-level HP gains: retain completed gains and resume only unfinished levels; never reroll completed gains on retry. User approval: “Yes”, 2026-10-01.

## Implemented contract

Party XP and DM Toolkit Give XP share `src/module/progression/xp-awards.js`. Party awards split `(new award + saved remainder)` into whole base shares; DM awards apply the entered base amount to each selected character. Each character then receives the approved class modifier, rounded half up. The single campaign party's world remainder follows current party membership into the next party award; direct awards leave it untouched.

The active GM executes authenticated requests serially. A Web Lock elects one executor among that GM's browser tabs. Durable operation IDs, immutable award plans, atomic actor receipts, and read-back checks prevent retries from awarding XP twice, including lost acknowledgments and partial writes. XP History in DM Toolkit exposes the audit and recovery actions. New awards pause behind an unfinished award or undo. Only the latest award can be automatically undone, and only while its HP, skills, class/race and progression balances remain unchanged. Otherwise the audit supports a deliberate manual GM correction. Interrupted undo resumes from per-actor undo receipts.

The elected active owner runs HP prompts; the GM validates and commits them. Each level has a durable claim token and committed marker. Cancelled rolls pause the sequence. Resume Level-up on the character sheet continues at the first unfinished level. Submitted rolls are cached in that browser session before sending the request; completed gains are retained permanently in actor state. HP, skill credit, fractional skill balance, pool version and last completed level commit together. Higher awards extend pending targets. Racial/class caps and post-level-9 fixed gains without CON are enforced. Current HP remains unchanged.

Creation seeds the initial skill pools (Thief 4, Assassin 3, Barbarian 2) and 1-in-6 skill values. Later credits use 2, 1.5 and 0.5 points respectively, saving fractions. Skill Points on the sheet supports later allocation of unspent points. Allocations validate the skill whitelist, 5-in-6 cap, available points and pool version, and commit values and balance atomically. Barbarian displays use allocated values.

Legacy migration records the current derived level as its historical baseline, preserving actual accumulated HP, existing skills and unspent points. It does not invent historical rolls or retroactively allocate skill points. Missing historical max HP still requires GM repair before future gains can commit. Migration itself uses the authority and a stable receipt.

Browser coordination fails closed when Web Locks or an active GM are unavailable. Live Foundry multiplayer/browser QA has not been performed; automated tests exercise the authority transport, duplicate GM tabs, owner handover, cancellation, partial recovery, lost acknowledgments, stale skill allocation and HP rules.

## Validation

- BR-12 authority, XP awards, level-up authority and state suites: 39 tests pass (8 + 11 + 16 + 4). Independent verifier repeated the focused checks and the final two-GM-tab test.
- Full suite: 980 pass; the single pre-existing `combat-value-sizing.test.js` assertion still fails (38 versus 37.75). No BR-12 regression failures remain.
- Lint, typecheck and build pass.
- Live Foundry/browser multiplayer verification was not performed.
