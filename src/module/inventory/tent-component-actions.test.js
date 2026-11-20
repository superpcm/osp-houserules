import { beforeEach, describe, expect, it } from 'vitest';
import { separateTentComponents } from './tent-component-actions.js';

const item = (id, name, type, system = {}) => ({ _id:id, name, type, system: { quantity: 1, storedSize: 1, unitWeight: 1, cost: 1, tags: [], containerId: null, lashed: false, ...system }, flags: {} });
let sequence = 0;
beforeEach(() => {
  globalThis.foundry = { utils: { randomID: () => `tent-test-${++sequence}` } };
  globalThis.game = { user: { isGM: true }, actors: new Map(), scenes: [], system: { id: 'osp-houserules' } };
});
const actor = entries => {
  const documents = []; const flags = {};
  const result = { id:'actor', uuid:'Actor.actor', isOwner:true, items:{ contents:documents, get:id => documents.find(i => i.id === id) }, getFlag:(_scope,key) => flags[key], setFlag:async(_scope,key,value) => { flags[key] = structuredClone(value); } };
  const add = source => { const data = structuredClone(source); const doc = { id:data._id, actor:result, get name(){return data.name;}, get type(){return data.type;}, get system(){return data.system;}, get flags(){return data.flags;}, toObject:()=>structuredClone(data) }; doc.update = async changes => { for (const [path,value] of Object.entries(changes)) { const keys=path.split('.'); let target=data; for (const part of keys.slice(0,-1)) target=target[part] ??= {}; const key=keys.at(-1); if(key.startsWith('-=')) delete target[key.slice(2)]; else target[key]=structuredClone(value); } return doc; }; doc.delete=async()=>documents.splice(documents.indexOf(doc),1); documents.push(doc); return doc; };
  result.createEmbeddedDocuments = async (_type, data) => data.map(d => add({ ...d, _id:d._id ?? `item-${++sequence}` }));
  entries.forEach(add); game.actors.set(result.id,result); return result;
};

describe('tent component action validation', () => {
  it.each(['Backpack', "Traveler's Backpack"])('rejects fabric that cannot fit a backpack before writing (%s)', async (packName) => {
    const pack = item('pack', packName, 'container', { capacity: 20, lashSlots: 2 });
    const tent = item('tent', 'Tent, 4-person', 'item', { storedSize: 40, unitWeight: 40, cost: 20, tags: ['shelter'], containerId: 'pack' });
    const result = await separateTentComponents(actor([pack, tent]), tent);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/internal space/i);
  });

  it.each(['Backpack', "Traveler's Backpack"])('atomically separates a one-person tent and preserves totals (%s)', async (packName) => {
    const pack = item('pack', packName, 'container', { capacity: 20, lashSlots: 2 });
    const tent = item('tent', 'Tent, 1-person', 'item', { storedSize: 10, unitWeight: 10, cost: 5, tags: ['shelter'], containerId: 'pack' });
    const a = actor([pack, tent]);
    const result = await separateTentComponents(a, a.items.get('tent'));
    expect(result.success).toBe(true);
    const parts = a.items.contents.filter(i => i.id !== 'pack');
    expect(parts.map(i => i.name)).toEqual(expect.arrayContaining(['Tent Fabric, 1-person', 'Tent Poles, 1-person']));
    expect(parts.reduce((sum, i) => sum + i.system.storedSize, 0)).toBe(10);
    expect(parts.reduce((sum, i) => sum + i.system.unitWeight, 0)).toBe(10);
    expect(parts.reduce((sum, i) => sum + i.system.cost, 0)).toBe(5);
    expect(a.items.get('tent').system.containerId).toBe('pack');
    expect(a.items.contents.find(i => i.name.startsWith('Tent Poles')).system.lashed).toBe(true);
  });

  it.each(['Backpack', "Traveler's Backpack"])('leaves the source remainder when separating part of a stack (%s)', async (packName) => {
    const pack = item('pack', packName, 'container', { capacity: 20, lashSlots: 3 });
    const tent = item('tent', 'Tent, 1-person', 'item', { quantity: 2, storedSize: 10, unitWeight: 10, cost: 5, tags: ['shelter'], containerId: 'pack' });
    const a = actor([pack, tent]);
    const result = await separateTentComponents(a, a.items.get('tent'), { quantity: 1 });
    expect(result.success).toBe(true);
    expect(a.items.get('tent').system.quantity).toBe(1);
    expect(a.items.contents.filter(i => i.name.startsWith('Tent Fabric')).length).toBe(1);
    expect(a.items.contents.filter(i => i.name.startsWith('Tent Poles')).length).toBe(1);
  });
});
