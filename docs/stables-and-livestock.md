# Stables & Livestock

Open **DM's Toolkit → Stables & Livestock → Create Stable**. The utility uses the same Parchment Ledger presentation as Stores and Inns, with separate stable data and stocking rules. Existing merchants and inns are unchanged. New stables start unavailable to the party; the Player's Toolkit directory lists accessible establishments only.

## View as Player

GMs can choose **View as Player** from the window header's three-dot menu while viewing a creator or a selected storefront. It opens a separate player-facing preview, including unsaved creator edits, with GM management and private history hidden. Party access is unchanged. Carts and order reviews are temporary; purchases, sales, and reservations cannot be completed. Returning from the preview closes it and leaves the original window intact.

## Creator and stock

Configure the establishment name, house description, representative image, proprietor name and portrait. Images use Foundry's image picker and remain draft changes until saved. Optional opening hours use the in-game clock, including overnight hours and a GM service override. Equal opening and closing times mean 24-hour service. Service hours never turn on party access.

Add Items provides search and Animals/Tack/Vehicles filters. Checked selections survive filtering. Catalogs include world items and bundled livestock, tack and vehicle offerings, without creating or updating world items automatically. The bundled **Harness, Draft** fits draft animals in their harness slot; it does not increase capacity or simulate a pulling team. Its initial catalog price is editable like other goods.

Stock has finite quantities, optional asking prices in silver, and a Hide control. Blank asking prices use the item's base value. Each establishment supports up to 200 product listings. An animal listing can become an **individual animal**, with its own name, description, temperament, portrait and price. Individual animals are non-stackable, have quantity zero or one, and remain sold out after purchase. Turning a listing into an individual makes it manually maintained. Ordinary animal purchases deliver separate livestock records, allowing specific animals to be boarded later.

## Profiles and replenishment

Six profiles are available:

| Profile | Automatic stock |
| --- | --- |
| Livery Stable | Riding and pack animals, tack, carts and wagons |
| Livestock Dealer | Farm, pack and working animals; trained hawks and war horses excluded |
| Horse Breeder | Draft, riding and war horses, and ponies |
| Saddler & Tack Shop | Tack and related animal equipment |
| Wainwright | Carts, wagons and draft harnesses |
| Stable & Outfitters | The full supported animal, tack and vehicle selection |

Stocking Profiles provides Village/Town/City, Small/Medium/Large, editable product counts, quantity bounds, price percentages and a reproducible seed. Size defaults are 4–7 / 8–12 / 12–20 distinct products. The smaller livestock catalog is intentionally separate from ordinary equipment-shop product ranges. Settlement affects the relative sourcing likelihood of availability classes. When a specialty has fewer eligible products than requested, the preview reports a shortfall instead of adding inappropriate goods.

Availability is explicit Common/Uncommon/Rare/Exceptional metadata, then a unique bundled catalog default. All 14 bundled animal types have deliberate stable availability defaults; prices never determine availability. Unclassified custom goods are excluded from automatic stocking. Advanced item rules provide per-stable availability overrides and Automatic/Always Stock/Never Stock. Never Stock is authoritative. Always Stock can deliberately bypass specialty and classification, retaining supported-item, magic/unique, quantity and price restrictions. Named animals are added manually.

**Preview stock → Apply to draft → Save Stable** changes the saved selection. Manual stock is preserved by default; individual animals are always preserved. An explicitly edited profile quantity is protected from ordinary replenishment, and an explicitly edited price is protected from generated price rerolls.

Automatic replenishment runs every 1–365 in-game days with an active GM. It refills existing generated listings, optionally rerolling generated prices, without rotating the selection. Manual listings and individual animals are preserved. Managed products that become excluded by profile or item rules are set out of stock. Missed intervals produce one refill rather than replaying missed cycles. Restock Now applies the saved settings; save or reload an edited draft first. Replenishment preserves access, history, and paid boarding.

## Shopping and selling

Shopping uses the single controlled eligible character, otherwise the user's assigned eligible character. Players must own a party character. There is no payer dropdown or arbitrary fallback to another owned actor. Carts and pending transaction intents are stored by user, character UUID and stable. A pending transaction remains attached to the original character even if token control changes.

Animals, Tack and Vehicles show stock and prices; animal movement, carrying capacity and temperament use existing catalog data. Tack descriptions show attachment requirements, and vehicle descriptions show draft requirements. Owning a vehicle does not automatically create or assign a draft team.

Players can edit quantities, remove products, select existing inventory destinations, and attach tack to an animal purchased in the same order. Root delivery places animals and vehicles in livestock/transport inventory. Tack uses the existing character placement, species, size, saddle prerequisite and slot rules. Review checks the entire detached inventory; payment uses physically carried coins. At most 200 individual animals/vehicles can be delivered in one order.

Enable **Buy supported animals and equipment** to offer automatic buyback at 0–100% of base value. Optionally add purchased goods to manual stock. Players can drop an owned supported item into the selling area or select it from their inventory and choose quantities. Empty and unequip animals, vehicles and tack before selling; active boarded animals, loaded items, invalid containment, unsupported items, and zero-value offers are rejected. Proceeds must fit valid carried coin storage, excluding animal and vehicle storage.

The active GM rechecks access, hours, ownership, prices, stock, placement and revision. Purchases and sales commit coins, item changes, stable stock, actor receipts and merchant history together through the shared recovery journal. Pending operation IDs make retries idempotent. **Check / retry safely** reconciles the original receipt; interrupted operations are also listed in the GM stable manager for recovery. Closed access blocks new transactions.

## Boarding

Boarding is optional, with a finite space count and an editable price per animal per night. Players select specific owned livestock items, which must each have quantity one; existing stacked livestock must be split first. A single order can board several animals for the same number of nights. Each paid night lasts 24 in-game hours from checkout. The same actor's animal cannot have overlapping stays at different stable establishments.

Active boarding shows the animals, payer, expiration and remaining in-game hours, including while the establishment is closed. Expiry releases capacity automatically; GM early checkout releases it immediately with no refund. Saved bookings and history cannot be replaced by a creator draft. Capacity cannot be reduced below active reservations. Boarding reserves space; it does not advance time, heal, apply rest benefits, or move animals out of character inventory.

## Safe previews and verification

Preview Stable works from an unsaved draft while party access remains off. Purchases, boarding and buyback offers can be reviewed, with temporary example animals for service/sale previews. Completion and retry are blocked in handlers and the completion controls are disabled. Preview does not persist carts, charge coins, change inventory/stock, or reserve stalls.

Focused tests cover profile classification and specialty exclusions, guardrails, price independence, manual stock, generated replenishment, correct payment, stock, buyback, individual sold-out stock, boarding expiry and duplicate reservations, permission checks, operation replay and interrupted writes. Real detached character-placement tests cover animals, saddles, saddlebags, draft harnesses, carts and wagons. Store/Inn/shared transaction tests remain regression checks. Character-sheet source, template and baseline CSS are preserved.
