import { beforeEach, describe, expect, it, vi } from 'vitest';

let OspItem;

beforeEach(async () => {
  vi.stubGlobal('Item', class {
    async _preCreate() { return undefined; }
    async _preUpdate() { return undefined; }
  });
  ({ OspItem } = await import('./item.js'));
});

const protectedFlags = {
  'osp-houserules': { protectedArrowBundle: true },
};

const make = ({ quantity = 1, type = 'ammunition', tags = ['arrows'], flags = {} } = {}) => {
  const item = new OspItem();
  Object.assign(item, {
    name: 'Arrows',
    type,
    system: { quantity, tags },
    flags,
    toObject: () => ({ name: item.name, type: item.type, system: { ...item.system }, flags: { ...item.flags } }),
  });
  return item;
};

describe('OspItem protected arrow-bundle guards', () => {
  it('rejects an invalid protected bundle on creation', async () => {
    const item = make({ quantity: 21, flags: protectedFlags });

    await expect(item._preCreate(item.toObject(), {}, {})).resolves.toBe(false);
  });

  it('handles dotted and nested protected-flag activation during updates', async () => {
    const dotted = make({ quantity: 20 });
    const nested = make({ quantity: 21 });

    await expect(dotted._preUpdate({ 'flags.osp-houserules.protectedArrowBundle': true }, {}, {})).resolves.toBeUndefined();
    await expect(nested._preUpdate({ flags: protectedFlags }, {}, {})).resolves.toBe(false);
  });

  it('rejects protected bundles when their type or arrow tag is removed', async () => {
    const typeChange = make({ quantity: 10, flags: protectedFlags });
    const tagChange = make({ quantity: 10, flags: protectedFlags });

    await expect(typeChange._preUpdate({ type: 'item' }, {}, {})).resolves.toBe(false);
    await expect(tagChange._preUpdate({ 'system.tags': [] }, {}, {})).resolves.toBe(false);
  });

  it('allows unrestricted quantities for ordinary unprotected arrows', async () => {
    const item = make({ quantity: 30 });

    await expect(item._preCreate(item.toObject(), {}, {})).resolves.toBeUndefined();
    await expect(item._preUpdate({ 'system.quantity': 30 }, {}, {})).resolves.toBeUndefined();
  });
});
