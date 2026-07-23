/**
 * @file Pure logic for ammunition / thrown-weapon inventory tracking.
 * No Foundry globals — operates on plain item-shaped objects so it can be unit tested
 * and reused by any roll pipeline (character sheet, macros, etc).
 */

/**
 * A weapon with an ammoTag is a reusable launcher (Bow/Crossbow/Sling) whose ammo is a
 * separate item — it can never be "the consumable" itself, regardless of its other tags.
 * This guard is what prevents crossbows (tagged missile+reload, same as Dart) from being
 * mistaken for a self-consumed throwable.
 */
export function isConsumableWeapon(item) {
  if (!item || item.type !== 'weapon') return false;
  if (getAmmoTag(item)) return false;
  const tags = item.system?.tags || [];
  return tags.includes('consumable') || (tags.includes('missile') && tags.includes('reload'));
}

export function getAmmoTag(item) {
  return item?.system?.ammoTag || null;
}

/**
 * Launcher weapons that should always carry an `ammoTag`. Items created before the ammoTag
 * field existed won't have it yet — without this guard, a weapon like this falls through to
 * the missile-only "self-consumed" branch below and gets deleted as if it were its own ammo
 * (this happened in practice to a live Longbow). Names here must be refreshed via
 * scripts/refresh-items-macro.js rather than treated as disposable.
 */
const KNOWN_LAUNCHER_NAMES = new Set([
  'Longbow',
  'Shortbow',
  'Crossbow, Light',
  'Crossbow, Heavy',
  'Sling',
  'Sling, Staff',
]);

/**
 * Determines what an attack with this weapon consumes.
 * @returns {null|{kind:'self'}|{kind:'external', tag:string}|{kind:'stale'}}
 */
export function resolveAmmoRequirement(item, { isThrown = false } = {}) {
  if (!item || item.type !== 'weapon') return null;

  const ammoTag = getAmmoTag(item);
  if (ammoTag) return { kind: 'external', tag: ammoTag };

  if (KNOWN_LAUNCHER_NAMES.has(item.name)) return { kind: 'stale' };

  const tags = item.system?.tags || [];
  const isMelee = item.system?.melee ?? tags.includes('melee');
  const isMissile = item.system?.missile ?? tags.includes('missile');
  const usedAsMissile = isThrown || (!isMelee && isMissile);

  if (!usedAsMissile) return null;
  return { kind: 'self' };
}

/** Matching ammunition-type items on the actor with stock available. */
export function findAmmoStacks(actorItems, tag) {
  if (!tag) return [];
  return Array.from(actorItems).filter(i =>
    i.type === 'ammunition' &&
    (i.system?.tags || []).includes(tag) &&
    (i.system?.quantity ?? 0) > 0
  );
}

/** Deterministic pick among matching ammo stacks: largest stack first. */
export function pickAmmoStack(stacks) {
  if (!stacks || stacks.length === 0) return null;
  return stacks.slice().sort((a, b) => (b.system?.quantity ?? 0) - (a.system?.quantity ?? 0))[0];
}

/**
 * Pre-roll gate: can this attack be made? Combines requirement resolution, stock lookup,
 * and stack selection into one result the caller can act on before/after rolling.
 * @returns {{ok:boolean, requirement:(null|object), ammoItem:(object|null), message:(string|undefined)}}
 */
export function checkAmmoAvailability(item, actorItems, { isThrown = false } = {}) {
  const requirement = resolveAmmoRequirement(item, { isThrown });
  if (!requirement) return { ok: true, requirement: null, ammoItem: null };

  if (requirement.kind === 'stale') {
    return {
      ok: false,
      requirement,
      ammoItem: null,
      message: `${item.name}'s data is out of date and needs to be refreshed before it can be fired (run the item refresh macro).`,
    };
  }

  if (requirement.kind === 'self') {
    const qty = item.system?.quantity ?? 0;
    if (qty < 1) {
      return { ok: false, requirement, ammoItem: null, message: `No ${item.name} remaining.` };
    }
    return { ok: true, requirement, ammoItem: null };
  }

  const stacks = findAmmoStacks(actorItems, requirement.tag);
  if (stacks.length === 0) {
    return { ok: false, requirement, ammoItem: null, message: `Out of ammunition for ${item.name} — no matching ammo found.` };
  }
  return { ok: true, requirement, ammoItem: pickAmmoStack(stacks) };
}
