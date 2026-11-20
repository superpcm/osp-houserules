# Store expansion

The Parchment Ledger now supports six additions. Existing stores retain their saved access, prices, stock, and receipts; merchant buying and ongoing stock are opt-in.

## View as Player

GMs can choose **View as Player** from the window header's three-dot menu while viewing a creator or a selected storefront. It opens a separate player-facing preview, including unsaved creator edits, with GM management and private history hidden. Party access is unchanged. Carts and order reviews are temporary; purchases, sales, and reservations cannot be completed. Returning from the preview closes it and leaves the original window intact.

## Stocking and guardrails

**Add Items** has equipment-type filters (Gear, Weapons, Armor, Ammunition, Containers, Clothing), search, a selection counter, and an independently scrolling list. Changing filters preserves checked items.

**Randomize Stock** previews finite quantities between configurable whole-number bounds, with an out-of-stock percentage. Existing limited quantities are preserved by default; uncheck that guardrail to reroll them. Unlimited products can be converted to finite quantities.

**Randomize Prices** previews percentages of base item value, optional minimum/maximum prices in silver, and rounding in copper. Custom asking prices are preserved unless explicitly included. These one-time tools do not replace ongoing profile settings.

Both tools require Preview Result, Apply to Draft, then Save Store. Invalid limits are rejected. A seed reproduces a result with the same inputs.

## Ongoing merchant profiles

Choose General Store, Outfitter, Weaponsmith, Armorer, or Apothecary, then Village/Town/City and Small/Medium/Large. Location affects available base item values and price ranges; size affects product counts and quantity defaults. Magic and unique items are excluded from ordinary profiles.

Enable ongoing restocking and select an interval of 1–365 **in-game days** (24 hours of Foundry world time each). Choose whether each restock also rerolls prices. Apply the preview and save the store. The interval starts when that preview was applied. World-time advances and world startup check for due restocks; an active GM is required. Missed intervals produce one current restock rather than replaying every missed cycle.

**Restock Now** immediately applies the saved profile and its guardrails. Save or reload any draft changes first. The profile controls products it creates: managed products receive new quantities, and managed products not selected this cycle become out of stock while keeping their IDs. Manually added products—including matching catalog sources—remain independent. Replace the draft inventory explicitly if the profile should control the whole inventory. Product limits remain 200; a full inventory must be pruned before more products can be added.

Restocking preserves the store’s party-access setting and history. It increments the revision, requiring open shopping reviews to be checked again. One restock transaction updates the store, with the same recovery controls as other inventory operations.

## Shopping and selling

The cart is wider, with full-width quantity and destination rows, a separate scroll area, and persistent totals. The store header can display a proprietor name and portrait independently of the store image.

In Store Creator, enable **This store buys equipment**, set the offer percentage (0–100% of the item’s base value), select accepted equipment types, and choose whether purchased equipment becomes store stock. Save the store. When accessible, players can select **Sell Equipment**, drop an owned item onto the selling area or select it from their inventory, choose a quantity, review the automatic offer, and complete the sale.

Items must be unequipped, unlashed, and empty of child items; coins, treasure, vehicles, livestock, and unsupported types cannot be sold through this flow. Zero-value offers are rejected. Coins are paid into valid carried coin storage; placement/capacity rules still apply. A live GM revalidates the actor, item, store access, revision, and offer. Item removal, coin payment, optional merchant stock, and sale receipts commit together. Pending sale intents survive reloads and reconcile against receipts so retries cannot pay twice.

Closing a store prevents both purchases and sales. Preview Store never changes character inventories or balances.

## Verification

Focused model, UI-context, placement, profile, purchase/sale authority, payment, cart, and restocking tests cover permissions, stale/forged offers, duplicate retries, partial-write recovery, manual-stock independence, game-time intervals, and guardrails. Live UI captures are in `output/qa/stores/v2-*.png`. Live preview checks use unsaved drafts; campaign settings are reloaded afterward.

## Weighted profiles and trading conditions

Stocking Profiles now saves five main choices: **shop specialty**, **settlement**, **store size**, **local economy**, and **merchant wealth**. Blacksmith joins the existing specialties. General stores favor everyday supplies and common equipment; armorers favor armor, weaponsmiths favor weapons, and blacksmiths favor metal equipment and tools. Category-balanced weighting prevents a catalog with many weapon variants from overwhelming general supplies. Item details, local conditions, explicit catalog availability, and GM overrides influence selection. Price affects purchasing power and value limits, not availability classification. Sampling remains seeded and without duplicate catalog sources.

Size changes both selection breadth and quantity defaults. Settlement limits available base values and sets price defaults. Economy favors local goods; wealth changes the relative likelihood of expensive equipment. Optional **Advanced Settings** exposes supply reliability, local demand, and temporary event presets. Supply and events affect quantities and generated prices; local specialties tend to be cheaper and high-demand categories more expensive, all within the explicit price/stock guardrails. An out-of-stock chance may produce zero even when the normal minimum quantity is positive. Event presets stay active until changed back to None through Preview Result → Apply to Draft → Save Store.

The item-rules list supports searchable **Automatic / Always stock / Never stock** policies and **Use item availability / Common / Uncommon / Rare / Exceptional** availability overrides. Always-stocked ordinary items are included even outside the usual specialty or settlement value preference and receive positive quantities. A maximum of zero conflicts with an always-stock rule and is rejected. Missing or ineligible always-stock sources produce a clear error. Magic/unique exclusion remains in effect. These rules govern generated/profile-managed inventory only; manually stocked entries are never adopted or rewritten merely because an item rule matches them. Never-stocked managed products become unavailable while retaining their stable IDs.

Advanced buying preferences set an optional offer percentage per equipment type. Blank inherits the store's normal offer; 0 refuses that type. These rates still require merchant buying to be enabled and the equipment type to be accepted. Automatic offers and trusted GM sale revalidation use the same rate. Changing preferences invalidates an earlier offer. Existing stores without environment fields use Mixed economy, Comfortable wealth, Reliable supply, Normal demand, no event, and no overrides; the new weighted selection takes effect at their next generation/restock. Existing inventory and access are not migrated or changed on load.

The profile preview shows the combined draft, including protected manual products and the profile changes that would actually apply. Nothing is saved until Apply to Draft followed by Save Store. One-time random stock/price tools do not replace these saved profile settings. Preview/QA work does not change the campaign's saved merchant settings.

## Editable product variety

Store-size defaults are now Small **20–35**, Medium **40–70**, and Large **80–120 distinct products**. Minimum products and Maximum products are editable in the main Stocking Profiles controls, independently of per-item quantity guardrails. Counts must be whole numbers from 1 to 200 with minimum no greater than maximum. Explicit always-stock items count toward the selection and cannot exceed its maximum.

The saved bounds govern both generation and ongoing restocking. Choosing a different size loads that size’s product-count defaults; changing specialty or settlement preserves custom product-count bounds. Legacy saved profiles without count fields inherit the new size defaults without changing current saved inventory. Preview shows the selected target and actual profile-product count, and explains when the eligible catalog is too small. Preserved manual products can make a combined draft larger than the requested profile selection. The existing 200-product total-store limit still applies.

## Explicit catalog availability

Ordinary equipment has a deliberate Common, Uncommon, Rare, or Exceptional availability rating, independent of price. The generator resolves a store override first, then item metadata, then a unique bundled catalog match by name and type. Unclassified equipment is excluded from automatic selection and counted in the preview, with a link to Catalog Stocking Review. Existing item data is not rewritten on load.

Blacksmith profiles use explicit eligibility for metalworking goods: approved metal weapons, armor, barding, tools, and hardware. Clothing, bows, wooden weapons, leather/padded/hide armor, unspecified shields, and travel supplies are excluded. Always Stock remains a deliberate GM exception; Never Stock remains authoritative. Magic and unique exclusions still apply.

Catalog Stocking Review in the DM’s Toolkit filters world equipment by type, availability, and blacksmith eligibility. It identifies catalog defaults versus item overrides and stages selected batch changes for review before saving only stocking metadata. Individual equipment editors and Add Item expose the same fields; new custom items start Unclassified with blacksmith eligibility unset. Prices, quantities, descriptions, existing store stock, party access, and character inventories are unaffected by metadata edits.

Availability weights are Common 2, Uncommon 1, Rare 0.35, and Exceptional 0.1, with size adjustments favoring difficult-to-source equipment in larger shops. Preview and ongoing restocking share these rules. An eligible catalog smaller than the product target produces a visible shortfall rather than inappropriate filler stock.
