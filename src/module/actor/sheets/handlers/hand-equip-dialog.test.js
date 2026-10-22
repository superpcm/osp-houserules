import { beforeAll, describe, expect, it, vi } from 'vitest';

let ItemHandler;
const dialogs = [];
beforeAll(async () => {
  globalThis.ui = { notifications: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } };
  globalThis.game = { user: { isGM: false }, scenes: { active: null }, settings: { get: () => false } };
  globalThis.foundry = { utils: { duplicate: value => structuredClone(value) } };
  globalThis.Application = class {}; globalThis.Dialog = class {};
  globalThis.TextEditor = { enrichHTML: async value => value };
  vi.mock('../sheet-dialog.js', () => ({ createSheetDialog: (_sheet, options) => {
    dialogs.push(options); return { render: () => {} };
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
  actor.items = { contents: list, filter: fn => list.filter(fn), find: fn => list.find(fn), some: fn => list.some(fn), get: id => list.find(item => item.id === id) };
  actor.createEmbeddedDocuments = async (_type, data) => data.map(value => {
    const item = { ...structuredClone(value), id: `new-${list.length}` };
    item.update = async changes => { for (const [path, value] of Object.entries(changes)) item.system[path.split('.').pop()] = value; };
    list.push(item); return item;
  });
  for (const item of list) {
    item.toObject = () => ({ _id: item.id, name: item.name, type: item.type, img: item.img, system: structuredClone(item.system) });
    item.update = async changes => { for (const [path, value] of Object.entries(changes)) item.system[path.split('.').pop()] = value; return item; };
  }
  return actor;
};
const form = values => ({ find: () => ({ each: callback => Object.entries(values).forEach(([id, value]) => callback(0, { dataset: { handChoiceId: id }, value })) }) });

describe('shared hand disposition dialog', () => {
  it('stows a held sword and splits a consumable only after confirmation', async () => {
    dialogs.length = 0;
    const actor = makeActor([
      entry('sword', 'Longsword', 'weapon', { equipped: true, tags: ['sword'] }),
      entry('wand', 'Wand', 'item', { equipped: true, tags: ['wand'] }),
      entry('scabbard', 'Scabbard, Sword', 'container', { tags: ['scabbard'], capacity: 1 }),
      entry('bag', 'Backpack', 'container', { capacity: 10 }),
      entry('oil', 'Oil Flask', 'weapon', { quantity: 2, tags: ['consumable'], containerId: 'bag' }),
    ]);
    const oil = actor.items.get('oil');
    const handler = new ItemHandler(null, actor, { loadProfileData: async () => ({ classes: [], races: [] }) });
    handler._checkWeaponPermission = async () => ({ allowed: true });
    const pending = handler._showEquipWeaponDialog(oil);
    await Promise.resolve();
    const result = await dialogs[0].buttons.confirm.callback(form({ sword: 'stow:scabbard', wand: 'keep' }));
    expect(result).toBe(true);
    await pending;
    expect(actor.items.get('sword').system.equipped).toBe(false);
    expect(actor.items.get('wand').system.equipped).toBe(true);
    expect(actor.items.get('oil').system.quantity).toBe(1);
    expect(actor.items.contents.some(item => item.name === 'Oil Flask' && item.id !== 'oil')).toBe(true);
  });

  it('cancel leaves every held item and incoming stack unchanged', async () => {
    dialogs.length = 0;
    const actor = makeActor([
      entry('sword', 'Sword', 'weapon', { equipped: true, tags: ['sword'] }),
      entry('wand', 'Wand', 'item', { equipped: true, tags: ['wand'] }),
      entry('oil', 'Oil Flask', 'weapon', { quantity: 2, tags: ['consumable'] }),
    ]);
    const handler = new ItemHandler(null, actor, { loadProfileData: async () => ({ classes: [], races: [] }) });
    const pending = handler._showEquipWeaponDialog(actor.items.get('oil'));
    await Promise.resolve();
    await dialogs[0].buttons.cancel.callback();
    await pending;
    expect(actor.items.get('sword').system.equipped).toBe(true);
    expect(actor.items.get('wand').system.equipped).toBe(true);
    expect(actor.items.get('oil').system.quantity).toBe(2);
  });

  it('rejects a two-handed equip while any held item is kept', async () => {
    dialogs.length = 0;
    const actor = makeActor([
      entry('sword', 'Sword', 'weapon', { equipped: true, tags: ['sword'] }),
      entry('wand', 'Wand', 'item', { equipped: true, tags: ['wand'] }),
      entry('great', 'Greatsword', 'weapon', { tags: ['two-handed'] }),
    ]);
    const handler = new ItemHandler(null, actor, { loadProfileData: async () => ({ classes: [], races: [] }) });
    const pending = handler._showEquipWeaponDialog(actor.items.get('great'));
    await Promise.resolve();
    const result = await dialogs[0].buttons.confirm.callback(form({ sword: 'stow:scabbard', wand: 'keep' }));
    expect(result).toBe(false);
    expect(actor.items.get('sword').system.equipped).toBe(true);
    expect(actor.items.get('great').system.equipped).toBe(false);
    await dialogs[0].buttons.cancel.callback();
    await pending;
  });
});

describe('hand disposition preflight and explicit actions', () => {
  const setup = entries => {
    dialogs.length = 0;
    const actor = makeActor(entries);
    const handler = new ItemHandler(null, actor, { loadProfileData: async () => ({ classes: [], races: [] }) });
    handler._checkWeaponPermission = async () => ({ allowed: true });
    handler._getClassArmorPermissions = async () => ['Any'];
    return { actor, handler };
  };
  it('reserves combined container capacity before moving either held item', async () => {
    const {actor, handler} = setup([
      entry('a', 'Dagger', 'weapon', { equipped: true, size: 'S' }),
      entry('b', 'Wand', 'item', { equipped: true, tags: ['wand'] }),
      entry('bag', 'Bag', 'container', { capacity: 1 }),
      entry('incoming', 'Greatsword', 'weapon', { tags: ['two-handed'], size: 'L' })
    ]);
    const pending = handler._showEquipHandDialog(actor.items.get('incoming'));
    expect(await dialogs[0].buttons.confirm.callback(form({ a: 'stow:bag', b: 'stow:bag' }))).toBe(false);
    expect(actor.items.get('a').system.equipped).toBe(true);
    expect(actor.items.get('b').system.equipped).toBe(true);
    await dialogs[0].buttons.cancel.callback(); await pending;
  });
  it('drops only the selected held item and then equips the incoming item', async () => {
    const {actor, handler} = setup([
      entry('a', 'Dagger', 'weapon', { equipped: true, size: 'S' }),
      entry('b', 'Wand', 'item', { equipped: true, tags: ['wand'] }),
      entry('incoming', 'Holy Water', 'weapon', { tags: ['consumable'], size: 'S' })
    ]);
    const dropped = [];
    handler._dropItem = async item => { dropped.push(item.id); actor.items.contents.splice(actor.items.contents.indexOf(item), 1); return {success:true}; };
    const pending = handler._showEquipHandDialog(actor.items.get('incoming'));
    expect(await dialogs[0].buttons.confirm.callback(form({ a:'drop', b:'keep' }))).toBe(true);
    expect(await pending).toBe(true);
    expect(dropped).toEqual(['a']);
    expect(actor.items.get('incoming').system.equipped).toBe(true);
    expect(actor.items.get('b').system.equipped).toBe(true);
  });
  it('offers a shield backpack lash and applies the chosen mount', async () => {
    const {actor, handler} = setup([
      entry('a', 'Shield', 'armor', { equipped:true, type:'shield' }),
      entry('b', 'Wand', 'item', { equipped:true, tags:['wand'] }),
      entry('pack', 'Backpack', 'container', { lashSlots:1 }),
      entry('incoming', 'Dagger', 'weapon', { size:'S' })
    ]);
    const pending = handler._showEquipHandDialog(actor.items.get('incoming'));
    expect(dialogs[0].content).toContain('Lash to Backpack');
    expect(await dialogs[0].buttons.confirm.callback(form({a:'lash:pack',b:'keep'}))).toBe(true);
    await pending;
    expect(actor.items.get('a').system).toMatchObject({equipped:false,lashed:true,containerId:'pack'});
  });
  it('refuses changed held items without moving anything', async () => {
    const {actor, handler} = setup([
      entry('a','Wand','item',{equipped:true,tags:['wand']}),
      entry('bag','Bag','container',{capacity:10}),
      entry('incoming','Greatsword','weapon',{tags:['two-handed']})
    ]);
    const pending = handler._showEquipHandDialog(actor.items.get('incoming'));
    actor.items.contents.push(entry('new','Dagger','weapon',{equipped:true}));
    expect(await dialogs[0].buttons.confirm.callback(form({a:'stow:bag'}))).toBe(false);
    expect(actor.items.get('a').system.equipped).toBe(true);
    await dialogs[0].buttons.cancel.callback(); await pending;
  });
  it.each([
    ['larger weapon', entry('a','Sword','weapon',{equipped:true,size:'M'}),entry('incoming','Axe','weapon',{size:'M'})],
    ['second shield', entry('a','Shield','armor',{equipped:true,type:'shield'}),entry('incoming','Shield','armor',{type:'shield'})]
  ])('preserves the %s restriction before mutation', async (_label, held, incoming) => {
    const {actor, handler} = setup([held, entry('b','Wand','item',{equipped:true,tags:['wand']}),entry('bag','Bag','container',{capacity:10}),incoming]);
    const pending = handler._showEquipHandDialog(actor.items.get('incoming'));
    expect(await dialogs[0].buttons.confirm.callback(form({a:'keep',b:'stow:bag'}))).toBe(false);
    expect(actor.items.get('b').system.equipped).toBe(true);
    await dialogs[0].buttons.cancel.callback(); await pending;
  });
  it('opens the same dialog for a large hand-carried sack and cancels unchanged', async () => {
    const {actor, handler} = setup([
      entry('a','Wand','item',{equipped:true,tags:['wand']}),
      entry('incoming','Sack, Large','container',{capacity:10})
    ]);
    handler.getItemFromEvent = () => actor.items.get('incoming');
    const pending = handler.onItemToggle({preventDefault(){},stopPropagation(){}});
    expect(dialogs).toHaveLength(1);
    await dialogs[0].buttons.cancel.callback(); await pending;
    expect(actor.items.get('incoming').system.equipped).toBe(false);
    expect(actor.items.get('a').system.equipped).toBe(true);
  });
});

 it('does not offer lashing a non-lashable sword or use a belt attachment as a mount', () => {
    const actor = makeActor([entry('sword','Sword','weapon',{lashable:false}),entry('axe','Axe','weapon',{lashable:true}),entry('belt','Belt','clothing',{equipped:true,lashSlots:3}),entry('purse','Coin Purse','container',{lashable:true,lashSlots:1})]);
    const handler = new ItemHandler(null,actor,{});
    expect(handler._handDispositionOptions(actor.items.get('sword')).filter(option=>option.lashed)).toEqual([]);
    expect(handler._handDispositionOptions(actor.items.get('axe')).filter(option=>option.lashed).map(option=>option.containerId)).toEqual(['belt']);
 });
