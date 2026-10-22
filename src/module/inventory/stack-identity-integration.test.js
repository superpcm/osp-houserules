import { initBankLedgerAuthority } from "./bank-ledger-orchestrator.js";
import { initPartyTreasury } from "./party-treasury.js";
import { initStorehouse } from "./storehouse.js";
import { beforeEach, describe, expect, it } from 'vitest';
import { depositItem, withdrawItem, getLedger } from './bank-ledger-orchestrator.js';
import { requestPartyTreasury, getPartyTreasury } from './party-treasury.js';
import { depositStorehouse, withdrawStorehouse, getPersonalStorehouse, getPartyStorehouse } from './storehouse.js';
import { canStackItems } from './stack-identity.js';
let actor, serial;
const copy = value => structuredClone(value);
function embedded(data) {
  const state = copy(data); state._id ??= `item-${++serial}`;
  const item = { id: state._id, actor, parent: actor, get name() { return state.name; }, get type() { return state.type; }, get system() { return state.system; }, toObject: () => copy(state), update: async changes => { for (const [key, value] of Object.entries(changes)) { const parts = key.split('.'); let target = state; for (const part of parts.slice(0, -1)) target = target[part] ??= {}; target[parts.at(-1)] = copy(value); } return item; }, delete: async () => actor.items.splice(actor.items.indexOf(item), 1) };
  actor.items.push(item); return item;
}
beforeEach(() => {
  serial = 0; const flags = new Map(); const settings = new Map(); const items = []; items.get = id => items.find(item => item.id === id);
  actor = { id: 'hero', type: 'character', name: 'Hero', isOwner: true, items, getFlag: (_scope, key) => flags.get(key), setFlag: async (_scope, key, value) => flags.set(key, copy(value)), createEmbeddedDocuments: async (_type, entries) => entries.map(embedded) };
  const gm = { id: 'gm', isGM: true };
  globalThis.game = { system: { id: 'osp-houserules' }, user: gm, users: Object.assign(new Map([[gm.id, gm]]), { activeGM: gm }), actors: new Map([[actor.id, actor]]), socket: { emit: () => {} }, settings: { get: (_scope, key) => settings.get(key), set: async (_scope, key, value) => settings.set(key, copy(value)) } };
  const hooks = [];
  globalThis.Hooks = { on: (_event, callback) => hooks.push(callback) };
  globalThis.ChatMessage = { create: async data => { const document = { flags: data.flags }; const payload = data.flags?.['osp-houserules']?.inventoryAuthority; const creator = payload?.type === 'result' ? game.users.activeGM.id : game.user.id; for (const callback of hooks) callback(document, {}, creator); return document; } };
  delete globalThis.__ospInventoryChatHook;
  initBankLedgerAuthority(); initPartyTreasury(); initStorehouse();
  globalThis.foundry = { utils: { randomID: () => `random-${++serial}` } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  embedded({ _id: 'chest', type: 'container', name: 'Chest', system: { capacity: 100 } });
});
const families = [
  { name: 'personal bank', treasure: true, ledger: () => getLedger(actor), deposit: (item, qty) => depositItem(actor, item, qty), withdraw: (id, qty) => withdrawItem(actor, id, qty, actor.items.get('chest')) },
  { name: 'Party Treasury', treasure: true, ledger: () => getPartyTreasury(), deposit: (item, qty) => requestPartyTreasury('deposit', { actorId: actor.id, itemId: item.id, quantity: qty }), withdraw: (id, qty) => requestPartyTreasury('withdraw', { actorId: actor.id, entryId: id, quantity: qty, containerId: 'chest' }) },
  ...[false, true].map(shared => ({ name: shared ? 'Party Stores' : 'personal storehouse', treasure: false, ledger: () => shared ? getPartyStorehouse() : getPersonalStorehouse(actor), deposit: (item, qty) => depositStorehouse(actor, item.id, qty, shared), withdraw: (id, qty) => withdrawStorehouse(actor, id, qty, 'chest', shared) }))
];
function data(treasure, variant = 1, unique = false) {
  return { name: treasure ? 'Ruby' : 'Longsword', type: treasure ? 'item' : 'weapon', img: 'custom-image.webp', flags: { 'osp-houserules': { custom: { attunement: 'Hero' } } }, effects: [{ name: 'Custom effect', changes: [{ key: 'system.attack', value: variant }] }], system: { treasure, quantity: 2, containerId: null, equipped: false, lashed: false, storedSize: 1, unitWeight: 1, cost: treasure ? variant * 125 : 10, magicBonus: treasure ? 0 : variant, description: 'Custom description', tags: unique ? ['unique'] : [], customRule: { charges: variant } } };
}
for (const family of families) describe(family.name, () => {
  it('preserves different value/magic/custom snapshots through deposits and withdrawals', async () => {
    const originalA = data(family.treasure, 1), originalB = data(family.treasure, 2);
    const a = embedded(originalA), b = embedded(originalB);
    expect((await family.deposit(a, 1)).success).toBe(true); expect((await family.deposit(b, 1)).success).toBe(true);
    expect(family.ledger().items).toHaveLength(2);
    expect((await family.deposit(a, 1)).success).toBe(true);
    const rows = family.ledger().items; expect(rows.map(row => row.quantity).sort()).toEqual([1, 2]);
    const rowA = rows.find(row => canStackItems(row.itemData, originalA)); const rowB = rows.find(row => canStackItems(row.itemData, originalB));
    const unrelated = embedded({ ...data(family.treasure, 9), system: { ...data(family.treasure, 9).system, quantity: 3, containerId: 'chest' } });
    expect((await family.withdraw(rowA.entryId, 1)).success).toBe(true); expect((await family.withdraw(rowB.entryId, 1)).success).toBe(true);
    expect(unrelated.system.quantity).toBe(3);
    expect((await family.withdraw(rowA.entryId, 1)).success).toBe(true);
    const restored = actor.items.filter(item => item.system.containerId === 'chest' && item.id !== unrelated.id);
    expect(restored).toHaveLength(2);
    const restoredA = restored.find(item => canStackItems(item, originalA)); const restoredB = restored.find(item => canStackItems(item, originalB));
    expect(restoredA.system.quantity).toBe(2); expect(restoredB.system.quantity).toBe(1);
    expect(restoredA.toObject().flags).toEqual(originalA.flags); expect(restoredB.toObject().effects).toEqual(originalB.effects);
    expect(family.ledger().items).toHaveLength(0);
  });
  it('keeps stored withdrawals separate from readied or lashed copies', async () => {
    for (const placement of ['equipped', 'lashed']) {
      const original = data(family.treasure, 1); original.system.quantity = 1;
      const source = embedded(original); expect((await family.deposit(source, 1)).success).toBe(true);
      const row = family.ledger().items[0];
      const worn = embedded({ ...original, system: { ...original.system, quantity: 2, containerId: 'chest', [placement]: true } });
      expect((await family.withdraw(row.entryId, 1)).success).toBe(true);
      expect(worn.system.quantity).toBe(2); expect(worn.system[placement]).toBe(true);
      expect(actor.items.filter(item => item.name === original.name && item.system.containerId === 'chest' && !item.system.equipped && !item.system.lashed).length).toBeGreaterThan(0);
    }
  });
  it('retains legacy row-level uniqueness through withdrawal and redeposit', async () => {
    const original = data(family.treasure, 1); original.system.quantity = 1;
    const source = embedded(original); expect((await family.deposit(source, 1)).success).toBe(true);
    family.ledger().items[0].unique = true;
    const existing = embedded({ ...original, system: { ...original.system, quantity: 2, containerId: 'chest' } });
    const row = family.ledger().items[0]; expect((await family.withdraw(row.entryId, 1)).success).toBe(true);
    const uniqueCopy = actor.items.find(item => item.name === original.name && item.id !== existing.id);
    expect(uniqueCopy.system.tags).toContain('unique'); expect(existing.system.quantity).toBe(2);
    expect((await family.deposit(uniqueCopy, 1)).success).toBe(true);
    expect(family.ledger().items[0].unique).toBe(true);
    expect((await family.withdraw(family.ledger().items[0].entryId, 1)).success).toBe(true);
    expect(existing.system.quantity).toBe(2);
  });
  it('never merges identical unique deposits or withdrawals', async () => {
    const sourceData = data(family.treasure, 1, true); sourceData.system.quantity = 1;
    const first = embedded(sourceData), second = embedded(sourceData);
    expect((await family.deposit(first, 1)).success).toBe(true); expect((await family.deposit(second, 1)).success).toBe(true);
    const rows = family.ledger().items; expect(rows).toHaveLength(2);
    for (const row of rows) expect((await family.withdraw(row.entryId, 1)).success).toBe(true);
    const copies = actor.items.filter(item => item.name === sourceData.name);
    expect(copies).toHaveLength(2); expect(copies.map(item => item.system.quantity)).toEqual([1, 1]);
  });
});

it('preserves legacy uniqueness when transferring from personal bank to Party Treasury', async () => {
  const original = data(true, 1); original.system.quantity = 1;
  const source = embedded(original); expect((await depositItem(actor, source, 1)).success).toBe(true);
  const personal = getLedger(actor); personal.items[0].unique = true;
  const other = embedded(original);
  expect((await requestPartyTreasury('deposit', { actorId: actor.id, itemId: other.id, quantity: 1 })).success).toBe(true);
  expect((await requestPartyTreasury('transfer', { actorId: actor.id, sourceAccount: 'personal', destinationAccount: 'party', payloadType: 'item', entryId: personal.items[0].entryId, quantity: 1 })).success).toBe(true);
  expect(getPartyTreasury().items).toHaveLength(2);
  expect(getPartyTreasury().items.filter(row => row.unique)).toHaveLength(1);
  expect(getLedger(actor).items).toHaveLength(0);
});
