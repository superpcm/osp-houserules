# BR-11 — Class progression and racial level caps

Status: complete, 2026-10-01.

## Approved decisions

- Retain all earned and stored XP after reaching the approved racial/class maximum. Clamp derived level, progression, and level-up processing to that maximum. User approval: “Agreed”, 2026-10-01. Do not reduce stored XP to the maximum-level threshold.
- BR-07 C19–C23 and C27 continue to govern class/race limits, exact baseline class tables, custom-class overrides, hit dice, prime requisites, XP bonuses, and post-name-level HP gains.

## Custom-class racial eligibility

User approved 2026-10-01:

| Class | Eligible races and maximums |
| --- | --- |
| Mage | Human only; approved class maximum applies. |
| Beast Master | Human: approved class maximum; Half-Elf: level 8. |
| Warden | Human: approved class maximum; Half-Elf: level 11; Elf: level 11; Hobbit: level 6. |

These explicit house rules override omissions in the baseline race tables. Other demihuman races are ineligible for these custom classes.

## Acceptance criteria

- AC-1: Use approved per-class XP, HD, attack progression, prime requisites, and XP bonus rules.
- AC-2: Enforce racial/class maximums during preparation and level-up without discarding XP.
- AC-3: Preserve actual rolled HP; display-only calculations cannot replace it.
- AC-4: Test every supported threshold and cap, and complete focused quality checks.

## Progression contract

Exact bundled OSE Advanced Fantasy Players Tome v1.3 class tables govern XP, hit dice, attack bonuses and class maximums. The approved v1.5 Beast Master, Mage and Warden tables replace their baseline counterparts. Mage uses d6 and the house XP thresholds, including levels 10–14: 460000 / 620000 / 880000 / 1040000 / 1200000. Acrobat and Drow remain unavailable under prior approvals. Race-as-class characters use their own class tables; separate race/class characters also obey racial caps.

Single-prime classes use the baseline XP modifier: scores 3–5 −20%, 6–8 −10%, 9–12 zero, 13–15 +5%, 16–18 +10%. Multiple-prime classes use their explicit class rule rather than this generic modifier table:

| Class | +5% XP | +10% XP |
| --- | --- | --- |
| Barbarian | STR or CON 13+ | STR and CON 16+ |
| Paladin | STR or WIS 13+ | STR and WIS 16+ |
| Beast Master | STR or WIS 13+ | STR and WIS 16+ |
| Elf | INT and STR 13+ | INT 16+ and STR 13+ |
| Gnome | DEX and INT 13+ | INT 16+ and DEX 13+ |
| Half-Elf | INT and STR 13+ | Either 16+ and the other 13+ |
| Hobbit | STR or DEX 13+ | STR and DEX 13+ |
| Half-Orc | STR and DEX 13+ | STR and DEX 16+ |
| Mage | INT and WIS 13+ | INT 16+ and WIS 13+ |

Warden uses STR as its single prime requisite. Multiple-prime classes otherwise receive zero adjustment.

After level 9, classes whose table allows further levels gain fixed HP without CON: Barbarian and Dwarf +3; Cleric, Druid, Magic-User, Illusionist and Mage +1; the other supported classes +2. Level-up cannot grant HP beyond the applicable racial/class maximum. Actual accumulated `system.maxhitpoints` is authoritative; a displayed maximum-roll estimate cannot establish historical rolled HP. New characters receive their approved first-level maximum die plus CON. Missing historical HP requires manual correction.

## Runtime implementation

`src/config/progression.js` contains synchronous exact XP, attack, HD and HP rows extracted from the bundled Tome and approved custom tables. Source-parity tests protect those copies. `src/config/classes.js` APIs and compatibility exports derive from the same class rows. Actor preparation applies racial/class caps before downstream saves, skills and other level-dependent calculations. Attack calls and direct HP level-up calls also enforce caps.

Creation and sheet class filtering share eligibility rules, including the approved optional-class exceptions. NPC-only racial Cleric choices are excluded from ordinary PC creation. Existing referee-created or ineligible choices remain visible for adjudication/manual correction; opening the sheet does not silently replace their class. Unknown/ineligible race/class pairs cannot advance beyond level 1.

XP displays and progression tooltips use exact class thresholds and racial/class maximums; the final capped row extends to all retained excess XP. Stored XP is never reduced to the cap threshold.

Sheet rendering keeps the maximum-roll HP estimate separate from `system.maxhitpoints`. It preserves legacy level tracking without fabricating historical HP. Level-up adds rolled or fixed gains to the recorded HP balance, leaves current HP unchanged, and requires missing historical HP to be recorded manually. Cancellation/resumption and multi-client exactly-once handling remain BR-12 scope.

## Validation

- All 86 BR-11 tests pass: 70 exact source/threshold/cap/prime tests and 16 actor, sheet, level-up and referee-choice behavior tests.
- Full suite: 950 passed, 1 failed. The remaining failure is the pre-existing `combat-value-sizing.test.js` mismatch (38 versus 37.75); it is unrelated to progression.
- Lint, typecheck and build pass. Independent source recheck passes; the verifier did not independently obtain a completed test run.
- All 347 rule-matrix source pointers and original source values remain intact.
- Live Foundry UI verification was not performed.
