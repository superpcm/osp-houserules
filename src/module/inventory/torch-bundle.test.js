import { beforeEach, describe, expect, it } from 'vitest';
import { getLashSlotCost } from './lash-slot-cost.js';
import { getTorchBundleLashDecision, getTorchBundleValidationError, isProtectedTorchBundle, TORCH_BUNDLE_FLAG } from './torch-bundle.js';
import { packTorchBundle, unpackTorchBundle } from './torch-bundle-actions.js';

const torch = (quantity = 6, flags = { 'osp-houserules': { [TORCH_BUNDLE_FLAG]: true } }, extra = {}) => ({ _id: 'torch', id: 'torch', name: 'Torch', type: 'item', system: { quantity, storedSize: 0.75, unitWeight: 0.5, containerId: 'pack', lashed: true, ...extra }, flags });
const pack = { _id: 'pack', name: 'Backpack', type: 'container', system: { capacity: 20, lashSlots: 4, storedSize: 4 } };
describe('protected torch bundle rules', () => {
  it('caps bundles at six and uses one Backpack lash slot', () => {
    const item = torch();
    expect(getTorchBundleValidationError({ ...item, system: { ...item.system, quantity: 7 } })).toContain('1-6');
    expect(getTorchBundleLashDecision(item, { name: 'Backpack' }).allowed).toBe(true);
    expect(getTorchBundleLashDecision(item, { name: 'Belt' }).allowed).toBe(false);
    expect(getLashSlotCost(item, { name: 'Backpack' })).toBe(1);
    expect(item.system.quantity * item.system.storedSize).toBe(4.5);
  });
});

let serial = 0;
function actorWith(entries) {
  const docs = []; const actor = { id: `torch-${++serial}`, uuid: `Actor.torch-${serial}`, isOwner: true };
  actor.items = { contents: docs, get: id => docs.find(i => i.id === id), [Symbol.iterator]: () => docs.values() };
  const actorFlags = {}; actor.getFlag = (_scope, key) => actorFlags[key] ?? null; actor.setFlag = async (_scope, key, value) => { actorFlags[key] = structuredClone(value); };
  const add = source => { const data = structuredClone(source); const doc = { id: data._id, actor, get name(){return data.name;}, get type(){return data.type;}, get system(){return data.system;}, get flags(){return data.flags??{};}, toObject:()=>structuredClone(data), update:async changes=>{ for(const [path,value] of Object.entries(changes)){const keys=path.split('.');let t=data;for(const k of keys.slice(0,-1))t=t[k]??={};const k=keys.at(-1);if(k.startsWith('-='))delete t[k.slice(2)];else t[k]=structuredClone(value);} return doc;}, delete:async()=>docs.splice(docs.indexOf(doc),1)}; docs.push(doc); return doc; };
  actor.createEmbeddedDocuments = async (_t, data) => data.map(d => add({ ...d, _id: d._id ?? `new-${++serial}` }));
  actor.updateEmbeddedDocuments = async (_t, changes) => changes.map(change => { const doc = actor.items.get(change._id); if (doc) { const { _id, ...updates } = change; return doc.update(updates); } return null; });
  actor.deleteEmbeddedDocuments = async (_t, ids) => ids.map(id => { const doc = actor.items.get(id); return doc?.delete(); });
  entries.forEach(add); globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : null; game.actors.set(actor.id, actor); return actor;
}
beforeEach(() => { globalThis.foundry = { utils: { randomID: () => `id-${++serial}` } }; const gm = { id: 'gm', isGM: true }; globalThis.game = { user: gm, userId: gm.id, users: Object.assign(new Map([[gm.id, gm]]), { activeGM: gm }), actors: new Map(), scenes: [], system: { id: 'osp-houserules' }, socket: { emit: () => {} }, settings: { get: () => null, set: async () => {} } }; });

it('packs six from an eight torch stack and leaves two loose', async () => {
  const actor = actorWith([pack, { _id:'torch', name:'Torch', type:'item', system:{ quantity:8, storedSize:.75, unitWeight:.5, containerId:'pack', lashed:false }, flags:{} }]);
  const result = await packTorchBundle(actor, actor.items.get('torch'), { quantity: 6 });
  expect(result.success, result.reason).toBe(true); expect(actor.items.contents.reduce((n,i)=>n+(i.name==='Torch'?i.system.quantity:0),0)).toBe(8); expect(actor.items.contents.some(i=>isProtectedTorchBundle(i)&&i.system.quantity===6)).toBe(true);
});

it('rejects seven and preserves normal bundle data while unpacking', async () => {
  const actor = actorWith([pack, { _id:'torch', name:'Torch', type:'item', system:{ quantity:7, storedSize:.75, unitWeight:.5, containerId:'pack', lashed:false }, flags:{} }]); const item = actor.items.get('torch');
  const rejected = await packTorchBundle(actor, item, { quantity: 7 }); expect(rejected.success).toBe(false); expect(item.system.quantity).toBe(7);
  const bundleActor = actorWith([pack, torch(6)]); const bundle = bundleActor.items.get('torch');
  const result = await unpackTorchBundle(bundleActor, bundle); expect(result.success, result.reason).toBe(true); expect(bundle.system.lashed).toBe(false); expect(isProtectedTorchBundle(bundle)).toBe(false); expect(bundle.system.storedSize).toBe(.75); expect(bundle.system.unitWeight).toBe(.5);
});
