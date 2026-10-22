# Encumbrance system

Release authority: the BR-07 approvals and [BR-13 decisions](BR-13-ENCUMBRANCE-AND-MOVEMENT.md). These supersede the old CW movement bands and size-letter conversion tables.

## Weight and movement

Personal load is the sum of each carried item's pounds per unit multiplied by quantity, including equipped items, containers and their contents exactly once. Mounts, vehicles and all cargo nested beneath them are excluded from personal load. A zero quantity contributes nothing; legacy quantity objects use their `value`.

Maximum load is STR × 15 pounds. Compare the unrounded total against these inclusive boundaries:

| Load | Encounter movement penalty |
|---|---|
| At or below one-third maximum | None |
| Above one-third, at or below two-thirds | −10 feet |
| Above two-thirds, at or below maximum | −20 feet |
| Above maximum | Immobile |

Humans, Elves, Half-Elves and Half-Orcs start at 40 feet; Dwarves, Gnomes and Hobbits at 30 feet. Unlisted races default to 40 feet. Running is twice adjusted encounter movement; exploration is three times adjusted encounter movement per exploration turn. The sheet labels these Encounter, Run and Explore. The ruler uses encounter speed in combat and exploration speed outside combat, preserving zero when overloaded.

For STR 12 the boundaries are 60, 120 and 180 pounds. Equipped and lashed items still contribute weight.

## Bulk and containers

Catalog `storedSize` is bulk per unit; `capacity` uses the same numeric unit. Use the catalog values directly. Only immediate children consume a container's capacity, excluding lashed children. A packed backpack consumes only its own bulk in its parent; the backpack's contents consume the backpack's capacity. Contents never consume capacity again in ancestors. Container weight subtotals include nested contents for display, but those subtotals are never added again to personal load.

| Catalog container | Own weight (lb) | Own bulk | Capacity |
|---|---:|---:|---:|
| Backpack | 2 | 4 | 20 |
| Sack, Large | 0.5 | 2 | 24 |
| Sack, Small | 0.25 | 2 | 8 |
| Coin Purse | 0.25 | 1 | 4 |

Drop validation, transfers, purchase placement and sheet capacity displays use this same immediate-child calculation. Legacy object capacities use `max` or `value`.

## Currency and existing items

Exchange is 10 copper = 1 silver and 10 silver = 1 gold. Coin weight and bulk come from the treasure catalog: copper and silver weigh 0.02 pounds each; gold weighs 0.04 pounds each. Each coin uses 0.04 bulk. Currency value does not determine weight.

Current `unitWeight` is pounds per unit. If it is absent, documented legacy `weight` is coin weight and is divided by 10 to obtain pounds. A present `unitWeight`, including zero, takes precedence. Items whose old conversion history is unknown require catalog review; the system does not guess that a differing value is custom or automatically rescale it.

The GM's **Catalog Weight & Bulk Review** in the DM Toolkit compares exact catalog names and item types for world items and actor inventories. Known ordinary matches can be selected for update; uncertain values require review, and unmatched or ambiguous entries cannot be overwritten. Explicit custom flags and items with custom effects are preserved. The GM may mark selected items custom.

Updates change only catalog weight, bulk and capacity fields. Quantity, cost, equipment state, storage relationships and other item data are preserved. The active GM validates the original requester and obtains replacement values from trusted catalogs. Durable operation IDs, per-item receipts and readback checks support retry after interruption. Review history offers undo when the current fields still match that update; later edits block unsafe undo. The refresh-items macro now opens this review instead of deleting or recreating inventory.

## Validation

Focused automated coverage includes movement boundaries, races, zero quantities, floating-point totals, transitive mounted cargo, nested capacity, populated-container transfers, ruler distances, catalog authorization, lost acknowledgements, retry, custom preservation and guarded undo. Live Foundry interaction remains a separate manual QA check.
