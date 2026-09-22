import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderSkillNumeral, skillNumeralGeometry } from './skill-target-values.js';

const digits = Array.from({ length: 10 }, (_, digit) => ({
  width: 48 + digit,
  actualBoundingBoxLeft: -4 + digit / 2,
  actualBoundingBoxRight: 37 + digit,
  actualBoundingBoxAscent: 39 + digit / 3,
  actualBoundingBoxDescent: digit / 4
}));
let dom;
afterEach(() => { dom?.window.close(); dom = null; vi.restoreAllMocks(); });

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
        expect(result.inkHeight).toBeLessThanOrEqual(diameter * .540001);
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

function mount(disabled = false) {
  dom = new JSDOM('<div><label>Listen at Doors</label><select style="font-family: handwritten" name="system.listeningAtDoors"><option value=""></option><option selected value="1">1</option><option value="2">2</option><option value="5">5</option></select></div>');
  const { document, HTMLCanvasElement } = dom.window;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: value => value ? digits[Number(value)] : { width: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }
  });
  const select = document.querySelector('select');
  select.disabled = disabled;
  return { document, select };
}

describe('Skill target native controls', () => {
  it('preserves the select and its value, and adds only one noninteractive visual', () => {
    const { document, select } = mount();
    renderSkillNumeral(select);
    renderSkillNumeral(select);
    expect(document.querySelectorAll('.cs-skill-value-display')).toHaveLength(1);
    expect(document.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(select.name).toBe('system.listeningAtDoors');
    expect(select.value).toBe('1');
    expect(select.getAttribute('aria-label')).toBe('Listen at Doors');
    expect(select.classList.contains('cs-skill-value-enhanced')).toBe(true);
  });
  it('updates the displayed numeral after keyboard input and change events', () => {
    const { document, select } = mount();
    renderSkillNumeral(select);
    select.value = '2';
    select.dispatchEvent(new dom.window.Event('input'));
    expect(document.querySelector('svg text').textContent).toBe('2');
    select.value = '5';
    select.dispatchEvent(new dom.window.Event('change'));
    expect(document.querySelector('svg text').textContent).toBe('5');
  });
  it('preserves read-only skill permissions', () => {
    const { select } = mount(true);
    renderSkillNumeral(select);
    expect(select.disabled).toBe(true);
  });
  it('leaves intentionally blank values blank', () => {
    const { document, select } = mount();
    select.value = '';
    renderSkillNumeral(select);
    expect(document.querySelector('svg text').textContent).toBe('');
  });
});
