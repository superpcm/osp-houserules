# Inns and Taverns

Open **Inns & Taverns** in the DM's Toolkit to create an Inn, Tavern, or Inn & Tavern. New drafts are unsaved and closed to the party. Configure the name, description, establishment image, proprietor portrait, and offerings, then save. The establishment image can show the building, its sign, or a logo; it is separate from the proprietor portrait and appears in the directory and storefront. Choosing or removing an image changes only the draft until saved. The Player's Toolkit lists only establishments the GM has made accessible.

## View as Player

GMs can choose **View as Player** from the window header's three-dot menu while viewing a creator or a selected storefront. It opens a separate player-facing preview, including unsaved creator edits, with GM management and private history hidden. Party access is unchanged. Carts and order reviews are temporary; purchases, sales, and reservations cannot be completed. Returning from the preview closes it and leaves the original window intact.

## Menus and generation

**Regenerate Menu** opens a preview with settlement (Village/Town/City), size (Small/Medium/Large), quality (Modest/Comfortable/Fine), local character (Rural/Roadside/Trading/Wealthy), and supply settings. A seed reproduces the same selection. Small, medium, and large profiles select 6, 10, and 15 meals/drinks respectively, with at least one of each. Inns generate nonalcoholic drinks; taverns and combined establishments can serve alcohol. Lodging profiles add shared beds, private rooms, large rooms, and optional stabling.

Generated menus mix everyday staples with house specialties named for fictional local cooks, patrons, and mythical creatures. Each menu includes exclusive house specialties. Generation checks recipes and names already claimed by other saved establishments, including closed ones; ordinary fare remains shared. Saving rejects newly introduced specialty conflicts from stale previews. Existing saved menus are preserved until explicitly regenerated. Descriptions explain the actual ingredients; fanciful names do not grant magical effects. The seed keeps names and recipes reproducible, and replenishment preserves them. Existing saved menus change only when the GM regenerates and applies a preview or edits them manually.

Price limits are editable per category in silver pieces. Serving bounds are separate from room quantities. Apply the preview to the draft, then Save Establishment. Manual offerings are preserved by default. Actively booked lodging types are always retained unchanged during regeneration. The backend also rejects changes that remove, change type, or reduce capacity below active reservations.

Manual offerings support meals, drinks, rooms, beds, stabling, and takeaway provisions. Meals/drinks may have unlimited servings (blank quantity) or finite stock. Rooms, beds, and stalls require finite total unit counts. Room capacity is occupants per room; a bed holds one guest. A takeaway offering must link to a world equipment item, which is delivered through the existing inventory placement and payment transaction.

## Replenishment

Enable automatic replenishment in Regenerate Menu and choose an interval of 1–365 in-game days. It refills only finite, generated meals/drinks within the serving bounds. It does not rotate offerings, change manually maintained stock, add rooms, or change bookings. Prices stay fixed unless Randomize prices when replenishing is enabled; rerolls use the original generated price and category limits rather than compounding earlier adjustments.

An active GM is required. World-time updates check due establishments; missed intervals produce one current refill. Replenish Now runs the saved settings immediately. Save or reload unsaved changes before using live replenishment or early checkout. Replenishment preserves party access.

## Establishment details and service

**House description** is the existing player-visible description, suitable for atmosphere, clientele, and memorable details. Lodging offerings also support freeform amenities alongside their descriptions, such as secure storage, a private entrance, or a bath. Amenities are descriptive and do not grant automatic rest benefits.

Choose one enabled meal or drink as **Today’s special**, with an optional whole-number discount from 0–100%. The menu, cart, review, receipt, and payment use the same price, rounded to the nearest copper piece. A special remains selected until the GM changes it; it does not rotate automatically at midnight. Removing or regenerating its offering clears the selection.

Optional **Opening hours** use the in-game 24-hour clock, with opening inclusive and closing exclusive. A closing time before opening crosses midnight; equal times mean 24-hour service. The GM may force service open or closed. Service hours never override party access, and closing service does not cancel paid stays. Preview remains available without enabling access or making payments.

**GM notes and rumors** are saved in a separate GM-only journal document. Private notes and unrevealed rumors are not stored on the public establishment or included in player application context. GM-only access uses standard Foundry document permissions; this is not encryption against inspection of replicated client data. Each rumor can be marked for revelation to the party when saved; only those selected texts are published. Clearing a revelation removes it from the current storefront, but does not erase what players already learned. Keep notes and rumors in the draft until Save Establishment.

The **party booking summary** shows active lodging, guests, payer, and the in-game expiration with remaining time. Expiry and early checkout release capacity as before, including while service is closed.

## Orders and stays

Shopping automatically uses the single controlled eligible character, or the user’s assigned character when no single eligible character is controlled. The name is displayed without a payer dropdown. If neither is available, checkout is blocked rather than choosing another owned character. A player adds services, selects room/bed guests and nights, then reviews the total. One payer can cover several party members. Stabling quantities represent animals and are charged per animal per night. Rooms are charged per room per night; shared beds per bed per night. Meals and drinks are separate purchases and consumed services, not inventory items.

Payment is immediate while accessible, through the shared active-GM authority. Capacity, prices, stock, character ownership, guests, and funds are checked again at checkout. Coins, takeaway inventory, consumed servings, booking reservations, and receipts commit together. Pending orders retain their operation ID for safe retry and reconciliation. GM recovery controls expose interrupted inn transactions.

Stays begin when payment commits and end after 24 in-game hours per purchased night. Different booking lines can end at different times. Expired or GM-checked-out stays release capacity; early checkout does not issue a refund. Closing an establishment blocks new purchases but preserves existing paid stays. Booking a room does not advance time or grant healing, spell recovery, or other rest benefits.

## Safe previews

Preview Establishment supports menu browsing, rooms, nights, guests, editable cart totals, and Review Purchase while party access remains off. All cart state is temporary. Completion and retry are blocked in code, and the completion button is disabled. Preview never deducts coins, changes inventory or servings, or reserves lodging.

## Verification

Focused tests cover quotes, profile determinism, price/stock limits, stable replenishment, active booking safeguards, separate stay expiry, permission/access enforcement, atomic payment, duplicate operations, interrupted writes/recovery, preview safety, and persistent user/character cart isolation. Existing store and transaction-journal tests remain regression checks for the shared authority and payment machinery.
