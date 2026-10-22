# BR-10 — Class weapon proficiency

Any class may use a weapon outside its class allowed/proficiency list with **-2 to hit** and **final damage capped at the class hit-die maximum**. This is class-based proficiency; no separate individual training system is introduced. The cap applies after weapon bonuses and critical dice. User approval: “So the answer to the original question is yes”, after clarification that the rule concerns weapons outside class allowed lists. A Magic-User sword attack rolling 9 damage therefore deals 4. Mage uses its approved d6 profile hit die.

Class profiles define proficiency. Named entries match catalog names, with optional Staff, dagger and sword families recognized; the item's magic bonus suffix does not change its proficiency. Catalog facts supply damage, size, handedness and damage type. Where Bastard Sword damage is stored as an object, the normal one-handed formula is the default; an explicit `wieldMode` selects the existing two-handed formula and requires both hands. This patch does not add target-size or grip-selection UI.

Physical profile size clauses, racial longbow/two-handed sword restrictions and hand/shield checks remain hard limits. Explicit item `minStr` is enforced even without race data. The current weapon catalog contains no STR minima; older source thresholds are not invented or imported over the approved catalog. Missing proficiency or hit-die data produces a retry/error message rather than silently granting proficiency.

Sheets and hotbar macros share `ItemHandler.rollWeapon`. Melee, missile and thrown attacks retain ammunition, manual-dice, target, cancellation and critical behavior. Natural 20 is recognized with or without a target. Unarmed attacks and monster proficiency are excluded from class weapon penalties.

Damage cards retain raw dice and display the effective capped damage and cap. `combatDamageTotal` is authoritative for chat application and damage popups; `rawDamageTotal` preserves roll evidence. Manual cards receive the same damage actions as virtual cards. Normal/double/half actions use effective damage; positive multipliers cannot exceed the weapon proficiency cap. Critical dice are already doubled before this cap. Healing uses the effective amount. Existing unflagged roll cards keep their original totals.

Clerics using non-blunt weapons receive a notification and attack-chat warning. The GM adjudicates deity anger; no automatic punishment or class mutation is introduced.

## Validation

Catalog/profile policy tests and canonical integration tests cover proficiency, optional/named weapons, Mage HD, final/critical damage, virtual/manual cards, macros, draw/unlash, physical and STR limits, cancellation, thrown consumption, unarmed/monster exceptions, and capped chat application. Final check results are recorded in the release burndown.

Final validation: 23 BR-10 tests pass; the full suite has 864 passes and one pre-existing combat-value-sizing failure (38 versus 37.75). Independent source verification, lint, typecheck and build pass. Live Foundry UI verification was not performed.
