import { describe, expect, it } from 'vitest';
import house from '../../../data/ose_house_rules_v1_5.json';
import { lookupCritical, criticalFollowup } from './critical-rules.js';

describe('BR-18 critical rules', () => {
  it.each(['hit', 'miss', 'minor', 'major'])('looks up every %s result inclusively', table => {
    const source = table === 'hit' ? house.critical_hits.table : table === 'miss' ? house.critical_misses : table === 'minor' ? house.critical_hits.minor_injury : house.critical_hits.major_injury;
    for (const entry of source) { const [a, b = a] = entry.range.split('-').map(Number); expect(lookupCritical(house, table, a).adjustedRoll).toBe(a); expect(lookupCritical(house, table, b).adjustedRoll).toBe(b); }
  });
  it('clamps only major adjusted rolls and preserves raw roll', () => { expect(lookupCritical(house, 'major', 1, -20)).toMatchObject({ rawRoll: 1, adjustedRoll: 1 }); expect(lookupCritical(house, 'major', 100, 20).adjustedRoll).toBe(100); });
  it('identifies hit followups at exact boundaries', () => { expect(criticalFollowup(90)).toMatchObject({ injuryTable: 'minor' }); expect(criticalFollowup(95)).toMatchObject({ injuryTable: 'major' }); expect(criticalFollowup(99)).toMatchObject({ addMelee: true }); expect(criticalFollowup(87)).toMatchObject({ rerollOnes: true }); });
});
