const SYSTEM_ID = 'osp-houserules';
export const WINTER_CLOTHES_PROFILE_FLAG = 'winterClothesProfileV1';
export const WINTER_CLOTHES_DESCRIPTION = 'Thick wool garments and a hooded coat lined with fleece protect the wearer from bitter winds and winter cold. Reinforced seams, snug cuffs, and a belted waist retain warmth while allowing freedom of movement. Deep inner pockets keep small essentials close to the body and sheltered from snow and damp.';

const WINTER_CLOTHES_NAME = /^(Winter Clothes|Clothes, Winter)(\s+[+-]\d+)?$/;
const list = collection => collection?.contents ?? Array.from(collection ?? []);

const winterClothesMatch = item => item?.type === 'clothing' && WINTER_CLOTHES_NAME.test(item.name ?? '');
const actorDocuments = gameRef => {
  const actors = [], seen = new Set();
  const add = actor => {
    if (!actor) return;
    const key = actor.uuid ?? actor.id ?? actor;
    if (!seen.has(key)) { seen.add(key); actors.push(actor); }
  };
  for (const actor of list(gameRef.actors)) add(actor);
  for (const scene of list(gameRef.scenes)) {
    for (const token of list(scene?.tokens)) if (token?.actor && token.actorLink === false) add(token.actor);
  }
  return actors;
};

const canonicalName = name => {
  const match = WINTER_CLOTHES_NAME.exec(name ?? '');
  return match ? `Clothes, Winter${match[2] ?? ''}` : name;
};

async function repairItem(item, updated) {
  if (!winterClothesMatch(item) || item.flags?.[SYSTEM_ID]?.[WINTER_CLOTHES_PROFILE_FLAG]) return false;
  const profile = {
    version: 1,
    priorName: item.name ?? null,
    priorDescription: item.system?.description ?? null,
    priorCapacity: item.system?.capacity ?? null,
  };
  await item.update({
    name: canonicalName(item.name),
    system: { description: WINTER_CLOTHES_DESCRIPTION, capacity: 3 },
    [`flags.${SYSTEM_ID}.${WINTER_CLOTHES_PROFILE_FLAG}`]: profile,
  });
  updated.push(`${item.name} (${item.id ?? 'pack'})`);
  return true;
}

export async function repairWinterClothesProfile({ gameRef = globalThis.game } = {}) {
  if (!gameRef?.user?.isGM) return { updated: [], count: 0, packs: [], skipped: 'not-gm' };
  const updated = [], packs = [], seen = new Set();
  const once = async item => {
    if (!item) return;
    const key = item.uuid ?? item.id ?? item;
    if (seen.has(key)) return;
    seen.add(key);
    await repairItem(item, updated);
  };
  for (const item of list(gameRef.items)) await once(item);
  for (const actor of actorDocuments(gameRef)) for (const item of list(actor.items)) await once(item);
  for (const pack of list(gameRef.packs)) {
    if (pack.documentName !== 'Item' || !['osp-houserules.clothing', 'osp-houserules.gear'].includes(pack.collection)) continue;
    let unlocked = false;
    try {
      const documents = typeof pack.getDocuments === 'function' ? await pack.getDocuments() : [];
      if (!documents.some(item => winterClothesMatch(item) && !item.flags?.[SYSTEM_ID]?.[WINTER_CLOTHES_PROFILE_FLAG])) continue;
      if (pack.locked && typeof pack.configure === 'function') { await pack.configure({ locked: false }); unlocked = true; }
      for (const item of documents) {
        const before = updated.length;
        await once(item);
        if (updated.length > before) packs.push(`${pack.collection}:${item.name}`);
      }
    } finally {
      if (unlocked && typeof pack.configure === 'function') await pack.configure({ locked: true });
    }
  }
  console.info(`[osp-houserules] Winter clothes profile: ${updated.length} item(s), ${packs.length} compendium item(s) updated.`);
  return { updated, count: updated.length, packs, skipped: null };
}
