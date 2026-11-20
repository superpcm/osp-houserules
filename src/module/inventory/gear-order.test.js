import { describe, expect, it } from 'vitest';
import { flatBundle, gearOrderGroups, moveWithinGroup, orderedRows, reorderBundles, rowId, saveGearOrder } from './gear-order.js';

function fixture(ids) {
  const document = { createComment: () => ({ comment: true }) };
  const rows = ids.map(id => ({ dataset: { itemId: id }, ownerDocument: document }));
  const parent = {
    children: [...rows],
    insertBefore(node, anchor) {
      if (node.parentNode) node.parentNode.removeChild(node);
      const index = anchor ? this.children.indexOf(anchor) : this.children.length;
      if (index < 0) throw Error('Missing anchor');
      this.children.splice(index, 0, node); node.parentNode = this;
    },
    removeChild(node) {
      const index = this.children.indexOf(node);
      if (index < 0) throw Error('Missing child');
      this.children.splice(index, 1); node.parentNode = null;
    },
  };
  for (const row of rows) {
    row.parentNode = parent;
    Object.defineProperty(row, 'nextElementSibling', { get() {
      return parent.children.slice(parent.children.indexOf(this) + 1).find(row => !row.comment) || null;
    } });
    row.matches = () => true;
  }
  return { rows, parent, ids: () => parent.children.map(row => row.dataset?.itemId || row.label) };
}

describe('Gear presentation ordering', () => {
  it('saves only the requested group without a sheet redraw or changing another saved group', async () => {
    const flags = { 'top-level': ['__body__', 'bag'], 'stored:bag': ['a', 'b'] };
    let captured;
    const actor = { getFlag: () => flags, update: async (data, options) => { captured = { data, options }; } };
    await saveGearOrder(actor, 'stored:bag', ['b', 'a']);
    expect(captured).toEqual({ data: { 'flags.osp-houserules.gearOrder': {
      'top-level': ['__body__', 'bag'], 'stored:bag': ['b', 'a'],
    } }, options: { render: false } });
    expect(flags['stored:bag']).toEqual(['a', 'b']);
  });

  it('reconciles stale/duplicate saved keys and appends new rows without mutating saved order', () => {
    const { rows } = fixture(['a', 'b', 'c']);
    const saved = ['c', 'missing', 'c', 'a'];
    expect(orderedRows(rows, saved).map(rowId)).toEqual(['c', 'a', 'b']);
    expect(saved).toEqual(['c', 'missing', 'c', 'a']);
    expect(orderedRows(rows, 'invalid')).toEqual(rows);
  });

  it('moves exactly one sibling in either direction and rejects boundaries', () => {
    const f = fixture(['a', 'b', 'c']);
    expect(moveWithinGroup(f.rows, f.rows[1], -1)).toBe(true);
    expect(f.ids()).toEqual(['b', 'a', 'c']);
    expect(moveWithinGroup([f.rows[1], f.rows[0], f.rows[2]], f.rows[1], -1)).toBe(false);
    expect(moveWithinGroup([f.rows[1], f.rows[0], f.rows[2]], f.rows[0], 1)).toBe(true);
    expect(f.ids()).toEqual(['b', 'c', 'a']);
  });

  it('moves flat parents with all descendants in their original order, up and down', () => {
    const f = fixture(['a', 'a1', 'a2', 'b', 'b1', 'b2']);
    const [a, a1, a2, b, b1, b2] = f.rows;
    const bundles = new Map([[a, [a, a1, a2]], [b, [b, b1, b2]]]);
    const bundleFor = row => bundles.get(row);
    expect(moveWithinGroup([a, b], a, 1, bundleFor)).toBe(true);
    expect(f.ids()).toEqual(['b', 'b1', 'b2', 'a', 'a1', 'a2']);
    expect(moveWithinGroup([b, a], a, -1, bundleFor)).toBe(true);
    expect(f.ids()).toEqual(['a', 'a1', 'a2', 'b', 'b1', 'b2']);
  });

  it('restores whole bundles while preserving non-row subheader slots', () => {
    const f = fixture(['a', 'a1', 'b', 'b1']);
    const [a, a1, b, b1] = f.rows;
    const subheader = { label: 'subheader' };
    f.parent.insertBefore(subheader, b);
    reorderBundles([a, b], [b, a], row => row === a ? [a, a1] : [b, b1]);
    expect(f.ids()).toEqual(['b', 'b1', 'subheader', 'a', 'a1']);
    expect(f.parent.children.every(row => row.parentNode === f.parent)).toBe(true);
  });

  it('recognizes recursive flat descendants and stops before a peer', () => {
    const f = fixture(['parent', 'child', 'grandchild', 'peer']);
    const items = new Map([
      ['parent', { system: {} }], ['child', { system: { containerId: 'parent' } }],
      ['grandchild', { system: { containerId: 'child' } }], ['peer', { system: {} }],
    ]);
    expect(flatBundle(f.rows[0], { items }).map(rowId)).toEqual(['parent', 'child', 'grandchild']);
  });

  it('includes virtual groups without pretending they are real Items', () => {
    const body = { classList: { contains: value => value === 'body-section-entry' }, dataset: {} };
    const slung = { classList: { contains: value => value === 'slung-section-entry' }, dataset: {} };
    const { rows } = fixture(['backpack']);
    expect(orderedRows([body, slung, rows[0]], ['__slung__', 'backpack', '__body__']).map(rowId))
      .toEqual(['__slung__', 'backpack', '__body__']);
    expect(body.dataset.itemId).toBeUndefined();
  });

  it('keeps internal and lashed rows separate even in the same physical parent', () => {
    const f = fixture(['inside-a', 'outside', 'inside-b']);
    f.rows.forEach(row => {
      row.classList = { contains: () => false };
      row.parentElement = f.parent;
      row.matches = selector => selector.includes('li.item-entry');
    });
    f.parent.closest = () => null;
    f.parent.matches = () => false;
    const root = { querySelector: () => null, querySelectorAll: () => f.rows };
    const items = new Map(f.rows.map(row => [rowId(row), { system: { containerId: 'bag', lashed: rowId(row) === 'outside' } }]));
    const groups = gearOrderGroups(root, { items });
    expect(groups.map(group => [group.key, group.rows.map(rowId)]))
      .toEqual([['stored:bag', ['inside-a', 'inside-b']], ['lashed:bag', ['outside']]]);
  });
});
