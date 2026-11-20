import { describe, expect, it } from 'vitest';
import {
  auditBackpackContents,
  backpackLashDecision,
  getBackpackStorageRejection,
  isBackpackInternalForbidden,
  isRollableGarment,
} from './long-item-transport.js';
import { getLashSlotCost } from './lash-slot-cost.js';
import { clothingStorageRejection } from './container-allowlist.js';

const backpack = { id: 'bp', name: 'Backpack', type: 'container', system: { capacity: 20, lashSlots: 4 } };
const item = (id, name, extra = {}) => ({ id, name, type: 'item', system: { storedSize: 1, ...extra } });

describe('backpack transport policy', () => {
  it('rejects unsuitable internal contents but permits tent fabric', () => {
    for (const name of ['Shovel', 'Crowbar', 'Instrument', 'Yoke, Ox', 'Tent, 1-person']) {
      const candidate = item(name, name);
      expect(getBackpackStorageRejection(candidate, backpack, [backpack, candidate])).toMatch(/Backpack/);
    }
    const fabric = item('fabric', 'Tent Fabric, 2-person', { tags: ['tent-fabric'] });
    expect(isBackpackInternalForbidden(fabric, backpack, [backpack, fabric])).toBe(false);
    expect(getBackpackStorageRejection(fabric, backpack, [backpack, fabric])).toBeNull();
    const poles = item('poles', 'Tent Poles, 2-person', { tags: ['tent-poles'] });
    expect(getBackpackStorageRejection(poles, backpack, [backpack, poles])).toMatch(/outside/);
  });

  it('rejects livestock and ox yokes from lash points without suggesting lashing', () => {
    for (const candidate of [
      { id: 'livestock', name: 'Horse', type: 'livestock', system: {} },
      item('yoke', 'Yoke, Ox'),
    ]) {
      const decision = backpackLashDecision(candidate, backpack);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).not.toMatch(/lash it externally/i);
    }
  });

  it('audits nested forbidden contents and ignores externally lashed edges without mutation', () => {
    const pouch = { ...item('pouch', 'Sack, Small', { containerId: 'bp', capacity: 2 }), type: 'container' };
    const shovel = item('shovel', 'Shovel', { containerId: 'pouch' });
    const lashed = item('lashed', 'Crowbar', { containerId: 'bp', lashed: true });
    const before = JSON.stringify([backpack, pouch, shovel, lashed]);
    const violations = auditBackpackContents([backpack, pouch, shovel, lashed]);
    expect(violations).toHaveLength(1);
    expect(violations[0].item).toBe(shovel);
    expect(violations[0].container).toBe(pouch);
    expect(JSON.stringify([backpack, pouch, shovel, lashed])).toBe(before);
  });

  it('does not let a nested wrapper smuggle livestock into a backpack', () => {
    const sack = { ...item('sack', 'Sack, Large', { containerId: 'bp' }), type: 'container' };
    const horse = { id: 'horse', name: 'Horse', type: 'livestock', system: { containerId: 'sack' } };
    expect(isBackpackInternalForbidden(sack, backpack, [backpack, sack, horse])).toBe(true);
  });

  it('charges one lash slot per tent-pole bundle quantity', () => {
    const poles = item('poles', 'Tent Poles, 2-person', { tags: ['tent-poles'], quantity: 2 });
    expect(getLashSlotCost(poles, backpack)).toBe(2);
  });

  it('allows an empty unequipped winter coat, including legacy and magic names', () => {
    const coat = item('coat', 'Coat, Winter +1', { equipped: false, lashed: false, slotCost: 0, quantity: 1 });
    expect(backpackLashDecision(coat, backpack, [backpack, coat])).toEqual({ allowed: true, reason: null });
    expect(getLashSlotCost(coat, backpack)).toBe(2);
    expect(getLashSlotCost({ ...coat, system: { ...coat.system, quantity: 2 } }, backpack)).toBe(4);
  });

  it('rejects worn or filled winter coats from lashing', () => {
    const worn = item('coat', 'Coat, Winter', { equipped: true });
    expect(backpackLashDecision(worn, backpack, [backpack, worn]).allowed).toBe(false);
    const coat = item('coat', 'Coat, Winter');
    const nested = item('pocket', 'Sack, Small', { containerId: 'coat' });
    expect(backpackLashDecision(coat, backpack, [backpack, coat, nested]).reason).toMatch(/empty pockets/i);
  });

  it('rejects pocket admission while the coat is lashed', () => {
    const coat = { ...item('coat', 'Coat, Winter', { lashed: true, containerId: 'bp', capacity: 2 }), type: 'clothing' };
    const pocket = { name: "Clothes, Adventurer's", type: 'clothing', system: { capacity: 2 } };
    expect(clothingStorageRejection(item('tinder', 'Tinder Box'), coat)).toMatch(/lashed/i);
    expect(clothingStorageRejection(item('tinder', 'Tinder Box'), pocket)).toBeNull();
  });

  it('allows an empty unequipped Cloak and rejects worn or filled Cloaks', () => {
    const cloak = item('cloak', 'Cloak +2', { equipped: false, lashed: false, slotCost: 2, quantity: 1 });
    expect(isRollableGarment(cloak)).toBe(true);
    expect(backpackLashDecision(cloak, backpack, [backpack, cloak])).toEqual({ allowed: true, reason: null });
    expect(getLashSlotCost(cloak, backpack)).toBe(1);
    expect(getLashSlotCost({ ...cloak, system: { ...cloak.system, quantity: 3 } }, backpack)).toBe(3);
    const worn = item('cloak', 'Cloak', { equipped: true, lashable: false, slotCost: 2 });
    expect(backpackLashDecision(worn, backpack, [backpack, worn]).allowed).toBe(false);
    const pocket = item('pocket', 'Tinder Box', { containerId: 'cloak' });
    expect(backpackLashDecision(cloak, backpack, [backpack, cloak, pocket]).reason).toMatch(/empty pockets/i);
  });
});

it('applies the cloak allowance and its guards even without legacy transport fields',()=>{
 const cloak={id:'cloak',name:'Cloak',type:'clothing',system:{quantity:1,storedSize:4,unitWeight:3}};
 expect(backpackLashDecision(cloak,backpack,[cloak,backpack]).allowed).toBe(true);
 expect(backpackLashDecision({...cloak,system:{...cloak.system,equipped:true}},backpack,[cloak,backpack]).allowed).toBe(false);
 expect(backpackLashDecision(cloak,backpack,[cloak,backpack,item('pocket','Tinder Box',{containerId:'cloak'})]).allowed).toBe(false);
});
