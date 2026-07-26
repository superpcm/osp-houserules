/**
 * Foundry VTT Macro: Unhide Orphaned Items
 *
 * The Gear tab only renders an item nested under its `system.containerId` if that
 * container is itself a real, currently-rendered container/clothing item on the same
 * actor. If a belt, backpack, or other container gets deleted or replaced (giving it a
 * new document id) while items still reference the old id — a "phantom" container
 * reference — those items silently vanish from the sheet even though they still exist
 * in the actor's item list. This scans every actor's items, follows each item's
 * containerId chain, and flags any item where that chain breaks (missing parent, wrong
 * parent type, or a self-referencing loop). Fixing an item clears its containerId/lashed
 * flags so it pops back up as a top-level Gear item.
 *
 * Usage:
 * 1. Create a new macro in Foundry, type "Script"
 * 2. Copy this entire script into the macro
 * 3. Run it once with DRY_RUN = true to see what it would change (nothing is modified)
 * 4. Set DRY_RUN = false and run again to actually unhide the flagged items
 */

const DRY_RUN = true;

// A parent must be one of these types to ever actually render nested children.
const VALID_PARENT_TYPES = new Set(['container', 'clothing']);
const MAX_CHAIN_DEPTH = 25;

function findOrphanedItems(actor) {
  const itemsById = new Map(actor.items.map((i) => [i.id, i]));
  const orphaned = [];

  for (const item of actor.items) {
    const containerId = item.system?.containerId;
    if (!containerId) continue;

    const seen = new Set([item.id]);
    let currentId = containerId;
    let reason = null;
    let depth = 0;

    while (currentId) {
      if (seen.has(currentId)) {
        reason = `circular containerId reference (loops back through ${currentId})`;
        break;
      }
      if (++depth > MAX_CHAIN_DEPTH) {
        reason = `containerId chain exceeds ${MAX_CHAIN_DEPTH} links (likely a loop)`;
        break;
      }
      seen.add(currentId);

      const parent = itemsById.get(currentId);
      if (!parent) {
        reason = `containerId "${currentId}" does not match any item on this actor`;
        break;
      }
      if (!VALID_PARENT_TYPES.has(parent.type)) {
        reason = `containerId points to "${parent.name}" (type: ${parent.type}), which is never rendered as a container`;
        break;
      }

      currentId = parent.system?.containerId;
    }

    if (reason) {
      orphaned.push({ item, reason });
    }
  }

  return orphaned;
}

async function unhideOrphanedItems() {
  ui.notifications.info(DRY_RUN ? "Scanning for hidden items (dry run)..." : "Scanning and unhiding hidden items...");

  const actors = game.actors.contents;
  let totalFound = 0;
  const summary = [];

  for (const actor of actors) {
    const orphaned = findOrphanedItems(actor);
    if (orphaned.length === 0) continue;

    console.log(`\n=== ${actor.name} (${orphaned.length} hidden item${orphaned.length === 1 ? '' : 's'}) ===`);

    for (const { item, reason } of orphaned) {
      console.log(`  • "${item.name}" [${item.id}] — ${reason}`);
      totalFound++;
      summary.push(`${actor.name}: ${item.name}`);

      if (!DRY_RUN) {
        const updates = { 'system.containerId': null };
        if ('lashed' in (item.system || {})) updates['system.lashed'] = false;
        if ('equipped' in (item.system || {})) updates['system.equipped'] = false;
        await item.update(updates);
      }
    }
  }

  console.log(`\n=== ${DRY_RUN ? 'DRY RUN COMPLETE' : 'UNHIDE COMPLETE'} ===`);
  console.log(`Total hidden items found: ${totalFound}`);
  if (summary.length) console.log(summary.join('\n'));

  if (totalFound === 0) {
    ui.notifications.info("No hidden/orphaned items found.");
  } else if (DRY_RUN) {
    ui.notifications.warn(`Found ${totalFound} hidden item(s) — see console (F12) for details. Set DRY_RUN = false and re-run to fix them.`);
  } else {
    ui.notifications.info(`Unhid ${totalFound} item(s). Reload affected character sheets to see them.`);
  }
}

unhideOrphanedItems();
