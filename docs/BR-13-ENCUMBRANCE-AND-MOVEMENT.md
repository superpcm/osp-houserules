# BR-13 — Coin weight, carrying capacity and movement

Status: COMPLETE — approved rules implemented; live Foundry QA remains manual.

## Existing approved rules

- Exchange: 10 copper = 1 silver; 10 silver = 1 gold.
- Encounter movement: Humans, Elves, Half-Elves and Half-Orcs 40 feet; Hobbits, Gnomes and Dwarves 30 feet; unlisted races default to 40 feet.
- Personal load: STR × 15 pounds maximum. At or below one-third: no penalty; at or below two-thirds: −10 feet; at or below maximum: −20 feet; above maximum: immobile.
- Running: twice adjusted encounter movement. Exploration: three times adjusted encounter movement per exploration turn.
- Mounts/vehicles and transitively nested cargo are excluded from personal load.
- Catalog names and entries govern weights, bulk and capacities. The older CW bands and STR shifts are superseded.

## BR-13 approvals

- Legacy item reconciliation: update ordinary exact catalog name/type matches to current catalog weight and bulk; preserve intentional custom values and leave unmatched items for GM review. User approval: “Go with your recommendation”, 2026-10-01. A differing value alone is insufficient evidence of customization; uncertain cases require review rather than an assumed classification.

- Nested storage: only a packed container's own bulk consumes capacity in its parent. Contents consume capacity in their immediate container, not again in ancestors. Count every carried item's weight once. User approval: “Since the items are inside the backpack, I think only the backpack's bulk should be counted”, 2026-10-01.

## Implementation and validation

- Shared encumbrance and bulk helpers drive actor weight, movement, container validation and display subtotals. Zero quantities, object quantities/capacities and documented legacy coin-weight conversion are supported.
- Sheet labels and token ruler use the approved encounter/run/exploration rates. Parent capacity includes only a packed container's own bulk.
- The GM DM Toolkit provides exact catalog review for world and actor items, trusted replacement fields, custom preservation, durable receipts, interrupted-operation recovery and guarded undo. The refresh-items macro opens this workflow.
- 94 focused tests pass across encumbrance, bulk, capacity, sheet transfers, ruler and catalog reconciliation. Lint and type checking pass. Independent read-only verification passed all four acceptance groups (weight, nested bulk, movement and reconciliation); the verifier's own test command timed out on the shared mount, so runtime evidence comes from the primary agent.
- Live Foundry QA was not performed. Existing-world uncertain catalog values require explicit GM review; no automatic inventory overwrite runs at startup.

Final full-suite run (`npm test -- --maxWorkers=2 --hookTimeout=60000`): 1,021 passed, one pre-existing combat numeral sizing failure (38 versus expected 37.75), no skips or import timeouts. Lint, type checking, final build and release-manifest validation passed. All 347 BR-07 source-pointer values remain unchanged.
