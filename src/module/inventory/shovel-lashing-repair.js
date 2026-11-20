/** Apply the Shovel carrying rule once, including copies predating its catalog entry. */
export const SHOVEL_LASHING_FLAG = 'shovelLashingV1';
const scope = 'osp-houserules';
const list = collection => collection?.contents ?? Array.from(collection ?? []);

export async function repairShovelLashing(gameRef = globalThis.game) {
  if (!gameRef?.user?.isGM) return [];
  const items = [...list(gameRef.items), ...list(gameRef.actors).flatMap(actor => list(actor.items))];
  const repaired = [];
  for (const item of items) {
    const flags = item.flags?.[scope] ?? {};
    if (item.name !== 'Shovel' || item.type !== 'item' || flags.custom || flags[SHOVEL_LASHING_FLAG]) continue;
    await item.update({
      'system.lashable': true,
      'system.slotCost': 1,
      [`flags.${scope}.${SHOVEL_LASHING_FLAG}`]: {
        prior: { lashable: item.system?.lashable ?? null, slotCost: item.system?.slotCost ?? null },
      },
    });
    repaired.push(item.id);
  }
  return repaired;
}
