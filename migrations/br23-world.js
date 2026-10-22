/**
 * BR23 offline world migration.  This module deliberately knows nothing about
 * Foundry collections: input and output are plain JSON values.
 */

import { createLevelUpState } from "../src/module/actor/level-up-state.js";
import { getClassProgression, getProgressionLevel } from "../src/config/progression.js";

export const FORMAT = "osp-br23-world-export-v1";
export const CURRENT_VERSION = 5;
export const MIGRATION_IDS = [
  "BR23-001-unit-weight",
  "BR23-002-item-defaults",
  "BR23-003-images",
  "BR23-004-progression",
  "BR23-005-ledgers"
];

const ITEM_FIELDS = [
  "unitWeight", "storedSize", "capacity", "containerSize", "slotCost",
  "lashSlots", "lashAllowedSizes", "blockedTypes", "allowedTypes",
  "allowedSizes", "allowedNames", "allowedContainers", "maxItemSize", "maxItems", "restrictions", "lashable", "lashed", "containerId", "containerSizeRequired", "hideCapacity"
];
const ITEM_TYPES = new Set(["item", "container", "weapon", "armor", "coin", "clothing", "ammunition", "livestock", "vehicle", "treasure", "spell", "ability"]);
const PHYSICAL_TYPES = new Set(["item", "container", "weapon", "armor", "coin", "clothing", "ammunition", "livestock"]);
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const isObject = value => value && typeof value === "object" && !Array.isArray(value);
const pathJoin = (base, key) => `${base}.${key}`;
function validPhysical(value, field) {
  if (value === null || value === "" || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0;
  if (field === "capacity" && isObject(value)) {
    const selected = value.max ?? value.value;
    return (typeof selected === "number" && Number.isFinite(selected) && selected >= 0) || (typeof selected === "string" && selected.trim() !== "" && Number.isFinite(Number(selected)) && Number(selected) >= 0);
  }
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function issue(report, kind, code, message, path, details) {
  report[kind].push({ code, message, ...(path ? { path } : {}), ...(details ? { details } : {}) });
}

function change(report, path, oldValue, newValue, reason) {
  report.changes.push({ path, old: clone(oldValue), new: clone(newValue), reason });
}

function ensureFlags(actor, path, report, reason) {
  if (!own(actor, "flags")) { actor.flags = {}; change(report, `${path}.flags`, undefined, {}, reason); }
  if (!own(actor.flags, "osp-houserules")) { actor.flags["osp-houserules"] = {}; change(report, `${path}.flags.osp-houserules`, undefined, {}, reason); }
  return actor.flags["osp-houserules"];
}

function docs(world) {
  const result = [];
  const array = value => Array.isArray(value) ? value : [];
  for (const [i, actor] of array(world?.actors).entries()) {
    if (!isObject(actor)) continue;
    result.push({ doc: actor, path: `actors[${i}]`, kind: "actor" });
    for (const [j, item] of array(actor.items).entries()) if (isObject(item)) result.push({ doc: item, path: `actors[${i}].items[${j}]`, kind: "item" });
  }
  for (const [i, item] of array(world?.items).entries()) if (isObject(item)) result.push({ doc: item, path: `items[${i}]`, kind: "item" });
  for (const [i, pack] of array(world?.compendiums).entries()) {
    if (!isObject(pack)) continue;
    for (const [j, item] of array(pack.documents).entries()) {
      if (!isObject(item)) continue;
      const kind = pack.documentName === "Actor" ? "actor" : "item";
      result.push({ doc: item, path: `compendiums[${i}].documents[${j}]`, kind });
      if (kind === "actor") for (const [k, embedded] of array(item.items).entries()) if (isObject(embedded)) result.push({ doc: embedded, path: `compendiums[${i}].documents[${j}].items[${k}]`, kind: "item" });
    }
  }
  return result;
}

function validateEnvelope(world, report) {
  if (!isObject(world)) return issue(report, "errors", "invalid-input", "World export must be an object.");
  if (world.format !== FORMAT) issue(report, "errors", "bad-format", `Expected ${FORMAT}.`, "format");
  if (!Number.isInteger(world.migrationVersion)) issue(report, "errors", "bad-version", "migrationVersion must be an integer.", "migrationVersion");
  else if (world.migrationVersion < 0) issue(report, "errors", "negative-version", "migrationVersion cannot be negative.", "migrationVersion");
  else if (world.migrationVersion > CURRENT_VERSION) issue(report, "errors", "future-version", "Future migration version is unsupported.", "migrationVersion");
  if (!Array.isArray(world.migrationHistory)) issue(report, "errors", "bad-history", "migrationHistory must be an array.", "migrationHistory");
  else {
    const seen = new Set();
    for (const id of world.migrationHistory) {
      if (typeof id !== "string" || !MIGRATION_IDS.includes(id)) issue(report, "errors", "unknown-history", "Unknown migration history marker.", "migrationHistory");
      else if (seen.has(id)) issue(report, "errors", "duplicate-history", "Duplicate migration history marker.", "migrationHistory");
      else seen.add(id);
    }
    const expected = MIGRATION_IDS.slice(0, Math.min(world.migrationVersion, CURRENT_VERSION));
    if (JSON.stringify(world.migrationHistory) !== JSON.stringify(expected)) issue(report, "errors", "non-prefix-history", "Migration history must be an ordered prefix.", "migrationHistory");
  }
  if (!isObject(world.source) || world.source.classification !== "synthetic") issue(report, "errors", "bad-source", "Only synthetic offline exports are accepted.", "source");
  for (const key of ["actors", "items", "compendiums", "assetIndex"]) if (!Array.isArray(world[key])) issue(report, "errors", "bad-section", `${key} must be an array.`, key);
  if (!isObject(world.settings)) issue(report, "errors", "bad-settings", "settings must be an object.", "settings");
  const malformedStructure = !Array.isArray(world.actors) || !Array.isArray(world.items) || !Array.isArray(world.compendiums) || !Array.isArray(world.assetIndex) || !isObject(world.settings) || (Array.isArray(world.actors) && world.actors.some(a => !isObject(a) || !Array.isArray(a.items))) || (Array.isArray(world.items) && world.items.some(a => !isObject(a))) || (Array.isArray(world.compendiums) && world.compendiums.some(p => !isObject(p) || !Array.isArray(p.documents) || p.documents.some(d => !isObject(d) || (p.documentName === "Actor" && !Array.isArray(d.items)))));
  if (malformedStructure) { issue(report, "errors", "malformed-structure", "World contains a malformed actor, compendium, or section."); return; }
  const seen = new Map();
  const checkScope = (entries, scope) => { const scoped = new Map(); for (const entry of entries) {
    if (!isObject(entry.doc)) { issue(report, "errors", "malformed-document", "Document must be an object.", entry.path); continue; }
    if (!entry.doc._id || typeof entry.doc._id !== "string") issue(report, "errors", "missing-id", "Documents require a string _id.", entry.path);
    else if (scoped.has(entry.doc._id)) issue(report, "errors", "duplicate-id", "Document _id is duplicated in its owning scope.", entry.path, { first: scoped.get(entry.doc._id) });
    else scoped.set(entry.doc._id, entry.path);
    if (entry.kind === "item" && (!ITEM_TYPES.has(entry.doc.type) || !isObject(entry.doc.system))) issue(report, "errors", "unknown-item-type", "Item has an unknown type or invalid system.", entry.path);
    if (entry.kind === "actor" && !isObject(entry.doc.system)) issue(report, "errors", "malformed-actor-system", "Actor system must be an object.", entry.path);
  } };
  checkScope((world.items || []).map((doc, i) => ({ doc, path: `items[${i}]`, kind: "item" })), "world");
  checkScope((world.actors || []).map((doc, i) => ({ doc, path: `actors[${i}]`, kind: "actor" })), "actors");
  for (const [i, actor] of (world.actors || []).entries()) checkScope((actor.items || []).map((doc, j) => ({ doc, path: `actors[${i}].items[${j}]`, kind: "item" })), `actor:${i}`);
  const packs = new Set();
  for (const [i, pack] of (world.compendiums || []).entries()) {
    if (!isObject(pack) || typeof pack.packId !== "string" || !["Item", "Actor"].includes(pack.documentName) || !Array.isArray(pack.documents)) { issue(report, "errors", "bad-compendium", "Compendium shape is unsupported.", `compendiums[${i}]`); continue; }
    if (packs.has(pack.packId)) issue(report, "errors", "duplicate-pack-id", "Compendium packId is duplicated.", `compendiums[${i}].packId`); packs.add(pack.packId);
    checkScope(pack.documents.map((doc, j) => ({ doc, path: `compendiums[${i}].documents[${j}]`, kind: pack.documentName === "Actor" ? "actor" : "item" })), `pack:${pack.packId}`);
    if (pack.documentName === "Actor") for (const [j, actor] of pack.documents.entries()) checkScope((actor.items || []).map((doc, k) => ({ doc, path: `compendiums[${i}].documents[${j}].items[${k}]`, kind: "item" })), `packActor:${pack.packId}:${j}`);
  }
  for (const { doc: actor, path } of docs(world).filter(entry => entry.kind === "actor")) {
    if (actor.flags !== undefined && !isObject(actor.flags)) issue(report, "errors", "malformed-flags", "Actor flags must be an object.", `${path}.flags`);
    const flags = actor.flags?.["osp-houserules"];
    if (flags !== undefined && !isObject(flags)) issue(report, "errors", "malformed-progression-flags", "System flags must be an object.", `${path}.flags.osp-houserules`);
    for (const [value, statePath] of [[flags?.levelUpState, `${path}.flags.osp-houserules.levelUpState`], [actor.system?.levelUpState, `${path}.system.levelUpState`]]) if (value !== undefined && !isObject(value)) issue(report, "errors", "malformed-progression-flags", "Existing progression state must be an object.", statePath);
  }
}

function itemEntries(world) {
  return docs(world).filter(e => e.kind === "item");
}
function snapshotEntries(world) {
  const result = [];
  const add = (value, path) => { if (isObject(value)) result.push({ doc: value, path, kind: "snapshot" }); };
  for (const { doc: actor, path } of docs(world).filter(entry => entry.kind === "actor")) {
    const flags = actor.flags?.["osp-houserules"] || {};
    for (const [key, ledger] of [["bankLedger", flags.bankLedger], ["storehouse", flags.storehouse]]) for (const [i, entry] of (Array.isArray(ledger?.items) ? ledger.items : []).entries()) if (isObject(entry)) add(entry.itemData, `${path}.flags.osp-houserules.${key}.items[${i}].itemData`);
  }
  for (const [key, ledger] of Object.entries(world.settings || {})) for (const [i, entry] of (Array.isArray(ledger?.items) ? ledger.items : []).entries()) if (isObject(entry)) add(entry.itemData, `settings.${key}.items[${i}].itemData`);
  return result;
}
const transformEntries = world => [...itemEntries(world), ...snapshotEntries(world)];

function migrateWeights(world, report) {
  for (const { doc, path } of transformEntries(world)) {
    if (!PHYSICAL_TYPES.has(doc.type) || !isObject(doc.system)) continue;
    const system = doc.system;
    if (own(system, "weight")) {
      if (own(system, "unitWeight")) {
        issue(report, "warnings", "legacy-weight-preserved", "Legacy weight was preserved because unitWeight already exists.", `${path}.system.weight`);
      } else if ((own(system, "legacyWeightUnits") ? system.legacyWeightUnits : world.source?.legacyWeightUnits) !== "lb") {
        issue(report, "errors", "unsupported-weight-units", "Legacy weight requires legacyWeightUnits:'lb'.", `${path}.system.weight`);
      } else if (!Number.isFinite(system.weight) || system.weight < 0) {
        issue(report, "errors", "invalid-weight", "Legacy weight must be a finite non-negative number.", `${path}.system.weight`);
      } else {
        const old = system.weight; system.unitWeight = old; delete system.weight;
        change(report, `${path}.system.unitWeight`, undefined, old, "BR23-001");
        change(report, `${path}.system.weight`, old, undefined, "BR23-001");
      }
    }
  }
}

function catalogEntries(catalogs) {
  const values = Array.isArray(catalogs) ? catalogs : Object.values(catalogs || {}).flatMap(v => Array.isArray(v) ? v : []);
  return values.filter(v => isObject(v) && typeof v.name === "string" && typeof v.type === "string");
}

function migrateDefaults(world, report, catalogs, baseDefaults = {}) {
  const catalog = new Map();
  for (const value of catalogEntries(catalogs)) { const key = `${value.type}\u0000${value.name}`; if (catalog.has(key)) issue(report, "errors", "duplicate-catalog-entry", "Authoritative catalog has ambiguous duplicate name/type entries.", key); else catalog.set(key, value); }
  for (const { doc, path } of transformEntries(world)) {
    if (!doc.type) continue;
    if (!PHYSICAL_TYPES.has(doc.type)) { issue(report, "warnings", "unsupported-default-type", "No physical defaults were applied to this item type.", path, { type: doc.type }); continue; }
    if ((doc.type === "item" && doc.name === "Backpack") || /^Scabbard, (Large|Medium|Small)$/.test(String(doc.name)) || /^(Coin|Coins|Currency)$/.test(String(doc.name))) issue(report, "errors", "legacy-alias-review", "Legacy name/type conversion requires review and is not performed offline.", path);
    const match = catalog.get(`${doc.type}\u0000${doc.name}`);
    const system = doc.system || (doc.system = {});
    const base = isObject(baseDefaults.base) ? baseDefaults.base : (isObject(baseDefaults[doc.type]) ? baseDefaults[doc.type] : {});
    for (const field of ITEM_FIELDS) {
      if (own(system, field)) {
        if (["unitWeight", "capacity", "storedSize"].includes(field) && !validPhysical(system[field], field)) issue(report, "errors", "malformed-existing-physical", "Existing physical value is malformed and cannot be guessed.", `${path}.system.${field}`);
        if (match && own(match.system, field) && JSON.stringify(system[field]) !== JSON.stringify(match.system[field])) issue(report, "warnings", "catalog-discrepancy", "Existing value differs from authoritative catalog.", `${path}.system.${field}`);
        continue;
      }
      const value = match && own(match.system || {}, field) ? match.system[field] : base[field];
      if (!match && ["unitWeight", "capacity"].includes(field)) continue;
      if (value === undefined) continue;
      if (["capacity", "unitWeight", "storedSize"].includes(field) && !validPhysical(value, field)) {
        issue(report, "errors", "malformed-catalog-value", "Catalog physical value is malformed.", `${path}.system.${field}`); continue;
      }
      system[field] = clone(value); change(report, `${path}.system.${field}`, undefined, value, "BR23-002");
    }
  }
}

function migrateImages(world, report) {
  const assets = new Set(world.assetIndex || []);
  for (const { doc, path } of transformEntries(world)) {
    if (typeof doc.img !== "string") continue;
    const normalized = doc.img.startsWith("/") ? doc.img.slice(1) : doc.img;
    const prefix = "systems/osp-houserules/assets/images/";
    if (!normalized.startsWith(prefix) || !normalized.endsWith(".webp")) continue;
    const target = `systems/osp-houserules/assets/thumbs/images/${normalized.slice(prefix.length, -5)}_thumb.webp`;
    if (!assets.has(target)) issue(report, "errors", "unindexed-image-target", "Image target is absent from assetIndex.", `${path}.img`, { target });
    else if (doc.img !== target) { const old = doc.img; doc.img = target; change(report, `${path}.img`, old, target, "BR23-003"); }
  }
}

function characterLevel(actor, report, path) {
  const characterClass = String(actor.system?.class || "").trim();
  if (characterClass) {
    if (!getClassProgression(characterClass)) { issue(report, "errors", "unknown-character-class", "Character class is not in the runtime progression catalog.", `${path}.system.class`); return null; }
    const xp = Number.parseInt(String(actor.system?.xp ?? 0).replace(/,/g, ""), 10);
    return getProgressionLevel(characterClass, Number.isFinite(xp) ? xp : 0, actor.system?.race || "");
  }
  const stored = Number(actor.system?.level);
  return Number.isSafeInteger(stored) && stored > 0 ? stored : 1;
}

function migrateProgression(world, report) {
  const actors = docs(world).filter(entry => entry.kind === "actor");
  for (const { doc: actor, path } of actors) {
    if (!isObject(actor) || actor.type !== "character") continue;
    if (!isObject(actor.system)) { issue(report, "errors", "malformed-actor-system", "Character system data is malformed; progression baseline is unsafe.", `${path}.system`); continue; }
    ensureFlags(actor, path, report, "BR23-004");
    if (actor.flags["osp-houserules"] !== undefined && !isObject(actor.flags["osp-houserules"])) { issue(report, "errors", "malformed-progression-flags", "Existing progression flags are malformed and were preserved.", `${path}.flags.osp-houserules`); continue; }
    const flags = actor.flags["osp-houserules"];
    const level = characterLevel(actor, report, path); if (level == null) continue;
    const known = flags.lastKnownLevel;
    const existingState = own(flags, "levelUpState") || actor.system?.levelUpState !== undefined;
    if (!existingState && known !== undefined && Number(known) !== level) { issue(report, "errors", "progression-baseline-mismatch", "Existing lastKnownLevel disagrees with the runtime-derived level.", `${path}.flags.osp-houserules.lastKnownLevel`, { expected: level, actual: known }); continue; }
    if (!existingState) { const state = { ...createLevelUpState({ fromLevel: level, targetLevel: level }), status: "complete" }; flags.levelUpState = state; change(report, `${path}.flags.osp-houserules.levelUpState`, undefined, state, "BR23-004"); }
    if (!own(flags, "lastKnownLevel")) { flags.lastKnownLevel = level; change(report, `${path}.flags.osp-houserules.lastKnownLevel`, undefined, level, "BR23-004"); }
  }
}

const CURRENCY = ["gold", "silver", "copper"];
function validCurrency(value) { return isObject(value) && CURRENCY.every(k => Number.isFinite(value[k]) && value[k] >= 0); }
function validLedger(value, storehouse = false) { return isObject(value) && (storehouse || validCurrency(value.currency)) && Array.isArray(value.items) && Array.isArray(value.log); }
function repairLedger(value, path, report, storehouse = false) {
  if (!isObject(value)) { issue(report, "errors", storehouse ? "malformed-storehouse" : "malformed-ledger", "Existing account is malformed.", path); return; }
  if (!storehouse && (!validCurrency(value.currency))) { issue(report, "errors", "missing-monetary-data", "Existing currency must contain finite non-negative gold, silver, and copper balances.", `${path}.currency`); return; }
  for (const key of ["items", "log"]) if (!own(value, key)) {
    const legacy = Object.keys(value).some(k => /entry|itemData|balance|transaction|history/i.test(k));
    if (legacy) issue(report, "errors", "partial-ledger-ambiguous", "Missing ledger fields have legacy data that cannot be inferred safely.", `${path}.${key}`);
    else { value[key] = []; change(report, `${path}.${key}`, undefined, [], "BR23-005"); }
  }
  if (!validLedger(value, storehouse)) issue(report, "errors", storehouse ? "malformed-storehouse" : "malformed-ledger", "Existing account has malformed fields.", path);
}
function migrateLedgers(world, report) {
  const bankDefaults = { currency: { gold: 0, silver: 0, copper: 0 }, items: [], log: [] };
  const storeDefaults = { items: [], log: [] };
  for (const { doc: actor, path } of docs(world).filter(entry => entry.kind === "actor")) {
    if (!isObject(actor)) continue;
    const flags = ensureFlags(actor, path, report, "BR23-005");
    if (flags.pendingInventoryTransaction != null) issue(report, "errors", "pending-inventory-transaction", "Unresolved inventory journal blocks offline migration.", `${path}.flags.osp-houserules.pendingInventoryTransaction`);
    if (!own(flags, "bankLedger")) { flags.bankLedger = clone(bankDefaults); change(report, `${path}.flags.osp-houserules.bankLedger`, undefined, bankDefaults, "BR23-005"); }
    else repairLedger(flags.bankLedger, `${path}.flags.osp-houserules.bankLedger`, report);
    if (!own(flags, "storehouse")) { flags.storehouse = clone(storeDefaults); change(report, `${path}.flags.osp-houserules.storehouse`, undefined, storeDefaults, "BR23-005"); }
    else repairLedger(flags.storehouse, `${path}.flags.osp-houserules.storehouse`, report, true);
  }
  world.settings ||= {};
  if (!own(world.settings, "osp-houserules.partyTreasury")) { world.settings["osp-houserules.partyTreasury"] = clone(bankDefaults); change(report, "settings.osp-houserules.partyTreasury", undefined, bankDefaults, "BR23-005"); }
  else repairLedger(world.settings["osp-houserules.partyTreasury"], "settings.osp-houserules.partyTreasury", report);
  if (!own(world.settings, "osp-houserules.partyStorehouse")) { world.settings["osp-houserules.partyStorehouse"] = clone(storeDefaults); change(report, "settings.osp-houserules.partyStorehouse", undefined, storeDefaults, "BR23-005"); }
  else repairLedger(world.settings["osp-houserules.partyStorehouse"], "settings.osp-houserules.partyStorehouse", report, true);
  if (!own(world.settings, "osp-houserules.inventoryOperationReceipts")) { world.settings["osp-houserules.inventoryOperationReceipts"] = {}; change(report, "settings.osp-houserules.inventoryOperationReceipts", undefined, {}, "BR23-005"); }
  else if (!isObject(world.settings["osp-houserules.inventoryOperationReceipts"])) issue(report, "errors", "malformed-receipts", "Existing receipt map is malformed.", "settings.osp-houserules.inventoryOperationReceipts");
}
function validateAccounts(world, report) {
  for (const { doc: actor, path } of docs(world).filter(entry => entry.kind === "actor")) {
    const flags = actor.flags?.["osp-houserules"] || {};
    if (flags.pendingInventoryTransaction != null) issue(report, "errors", "pending-inventory-transaction", "Unresolved inventory journal blocks offline migration.", `${path}.flags.osp-houserules.pendingInventoryTransaction`);
    if (own(flags, "bankLedger") && !validLedger(flags.bankLedger)) issue(report, "errors", "malformed-ledger", "Existing bank ledger is malformed.", `${path}.flags.osp-houserules.bankLedger`);
    if (own(flags, "storehouse") && !validLedger(flags.storehouse, true)) issue(report, "errors", "malformed-storehouse", "Existing storehouse is malformed.", `${path}.flags.osp-houserules.storehouse`);
  }
  const treasury = world.settings?.["osp-houserules.partyTreasury"]; if (treasury !== undefined && !validLedger(treasury)) issue(report, "errors", "malformed-ledger", "Existing party treasury is malformed.", "settings.osp-houserules.partyTreasury");
  const partyStore = world.settings?.["osp-houserules.partyStorehouse"]; if (partyStore !== undefined && !validLedger(partyStore, true)) issue(report, "errors", "malformed-storehouse", "Existing party storehouse is malformed.", "settings.osp-houserules.partyStorehouse");
  const receipts = world.settings?.["osp-houserules.inventoryOperationReceipts"]; if (receipts !== undefined && !isObject(receipts)) issue(report, "errors", "malformed-receipts", "Existing receipt map is malformed.", "settings.osp-houserules.inventoryOperationReceipts");
}

function validateReferences(world, report) {
  const scopes = new Map();
  const scopeOf = path => {
    if (path.startsWith("items[")) return "world";
    const actor = path.match(/^actors\[(\d+)\]/); if (actor) return actor[0];
    const pack = path.match(/^compendiums\[(\d+)\]/); if (pack && world.compendiums[Number(pack[1])]?.documentName === "Item") return pack[0];
    return path.match(/^compendiums\[(\d+)\]\.documents\[(\d+)\]/)?.[0] || "unknown";
  };
  for (const entry of itemEntries(world)) { const key = scopeOf(entry.path); if (!scopes.has(key)) scopes.set(key, new Map()); scopes.get(key).set(entry.doc._id, entry.doc); }
  for (const { doc, path } of itemEntries(world)) {
    const parent = doc.system?.containerId;
    if (parent == null || parent === "") continue;
    const all = scopes.get(scopeOf(path)) || new Map();
    const parentDoc = all.get(parent);
    const lashed = doc.system?.lashed === true;
    const parentCanStore = parentDoc && (lashed ? (parentDoc.type === "clothing" && Number(parentDoc.system?.lashSlots) > 0 && doc.system?.lashable !== false) : (parentDoc.type === "container" || (parentDoc.type === "clothing" && parentDoc.system?.capacity != null)));
    if (!parentCanStore) issue(report, "errors", "orphan-container-reference", "containerId does not point to an existing storage or lashing parent in the owning scope.", `${path}.system.containerId`);
    const seen = new Set([doc._id]); let current = parent;
    while (current) {
      if (seen.has(current)) { issue(report, "errors", "container-cycle", "Container references form a cycle.", `${path}.system.containerId`); break; }
      seen.add(current); current = all.get(current)?.system?.containerId || null;
    }
  }
}

function validatePhysicalValues(world, report) {
  for (const { doc, path } of itemEntries(world)) {
    const system = doc.system;
    if (!isObject(system)) continue;
    for (const field of ["unitWeight", "capacity", "storedSize"]) if (own(system, field) && !validPhysical(system[field], field)) issue(report, "errors", "malformed-existing-physical", "Existing physical value is malformed and was preserved.", `${path}.system.${field}`);
  }
}

export function summarizeWorld(world) {
  const array = value => Array.isArray(value) ? value : [];
  const documents = docs(world);
  const entries = documents.filter(entry => entry.kind === "item");
  const actors = documents.filter(entry => entry.kind === "actor");
  const without = (value, keys) => Object.fromEntries(Object.entries(isObject(value) ? value : {}).filter(([key]) => !keys.includes(key)).map(([key, item]) => [key, clone(item)]));
  const protectedSystem = value => without(value, [...ITEM_FIELDS, "weight", "legacyWeightUnits"]);
  const records = [...entries, ...snapshotEntries(world || {})].map(({ doc, path }) => ({
    path, id: doc._id ?? null, type: doc.type ?? null, name: doc.name ?? null,
    quantity: clone(doc.system?.quantity ?? null), cost: clone(doc.system?.cost ?? null),
    containerId: doc.system?.containerId ?? null, protectedSystem: protectedSystem(doc.system), flags: clone(doc.flags ?? null)
  }));
  for (const { doc, path } of actors) records.push({ path, id: doc._id, type: doc.type, name: doc.name ?? null,
    hp: clone(doc.system?.hitpoints ?? doc.system?.hp?.value ?? null),
    maxHp: clone(doc.system?.maxhitpoints ?? doc.system?.hp?.max ?? null), xp: clone(doc.system?.xp ?? null),
    system: clone(doc.system ?? null), customFlags: { ...without(doc.flags, ["osp-houserules"]),
      "osp-houserules": without(doc.flags?.["osp-houserules"], ["levelUpState", "lastKnownLevel", "bankLedger", "storehouse"]) }
  });
  const accounts = {};
  const addAccount = (value, path) => {
    if (value === undefined) return;
    if (!isObject(value)) { accounts[path] = clone(value); return; }
    accounts[path] = { ...without(value, ["items"]), items: array(value.items).map(entry => without(entry, ["itemData"])) };
  };
  for (const { doc, path } of actors) for (const key of ["bankLedger", "storehouse"]) addAccount(doc.flags?.["osp-houserules"]?.[key], `${path}.flags.osp-houserules.${key}`);
  for (const key of ["osp-houserules.partyTreasury", "osp-houserules.partyStorehouse"]) addAccount(world?.settings?.[key], `settings.${key}`);
  const number = value => Number(value?.value ?? value) || 0;
  return { actors: array(world?.actors).length, worldItems: array(world?.items).length,
    compendiumDocuments: array(world?.compendiums).reduce((n, pack) => n + array(pack?.documents).length, 0),
    items: entries.length, quantities: entries.reduce((n, entry) => n + number(entry.doc.system?.quantity), 0),
    hp: actors.reduce((n, entry) => n + number(entry.doc.system?.hitpoints ?? entry.doc.system?.hp?.value), 0),
    maxHp: actors.reduce((n, entry) => n + number(entry.doc.system?.maxhitpoints ?? entry.doc.system?.hp?.max), 0),
    xp: actors.reduce((n, entry) => n + number(entry.doc.system?.xp), 0),
    references: entries.filter(entry => entry.doc.system?.containerId != null && entry.doc.system.containerId !== "").length,
    accounts, receipts: clone(world?.settings?.["osp-houserules.inventoryOperationReceipts"] ?? null),
    customSettings: without(world?.settings, ["osp-houserules.partyTreasury", "osp-houserules.partyStorehouse", "osp-houserules.inventoryOperationReceipts"]),
    records: records.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  };
}

export function validateWorldEnvelope(input) {
  const report = { errors: [], warnings: [], changes: [] };
  validateEnvelope(input, report);
  return report.errors;
}

export function migrateWorld(input, { catalogs = [], baseDefaults = {} } = {}) {
  const report = { format: FORMAT, errors: [], warnings: [], changes: [], steps: [], before: summarizeWorld(input || {}), after: null };
  const world = clone(input);
  validateEnvelope(world, report);
  if (!report.errors.length) {
    const history = world.migrationHistory || [];
    const run = (id, fn) => { const before = report.changes.length; fn(); report.steps.push({ id, changes: report.changes.length - before }); };
    if (!history.includes(MIGRATION_IDS[0])) run(MIGRATION_IDS[0], () => migrateWeights(world, report));
    if (!history.includes(MIGRATION_IDS[1])) run(MIGRATION_IDS[1], () => migrateDefaults(world, report, catalogs, baseDefaults));
    if (!history.includes(MIGRATION_IDS[2])) run(MIGRATION_IDS[2], () => migrateImages(world, report));
    if (!history.includes(MIGRATION_IDS[3])) run(MIGRATION_IDS[3], () => migrateProgression(world, report));
    if (!history.includes(MIGRATION_IDS[4])) run(MIGRATION_IDS[4], () => migrateLedgers(world, report));
    validatePhysicalValues(world, report);
    validateAccounts(world, report);
    validateReferences(world, report);
    if (!report.errors.length) {
      const oldVersion = world.migrationVersion; const oldHistory = clone(world.migrationHistory);
      world.migrationVersion = CURRENT_VERSION; world.migrationHistory = [...MIGRATION_IDS];
      if (oldVersion !== CURRENT_VERSION) change(report, "migrationVersion", oldVersion, CURRENT_VERSION, "BR23-marker");
      if (JSON.stringify(oldHistory) !== JSON.stringify(world.migrationHistory)) change(report, "migrationHistory", oldHistory, world.migrationHistory, "BR23-marker");
    }
  }
  report.after = summarizeWorld(world);
  return { world, report };
}

export default migrateWorld;
