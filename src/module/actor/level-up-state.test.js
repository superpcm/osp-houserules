import { describe, expect, it } from 'vitest';
import {
  accumulatedSkillCredit, createLevelUpState, initialLevelUpData, markLevelClaimed,
  markLevelCommitted, normalizeLevelUpState, skillCreditForLevel, validateSkillAllocation
} from './level-up-state.js';

describe('BR-12 durable level-up state', () => {
  it('uses save-and-combine schedules for fractional skill rates', () => {
    const assassin = { startPoints: 3, rate: 1.5 };
    const barbarian = { startPoints: 2, rate: 0.5 };
    expect([1, 2, 1].map((_, i) => skillCreditForLevel(assassin, i + 2))).toEqual([1, 2, 1]);
    expect([1, 0, 1].map((_, i) => skillCreditForLevel(barbarian, i + 2))).toEqual([0, 1, 0]);
    expect(accumulatedSkillCredit(assassin, 1, 3)).toBe(3);
  });

  it('commits each level once and resumes at the first missing level', () => {
    let state = createLevelUpState({ generation: 4, fromLevel: 1, targetLevel: 4 });
    state = markLevelClaimed(state, 2, { claimToken: 'a', ownerId: 'u1' });
    state = markLevelCommitted(state, 2, { grantedHP: 4, skillCredit: 1, receiptId: 'r2' });
    expect(state.nextLevel).toBe(3);
    const duplicate = markLevelCommitted(state, 2, { grantedHP: 99 });
    expect(duplicate.levels['2'].grantedHP).toBe(4);
    state = markLevelCommitted(state, 3, { grantedHP: 2 });
    state = markLevelCommitted(state, 4, { grantedHP: 2 });
    expect(state.status).toBe('complete');
  });

  it('validates atomic skill allocations and preserves unspent points', () => {
    const result = validateSkillAllocation({ skills: ['climb'], current: { climb: 1 }, allocation: { climb: 2 }, pool: 3 });
    expect(result).toMatchObject({ ok: true, spent: 2, remaining: 1, values: { climb: 3 } });
    expect(validateSkillAllocation({ skills: ['climb'], current: { climb: 4 }, allocation: { climb: 2 }, pool: 3 }).ok).toBe(false);
    expect(validateSkillAllocation({ skills: ['climb'], current: { climb: 1 }, allocation: { other: 1 }, pool: 3 }).ok).toBe(false);
  });

  it('normalizes legacy/missing state without inventing historical gains', () => {
    expect(normalizeLevelUpState(null, { fromLevel: 7, targetLevel: 7 }).nextLevel).toBe(8);
    expect(initialLevelUpData('Barbarian')).toMatchObject({ skillBase: 1, pendingSkillPoints: 2 });
  });
});


it('BR-17 preserves each class pool and fractional total through level 14', () => {
  for (const [name, startPoints, rate, count] of [['Thief', 4, 2, 7], ['Assassin', 3, 1.5, 4], ['Barbarian', 2, 0.5, 3]]) {
    const initial = initialLevelUpData(name);
    expect(initial.pendingSkillPoints).toBe(startPoints);
    expect(Object.values(initial.skills)).toEqual(Array(count).fill(1));
    expect(initial.skills).not.toHaveProperty('assassination');
    let total = startPoints;
    for (let level = 2; level <= 14; level++) {
      total += skillCreditForLevel({ startPoints, rate }, level);
      expect(total).toBe(Math.floor(startPoints + (level - 1) * rate));
    }
    expect(validateSkillAllocation({ skills: Object.keys(initial.skills), current: initial.skills, allocation: { assassination: 1 }, pool: total }).ok).toBe(false);
  }
});
