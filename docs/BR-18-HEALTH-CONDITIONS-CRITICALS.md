# BR-18 — Health, conditions and critical results

Status: COMPLETE — 2026-10-02. Automated and assisted/manual support verified. No live Foundry acceptance performed.

## Approved rules and support

| Feature | Support | Behavior and limits |
| --- | --- | --- |
| Natural healing | Automated after GM confirmation | A qualifying day restores 1d4 + CON modifier, minimum 1 HP, capped at maximum HP. Active bleed-out cannot be treated this way; dead characters cannot be revived. Award Rest uses the same service. |
| Damage and death | Automated | Negative HP is retained and means death. A character reaching exactly 0 rolls Save vs Death: natural 1 fails, natural 20 succeeds, otherwise use the BR-09 target. Failure means death; success means Incapacitated and a separate 1d4+1-round bleed-out timer. NPCs do not gain the character zero-HP save procedure. |
| Zero-HP bleed-out | Automated in combat; assisted/manual outside combat | Exclude the falling round. Count down at the end of subsequent rounds; expire at zero. Falling in round 4 with two rounds remaining means death at the end of round 6 (processed when advancing to round 7). Duplicate/backward round events do not decrement again. Ending/deleting combat requires the GM to continue the timer manually. |
| Kit stabilization | Assisted/manual | GM confirms one combat action, reach and supplies; a physical Healer's Kit with positive quantity must be available to a living, conscious healer. No ability check. Stops the zero-HP timer without restoring HP. Does not override injury-specific magical-only stabilization. |
| Recovery | Automated for zero-HP state | Stabilized characters remain Incapacitated until natural or magical healing restores at least 1 HP. Magical healing stops zero-HP bleeding. Independent injury conditions keep their own requirements; recovery does not automatically stand the character up. |
| Prone | Automated modifiers; assisted/manual movement | Attacks −2; incoming attacks +2. Standing costs half Encounter Speed, managed by the GM. Cannot clear Prone while Incapacitated or unconscious. |
| Incapacitated | Automated restrictions/modifiers; assisted/manual movement | Cannot attack/cast, saving throws −4, incoming attacks +4 total including Prone. Dragging 5 feet/round and drinking a potion are manual; potion/spell resources must be expended separately. Temporary injury incapacitation does not start the zero-HP timer. |
| Unconscious | Assisted/manual with automated attack/casting restriction and Prone | Cannot move/speak, unaware, drops held objects and is helpless. Movement, awareness and inventory drops are GM-managed. Character attacks offer helpless-target handling through combat support; monster helpless-target damage requires GM adjudication. |
| Critical hits/misses | Assisted/manual | Natural 20/1 on character weapon/unarmed and monster attacks invokes all current v1.5 tables. Doubled damage dice retain modifiers once; 87–89 rerolls ones. BR-10 final damage caps remain in force. Full results are posted for adjudication. |
| Injury follow-ups | Assisted/manual | Hits 90–94 roll Minor Injury; 95–98 Major Injury; 99–100 Major Injury plus STR Melee modifier, clamped to 1–100. Required results are posted to chat for GM adjudication. |
| Injury consequences | Assisted/manual | GM applies saves, equipment drops/breakage, movement, penalties, extra attacks, duration expiry, scars and anatomy substitutions. Major injury bleeding (1d4/1d6/1d8 HP per round) is separate from zero-HP countdown: roll and apply its HP loss each round. Catastrophic torso magical-only stabilization and head instant death remain explicit table instructions. |
| Automatic injury tracking | Unsupported | No automatic limb model, injury HP-bleed timer, temporary-effect expiry, broken-item mutation, token movement or potion expenditure. The full reference and result cards specify the required manual steps. |

## Controls and recovery

The duplicate **Health & Conditions** sheet panel and both header entry points were removed on 2026-10-18. The actor owner and GM may correct current HP directly in the sheet through the authenticated health authority; maximum HP remains derived and read-only. Shared health services remain in use by Toolkit healing/rest, chat damage and combat. Existing HP and condition data are preserved. Manual condition, stabilization and out-of-combat timer management belong to the GM’s workflow.

Health changes run through the authenticated active-GM authority. Owners can request damage/magical healing and critical lookup; natural healing, condition edits, completed-round recording and undo are GM-only. Kit checks validate healer ownership. Chat applications deduplicate repeated token instances of the same actor and use actor UUIDs so independent synthetic actors remain separate. Monster damage cards already applied by the attack path cannot be applied again through chat.

The latest unchanged health mutation can be undone once, restoring HP, conditions and the timer together. A later edit prevents stale undo. Critical table effects are advisory and require manual reversal if the GM already applied them. Undo of HP does not undo spent ammunition, spell resources or attacks.

Pending operations persist their input and die stages before rolling. On interruption, the GM opens XP History (which lists all interrupted operations) and recovers the pending operation, recording the actual die if it was already rolled. A fresh die is allowed only after explicit confirmation that none occurred. Do not repeat the attack when recovering a critical or damage result: the attack/ammunition may already be spent. A lost write acknowledgment or chat failure does not silently apply damage or roll dice twice.

Result cards honor the request's core roll mode. Detailed HP and critical outcomes stay on permission-scoped actor records and cards; shared operation receipts retain acknowledgments and the damage reroll flag, not HP totals or injury details. Actor owners can inspect their own health/critical records; these are not secret exploration checks.

## Sources and replacement boundary

Original `data/ose_house_rules_v1_5.json` remains unchanged. Approved BR-07/BR-18 rulings override its historical bleed-out ambiguity. All 347 matrix source values remain preserved; support records describe actual implementation separately.

Current v1.5 critical lookup is isolated in `combat/critical-rules.js` and `health/critical-authority.js`. The user plans a different critical system later; no replacement mechanics have been supplied. This release retains current tables without coupling them to the health state machine.

## Verification

- Full suite: **1,226 passed, one known pre-existing failure**, across 61 files. The only failure is BR-19 combat numeral sizing (expected 37.75, actual 38); its code and expectation were not changed. The final run used `npm test -- --hookTimeout 30000` to accommodate mounted-filesystem import latency; earlier 10-second import-hook timeouts did not recur.
- The six directly affected health/critical/weapon test files contain 74 passing tests. Coverage includes HP boundaries, minimum healing, independent injury conditions, zero-save dice, falling-round exclusion, synthetic actor UUID separation, duplicate/backward rounds, stabilization, latest-state undo, stale edits, interrupted dice, lost writes/acknowledgments/cards, forged requests, private result receipts, all critical table ranges, natural 1/20 routing, reroll-ones damage and monster application failures.
- Lint, typecheck, full build and release validation passed for v1.0.12. The generated bundle was checked for the final card visibility and monster failure-warning changes.
- Independent read-only implementation review found no material blocker. Real monster-sheet integration tests use Foundry/service mocks; no live Foundry multi-client acceptance was performed.
- All 347 matrix source values match the original JSON. Sixty health/condition/critical support records were updated, preserving historical source text and recording approved interpretations separately.
