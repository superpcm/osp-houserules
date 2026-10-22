/** One active-GM queue and durable replay receipts for bank/store mutations. */
export const INVENTORY_SOCKET_NAMESPACE = "osp-houserules.inventory-authority.v1";
export const INVENTORY_CHAT_FLAG = "inventoryAuthority";
export const RECEIPTS_SETTING = "inventoryOperationReceipts";
const handlers = new Map();
const flights = new Map();
const intents = new Map();
const pending = new Map();
let queue = Promise.resolve();
let context = null;
let tabLease = null;
let releaseTabLease = null;
let leaseName = null;
let ownsTabLease = false;
const transport = () => globalThis.ChatMessage?.create && globalThis.Hooks?.on;
export function inventoryWithdrawalAllowed(user) {
  return Boolean(user?.isGM || !game.settings?.get?.(game.system.id, "storeLock"));
}
function releaseLease() { ownsTabLease = false; releaseTabLease?.(); tabLease = null; }
const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const fingerprint = (action, details, userId) => JSON.stringify(canonical({ action, details, userId }));
const receipts = () => clone(game.settings.get(game.system.id, RECEIPTS_SETTING) ?? {});
const isAuthority = () => Boolean(game.users?.activeGM && game.user.id === game.users.activeGM.id);
async function authorityTab() {
  if (!isAuthority()) { releaseLease(); return false; }
  const locks = globalThis.navigator?.locks;
  // Foundry desktop/test environments without a browser surface have one executor.
  // Browser tabs require Web Locks; unsupported browser surfaces fail closed.
  if (!locks) return !globalThis.window;
  const name = `osp-inventory-authority:${game.world?.id ?? game.system.id}`;
  if (leaseName !== name) { releaseLease(); leaseName = name; }
  if (!tabLease) {
    tabLease = new Promise(resolve => {
      void locks.request(name, { ifAvailable: true }, async lock => {
        if (!lock) { resolve(false); return; }
        ownsTabLease = true;
        resolve(true);
        let ownRelease;
        await new Promise(release => { ownRelease = release; releaseTabLease = release; });
        if (releaseTabLease === ownRelease) releaseTabLease = null;
      }).catch(() => resolve(false));
    });
  }
  const acquired = await tabLease;
  if (!acquired) tabLease = null;
  return acquired && isAuthority();
}
export function assertAuthorityFence() {
  // Only authority-dispatched transactions are fenced. Other journal clients
  // (purchases/gifts) retain their existing behavior until their authority work.
  if (context && (!isAuthority() || globalThis.window && globalThis.navigator?.locks && !ownsTabLease)) throw new Error("Inventory authority changed; recovery is required.");
}
export function currentInventoryOperation() { return context?.operationId ?? null; }
export function inventoryRequester() { return context ? game.users.get(context.userId) : game.user; }
async function persist(id, receipt) {
  assertAuthorityFence();
  const next = receipts(); next[id] = clone(receipt);
  try { await game.settings.set(game.system.id, RECEIPTS_SETTING, next); }
  catch (error) {
    if (JSON.stringify(receipts()[id]) !== JSON.stringify(receipt)) throw error;
  }
}
export async function recordAuthorityTransaction(record) {
  if (!context) return;
  assertAuthorityFence();
  record.authorityOperationId = context.operationId;
  const receipt = receipts()[context.operationId];
  await persist(context.operationId, { ...receipt, transaction: clone(record) });
}
export function listInventoryOperations() {
  return Object.values(receipts()).filter(receipt => receipt.status === "started");
}
function intentKey(action, details) {
  return `osp-inventory:${game.world?.id ?? "world"}:${game.user.id}:${fingerprint(action, details, game.user.id)}`;
}
export function operationIdFor(action, details, explicitId) {
  if (explicitId) return explicitId;
  const key = intentKey(action, details);
  let id = intents.get(key);
  try { id ??= globalThis.sessionStorage?.getItem(key); } catch (_) { /* memory fallback */ }
  if (!id) id = globalThis.foundry?.utils?.randomID?.() ?? crypto.randomUUID();
  intents.set(key, id);
  try { globalThis.sessionStorage?.setItem(key, id); } catch (_) { /* memory fallback */ }
  return id;
}
function settleIntent(action, details, id, result) {
  if (!result || result.retryable || result.recoveryRequired) return;
  const key = intentKey(action, details);
  if (intents.get(key) === id) intents.delete(key);
  try { if (globalThis.sessionStorage?.getItem(key) === id) globalThis.sessionStorage.removeItem(key); } catch (_) { /* memory fallback */ }
}
function serialized(fn) {
  const run = queue.catch(() => {}).then(fn); queue = run.catch(() => {}); return run;
}
async function execute(message) {
  if (!isAuthority()) return { success: false, retryable: true, operationId: message.operationId, reason: "An active GM must be connected. Retry with the same operation ID." };
  const validDetails = message.details && typeof message.details === "object" && !Array.isArray(message.details) && (Object.getPrototypeOf(message.details) === Object.prototype || Object.getPrototypeOf(message.details) === null);
  if (message.namespace !== INVENTORY_SOCKET_NAMESPACE || message.type !== "request" || typeof message.action !== "string" || !validDetails || typeof message.operationId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(message.operationId) || Object.hasOwn(Object.prototype, message.operationId) || !game.users.get(message.userId)) return { success: false, operationId: typeof message.operationId === "string" ? message.operationId : undefined, reason: "Invalid inventory request." };
  const handler = handlers.get(message.action);
  if (!handler) return { success: false, operationId: message.operationId, reason: "Unknown inventory operation." };
  const signature = fingerprint(message.action, message.details, message.userId);
  const prior = receipts()[message.operationId];
  if (prior) return prior.fingerprint === signature ? prior.result : { success: false, operationId: message.operationId, reason: "Operation ID belongs to another request." };
  if (listInventoryOperations().length) return { success: false, operationId: message.operationId, retryable: true, recoveryRequired: true, reason: "A pending inventory operation requires recovery in DM Toolkit → Bank Ledgers." };
  context = message;
  const receipt = { operationId: message.operationId, fingerprint: signature, userId: message.userId, action: message.action, createdAt: Date.now(), status: "started", result: { success: false, operationId: message.operationId, recoveryRequired: true, reason: "Operation interrupted or still pending. Open DM Toolkit → Bank Ledgers to recover." } };
  try {
    await persist(message.operationId, receipt);
    assertAuthorityFence();
    let result;
    try { result = await handler(message.details, message); }
    catch (error) { result = { success: false, recoveryRequired: true, reason: error.message }; }
    result = { ...result, transactionId: result.operationId, operationId: message.operationId };
    assertAuthorityFence();
    await persist(message.operationId, { ...receipts()[message.operationId], status: result.recoveryRequired ? "started" : "completed", result });
    return result;
  } catch (error) {
    return { success: false, operationId: message.operationId, retryable: true, recoveryRequired: true, reason: `${error.message}; retry or recover this operation before new edits.` };
  } finally { context = null; }
}

function requestFlags(message) {
  return { [game.system.id]: { [INVENTORY_CHAT_FLAG]: { type: "request", envelope: clone(message) } } };
}
function resultFlags(message, result) {
  const safeResult = Object.fromEntries(["success", "reason", "reasonType", "operationId", "transactionId", "retryable", "recoveryRequired", "outcome", "committed"]
    .filter(key => result && result[key] !== undefined).map(key => [key, clone(result[key])]));
  return { [game.system.id]: { [INVENTORY_CHAT_FLAG]: {
    type: "result", operationId: message.operationId, userId: message.userId,
    fingerprint: fingerprint(message.action, message.details, message.userId), result: safeResult,
  } } };
}
async function createRequest(message) {
  if (!transport()) return false;
  const gm = game.users?.activeGM;
  if (!gm) return false;
  await ChatMessage.create({ content: "", whisper: [gm.id], flags: requestFlags(message) });
  return true;
}
async function createResult(message, result) {
  if (!transport()) return;
  await ChatMessage.create({ content: "", whisper: [message.userId], flags: resultFlags(message, result) });
}
function handleChatMessage(document, _options, hookUserId) {
  const payload = document?.flags?.[game.system.id]?.[INVENTORY_CHAT_FLAG];
  if (!payload || typeof hookUserId !== "string") return;
  if (payload.type === "request") {
    const message = payload.envelope;
    if (!message || message.userId !== hookUserId || !isAuthority()) return;
    const authoritative = clone(message);
    void authorityTab().then(leader => leader ? serialized(() => execute(authoritative)) : null)
      .then(result => result ? createResult(authoritative, result) : null)
      .catch(() => {});
    return;
  }
  if (payload.type !== "result" || payload.userId !== game.user?.id) return;
  const creator = game.users?.get?.(hookUserId);
  const activeGM = game.users?.activeGM;
  if (!creator?.isGM || !activeGM || hookUserId !== activeGM.id) return;
  const flight = pending.get(payload.operationId);
  if (!flight || flight.userId !== game.user.id || flight.fingerprint !== payload.fingerprint || !payload.result || typeof payload.result !== "object" || Array.isArray(payload.result)) return;
  if (typeof payload.result.success !== "boolean") return;
  flight.finish(payload.result);
}
export function inventoryActorReference(actor) {
  return { actorId: actor.id, ...(actor.uuid ? { actorUuid: actor.uuid } : {}) };
}
export async function resolveInventoryActor(details) {
  if (details.actorUuid) {
    const resolve = globalThis.fromUuid ?? globalThis.foundry?.utils?.fromUuid;
    try {
      const actor = resolve ? await resolve(details.actorUuid) : game.actors.get(details.actorId);
      return actor?.uuid === details.actorUuid ? actor : null;
    } catch (_) { return null; }
  }
  return game.actors.get(details.actorId);
}
export function registerInventoryAuthority(action, handler) { handlers.set(action, handler); }
export function initInventoryAuthority() {
  if (globalThis.__ospInventoryChatHook) return;
  if (!transport()) return;
  globalThis.__ospInventoryChatHook = true;
  globalThis.Hooks.on("createChatMessage", handleChatMessage);
  globalThis.Hooks?.on?.("updateUser", () => { if (!isAuthority()) { releaseLease(); } });
  globalThis.window?.addEventListener?.("pagehide", () => { releaseLease(); });
}
export function requestInventoryMutation(action, details = {}, _unused, explicitId = null) {
  details = clone(details); explicitId ??= details.operationId; delete details.operationId;
  const operationId = operationIdFor(action, details, explicitId);
  const flightKey = `${game.user.id}:${operationId}`;
  const signature = fingerprint(action, details, game.user.id);
  if (flights.has(flightKey)) {
    const existing = flights.get(flightKey);
    return existing.signature === signature ? existing.promise : Promise.resolve({ success: false, operationId, reason: "Operation ID belongs to another request." });
  }
  const message = { namespace: INVENTORY_SOCKET_NAMESPACE, type: "request", action, details, operationId, userId: game.user.id };
  let run;
  initInventoryAuthority();
  run = Promise.resolve().then(async () => {
    if (!game.users?.activeGM) return { success: false, operationId, retryable: true, reason: "An active GM must be connected." };
    if (!transport()) return { success: false, operationId, retryable: true, reason: "Inventory authority transport is unavailable." };
    return new Promise(resolve => {
      const timer = setTimeout(() => finish({ success: false, operationId, retryable: true, reason: "No acknowledgment received. Retry the same operation; it may already have completed." }), 10000);
      function finish(result) { clearTimeout(timer); pending.delete(operationId); resolve(result); }
      pending.set(operationId, { finish, userId: game.user.id, fingerprint: signature });
      void createRequest(message).then(created => {
        if (!created) finish({ success: false, operationId, retryable: true, reason: "Inventory authority transport is unavailable." });
      }).catch(() => finish({ success: false, operationId, retryable: true, reason: "Inventory authority transport is unavailable." }));
    });
  });
  const final = run.then(result => { settleIntent(action, details, operationId, result); return result; }).finally(() => flights.delete(flightKey));
  flights.set(flightKey, { signature, promise: final }); return final;
}
export function recoverInventoryOperation(operationId) {
  return serialized(async () => {
    if (!(await authorityTab()) || !game.user.isGM) return { success: false, recoveryRequired: true, operationId, reason: "Only the active GM can recover inventory operations." };
    const receipt = receipts()[operationId];
    if (!receipt || receipt.status !== "started") return receipt?.result ?? { success: true, outcome: "none" };
    context = { operationId, userId: receipt.userId };
    try {
      let result;
      if (!receipt.transaction) result = { success: false, outcome: "restored", reason: "No transaction was prepared; the request was cancelled." };
      else {
        const { recoverRecordedTransaction } = await import("./transaction-journal.js");
        result = await recoverRecordedTransaction(receipt.transaction);
        if (!result.success) return result;
        result = { ...result, success: result.outcome === "committed", recoveryRequired: false };
      }
      await persist(operationId, { ...receipt, status: "completed", result: { ...result, operationId } });
      return { ...result, success: true, operationId };
    } catch (error) {
      return { success: false, recoveryRequired: true, operationId, reason: error.message };
    } finally { context = null; }
  });
}
