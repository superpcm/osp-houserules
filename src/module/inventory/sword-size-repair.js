const SYSTEM_ID = 'osp-houserules';
export const SWORD_SIZE_REPAIR_FLAG = 'swordSizeRepairV1';

const list = collection => collection?.contents ?? Array.from(collection ?? []);
const targetFor = item => {
  if (item?.type !== 'container') return null;
  if (item.name === 'Scabbard, Sword') return 2;
  if (item.name === 'Sword Frog') return 1;
  if (item.name === 'Baldric') return 3;
  if (item.name === 'Belt Loop') return 1;
  if (item.name === 'Axe Sling' || item.name === 'Warhammer Sling') return 3;
  return null;
};

async function repairItem(item, repaired) {
  const target = targetFor(item);
  if (target === null || item.flags?.[SYSTEM_ID]?.[SWORD_SIZE_REPAIR_FLAG]) return false;
  const prior = item.system?.storedSize ?? null;
  await item.update({
    system: { storedSize: target },
    [`flags.${SYSTEM_ID}.${SWORD_SIZE_REPAIR_FLAG}`]: {
      priorStoredSize: prior,
      repairedStoredSize: target,
    },
  });
  repaired.push(`${item.name} (${item.id ?? 'pack'})`);
  return true;
}

function actorDocuments(gameRef) {
  const actors = [];
  const seen = new Set();
  const add = actor => {
    if (!actor) return;
    const key = actor.uuid ?? actor.id ?? actor;
    if (seen.has(key)) return;
    seen.add(key);
    actors.push(actor);
  };
  for (const actor of list(gameRef.actors)) add(actor);
  for (const scene of list(gameRef.scenes)) {
    for (const token of list(scene?.tokens)) {
      if (token?.actor && token.actorLink === false) add(token.actor);
    }
  }
  return actors;
}

export async function repairSwordSizes({ gameRef = globalThis.game } = {}) {
  if (!gameRef?.user?.isGM) return { repaired: [], packs: [], skipped: 'not-gm' };
  const repaired = [];
  const packs = [];
  const seenItems = new Set();
  const repairOnce = async item => {
    if (!item) return;
    const key = item.uuid ?? item.id ?? item;
    if (seenItems.has(key)) return;
    seenItems.add(key);
    await repairItem(item, repaired);
  };

  for (const item of list(gameRef.items)) await repairOnce(item);
  for (const actor of actorDocuments(gameRef)) {
    for (const item of list(actor.items)) await repairOnce(item);
  }

  for (const pack of list(gameRef.packs)) {
    if (pack.documentName !== 'Item' || pack.collection !== 'osp-houserules.gear') continue;
    let documents = [];
    let unlocked = false;
    try {
      documents = typeof pack.getDocuments === 'function' ? await pack.getDocuments() : [];
      const pending = documents.some(item => targetFor(item) !== null
        && !item.flags?.[SYSTEM_ID]?.[SWORD_SIZE_REPAIR_FLAG]);
      if (!pending) continue;
      if (pack.locked && typeof pack.configure === 'function') {
        await pack.configure({ locked: false });
        unlocked = true;
      }
      for (const item of documents) {
        const before = repaired.length;
        await repairItem(item, repaired);
        if (repaired.length > before) packs.push(`${pack.collection}:${item.name}`);
      }
    } catch (error) {
      console.warn('[osp-houserules] Sword size repair skipped pack', pack.collection, error);
    } finally {
      if (unlocked && typeof pack.configure === 'function') {
        try { await pack.configure({ locked: true }); }
        catch (error) {
          console.error('[osp-houserules] Sword size pack lock restoration failed', pack.collection, error);
        }
      }
    }
  }
  console.info(`[osp-houserules] Sword size repair: ${repaired.length} item(s), ${packs.length} compendium item(s) updated.`);
  return { repaired, packs, skipped: null };
}
