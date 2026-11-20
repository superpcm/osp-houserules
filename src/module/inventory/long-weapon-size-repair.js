const SYSTEM_ID = 'osp-houserules';
export const LONG_WEAPON_SIZE_REPAIR_FLAG = 'longWeaponSizeRepairV1';
const TARGETS = new Map([['Javelin', 10], ['Shortbow', 12], ['Longbow', 18], ['Sling, Staff', 15]]);
const list = collection => collection?.contents ?? Array.from(collection ?? []);
const targetFor = item => {
  if (item?.type !== 'weapon') return null;
  const base = String(item.name ?? '').replace(/\s*[+-]\d+$/, '');
  return TARGETS.get(base) ?? null;
};

async function repairItem(item, repaired) {
  const target = targetFor(item);
  if (target === null || item.flags?.[SYSTEM_ID]?.[LONG_WEAPON_SIZE_REPAIR_FLAG]) return false;
  const prior = item.system?.storedSize ?? null;
  await item.update({
    system: { storedSize: target },
    [`flags.${SYSTEM_ID}.${LONG_WEAPON_SIZE_REPAIR_FLAG}`]: { priorStoredSize: prior, repairedStoredSize: target },
  });
  repaired.push(`${item.name} (${item.id ?? 'pack'})`);
  return true;
}

function actorDocuments(gameRef) {
  const actors = [], seen = new Set();
  const add = actor => { if (!actor) return; const key = actor.uuid ?? actor.id ?? actor; if (!seen.has(key)) { seen.add(key); actors.push(actor); } };
  for (const actor of list(gameRef.actors)) add(actor);
  for (const scene of list(gameRef.scenes)) for (const token of list(scene?.tokens)) if (token?.actor && token.actorLink === false) add(token.actor);
  return actors;
}

export async function repairLongWeaponSizes({ gameRef = globalThis.game } = {}) {
  if (!gameRef?.user?.isGM) return { repaired: [], packs: [], skipped: 'not-gm' };
  const repaired = [], packs = [], seen = new Set();
  const once = async item => { if (!item) return; const key = item.uuid ?? item.id ?? item; if (seen.has(key)) return; seen.add(key); await repairItem(item, repaired); };
  for (const item of list(gameRef.items)) await once(item);
  for (const actor of actorDocuments(gameRef)) for (const item of list(actor.items)) await once(item);
  for (const pack of list(gameRef.packs)) {
    if (pack.documentName !== 'Item' || pack.collection !== 'osp-houserules.weapons') continue;
    let unlocked = false;
    try {
      const documents = typeof pack.getDocuments === 'function' ? await pack.getDocuments() : [];
      if (!documents.some(item => targetFor(item) !== null && !item.flags?.[SYSTEM_ID]?.[LONG_WEAPON_SIZE_REPAIR_FLAG])) continue;
      if (pack.locked && typeof pack.configure === 'function') { await pack.configure({ locked: false }); unlocked = true; }
      for (const item of documents) { const before = repaired.length; await repairItem(item, repaired); if (repaired.length > before) packs.push(`${pack.collection}:${item.name}`); }
    } finally {
      if (unlocked && typeof pack.configure === 'function') await pack.configure({ locked: true });
    }
  }
  console.info(`[osp-houserules] Long weapon size repair: ${repaired.length} item(s), ${packs.length} compendium item(s) updated.`);
  return { repaired, packs, skipped: null };
}
