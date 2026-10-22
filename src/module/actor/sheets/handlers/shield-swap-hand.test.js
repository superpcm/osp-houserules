import { beforeAll, describe, expect, it, vi } from 'vitest';

let ItemHandler;
const dialogs = [];

beforeAll(async () => {
  globalThis.ui = { notifications: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } };
  globalThis.game = { user: { isGM: false }, scenes: { active: null }, settings: { get: () => false } };
  globalThis.foundry = { utils: { duplicate: value => structuredClone(value) } };
  globalThis.Application = class {};
  globalThis.Dialog = class {};
  globalThis.TextEditor = { enrichHTML: async value => value };
  vi.mock('../sheet-dialog.js', () => ({ createSheetDialog: (_sheet, options) => {
    dialogs.push(options);
    return { render: () => {} };
  } }));
  ({ ItemHandler } = await import('./item-handler.js'));
});

const entry = (id, name, type, system = {}) => ({
  id, _id: id, name, type, img: '',
  system: { quantity: 1, storedSize: 1, tags: [], containerId: null, equipped: false, lashed: false, ...system },
});

const makeActor = entries => {
  const list = entries.map(value => ({ ...structuredClone(value) }));
  const actor = { id: 'actor', type: 'character', system: { class: 'fighter', attributes: { str: { value: 18 } } } };
  actor.items = { contents: list, filter: fn => list.filter(fn), find: fn => list.find(fn), get: id => list.find(item => item.id === id) };
  for (const item of list) item.update = async changes => { for (const [path, value] of Object.entries(changes)) { const parts = path.split('.'); let target = item; while (parts.length > 1) target = target[parts.shift()]; target[parts[0]] = value; } return item; };
  return actor;
};

const formFor = (values) => ({ find: selector => ({ each: callback => {
  for (const [id, value] of Object.entries(values)) callback(0, { dataset: { handChoiceId: id }, value });
} }) });

describe('shield swaps for hand-held non-shields', () => {
  it('stows a wand instead of dropping it', async () => {
    dialogs.length = 0;
    const actor = makeActor([
      entry('sword', 'Sword', 'weapon', { equipped: true }),
      entry('wand', 'Wand', 'item', { equipped: true, tags: ['wand'] }),
      entry('bag', 'Backpack', 'container', { capacity: 10 }),
      entry('shield', 'Shield', 'armor', { type: 'shield' }),
    ]);
    const handler = new ItemHandler(null, actor, { loadProfileData: async () => ({ classes: [], races: [] }) });
    handler._getClassArmorPermissions = async () => ['Any'];
    const shield = actor.items.get('shield');
    const pending = handler._showEquipShieldDialog(shield);
    await Promise.resolve();
    await dialogs[0].buttons.confirm.callback(formFor({ sword: 'keep', wand: 'stow:bag' }));
    await pending;
    expect(actor.items.get('wand').system.equipped).toBe(false);
    expect(actor.items.get('wand').system.containerId).toBe('bag');
    expect(shield.system.equipped).toBe(true);
  });

  it('refuses a wand swap when no container has space', async () => {
    dialogs.length = 0;
    const actor = makeActor([
      entry('sword', 'Sword', 'weapon', { equipped: true }),
      entry('wand', 'Wand', 'item', { equipped: true, tags: ['wand'] }),
      entry('shield', 'Shield', 'armor', { type: 'shield' }),
    ]);
    const handler = new ItemHandler(null, actor, { loadProfileData: async () => ({ classes: [], races: [] }) });
    handler._getClassArmorPermissions = async () => ['Any'];
    const shield = actor.items.get('shield');
    const pending = handler._showEquipShieldDialog(shield);
    await Promise.resolve();
    await dialogs[0].buttons.cancel.callback();
    await pending;
    expect(actor.items.get('wand').system.equipped).toBe(true);
    expect(shield.system.equipped).toBe(false);
  });

  it('stores an unequipped shield in an available wagon when no backpack exists', async () => {
    const actor = makeActor([
      entry('shield', 'Shield', 'armor', { type: 'shield', equipped: true }),
      entry('wagon', 'Wagon', 'container', { capacity: 10, tags: ['vehicle'] }),
    ]);
    const handler = new ItemHandler(null, actor, { loadProfileData: async () => ({ classes: [], races: [] }) });
    const shield = actor.items.get('shield');
    await handler._unequipToBackpack(shield);
    expect(shield.system.equipped).toBe(false);
    expect(shield.system.containerId).toBe('wagon');
  });

  it('leaves a shield equipped when no legal storage exists', async () => {
    const actor = makeActor([entry('shield', 'Shield', 'armor', { type: 'shield', equipped: true })]);
    const handler = new ItemHandler(null, actor, { loadProfileData: async () => ({ classes: [], races: [] }) });
    let dialogShown = false;
    handler._showArmorNoStorageDialog = async () => { dialogShown = true; };
    const shield = actor.items.get('shield');
    await handler._unequipToBackpack(shield);
    expect(dialogShown).toBe(true);
    expect(shield.system.equipped).toBe(true);
    expect(shield.system.containerId).toBeNull();
  });
});
