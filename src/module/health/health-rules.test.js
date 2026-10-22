import { describe, expect, it } from 'vitest';
import { healthSnapshot, planHealthChange, conditionEffects } from './health-rules.js';

const actor = (hp = 10, max = 10, state = {}) => ({ system: { hitpoints: hp, maxhitpoints: max }, flags: { 'osp-houserules': { healthState: state } } });
describe('BR-18 health rules', () => {
  it('normalizes actor state and does not mutate input', () => { const a = healthSnapshot(actor(5, 10)); const next = planHealthChange(a, { type: 'damage', amount: 2 }); expect(a.hp).toBe(5); expect(next.hp).toBe(3); });
  it('handles below-zero death, zero saves, stabilization and natural healing', () => {
    expect(planHealthChange(healthSnapshot(actor(2)), { type: 'damage', amount: 3 }).dead).toBe(true);
    const zero = planHealthChange(healthSnapshot(actor(2)), { type: 'damage', amount: 2 }); expect(zero.needsDeathSave).toBe(true);
    const saved = planHealthChange(zero, { type: 'zeroResult', round: 4, combatId: 'c', }, { saveSuccess: true, bleed: 1 }); expect(saved.bleed).toMatchObject({ remaining: 2, lastRound: 4 });
    expect(planHealthChange(saved, { type: 'stabilize' }).bleed).toBeNull();
    expect(planHealthChange({ ...saved, bleed: null, stabilized: true, hp: 0 }, { type: 'naturalHealing', conModifier: -4 }, { healing: 1 }).zeroIncapacitated).toBe(false);
  });
  it('counts only completed matching rounds and expires at zero', () => {
    const s = { ...healthSnapshot(actor(0)), zeroIncapacitated: true, bleed: { remaining: 3, lastRound: 4, combatId: 'c' } };
    const next = planHealthChange(s, { type: 'advanceRound', round: 6, combatId: 'c' }); expect(next.bleed.remaining).toBe(1);
    expect(planHealthChange(next, { type: 'advanceRound', round: 7, combatId: 'c' }).dead).toBe(true);
  });
  it('rejects active bleed nonmagical healing and reports conditions', () => {
    const s = { ...healthSnapshot(actor(0)), bleed: { remaining: 2, lastRound: 1, combatId: 'manual' } };
    expect(() => planHealthChange(s, { type: 'heal', amount: 1, magical: false })).toThrow();
    expect(conditionEffects({ ...s, zeroIncapacitated: true, conditions: { prone: true, unconscious: false, incapacitated: false } })).toMatchObject({ cannotAct: true, savePenalty: -4, outgoingAttack: -2, incomingAttack: 4 });
  });
});


it('supports action commands, object HP and normalized snapshots after a commit', () => {
  const snap = healthSnapshot({ system: { hp: { value: 5, max: 10 } }, getFlag: () => ({ conditions: { prone: true } }) });
  expect(snap).toMatchObject({ hp: 5, maxHp: 10, needsDeathSave: false });
  const after = planHealthChange(snap, { action: 'damage', amount: 5 });
  expect(healthSnapshot({ system: { hp: { value: 0, max: 10 } }, getFlag: () => after })).toEqual(after);
});
it('rejects invalid d4s and dead healing and preserves separate incap effects', () => {
  const base = healthSnapshot(actor(0));
  for (const roll of [0, 5, 1.5]) {
    expect(() => planHealthChange(base, { action: 'naturalHealing' }, { healing: roll })).toThrow();
    expect(() => planHealthChange(base, { action: 'zeroResult', round: 1 }, { saveSuccess: true, bleed: roll })).toThrow();
  }
  expect(() => planHealthChange({ ...base, dead: true }, { action: 'heal', amount: 3, magical: true })).toThrow();
  const after = planHealthChange({ ...base, zeroIncapacitated: true, stabilized: true, conditions: { prone: true, unconscious: false, incapacitated: true } }, { action: 'heal', amount: 1 });
  expect(after.zeroIncapacitated).toBe(false); expect(after.conditions.incapacitated).toBe(true);
});
it('forces prone for unconscious/incapacitated and prevents standing until recovered', () => {
  for (const name of ['unconscious', 'incapacitated']) {
    const s = planHealthChange(healthSnapshot(actor()), { action: 'condition', name, value: true });
    expect(s.conditions.prone).toBe(true);
    expect(() => planHealthChange(s, { action: 'condition', name: 'prone', value: false })).toThrow();
    expect(conditionEffects(s).cannotAct).toBe(true);
  }
});
it('manually sets HP while preserving independent conditions and derives zero/death state', () => {
  const injured = { ...healthSnapshot(actor(5, 10)), conditions: { prone: true, unconscious: false, incapacitated: true }, bleed: { remaining: 2, lastRound: 4, combatId: 'c' }, zeroIncapacitated: true, dead: true };
  expect(planHealthChange(injured, { action: 'setHP', value: 4 })).toMatchObject({ hp: 4, dead: false, bleed: null, zeroIncapacitated: false, needsDeathSave: false, conditions: injured.conditions });
  expect(planHealthChange(healthSnapshot(actor(4, 10)), { action: 'setHP', value: 0 })).toMatchObject({ hp: 0, dead: false, needsDeathSave: true });
  expect(planHealthChange(healthSnapshot(actor(4, 10)), { action: 'setHP', value: -2 })).toMatchObject({ hp: -2, dead: true, needsDeathSave: false, bleed: null });
  expect(planHealthChange(healthSnapshot(actor(0, 10)), { action: 'setHP', value: 0 })).toEqual(healthSnapshot(actor(0, 10)));
  expect(() => planHealthChange(healthSnapshot(actor(4, 10)), { action: 'setHP', value: 11 })).toThrow();
  expect(() => planHealthChange(healthSnapshot(actor(4, 10)), { action: 'setHP', value: 1.5 })).toThrow();
  for (const value of [null, true, [], '']) expect(() => planHealthChange(healthSnapshot(actor(4, 10)), { action: 'setHP', value })).toThrow();
});
it('backward and repeated completed rounds cannot consume the timer twice', () => {
  const base = { ...healthSnapshot(actor(0)), zeroIncapacitated: true, bleed: { remaining: 2, lastRound: 4, combatId: 'c' } };
  const first = planHealthChange(base, { action: 'advanceRound', round: 5, combatId: 'c' });
  const backwards = planHealthChange(first, { action: 'advanceRound', round: 2, combatId: 'c' });
  expect(planHealthChange(backwards, { action: 'advanceRound', round: 5, combatId: 'c' })).toEqual(first);
  expect(planHealthChange(first, { action: 'zeroResult', round: 5 }, { saveSuccess: true, bleed: 4 })).toEqual(first);
});
