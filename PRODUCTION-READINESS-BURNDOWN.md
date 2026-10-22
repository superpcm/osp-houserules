# OSP House Rules — production readiness burn-down

Reviewed September 28, 2026. Baseline: local version 1.0.12, including existing uncommitted work.

**Recommendation: do not release this snapshot as production-ready.** The system builds and has useful automated coverage, but confirmed inventory/value integrity defects and house-rule discrepancies remain. Repair those before treating a successful build or a playable session as release approval.

This is a source-and-test audit, not a completed live Foundry acceptance test. The checklist covers the production work identified across the system; it cannot guarantee that no additional defects will appear in live play. No game data or implementation was changed during this review.

## Baseline evidence

| Check | Result |
|---|---|
| Unit tests | **117 passed, 1 failed**, across 12 test files. Failure: `combat-value-sizing.test.js:9`, expected 37.75, received 38. |
| Existing lint | Passed; currently checks for inline scripts in templates, not general JavaScript correctness. |
| Existing type check | Passed; includes only `config.ts`, `exploration-skills.js`, and `container-allowlist.js`. |
| Release manifest validation | Passed for 1.0.12; does not validate a downloaded/installable archive. |
| Production build | Passed in a temporary copy using the installed dependencies. This was not a clean dependency installation. Live `dist/` was left untouched. |
| Existing local release archive | Present and includes the principal runtime files; not certified as matching this source snapshot. |
| Clean installation, world upgrade, multiplayer play | Not exercised in this review. |
| Existing local changes | Compendium database files and untracked combat numeral sizing source/test files. Preserve and reconcile before tagging a release. |

Two isolated reproductions using mock documents confirmed:

1. `depositCurrency(actor, 'gold', 10, sourceWithOneCoin)` succeeds, credits 10 gold, and deletes the source stack of 1.
2. Depositing two treasure items named `Gem`, worth 10 and 100 respectively, produces one stack of 2 with the first item's cost of 10.

The September 12 code audit and March comparison document contain historical findings. Packaging, version matching, CI, some lifecycle work, and opt-in GM-only unpause now exist. They should not be listed as wholly missing.

## How to use this list

Items are checked off only when their completion evidence exists.

- **P0:** Protect inventory, currency, and shared state before production play.
- **P1:** Resolve rules correctness and the failed test before release acceptance.
- **P2:** Complete runtime, upgrade, installation, and operational acceptance before declaring production readiness.
- **Confirmed:** Demonstrated by a test or a specific current code path.
- **Conflict:** Implementation or reference sources disagree; establish the intended rule before changing behavior.
- **Validation:** A required acceptance exercise, not a claim that the feature is broken.

Rules that reasonably depend on referee judgment do not all need automation. They do need accurate reference text, an explicit manual workflow, and no contradictory automatic calculation.

## P0 — preserve game state

### [x] BR-01 — Validate deposits against the actual source stack

**Confirmed.** Personal bank currency deposits subtract the requested amount without rejecting amounts above the live source quantity. Treasury/storehouse deposit paths have the same missing source-quantity guard. Currency routes also need to derive or validate denomination against the actual source item rather than trusting the request.

**Done when:** All inventory-backed deposits reject missing/stale items, wrong owners/types/denominations, zero, negative, fractional, and excessive quantities before mutation. Re-read live source state when executing a queued request. A stack of 1 can never credit 10. GM catalog grants remain an explicitly separate operation.

Evidence: `src/module/inventory/bank-ledger-orchestrator.js:155`, `party-treasury.js:110`, `storehouse.js:62`; isolated reproduction above.

**Completed September 29, 2026.** Inventory-backed personal/party bank and storehouse deposits now validate the live source document, ownership, eligibility, canonical coin denomination, and positive integer requested/source quantities before any mutation. Requests cannot exceed the live stack. Queued execution re-reads source state; personal storehouse deposits are also serialized per actor. GM catalog grants remain separate operations.

Validation: `deposit-source.test.js` (9 tests) and `deposit-integration.test.js` (120 tests) pass, covering all six deposit routes, rejection without mutation, successful partial/full deposits, queued depletion/removal, and catalog grants. Independent source review passed. Lint, type check, and JavaScript build to a temporary directory passed. Full suite: 246 passed, 1 failed; the sole failure remains the pre-existing combat numeral sizing mismatch (38 versus 37.75). Live Foundry/multiplayer acceptance remains covered by the later rehearsal items.

### [x] BR-02 — Recover safely from partially completed transfers

**Confirmed.** Bank, treasury, and storehouse operations mutate inventory and then save a ledger. Failure of the second write can lose deposited goods or duplicate withdrawals. Reporting an error does not restore consistency. Treasury account transfers attempt compensation, but their error message claims restoration even if compensation itself fails.

**Done when:** Every two-document operation has a recoverable transaction record or reliable compensation/reconciliation path. Inject failure at each write boundary; total goods/value remain conserved or a pending recovery is clearly surfaced and safely recoverable. Never claim restoration without confirming it.

Evidence: `bank-ledger-orchestrator.js:62`, `:97`, `:146`, `party-treasury.js:85`, `storehouse.js:62`.

**Completed September 29, 2026.** All bank/treasury/storehouse inventory deposits and withdrawals, plus personal ↔ party treasury transfers, now persist an actor recovery journal before domain writes. Recorded before/after states are checked at each boundary. Failed transfers compensate only recognized changes and confirm restoration before reporting it. Failed compensation or journal cleanup retains the durable record, surfaces pending recovery, and blocks conflicting operations, including catalog grants and manual ledger edits. Rejected acknowledgements are reconciled against actual state; a completed transfer is finalized without replaying it. GM catalog grants remain separate single-document operations.

The DM Toolkit bank ledgers view lists pending bank and storehouse operations with snapshots and a **Retry recovery** action. Recovery survives restart, confirms committed/restored state, and refuses to overwrite unknown drift. See [Inventory transfer recovery](docs/INVENTORY-RECOVERY.md) for the workflow. Unexpected error messages no longer claim nothing changed without verification. A zero-quantity destination stack no longer adds an extra unit when withdrawing treasure.

Validation: `transaction-journal.test.js` (8 tests) and `transfer-recovery.test.js` (346 tests) pass. Failure injection covers journal preparation, both domain writes, compensation, cleanup, rejected acknowledgements after writes applied, pending-operation blocking, restart recovery, and state drift across 28 transfer variants. Existing BR-01 coverage passes. Independent source review, lint, type check, scoped diff checks, and JavaScript build to a temporary directory passed. Full suite: 600 passed, 1 failed; the sole failure remains the pre-existing combat numeral sizing mismatch (38 versus 37.75). Live Foundry UI/multiplayer rehearsal remains unperformed; BR-05's cross-client authority and replay work remains open.

### [x] BR-03 — Make purchases and cross-character drag/drop transactional

**Implemented.** Character-sheet drops classify player catalog purchases, gifts, loot, internal moves, and GM catalog grants before mutation. Quantity selection uses strict positive integers and live-source bounds. Existing placement and carrier-provisioning rules execute against detached inventories; payment for the selected quantity, destination changes, and source removal/reduction commit together through the durable journal. Cancellation, invalid tack, insufficient funds, stale destinations, and stale sources discard the draft without writing.

Partial transfers preserve the source remainder. Populated containers and livestock move with every descendant and remapped parent links; populated containers retain their identity during internal moves rather than merging away their parent document. Gifts, loot, and internal moves do not charge. GM catalog grants remain free. Store Lock gates purchases while permitting owned inventory transfers. No-room acquisitions require a valid inventory destination before purchase.

The journal now resolves each actor endpoint independently by UUID, updates full item state, locks related actors locally, blocks conflicting pending operations on either endpoint, and retains recovery when an endpoint is unavailable. The DM Toolkit recovery action resolves token inventories by UUID. See [Inventory transfer recovery](docs/INVENTORY-RECOVERY.md).

Validation: `character-sheet-drop.test.js` (35 tests), `drop-transaction.test.js` (5), `purchase-charge.test.js` (5), and `transaction-journal.test.js` (13) pass. Actual sheet-path failure injection covers writes before and after application for purchases, gifts, merges, container contents, livestock/tack, and carrier provisioning; compensation failure remains pending, blocks replay, and recovers safely. Coverage also includes strict quantities, partial/full moves, coin transfers, stale inventory, cancellation/dialog close, insufficient funds, GM grants, store locking, and empty/malformed destination stacks. Existing deposit and bank/store recovery tests pass. Full regression run: 649 passed, 1 failed; the existing combat numeral sizing mismatch (38 versus 37.75) remains the sole failure. Final focused sheet run, independent source/test review, lint, type check, scoped diff checks, and JavaScript build to a temporary directory passed. Live Foundry UI/multiplayer rehearsal remains unperformed; distributed authority/replay remains BR-05.

### [x] BR-04 — Preserve item identity when stacking

**Implemented.** A shared canonical snapshot comparison now governs bank treasure deposits, personal/party withdrawals, storehouse deposits/withdrawals, character-sheet stack merges, consumable-weapon stowing, and positive coin-change merges. It preserves unit value, magic modifiers, effects, descriptions, tags, images, flags, and all unknown custom properties. Only document metadata, quantity, placement, and proven treasure-derived totals are excluded. Object key order is normalized; arrays remain conservative. Invalid snapshots and differences in stored identity fields decline to merge.

Unique items never merge on either side. Legacy row-level uniqueness survives withdrawal, redeposit, and personal/party account transfers through an item-level marker on the recreated copy. Existing ledger rows are not migrated or rewritten. Readied or lashed copies are not targets for stored-item merges. Purchases can spend across separate same-denomination coin stacks while preserving their snapshots; ordinary change stays separate from customized coin stacks. Consumable-weapon stowing adds the complete moved quantity rather than assuming a single unit.

Validation: `stack-identity.test.js` (11 tests) and `stack-identity-integration.test.js` (17) pass. Actual personal/shared round trips preserve differently valued gems and modified/custom weapons, merge equivalent snapshots, keep unique copies separate, and retain legacy uniqueness. The character-sheet suite passes all 41 tests, including additional identity/uniqueness and consumable-stow checks; payment coverage includes separated coin stacks and custom change. All 346 recovery tests and existing source-validation tests pass. Full regression run: 686 passed, 1 failed; the existing combat numeral sizing mismatch (38 versus 37.75) remains the sole failure. Final focused sheet tests, independent source review, lint, type check, scoped diff checks, and JavaScript build to a temporary directory passed. Live Foundry UI/multiplayer rehearsal remains unperformed. See [Stack identity](docs/STACK-IDENTITY.md) for the comparison policy and legacy-data limits.

### [x] BR-05 — Serialize shared edits and make retries safe

**Implemented and live multiplayer acceptance completed September 30, 2026.** Personal/shared bank and storehouse changes, catalog grants, treasury transfers, and direct DM edits use one active-GM authority queue. Persisted started/completed receipts retain stable operation IDs and payload/requester fingerprints, coalesce in-flight retries, and return recorded replay results. Uncertain execution blocks new edits and exposes snapshot-based recovery in DM Toolkit → Bank Ledgers. Journal writes and compensation fence each boundary; completed/cancelled receipts remain retained after recovery.

**Done when:** One authority serializes related inventory/ledger changes across users and tabs; requests have stable operation IDs and safe retry/replay behavior. Test simultaneous player/GM actions, two owners, double clicks, delayed acknowledgments, reconnects, and GM handover. Repeated requests cannot duplicate value or erase another user's successful transaction.

The isolated Foundry v14.367 rehearsal reproduced a transport defect: the manifest omitted socket relay and the authority used an unsupported channel. The correction enables `socket: true`, uses `system.osp-houserules`, and discriminates inventory messages. Live rechecks passed mixed two-owner/GM edits with two same-profile GM tabs, direct treasury overlap, shared depletion, double clicks, replay and payload/requester mismatch, delayed acknowledgment/reconnect, lost completion receipt, cancelled replay after later success, unknown-drift refusal, and handover during domain writes and compensation. Final totals conserved all 40 gold and 20 rope; all 20 receipts were retained, with no pending journal. See [BR-05 multiplayer acceptance](docs/BR-05-MULTIPLAYER-ACCEPTANCE.md) for operation IDs, timestamps, snapshots, adapter scope, and evidence.

Validation: post-fix authority suite **13 passed**; post-fix inventory regression **632 passed** across 17 files. Independent socket-source review and acceptance-record review, repository quality lint, type check, and isolated JavaScript bundle passed. The earlier broad regression run remains historical evidence: 696 passed with the documented pre-existing combat numeral sizing failure (38 versus 37.75).

Browser Web Locks elect one executor across same-profile GM tabs; the active GM must use one browser profile/device. Foundry lacks server-side compare-and-swap; already-submitted writes and external edits remain subject to snapshot reconciliation. This rehearsal used real Foundry clients/documents/sockets through a disposable UI adapter, and does not replace an exhaustive audit of production dialogs. See [Inventory transfer recovery](docs/INVENTORY-RECOVERY.md). BR-06’s socket requester authentication boundary remains separate.

### [x] BR-06 — Verify permissions at mutation boundaries

**Confirmed trust boundary requiring validation.** Shared handlers authorize using the `userId` supplied in the message. Several personal bank functions described as DM-only do not check `game.user.isGM` themselves. Foundry ownership checks do not establish that a caller is entitled to every business operation on their own actor. Item observation is globally granted by a document override.

**Done when:** Establish how request identity is authenticated by the actual transport; reject forged/unauthorized requests at the authoritative boundary. Verify owner, observer, unrelated player, and GM behavior. Scope catalog visibility deliberately, including embedded items and unidentified/secret item information. Confirm store/player locks on every entry path. This audit did not attempt a live socket exploit.

Evidence: `party-treasury.js:40`, `storehouse.js:105`, `bank-ledger-orchestrator.js:212`, `src/module/item/item.js:3`.

**Completed September 30, 2026.** The [permissions acceptance record](docs/BR-06-PERMISSIONS.md) documents authenticated document-lifecycle transport, rejected forged requests, owner/observer/unrelated-player/GM checks, authoritative withdrawal locks, native catalog/embedded-item permissions, and the limits of confidentiality for replicated data. Live acceptance passed in the isolated rehearsal world; 648 tests across 19 files, lint, typecheck, release manifest validation, and production build passed. Deployment requires restarting Foundry and reloading clients to remove legacy socket executors.

## P1 — make the rules and calculations agree

### [x] BR-07 — Establish the release's authoritative house rules

**Conflict.** `docs/house_rules_v1.5.txt` and `data/ose_house_rules_v1_5.json` describe the campaign rules, but runtime profiles, hardcoded tables, and implementation documents disagree in places. Some may represent later intentional house-rule changes.

**Done when:** Record the approved rule for every conflict and create a rule-to-feature matrix marked automated, assisted/manual, or unsupported. Cover all sections: creation, races, classes, class abilities, healing/death, armor, combat, magic, conditions, equipment, encumbrance, criticals, occupations, languages, turning, and d6 skills. Resolve the source ambiguities: copper exchange notation, 30-foot base movement versus the encumbrance table's 40, missing 1201–1600 CW bracket, Mockery at level 3 versus 4, and bleed-out `1d3` versus `1d4-1`.

Evidence: house-rule JSON `general_rules.currency_standard`, `class_options`, `class_abilities`, `healing_and_death`, `combat.movement`, `encumbrance`; `docs/encumbrance-system.md`.

### [x] BR-08 — Correct character creation and racial modifiers

**Confirmed mismatch against v1.5.** Creation gives Humans no racial adjustments; the house rules specify +1 CHA and +1 CON.

**Done when:** Creation applies approved bonuses exactly once, rolls 4d6-drop-lowest in order, grants correct first-level maximum HP plus CON, enforces approved race/class requirements, handles manual-roll cancellation, and establishes correct languages, vision, and starting resources. Test all playable races and both race-as-class and separate race/class creation.

Evidence: `src/module/actor/character-creation-dialog.js:25`; house-rule JSON `general_rules` and `character_races.adjustments.Human`.

**Approved September 30, 2026.** Creation exceptions retain free assignment and the minimum raw ability-pool total of 66. Existing non-Human modifiers remain; Human receives +1 CON/+1 CHA and adjusted scores are capped at 18. Profile requirements are checked after adjustment. First-level HP includes negative CON modifiers. Drow is unavailable. The approved starting grant is commoner's clothes, boots, belt, and a coin purse with 3d6 × 10 silver; INT bonus languages use the sheet's checkbox/custom menu.

Completed 2026-09-30. All 66 focused regression tests pass, covering all seven playable races, all six race-as-class paths, separate race/class paths, one-time modifiers and the 18 cap, requirements, first-level maximum HP with positive/negative CON, manual-roll cancellation, language counts, atomic creation, and source metadata preservation. Every possible starting grant from 30 through 180 silver preserves value and fits within the 100-coin purse using the fewest 10:1 silver-to-gold exchanges. Lint, typecheck, syntax checks, and build pass; the previously recorded full-suite combat-value-sizing failure remains unrelated. Live Foundry v14 build 367 verification of BR08 Test Human Fighter confirms saved STR 16, INT 17, WIS 11, DEX 17, CON 18, CHA 15; current/max HP 11; level 1 and XP 0; Trade Tongue plus selected Elvish and Gnomish; commoner's clothes, boots, belt, and coin purse; 80 silver coins inside the purse; and enabled basic vision with range 0. The saved character appears in the actor directory and no character-creation errors were recorded. Live evidence is for Human/Fighter; the automated tests supply coverage of the other races and creation modes. Foundry's v14 creation entry point now uses its four-argument signature and awaits custom creation without dereferencing a cancelled actor. The current bundle was copied into the isolated development system after discovering its older copied bundle.

### [x] BR-09 — Correct dwarf saves and validate all saving throw tables

**Confirmed.** Dwarf bonuses read `system.abilities.con`; the actual score is under `system.attributes.con`, so the bonus uses the fallback score of 10.

**Done when:** Fix the field path; test every CON boundary and applicable save category. Check every class/race save progression, WIS magic modifiers, magic items, situational modifiers, and any deliberate minimum-save clamp against the approved rules.

Evidence: `src/module/actor/actor.js` and `src/module/actor/saving-throws.js`; [saving-throw contract](docs/BR-09-SAVING-THROWS.md).

Completed 2026-10-01. CON uses `system.attributes.con`; every baseline class and race-as-class save row is validated against bundled Tome v1.3 text, and custom classes against approved house-rule tables. Dwarf/Hobbit/Gnome CON resistance and WIS magic modifiers are contextual, with separate Death/Poison targets and no duplicate innate resistance for demihuman class tables. The user confirmed retaining minimum target 2. Item/situational modifiers remain explicit manual inputs with sheet guidance; no automatic equipment aggregation or new save-roll UI is claimed. All 60 saving-throw tests and 7 actor-creation tests pass; independent verification, lint, typecheck and build pass. Full suite: 841 passed, one pre-existing combat-value-sizing failure, identical to the baseline. Live Foundry UI verification was not performed.


### [x] BR-10 — Replace weapon prohibition with the house-rule proficiency behavior

**Confirmed mismatch against v1.5.** Class permissions prohibit taking certain weapons in hand. Your rule permits any class to use weapons, with -2 to hit and damage capped at class HD outside proficiency. The attack calculation does not apply those consequences.

**Done when:** A non-proficient character can wield and attack with the weapon; both penalties apply consistently to every attack path and appear in chat. Preserve separate physical size/hand/STR restrictions. Define how the HD cap interacts with bonuses/critical damage. Give the GM a clear cleric non-blunt-weapon warning or manual consequence workflow.

Evidence: `src/module/combat/weapon-policy.js`; `src/module/actor/sheets/handlers/item-handler.js`; `src/module/helpers-macros.js`; `src/module/helpers-chat.js`; house-rule JSON `general_rules.unrestricted_weapon_use`; [weapon proficiency contract](docs/BR-10-WEAPON-PROFICIENCY.md).

Completed 2026-10-01. Class weapon lists now determine proficiency rather than forbid use: outside the list, -2 to hit and final damage capped at class HD after bonuses/critical dice, per user approval. Physical size/hand and explicit item STR checks remain. Sheet and hotbar attacks share one pipeline, including manual dice, target/critical, ammunition and cancellation handling. Raw damage remains visible; effective capped damage drives chat normal/double/half actions and popups, including manual cards. Cleric non-blunt attacks carry a GM deity-risk warning. All 23 BR-10 tests pass; the full suite has 864 passes and the single pre-existing combat-value-sizing failure. Independent verification, lint, typecheck and build pass. Live Foundry UI verification was not performed.


### [x] BR-11 — Reconcile class progression, prime requisites, and racial level caps

**Confirmed source discrepancies.** Runtime XP maps many classes into four generic progressions; the profiles contain class-specific data. Mage is d4 in runtime configuration but d6 in the custom class rule; its prime requisites also differ. UI racial caps cover race-as-class only, while actor level is independently derived from XP without race-based limits.

**Done when:** Use approved per-class XP, HD, attack progression, prime-requisite bonus rules, and race/class maximums everywhere. Test every threshold through the supported cap and prevent XP preparation from undoing a cap. Avoid treating a display-only calculated HP value as actual rolled HP.

Evidence: `src/config/progression.js`, `src/config/classes.js`, actor preparation and level-up, creation and race/class/XP sheet handlers; `src/config/progression.test.js`, `src/module/actor/progression-behavior.test.js`; [BR-11 contract](docs/BR-11-CLASS-PROGRESSION.md).

Completed 2026-10-01. Exact per-class XP, HD, attacks, prime requisites and XP bonuses use the approved source tables, including custom replacements. Approved custom racial eligibility/caps are enforced across creation, actor preparation, attacks, HP level-up and sheet displays. Excess XP remains stored while levels and progression stop at the cap. Fixed post-named-HD HP gains omit CON; actual rolled HP is preserved and estimates remain display-only. Existing referee-only class choices are preserved. All 86 BR-11 tests pass; full suite has 950 passes and the single known pre-existing combat-sizing failure. Lint, typecheck, build and independent source recheck pass. Live Foundry UI verification was not performed.

### [x] BR-12 — Unify XP awards and make level-up completion resumable

**Confirmed.** Party XP adds an unmodified share; the DM toolkit applies each actor's XP modifier. Level-up writes `lastKnownLevel` before HP rolls complete; a cancelled roll leaves a manual repair requirement. Multiple active owners can enter the level-up hook.

**Done when:** All award paths use one approved calculation, rounding/remainder policy, and audit record. Awarding twice accidentally is preventable/recoverable. HP and skill allocations complete exactly once across clients, multi-level gains, cancellations, disconnects, and retries. Validate class-specific post-name-level HP rules and migration of pre-existing HP.

Evidence: `src/module/progression/xp-awards.js`, `src/module/progression/progression-authority.js`, `src/module/actor/level-up.js`, `src/module/actor/level-up-state.js`, party/DM award screens and skill allocation; [BR-12 contract](docs/BR-12-XP-AND-LEVEL-UP.md).

Completed 2026-10-01. Both award screens use the shared modifier/rounding calculator. Party remainders carry into the next party pool; individual modified shares round half up. Durable plans, atomic actor receipts and one active-GM executor support duplicate requests, partial recovery, lost acknowledgments and safe latest-award undo. Elected-owner prompts and per-level claims/markers make multi-level HP and skill credit resumable without repeating completed gains; caps, fixed HP and legacy balances are preserved. Initial skill pools and fractional save-and-combine credits follow the approved rules, with atomic versioned allocations. All 39 focused BR-12 tests pass, including independent verification and two GM tabs. Full suite: 980 pass and the single known pre-existing combat-sizing failure. Lint, typecheck and build pass. Live Foundry browser verification was not performed.

### [x] BR-13 — Reconcile coin weight, carrying capacity, and movement

**Conflict plus confirmed internal inconsistency.** Actor encumbrance uses STR × 15 pounds and racial 30/40-foot speeds; v1.5 specifies CW bands plus STR adjustments and running at twice encounter speed. The actor uses three times speed for dash. The token ruler then divides the already-labelled encounter speed by three in combat. Currency code assumes 10 copper per silver, while the rule reference needs its copper notation resolved.

**Done when:** Agree on one unit/conversion model, exchange table, movement table, and running rule. Sheet, ruler, tokens, purchases, coin stacks, and container displays agree at every boundary. Include mount/vehicle-carried cargo, nested containers, zero quantities, overloaded actors, and legacy weight conversions. Preserve later intentional rules by updating their reference rather than silently reverting them.

**Completed 2026-10-01.** Approved pound-based STR thresholds, racial encounter movement, run ×2 and exploration ×3 now share calculations across actor and ruler. Packed containers consume only their own bulk in the parent, while contents consume immediate-container capacity and weight is counted once. Normalized zero quantities, legacy CW conversion and transitive mount/vehicle cargo are covered. Exact catalog review preserves custom/uncertain items and inventory state, with GM authority, durable receipts, recovery and guarded undo.

Validation: 94 focused tests pass; full suite 1,021 passed and one pre-existing combat numeral sizing failure; lint, type checking, build and release validation pass. Independent read-only verification passed. Live Foundry QA remains manual.

Evidence: `docs/BR-13-ENCUMBRANCE-AND-MOVEMENT.md`; `docs/encumbrance-system.md`; `src/module/inventory/encumbrance.js`; `src/module/inventory/bulk.js`; `src/module/inventory/catalog-reconciliation.js`; `src/module/actor/token-ruler.js`.

### [x] BR-14 — Make initiative defaults follow the campaign rules

**Confirmed mismatch against v1.5.** New worlds default to group initiative and resetting initiative. The house rules call for individual initiative with DEX and a fresh roll each round.

**Done when:** New-world defaults and existing-world upgrade behavior match the approved rules. Verify DEX, ties, defeated combatants, surprise, cancellation, next-round hooks, and manual dice. Keep alternate modes only as intentional configuration.

**Completed 2026-10-02.** Individual/fresh-round defaults and one-time existing-world migration are implemented, with alternate modes retained. Manual dice, declared-action speeds, hidden original-roll hundredths, separate exact-tie keys, acted-turn eligibility, explicit defeat, opening-round surprise and resumable batches follow the approved rules. The minimum example is corrected: 1.27 − 4 clamps to internal 1.27, displayed 1.

Validation: 56 focused tests pass; the broader suite has only the known numeral sizing failure. Lint, type checking, build and release validation pass. Independent read-only verification passed. Live Foundry QA remains manual. See `docs/BR-14-INITIATIVE.md`.

Evidence: `src/module/settings.js:27`; `src/module/combat/combat.js`; `src/module/combat/combatant.js`; house-rule JSON `combat`.

### [x] BR-15 — Complete the combat/class ability support contract

**Validation and support gaps.** A single attack roll per click is not itself a defect, but the system needs a reliable way to communicate and track permitted extra attacks and other class features.

**Done when:** Validate Fighter attacks at 4/9, Knight/Paladin/Ranger/Warden attacks at 5, talent selection at 1/3/7, specialization bonuses, two-weapon penalties, cleave, defender, and other listed talents. Check range, STR/DEX, armor DEX caps, armor STR requirements and Knight exception, shields, aiming, charging, reach, retreat, blind fighting, helpless targets, missile fire into melee, oil/splash, reload, ammo consumption, and weapon switching. For each, provide correct automation or a documented assisted/manual workflow; do not imply automation that is absent.

**BR-15 approval, 2026-10-02:** Track normal attacks remaining per round automatically, with a warning when exhausted and a GM override. Completed rolls spend one attack whether hit or miss; cancelled rolls spend none. Opportunity attacks use the same allowance. Fighter allowances are 1/2/3 at levels 1/4/9; Knight/Paladin/Ranger/Warden allowances are 1/2 at levels 1/5. The GM may grant conditional extra attacks such as Cleave. User: “Agreed”.

Evidence: house-rule JSON `class_options`, `class_abilities`, `armor`, `combat`, `equipment.property_legend`; `item-handler.js` attack/equip paths.

**BR-15 assisted-effects approval, 2026-10-02:** For combat effects requiring situational judgment (including a valid charge, Cleave killing blow, and Defender applicability), the player or GM confirms applicability; Foundry applies the stated modifiers and tracks their duration. User: “agreed”. Talent selection follows v1.5 page 10: Weapon Specialization or Two-Weapon Fighting at level 1; Cleave, Defender, Leader, or Slayer at levels 3 and 7. The proposed repeat-specialization policy was withdrawn.

**Completed 2026-10-02:** Per-combatant attack reservations and counters, talent selection/bonuses, confirmed situational modifiers and charge/aim/parry duration support are implemented. The full rule-to-feature contract and manual workflows are recorded in `docs/BR-15-COMBAT-SUPPORT.md`. 73 focused regression tests pass; lint/typecheck, build and release validation pass. Latest broad run: 1,102 pass and the known unrelated sizing failure; final unarmed correction was verified in its affected 30-test suite. Independent source review passed. All 347 BR-07 source-rule values are preserved. Live Foundry acceptance remains unperformed.

### [x] BR-16 — Complete spellcasting acceptance

**Confirmed missing behavior in inspected cast paths, plus validation.** Current cast handlers post a card and update slots/memorized counts; they do not perform the required wild-magic to-hit roll. Focus possession and physical spellbook/page/loss rules need an explicit support policy.

**Done when:** Every applicable cast includes the boon/bane check or a clear required manual prompt. Validate Read Magic, bonus slots and exclusions, Cleric WIS 15 exception, Paladin/Ranger earlier access, arcane learning/memorization, divine preparation, reversed spells, resting/reset, and unavailable spells. Prevent double-click casts and partial slot/memorization writes from giving free casts or losing resources.

Evidence: `src/module/actor/sheets/character-sheet.js:1835`, `:1917`, `:2173`, `:2232`; house-rule JSON `spells` and class adjustments.

**Completed 2026-10-02:** Canonical, authenticated spell state now handles physical focus/books/pages, copying and next-level retries, class slots, rest, normal/reversed preparation, prepared/external casts, separate wild magic and durable recovery. Forty-one focused tests pass, including the final physical-focus guard. Full suite: 1,143 passed, one known pre-existing combat-sizing failure; lint, typecheck, build and release validation pass. Independent read-only review found no blocking defect. External eligibility, charges and target effects remain explicit table procedures. No live Foundry acceptance was performed. See `docs/BR-16-SPELLCASTING.md`.

**BR-16 wild-magic approval, 2026-10-02:** A natural 1 triggers a GM-adjudicated Bane without automatically failing the spell. The spell resolves normally unless the adjudicated Bane changes its outcome. User: “Agreed”.

**BR-16 focus approval, 2026-10-02:** Each caster designates an actual inventory item as their spellcasting focus. Casting is blocked if it is missing or confirmed unavailable, with a GM override for exceptions. User: “Yes”.

**BR-16 spellbook approval, 2026-10-02:** Link recorded arcane spells to individual physical Spellbook items and enforce their catalog 100-page capacity, using one page per spell level. Missing, destroyed or unavailable books block new memorization from them. Already memorized spells remain available until cast. User: “Agreed”.

**BR-16 separate-check approval, 2026-10-02:** Every cast makes a separate, unmodified d20 wild-magic check for Boon/Bane. Normal spell attacks and saving throws resolve separately. User: “Agreed”.

**BR-16 cast-source approval, 2026-10-02:** Wild magic applies to actual spell casts regardless of source, including scrolls, wands/staves and innate spellcasting. Ordinary potion use and passive magic-item bonuses are excluded. User: “Agreed”.

**BR-16 bonus-slot approval, 2026-10-02:** INT/WIS bonus spell slots are usable only after the class has unlocked that spell level. They do not unlock higher spell levels early. User: “Agreed”.

**BR-16 earlier-access approval, 2026-10-02:** For Paladin and Ranger, WIS above 15 advances only initial spell access by one character level per point above 15. Use the first spellcasting row during early access; subsequent slot increases and higher spell levels follow the normal class table. The proposed whole-table advancement was not approved. User: “Agreed” to the conservative recommendation after balance discussion.

**BR-16 copying approval, 2026-10-02:** Spellbooks are libraries and may hold more distinct spells than daily memorization allows, subject to physical page capacity. Use the OSE advanced INT-based copying check, but failure is not permanent: another attempt is allowed after the character gains a level. User: “Use the copying check, but if it fails, the player can try to copy it again at next level. It's not. permanent failure.” This overrides the baseline permanent-failure rule.

**BR-16 starting-library approval, 2026-10-02:** For Magic-Users and Illusionists, automatically granted Read Magic is additional to the INT-based starting spell allowance. It still occupies one spellbook page and uses a normal daily memorization slot when prepared. User: “Agreed” to the additional-spell recommendation.

### [x] BR-17 — Validate exploration, skills, and noncombat class features

**Validation.** Existing exploration tests are useful but do not prove the complete class/race matrix.

**Done when:** Verify d6 thief skills, initial/per-level expertise including fractional accrual, 5-in-6 ceiling, armor penalties, pick-pocket victim adjustments and detection on 6, disguise-kit requirement, listening/searching secret checks, racial detection, Ranger tracking plus WIS, Mage percentile skills plus INT, Beast Master companion limits, Warden abilities, Bard uses, turning undead sequence/interruption, languages, and occupation/background features. Clearly mark referee-managed effects and enforce secrecy of private checks.

Evidence: `src/module/actor/exploration-skills.js`, `src/module/dialog/skill-point-dialog.js`, character sheet skill handlers; house-rule JSON `custom_classes`, `class_abilities`, `miscellaneous`, `occupations`.

**BR-17 completed, 2026-10-02:** Added the Exploration control with authenticated GM-private skill checks, durable private journals and explicit interrupted-roll recovery; no private results/modifiers enter public receipts. Corrected class d6 eligibility, racial/trained hearing separation, armor/Pick Pockets, full INT/WIS checks, Disguise Kit gating, language preservation and class metadata. Referee-managed procedures cover Beast Master, Warden, Bard, turning, Mage limits and occupations; automatic narrative effects/counters remain explicitly unsupported. See `docs/BR-17-EXPLORATION-AND-SKILLS.md`. All 104 tests in affected files pass. Full suite: 1,182 passed, only the known pre-existing numeral-sizing failure. Lint, typecheck, build and release validation passed; independent review cleared the final quantity compatibility correction. All 347 original matrix source values preserved, 50 support records updated. No live Foundry verification performed.

**BR-17 hearing approval, 2026-10-02:** Use the better of racial hearing and trained Hear Noise, without stacking. A racial 2-in-6 applies while the trained chance is 1 or 2; a trained chance of 3 or higher takes over. User: “Yes” to this recommendation.

### [x] BR-18 — Specify and validate health, conditions, and critical results

**Validation/support gap.** A critical-hit label or doubled damage does not implement the full critical and injury tables.

**Done when:** Support the approved natural healing minimum, death below zero, save at exactly zero, incapacitation, bleed-out, stabilization, prone/unconscious effects, critical hit/miss tables, and injury consequences. Provide timers/modifiers or explicit GM reminders and reference access. Test damage/healing boundaries and undo. Resolve the bleed-out dice ambiguity under BR-07 first.

Evidence: house-rule JSON `healing_and_death`, `conditions`, `critical_hits`, `critical_misses`; `item-handler.js:2118` and damage/chat handlers.

**BR-18 completed, 2026-10-02:** Added canonical Health & Conditions controls, negative-HP death, exact-zero saves, 1d4+1-round bleed-out with falling-round exclusion, kit stabilization, natural/magical recovery, recorded condition modifiers/restrictions and latest-state undo. Chat, rest and monster damage use authenticated health authority with durable recovery. Current v1.5 critical tables, nested injury rolls, clamped Melee adjustment and reroll-ones are integrated; injury consequences and durations have complete GM references and explicit manual procedures. The future replacement critical system remains deferred. See `docs/BR-18-HEALTH-CONDITIONS-CRITICALS.md`. All 74 tests in six directly affected files pass; full suite: 1,226 passed, only the known BR-19 numeral-sizing failure. Lint, typecheck, build and release validation passed. Independent review found no material blocker. All 347 matrix source values preserved, 60 support records updated. No live Foundry verification performed.

**BR-18 stabilization approval, 2026-10-02:** Stabilizing the zero-HP bleed-out condition with a Healer's Kit uses one combat action and succeeds automatically, without an ability check, provided the kit and injured character are within reach. It stops the bleed-out timer and leaves HP unchanged. User: “Agreed”. Injury-specific restrictions, including magical-only stabilization for catastrophic torso injury, remain governed by the approved injury tables.

**BR-18 recovery approval, 2026-10-02:** After stabilization at 0 HP, the character remains Incapacitated until natural or magical healing restores at least 1 HP. Separate injury effects retain their own recovery requirements. User: “Agreed”.

**BR-18 bleed-out timing approval, 2026-10-02:** Exclude the round in which the character falls to 0 HP. Count down the approved 1d4+1-round timer at the end of each subsequent round; death occurs when the timer reaches zero unless healed or stabilized first. Example: falling in round 4 with a two-round timer means death at the end of round 6. User: “Agreed”.

**BR-18 condition stacking approval, 2026-10-02:** Attacks against an Incapacitated character who is also Prone receive +4 total from those conditions. Incapacitated's +4 replaces Prone's +2; they do not stack to +6. User: “Agreed”.

**BR-18 critical-injury range approval, 2026-10-02:** For the current v1.5 critical system, clamp the Major Injury roll after the applicable Melee bonus to 1–100. Example: 99 + 3 resolves as 100 (catastrophic head injury). User: “Yes, but I have a different critical hit system I plan on implementing later”. The replacement is future work; retain the approved current system for BR-18 and isolate critical-table resolution so it can be replaced without changing core health, stabilization or condition rules. No replacement rules have been supplied or approved.

### [ ] BR-19 — Restore a green test baseline

**Original failure, now fixed.** Combat numeral sizing expected 37.75 but returned 38. These source/test files were already untracked at audit start; this review did not introduce the failure.

**Done when:** Decide the intended sizing, align implementation and expectation without merely weakening the test, visually confirm representative values, and pass the complete suite from the release commit. Add regression cases for BR-01 through BR-18 as relevant.

Evidence: `src/module/actor/sheets/combat-value-sizing.test.js:9`.

**BR-19 sizing approval, 2026-10-02:** Use responsive combat numerals: target visible ink at 38% of the frame height (half of the 76% inner area), shrink to fit a 70% frame-width cap, and recalculate for sheet resizing and font loading. Preserve existing typefaces and frame appearance. User: “prefer responsive sizing”. The historical 37.75 expectation is superseded by this explicit 38% rule.

**BR-19 workspace baseline restored, 2026-10-02:** Responsive sizing is connected to the actual sheet and CSS, with rerender/close cleanup and input/tab/resize/font-load updates. Nine geometry/lifecycle tests pass; all 1,233 tests across 61 files pass with `--hookTimeout 30000 --maxWorkers 2`. Production build, lint, typecheck and release validation pass; independent review passed all implementation criteria and nine focused tests. Representative numeral values were visually confirmed using production markup/CSS/helper in an isolated Chrome fixture; narrow-label limitations are documented. See `docs/BR-19-RESPONSIVE-COMBAT-NUMERALS.md` and `docs/qa/BR-19-responsive-numerals.png`. The checkbox remains open solely for the stated final release-commit test requirement: current results describe the shared workspace, and no release commit was created or claimed as tested. No live Foundry verification performed.

## P2 — prove the release and make it operable

### [x] BR-20 — Validate the complete inventory placement matrix

**Validation.** Capacity, allowlist, and ammo tests cover components; they do not establish every drag/drop route.

**Done when:** Exercise all item types through purchase, copy, move, split, merge, delete, equip, sling, lash, belt, scabbard, ammunition container, storage, mount, tack, and vehicle routes. Actor calculations, UI capacity, and admission checks must agree. Reject containment cycles; repair orphan references; preserve children when moving/deleting parents. Include renamed containers and customized catalog items.

Evidence: `character-sheet.js` drop handlers, `item-handler.js`, `src/module/inventory/container-capacity.js`, `src/module/actor/actor.js` capacity preparation.

**BR-20 container deletion ruling, 2026-10-02:** When deleting a populated container, show a dialog offering to move its contents to other compatible containers with available space, drop them, or cancel. Do not automatically delete the contents or silently place them in uncontained inventory. Preserve nested items when relocating or dropping their parent. User clarified that this is the intended existing method. The related Store / Drop / Cancel dialog currently exists for unlashing; the container-delete route must be brought into agreement.

**BR-20 naming ruling, 2026-10-02:** Players cannot rename equipment; no rename feature is planned. Use catalog names and entries. Unexpected imported/legacy names remain negative validation cases, with explicit custom metadata preserved.

**BR-20 implementation and evidence, 2026-10-02:** Populated deletion now collects move/drop/cancel destinations before a recoverable actor-and-scene transaction. Nested ground payloads, explicit orphan repair, cycle rejection, physical-type admission, automatic storage restrictions, and slot-cost checks are covered by automated tests. See `docs/BR-20-INVENTORY-PLACEMENT.md` for the route matrix and the manual ground-pickup limitation. Final workspace verification passed: 1,299 tests across 66 files (`--maxWorkers=2 --hookTimeout=30000`), lint, typecheck, build, and release manifest validation for v1.0.12. Independent review passed, including 43 final focused tests. Catalog/transfer paths cover all eight physical template types; spell/ability storage rejection and deletion cover the remaining two. Live Foundry GM/player/browser acceptance remains BR-21; no release commit was created.

### [ ] BR-21 — Run actual Foundry v14 acceptance with GM and player clients

**Validation.** The manifest claims v14, while some guidance still says v13/AppV1. Passing a bundle build does not prove live API compatibility.

**Done when:** Record the exact Foundry build and browser versions tested. In an isolated world, test startup, actor creation, character/monster/item sheets, combat and morale, token ruler, chat/damage actions, party XP, spells, banks/stores, macros/hotbar, imports, and settings. Exercise virtual/manual dice, cancellation, permissions, two players, and reconnect. No uncaught errors, broken workflows, or unexplained deprecation dependencies remain.

Evidence: `system.json:9`, `LOCAL-DEVELOPMENT.md`, `CLAUDE.md`, `src/ose.js` registration.

**BR-21 preparation, 2026-10-02:** User approved a fresh isolated Westford copy. Foundry 14.367 / Node 24.21.0 successfully loaded this checkout (manifest 1.0.12), independent world/compendium data, and a localhost-only test endpoint. The server was stopped cleanly. Browser navigation was denied because the browser tool could not verify its administrator-enforced security policy; no workaround was attempted. All GM/player UI and multi-client acceptance remains pending. See `docs/BR-21-LIVE-ACCEPTANCE.md` and `docs/qa/BR-21-environment.json`. BR-21 remains open.

### [ ] BR-22 — Verify sheet isolation, persistence, and practical usability

**Validation.** Earlier lifecycle defects were partly repaired; do not assume the historical audit still describes the active implementation. The old global-selector UI module appears unreferenced in the current entry graph.

**Done when:** Two character sheets plus item/bank windows stay isolated; repeated open/render/close cycles do not duplicate actions or retain timers/listeners. Notes and backgrounds survive blur/close/reload. Test player read-only displays, long names, large numbers, normal browser zoom, a laptop viewport, scrolling, keyboard activation, tooltips, fonts, and missing-image fallback.

Evidence: `src/module/actor/sheets/character-sheet.js:1576`, templates and sheet handlers.

**BR-22 code work, 2026-10-02:** Implemented instance isolation, queued character saves, close-time flush/failure recovery, scoped tooltip/timer disposal and item-card drag cleanup. Added 20 focused character/item/card/bank lifecycle tests. All 1,319 tests across 71 files pass; lint, typecheck, build and release validation pass. Live multi-window usability, real blur/reload persistence, keyboard, laptop viewport, fonts and fallback images remain pending because the BR-21 browser-policy verification failure is unresolved. See `docs/BR-22-SHEET-LIFECYCLE.md`. BR-22 remains open.

### [ ] BR-23 — Create a tested world-upgrade and rollback procedure

**Confirmed process gap.** Migration guidance is a placeholder and upgrade utilities remain scattered. `test-upgrades` upgrades npm dependencies; it is not a world-data migration test.

**Done when:** Ordered, versioned, idempotent migrations handle legacy weights, containers/lashing, item fields/images, HP/level flags, bank/store data, and compendiums. Dry-run against a backed-up representative old world; compare counts, values, HP, XP, and references before/after; rerun safely; prove restoration from backup. Do not use the live campaign as the first migration test.

Evidence: `migrations/README.md`, `scripts/migrate-*.js`, `scripts/test-upgrade.js`.

**BR-23 offline M1, 2026-10-03:** Added a pure five-step JSON migration registry and copy-only dry-run/apply/restore procedure. Current catalogs supply missing defaults; ambiguous conversions, malformed values/references, and pending inventory journals block. Preserves campaign values and existing progression history; version markers commit last. All 21 focused regressions pass, with internal verifier acceptance. CLI evidence proves source unchanged, repeat no-op, byte-exact backup/restore and corrupt-backup rejection with no output. See `docs/BR-23-OFFLINE-MIGRATIONS.md` and `docs/qa/BR-23-M1/`. Independent review accepted by Paul’s report, with formatting issues noted. Representative old-world reconciliation, native Foundry/database rollback, runtime integration and production verification remain pending. BR-23 remains open; production changes, shutdown, publish, deploy and merge require approval.

**BR-23 Citadel capture, 2026-10-03:** Paul approved a closed capture of current Citadel Westford. Source hashes remained unchanged, all 3,205 entries match the transferred baseline and independent working copy, and Westford restarted healthy. Immutable originals are held privately; no test copy was launched or migrated. Shared asset dependencies, exact application build, reconciliation, native export/migration and rollback tests remain pending. See `docs/BR-23-CITADEL-WESTFORD-CAPTURE.md`. BR-23 remains open.

### [ ] BR-24 — Prove installation from the exact release artifact

**Validation.** The current validator checks loose local files and URL shape. CI uploads an artifact but does not publish a tagged release or prove that the manifest/download endpoints deliver installable content. The configured manifest URL also needs verification as a direct JSON endpoint.

**Done when:** A clean checkout with locked dependencies passes checks and produces the versioned ZIP; inspect the ZIP's manifest and every required runtime path; install it into a clean Foundry data directory using the intended URL; start a fresh world. Validate actual endpoint responses, version compatibility, tag/source identity, and checksums. Include fonts, language files, templates, data, artwork, and packs. Publishing itself requires a separate authorized release action.

Evidence: `scripts/validate-release.js`, `scripts/package-release.js`, `.github/workflows/quality.yml`, `system.json`.

### [ ] BR-25 — Make compendium and catalog releases reproducible

**Confirmed release risk.** Local pack files are dirty and the packager recursively copies mutable LevelDB directories. An existing archive includes operational database files. Those facts do not prove corruption, but a directory-exists check cannot establish consistency.

**Done when:** Build or export packs from a consistent, closed snapshot using a documented process. Reopen packaged databases and verify counts, document types, schemas, images, costs, weights, tags, armor, damage, ranges, and spell references against approved catalogs. Define which database files must ship rather than deleting internals blindly. Reconcile the local pack changes and source-vs-dev-overlay content before release.

Evidence: `scripts/package-release.js:25`, `LOCAL-DEVELOPMENT.md`, current pack changes, `data/*.json`.

**BR-25 milestone 1, 2026-10-03:** Implemented a standalone closed-snapshot/export/round-trip tool with 11 passing focused tests and matching synthetic content identities across Node 22, Node 24 and snapshot rehydration. Ready for independent QA; actual-source capture failed closed because all three declared database locks are held. No campaign-pack snapshot was published. Read-only host inspection identified PID 3035 in `foundryvtt_narlington` on `the-citadel`; obtaining a closed real snapshot requires an approved graceful shutdown or verified closed backup. The original packager, catalogs, world data and development overlay remain untouched. Catalog fidelity, overlay reconciliation and release acceptance remain open. See `docs/BR-25-CLOSED-SNAPSHOT.md` and `docs/qa/BR-25-M1/`.

### [ ] BR-26 — Expand checks around high-risk behavior

**Confirmed coverage limitation.** Existing lint/type gates are narrow. Passing tests currently concentrate on small inventory/combat helpers, not the full campaign workflows.

**Done when:** Add focused regression tests for identified defects, actor creation/preparation, class thresholds, XP/HP, spell resources, transfer failures, concurrent requests, and migrations. Add startup/multi-sheet integration checks and archive-content validation to CI. Broaden static checks around modified/high-risk modules. A wholesale TypeScript rewrite is not required.

Evidence: `tsconfig.quality.json`, `scripts/quality-lint.js`, `vitest.config.js`, `.github/workflows/quality.yml`.

### [ ] BR-27 — Validate untrusted content and dependency health

**Validation.** DOMPurify is present, but its presence does not prove every dynamically generated dialog/chat/import path is safe. A past offline audit does not establish current dependency health.

**Done when:** Check hostile names/descriptions/HTML, malformed imports, invalid numeric values, dangerous image links, and rich-text persistence at actual entry points. Verify private roll visibility. Perform a current dependency audit and resolve material reachable issues, documenting exceptions. This review made no claim about current vulnerability status.

Evidence: `src/ose.js:6`, dynamic dialog/chat renderers, import paths, `package.json`, `package-lock.json`.

### [ ] BR-28 — Update player/GM and release documentation

**Confirmed.** README describes unconditional unpause; import guides reference absent datasets and old pack names; developer notes claim no tests and describe v13. These are stale instructions.

**Done when:** Provide current install/upgrade steps, defaults, character setup, inventory purchase/gift behavior, bank/store permissions, dice modes, XP/level-up, spell reset, manual rules, backup/recovery, known limitations, and a release changelog. Correct or archive historical comparisons. A new GM can set up a world without console archaeology.

Evidence: `README.md:16`, `:47`; `QUICK-REFERENCE.md:22`; `docs/ITEM-IMPORT-README.md`; `CLAUDE.md`.

### [ ] BR-29 — Define distribution contents and sustained-use limits

**Validation; public distribution is conditional.** The packager copies entire data/assets/templates trees, including rule-reference material and any workshop files within those trees. Ledger/store logs grow without an evident retention policy.

**Done when:** Audit the actual archive; exclude unnecessary development material and sensitive local content. For distribution beyond the private campaign, establish rights/attribution for included rules text, artwork, fonts, and other content; do not assume all reference material is redistributable. Load-test representative large inventories, spell lists, and long ledger histories; establish archive/export/retention and backup procedures where needed.

Evidence: `scripts/package-release.js:13`; `data/advanced_fantasy_players_tome_v1_3.json`, other reference JSONs, `assets`; ledger/store log append paths.

### [ ] BR-30 — Complete a campaign rehearsal and freeze the release

**Validation.** Final acceptance must exercise the whole play loop on the actual release candidate.

**Done when:** On a backed-up copy of the campaign, run: create characters → buy/equip → explore → fight → cast → take damage/heal → collect/store/transfer treasure → award XP/level → rest → disconnect/restart. Use one GM and at least two player clients. Reconcile inventory value, HP, XP, spells, and ownership before/after. Record exact versions, residual manual limitations, backup/restore evidence, and the accepted source/artifact. No P0/P1 defects remain; all applicable P2 gates have evidence.

## Recommended burn-down order

1. Establish BR-07's rules baseline while repairing BR-01–BR-06 state integrity.
2. Close BR-08–BR-19 rules/calculation defects and support gaps with focused tests.
3. Run BR-20–BR-23 inventory, runtime, UI, and upgrade acceptance.
4. Close BR-24–BR-29 release, quality, documentation, and operational gates.
5. Complete BR-30 on the exact candidate; release only that accepted artifact.

Large-file refactoring, framework modernization, additional artwork, broader localization, and optional automation can follow production unless a specific acceptance failure makes them necessary. File size alone is not a release blocker.

**BR-25 M1 R1 correction:** Original sealed artifacts failed independent QA: a damaged WAL silently exported one of two records. The bounded WAL preflight correction and new artifacts are recorded in `docs/qa/BR-25-M1-R1/`; independent retest is required. Original failed artifacts remain preserved. Complete SST checksum coverage, real closed-pack capture and full BR-25 acceptance remain pending.

**BR-25 M1 R2 correction:** R1 independently passed its bounded WAL fix; broader SST corruption was independently reproduced and requires the R2 preflight safeguard. R2 evidence and exact artifacts are recorded under `docs/qa/BR-25-M1-R2/` for independent retest. Full BR-25 remains open; no real packs or production state were changed.
