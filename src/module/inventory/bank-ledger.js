/**
 * @file Pure ledger math for Westford Bank. No Foundry globals — every function here takes a
 * plain ledger object (see emptyLedger()) plus plain inputs and returns either a failure reason
 * or a brand-new ledger object to replace the old one with. Nothing is mutated in place and
 * nothing is written to a document; that's the orchestrator's job (bank-ledger-orchestrator.js),
 * which only calls actor.setFlag/updateEmbeddedDocuments/createEmbeddedDocuments once a plan
 * here has already succeeded. Mirrors the plan-then-apply split in treasure-cost.js.
 *
 * A ledger entry stores a full item-data snapshot (captured at deposit time) rather than a
 * reference to a live embedded item, because depositing deletes the item from the actor's
 * inventory — the snapshot is what gets recreated on withdrawal. Stack identity/merging is keyed
 * on item name (mirroring how treasure-cost.js matches coin items by name), since embedded-item
 * ids aren't stable across delete/recreate. Unique items (system.tags includes 'unique') are
 * never merged, even when their name matches an existing stack.
 */

const CURRENCY_DENOMINATIONS = ['gold', 'silver', 'copper'];

// Not crypto.randomUUID() — that requires a secure context (HTTPS or localhost), and Foundry
// servers are routinely reached over plain HTTP on a LAN, where it would be undefined. Ledger
// entry ids only need to be unique within one actor's ledger, not cryptographically random.
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randomEntryId(length = 16) {
  let id = '';
  for (let i = 0; i < length; i++) id += ID_CHARS.charAt(Math.floor(Math.random() * ID_CHARS.length));
  return id;
}

export function emptyLedger() {
  return { currency: { gold: 0, silver: 0, copper: 0 }, items: [], log: [] };
}

/** @param {{type?:string, system?:{treasure?:boolean}}} itemData */
export function isTreasureEligible(itemData) {
  return itemData?.type === 'item' && itemData?.system?.treasure === true;
}

/** @param {{system?:{tags?:string[]}}} itemData */
export function isUniqueItem(itemData) {
  return (itemData?.system?.tags || []).includes('unique');
}

function cloneLedger(ledger) {
  return structuredClone(ledger);
}

function isValidDenomination(denomination) {
  return CURRENCY_DENOMINATIONS.includes(denomination);
}

// Reset placement-specific fields so a withdrawn item doesn't reappear equipped/lashed/pointed
// at a stale containerId — mirrors the same reset already applied on cross-actor item transfers
// elsewhere in this codebase.
function stripSnapshotFields(itemData) {
  const { _id, ...rest } = itemData;
  return { ...rest, system: { ...rest.system, containerId: null, lashed: false, equipped: false } };
}

function findMatchingStack(ledger, name) {
  return ledger.items.find((e) => e.name === name && !e.unique) ?? null;
}

function buildLogEntry(meta, defaultAction, fields) {
  return {
    timestamp: Date.now(),
    actor: meta.actorType ?? 'player',
    actorId: meta.actorId ?? null,
    action: meta.action ?? defaultAction,
    payloadType: fields.payloadType,
    itemId: fields.itemId ?? null,
    itemName: fields.itemName ?? null,
    denomination: fields.denomination ?? null,
    quantity: fields.quantity,
    containerId: meta.containerId ?? null,
  };
}

/**
 * @param {ReturnType<typeof emptyLedger>} ledger
 * @param {Object} itemData - item.toObject()-shaped snapshot of the item being deposited
 * @param {number} quantity - how many of the source stack to deposit
 * @param {{actorType?:'player'|'dm', actorId?:string, containerId?:string|null, action?:string}} meta
 * @returns {{success:boolean, reason?:string, ledger?:Object, entryId?:string, logEntry?:Object}}
 */
export function planDepositItem(ledger, itemData, quantity, meta = {}) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { success: false, reason: 'Quantity must be a positive whole number.' };
  }
  if (!isTreasureEligible(itemData)) {
    return { success: false, reason: `${itemData?.name ?? 'This item'} is not treasure and cannot be deposited.` };
  }
  const unique = isUniqueItem(itemData);
  if (unique && quantity !== 1) {
    return { success: false, reason: `${itemData.name} is unique and can only be deposited one at a time.` };
  }

  const newLedger = cloneLedger(ledger);
  let entryId;
  const existing = !unique ? findMatchingStack(newLedger, itemData.name) : null;
  if (existing) {
    existing.quantity += quantity;
    entryId = existing.entryId;
  } else {
    entryId = randomEntryId();
    newLedger.items.push({
      entryId,
      name: itemData.name,
      img: itemData.img ?? null,
      quantity,
      unique,
      itemData: stripSnapshotFields(itemData),
    });
  }

  const logEntry = buildLogEntry(meta, 'deposit', {
    payloadType: 'item', itemId: entryId, itemName: itemData.name, quantity,
  });
  newLedger.log.push(logEntry);
  return { success: true, ledger: newLedger, entryId, logEntry };
}

/**
 * @param {ReturnType<typeof emptyLedger>} ledger
 * @param {string} entryId
 * @param {number} quantity - how many of the ledger stack to withdraw
 * @param {{allowed:boolean, reason?:string, reasonType?:'type'|'capacity'}} containerCheck -
 *   precomputed by the orchestrator via container-capacity.js; pass {allowed:true} for DM edits,
 *   which have no real destination container to validate against.
 * @param {{actorType?:'player'|'dm', actorId?:string, containerId?:string|null, action?:string}} meta
 * @returns {{success:boolean, reason?:string, reasonType?:string, ledger?:Object, itemDataToCreate?:Object, unique?:boolean, logEntry?:Object}}
 */
export function planWithdrawItem(ledger, entryId, quantity, containerCheck, meta = {}) {
  if (!containerCheck?.allowed) {
    return {
      success: false,
      reason: containerCheck?.reason ?? 'That container cannot accept this item.',
      reasonType: containerCheck?.reasonType,
    };
  }
  const entry = ledger.items.find((e) => e.entryId === entryId);
  if (!entry) {
    return { success: false, reason: 'That ledger entry no longer exists.' };
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > entry.quantity) {
    return { success: false, reason: `Quantity must be between 1 and ${entry.quantity}.` };
  }

  const newLedger = cloneLedger(ledger);
  const newEntry = newLedger.items.find((e) => e.entryId === entryId);
  const itemDataToCreate = structuredClone(newEntry.itemData);
  const unique = newEntry.unique;

  // Full-stack withdrawal removes the row entirely — never left behind at quantity 0.
  if (quantity === newEntry.quantity) {
    newLedger.items = newLedger.items.filter((e) => e.entryId !== entryId);
  } else {
    newEntry.quantity -= quantity;
  }

  const logEntry = buildLogEntry(meta, 'withdraw', {
    payloadType: 'item', itemId: entryId, itemName: entry.name, quantity,
  });
  newLedger.log.push(logEntry);
  return { success: true, ledger: newLedger, itemDataToCreate, unique, logEntry };
}

/**
 * @param {ReturnType<typeof emptyLedger>} ledger
 * @param {'gold'|'silver'|'copper'} denomination
 * @param {number} quantity
 * @param {{actorType?:'player'|'dm', actorId?:string, containerId?:string|null, action?:string}} meta
 */
export function planDepositCurrency(ledger, denomination, quantity, meta = {}) {
  if (!isValidDenomination(denomination)) {
    return { success: false, reason: `Unknown currency denomination: ${denomination}.` };
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { success: false, reason: 'Quantity must be a positive whole number.' };
  }

  const newLedger = cloneLedger(ledger);
  newLedger.currency[denomination] += quantity;

  const logEntry = buildLogEntry(meta, 'deposit', { payloadType: 'currency', denomination, quantity });
  newLedger.log.push(logEntry);
  return { success: true, ledger: newLedger, logEntry };
}

/**
 * @param {ReturnType<typeof emptyLedger>} ledger
 * @param {'gold'|'silver'|'copper'} denomination
 * @param {number} quantity
 * @param {{allowed:boolean, reason?:string, reasonType?:'type'|'capacity'}} containerCheck
 * @param {{actorType?:'player'|'dm', actorId?:string, containerId?:string|null, action?:string}} meta
 */
export function planWithdrawCurrency(ledger, denomination, quantity, containerCheck, meta = {}) {
  if (!isValidDenomination(denomination)) {
    return { success: false, reason: `Unknown currency denomination: ${denomination}.` };
  }
  if (!containerCheck?.allowed) {
    return {
      success: false,
      reason: containerCheck?.reason ?? 'That container cannot accept currency.',
      reasonType: containerCheck?.reasonType,
    };
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > (ledger.currency[denomination] || 0)) {
    return { success: false, reason: `Not enough ${denomination} in the ledger.` };
  }

  const newLedger = cloneLedger(ledger);
  newLedger.currency[denomination] -= quantity;

  const logEntry = buildLogEntry(meta, 'withdraw', { payloadType: 'currency', denomination, quantity });
  newLedger.log.push(logEntry);
  return { success: true, ledger: newLedger, logEntry };
}

/**
 * DM-only absolute "set this denomination to X" — computes the delta and delegates to the
 * deposit/withdraw planner above (tagged action:'dm_edit' by default), so it goes through the
 * exact same success/failure contract rather than writing currency directly.
 * @param {ReturnType<typeof emptyLedger>} ledger
 * @param {'gold'|'silver'|'copper'} denomination
 * @param {number} newValue
 * @param {{actorType?:'player'|'dm', actorId?:string, action?:string}} meta
 */
export function planSetCurrency(ledger, denomination, newValue, meta = {}) {
  if (!isValidDenomination(denomination)) {
    return { success: false, reason: `Unknown currency denomination: ${denomination}.` };
  }
  if (!Number.isInteger(newValue) || newValue < 0) {
    return { success: false, reason: 'Currency value must be zero or a positive whole number.' };
  }

  const dmMeta = { ...meta, action: meta.action ?? 'dm_edit' };
  const delta = newValue - (ledger.currency[denomination] || 0);
  if (delta === 0) return { success: true, ledger: cloneLedger(ledger), logEntry: null };
  if (delta > 0) return planDepositCurrency(ledger, denomination, delta, dmMeta);
  return planWithdrawCurrency(ledger, denomination, -delta, { allowed: true }, dmMeta);
}
