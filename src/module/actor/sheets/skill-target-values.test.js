import { describe, expect, it } from 'vitest';
import { skillNumeralGeometry } from './skill-target-values.js';

const digits = Array.from({ length: 10 }, (_, digit) => ({
  width: 48 + digit,
  actualBoundingBoxLeft: -4 + digit / 2,
  actualBoundingBoxRight: 37 + digit,
  actualBoundingBoxAscent: 39 + digit / 3,
  actualBoundingBoxDescent: digit / 4
}));
describe('Skill target numeral fitting', () => {
  for (const diameter of [32, 60, 130, 240]) {
    it('fits and optically centers every digit in a ' + diameter + 'px circle', () => {
      const sizes = [];
      for (const metrics of digits) {
        const result = skillNumeralGeometry(metrics, digits, diameter);
        sizes.push(result.fontSize);
        const scale = result.fontSize / 100;
        const left = result.x - metrics.actualBoundingBoxLeft * scale;
        const right = result.x + metrics.actualBoundingBoxRight * scale;
        const top = result.y - metrics.actualBoundingBoxAscent * scale;
        const bottom = result.y + metrics.actualBoundingBoxDescent * scale;
        expect((left + right) / 2).toBeCloseTo(0, 8);
        expect((top + bottom) / 2).toBeCloseTo(0, 8);
        expect(result.inkWidth).toBeLessThanOrEqual(diameter * .600001);
        expect(result.inkHeight).toBeLessThanOrEqual(diameter * .450001);
      }
      expect(new Set(sizes).size).toBe(1);
    });
  }
  it('scales proportionally until the 110px ceiling', () => {
    const small = skillNumeralGeometry(digits[2], digits, 60);
    const large = skillNumeralGeometry(digits[2], digits, 180);
    expect(small.fontSize).toBeLessThan(110);
    expect(large.fontSize).toBeCloseTo(110);
  });
  it('shrinks wider multi-digit values to stay inside the circle', () => {
    const wide = { ...digits[2], width: 110, actualBoundingBoxRight: 107 };
    const result = skillNumeralGeometry(wide, digits, 100);
    expect(result.fontSize).toBeLessThan(skillNumeralGeometry(digits[2], digits, 100).fontSize);
    expect(result.inkWidth).toBeCloseTo(60);
  });
  it('ignores circles that have no rendered size', () => {
    expect(skillNumeralGeometry(digits[1], digits, 0)).toBeNull();
    expect(skillNumeralGeometry(digits[1], digits, -10)).toBeNull();
  });
});
