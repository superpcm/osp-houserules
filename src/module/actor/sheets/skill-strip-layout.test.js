import { describe, expect, it } from 'vitest';
import { skillStripGeometry } from './skill-strip-layout.js';

describe('skill target strip geometry', () => {
  it('keeps the original ring size and one-row track as skills grow', () => {
    const three = skillStripGeometry(3);
    const four = skillStripGeometry(4);
    const five = skillStripGeometry(5);
    const six = skillStripGeometry(6);
    const ten = skillStripGeometry(10);
    expect(three.ringRadius).toBe(48);
    expect(six.ringRadius).toBe(48);
    expect(ten.ringRadius).toBe(48);
    expect(three.height).toBe(142);
    expect(six.height).toBe(142);
    expect(ten.height).toBe(142);
    expect(three.width).toBe(800);
    expect(four.width).toBe(800);
    expect(four.cellWidth).toBe(200);
    expect(five.width).toBe(1000);
    expect(four.cellWidth).toBeGreaterThan(four.ringRadius * 2 * 1.68);
    expect(six.width).toBeGreaterThan(three.width);
    expect(ten.width).toBeGreaterThan(six.width);
  });
});
