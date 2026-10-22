# BR-20 — Inventory placement validation

Approved scope and decisions, 2026-10-02.

Players do not rename equipment. Catalog names and entries remain authoritative. Unexpected imported or legacy display names are negative validation cases: explicit allowlists still apply, and the system does not guess a catalog identity from an alternate name. Customized cost, magic, flags, and other item metadata survive transfers and prevent inappropriate stack merges.

Deleting a populated container requires destinations for every direct child: move to compatible existing storage with sufficient combined capacity, drop on the active scene, or cancel. Choices are collected before inventory writes. Closing either dialog cancels. Partial deletion of a container stack leaves its children attached to the surviving parent. Nested children move with their parent.

Ground drops save the root and every descendant in a scene token's `flags.osp-houserules`: `itemData`, `containedItems`, and `payloadVersion: 2`. Their original IDs and parent references are retained within the payload. Actor removals and scene token creation share the recoverable transaction journal. A failed compensation blocks further conflicting operations until GM recovery through DM Toolkit → Bank Ledgers. Automatic pickup of these tokens is not implemented; restoring ground contents remains a GM/manual workflow. Live Foundry token rendering and client permissions are BR-21 acceptance work.

The owner-only **Repair inventory links** sheet action explicitly clears missing/invalid parent references and stale equipped/lashed state, preserving nested contents. Existing cycles reject operations and require GM correction; no arbitrary cycle edge is silently removed.

## Route-to-evidence matrix

Automated means executed against production functions with in-memory Foundry document fixtures. It does not mean a live Foundry/browser session was exercised. Invalid combinations are rejected, rather than treating every item type as eligible for every equipment route.

| Route / invariant | Coverage | Evidence |
| --- | --- | --- |
| Catalog purchase / GM copy or grant | Automated: selected quantity, payment once, insufficient funds/store lock rejection; physical template types traverse catalog entry point | `character-sheet-drop.test.js`, purchase-charge tests |
| Move / gift / loot | Automated: partial and full transfers, exact quantities, source/destination permissions, stale snapshots, nested container and livestock trees | `character-sheet-drop.test.js`, transfer-recovery tests |
| Split / merge | Automated: internal stacks, consumable ready/stow, empty destination, unique/custom metadata, legacy object quantities | character sheet drop tests, handler placement tests, stack identity tests |
| Delete | Automated: all ten template types; populated parents relocate/drop/cancel; aggregate capacity; partial stacks; UI close/cancel | `item-removal.test.js`, `item-removal-ui.test.js` |
| Equip / stow | Automated: sword draw/return to scabbard; consumable ready and stow; capacity restrictions | `handlers/item-placement.test.js`, character sheet drop tests |
| Sling | Automated: equip sling and direct weapon placement; name restriction rejection | handler placement and character sheet drop tests |
| Lash / belt | Automated: belt attachment, full-slot rejection, slot-cost-aware fallback, worn-clothing restriction | handler placement and character sheet drop tests |
| Scabbard | Automated: provision carrier and charge together, rollback boundaries, draw/stow | character sheet drop and handler placement tests |
| Ammunition container | Automated: arrows admission / bolts rejection; quantity and stack preservation | character sheet drop, placement matrix, ammo logic tests |
| Storage | Automated: immediate-child bulk, object/zero quantities, allowlists, custom restrictions, full-capacity rejection | bulk, capacity, placement matrix and drop tests |
| Mount / tack | Automated: livestock subtree transfer; compatible saddle attachment, occupied-slot and incompatible-species rejection | character sheet drop tests |
| Vehicle | Automated: tagged container cargo placement; no-vehicle-store rejection; transitive carried-weight exclusion | character sheet drop and encumbrance tests |
| Spells / abilities | Automated: reject physical container storage; explicit deletion works | placement matrix, character sheet drop and removal tests |
| Cycles / orphans | Automated: existing/new cycles rejected before writes; explicit orphan repair keeps descendants | character sheet drop and removal tests |
| Unexpected names / customized catalog entries | Automated: strict names and item-side allowlists; custom fields, bonuses, prices and flags retained | placement matrix, stack identity and character sheet drop tests |
| Ground drop / recovery | Automated: complete nested payload, replay, creation failure, lost acknowledgment, compensation failure/recovery | removal, scene-token transaction and journal tests |
| Ground pickup | Assisted/manual: GM restores saved token payload | No automatic pickup route supplied |
| Live GM/player clients, rendering, reconnect | Pending BR-21 | Not claimed by this matrix |

## Calculation agreement

`storedBulk`, `usedBulk`, `capacityValue`, and `contentsWeight` supply the BR-13 immediate-child bulk and recursive weight rules. Character-sheet capacity preparation refreshes the displayed tree from these helpers; shared storage admission and automatic stow/deletion destinations use the same bulk calculation. Nested contents do not consume their parent's parent's capacity. Lash capacity is separate and counts configured slot costs. Tack mounting uses species, size and occupied tack slots, not ordinary container capacity.

Shared storage admission rejects nonphysical entries, slings and tack that need attachment routes, and legacy saddles that remain lash-only despite a stored capacity value. Actual drag/drop paths retain their specialized belt, sling, scabbard and tack handling.

## Validation

Final workspace checks passed: 1,299 tests in 66 files (`npm test -- --maxWorkers=2 --hookTimeout=30000`), lint, typecheck, build, and release validation for v1.0.12. Independent final review passed 43 focused tests. Completion is recorded in `PRODUCTION-READINESS-BURNDOWN.md`. The automated suite uses document and dialog fixtures; BR-21 remains responsible for Foundry v14 browser and multiple-client acceptance. No live world migration or release commit is part of this work.
