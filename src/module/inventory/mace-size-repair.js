const SYSTEM_ID = 'osp-houserules';
export const MACE_SIZE_REPAIR_FLAG = 'maceSizeRepairV1';
const list = collection => collection?.contents ?? Array.from(collection ?? []);
const isMace = item => item?.type === 'weapon' && /^Mace(?:\s*[+-]\d+)?$/.test(item.name ?? '');

async function repairItem(item, repaired) {
  if (!isMace(item) || item.flags?.[SYSTEM_ID]?.[MACE_SIZE_REPAIR_FLAG]) return false;
  const prior = item.system?.storedSize ?? null;
  await item.update({
    system: { storedSize: 8 },
    [`flags.${SYSTEM_ID}.${MACE_SIZE_REPAIR_FLAG}`]: { priorStoredSize: prior, repairedStoredSize: 8 },
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

export async function repairMaceSizes({ gameRef = globalThis.game } = {}) {
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
      if (!documents.some(item => isMace(item) && !item.flags?.[SYSTEM_ID]?.[MACE_SIZE_REPAIR_FLAG])) continue;
      if (pack.locked && typeof pack.configure === 'function') { await pack.configure({ locked: false }); unlocked = true; }
      for (const item of documents) { const before = repaired.length; await repairItem(item, repaired); if (repaired.length > before) packs.push(`${pack.collection}:${item.name}`); }
    } catch (error) { console.warn('[osp-houserules] Mace size repair skipped pack', pack.collection, error); }
    finally { if (unlocked && typeof pack.configure === 'function') try { await pack.configure({ locked: true }); } catch (error) { console.error('[osp-houserules] Mace size pack lock restoration failed', error); } }
  }
  console.info(`[osp-houserules] Mace size repair: ${repaired.length} item(s), ${packs.length} compendium item(s) updated.`);
  return { repaired, packs, skipped: null };
}

