const SYSTEM_ID = 'osp-houserules';
export const BELT_LASHING_FLAG = 'beltLashingV1';
const TARGETS = new Map([
  ['Bolt Case|container', { slotCost: 2 }],
  ['Quiver, Hip|container', { slotCost: 2 }],
  ['Coin Purse|container', { slotCost: 0 }],
  ['Belt Pouch (L)|container', { slotCost: 2, description: "A roomy leather pouch with broad flap and brass-buckled strap, made to hang securely from a waistbelt. It holds bulkier essentials such as rations, tools, or extra coin and uses 2 of a belt's 6 attachment slots." }],
  ['Belt Pouch (S)|container', { slotCost: 1, description: "A small leather pouch that attaches to a belt and uses 1 of a belt's 6 attachment slots. Mix pouches and other belt attachments within the belt's six-slot capacity." }],
]);
const list = collection => collection?.contents ?? Array.from(collection ?? []);
const key = item => `${item?.name}|${item?.type}`;

async function repairItem(item, repaired) {
  const target = TARGETS.get(key(item));
  if (!target || item.flags?.[SYSTEM_ID]?.custom || item.flags?.[SYSTEM_ID]?.[BELT_LASHING_FLAG]) return;
  const prior = { slotCost: item.system?.slotCost ?? null };
  if (target.description !== undefined) prior.description = item.system?.description ?? null;
  const update = { system: { slotCost: target.slotCost }, [`flags.${SYSTEM_ID}.${BELT_LASHING_FLAG}`]: { prior, repaired: target } };
  if (target.description !== undefined) update.system.description = target.description;
  await item.update(update);
  repaired.push(`${item.name} (${item.id ?? 'pack'})`);
}

export async function repairBeltLashing({ gameRef = globalThis.game } = {}) {
  if (!gameRef?.user?.isGM) return { repaired: [], packs: [], skipped: 'not-gm' };
  const repaired = [];
  for (const item of [...list(gameRef.items), ...list(gameRef.actors).flatMap(actor => list(actor.items))]) await repairItem(item, repaired);
  const packs = [];
  for (const pack of list(gameRef.packs)) {
    if (pack.documentName !== 'Item' || pack.collection !== 'osp-houserules.gear') continue;
    let documents = [];
    let wasLocked = false;
    try {
      documents = typeof pack.getDocuments === 'function' ? await pack.getDocuments() : [];
      const pending = documents.some(item => TARGETS.has(key(item)) && !item.flags?.[SYSTEM_ID]?.custom && !item.flags?.[SYSTEM_ID]?.[BELT_LASHING_FLAG]);
      if (!pending) continue;
      wasLocked = Boolean(pack.locked);
      if (wasLocked && typeof pack.configure === 'function') await pack.configure({ locked: false });
      for (const item of documents) {
        const before = repaired.length;
        await repairItem(item, repaired);
        if (repaired.length > before) packs.push(`${pack.collection}:${item.name}`);
      }
      if (wasLocked && typeof pack.configure === 'function') await pack.configure({ locked: true });
    } catch (error) {
      console.warn('[osp-houserules] Belt catalog pack repair skipped', pack.collection, error);
      try {
        if (wasLocked && pack.locked === false && typeof pack.configure === 'function') await pack.configure({ locked: true });
      } catch (restoreError) {
        console.error('[osp-houserules] Belt catalog pack lock restoration failed', pack.collection, restoreError);
      }
    }
  }
  console.info(`[osp-houserules] Belt lashing repair: ${repaired.length} item(s), ${packs.length} compendium item(s) updated.`);
  return { repaired, packs, skipped: null };
}

