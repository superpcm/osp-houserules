import { describe, expect, it } from 'vitest';
import { classifyDrop, createDropDraft, diffDropDraft, dropDescendants, validDropQuantity } from './drop-transaction.js';
function actor(items) { return { id: 'a1', items: { contents: items, filter: (fn) => items.filter(fn) } }; }
describe('drop draft staging', () => {
  it('isolates updates, creates, and deletes from live inventory', async () => {
    const live = { _id: 'i1', name: 'Arrows', type: 'ammunition', system: { quantity: 5 } };
    const target = actor([live]); const draft = createDropDraft(target);
    await draft.actor.items.get('i1').update({ 'system.quantity': 3 });
    await draft.actor.createEmbeddedDocuments('Item', [{ _id: 'i2', name: 'Bow', type: 'weapon', system: { quantity: 1 } }]);
    await draft.actor.items.get('i1').delete();
    expect(live.system.quantity).toBe(5);
    expect(diffDropDraft(target, draft)).toEqual([expect.objectContaining({ id: 'i1', after: null }), expect.objectContaining({ before: null, after: expect.objectContaining({ name: 'Bow' }) })]);
  });
  it('does not emit a change for an untouched draft', () => { const target = actor([{ _id: 'i1', name: 'Gem', type: 'item', system: { quantity: 1 } }]); expect(diffDropDraft(target, createDropDraft(target))).toEqual([]); });

  it('accepts only strict positive integer quantities within the live stack', () => {
    expect(validDropQuantity(1, 3)).toBe(true);
    expect(validDropQuantity(3, 3)).toBe(true);
    for (const value of [0, -1, 1.5, 4, NaN, Infinity]) expect(validDropQuantity(value, 3)).toBe(false);
  });

  it('classifies internal moves, character gifts, purchases, loot, and GM grants', () => {
    const source = { id: 'a1', uuid: 'Actor.a1', type: 'character' };
    const destination = { id: 'a2', uuid: 'Actor.a2' };
    expect(classifyDrop(source, source, {}, false)).toBe('move');
    expect(classifyDrop(source, destination, {}, false)).toBe('gift');
    expect(classifyDrop({ ...source, type: 'npc' }, destination, {}, false)).toBe('loot');
    expect(classifyDrop(null, destination, { type: 'weapon', system: { cost: 5 } }, false)).toBe('purchase');
    expect(classifyDrop(null, destination, { type: 'weapon' }, true)).toBe('grant');
  });

  it('walks complete nested descendants and detects circular containment', () => {
    const root = { _id: 'root', id: 'root', type: 'container', system: {} };
    const child = { _id: 'child', id: 'child', type: 'item', system: { containerId: 'root' } };
    const grandchild = { _id: 'grand', id: 'grand', type: 'item', system: { containerId: 'child' } };
    const source = actor([root, child, grandchild]);
    expect(dropDescendants(source, 'root').map((item) => item.id)).toEqual(['child', 'grand']);
    root.system.containerId = 'grand';
    expect(() => dropDescendants(source, 'root')).toThrow(/Circular/);
  });
});
