# BR-15 — Combat and class ability support

Status: COMPLETE — 2026-10-02. The automated and assisted/manual support contract below is implemented and verified; live Foundry acceptance remains unperformed.

## Approved decisions

- Normal attacks per round: Fighter 1/2/3 at levels 1/4/9; Knight, Paladin, Ranger and Warden 1/2 at levels 1/5. A completed attack spends one whether hit or miss. Cancellation spends none. Opportunity attacks use this same allowance. Warn when exhausted; a GM may override or grant a conditional extra attack.
- Situational combat effects require player or GM confirmation that their conditions apply. Foundry then applies the stated modifiers and tracks duration. Geometry and narrative judgments remain at the table.
- Fighter level-1 talent choices are Weapon Specialization or Two-Weapon Fighting. Level-3 and level-7 choices are Cleave, Defender, Leader or Slayer (house rules v1.5, page 10). The proposed repeat-specialization policy was withdrawn.
- The approved OSE baseline provides one additional offhand attack per round. House-rule talent penalties and weapon restrictions override the baseline where specified.
- STR affects melee attack and damage rolls. DEX affects missile attack rolls, not missile damage (bundled OSE Advanced Fantasy Players Tome v1.3, printed page 20).
- Catalog names, damage and properties govern equipment. Burning oil deals its catalog initial damage and an additional 1d4 the following round, as approved in BR-07.

## Acceptance evidence

Independent source review passed after correcting mandatory Knight/Paladin specialization, malformed talent records, shared-actor settlement and unarmed Slayer damage. No live Foundry acceptance has been performed for BR-15.

## Rule-to-feature contract

The Skills page embeds earned choices inside the **Combat Talent** and **Additional Combat Talent** descriptions. Only saved, eligible talents appear under **Combat Skills**. Each choice displays its original rules description beside a single-choice control. Weapon Specialization shows a weapon picker; Slayer shows a foe-type field. Save choices stores the selections through the existing GM authority. The separate header control and selection dialog have been removed. The combat tracker **Attacks** control shows normal attacks remaining and opens charge, aim, parry/dodge and GM reservation recovery. The weapon/unarmed attack dialog confirms the current situation. These are separate from initiative action declarations; change initiative declarations when changing the action's speed.

| Rule / feature | Support | Behavior and limits |
| --- | --- | --- |
| Fighter extra attacks at 4/9; Knight/Paladin/Ranger/Warden at 5 | Automated | Per-combatant, per-round allowance with authenticated GM reservations and completed-roll spending. Outside an active combat, no round limit is imposed. |
| Opportunity attacks | Assisted/manual | Make the normal weapon attack out of turn after confirming the movement trigger. It spends the normal pool. Geometry and trigger detection remain manual. |
| Fighter talent choices at 1/3/7; class-granted initial talents | Assisted/manual | Sheet control offers only earned slots and valid choice groups. Player selects catalog specialization weapon or Slayer foe type. Knight/Paladin granted specialization cannot be omitted and its weapon choice is required before attacking. Selection is not automatically opened during level-up. |
| Weapon Specialization | Automated after selection | +1 attack; damage +1/+2/+3/+5 at levels 1/4/10/13 for the selected weapon name. Customized/renamed weapon matching requires GM review. |
| Two-weapon fighting | Assisted/manual | Confirm primary or offhand use. Offhand is additional once per round. Baseline requires a STR/DEX prime requisite and small offhand; trained restrictions permit dagger, hand axe, light hammer, club or two short swords. Penalty progression follows v1.5. The table confirms hand use and whether both weapons are being used this round. |
| Cleave | Assisted/manual | Confirm killing blow and second foe; dialog applies -2. GM grants the conditional extra attack through the override control when needed. It does not detect deaths or automatically select targets. |
| Defender | Assisted/manual | Attacker confirms that the intended target is protected by Defender; dialog applies -2 for that attack. Table determines melee engagement. |
| Slayer | Assisted/manual | Select a specific foe type, then confirm that same type in the attack dialog; +1 attack and damage. Target taxonomy is not inferred. |
| Leader | Assisted/manual | Table identifies qualifying allies/retainers within 60 feet. Apply +1 in morale/loyalty rolls and fear-save modifier controls. No automatic aura or relationship detection. |
| Range | Assisted/manual | Choose catalog range band: short +1, medium 0, long -1; beyond maximum blocks the roll. Distances, cover and engagement are confirmed rather than inferred from token positions. |
| STR/DEX | Automated | STR affects melee attack and damage; DEX affects missile attack only. Dual-use weapon mode is selected before rolling. |
| Armor DEX caps and shields | Automated | Existing actor AC preparation applies equipped armor maxDex, shield AC and underarmor. Existing hand/equipment checks remain in force. |
| Armor STR requirement; Knight exception | Automated | Equip gate checks catalog minStr. Knights bypass armor STR requirements, retaining class armor permissions. Existing equipped armor should be reviewed if catalog requirements changed. |
| Aiming | Assisted/manual | Confirm that attacks/movement are forgone; declared aim blocks attacks this round, gives +2 ranged attacks in the following round and expires. Movement restriction is manual. |
| Charging | Assisted/manual | Confirm 20 feet straight and unhindered; +2 charger attack and +1 attacks against the charger during that round. Movement expenditure and repeated-charge geometry remain manual. |
| Parry/dodge | Assisted/manual | Confirm no attacking/moving; declared parry blocks own attacks and gives -2 to attacks against the target during the round. Movement restriction is manual. |
| Reach and second rank | Assisted/manual | Confirm a Reach weapon and passage through an ally. -2 unless attacker is larger. Token distance, sizes and allied-square geometry remain manual. |
| Fighting withdrawal / retreat | Assisted/manual | Move at half encounter speed; the table checks pursuit and attack priority. Roll normally using available attacks. No invented withdrawal attack bonus or automatic movement trigger. |
| Blind fighting | Assisted/manual | Confirm blinded attacker to block attacks; confirm blinded target for +4. Half movement, failed saves and sight-dependent spell restrictions are manual. |
| Helpless target | Assisted/manual | Confirm helpless target: melee automatically hits and uses maximum damage, with normal class final damage cap. Ranged attacks retain their usual roll. HP/conditions are not automatically interpreted as helpless. |
| Missile fire into melee | Assisted/manual | On a miss, use 20 minus the raw d20 per v1.5, compare against other engaged combatants as the rule directs, and resolve equal-AC candidates randomly. GM adjudicates the collateral target and applies damage; no automatic retargeting. |
| Oil/fire | Assisted/manual | Use catalog initial damage. Prepare and light according to v1.5 unless prepared ahead. GM records and applies additional 1d4 next round. No automatic oil preparation, fire duration or damage application. |
| Splash | Assisted/manual | On a miss roll 1d8 for the adjacent square on a square grid. Table adjudicates area/targets and applies catalog damage. No automated scatter. |
| Reload | Assisted/manual | Reload-tag weapons require confirmation that reload and movement restrictions were satisfied before attacking. R1: reload and movement cannot share a round; R2: full-round reload, no movement. Catalog rates/properties govern weapons; no automatic loading state or movement enforcement. |
| Ammunition | Automated | Existing availability gate runs before reservation/dice. Completed shots/throws expend ammunition whether hit or miss; cancelled rolls do not. Ammo persistence errors require GM inventory review. |
| Weapon switching | Assisted/manual | In melee, drop the current weapon before switching and attacking. Equip/store controls manage inventory; table enforces this action restriction. |

“Assisted/manual” includes both software-confirmed modifiers and explicitly described table procedures. A listed manual procedure does not imply a dedicated automatic effect.

## Recovery and acceptance

Reservations prevent simultaneous dialogs from spending the same attack. Cancelling releases the reservation. A completed roll spends its attack before chat publication, so a failed chat post does not refund it. Per-round state is held in combatant flags; receipts use the existing authenticated active-GM authority. Round and initiative-sequence stamps reject unsettled stale requests. Completed receipt replays are harmless. GM can release an abandoned **unrolled** reservation through the Attacks control; confirm its roll did not complete before releasing it. GM recovery of started authority receipts uses the existing progression recovery workflow.

Acceptance evidence, 2026-10-02:

- 73 distinct focused regression tests passed across combat rules, support UI, attack authority, weapon/unarmed policy, BR-14 lifecycle and tracker controls. Final weapon/unarmed run: 30 passed after the Slayer correction.
- Latest full-suite run: 1,102 passed, one known pre-existing failure in combat-value-sizing.test.js (37.75 expected, 38 actual), across 47 files. That run preceded the final unarmed Slayer correction; the affected 30-test suite was rerun afterward and passed.
- Lint and typecheck passed; full build and final JavaScript rebuild passed; final release validation passed for v1.0.12.
- All 347 BR-07 source-rule values were checked against their JSON pointers and remain unchanged.
- Independent verifier source review passed, including the final bounded fixes. Its independent test invocation stalled, so command evidence is from the primary agent.
- No live Foundry acceptance was performed.

The BR-15 support classifications supersede the earlier BR-07 implementation audit for these features. BR-07 approved rules and all source-rule values remain unchanged. Source paths: house-rule JSON `/class_options/class_adjustments`, `/class_abilities/combat_talents`, `/armor`, `/combat`, `/equipment/property_legend`; equipment facts use `data/weapons.json` and `data/armor.json`. Runtime evidence: `attack-support.js`, `combat-support-ui.js`, `combat.js`, `combat-tracker.js`, `item-handler.js` and actor AC preparation.
