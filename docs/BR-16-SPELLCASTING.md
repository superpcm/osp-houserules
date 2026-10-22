# BR-16 — Spellcasting acceptance

Status: COMPLETE — 2026-10-02. The automated and assisted/manual support contract is implemented and verified. No live Foundry acceptance has been performed.

## Approved rules

- Each actual spell cast makes a separate, unmodified integer d20 wild-magic check. Normal spell attacks and saves remain separate. Natural 20 calls for GM-adjudicated Boon; natural 1 calls for Bane and does not automatically fail the spell.
- This includes prepared spells, scrolls, wands, staves and innate spells. Ordinary potions and passive item bonuses are excluded.
- A required physical focus must be held or displayed when casting. Magic-Users and Illusionists use a Wand or Staff as the casting focus; a Spellbook cannot be the casting focus. Recording and preparation still require the appropriate Spellbook. Mage also uses a Wand or Staff; Cleric and Paladin a Holy Symbol; Druid a sprig of mistletoe; Bard an instrument; Ranger a personally carved token depicting a forest animal native to the area they range, made from dead wood of a special tree and never cut from a living tree. Elf, Gnome, Half-Elf and Drow race-as-class spellcasting is innate and needs no focus. Racially granted spells are innate; a scroll, wand, staff or generic magic item is its own focus.
- Link each recorded arcane spell to a physical catalog Spellbook volume. Each volume has 100 pages; a spell occupies one page per spell level. A stack represents individually indexed volumes with independent capacities. A missing or unavailable book prevents new memorization from that volume. Already memorized spells remain until cast.
- Spellbook libraries can contain more distinct spells than the daily slot allowance. Beginning spells follow the OSE advanced INT table. Magic-Users and Illusionists receive Read Magic additionally, without a copying check; it occupies one page and uses a daily slot when prepared.
- Copying uses the OSE advanced INT-based chance and is limited to unlocked spell levels. A failed attempt blocks another copying attempt for that spell until the character gains a level. Failure is never permanent. Starting and researched grants are managed by the GM.
- INT/WIS bonus slots apply only to unlocked spell levels. Bard, Paladin and Ranger receive no such bonuses. WIS 15+ gives a level-1 Cleric the first normal casting row. WIS above 15 advances Paladin/Ranger initial access by one character level per point; use the first casting row during the early interval, then normal progression. Higher spell levels do not move earlier.
- After uninterrupted sleep, allow one hour for preparation. A confirmed qualifying rest restores used slots and preserves uncast prepared copies. Duplicate memorization is allowed within the daily allowance. Arcane normal/reversed forms are selected at preparation; divine reversed forms are selected at casting.

## Rule-to-feature contract

| Feature | Support | Behavior and limits |
| --- | --- | --- |
| Class slots, bonus slots, early access | Automated | Uses actual actor level and INT/WIS with class profiles and the house-rule bonus table. |
| Read Magic knowledge | Automated | Additional automatic knowledge for Magic-User/Illusionist. Requires physical book linkage before new preparation. |
| Starting and researched spells | Assisted/manual | GM grants spells after verifying starting allowance or research. UI shows the INT allowance; automatic Read Magic is additional. No copying roll for these grants. |
| Copying | Assisted/manual | Table confirms a readable source; GM authority performs the INT-based d100 check. Records failure level and enforces retry after a level gain. Capacity and unlocked-level gates run before dice. |
| Spellbooks and pages | Assisted/manual | Player links spells to actual available volumes. Software checks 100 pages, spell-level page cost and current item quantity/existence. Table confirms accessibility and destruction. |
| Focus | Assisted/manual | Player designates a physical inventory object for the exact class requirement and confirms availability; spell/ability records cannot serve as physical focus. Software checks current ownership/quantity and requires held/displayed confirmation. No GM override is encoded. |
| Rest and preparation | Assisted/manual | Table confirms uninterrupted sleep and one hour. Sheet controls and DM Toolkit use the same authority operation. Software tracks slots, copies and normal/reversed forms. Casting closes preparation until another qualifying rest. |
| Prepared casting | Automated after confirmation | One atomic actor update decrements a prepared copy and increments used slots. Spellbook loss does not invalidate an already prepared copy. |
| Wild magic | Assisted/manual | One separate d20 check per cast; card identifies Normal/Boon/Bane. GM determines special outcomes. No automatic failure on Bane. |
| External spell sources | Assisted/manual | Select an owned source and canonical spell; confirm source kind, eligibility and remaining uses. Performs the same focus/wild checks without spending daily prepared slots. Cards identify source and remind the table to deduct charges/uses manually. |
| Spell macros | Assisted/manual | Owned spell-item macros use prepared casting when the name uniquely matches the class list, otherwise open external-source selection. Ordinary ability macros remain descriptive; actual innate spells use the external spell control. |
| Casting conditions, attacks, saves, targets and deity disfavor | Assisted/manual | Confirm speech, hand movement, visibility and other conditions. Normal attack/save/target resolution and divine disfavor remain table procedures. |
| Automatic external charge consumption and target effects | Unsupported | No claim of automatic depletion or target application; explicit manual instructions appear before and after external casting. |

## Controls and legacy data

The actor header **Spellcasting** control manages focus, book availability, qualifying rest, external spells and GM recovery. The spell tab shows daily slot usage, known spells and prepared normal/reversed copies. Use **Copy from a source** for unlearned spells, **Link recorded spell** for an existing physical record of a known spell, and **Set prepared copies** after a qualifying rest.

Existing `knownSpells`, `memorizedSpells` and slot use import into canonical state on the next successful mutation. Unknown legacy spell IDs are preserved and surfaced for GM review. Canonical state and legacy mirrors are committed together. Legacy item-level memorized/cast checkboxes remain visible as read-only reference; they do not govern casting.

Book page allocations are persisted as per-volume spell IDs, with page totals derived from authoritative spell levels. Linkage confirms an actual physical record; it cannot recreate lost spell text from memory. Transcribing from an available readable source is resolved with the GM. No unrelated inventory items are split or rewritten. Missing volumes retain their historical assignments.

## Authority and recovery

Mutations use the authenticated active-GM authority and durable operation receipts. The GM performs the copying/wild die check; the requesting player receives the outcome. One actor update commits canonical state, legacy mirrors, slot usage and the operation marker. UI in-flight guards and the authority queue protect simultaneous requests. Pending operations block new spell changes.

Before dice, the service durably records that a roll is in progress. If interrupted, the GM uses **Recover operation** to record the actual result already rolled, or makes the required roll if it never occurred. Never reroll a known result. Recovery uses the original requester's authority and recorded operation ID. A rolled/planned operation reuses the saved die and resource plan. Changes to canonical spell state or character class/level during a roll require GM review rather than overwriting the changed character.

Resources commit before card publication. A failed card post does not refund the spell; GM recovery reposts the saved result without another die or resource decrement. Already published cards are identified by operation ID. A cancelled die dialog consumes no resources. Lost write acknowledgments use durable state markers to distinguish committed operations from unapplied plans.

Source rules: house-rule JSON `/spells`, class adjustments, canonical `data/class_profiles.json`, `data/spells.json`, `data/gear.json`, and bundled OSE Advanced Fantasy Players Tome v1.3 printed pages 122–124. Approved BR-16 decisions are recorded in the production burndown. This support contract supersedes BR-07's earlier spellcasting implementation audit without altering its original source-rule values.

## Historical validation evidence (2026-10-02)

- Final focused run: 41 tests passed across five files: spell rules (5), state (9), authority/recovery service (21), UI entry controls (4), and macro routing (2).
- Coverage includes Read Magic physical-page requirements, copying failure/retry after a level gain, all external source kinds, invalid reversals, original-player GM-override rejection, simultaneous identical and distinct casts, lost resource-write acknowledgments, unapplied write recovery, interrupted-roll recovery, chat-card recovery, and character changes during dice.
- Final lint and typecheck passed. Full build and final JavaScript rebuild passed. Release validation passed for v1.0.12. Full suite: 1,143 passed, one known pre-existing combat numeral sizing failure (37.75 expected, 38 actual), across 52 files. That run preceded the final physical-focus guard and linkage confirmation text. The affected 41-test suite passed afterward; lint, typecheck and the JavaScript build also passed again. The final guard excludes spell/ability records from physical focus selection while preserving external spell-source routing.
- Independent read-only review found no blocking defect. External source kind/eligibility is a table attestation, not inferred from inventory item type; this remains assisted/manual. The source selector lists owned inventory because catalog scrolls/wands/staves may share generic item/weapon types.
- At the 2026-10-02 audit, all 347 original BR-07 source-rule values matched the house JSON. The 2026-10-14 focus and spellbook clarifications supersede those two source values; the matrix retains their historical text. Six spellcasting matrix entries now reference the later BR-16 approvals and runtime support without changing original source text.
- No live Foundry verification was performed.

## Focus clarification — 2026-10-14

The class focus and exemption rules above reflect the user-approved clarification. Existing generic focus designations must be confirmed again for the current class. The original October 14 rule required Magic-Users and Illusionists to select the available containing volume for each cast. The later October 15 amendment first added Wand and Staff alternatives, then removed Spellbook as a casting focus. Other class focuses can be represented by ordinary physical inventory items created later; names and artwork do not establish eligibility. The player attests that the item satisfies the stated class requirement. No catalog items or live compendium records were added.

Racial innate spells require confirmation that the ability is granted by race. Other unusual innate cases remain outside this automated path. External physical sources require held/displayed confirmation and no separately designated class focus. Inventory and required volume membership are checked again after the die and before an uncommitted recovered cast spends resources. A published cast recovery does not consume resources or roll again.

Current verification: 81 spellcasting regressions across seven files (43 authority/service, nine UI, nine state, seven rules, seven list, four book names, two macro routing), plus 1,352 regressions across the other 72 test files passed. Repository lint, typecheck, JavaScript build, release manifest validation, JSON parsing, and extraction-generator syntax checks passed. The spellcasting baseline before this clarification was 56 tests across seven files. No live Foundry acceptance was performed for this clarification.

## Arcane focus alternatives — 2026-10-15

User-approved amendment: Magic-Users and Illusionists choose Wand or Staff as their casting focus. The required object must be held or displayed. The focus uses an owned, available physical inventory item designated and attested for the current class; item names do not establish eligibility. A wand/staff used as a focus casts the character’s prepared spell and consumes its normal resources, rather than invoking an item’s stored spell or charges.

Spellbook recording, page capacity, copying, and preparation requirements are unchanged. Existing characters with a saved or implicit Spellbook focus must explicitly choose Wand or Staff before another prepared cast; their book records and prepared spells remain intact. Other classes, racial innate casting, and external spell sources retain their existing rules.

Validation for the earlier October 15 three-choice amendment: 88 spellcasting tests passed; lint, typecheck, and JavaScript build passed. Live preview confirmed the three-choice selector and its inventory-control switching. No live cast or character focus selection was committed during UI verification.

The later October 15 correction removes Spellbook from the casting focus choices. Wand and Staff are the only valid prepared-cast focuses for Magic-Users and Illusionists. Historical Spellbook focus state remains readable for the setup panel but is ineligible for prepared casting until a physical Wand or Staff is selected and confirmed.


### October 16 focus clarification

Magic-Users, Illusionists, and Mages may each use either a Wand or Staff as their spell focus. The chosen physical inventory item must be held or displayed when casting. Staff is the generic item name; its appearance may vary by character. This does not change spellbook recording or preparation, class spell access, or the separate use of magic items as external spell sources.

### Equipped casting focus

A required physical casting focus must be equipped in inventory using its hand control and held or displayed when casting. Selecting a focus does not equip it. Unequipping the selected focus prevents casting until it is equipped again; racial innate spells and spells cast through scrolls or magic items retain their focus exemptions.

### Inventory-based Spellbook availability

Spellbook availability is determined by an owned inventory Spellbook with positive quantity, including each volume in a stack. There is no manual availability checkbox. Removing or depleting a book prevents recording and preparation from that volume while preserving its recorded spell list and name. Already prepared spells do not require the book to remain in inventory.

### Naming inventory Spellbooks

Adding a Spellbook from Items or a compendium to a character prompts for its inventory name before the drop completes. Cancel cancels the drop. Named books retain a Spellbook identity independently of their name and remain separate inventory records. Inventory and spell assignment labels display that name. Moving an already owned book does not prompt again.

### Casting from inventory items

The class Spells page handles class spellcasting only. Scrolls, wands, staves, and other spell-producing items are cast from their owned inventory card with **Cast**. Their explicit `system.spellClass`, `spellKey`, and `spellReversed` fields select the canonical spell and fixed form; names and descriptions are not used as identifiers. The GM can configure these through the card's **Configure Spell** context action. `spellSourceKind` selects scroll/wand/staff/item; `spellAllowedClasses` optionally lists permitted class keys. Without an explicit permission list, scrolls and wands/staves use the caster's class spell list (Mage can use arcane lists); generic magic items are available to any class.

Item casting requires the item itself to be held or displayed and checks ownership, class permission, an intact spell link, positive inventory quantity, and remaining resources before and after the wild-magic roll. A scroll spends one quantity; other configured items spend one `system.charges`. It does not spend a prepared spell or daily class slot. Target attacks, saves, and effects remain separate.

The durable cast plan records source state and resource consumption. Inventory drift blocks completion for GM recovery. Resource receipts prevent a lost write acknowledgement or failed chat publication from consuming a second use. The former External spell chooser is no longer presented in the class interface.

### Spellbook page controls

The separate Spellbooks / Casting Setup dialog has been removed. Casting focus selection and display live on the main Spells page, including for divine casters and Mage. Arcane spellbook and library views retain their spell selection and recording controls. Books are named in inventory; assigning a first spell initializes a book automatically. Saved legacy volume names and spell assignments remain readable. A recovery control appears on the page only for a pending spell operation and only to the GM.
