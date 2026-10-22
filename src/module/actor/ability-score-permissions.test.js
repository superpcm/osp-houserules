import { describe, expect, it } from 'vitest';
import { getUnauthorizedAbilityScoreChanges, hasUnauthorizedAbilityScoreChange } from './ability-score-permissions.js';

const system = { attributes: { str: { value: 12 }, dex: { value: 9 } } };

describe('ability score update permissions', () => {
  it('finds nested and flattened score changes', () => {
    expect(hasUnauthorizedAbilityScoreChange({ system: { attributes: { str: { value: 13 } } } }, system)).toBe(true);
    expect(hasUnauthorizedAbilityScoreChange({ 'system.attributes.dex.value': 10 }, system)).toBe(true);
  });

  it('allows same values and unrelated edits', () => {
    expect(hasUnauthorizedAbilityScoreChange({ system: { attributes: { str: { value: '12' } }, languages: 'Trade Tongue' } }, system)).toBe(false);
    expect(hasUnauthorizedAbilityScoreChange({ name: 'Updated' }, system)).toBe(false);
  });

  it('treats deletion directives as score changes', () => {
    expect(getUnauthorizedAbilityScoreChanges({ system: { attributes: { str: { '-=value': null } } } }, system)).toEqual([
      expect.objectContaining({ ability: 'str', deleted: true })
    ]);
  });

  it('only scopes the actor system and catches parent score deletions', () => {
    expect(hasUnauthorizedAbilityScoreChange({ flags: { attributes: { str: { value: 13 } } } }, system)).toBe(false);
    expect(hasUnauthorizedAbilityScoreChange({ system: { attributes: { str: null } } }, system)).toBe(true);
    expect(hasUnauthorizedAbilityScoreChange({ 'system.attributes.-=str': null }, system)).toBe(true);
    expect(hasUnauthorizedAbilityScoreChange({ 'system.attributes.str.-=value': 12 }, system)).toBe(true);
    expect(hasUnauthorizedAbilityScoreChange({ system: { attributes: { str: { mod: 2 } } } }, system)).toBe(false);
  });
});
