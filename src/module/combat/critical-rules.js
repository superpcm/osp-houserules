const integer = (value, label, min, max) => { const n = Number(value); if (!Number.isInteger(n) || n < min || n > max) throw new RangeError(`${label} must be an integer from ${min} to ${max}`); return n; };
function parseRange(value) { const text = String(value), single = text.match(/^\d+$/), m = text.match(/^(\d+)\s*-\s*(\d+)$/); if (single) return [Number(single[0]), Number(single[0])]; if (!m) throw new RangeError(`Invalid critical range: ${value}`); return [Number(m[1]), Number(m[2])]; }
function lookup(table, roll) { return (table ?? []).find(entry => { const [min, max] = parseRange(entry.range); return roll >= min && roll <= max; }); }
export function lookupCritical(house, table, roll, meleeBonus = 0) {
  const rawRoll = integer(roll, 'critical roll', 1, 100), kind = String(table ?? 'hit').toLowerCase();
  const source = kind === 'hit' ? house?.critical_hits?.table : kind === 'miss' ? house?.critical_misses : kind === 'minor' ? house?.critical_hits?.minor_injury : kind === 'major' ? house?.critical_hits?.major_injury : null;
  if (!source) throw new RangeError(`Unknown critical table: ${table}`);
  const adjusted = kind === 'major' ? Math.max(1, Math.min(100, rawRoll + integer(meleeBonus, 'melee bonus', -100, 100))) : rawRoll;
  const entry = lookup(source, adjusted); if (!entry) throw new RangeError(`No critical entry for ${adjusted}`);
  return { ...entry, rawRoll, adjustedRoll: adjusted, adjusted, table: kind };
}
export function criticalFollowup(hitRoll) {
  const roll = integer(hitRoll, 'critical hit roll', 1, 100);
  return { injuryTable: roll >= 90 && roll <= 94 ? 'minor' : roll >= 95 ? 'major' : null, addMelee: roll >= 99, rerollOnes: roll >= 87 && roll <= 89 };
}
