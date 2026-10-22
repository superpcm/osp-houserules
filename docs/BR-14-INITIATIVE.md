# BR-14 — Campaign initiative

Status: COMPLETE — approved rules implemented and verified; live Foundry QA remains manual.

The formula, speed rules, minimum and tie-breaking approved in BR-07 C09 remain authoritative.

## BR-14 approvals — 2026-10-01

- New worlds default to individual initiative and fresh rolls each round. Existing worlds switch to these defaults once; alternate modes remain available afterward. User: “Yes”.
- Manual physical initiative uses the entered whole-number d20 result plus hidden random hundredths (00–99), then the same modifiers, minimum and exact-tie breaker as virtual rolls. User: “Yes”.
- Skip only combatants explicitly marked Defeated; do not automatically skip all combatants at 0 HP, because incapacitated characters may drink a potion. User: “Yes”.
- The GM marks combatants Surprised for the opening round. They still receive initiative but their turns are skipped for that round. Clear the mark when the next round begins. User: “Yes”.

## Required behavior

Roll individual initiative using a uniform d20 whole number plus hidden hundredths, DEX modifier, minus declared weapon speed or spell level, plus the approved racial bonus (Hobbit/Halfling +1). Keep whole-number display with hidden hundredths; clamp the whole-number component to at least 1 while preserving the original fractional component. Resolve exact ties with a separate hidden random ordering.

Two-weapon attacks use the larger weapon speed penalty. Unarmed and other actions default to zero unless an approved action specifies otherwise. Changing a declaration reuses the original roll and recalculates speed; a combatant that has already acted receives no second turn.

Cover cancellation, round transitions, duplicate hooks, explicit defeat, surprise, manual dice, declaration changes, ties, migration and intentional alternate settings with meaningful tests.

## Implemented behavior

- The active GM applies the one-time `initiativeRulesVersion` upgrade; later intentional group/keep/reset choices are preserved.
- The Foundry v13 tracker supplies an action declaration dialog selecting specific embedded weapon or spell IDs. Weapon attacks use `speedFactor`; spells use `lvl` (legacy `level` accepted). Missing speeds/levels are reported for GM data repair rather than treated as zero.
- Standard ability-score DEX modifiers apply without the armor cap used for AC. NPCs without a DEX score retain their existing `system.initiative.mod` fallback. Only Hobbit/Halfling gets the racial +1.
- Display floors the computed initiative while retaining hidden hundredths for ranking. Exact ties have separate random keys. Keep mode retains those keys across rounds.
- Declaration changes keep the original raw roll and active combatant. Next-turn selection considers all remaining unacted combatants, including those moved ahead of the current turn by a declaration change. Played combatants receive no second turn.
- GM Defeated and opening-round Surprise controls apply per combatant. Zero HP alone does not skip a turn. Surprise clears in round 2.
- Physical input is strict whole-number d20; cancelling any input cancels the complete staged batch without advancing the round or changing initiatives.
- Authenticated requests execute through the existing serialized active-GM authority. Persisted combat batch plans capture the original round/turn, updates and raw rolls before writes. The tracker offers **Recover initiative** after interruption. Partial writes and lost acknowledgments reuse the staged rolls; a conflicting later edit requires GM review.
- Core round hooks recognize prepared/completed rounds to prevent duplicate rolls. Native external round changes synchronize through the same authority.

## Validation

56 focused tests pass. The full-suite run before the final two bounded fixes passed 1,075 tests with the one pre-existing combat numeral sizing failure (38 versus expected 37.75). The final focused run covers those fixes: retained keep-mode tie order and pre-sort turn timing. Lint, type checking, the full build, the final JavaScript rebuild and release-manifest validation pass. All 347 original source-rule pointer values remain unchanged. Independent read-only verification passed all acceptance groups after the bounded fixes. The verifier's own test process did not complete on the shared mount, so runtime test evidence comes from the primary agent. Live Foundry QA was not performed.

## Approved minimum clarification — 2026-10-02

Retain the original roll's hundredths. For an original roll of 1.27, subtracting 4 gives −2.73; clamp the whole-number component to 1 and keep 0.27, yielding internal 1.27 and displayed 1. User: “Yes”. This corrects the earlier 1.73 example. The runtime already follows this rule.
