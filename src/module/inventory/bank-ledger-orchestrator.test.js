import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  getLedger,
  depositItem,
  withdrawItem,
  depositCurrency,
  withdrawCurrency,
  dmEditCurrency,
  dmAddItem,
  dmRemoveItem,
} from './bank-ledger-orchestrator.js';

beforeAll(() => {
  globalThis.game = { user: { id: 'test-user' } };
});

function applyChanges(obj, changes) {
  for (const [key, value] of Object.entries(changes)) {
    const parts = key.split('.');
    let target = obj;
    for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
    target[parts[parts.length - 1]] = value;
  }
}

function fakeItem(overrides = {}) {
  const data = {
    id: 'item1', name: 'Ruby', type: 'item', img: 'ruby.webp',
    system: { treasure: true, quantity: 1, containerId: 'c1', storedSize: 0.04 },
    ...overrides,
  };
  return {
    get id() { return data.id; },
    get name() { return data.name; },
    get type() { return data.type; },
    get system() { return data.system; },
    toObject: () => structuredClone(data),
    update: vi.fn(async (changes) => { applyChanges(data, changes); }),
    delete: vi.fn(async () => {}),
  };
}

function fakeContainer(overrides = {}) {
  return { id: 'destC', name: 'Backpack', type: 'container', system: { capacity: 16, ...overrides } };
}

function fakeActor(id, items = []) {
  let flagValue;
  return {
    id,
    items,
    getFlag: vi.fn(() => flagValue),
    setFlag: vi.fn(async (_scope, _key, value) => { flagValue = value; }),
    createEmbeddedDocuments: vi.fn(async (_type, data) => data),
  };
}

describe('getLedger', () => {
  it('returns an empty ledger shape when no flag is set', () => {
    const actor = fakeActor('a1');
    expect(getLedger(actor)).toEqual({ currency: { gold: 0, silver: 0, copper: 0 }, items: [], log: [] });
  });
});

describe('depositItem', () => {
  it('deletes the source item on a full-stack deposit and records it in the ledger', async () => {
    const source = fakeItem({ system: { treasure: true, quantity: 1, containerId: 'c1', storedSize: 0.04 } });
    const actor = fakeActor('a1', [source]);

    const plan = await depositItem(actor, source, 1);

    expect(plan.success).toBe(true);
    expect(source.delete).toHaveBeenCalled();
    expect(source.update).not.toHaveBeenCalled();
    expect(actor.setFlag).toHaveBeenCalled();
    expect(getLedger(actor).items).toHaveLength(1);
  });

  it('decrements (not deletes) the source item on a partial deposit', async () => {
    const source = fakeItem({ system: { treasure: true, quantity: 5, containerId: 'c1', storedSize: 0.04 } });
    const actor = fakeActor('a1', [source]);

    const plan = await depositItem(actor, source, 2);

    expect(plan.success).toBe(true);
    expect(source.delete).not.toHaveBeenCalled();
    expect(source.update).toHaveBeenCalledWith({ 'system.quantity': 3 });
  });

  it('rejects a non-treasure item without touching the actor at all', async () => {
    const source = fakeItem({ type: 'weapon', system: { treasure: false, quantity: 1 } });
    const actor = fakeActor('a1', [source]);

    const plan = await depositItem(actor, source, 1);

    expect(plan.success).toBe(false);
    expect(actor.setFlag).not.toHaveBeenCalled();
    expect(source.delete).not.toHaveBeenCalled();
    expect(source.update).not.toHaveBeenCalled();
  });
});

describe('withdrawItem', () => {
  it('creates a new embedded item in the target container on success', async () => {
    const source = fakeItem();
    const actor = fakeActor('a1', [source]);
    await depositItem(actor, source, 1);
    const entryId = getLedger(actor).items[0].entryId;

    const target = fakeContainer();
    actor.items = [target]; // source item is gone from inventory after deposit
    const plan = await withdrawItem(actor, entryId, 1, target);

    expect(plan.success).toBe(true);
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ name: 'Ruby', system: expect.objectContaining({ quantity: 1, containerId: 'destC' }) }),
    ]);
    expect(getLedger(actor).items).toHaveLength(0);
  });

  it('merges into an existing matching stack in the target container instead of creating a new one', async () => {
    const source = fakeItem();
    const actor = fakeActor('a1', [source]);
    await depositItem(actor, source, 1);
    const entryId = getLedger(actor).items[0].entryId;

    const target = fakeContainer();
    const existingStack = fakeItem({ id: 'existing1', system: { treasure: true, quantity: 2, containerId: 'destC', storedSize: 0.04 } });
    actor.items = [target, existingStack];

    const plan = await withdrawItem(actor, entryId, 1, target);

    expect(plan.success).toBe(true);
    expect(existingStack.update).toHaveBeenCalledWith({ 'system.quantity': 3 });
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('fails without any mutation when the target container rejects the item type', async () => {
    const source = fakeItem();
    const actor = fakeActor('a1', [source]);
    await depositItem(actor, source, 1);
    const entryId = getLedger(actor).items[0].entryId;
    const ledgerBefore = getLedger(actor);

    const smallPouch = { id: 'p1', name: 'Belt Pouch (S)', type: 'container', system: { capacity: 4 } };
    actor.items = [smallPouch];
    // Ruby is type:"item" with no matching tag, so it's not actually blocked by the built-in
    // table — use allowedContainers on the snapshot instead to force a type rejection deterministically.
    const restrictedSource = fakeItem({ name: 'Barding', system: { treasure: true, quantity: 1, containerId: 'c1', storedSize: 0.04, allowedContainers: ['Cart'] } });
    const actor2 = fakeActor('a2', [restrictedSource]);
    await depositItem(actor2, restrictedSource, 1);
    const entryId2 = getLedger(actor2).items[0].entryId;
    actor2.items = [fakeContainer()];

    const plan = await withdrawItem(actor2, entryId2, 1, fakeContainer());
    expect(plan.success).toBe(false);
    expect(plan.reasonType).toBe('type');
    expect(actor2.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(getLedger(actor2).items).toHaveLength(1); // unchanged
  });

  it('fails without any mutation when the target container is full', async () => {
    const source = fakeItem();
    const actor = fakeActor('a1', [source]);
    await depositItem(actor, source, 1);
    const entryId = getLedger(actor).items[0].entryId;

    const fullContainer = fakeContainer({ capacity: 0.01 });
    actor.items = [fullContainer];

    const plan = await withdrawItem(actor, entryId, 1, fullContainer);
    expect(plan.success).toBe(false);
    expect(plan.reasonType).toBe('capacity');
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

describe('currency deposit/withdraw', () => {
  it('deposits coins from a live coin item and deletes it on a full-stack deposit', async () => {
    const coin = fakeItem({ name: 'Gold Coins', type: 'coin', system: { quantity: 10, containerId: 'c1' } });
    const actor = fakeActor('a1', [coin]);

    const plan = await depositCurrency(actor, 'gold', 10, coin);

    expect(plan.success).toBe(true);
    expect(coin.delete).toHaveBeenCalled();
    expect(getLedger(actor).currency.gold).toBe(10);
  });

  it('withdraws coins into an empty container by creating a fresh coin stack', async () => {
    const coin = fakeItem({ name: 'Gold Coins', type: 'coin', system: { quantity: 10, containerId: 'c1' } });
    const actor = fakeActor('a1', [coin]);
    await depositCurrency(actor, 'gold', 10, coin);

    const target = fakeContainer();
    actor.items = [target];
    const plan = await withdrawCurrency(actor, 'gold', 4, target);

    expect(plan.success).toBe(true);
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({ name: 'Gold Coins', system: expect.objectContaining({ quantity: 4, containerId: 'destC' }) }),
    ]);
    expect(getLedger(actor).currency.gold).toBe(6);
  });

  it('withdraws coins by merging into an existing coin stack already in the target container', async () => {
    const coin = fakeItem({ name: 'Gold Coins', type: 'coin', system: { quantity: 10, containerId: 'c1' } });
    const actor = fakeActor('a1', [coin]);
    await depositCurrency(actor, 'gold', 10, coin);

    const target = fakeContainer();
    const existingGold = fakeItem({ id: 'g2', name: 'Gold Coins', type: 'coin', system: { quantity: 3, containerId: 'destC' } });
    actor.items = [target, existingGold];

    const plan = await withdrawCurrency(actor, 'gold', 4, target);
    expect(plan.success).toBe(true);
    expect(existingGold.update).toHaveBeenCalledWith({ 'system.quantity': 7 });
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

describe('DM operations bypass container checks', () => {
  it('dmEditCurrency sets an absolute value with no container involved', async () => {
    const actor = fakeActor('a1', []);
    const plan = await dmEditCurrency(actor, 'silver', 42);
    expect(plan.success).toBe(true);
    expect(getLedger(actor).currency.silver).toBe(42);
    expect(getLedger(actor).log.at(-1).action).toBe('dm_edit');
  });

  it('dmAddItem creates a ledger entry with no backing catalog item', async () => {
    const actor = fakeActor('a1', []);
    const plan = await dmAddItem(actor, { name: 'Silver Cup', quantity: 2, unique: false });
    expect(plan.success).toBe(true);
    expect(getLedger(actor).items[0]).toMatchObject({ name: 'Silver Cup', quantity: 2, unique: false });
  });

  it('dmRemoveItem removes quantity from an existing entry without a container check', async () => {
    const actor = fakeActor('a1', []);
    await dmAddItem(actor, { name: 'Silver Cup', quantity: 5, unique: false });
    const entryId = getLedger(actor).items[0].entryId;

    const plan = await dmRemoveItem(actor, entryId, 5);
    expect(plan.success).toBe(true);
    expect(getLedger(actor).items).toHaveLength(0);
  });
});

describe('mutation failure safety — the withdrawCurrency bug this suite now guards against', () => {
  it('withdrawCurrency: if creating the destination coin item throws, the ledger is never debited and the error surfaces as a normal result, not a thrown rejection', async () => {
    const coin = fakeItem({ name: 'Silver Coins', type: 'coin', system: { quantity: 100, containerId: 'c1' } });
    const actor = fakeActor('a1', [coin]);
    await depositCurrency(actor, 'silver', 100, coin);
    expect(getLedger(actor).currency.silver).toBe(100);

    const target = fakeContainer();
    actor.items = [target];
    actor.createEmbeddedDocuments = vi.fn(async () => { throw new Error('simulated create failure'); });

    const plan = await withdrawCurrency(actor, 'silver', 100, target);

    expect(plan.success).toBe(false);
    expect(plan.reason).toMatch(/failed to save|cancelled|ledger/i);
    // The exact bug reported: coins must NOT vanish from the ledger when the destination item
    // never actually got created.
    expect(getLedger(actor).currency.silver).toBe(100);
  });

  it('depositItem: if deleting the source item throws, the ledger is never credited', async () => {
    const source = fakeItem();
    source.delete = vi.fn(async () => { throw new Error('simulated delete failure'); });
    const actor = fakeActor('a1', [source]);

    const plan = await depositItem(actor, source, 1);

    expect(plan.success).toBe(false);
    expect(actor.setFlag).not.toHaveBeenCalled();
    expect(getLedger(actor).items).toHaveLength(0);
  });

  it('withdrawItem: if creating the destination item throws, the ledger entry is left in place instead of being removed', async () => {
    const source = fakeItem();
    const actor = fakeActor('a1', [source]);
    await depositItem(actor, source, 1);
    const entryId = getLedger(actor).items[0].entryId;

    const target = fakeContainer();
    actor.items = [target];
    actor.createEmbeddedDocuments = vi.fn(async () => { throw new Error('simulated create failure'); });

    const plan = await withdrawItem(actor, entryId, 1, target);

    expect(plan.success).toBe(false);
    expect(getLedger(actor).items).toHaveLength(1);
    expect(getLedger(actor).items[0].entryId).toBe(entryId);
  });

  it('surfaces a setFlag failure as a normal result too, after the real item mutation already succeeded', async () => {
    const source = fakeItem();
    const actor = fakeActor('a1', [source]);
    actor.setFlag = vi.fn(async () => { throw new Error('simulated flag write failure'); });

    const plan = await depositItem(actor, source, 1);

    expect(plan.success).toBe(false);
    // The item mutation itself did go through — this is the accepted, visible failure mode
    // (surfaced as an error) rather than a silent one.
    expect(source.delete).toHaveBeenCalled();
  });
});

describe('per-actor lock serialization', () => {
  it('serializes two concurrent deposits of the same-named item into one merged stack, not a lost update', async () => {
    const sourceA = fakeItem({ id: 'itemA', name: 'Ruby', system: { treasure: true, quantity: 1, containerId: 'c1', storedSize: 0.04 } });
    const sourceB = fakeItem({ id: 'itemB', name: 'Ruby', system: { treasure: true, quantity: 1, containerId: 'c2', storedSize: 0.04 } });
    const actor = fakeActor('a1', [sourceA, sourceB]);

    const [planA, planB] = await Promise.all([
      depositItem(actor, sourceA, 1),
      depositItem(actor, sourceB, 1),
    ]);

    expect(planA.success).toBe(true);
    expect(planB.success).toBe(true);
    const ledger = getLedger(actor);
    expect(ledger.items).toHaveLength(1);
    expect(ledger.items[0].quantity).toBe(2);
  });
});
