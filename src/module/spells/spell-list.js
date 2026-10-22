/**
 * Apply the spell list view filters without changing spell state.
 * Library mode is the only arcane view that includes unrecorded spells.
 */
export function filterSpellList(spells, { mode = 'arcane', view = 'book', known = {}, search = '', level = 'all' } = {}) {
  const library = mode === 'arcane' && view === 'library';
  const query = String(search ?? '').trim().toLowerCase();
  return spells.filter(spell => {
    if (mode === 'arcane' && (library ? known[spell.id] : !known[spell.id])) return false;
    if (level !== 'all' && String(spell.level) !== String(level)) return false;
    return !query || String(spell.name).toLowerCase().includes(query);
  });
}

/** Build the state command for one preparation step without allowing negatives. */
export function preparationStepCommand({ spellId, reverse = false, currentCount = 0, delta = 0 }) {
  const current = Number(currentCount) || 0;
  const change = Number(delta) || 0;
  return { action: 'prepare', spellId, reverse: Boolean(reverse), count: Math.max(0, current + change) };
}
