# Vehicle fittings and lashing

Drop a compatible item onto a vehicle, then choose **Store in vehicle**, **Lash at …**, or **Install at …**. Only fittings with a free compatible position appear. A stack can supply **one item** to an exterior position; the remainder stays in its original location. Cancelling makes no inventory or payment changes.

| Item | Compatible vehicles | Exterior limit |
| --- | --- | --- |
| Spare wagon wheel | Wagons, open wagons, freight wagons | Two: one on each side |
| Spare cart wheel | Cart, handcart | One at the rear rail |
| Spare wagon axle | Wagons | One underframe |
| Spare cart axle | Cart, handcart | One underframe |
| Spare ox yoke | Wagons | One underframe |
| Rolled wagon cover | Wagons | One on a side |
| Folded cargo net | Wagons, carts, handcarts | One on a hook |
| Crowbar and classified tools | Wagons, carts, handcarts | One per tool rack position |
| Coiled rope | Wagons, carts, handcarts | One per hook |
| Bedrolls and rolled tents | Wagons, carts, handcarts | Free side or rear rail positions |
| Empty classified bucket | Wagons, carts, handcarts | One on a hook; must remain empty |

A side occupied by a wheel cannot also hold a bulky bundle. An underframe carrying a spare axle cannot carry a spare yoke. Hook positions are shared by rope, nets, and buckets. Wheelbarrows have ordinary cargo space but no exterior fitting positions.

A fitted wagon cover uses the canopy fitting, and a cargo net stretched over the load uses the cargo-net fitting. These installed fittings are separate from a rolled or folded spare. Working harnesses continue to fit their compatible animals through the existing tack rules. Spare harnesses and axle grease remain ordinary cargo.

## Capacity and weight

All immediate vehicle cargo and fittings count against the vehicle's existing bulk capacity. Their weight appears in the vehicle's contents weight; it does not become the character's personal carried weight. No new pounds limits are inferred from bulk. Self-links and containment cycles are rejected.

## GM classification

On a catalog item card, right-click and choose **Vehicle Fittings**. The vehicle type and fitting type can use catalog defaults, explicit classifications, or an explicit opt-out. The same fields are available in Add Item's advanced fields and supported equipment editors. Classifying a custom shovel, pick, spade, or bucket enables the corresponding fitting rules; those items are not created automatically.

Only the two classification fields are saved by the fittings editor. Prices, quantities, descriptions, and existing inventory placement are preserved. Bundled defaults are read using a unique exact name and item type match; existing world items, character inventories, and compendia are not automatically rewritten.

## Persistent fields

- `system.vehicleKind`: `null` (catalog default), `none`, `wagon`, `cart`, `handcart`, or `wheelbarrow`.
- `system.vehicleAttachmentKind`: `null` (catalog default), `none`, or an approved fitting classification.
- `system.vehicleAttachment`: `null` for cargo, otherwise `{ mode: "lashed" | "installed", position }`.
- `system.containerId`: the host vehicle's ID. Vehicle fittings use `system.lashed: false`; legacy backpack, belt, saddle, scabbard, and sling lashing keeps its existing behavior.

The shared authority is `src/module/inventory/vehicle-lashing.js`. Preview, checkout, and inventory drops validate the same positions and limits. Purchased-vehicle destinations retain their cart references between review and checkout.
