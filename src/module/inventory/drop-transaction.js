const clone = (value) => structuredClone(value);
const freshId = () => globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2);
const inventory = actor => actor.items.contents ?? (typeof actor.items.values === 'function' ? [...actor.items.values()] : [...actor.items]);
function snapshot(item) {
  const data = clone(item?.toObject ? item.toObject() : item);
  if (!data) return null;
  data._id ??= data.id ?? item?.id;
  delete data.id;
  return data;
}
function collection(items) {
  const list = items.map((data) => {
    const item = { _data: clone(data), _deleted: false };
    Object.defineProperties(item, {
      id: { get: () => item._data._id }, name: { get: () => item._data.name },
      type: { get: () => item._data.type }, system: { get: () => item._data.system }, img: { get: () => item._data.img },
    });
    item.toObject = () => clone(item._data);
    item.update = async (changes) => { merge(item._data, changes); return item; };
    item.delete = async () => { item._deleted = true; };
    return item;
  });
  return { contents: list, get: (id) => list.find((item) => item.id === id && !item._deleted), find: (fn) => list.filter((item) => !item._deleted).find(fn), filter: (fn) => list.filter((item) => !item._deleted).filter(fn), some: (fn) => list.some((item) => !item._deleted && fn(item)), map: (fn) => list.filter((item) => !item._deleted).map(fn), [Symbol.iterator]: function* () { yield* list.filter((item) => !item._deleted); } };
}
export function createDropDraft(actor) {
  const before = inventory(actor).map(snapshot);
  const items = collection(before);
  const draft = Object.create(actor);
  Object.defineProperty(draft, 'id', { value: actor.uuid ?? actor.id });
  Object.defineProperty(draft, 'items', { value: items, writable: true, configurable: true });
  items.contents.forEach((item) => { item.actor = draft; });
  draft.createEmbeddedDocuments = async (_type, data, options = {}) => { const created = collection(data.map((entry) => ({ ...clone(entry), _id: options.keepId ? entry._id : freshId() }))).contents; created.forEach((item) => { item.actor = draft; }); items.contents.push(...created); return created; };
  draft.deleteEmbeddedDocuments = async (_type, ids) => { ids.forEach((id) => { const item = items.get(id); if (item) item._deleted = true; }); return ids; };
  draft.updateEmbeddedDocuments = async (_type, updates) => { for (const update of updates) await items.get(update._id)?.update(update); return updates; };
  return { actor: draft, before, items, live: actor };
}
export function diffDropDraft(actor, draftState) {
  const after = draftState.items.contents.filter((item) => !item._deleted).map(snapshot);
  const beforeById = new Map(draftState.before.map((item) => [item._id, item]));
  const afterById = new Map(after.map((item) => [item._id, item]));
  const changes = [];
  for (const [id, before] of beforeById) { const next = afterById.get(id) ?? null; if (JSON.stringify(before) !== JSON.stringify(next)) changes.push({ kind: 'item', actorId: actor.id, id, before, after: next }); }
  for (const [id, next] of afterById) if (!beforeById.has(id)) changes.push({ kind: 'item', actorId: actor.id, id, before: null, after: next });
  return changes.map(change => ({ ...change, actorUuid: actor.uuid ?? null }));
}
export function discardDropDraft(draftState) { return draftState.before; }

function merge(target, changes) {
  for (const [key, value] of Object.entries(changes)) {
    const path = key.split('.'); let parent = target;
    for (let i = 0; i < path.length - 1; i++) parent = parent[path[i]] ??= {};
    const leaf = path.at(-1);
    if (leaf.startsWith('-=')) delete parent[leaf.slice(2)];
    else if (value && typeof value === 'object' && !Array.isArray(value)) merge(parent[leaf] ??= {}, value);
    else parent[leaf] = clone(value);
  }
}
export function validDropQuantity(quantity, available = Infinity) {
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= available;
}
export function classifyDrop(source, destination, data, isGM) {
  if (source) return (source.uuid && destination.uuid ? source.uuid === destination.uuid : source === destination) ? 'move' : (source.type === 'character' ? 'gift' : 'loot');
  return isGM ? 'grant' : data.type === 'coin' || data.system?.treasure ? 'loot' : 'purchase';
}
export function dropDescendants(actor, rootId) {
  const result = []; const seen = new Set([rootId]);
  const visit = (id) => {
    for (const item of actor.items.filter(i => i.system?.containerId === id)) {
      if (seen.has(item.id)) throw new Error('Circular containment cannot be transferred.');
      seen.add(item.id); result.push(item); visit(item.id);
    }
  };
  visit(rootId); return result;
}
export function unchangedDropInventory(state) {
  const clean = data => JSON.stringify(data, (key, value) => key === '_stats' ? undefined : value);
  return state.live.isOwner && clean(inventory(state.live).map(snapshot)) === clean(state.before);
}
