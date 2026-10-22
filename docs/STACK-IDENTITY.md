# Stack identity

Bank treasure, Party Treasury treasure, storehouse entries, and inventory merges use `canStackItems` in `src/module/inventory/stack-identity.js`. Both inputs must contain valid item snapshots and neither may be unique.

The comparison keeps the complete snapshot, including name, type, image, description, unit value, magic modifiers, effects, tags, flags, and unknown custom fields. Object key order is normalized. Array order is preserved conservatively.

Only these fields are excluded:

- Document metadata: `_id`, `id`, `uuid`, `_stats`, `sort`, `folder`, `ownership`, `pack`, and `parent`.
- Stack quantity and placement: `system.quantity`, `system.containerId`, `system.equipped`, and `system.lashed`.
- For treasure items only, `system.cumulativeCost` and `system.cumulativeWeight`, which `OspItem.prepareData` derives from unit properties and quantity.

Location and placement remain separate constraints: stored withdrawals and stored-item merges do not target readied or lashed copies. Populated containers retain their own identity and descendants.

Unique tags and `system.unique === true` prevent merging on either side. Existing ledger/storehouse row-level `unique` markers also prevent merging. When an old unique row lacks an item-level marker, withdrawal carries the supported `unique` tag onto the recreated item so redeposit and account transfers retain that protection.

Existing rows are compared as stored, without migration. Differences, including absent versus present fields, decline to merge; no values are guessed. This preserves future transfers but cannot reconstruct distinguishing information already lost in an earlier merge.

Ordinary change does not merge into customized coin stacks. Purchases can spend across separate coin stacks of a denomination without replacing their snapshots or flags.
