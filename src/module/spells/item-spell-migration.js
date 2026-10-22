/** A narrow repair for the existing named scroll; future items use explicit creator fields. */
export async function migrateCauseFearScroll() {
  if (game.user?.id !== game.users?.activeGM?.id) return;
  const documents = [...(game.items ?? []), ...Array.from(game.actors ?? []).flatMap(actor => Array.from(actor.items ?? []))];
  const scrollArtwork = {
    'Scroll of Cure Light Wounds': 'scroll-cure-light-wounds',
    'Scroll of Hold Person': 'scroll-hold-person',
    'Longsword +2': 'longsword-plus-2'
  };
  for (const item of documents) {
    const artwork = scrollArtwork[item.name];
    if (artwork) {
      const path = `systems/osp-houserules/assets/thumbs/images/magic/${artwork}_thumb.webp`;
      if (item.img !== path) await item.update({ img: path });
      continue;
    }
    if (item.name !== 'Scroll of Cause Fear') continue;
    const update = {};
    const fields = { spellKey: 'remove_fear', spellClass: 'cleric', spellReversed: true, spellSourceKind: 'scroll' };
    for (const [key, value] of Object.entries(fields)) if (item.system?.[key] !== value) update[`system.${key}`] = value;
    const img = item.img;
    let validImage = false;
    if (img && !img.endsWith('item-bag.svg')) {
      try { validImage = (await fetch(img, { method: 'HEAD' })).ok; } catch { /* Use the installed scroll icon below. */ }
    }
    if (!validImage || img === 'icons/sundries/scrolls/scroll-writing-tan.webp') update.img = 'systems/osp-houserules/assets/thumbs/images/magic/scroll-cause-fear_thumb.webp';
    if (Object.keys(update).length) await item.update(update);
  }
}
