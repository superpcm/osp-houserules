import { isProtectedArrowBundle } from './arrow-bundle.js';
import { isProtectedBoltBundle } from './bolt-bundle.js';
import { isProtectedTorchBundle } from './torch-bundle.js';
import { isRollableGarment } from './long-item-transport.js';
import { isBackpack } from './long-item-transport.js';

const SCOPE = 'osp-houserules';
const BELT_TOOL_NAMES = new Set(['Shovel', 'Crowbar']);
const BELT_RESTRICTED_NAMES = new Set([
  'Bedroll', 'Pole, Ten Foot', 'Lantern, Mount', 'Banded mail', 'Javelin', 'Battle Axe', 'Instrument',
]);
const baseName = item => String(item?.name ?? '').replace(/\s*[+-]\d+$/, '');
const tagsOf = item => Array.isArray(item?.system?.tags) ? item.system.tags : [];
const canonicalName = item => String(item?.flags?.[SCOPE]?.canonicalName ?? item?.flags?.[SCOPE]?.canonicalname ?? item?.system?.canonicalName ?? item?.system?.canonicalname ?? item?.canonicalName ?? item?.canonicalname ?? '');
const canonicalBaseName = item => canonicalName(item).replace(/\s*[+-]\d+$/, '').trim();
const isTentName = item => /^(?:Tent,\s*\d+-person|Tent\s+(?:Fabric|Poles),\s*\d+-person)$/i.test(baseName(item));
const isTentByMetadata = item => {
  const flags = item?.flags?.[SCOPE] ?? {};
  const componentKind = flags.tentComponent?.kind;
  const canonical = canonicalBaseName(item);
  return componentKind === 'fabric' || componentKind === 'poles'
    || tagsOf(item).includes('tent-fabric') || tagsOf(item).includes('tent-poles')
    || /^(?:Tent,\s*\d+-person|Tent\s+(?:Fabric|Poles),\s*\d+-person)$/i.test(canonical);
};
const isTent = item => isTentName(item) || isTentByMetadata(item);

/** Return the shared Belt-specific rejection for long tools, or a neutral decision. */
export const beltToolLashDecision = (item, host) => {
  if (host?.type !== 'clothing' || baseName(host) !== 'Belt') return { allowed: null, reason: null };
  const name = baseName(item);
  if (!BELT_TOOL_NAMES.has(name) && !BELT_RESTRICTED_NAMES.has(name) && !isTent(item)) return { allowed: null, reason: null };
  const guidance = BELT_TOOL_NAMES.has(name)
    ? 'lash it outside a Backpack or carry it.'
    : name === 'Battle Axe'
      ? 'use an Axe Sling.'
      : 'use a suitable container or carrying arrangement instead.';
  return {
    allowed: false,
    reason: `${item.name} cannot be lashed to a Belt; ${guidance}`
  };
};

/**
 * Resolve the effective belt/lash cost. Legacy entries with an explicit zero
 * used zero as an unset value; Coin Purse is the one intentional freebie.
 */
export const getLashSlotCost = (item, host = null) => {
  const name = String(item?.name ?? '').replace(/\s*[+-]\d+$/, '');
  if (isProtectedArrowBundle(item) && isBackpack(host)) return 1;
  if (isProtectedBoltBundle(item) && isBackpack(host)) return 1;
  if (isProtectedTorchBundle(item) && isBackpack(host)) return 1;
  // Coin Purses are a free belt attachment.  Keep this name-based so legacy
  // actor items with a stale slotCost (normally 1) remain attachable.
  if (item?.name === 'Coin Purse') return 0;
  if (isBackpack(host) && ['Quiver', 'Mess Kit', "Healer's Kit", 'Mallet, Wooden', 'Waterskin', 'Wineskin'].includes(name)) return 1;
  if (isBackpack(host) && isRollableGarment(item)) {
    const perItem = String(item?.name ?? '').replace(/\s*[+-]\d+$/, '') === 'Cloak' ? 1 : 2;
    return perItem * Math.max(1, Number(item?.system?.quantity) || 1);
  }
  const cost = Number(item?.system?.slotCost);
  const base = cost || 1;
  if (isBackpack(host) && name === 'Javelin') return base * Math.max(1, Number(item?.system?.quantity) || 1);
  if (isBackpack(host) && (item?.system?.tags || []).includes('tent-poles')) {
    return base * Math.max(1, Number(item?.system?.quantity) || 1);
  }
  if (isBackpack(host) && /^Tent Poles, (1|2|4)-person$/.test(name)) {
    return base * Math.max(1, Number(item?.system?.quantity) || 1);
  }
  return base;
};

