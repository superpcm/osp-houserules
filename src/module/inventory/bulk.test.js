import { expect, it } from 'vitest';
import { storedBulk, usedBulk, capacityValue, contentsWeight } from './bulk.js';
const item = (id, parent, size, weight, quantity = 1) => ({ id, type: 'container', system: { containerId: parent, storedSize: size, unitWeight: weight, quantity } });
it('a packed backpack consumes only its own bulk in its parent at every nesting level', () => {
  const items = [item('sack', null, 2, 0.5), item('pack', 'sack', 4, 2), item('purse', 'pack', 1, 0.25), item('coins', 'purse', 0.04, 0.02, 100)];
  expect(usedBulk(items[0], items)).toBe(4); expect(usedBulk(items[1], items)).toBe(1); expect(usedBulk(items[2], items)).toBe(4);
  expect(storedBulk(items[1])).toBe(4); expect(contentsWeight('sack', items)).toBe(4.25);
});
it('normalizes zero and object quantities for bulk and weight display', () => {
  const items = [item('empty', 'bag', 10, 10, 0), item('objectEmpty', 'bag', 10, 10, { value: 0 }), item('stack', 'bag', 0.5, 1, { value: 2 })];
  expect(usedBulk({ id: 'bag' }, items)).toBe(1); expect(contentsWeight('bag', items)).toBe(2);
});
it('uses numeric catalog and legacy object capacities and excludes lashed bulk', () => {
  expect(capacityValue({ max: 4, value: 2 })).toBe(4); expect(capacityValue(4)).toBe(4);
  const lashed = item('lash', 'bag', 4, 2); lashed.system.lashed = true;
  expect(usedBulk({ id: 'bag' }, [lashed])).toBe(0); expect(contentsWeight('bag', [lashed])).toBe(2);
});
it('terminates malformed containment cycles without counting an item twice', () => {
  const items = [item('a', 'b', 1, 2), item('b', 'a', 1, 3)];
  expect(contentsWeight('a', items)).toBe(3); expect(usedBulk(items[0], items)).toBe(1);
});
