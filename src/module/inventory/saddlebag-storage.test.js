import { describe, expect, it } from 'vitest';
import { checkWithdrawTarget } from './container-capacity.js';
import { auditSaddleContents, getSaddleStorageRejection } from './saddlebag-storage.js';
const container = name => ({ id: name.replace(/\W/g, ''), name, type: 'container', system: { capacity: name === 'Saddlebags, Small' ? 12 : name === 'Saddlebags, Large' ? 24 : 40 } });
const item = (name, type = 'item', system = {}) => ({ id: `${name}-${Math.random()}`, name, type, system: { storedSize: 1, quantity: 1, ...system } });
describe('saddlebag and pannier storage restrictions', () => {
  it('preserves capacities and rejects clear long, rigid, animal, and tent contents', () => {
    expect(container('Saddlebags, Small').system.capacity).toBe(12); expect(container('Saddlebags, Large').system.capacity).toBe(24); expect(container('Panniers').system.capacity).toBe(40);
    const blocked = [item('Pole, Ten Foot'), item('Shovel'), item('Sling, Staff'), item('Yoke, Ox'), item('Longbow', 'weapon'), item('Shortbow', 'weapon'), item('Javelin', 'weapon'), item('Battle Axe, 2-Handed', 'weapon'), item('Rapier', 'weapon'), item('Longsword +2', 'weapon'), item('Chicken', 'livestock'), item('Tent, 2-person'), item('Tent Poles, 1-person', 'item', { tags: ['tent-poles'] })];
    for (const hostName of ['Saddlebags, Small', 'Saddlebags, Large', 'Panniers']) for (const entry of blocked) expect(checkWithdrawTarget(entry, container(hostName), []).allowed, `${entry.name} -> ${hostName}`).toBe(false);
  });
  it('leaves borderline contents allowed where capacity permits', () => {
    for (const name of ['Arrow', 'Crossbow, Light', 'Instrument', 'Crowbar', 'Barding, Chain mail', 'Shortsword']) {
      const type = name.includes('Crossbow') || name === 'Shortsword' ? 'weapon' : name === 'Arrow' ? 'ammunition' : 'item';
      expect(checkWithdrawTarget(item(name, type, { storedSize: name.includes('Barding') ? 40 : 1 }), container('Panniers'), []).allowed, name).toBe(true);
    }
  });
  it('checks nested wrappers but ignores descendants on an external lash edge', () => {
    const host = container('Saddlebags, Large'); const wrapper = item('Pack Box', 'container', { containerId: host.id, capacity: 8 }); const pole = item('Pole, Ten Foot', 'item', { containerId: wrapper.id });
    expect(checkWithdrawTarget(wrapper, host, [host, wrapper, pole]).allowed).toBe(false);
    const lashed = item('Pole, Ten Foot', 'item', { containerId: host.id, lashed: true }); expect(auditSaddleContents([host, lashed])).toEqual([]); expect(getSaddleStorageRejection(lashed, host, [host, lashed])).toBeTruthy();
  });
  it('keeps existing invalid contents and reports item warnings', () => {
    const host = container('Saddlebags, Small'); const shovel = item('Shovel', 'item', { containerId: host.id }); const before = structuredClone(shovel); const rows = auditSaddleContents([host, shovel]);
    expect(rows).toHaveLength(1); expect(rows[0].item.id).toBe(shovel.id); expect(shovel).toEqual(before);
  });
});
