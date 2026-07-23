import { describe, it, expect } from 'vitest';
import { checkAllowedContainers } from './container-allowlist.js';

function item(name, allowedContainers) {
  return { name, system: { allowedContainers } };
}

describe('checkAllowedContainers', () => {
  it('allows any container when the item has no allowedContainers restriction', () => {
    const result = checkAllowedContainers(item('Dagger', undefined), { name: 'Belt Pouch' });
    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('allows any container when allowedContainers is an empty list', () => {
    const result = checkAllowedContainers(item('Dagger', []), { name: 'Belt Pouch' });
    expect(result.allowed).toBe(true);
  });

  it('allows a container whose name is in the list', () => {
    const result = checkAllowedContainers(item('Zweihander', ['Cart', 'Wagon']), { name: 'Wagon' });
    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('blocks a container not in the list, with a clear message', () => {
    const result = checkAllowedContainers(item('Zweihander', ['Cart', 'Wagon']), { name: 'Backpack' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Zweihander only fits in: Cart, Wagon.');
  });

  it('is case/name-exact — a similarly named container is still blocked', () => {
    const result = checkAllowedContainers(item('Barding, Plate', ['Cart', 'Wagon', 'Sack, Large', 'Panniers']), { name: 'Sack, Small' });
    expect(result.allowed).toBe(false);
  });
});
