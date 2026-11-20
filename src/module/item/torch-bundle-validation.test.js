import { beforeEach, describe, expect, it, vi } from 'vitest';
let OspItem;
beforeEach(async () => {
  vi.stubGlobal('Item', class { async _preCreate() {} async _preUpdate() {} });
  ({ OspItem } = await import('./item.js'));
});
const make = (protectedState = true, quantity = 6, equipped = false) => {
  const item = new OspItem();
  Object.assign(item, { name: 'Torch', type: 'item', system: { quantity, equipped, storedSize: .75, unitWeight: .5 }, flags: protectedState ? { 'osp-houserules': { protectedTorchBundle: true, keep: 1 } } : {} });
  item.toObject = () => ({ name: item.name, type: item.type, system: structuredClone(item.system), flags: structuredClone(item.flags) });
  return item;
};
describe('direct torch bundle validation', () => {
  it('rejects overfull or equipped bundles on creation', async () => {
    for (const item of [make(true, 7), make(true, 6, true)]) expect(await item._preCreate(item.toObject(), {}, {})).toBe(false);
  });
  it('rejects direct quantity increases beyond six', async () => {
    expect(await make()._preUpdate({ 'system.quantity': 7 }, {}, {})).toBe(false);
  });
  it.each([
    { 'flags.osp-houserules.protectedTorchBundle': true },
    { flags: { 'osp-houserules': { protectedTorchBundle: true } } },
  ])('validates flag activation with dotted or nested edits', async flags => {
    expect(await make(false, 7)._preUpdate(flags, {}, {})).toBe(false);
  });
  it.each([
    { flags: { 'osp-houserules': { otherFlag: 1 } } },
    { 'flags.osp-houserules': { otherFlag: 1 } },
    { 'flags.osp-houserules.otherFlag': 1 },
  ])('preserves protection when unrelated flags change', async flags => {
    const item = make(); const before = item.toObject();
    expect(await item._preUpdate({ ...flags, 'system.equipped': true }, {}, {})).toBe(false);
    expect(item.toObject()).toEqual(before);
  });
  it.each([
    { flags: { 'osp-houserules': { '-=protectedTorchBundle': null } } },
    { 'flags.osp-houserules.-=protectedTorchBundle': null },
    { 'flags.osp-houserules.protectedTorchBundle': false },
  ])('allows explicit unpacking flag removal', async flags => {
    expect(await make()._preUpdate({ ...flags, 'system.equipped': true }, {}, {})).toBeUndefined();
  });
  it('retains unrestricted loose torch quantities', async () => {
    const item = make(false, 99); expect(await item._preCreate(item.toObject(), {}, {})).toBeUndefined();
  });
});
