import { describe, expect, it } from 'vitest';
import { GEAR_ORDER_MIME, insertionOrder, isGearOrderDrag, setupGearOrderDrag, targetInGroup } from './gear-order-drag.js';

describe('Gear drag placement', () => {
  const rows = ['a','b','c','d'];
  it('inserts before or after in either direction without mutating the group', () => {
    expect(insertionOrder(rows,'a','c',false)).toEqual(['b','a','c','d']);
    expect(insertionOrder(rows,'d','b',true)).toEqual(['a','b','d','c']);
    expect(rows).toEqual(['a','b','c','d']);
  });
  it('rejects self, adjacent no-op, and foreign group drops', () => {
    expect(insertionOrder(rows,'b','b',false)).toBeNull();
    expect(insertionOrder(rows,'b','c',false)).toBeNull();
    expect(insertionOrder(rows,'b','a',true)).toBeNull();
    expect(insertionOrder(rows,'foreign','b')).toBeNull();
    expect(insertionOrder(rows,'a','foreign')).toBeNull();
  });
  it('resolves expanded descendant targets to their same-group parent only', () => {
    const parent={nodeType:1,parentElement:null};
    const child={nodeType:1,parentElement:parent};
    expect(targetInGroup({rows:[parent]},child)).toBe(parent);
    expect(targetInGroup({rows:[{}]},child)).toBeNull();
  });
  it('recognizes handle origins and custom MIME without hijacking image drops on a handle', () => {
    const target={closest:()=>({})};
    expect(isGearOrderDrag({type:'dragstart',target,dataTransfer:{types:[]}})).toBe(true);
    expect(isGearOrderDrag({type:'dragover',dataTransfer:{types:[GEAR_ORDER_MIME]}})).toBe(true);
    expect(isGearOrderDrag({type:'drop',target,dataTransfer:{types:['text/plain']}})).toBe(false);
  });
});

