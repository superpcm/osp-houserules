import { beforeEach, describe, expect, it } from 'vitest';
import { ARROW_BUNDLE_FLAG, isProtectedArrowBundle, getArrowBundleLashDecision } from './arrow-bundle.js';
import { getLashSlotCost } from './lash-slot-cost.js';

const arrow = (quantity = 20, extra = {}) => ({
  id: 'arrows', type: 'ammunition', name: 'Arrows',
  system: { quantity, storedSize: 0.25, tags: ['arrows'], ...extra },
  flags: { 'osp-houserules': { [ARROW_BUNDLE_FLAG]: true } },
});

describe('protected arrow bundle lash rules', () => {
  it('uses one Backpack lash slot and keeps normal bulk', () => {
    const item = arrow(20);
    expect(getLashSlotCost(item, { name: 'Backpack' })).toBe(1);
    expect(item.system.storedSize * item.system.quantity).toBe(5);
  });

  it('rejects belt lashing but permits internal storage decisions', () => {
    const item = arrow();
    expect(getArrowBundleLashDecision(item, { name: 'Belt', type: 'clothing' }).allowed).toBe(false);
    expect(getArrowBundleLashDecision(item, { name: 'Backpack', type: 'container' }).allowed).toBe(true);
    expect(isProtectedArrowBundle(item)).toBe(true);
  });
});


import { packArrowBundle, unpackArrowBundle } from './arrow-bundle-actions.js';
let actionSequence = 0;
beforeEach(() => {
  globalThis.foundry = { utils: { randomID: () => `bundle-test-${++actionSequence}` } };
  globalThis.game = { user: { isGM: true }, actors: new Map(), scenes: [], system: { id: 'osp-houserules' } };
});
function documentActor(entries) {
  const documents = [], flags = {};
  const actor = { id: `bundle-actor-${++actionSequence}`, isOwner: true };
  actor.uuid = `Actor.${actor.id}`;
  actor.items = { contents: documents, get: id => documents.find(i => i.id === id), [Symbol.iterator]: () => documents.values() };
  actor.getFlag = (_scope, key) => flags[key];
  actor.setFlag = async (_scope, key, value) => { flags[key] = JSON.parse(JSON.stringify(value)); };
  function add(source) {
    const data = structuredClone(source); data.flags ??= {};
    const doc = { id: data._id, actor, get name() { return data.name; }, get type() { return data.type; }, get system() { return data.system; }, get flags() { return data.flags; }, toObject: () => structuredClone(data) };
    doc.update = async changes => {
      for (const [path, value] of Object.entries(changes)) {
        const keys = path.split('.'); let target = data;
        for (const part of keys.slice(0,-1)) target = target[part] ??= {};
        const key = keys.at(-1);
        if (key.startsWith('-=')) delete target[key.slice(2)]; else target[key] = structuredClone(value);
      }
      data.flags ??= {};
      return doc;
    };
    doc.delete = async () => documents.splice(documents.indexOf(doc),1);
    documents.push(doc); return doc;
  }
  actor.createEmbeddedDocuments = async (_type, data) => data.map(d => add({ ...d, _id: d._id ?? `item-${++actionSequence}` }));
  entries.forEach(add); game.actors.set(actor.id, actor);
  globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null;
  return actor;
}
const looseData = quantity => ({ _id:'arrows',name:'Arrow',type:'ammunition',system:{quantity,storedSize:0.25,unitWeight:0.1,tags:['arrows'],containerId:'pack',lashed:false},flags:{} });
const packData = { _id:'pack',name:'Backpack',type:'container',system:{quantity:1,storedSize:4,capacity:20,lashSlots:4} };

it('packs a partial stack through a JSON-persisted journal without losing arrows', async () => {
  const actor = documentActor([packData,looseData(30)]);
  const result = await packArrowBundle(actor,actor.items.get('arrows'),{quantity:20});
  expect(result.success).toBe(true);
  const arrows = actor.items.contents.filter(i => i.type === 'ammunition');
  expect(arrows.reduce((n,i) => n+i.system.quantity,0)).toBe(30);
  expect(arrows.find(isProtectedArrowBundle).system.quantity).toBe(20);
  expect(actor.items.get('arrows').system.quantity).toBe(10);
  expect(actor.getFlag('osp-houserules','pendingInventoryTransaction')).toBeNull();
});

it('unpacks a normal bundle with no unrelated flags using a persisted transaction', async () => {
  const data = looseData(20); data.system.lashed = true; data.flags = {'osp-houserules':{protectedArrowBundle:true}};
  const actor = documentActor([packData,data]); const item = actor.items.get('arrows');
  const result = await unpackArrowBundle(actor,item);
  expect(result.success).toBe(true);
  expect(item.system).toMatchObject({quantity:20,storedSize:0.25,containerId:'pack',lashed:false});
  expect(item.flags).toEqual({});
  expect(actor.getFlag('osp-houserules','pendingInventoryTransaction')).toBeNull();
});
