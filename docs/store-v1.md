# Stores — first version

Approved scope: GM creates/duplicates merchants, snapshots existing equipment, configures stock and asking prices, and opens shopping to the whole party. Players keep separate per-user, character, and store carts; review destinations; pay with carried coins; and receive persistent receipts.

## Direction contract

**THESIS:** A practical merchant ledger that fits the established OSP system. Merchandise is arranged in horizontal ruled rows, with a fixed purchasing ledger alongside it.

**OWN-WORLD:** Honey parchment, dark walnut header, antique brass frame/rules, burgundy action buttons, dark serif text, existing equipment artwork, and Font Awesome compass and utility icons. No Merchant Shelves card grid.

**STORY:** The GM stocks and opens a merchant; a player sees carried funds, fills a reversible cart, resolves placement, and confirms a purchase. A durable receipt proves delivery and payment.

**FIRST VIEWPORT:** Resizable desktop window, default 1120 × 760. Approximately two-thirds inventory and one-third settings/cart. Header holds identity and navigation. Creator saves at bottom right; shop review and totals stay below its independently scrolling cart. Long catalogs scroll within their panel.

**FORM:** User-selected concept 1, Parchment Ledger; no randomized seed. Approved shop and creator compositions are retained under `.impeccable/mocks/` as development references. Existing artwork replaces illustrative generated sample goods and actual catalog data replaces sample prices.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Behavior and acceptance

- AC-1: Stores start unavailable; only the GM opens/closes them. Access is rechecked by the active GM during checkout. Closed store JournalEntries are GM-only; open ones grant observer access.
- AC-2: Player directory purchase drag events direct the player to Stores. GM grants and owned transfers retain their existing flow. Bank/Storehouse locks remain independent.
- AC-3: Catalogs snapshot item data, preserve base item values, support standard/custom asking prices, percentage adjustment, hidden products, finite/unlimited stock, and duplication. An explicit refresh replaces an entry's snapshot.
- AC-4: Carts persist in user flags by actor UUID/store ID. Display and payment share one resolver for carried coins. Coins in Bank, vehicle/animal storage, loose invalid locations, or missing parents are excluded.
- AC-5: The real character-sheet placement rules run against detached drafts for the entire cart. Purchased containers can receive cart goods. Automatically provisioned unpurchased accessories are rejected.
- AC-6: Coins, delivered items, stock, actor receipts, and merchant history commit in one recoverable transaction. The user cart retains a pending operation until its actor receipt confirms completion.
- AC-7: Serialized GM authority and revision checks prevent overselling; durable operation IDs prevent duplicate checkout. A changed price/catalog requires another review. Two editor windows cannot silently replace newer stock/history.
- AC-8: Player receipts and GM history use the same transaction record, showing products, quantities, payment, change, and remaining funds.

## Use

1. Reload Foundry after building. Open **DM's Toolkit → Manage Stores**.
2. Create a store; use **Add Items** to select several equipment items or drag them from the Items directory.
3. Blank custom price uses standard price plus store adjustment; enter a price in sp to override it. Set stock to Limited plus a quantity, or Unlimited. Eye toggles hide products.
4. Save changes. Enable **Accessible to the whole party** and save, or use **Make accessible** in the store list.
5. Players open **Player's Toolkit → Stores**, select an owned party character, add goods, choose destinations or use suggestions, then **Review Purchase → Complete Purchase**.
6. A live active GM is required for saving and checkout. If interrupted, use **Check / retry safely**. Pending transactions can be recovered in Manage Stores or the existing Bank Ledgers recovery tools.

GM creator forms preserve unsaved edits on other clients' sales; saving a stale revision is rejected. **Reload saved** explicitly discards local edits. Opening **Preview Store** never charges a character.

## Validation approach

The pre-change baseline passed 98 files / 1,681 tests. Store tests cover quote/stock/visibility, denomination change, durable carts, purchased-container placement, aggregate capacity, actual directory drag gating, requester permission, finite-stock races, replay, stale editor saves, and failures before/after each inventory/receipt/stock write boundary.

`scripts/preview-stores.mjs` renders actual application contexts and the actual template/CSS against development fixtures at localhost:32105. This verifies appearance without modifying a campaign. It does not substitute for a live two-client Foundry session. Captures are under `output/qa/stores/`.
