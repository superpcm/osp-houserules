# BR-17 — Exploration, skills and noncombat features

Status: COMPLETE — 2026-10-02. The automated and assisted/manual support contract is implemented and verified. No live Foundry acceptance has been performed.

## Approved hearing rule

Use the better of racial hearing and trained Hear Noise, never stack them. An Elf with trained Hear Noise 1 or 2 has an effective 2-in-6 chance; training 3 gives 3-in-6. Store training separately from the effective chance so a racial bonus does not grant free Skill Points. Approved by the user on 2026-10-02.

## Rule-to-feature contract

| Feature | Support | Behavior and limits |
| --- | --- | --- |
| Skill Points | Automated | Thief starts with 4 and gains 2 per level; Assassin 3 and 1.5; Barbarian 2 and 0.5. Fractional and unspent points carry forward. Starting trained chances are 1-in-6; allocations cannot exceed 5-in-6. Existing BR-12 authority controls awards and allocation. |
| Assassination | Assisted/manual | Separate rear attack/death-save procedure, not an allocatable d6 skill. Future allocation excludes it. Legacy values are retained for GM review; no automatic refund. |
| d6 checks | Assisted/manual | GM-private dice, success at or below adjusted chance. Class eligibility and stored training determine chance. Table confirms circumstances, time, prerequisites and consequences. |
| Armor penalties | Automated within checks | Climb Sheer Surfaces and Move Silently lose 1-in-6 for equipped body armor except canonical Leather, Padded or Hide. Shields and helmets alone do not trigger the penalty. |
| Pick Pockets | Assisted/manual | GM supplies victim level privately; chance loses 1 per three levels, minimum zero. Natural 6 means noticed; the GM determines reaction. |
| Disguise | Assisted/manual | Requires an actual available physical Disguise Kit record. GM manages disguise feasibility and observer detection: 2% base plus 2% each for posing as another class, race or sex, per new meeting and daily repeat encounter. No kit exists in the current canonical gear catalog; its physical record and equipment details need GM entry, without inventing catalog price/weight. |
| Listening and searching | Assisted/manual | Private checks; racial hearing and trained hearing use the approved maximum. Racial secret-door, construction and room-trap checks remain distinct from thief mechanism skills. GM controls search area, elapsed time, repeat limits and what is revealed. |
| Ranger/Warden tracking | Assisted/manual | Source percentage plus full WIS score; GM applies ground, group size, mingled tracks, age, rain and concealment modifiers. Values above 100 remain valid before modifiers. No invented automatic failure at 100. |
| Mage skills | Assisted/manual | Source percentage plus full INT score; private d100 resolution. GM enforces 30-foot range, concentration, one attempt per portal, one use per turn and Read Magic retry only after a level gain. Effects, saves and durations are manual. This Read Magic check is distinct from BR-16 spell copying. |
| Mage staff light/healing | Assisted/manual | Reference identifies once-daily uses, duration, time cost and healing/save option. GM tracks expenditure and applies effects. |
| Beast Master companions | Assisted/manual | Both count and total HD may not exceed character level. Reference gives level-dependent communication, reaction/bonding, no-morale behavior, track identification and stronghold rules. GM maintains roster and adjudicates animals/effects. |
| Warden abilities | Assisted/manual | Reference covers awareness, 3-in-6 wilderness approach, foraging 2-in-6, hunting 5-in-6, quarry evasion -10%, possession/alignment restrictions and level-10 followers. GM resolves consequences and travel procedures. |
| Bard | Assisted/manual | Level-derived Inspiring Words and Mockery daily allowances shown in reference. Mockery begins at 3, grows at 6 and 9, capped at 3/day. GM tracks uses, hearing/understanding, saves, modifiers and interruption. Additional language at each even level starting at 4 is added manually. |
| Turning undead | Assisted/manual | Reference identifies Cleric/Paladin tables, 2d6 target check, 2d6 affected HD, lowest-HD-first ordering, sequential mixed-group attempts, one-turn duration and interruption lockout. GM records encounter, rounds, affected undead and expiry. Paladins qualify at level 3. |
| Languages | Assisted/manual | Creation grants racial/class languages and INT choices; Common becomes Trade Tongue, Hobbit/Hobbitish becomes Hobbiton, alignment languages are removed. Language editing preserves custom entries. Later learning/literacy is referee-managed. |
| Occupations/background | Assisted/manual | All 100 source occupations are offered at creation. GM rolls d100 for random selection and adjudicates occupational knowledge; no automatic occupational bonus is invented. |
| Automatic narrative effects and tracking | Unsupported | No automatic companion AI/roster enforcement, Bard daily expenditure, Mage skill retry clock, turning round/expiry enforcement, occupational bonuses or world-search detection. Explicit reference procedures identify the manual work. |

## Controls, privacy and recovery

The duplicate character-sheet **Exploration** dialog, header entry, and dialog-only reference builder were removed on 2026-10-19. The GM handles these procedures through the DM’s Toolkit. Shared skill calculations and checks remain available to existing skill controls. Checks use the authenticated active-GM authority. The GM privately confirms prerequisites, victim level or tracking modifiers. Mage retry restrictions, search time/area and spell-like effects remain explicit GM responsibilities.

A GM-only whisper journal saves the configured chance and a rolling marker before dice. Results and private modifiers stay in that journal; public operation receipts contain only actor/check identifiers and a neutral acknowledgment. The requesting player must learn discoveries from the GM, not from success/failure output.

If interrupted, open XP History as GM and recover the pending operation. Record the actual result if already rolled; only confirm a new roll if none occurred. A timeout is pending, not a failed skill check. A saved completed journal or authority receipt prevents another roll for that operation ID. A missing private journal cannot silently recover by rerolling. Failed journal acknowledgments are checked against saved state. No private outcome is stored in owner-readable actor flags.

## Sources and historical data

House-rule JSON `miscellaneous`, `class_abilities`, `custom_classes` and `occupations`; approved BR-07 rulings; bundled OSE Advanced Fantasy Players Tome v1.3, including Assassin p30, Bard p35, Cleric pp36–37, Paladin pp68–69, Ranger p71 and turning p123. Canonical armor names come from the equipment catalog; Hide explicitly represents pelts/furs.

Original house-rule JSON remains unchanged. Profile explanatory metadata now reflects d6 skills, full-score percentage bonuses, pursuit, Warden surprise, Mage Rally code RY and Bard uses. XP, hit dice, saving throws and spell progressions are outside this change. Historical Assassination allocations and secret-door entries remain stored; they do not create new eligible training or override racial search chances.

## Verification

- Full suite: 1,182 passed, one known pre-existing combat numeral sizing failure (expected 37.75, actual 38), across 56 files. No new failure. The BR-17 affected files account for 104 passing tests, including three UI checks.
- Coverage includes all racial detection/hearing branches, stored training preservation, class eligibility, allocation totals through level 14, armor exemptions, Pick Pockets thresholds/detection, every Mage table row/skill, tracking levels, Bard breakpoints, companion caps, physical/object-quantity kit availability, private journal/receipt separation, forged requests, duplicate operations, interrupted-roll recovery and lost acknowledgments.
- Lint, typecheck, full build and release validation passed (v1.0.12). The generated bundle includes the final BR-17 private-check and reference changes.
- Independent read-only review found one quantity compatibility issue, fixed with the shared inventory normalizer and verified. No remaining BR-17 blocker found.
- All 347 original BR-07 source-rule values still match the house JSON; 50 support records now reference BR-17. Hearing approval is recorded separately from immutable source text.
- Live Foundry multi-client acceptance remains unperformed. The manual procedures are a support contract, not a claim of automatic enforcement.
