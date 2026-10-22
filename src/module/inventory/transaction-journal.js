import { assertAuthorityFence, recordAuthorityTransaction, currentInventoryOperation, recoverInventoryOperation } from "./inventory-authority.js";
const SCOPE = "osp-houserules";
export const JOURNAL_FLAG = "pendingInventoryTransaction";

const locks = new Map();
const clone = (value) => structuredClone(value);
const randomId = () => globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2);
const values = (collection) => collection?.contents ?? (typeof collection?.values === "function" ? [...collection.values()] : Array.isArray(collection) ? collection : []);

function normalized(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalized);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "_stats").sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, normalized(val)]));
}
function same(actual, expected, subset = false) {
  actual = normalized(actual);
  expected = normalized(expected);
  if (subset && actual && expected && typeof actual === "object" && typeof expected === "object" && !Array.isArray(expected)) {
    return Object.entries(expected).every(([key, val]) => same(actual[key], val, true));
  }
  return JSON.stringify(normalized(actual)) === JSON.stringify(normalized(expected));
}
function actorItems(actor) { return actor?.items; }
function findItem(actor, id) { return actorItems(actor)?.get?.(id) ?? values(actorItems(actor)).find((item) => item.id === id); }
function actorUuid(actor) { return actor?.uuid ?? actor?.document?.uuid ?? null; }
function actorId(actor) { return actor?.id ?? actor?.document?.id ?? null; }
function sceneUuid(scene) { return scene?.uuid ?? scene?.document?.uuid ?? null; }
function sceneId(scene) { return scene?.id ?? scene?.document?.id ?? null; }
function tokenId(token) { return token?.id ?? token?.document?.id ?? null; }

async function resolveScene(change) {
  if (!change || change.kind !== "token") return null;
  if (change.sceneUuid) {
    const fromUuid = globalThis.fromUuid ?? globalThis.foundry?.utils?.fromUuid;
    if (fromUuid) {
      try {
        const resolved = await fromUuid(change.sceneUuid);
        if (resolved && sceneUuid(resolved) === change.sceneUuid) return resolved;
      } catch (_error) { /* A missing endpoint must remain recoverable. */ }
    }
    return null;
  }
  const scenes = globalThis.game?.scenes;
  return scenes?.get?.(change.sceneId) ?? values(scenes).find((scene) => sceneId(scene) === change.sceneId) ?? null;
}

async function resolveActor(change, fallback = null) {
  if (!change || change.kind === "setting") return fallback;
  if (change.actorUuid) {
    const fromUuid = globalThis.fromUuid ?? globalThis.foundry?.utils?.fromUuid;
    if (fromUuid) {
      try {
        const resolved = await fromUuid(change.actorUuid);
        if (resolved && actorUuid(resolved) === change.actorUuid) return resolved;
      } catch (_error) {
        // Search other exact-UUID sources below. A missing endpoint must remain recoverable.
      }
    }
    const candidates = [...values(globalThis.game?.actors)];
    for (const scene of values(globalThis.game?.scenes)) {
      for (const token of values(scene?.tokens)) {
        const tokenActor = token?.actor ?? token?.document?.actor;
        if (tokenActor) candidates.push(tokenActor);
      }
    }
    return candidates.find((candidate) => actorUuid(candidate) === change.actorUuid) ?? null;
  }
  const actors = globalThis.game?.actors;
  const resolved = actors?.get?.(change.actorId) ?? values(actors).find((candidate) => actorId(candidate) === change.actorId);
  if (resolved) return resolved;
  if (fallback && actorId(fallback) === change.actorId) return fallback;
  return null;
}

function changeActorKeys(change, fallback = null) {
  if (!change) {
    const keys = [];
    if (fallback && actorUuid(fallback)) keys.push("uuid:" + actorUuid(fallback));
    if (fallback && actorId(fallback)) keys.push("id:" + actorId(fallback));
    return keys;
  }
  if (change?.kind === "setting") return [];
  const keys = [];
  if (change.actorUuid) keys.push("uuid:" + change.actorUuid);
  if (change.actorId) keys.push("id:" + change.actorId);
  if (!keys.length && fallback) {
    if (actorUuid(fallback)) keys.push("uuid:" + actorUuid(fallback));
    if (actorId(fallback)) keys.push("id:" + actorId(fallback));
  }
  return keys;
}

export function snapshotItem(item) {
  if (!item) return null;
  const data = clone(item?.toObject ? item.toObject() : item);
  const id = data._id ?? data.id ?? item?.id;
  delete data.id;
  data._id = id;
  return data;
}
export function itemChange(actor, item, afterQuantity) {
  const before = snapshotItem(item);
  const after = afterQuantity == null || afterQuantity <= 0 ? null : { ...clone(before), system: { ...before.system, quantity: afterQuantity } };
  return { kind: "item", actorId: actorId(actor), actorUuid: actorUuid(actor), id: item.id, before, after };
}
export function createdItemChange(actor, data) {
  const id = randomId();
  const after = { ...clone(data), _id: id };
  delete after.id;
  return { kind: "item", actorId: actorId(actor), actorUuid: actorUuid(actor), id, before: null, after };
}
export function snapshotToken(token) {
  if (!token) return null;
  const data = clone(token?.toObject ? token.toObject() : token);
  const id = data._id ?? data.id ?? tokenId(token);
  delete data.id;
  data._id = id;
  return data;
}
export function createdTokenChange(scene, data) {
  const id = randomId();
  const after = { ...clone(data), _id: id };
  delete after.id;
  return { kind: "token", sceneId: sceneId(scene), sceneUuid: sceneUuid(scene), id, before: null, after };
}
export function flagChange(actor, key, after) {
  return { kind: "flag", actorId: actorId(actor), actorUuid: actorUuid(actor), key, before: clone(actor.getFlag(SCOPE, key) ?? null), after: clone(after) };
}
export function settingChange(key, after) {
  return { kind: "setting", key, before: clone(game.settings.get(game.system.id, key) ?? null), after: clone(after) };
}

export function getPendingTransaction(actor) { return actor?.getFlag(SCOPE, JOURNAL_FLAG) ?? null; }
export function listPendingTransactions() {
  const found = new Map();
  const candidates = [...values(globalThis.game?.actors)];
  for (const scene of values(globalThis.game?.scenes)) {
    for (const token of values(scene?.tokens)) {
      const tokenActor = token?.actor ?? token?.document?.actor;
      if (tokenActor) candidates.push(tokenActor);
    }
  }
  for (const actor of candidates) {
    const record = getPendingTransaction(actor);
    if (!record) continue;
    const key = (actorUuid(actor) ?? "") + ":" + (actorId(actor) ?? "") + ":" + record.id;
    if (!found.has(key)) found.set(key, { actorId: actorId(actor), actorUuid: actorUuid(actor), actorName: actor.name, record });
  }
  return [...found.values()];
}

function recordTouchesActor(record, actor) {
  if (!record || !actor) return false;
  const ids = new Set(changeActorKeys({ actorId: actorId(actor), actorUuid: actorUuid(actor) }));
  return record.changes?.some((change) => changeActorKeys(change).some((key) => ids.has(key))) ?? false;
}
function changeSceneKeys(change) {
  if (!change || change.kind !== "token") return [];
  const keys = [];
  if (change.sceneUuid) keys.push("uuid:" + change.sceneUuid);
  if (change.sceneId) keys.push("id:" + change.sceneId);
  return keys;
}
function sharedBlocked(record, actor) {
  if (!record) return null;
  return { success: false, recoveryRequired: true, operationId: record.id, reason: `Pending inventory transaction ${record.id}; Open DM Toolkit → Bank Ledgers to recover.` };
}
export function transactionBlock(actor, resources = []) {
  const own = getPendingTransaction(actor);
  if (own) return sharedBlocked(own, actor);
  const wanted = new Set(resources.filter((resource) => resource?.kind === "setting").map((resource) => resource.key));
  const wantedActors = new Set(resources.flatMap((resource) => changeActorKeys(resource)));
  const wantedScenes = new Set(resources.flatMap(changeSceneKeys));
  for (const pending of listPendingTransactions()) {
    if (recordTouchesActor(pending.record, actor)) return sharedBlocked(pending.record, actor);
    if (pending.record.changes?.some((change) => changeActorKeys(change).some((key) => wantedActors.has(key)))) return sharedBlocked(pending.record, actor);
    if (pending.record.changes?.some((change) => change.kind === "setting" && wanted.has(change.key))) return { success: false, recoveryRequired: true, operationId: pending.record.id, reason: `Pending shared inventory transaction ${pending.record.id}; Open DM Toolkit → Bank Ledgers to recover.` };
    if (pending.record.changes?.some((change) => changeSceneKeys(change).some((key) => wantedScenes.has(key)))) return sharedBlocked(pending.record, actor);
  }
  return null;
}

async function read(change, actor) {
  const endpoint = change.kind === "token" ? await resolveScene(change) : await resolveActor(change, actor);
  if (change.kind !== "setting" && !endpoint) throw new Error("Transaction endpoint " + (change.sceneUuid ?? change.actorUuid ?? change.sceneId ?? change.actorId ?? "unknown") + " is unavailable");
  if (change.kind === "item") return endpoint ? snapshotItem(findItem(endpoint, change.id)) : null;
  if (change.kind === "token") return snapshotToken(endpoint.tokens?.get?.(change.id) ?? values(endpoint.tokens).find((token) => tokenId(token) === change.id));
  if (change.kind === "flag") return endpoint ? clone(endpoint.getFlag(SCOPE, change.key) ?? null) : null;
  return clone(game.settings.get(game.system.id, change.key) ?? null);
}
async function apply(change, actor, target) {
  assertAuthorityFence();
  const endpoint = change.kind === "token" ? await resolveScene(change) : await resolveActor(change, actor);
  if (change.kind !== "setting" && !endpoint) throw new Error("Transaction endpoint " + (change.sceneUuid ?? change.actorUuid ?? change.sceneId ?? change.actorId ?? "unknown") + " is unavailable");
  if (change.kind === "flag") return endpoint.setFlag(SCOPE, change.key, clone(target));
  if (change.kind === "setting") return game.settings.set(game.system.id, change.key, clone(target));
  if (change.kind === "token") {
    const token = endpoint.tokens?.get?.(change.id) ?? values(endpoint.tokens).find((candidate) => tokenId(candidate) === change.id);
    if (target === null) return token?.delete();
    if (token) return token.update(itemUpdate(token, target));
    return endpoint.createEmbeddedDocuments("Token", [{ ...clone(target), _id: change.id }], { keepId: true });
  }
  const item = findItem(endpoint, change.id);
  if (target === null) return item?.delete();
  if (item) {
    const update = itemUpdate(item, target);
    return item.update(update);
  }
  return endpoint.createEmbeddedDocuments("Item", [{ ...clone(target), _id: change.id }], { keepId: true });
}
function itemUpdate(item, target) {
  const current = snapshotItem(item) ?? {};
  const update = {};
  const walk = (before, after, prefix = "") => {
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
    for (const key of keys) {
      if (key === "_id" || key === "id" || key === "_stats") continue;
      const path = prefix ? prefix + "." + key : key;
      if (!(key in (after ?? {}))) {
        update[(prefix ? prefix + "." : "") + "-=" + key] = null;
      } else if (before?.[key] && after?.[key] && typeof before[key] === "object" && typeof after[key] === "object" && !Array.isArray(before[key]) && !Array.isArray(after[key])) {
        walk(before[key], after[key], path);
      } else if (!same(before?.[key], after[key])) {
        update[path] = clone(after[key]);
      }
    }
  };
  walk(current, target);
  return update;
}
async function verify(change, actor, target) {
  const actual = await read(change, actor);
  if (target === null) return actual === null;
  if ((change.kind === "item" || change.kind === "token") && !change.before) return same(actual, target, true);
  return same(actual, target);
}
async function allMatch(changes, actor, field) { return Promise.all(changes.map((change) => verify(change, actor, change[field]))).then((results) => results.every(Boolean)); }

async function clear(actor, record) {
  assertAuthorityFence();
  assertAuthorityFence();
  try { await actor.setFlag(SCOPE, JOURNAL_FLAG, null); }
  catch (error) { if (getPendingTransaction(actor)) throw new Error(`Transaction ${record.id} journal cleanup failed: ${error.message}`); }
  if (getPendingTransaction(actor)) throw new Error(`Transaction ${record.id} journal cleanup failed`);
}
async function rollback(actor, record, changes) {
  for (const change of changes) {
    assertAuthorityFence();
    const current = await read(change, actor);
    if (!same(current, change.before) && !same(current, change.after, (change.kind === "item" || change.kind === "token") && !change.before)) {
      throw new Error(`Transaction ${record.id} encountered unknown state; no automatic rollback attempted`);
    }
  }
  for (const change of [...changes].reverse()) {
    assertAuthorityFence();
    if (await verify(change, actor, change.before)) continue;
    if (!(await verify(change, actor, change.after))) throw new Error(`Transaction ${record.id} changed during compensation`);
    try { await apply(change, actor, change.before); }
    catch (error) { if (!(await verify(change, actor, change.before))) throw error; }
    assertAuthorityFence();
    if (!(await verify(change, actor, change.before))) throw new Error(`Transaction ${record.id} compensation verification failed`);
  }
  if (!(await allMatch(changes, actor, "before"))) throw new Error(`Transaction ${record.id} compensation verification failed`);
  await clear(actor, record);
}

async function execute(actor, options) {
  const operationId = randomId();
  const record = { version: 1, id: operationId, label: options.label, createdAt: Date.now(), changes: options.changes };
  const block = transactionBlock(actor, options.changes);
  if (block) return block;
  if (options.validate) {
    try {
      if (!(await options.validate())) return { success: false, recoveryRequired: false, operationId, reason: "Transaction validation failed; no writes were made." };
    } catch (error) {
      return { success: false, recoveryRequired: false, operationId, reason: "Transaction validation failed: " + error.message };
    }
  }
  try {
    if (!(await allMatch(record.changes, actor, "before"))) return { success: false, recoveryRequired: false, operationId, reason: "Transaction source state changed; no writes were made." };
  } catch (error) {
    return { success: false, recoveryRequired: false, operationId, reason: error.message };
  }
  try {
    assertAuthorityFence();
    if (options.authority) await recordAuthorityTransaction(record);
    assertAuthorityFence();
    await actor.setFlag(SCOPE, JOURNAL_FLAG, record);
    if (!same(getPendingTransaction(actor), record)) throw new Error("Transaction journal could not be confirmed");
  } catch (error) {
    const persisted = getPendingTransaction(actor);
    return { success: false, recoveryRequired: Boolean(persisted), operationId: persisted?.id ?? operationId, reason: persisted ? `${error.message}; pending GM recovery required.` : error.message };
  }
  try {
    for (const change of record.changes) {
      if (!(await verify(change, actor, change.before))) throw new Error("Transaction source state changed before write");
      await apply(change, actor, change.after);
      if (!(await verify(change, actor, change.after))) throw new Error("Transaction result verification failed");
    }
    if (!(await allMatch(record.changes, actor, "after"))) throw new Error("Transaction result verification failed");
    try { await clear(actor, record); return { success: true, operationId }; }
    catch (cleanupError) { return { success: false, recoveryRequired: true, committed: true, operationId, reason: `${cleanupError.message}; transaction committed but journal cleanup is pending.` }; }
  } catch (error) {
    if (await allMatch(record.changes, actor, "after")) {
      try { await clear(actor, record); return { success: true, operationId }; }
      catch (cleanupError) { return { success: false, recoveryRequired: true, committed: true, operationId, reason: `${cleanupError.message}; transaction committed but journal cleanup is pending.` }; }
    }
    try {
      await rollback(actor, record, record.changes);
      return { success: false, recoveryRequired: false, operationId, reason: `${error.message}; transaction cancelled and original state restored.` };
    } catch (rollbackError) {
      return { success: false, recoveryRequired: true, operationId, reason: `${error.message}; pending GM recovery required: ${rollbackError.message}` };
    }
  }
}

function lockKeys(actor, changes = [], actorRefs = []) {
  const keys = new Set(changeActorKeys(null, actor));
  for (const ref of actorRefs) changeActorKeys(null, ref).forEach((key) => keys.add(key));
  for (const change of changes) {
    changeActorKeys(change, actor).forEach((key) => keys.add(key));
    if (change.kind === "setting") keys.add("setting:" + change.key);
    changeSceneKeys(change).forEach((key) => keys.add("scene:" + key));
  }
  return [...keys].sort();
}
function locked(actor, changes, fn, actorRefs = []) {
  const keys = lockKeys(actor, changes, actorRefs);
  const prior = Promise.all(keys.map((key) => locks.get(key) ?? Promise.resolve()));
  const run = prior.catch(() => {}).then(fn);
  const held = run.catch(() => {});
  keys.forEach((key) => locks.set(key, held));
  return run;
}
function journalHost(record = null) {
  let pending = record;
  return { getFlag: (_scope, key) => key === JOURNAL_FLAG ? pending : null, setFlag: async (_scope, key, value) => { if (key === JOURNAL_FLAG) pending = value; } };
}
export function runTransaction(actor, options) { return locked(actor, options.changes, () => execute(actor ?? journalHost(), options), options.actorRefs); }
export async function recoverRecordedTransaction(record) {
  const result = await recoverTransaction(journalHost(record));
  if (result.success) {
    for (const pending of listPendingTransactions()) {
      if (pending.record.id !== record.id) continue;
      const endpoint = await resolveActor({ actorId: pending.actorId, actorUuid: pending.actorUuid });
      if (endpoint) await clear(endpoint, record);
    }
  }
  return result;
}

export function recoverTransaction(actor) {
  const authorityId = getPendingTransaction(actor)?.authorityOperationId;
  if (authorityId && currentInventoryOperation() !== authorityId) return recoverInventoryOperation(authorityId);
  return locked(actor, getPendingTransaction(actor)?.changes ?? [], async () => {
    try {
      const record = getPendingTransaction(actor);
      if (!record) return { success: true, outcome: "none", reason: "No pending transaction." };
      if (!globalThis.game?.user?.isGM) return { success: false, recoveryRequired: true, operationId: record.id, reason: "Only the GM can recover a pending transaction." };
      if (await allMatch(record.changes, actor, "after")) { await clear(actor, record); return { success: true, outcome: "committed", operationId: record.id }; }
      if (await allMatch(record.changes, actor, "before")) { await clear(actor, record); return { success: true, outcome: "restored", operationId: record.id }; }
      await rollback(actor, record, record.changes);
      return { success: true, outcome: "restored", operationId: record.id };
    } catch (error) {
      const record = getPendingTransaction(actor);
      return { success: false, recoveryRequired: true, operationId: record?.id, reason: `Pending GM recovery required: ${error.message}` };
    }
  });
}
