const SYSTEM_ID = 'osp-houserules';
export const EQUIPMENT_SIZE_REPAIR_FLAG = 'equipmentSizeRepairV1';

const TARGETS = new Map([
  ['Barding, Chain mail|item', 40],
  ['Belt Pouch (S)|container', 1],
  ["Thieves' Tools|item", 2],
  ['Winter Clothes|clothing', 8],
  ['Clothes, Winter|clothing', 8],
  ['Rations, Standard|item', 6],
]);
const STANDARD_RATIONS_DESCRIPTION = 'Fresh, unpreserved food suitable for shorter trips. Tastier but bulkier than iron rations. Cannot be carried indefinitely without spoilage unless kept cool or magically preserved. Common among caravan travelers or short expeditions. One inventory unit is a seven-day bundle: quantity 1, storage size 6 for the complete bundle. Weight and price are per bundle.';
const OLD_STANDARD_RATIONS_DESCRIPTION = 'Fresh, unpreserved food suitable for shorter trips. Tastier but bulkier than iron rations. Cannot be carried indefinitely without spoilage unless kept cool or magically preserved. Common among caravan travelers or short expeditions. One inventory unit is a seven-day bundle: quantity 1, storage size 4 for the complete bundle. Weight and price are per bundle.';
const list = collection => collection?.contents ?? Array.from(collection ?? []);
const keyFor = item => `${item?.name ?? ''}|${item?.type ?? ''}`;
const targetFor = item => TARGETS.get(keyFor(item)) ?? null;
const isCanonicalRations = item => keyFor(item) === 'Rations, Standard|item' && item.system?.description === OLD_STANDARD_RATIONS_DESCRIPTION;

async function repairItem(item, repaired) {
  const target = targetFor(item);
  if (target === null || item.flags?.[SYSTEM_ID]?.[EQUIPMENT_SIZE_REPAIR_FLAG]) return false;
  const prior = item.system?.storedSize ?? null;
  const update = {
    system: { storedSize: target },
    [`flags.${SYSTEM_ID}.${EQUIPMENT_SIZE_REPAIR_FLAG}`]: { priorStoredSize: prior, repairedStoredSize: target },
  };
  if (isCanonicalRations(item)) {
    update.system.description = STANDARD_RATIONS_DESCRIPTION;
    update[`flags.${SYSTEM_ID}.${EQUIPMENT_SIZE_REPAIR_FLAG}`].priorDescription = item.system.description;
    update[`flags.${SYSTEM_ID}.${EQUIPMENT_SIZE_REPAIR_FLAG}`].repairedDescription = STANDARD_RATIONS_DESCRIPTION;
  }
  await item.update(update);
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

export async function repairEquipmentSizes({ gameRef = globalThis.game } = {}) {
  if (!gameRef?.user?.isGM) return { repaired: [], packs: [], skipped: 'not-gm' };
  const repaired = [], packs = [], seen = new Set();
  const once = async item => { if (!item) return; const key = item.uuid ?? item.id ?? item; if (seen.has(key)) return; seen.add(key); await repairItem(item, repaired); };
  for (const item of list(gameRef.items)) await once(item);
  for (const actor of actorDocuments(gameRef)) for (const item of list(actor.items)) await once(item);
  for (const pack of list(gameRef.packs)) {
    if (pack.documentName !== 'Item' || !['osp-houserules.gear', 'osp-houserules.tack', 'osp-houserules.clothing'].includes(pack.collection)) continue;
    let unlocked = false;
    try {
      const documents = typeof pack.getDocuments === 'function' ? await pack.getDocuments() : [];
      if (!documents.some(item => targetFor(item) !== null && !item.flags?.[SYSTEM_ID]?.[EQUIPMENT_SIZE_REPAIR_FLAG])) continue;
      if (pack.locked && typeof pack.configure === 'function') { await pack.configure({ locked: false }); unlocked = true; }
      for (const item of documents) { const before = repaired.length; await repairItem(item, repaired); if (repaired.length > before) packs.push(`${pack.collection}:${item.name}`); }
    } finally {
      if (unlocked && typeof pack.configure === 'function') await pack.configure({ locked: true });
    }
  }
  console.info(`[osp-houserules] Equipment size repair: ${repaired.length} item(s), ${packs.length} compendium item(s) updated.`);
  return { repaired, packs, skipped: null };
}

export { TARGETS, STANDARD_RATIONS_DESCRIPTION, OLD_STANDARD_RATIONS_DESCRIPTION };
