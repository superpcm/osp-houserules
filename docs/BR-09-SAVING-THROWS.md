# BR-09 — Saving throw contract

Saving-throw tables follow the bundled OSE Advanced Fantasy Players Tome v1.3 class progression pages. Mage, Warden and Beast Master use the approved v1.5 replacements. Runtime tables in `src/module/actor/saving-throws.js` are checked against every printed source row and every house replacement row. Hobbit aliases Halfling. Levels outside a table clamp to its first/last row; this protects save calculation without changing XP or class-level caps (BR-11).

## Racial resistance

CON comes from `system.attributes.con.value`. For separate-race Dwarves and Hobbits/Halflings, resistance applies to poison, spells, and magic wands/rods/staves. Gnomes receive resistance to spells and magic devices, but not poison. Bonuses are 0 at CON <=6, +2 at 7–10, +3 at 11–14, +4 at 15–17, and +5 at 18. Demihuman class tables already reflect innate resistance, so no second CON-based racial bonus is applied to those tables.

The generic Death target does not include poison-only resistance. A separate Poison target is displayed. Nonmagical paralysis and breath do not automatically receive resistance. A spell or device can use another save category; the contextual calculation accepts its source explicitly. Magical effects alone do not imply racial spell/device resistance.

## WIS and other modifiers

WIS magic-save modifiers: 3 = -3; 4–5 = -2; 6–8 = -1; 9–12 = 0; 13–15 = +1; 16–17 = +2; 18 = +3 (Tome pp20–21). Wands and Spells targets already include WIS and applicable racial resistance. For other categories, WIS applies only to magical effects. Breath normally receives no WIS modifier; the referee can explicitly enable it for an exceptional effect.

Positive magic-item and situational bonuses improve the roll (equivalently reduce the target); penalties do the reverse. `getSavingThrowTarget` accepts those bonuses explicitly and applies them once. The current sheet is a manual-roll display: equipment bonus aggregation and a new save-roll UI are not introduced. Players/referee supply item and situational modifiers manually by reducing the displayed target for positive bonuses (raising it for penalties), clamp the final target to at least 2, then compare an unmodified d20. Bonuses already included in displayed targets are not applied again. The sheet includes this guidance.

## Approved minimum

Minimum effective target is **2**, after bonuses. Approval: the user answered “1” to the two-option question, then clarified “no I meant option 1”, which was **Retain minimum target 2**. No new natural-1 exception or minimum-1 rule was approved.

## Validation

Tests independently read the bundled Tome progression text and house-rule JSON, compare every class/level, and exercise all CON/WIS boundaries, aliases, contextual categories, item/situational bonus signs, minimum target, race-as-class resistance and actor field integration. Source profiles/catalogs are preserved.

Baseline full suite before this change: 781 passed, one existing failure in `combat-value-sizing.test.js` (38 versus expected 37.75). Final checks are recorded in the release burndown entry.

Final validation: 60 save tests and 7 actor-creation tests pass; independent verification, lint, typecheck and build pass. Full suite: 841 passed; the single baseline combat-value-sizing failure remains. Live Foundry verification was not performed.
