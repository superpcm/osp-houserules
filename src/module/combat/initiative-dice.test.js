import { describe, expect, it, vi } from 'vitest';
import { rollInitiativeD20 } from './initiative-dice.js';

const roll = vi.hoisted(() => vi.fn());
vi.mock('../dice.js', () => ({ ospRoll: roll }));

describe('initiative dice wrapper', () => {
  it('requests strict whole-number d20 and adds hidden hundredths', async () => {
    roll.mockResolvedValueOnce({ cancelled: false, dice: [{ faces: 20, results: [17] }] });
    await expect(rollInitiativeD20({ random: () => 0.42 })).resolves.toMatchObject({
      d20: 17,
      randomHundredths: 42,
      rawRollHundredths: 1742,
    });
    expect(roll).toHaveBeenCalledWith('1d20', { label: 'Initiative', strictIntegers: true });
  });

  it('returns cancellation without sampling or creating a roll fraction', async () => {
    const random = vi.fn();
    roll.mockResolvedValueOnce({ cancelled: true });
    await expect(rollInitiativeD20({ random })).resolves.toEqual({ cancelled: true });
    expect(random).not.toHaveBeenCalled();
  });
});


describe('initiative dice bounds', () => {
  it.each([0,21,1.5,NaN])('rejects invalid d20 %s', async d20 => {
    roll.mockResolvedValueOnce({ total: d20 });
    await expect(rollInitiativeD20()).rejects.toThrow(/integer/);
  });
  it.each([[0,100],[0.999999,2099]])('includes the full hidden fraction range', async (sample,expected) => {
    roll.mockResolvedValueOnce({ total: sample === 0 ? 1 : 20 });
    await expect(rollInitiativeD20({random:()=>sample})).resolves.toMatchObject({rawRollHundredths:expected});
  });
});
