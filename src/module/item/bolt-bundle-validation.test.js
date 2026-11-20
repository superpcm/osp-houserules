import { beforeEach, describe, expect, it, vi } from 'vitest';

let OspItem;
beforeEach(async () => {
  vi.stubGlobal('Item', class { async _preCreate() {} async _preUpdate() {} });
  ({ OspItem } = await import('./item.js'));
});

const flags = { 'osp-houserules': { protectedBoltBundle: true } };
const make = ({ quantity = 20, type = 'ammunition', tags = ['bolts'], itemFlags = flags } = {}) => {
  const item = new OspItem();
  Object.assign(item, { name: 'Crossbow Bolt, Light', type, system: { quantity, tags }, flags: itemFlags,
    toObject: () => ({ name: item.name, type: item.type, system: { ...item.system }, flags: { ...item.flags } }) });
  return item;
};

describe('OspItem protected bolt-bundle guards', () => {
  it('rejects quantity above twenty on creation', async () => {
    await expect(make({ quantity: 21 })._preCreate(make({ quantity: 21 }).toObject(), {}, {})).resolves.toBe(false);
  });
  it('handles dotted and nested flag activation on update', async () => {
    const dotted = make({ itemFlags: {} });
    const nested = make({ quantity: 21, itemFlags: {} });
    await expect(dotted._preUpdate({ 'flags.osp-houserules.protectedBoltBundle': true }, {}, {})).resolves.toBeUndefined();
    await expect(nested._preUpdate({ flags }, {}, {})).resolves.toBe(false);
  });
  it('rejects protected bolts when type or tag is removed', async () => {
    await expect(make()._preUpdate({ type: 'item' }, {}, {})).resolves.toBe(false);
    await expect(make()._preUpdate({ 'system.tags': [] }, {}, {})).resolves.toBe(false);
  });
});
