import { describe, expect, it } from 'vitest';
import { checkWithdrawTarget } from './container-capacity.js';
import { auditSackContents, getSackStorageRejection } from './sack-storage.js';

const sack = name => ({ id: name.toLowerCase().replace(/[^a-z]/g, ''), name, type: 'container', system: { capacity: name === 'Sack, Small' ? 8 : name === 'Sack, Large' ? 24 : 12, blockedTypes: name === 'Sidesack' ? ['slungable', 'sword'] : ['slungable'] } });
const item = (name, type = 'item', extra = {}) => ({ id: `${name}-${Math.random()}`, name, type, ...extra, system: { storedSize: 1, quantity: 1, ...(extra.system || {}) } });

describe('sack-family storage restrictions', () => {
  it('rejects clear long, rigid, animal, and unsplit tent contents in all sacks', () => {
    for (const containerName of ['Sack, Small', 'Sack, Large', 'Sidesack']) {
      const container = sack(containerName);
      for (const entry of [
        item('Pole, Ten Foot'), item('Pole, Ten Foot +1'), item('Shovel'), item('Sling, Staff'),
        item('Yoke, Ox'), item('Battle Axe, 2-Handed +2', 'weapon'), item('Chicken', 'livestock'), item('Tent, 1-person'), item('Tent, 2-person'),
        item('Tent Poles, 1-person', 'item', { system: { tags: ['tent-poles'] } }),
      ]) {
        expect(checkWithdrawTarget(entry, container, []).allowed, `${entry.name} -> ${containerName}`).toBe(false);
        expect(getSackStorageRejection(entry, container, [])).toBeTruthy();
      }
    }
  });

  it('preserves capacities and leaves borderline items allowed', () => {
    expect(sack('Sack, Small').system.capacity).toBe(8);
    expect(sack('Sack, Large').system.capacity).toBe(24);
    expect(sack('Sidesack').system.capacity).toBe(12);
    for (const name of ['Longsword', 'Battle Axe', 'Hand Axe', 'Arrow', 'Instrument', 'Crowbar', 'Armor']) {
      const type = name === 'Longsword' || name.includes('Axe') ? 'weapon' : name === 'Arrow' ? 'ammunition' : name === 'Armor' ? 'armor' : 'item';
      const tags = name === 'Longsword' ? ['sword'] : name.includes('Axe') ? [] : [];
      expect(checkWithdrawTarget(item(name, type, { system: { tags } }), sack('Sack, Large'), []).allowed, name).toBe(true);
    }
  });

  it('does not let a nested container smuggle prohibited contents, but ignores external lash contents', () => {
    const large = sack('Sack, Large');
    const nested = item('Small Box', 'container', { system: { capacity: 8, containerId: large.id } });
    const pole = item('Pole, Ten Foot', 'item', { system: { containerId: nested.id } });
    expect(checkWithdrawTarget(nested, large, [nested, pole]).allowed).toBe(false);
    expect(checkWithdrawTarget(pole, nested, [large, nested]).allowed).toBe(false);
    const movingLashedPole = item('Pole, Ten Foot', 'item', { system: { lashed: true } });
    expect(checkWithdrawTarget(movingLashedPole, nested, [large, nested]).allowed).toBe(false);
    const lashedWrapper = item('Small Box', 'container', { system: { capacity: 8, containerId: large.id, lashed: true } });
    const wrappedPole = item('Pole, Ten Foot', 'item', { system: { containerId: lashedWrapper.id } });
    expect(checkWithdrawTarget(lashedWrapper, large, [large, lashedWrapper, wrappedPole]).allowed).toBe(false);
    const lashedPole = item('Pole, Ten Foot', 'item', { system: { containerId: large.id, lashed: true } });
    expect(auditSackContents([large, lashedPole])).toEqual([]);
  });

  it('audits existing invalid contents without changing them', () => {
    const small = sack('Sack, Small');
    const pole = item('Shovel', 'item', { system: { containerId: small.id } });
    const before = structuredClone(pole);
    const violations = auditSackContents([small, pole]);
    expect(violations).toHaveLength(1);
    expect(violations[0].item.id).toBe(pole.id);
    expect(pole).toEqual(before);
  });
});
