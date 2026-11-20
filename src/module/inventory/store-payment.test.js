import { describe, expect, it } from 'vitest';
import { carriedFunds, stageStorePayment } from './store-payment.js';

const item = (id, name, quantity, containerId = null, type = name.includes('Coins') ? 'coin' : 'container') => ({ id, name, type, system: { quantity, containerId } });
function actorWith(entries) {
  const items = new Map(entries.map(entry => [entry.id, entry]));
  return {
    items: { get contents() { return [...items.values()]; }, filter: fn => [...items.values()].filter(fn), values: () => items.values() },
    updateEmbeddedDocuments: async (_type, updates) => updates.forEach(update => { const target = items.get(update._id); target.system.quantity = update['system.quantity']; }),
    createEmbeddedDocuments: async (_type, data) => data.forEach((entry, i) => items.set(entry._id ?? `new-${i}`, { ...entry, id: entry._id ?? `new-${i}` })),
  };
}

describe('store payment', () => {
  it('spends copper and silver before gold and leaves exact mixed change', async () => {
    const actor = actorWith([item('purse', 'Coin Purse', 1), item('gold', 'Gold Coins', 1, 'purse'), item('silver', 'Silver Coins', 10, 'purse'), item('copper', 'Copper Coins', 8, 'purse')]);
    await stageStorePayment(actor, 74);
    expect(carriedFunds(actor)).toMatchObject({ gold: 1, silver: 3, copper: 4, totalCp: 134 });

    const second = actorWith([item('purse', 'Coin Purse', 1), item('gold', 'Gold Coins', 1, 'purse'), item('silver', 'Silver Coins', 10, 'purse'), item('copper', 'Copper Coins', 2, 'purse')]);
    await stageStorePayment(second, 74);
    expect(carriedFunds(second)).toMatchObject({ gold: 1, silver: 2, copper: 8, totalCp: 128 });
  });

  it('returns change as coins without increasing a same-named ordinary item', async () => {
    const ordinary = item('ordinary', 'Silver Coins', 1, 'purse', 'item');
    const actor = actorWith([item('purse', 'Coin Purse', 1), item('gold', 'Gold Coins', 1, 'purse'), ordinary]);
    expect((await stageStorePayment(actor, 85)).success).toBe(true);
    expect(ordinary.system.quantity).toBe(1);
    expect(carriedFunds(actor).totalCp).toBe(15);
  });
  it('breaks silver before gold and reconciles every affordable copper price for mixed wallets', async () => {
    for (let gold = 0; gold <= 2; gold++) for (let silver = 0; silver <= 2; silver++) for (let copper = 0; copper <= 2; copper++) {
      const total = gold * 100 + silver * 10 + copper;
      for (let price = 0; price <= total; price++) {
        const actor = actorWith([item('purse', 'Coin Purse', 1), item('gold', 'Gold Coins', gold, 'purse'), item('silver', 'Silver Coins', silver, 'purse'), item('copper', 'Copper Coins', copper, 'purse')]);
        expect((await stageStorePayment(actor, price)).success).toBe(true);
        expect(carriedFunds(actor).totalCp).toBe(total - price);
        expect(actor.items.contents.filter(entry => entry.type === 'coin').every(entry => Number.isSafeInteger(entry.system.quantity) && entry.system.quantity >= 0)).toBe(true);
      }
    }
    const actor = actorWith([item('purse', 'Coin Purse', 1), item('gold', 'Gold Coins', 1, 'purse'), item('silver', 'Silver Coins', 1, 'purse')]);
    await stageStorePayment(actor, 1);
    expect(actor.items.contents.find(entry => entry.id === 'gold').system.quantity).toBe(1);
    expect(carriedFunds(actor).copper).toBe(9);
  });
  it('counts only physically carried valid coins and fails closed on cycles', () => {
    const actor = actorWith([item('purse', 'Coin Purse', 1, null, 'container'), item('gold', 'Gold Coins', 2, 'purse'), item('vehicle', 'Wagon', 1, null, 'vehicle'), item('wagonGold', 'Gold Coins', 20, 'vehicle')]);
    expect(carriedFunds(actor)).toMatchObject({ success: true, gold: 2, totalCp: 200 });
    const cycle = actorWith([item('a', 'Coin Purse', 1, 'b', 'container'), item('b', 'Backpack', 1, 'a', 'container'), item('gold', 'Gold Coins', 1, 'a')]);
    expect(carriedFunds(cycle).success).toBe(false);
  });

  it('spends a larger coin and returns exact silver and copper change', async () => {
    const actor = actorWith([item('purse', 'Coin Purse', 1), item('gold', 'Gold Coins', 1, 'purse')]);
    const result = await stageStorePayment(actor, 85);
    expect(result).toMatchObject({ success: true, change: 15 });
    expect(actor.items.contents.find(entry => entry.id === 'gold').system.quantity).toBe(0);
    expect(actor.items.contents.find(entry => entry.name === 'Silver Coins')?.system.quantity).toBe(1);
    expect(actor.items.contents.find(entry => entry.name === 'Copper Coins')?.system.quantity).toBe(5);
  });
});
