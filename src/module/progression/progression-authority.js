/** Durable active-GM authority for progression mutations. */
export const PROGRESSION_SOCKET_NAMESPACE = "osp-houserules.progression-authority.v1";
export const PROGRESSION_CHAT_FLAG = "progressionAuthority";
export const RECEIPTS_SETTING = "progressionOperationReceipts";

const handlers = new Map();
const flights = new Map();
const intents = new Map();
let queue = Promise.resolve();
let context = null;
let hookInstalled = false;
let lease = null;
let releaseLease = null;
let ownsLease = false;
let leaseName = null;
function dropLease() { ownsLease = false; releaseLease?.(); releaseLease = null; lease = null; }
async function authorityTab() {
  if (!isActiveGM()) { dropLease(); return false; }
  const locks = globalThis.navigator?.locks;
  if (!locks) return !globalThis.window;
  const name = `osp-progression-authority:${game.world?.id ?? game.system.id}`;
  if (leaseName !== name) { dropLease(); leaseName = name; }
  if (!lease) lease = new Promise(resolve => {
    void locks.request(name, { ifAvailable: true }, async lock => {
      if (!lock) { resolve(false); return; }
      ownsLease = true; resolve(true);
      await new Promise(release => { releaseLease = release; });
    }).catch(() => resolve(false));
  });
  const acquired = await lease;
  if (!acquired) lease = null;
  return acquired && isActiveGM();
}
const clone = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const fingerprint = (action, details, userId) => JSON.stringify(canonical({ action, details, userId }));
const settingGet = key => game?.settings?.get?.(game.system.id, key) ?? {};
const receipts = () => clone(settingGet(RECEIPTS_SETTING) || {});
const isActiveGM = () => Boolean(game?.users?.activeGM && game.user?.id === game.users.activeGM.id && game.user?.isGM);
const serialized = fn => { const run = queue.catch(() => {}).then(fn); queue = run.catch(() => {}); return run; };
export function assertProgressionAuthorityFence() { if (context && (!isActiveGM() || globalThis.window && !ownsLease)) throw new Error("Progression authority changed; recovery is required."); }
export function getProgressionRequester() { return context ? game.users.get(context.userId) : game?.user; }
export function currentProgressionOperation() { return context?.operationId ?? null; }
async function persist(id, value) { assertProgressionAuthorityFence(); const next = receipts(); next[id] = clone(value); try { await game.settings.set(game.system.id, RECEIPTS_SETTING, next); } catch (error) { if (JSON.stringify(receipts()[id]) !== JSON.stringify(value)) throw error; } const check = receipts()[id]; if (JSON.stringify(check) !== JSON.stringify(value)) throw new Error("Progression receipt acknowledgment failed."); }
export function registerProgressionAuthority(action, handler) { handlers.set(action, handler); }
export function listProgressionOperations() { return Object.values(receipts()).filter(r => r.status === "started"); }
function validDetails(value) { return value && typeof value === "object" && !Array.isArray(value); }
async function execute(message) {
  if (!(await authorityTab())) return { success: false, retryable: true, recoveryRequired: true, operationId: message.operationId, reason: "An active GM must be connected." };
  if (message.namespace !== PROGRESSION_SOCKET_NAMESPACE || message.type !== "request" || !handlers.has(message.action) || !validDetails(message.details) || Object.getPrototypeOf(message.details) !== Object.prototype || typeof message.operationId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(message.operationId) || Object.hasOwn(Object.prototype, message.operationId) || !game.users?.get(message.userId)) return { success: false, operationId: message.operationId, reason: "Invalid progression request." };
  const signature = fingerprint(message.action, message.details, message.userId), prior = receipts()[message.operationId];
  if (prior) return prior.fingerprint === signature ? prior.result : { success: false, operationId: message.operationId, reason: "Operation ID belongs to another request." };
  const started = { operationId: message.operationId, action: message.action, userId: message.userId, details: clone(message.details), fingerprint: signature, createdAt: Date.now(), status: "started", result: { success: false, operationId: message.operationId, recoveryRequired: true, reason: "Operation requires recovery." } };
  context = message;
  try {
    await persist(message.operationId, started);
    let result;
    try { result = await handlers.get(message.action)(message.details, message); }
    catch (error) { result = { success: false, recoveryRequired: true, reason: error.message }; }
    result = { ...result, operationId: message.operationId };
    await persist(message.operationId, { ...receipts()[message.operationId], status: result.recoveryRequired ? "started" : "completed", result });
    return result;
  } catch (error) { return { success: false, operationId: message.operationId, retryable: true, recoveryRequired: true, reason: error.message }; }
  finally { context = null; }
}
function handleChat(document, _options, senderId) {
  const payload = document?.flags?.[game.system.id]?.[PROGRESSION_CHAT_FLAG];
  if (!payload || typeof senderId !== "string" || document.author?.id !== senderId) return;
  if (payload.type === "request") {
    const message = payload.envelope;
    if (!message || document.author?.id && document.author.id !== senderId || message.userId !== senderId || !game.users.get(senderId) || !isActiveGM()) return;
    void authorityTab().then(leader => leader ? serialized(() => execute(message)) : null).then(result => result ? ChatMessage.create({ content: "", whisper: [message.userId], flags: { [game.system.id]: { [PROGRESSION_CHAT_FLAG]: { type: "result", userId: message.userId, operationId: message.operationId, fingerprint: fingerprint(message.action, message.details, message.userId), result } } } }) : null).catch(() => {});
  } else if ((!document.author?.id || document.author.id === senderId) && payload.type === "result" && payload.userId === game.user?.id && senderId === game.users?.activeGM?.id) {
    const flight = flights.get(payload.operationId);
    if (flight && payload.fingerprint === flight.signature && typeof payload.result?.success === "boolean" && typeof flight.finish === "function") flight.finish(payload.result);
  }
}
export function initProgressionAuthority() {
  if (hookInstalled || !globalThis.Hooks?.on) return;
  hookInstalled = true; Hooks.on("createChatMessage", handleChat); Hooks.on("updateUser", () => { if (!isActiveGM()) dropLease(); }); globalThis.window?.addEventListener?.("pagehide", dropLease);
}
function intentKey(action, details) { return `osp-progression:${game.world?.id ?? 'world'}:${fingerprint(action, details, game.user.id)}`; }
export function operationIdFor(action, details, explicitId = null) {
  if (explicitId) return explicitId;
  const key = intentKey(action, details); let id = intents.get(key);
  try { id ??= globalThis.sessionStorage?.getItem(key); } catch (_) { /* memory fallback */ }
  if (!id) id = globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto?.randomUUID?.() ?? `progression-${Date.now()}`;
  intents.set(key, id);
  try { globalThis.sessionStorage?.setItem(key, id); } catch (_) { /* memory fallback */ }
  return id;
}
function settleIntent(action, details, id, result) {
  if (!result || result.retryable || result.recoveryRequired) return;
  const key = intentKey(action, details); if (intents.get(key) === id) intents.delete(key);
  try { if (globalThis.sessionStorage?.getItem(key) === id) globalThis.sessionStorage.removeItem(key); } catch (_) { /* memory fallback */ }
}
export function requestProgressionMutation(action, details = {}, explicitId = null) {
  details = clone(details); explicitId ??= details.operationId; delete details.operationId;
  const operationId = operationIdFor(action, details, explicitId), signature = fingerprint(action, details, game.user.id);
  if (flights.has(operationId)) { const existing = flights.get(operationId); return existing.signature === signature ? existing.promise : Promise.resolve({ success: false, operationId, reason: "Operation ID belongs to another request." }); }
  initProgressionAuthority();
  const run = (async () => {
    if (!game.users?.activeGM) return { success: false, operationId, retryable: true, reason: "An active GM must be connected." };
    if (isActiveGM() && !globalThis.window && !globalThis.ChatMessage?.create) return serialized(() => execute({ namespace: PROGRESSION_SOCKET_NAMESPACE, type: "request", action, details, operationId, userId: game.user.id }));
    if (!globalThis.ChatMessage?.create) return { success: false, operationId, retryable: true, reason: "Progression authority transport is unavailable." };
    return new Promise(resolve => { const timer = setTimeout(() => finish({ success: false, operationId, retryable: true, recoveryRequired: true, reason: "No authority acknowledgment received." }), 10000); function finish(result) { clearTimeout(timer); flights.delete(operationId); resolve(result); } flights.set(operationId, { finish, promise: null, signature }); ChatMessage.create({ content: "", whisper: [game.users.activeGM.id], flags: { [game.system.id]: { [PROGRESSION_CHAT_FLAG]: { type: "request", envelope: { namespace: PROGRESSION_SOCKET_NAMESPACE, type: "request", action, details, operationId, userId: game.user.id } } } } }).catch(() => finish({ success: false, operationId, retryable: true, reason: "Progression authority transport is unavailable." })); });
  })();
  const entry = flights.get(operationId) ?? { signature, finish: null };
  const promise = run.then(result => { settleIntent(action, details, operationId, result); return result; }).finally(() => { flights.delete(operationId); });
  entry.promise = promise; entry.signature = signature; flights.set(operationId, entry); return promise;
}
async function recoverRecordedOperation(operationId) { if (!(await authorityTab())) return { success: false, operationId, recoveryRequired: true, reason: "Only the active GM authority tab can recover progression operations." }; const receipt = receipts()[operationId]; if (!receipt || receipt.status !== "started") return receipt?.result ?? { success: true, operationId, outcome: "none" }; context = { operationId, userId: receipt.userId }; try { const result = await handlers.get(receipt.action)?.(receipt.details, receipt); const final = { ...result, operationId }; await persist(operationId, { ...receipt, status: final.recoveryRequired ? "started" : "completed", result: final }); return final; } catch (error) { return { success: false, operationId, recoveryRequired: true, reason: error.message }; } finally { context = null; } }

registerProgressionAuthority('progression.recover', async (details, message) => {
  if (!game.users.get(message.userId)?.isGM) return { success: false, reason: 'Only a GM may recover progression operations.' };
  if (details.targetId === message.operationId) return { success: false, reason: 'Cannot recover this request itself.' };
  const outer = context;
  try { const result = await recoverRecordedOperation(details.targetId); return { ...result, recoveryRequired: false, targetRecoveryRequired: result.recoveryRequired }; }
  finally { context = outer; }
});
export function recoverProgressionOperation(operationId) {
  return requestProgressionMutation('progression.recover', { targetId: operationId });
}
