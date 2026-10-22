import { describe, expect, it } from 'vitest';
import house from '../../../data/ose_house_rules_v1_5.json';
import profiles from '../../../data/class_profiles.json';
import {
  assassinationPenalty, bardUses, beastCompanionLimits, d6Outcome, d6Target,
  mageChance, percentileOutcome, trackingChance,
} from './noncombat-rules.js';

describe('BR-17 non-combat rules', () => {
  it('applies d6 armor and victim-level modifiers with 0..5 bounds', () => {
    expect(d6Target(1)).toBe(1);
    expect(d6Target(5, { skill: 'Climb Sheer Surfaces', armorName: 'Chain mail' })).toBe(4);
    expect(d6Target(5, { skill: 'Move Silently', armorName: 'Leather' })).toBe(5);
    expect(d6Target(1, { skill: 'Pick Pockets', victimLevel: 20 })).toBe(0);
    expect(d6Target(5, { skill: 'Pick Pockets', victimLevel: 6 })).toBe(3);
    expect(d6Outcome(3, 3, 'Pick Pockets')).toEqual({ success: true, noticed: false });
    expect(d6Outcome(6, 5, 'Pick Pockets')).toEqual({ success: false, noticed: true });
  });

  it('uses the authoritative Mage table plus the full INT score', () => {
    expect(mageChance(house, 1, 18, 'Detect Magic')).toBe(93);
    expect(mageChance(house, 14, 18, 'Rally')).toBe(113);
  });

  it('uses the Warden tracking table for the Ranger/Warden table and adds WIS', () => {
    const ranger = profiles.classProfiles.find(profile => profile.id === 'ranger');
    expect(trackingChance(ranger, house, 1, 16)).toBe(36);
    expect(trackingChance(ranger, house, 10, 16)).toBe(126);
  });

  it('retains raw percentile targets above 100', () => {
    expect(percentileOutcome(100, 126)).toMatchObject({ success: true, target: 126 });
    expect(percentileOutcome(100, 99).success).toBe(false);
  });

  it('implements Bard uses, companion caps, and assassination penalties', () => {
    expect(bardUses(1)).toEqual({ inspiring: 1, mockery: 0 });
    expect(bardUses(9)).toEqual({ inspiring: 3, mockery: 3 });
    expect(beastCompanionLimits(3, [{ hd: 1 }, { hd: 1.5 }]).allowed).toBe(true);
    expect(beastCompanionLimits(3, [{ hd: 2 }, { hd: 1 }, { hd: 0.5 }, { hd: 0.5 }]).allowed).toBe(false);
    expect([1, 3, 4, 6, 8, 10, 12, 14].map(assassinationPenalty)).toEqual([0, 0, -1, -2, -3, -4, -5, -6]);
  });
});


it('BR-17 exercises every Mage skill and tracking level against source tables', () => {
  for (const row of house.custom_classes.Mage.mage_skills.chance_of_success) {
    for (const [index, code] of ['DM', 'OC', 'RY', 'RM', 'SU'].entries()) {
      for (const intelligence of [3, 9, 18]) expect(mageChance(house, row[0], intelligence, code)).toBe(row[index + 1] + intelligence);
    }
  }
  for (let level = 1; level <= 14; level++) {
    expect(trackingChance(null, house, level, 13)).toBe((level >= 10 ? 110 : 10 + 10 * level) + 13);
  }
});

it('BR-17 separates companion count from combined HD and checks Bard breakpoints', () => {
  expect(beastCompanionLimits(2, [0.5, 0.5, 0.5]).allowed).toBe(false);
  expect(beastCompanionLimits(2, [3]).allowed).toBe(false);
  expect(beastCompanionLimits(2, [1, 1]).allowed).toBe(true);
  expect([2, 3, 5, 6, 8, 9, 14].map(level => bardUses(level).mockery)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  expect([1, 3, 4, 6, 7, 9, 10, 12, 13, 14].map(level => bardUses(level).inspiring)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

it('BR-17 armor exceptions and Pick Pockets use exact boundary rules', () => {
  for (const armorName of ['', 'Leather', 'Padded', 'Hide']) expect(d6Target(3, { armorName, skill: 'moveSilently' })).toBe(3);
  for (const armorName of ['Studded Leather', 'Ringmail', 'Chainmail', 'Plate']) expect(d6Target(1, { armorName, skill: 'climbSheer' })).toBe(0);
  expect([0, 2, 3, 5, 6].map(victimLevel => d6Target(5, { skill: 'pickPockets', victimLevel }))).toEqual([5, 5, 4, 4, 3]);
  for (const target of [0, 1, 5]) expect(d6Outcome(6, target, 'pickPockets').noticed).toBe(true);
});
