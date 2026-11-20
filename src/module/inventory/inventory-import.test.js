import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { INVENTORY_CATEGORIES, applyInventoryPlan, buildInventoryPlan, cloneItemData, loadBundledInventory } from './inventory-import.js';

beforeEach(() => {
  let nextFolder = 0;
  vi.stubGlobal('Folder', { create: vi.fn(async data => {
    const folder = { ...data, id: `test-folder-${nextFolder++}` };
    globalThis.game?.folders?.push(folder);
    return folder;
  }) });
});
const item = (name, type = 'item') => ({ name, type, system: { custom: true } });

describe('inventory importer', () => {
  it('loads all bundled categories', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => [item('A')] }));
    const groups = await loadBundledInventory({ fetchImpl, systemId: 'osp-houserules' });
    expect(Object.keys(groups)).toEqual(INVENTORY_CATEGORIES);
    expect(fetchImpl).toHaveBeenCalledTimes(INVENTORY_CATEGORIES.length);
  });
  it('plans every category and reports duplicates as invalid', () => {
    const groups = Object.fromEntries(INVENTORY_CATEGORIES.map(category => [category, [item(`${category}-item`)]]));
    groups.archive.push(item('archive-item'));
    const plan = buildInventoryPlan(groups, [], ['item']);
    expect(Object.keys(plan.categories)).toEqual(INVENTORY_CATEGORIES);
    expect(plan.total).toBe(12); expect(plan.duplicates).toHaveLength(1); expect(plan.invalid).toHaveLength(0);
  });
  it('previews missing and existing without mutating', () => {
    const plan = buildInventoryPlan({ ammunition: [item('Arrow', 'ammunition')], archive: [], armor: [], clothing: [], gear: [], livestock: [], misc: [], tack: [], treasure: [], vehicles: [], weapons: [] }, [item('Arrow', 'ammunition')], ['ammunition']);
    expect(plan.missing).toHaveLength(0); expect(plan.existing).toHaveLength(1);
  });
  it('preserves existing customization and skips late duplicates', async () => {
    const existing = item('Lantern'); existing.system.custom = 'keep';
    const planned = buildInventoryPlan({ ammunition: [], archive: [], armor: [], clothing: [], gear: [item('Lantern')], livestock: [], misc: [], tack: [], treasure: [], vehicles: [], weapons: [] }, [], ['item']);
    const createItem = vi.fn();
    const result = await applyInventoryPlan(planned, { worldItems: [existing], createItem, isGM: () => true });
    expect(result.created).toHaveLength(0); expect(createItem).not.toHaveBeenCalled(); expect(existing.system.custom).toBe('keep');
  });
  it('rechecks and handles create failures', async () => {
    const planned = buildInventoryPlan({ ammunition: [], archive: [], armor: [], clothing: [], gear: [item('Lantern'), item('Rope')], livestock: [], misc: [], tack: [], treasure: [], vehicles: [], weapons: [] }, [], ['item']);
    let calls = 0;
    const result = await applyInventoryPlan(planned, { createItem: async () => { calls += 1; if (calls === 1) throw new Error('fail'); return item('Rope'); }, isGM: () => true });
    expect(result.errors).toHaveLength(1); expect(result.created).toHaveLength(1);
  });
  it('skips an item added after preview without creating it', async () => {
    const planned = buildInventoryPlan({ ammunition: [], archive: [], armor: [], clothing: [], gear: [item('Lantern'), item('Rope')], livestock: [], misc: [], tack: [], treasure: [], vehicles: [], weapons: [] }, [], ['item']);
    let world = [];
    const createItem = vi.fn(async data => { world.push(data); return data; });
    const result = await applyInventoryPlan(planned, { getWorldItems: async () => world, createItem, isGM: () => true });
    expect(result.created).toHaveLength(2);
    world = [item('Lantern'), ...world];
    const rerun = await applyInventoryPlan(planned, { getWorldItems: async () => world, createItem, isGM: () => true });
    expect(rerun.created).toHaveLength(0); expect(rerun.skipped).toHaveLength(2);
  });
  it('rejects a non-GM apply before writing', async () => {
    const planned = buildInventoryPlan({ ammunition: [], archive: [], armor: [], clothing: [], gear: [item('Lantern')], livestock: [], misc: [], tack: [], treasure: [], vehicles: [], weapons: [] }, [], ['item']);
    const createItem = vi.fn();
    await expect(applyInventoryPlan(planned, { createItem, isGM: () => false })).rejects.toThrow('active GM');
    expect(createItem).not.toHaveBeenCalled();
  });
  it('strips document metadata and keeps item data', () => {
    const copy = cloneItemData({ name: 'A', type: 'item', _id: 'x', ownership: {}, system: { a: 1 } });
    expect(copy).toEqual({ name: 'A', type: 'item', system: { a: 1 } });
  });
});

const realGroups = () => Object.fromEntries(INVENTORY_CATEGORIES.map(category => [category,
  JSON.parse(readFileSync(new URL(`../../../data/${category}.json`, import.meta.url), 'utf8'))]));
const validTypes = ['ammunition', 'weapon', 'armor', 'item', 'container', 'clothing', 'coin', 'livestock'];
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('imports the 200 real bundled records once and preserves every customized existing record', async () => {
  const groups = realGroups();
  expect(groups.vehicles).toHaveLength(6);
  expect(groups.vehicles.map(entry => entry.name)).toEqual(['Cart', 'Wagon', 'Wheelbarrow', 'Handcart', 'Wagon, Open', 'Wagon, Heavy Freight']);
  const original = structuredClone(groups.weapons[0]);
  original._id = 'custom-id'; original.folder = 'custom-folder'; original.img = 'custom.webp'; original.flags = { custom: { note: 'keep' } };
  original.effects = [{ name: 'Custom effect' }]; original.system.cost = 999;
  const snapshot = structuredClone(original);
  const world = [original];
  const plan = buildInventoryPlan(groups, world, validTypes);
  expect(plan.total).toBe(200); expect(plan.missing).toHaveLength(199); expect(plan.existing).toHaveLength(1);
  expect(plan.invalid).toHaveLength(0); expect(plan.duplicates).toHaveLength(0);
  groups.gear[0].system.cost = 'modified after preview';
  const createItem = vi.fn(async data => { world.push(data); return data; });
  const result = await applyInventoryPlan(plan, { getWorldItems: () => world, createItem, isGM: () => true });
  expect(result.created).toHaveLength(199); expect(result.errors).toHaveLength(0);
  expect(original).toEqual(snapshot);
  expect(world.find(entry => entry.name === groups.gear[0].name).system.cost).not.toBe('modified after preview');
  const rerun = buildInventoryPlan(realGroups(), world, validTypes);
  expect(rerun.missing).toHaveLength(0); expect(rerun.existing).toHaveLength(200);
});

it('skips a late addition between sequential creations', async () => {
  const world = [];
  const plan = buildInventoryPlan({ gear: [item('First'), item('Late')] }, world, ['item']);
  const createItem = vi.fn(async data => { world.push(data, item('Late')); return data; });
  const result = await applyInventoryPlan(plan, { getWorldItems: () => world, createItem, isGM: () => true });
  expect(createItem).toHaveBeenCalledTimes(1); expect(result.skipped).toHaveLength(1);
});

it('reports fetch and schema failures before creating a plan', async () => {
  await expect(loadBundledInventory({ fetchImpl: async () => ({ ok: false }) })).rejects.toThrow('ammunition');
  await expect(loadBundledInventory({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) })).rejects.toThrow('expected an array');
});

it('reports a cancelled/null creation as failure', async () => {
  const result = await applyInventoryPlan(buildInventoryPlan({ gear: [item('A')] }, [], ['item']), {
    createItem: async () => null, isGM: () => true
  });
  expect(result.created).toHaveLength(0); expect(result.errors).toHaveLength(1);
});

async function uiHarness(groups, world = [], folders = []) {
  const notifications = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const dialogs = [];
  const disabled = new Map();
  vi.stubGlobal('game', { user: { isGM: true }, system: { id: 'osp-houserules', documentTypes: { Item: validTypes } }, items: world, folders });
  vi.stubGlobal('ui', { notifications });
  vi.stubGlobal('fetch', vi.fn(async url => ({ ok: true, json: async () => groups[url.split('/').pop().replace('.json', '')] ?? [] })));
  vi.stubGlobal('Item', { create: vi.fn(async data => { world.push(data); return data; }) });
  vi.stubGlobal('Dialog', class {
    constructor(options) { this.options = options; dialogs.push(this); }
    render() { this.options.render({ find: selector => ({ prop: (key, value) => disabled.set(selector, { key, value }) }) }); return this; }
    async close() { this.options.close(); }
  });
  const { openInventoryImport } = await import('./inventory-import-ui.js');
  return { openInventoryImport, dialogs, disabled, notifications };
}

it('opens one preview, cancels without writes, and supports Foundry array item types', async () => {
  const h = await uiHarness(realGroups());
  const opened = h.openInventoryImport();
  await vi.waitFor(() => expect(h.dialogs).toHaveLength(1));
  expect(h.dialogs[0].options.content).toContain('200');
  expect(Item.create).not.toHaveBeenCalled();
  await h.openInventoryImport();
  expect(h.dialogs).toHaveLength(1);
  await h.dialogs[0].close(); await opened;
  expect(Item.create).not.toHaveBeenCalled();
});

it('disables import with zero missing or invalid entries', async () => {
  for (const groups of [{}, { gear: [item('Unknown', 'bad-type')] }, { gear: [item('A'), item('A')] }]) {
    const h = await uiHarness(groups);
    const opened = h.openInventoryImport();
    await vi.waitFor(() => expect(h.dialogs).toHaveLength(1));
    expect(h.disabled.get('button[data-button="import"]')).toEqual({ key: 'disabled', value: true });
    await h.dialogs[0].options.buttons.import.callback();
    expect(Item.create).not.toHaveBeenCalled();
    await h.dialogs[0].close(); await opened;
    vi.resetModules();
  }
});

it('guards repeated submissions and reopens during an import, then closes after completion', async () => {
  const h = await uiHarness({ gear: [item('A')] });
  let finish;
  Item.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const opened = h.openInventoryImport();
  await vi.waitFor(() => expect(h.dialogs).toHaveLength(1));
  const applying = h.dialogs[0].options.buttons.import.callback();
  await vi.waitFor(() => expect(Item.create).toHaveBeenCalledTimes(1));
  await h.dialogs[0].options.buttons.import.callback(); await h.openInventoryImport();
  expect(Item.create).toHaveBeenCalledTimes(1); expect(h.dialogs).toHaveLength(1);
  finish(item('A')); await applying; await opened;
  expect(h.notifications.info).toHaveBeenLastCalledWith(expect.stringContaining('1 created'));
});

it('maps catalog entries to deterministic destination folders', () => {
  const groups = { vehicles: [item('Horse', 'livestock')], tack: [item('Saddle', 'item')], treasure: [item('Gem', 'item')], gear: [item('Sword', 'weapon'), item('Oil Flask', 'weapon')], armor: [item('Mail', 'armor')], ammunition: [item('Arrow', 'ammunition')], clothing: [item('Cloak', 'clothing')], livestock: [item('Mule', 'livestock')], misc: [item('Chest', 'container')], archive: [item('Journal', 'clothing')] };
  const plan = buildInventoryPlan(groups, [], validTypes, []);
  expect(new Set(plan.missing.map(entry => entry.folderName))).toEqual(new Set(['Vehicles', 'Tack & Harness', 'Treasure', 'Weapons', 'Armor', 'Ammunition', 'Clothing', 'Livestock', 'Containers & Storage']));
});

it('reuses only one top-level Item folder and blocks ambiguity', () => {
  const groups = { gear: [item('Sword', 'weapon')] };
  const one = buildInventoryPlan(groups, [], validTypes, [{ id: 'w', name: 'Weapons', type: 'Item', folder: null }, { id: 'actor', name: 'Weapons', type: 'Actor', folder: null }]);
  expect(one.folderSummary[0]).toMatchObject({ reused: true, folderId: 'w' });
  const many = buildInventoryPlan(groups, [], validTypes, [{ id: 'a', name: 'Weapons', type: 'Item' }, { id: 'b', name: ' weapons ', type: 'Item' }]);
  expect(many.folderAmbiguities).toHaveLength(1);
});

it('moves root items with a folder-only update and leaves custom folders alone', async () => {
  const existing = { ...item('Sword', 'weapon'), _id: 's1', folder: null, img: 'custom.png', system: { cost: 99 }, flags: { custom: true } };
  const custom = { ...item('Cloak', 'clothing'), _id: 'c1', folder: 'custom-folder', system: { cost: 7 } };
  const world = [existing, custom];
  const plan = buildInventoryPlan({ gear: [item('Sword', 'weapon')], clothing: [item('Cloak', 'clothing')] }, world, validTypes, [{ id: 'w', name: 'Weapons', type: 'Item' }]);
  const updateItem = vi.fn(async (doc, data) => Object.assign(doc, data));
  await applyInventoryPlan(plan, { worldItems: world, folders: [{ id: 'w', name: 'Weapons', type: 'Item' }], updateItem, isGM: () => true });
  expect(updateItem).toHaveBeenCalledWith(existing, { folder: 'w' }); expect(updateItem).toHaveBeenCalledTimes(1);
  expect(existing.img).toBe('custom.png'); expect(existing.system).toEqual({ cost: 99 }); expect(custom.folder).toBe('custom-folder');
});

it('creates missing items directly in lazily-created folders and is idempotent', async () => {
  const world = [], folders = [];
  const createFolder = vi.fn(async name => { const folder = { id: `f${folders.length}`, name, type: 'Item' }; folders.push(folder); return folder; });
  const createItem = vi.fn(async data => { const made = { ...data, _id: `i${world.length}` }; world.push(made); return made; });
  const groups = { gear: [item('Sword', 'weapon')] };
  const plan = buildInventoryPlan(groups, world, validTypes, folders);
  const first = await applyInventoryPlan(plan, { worldItems: world, folders, createFolder, createItem, isGM: () => true });
  expect(createFolder).toHaveBeenCalledWith('Weapons'); expect(createItem.mock.calls[0][0].folder).toBe('f0');
  const rerun = buildInventoryPlan(groups, world, validTypes, folders);
  const second = await applyInventoryPlan(rerun, { worldItems: world, folders, createFolder, createItem, isGM: () => true });
  expect(first.created).toHaveLength(1); expect(second.created).toHaveLength(0); expect(second.organized).toHaveLength(0); expect(createFolder).toHaveBeenCalledTimes(1);
});

const folderOptions = (world, folders = []) => ({
  getWorldItems: () => world, getFolders: () => folders, isGM: () => true,
  createFolder: vi.fn(async name => { const made = { id: `folder-${folders.length}`, name, type: 'Item' }; folders.push(made); return made; }),
  updateItem: vi.fn(async (doc, patch) => Object.assign(doc, patch)),
  createItem: vi.fn(async data => { const made = { ...data, id: `new-${world.length}` }; world.push(made); return made; })
});

it('organizes all 197 real items by stable IDs with only folder changes and no duplicate folders', async () => {
  const groups = realGroups();
  const world = Object.values(groups).flat().map((data, n) => ({ ...structuredClone(data), ...(n % 2 ? { id: `world-${n}` } : { _id: `world-${n}` }), folder: null, flags: { custom: { note: `keep-${n}` } }, effects: [{ name: `custom effect ${n}` }] }));
  const personal = { ...item('Personal Satchel', 'container'), id: 'personal', folder: null };
  world.push(personal);
  const before = structuredClone(world);
  const folders = [], options = folderOptions(world, folders);
  const plan = buildInventoryPlan(groups, world, validTypes, folders);
  expect(plan.missing).toHaveLength(0); expect(plan.toOrganize).toHaveLength(200);
  const result = await applyInventoryPlan(plan, options);
  expect(result.organized).toHaveLength(200); expect(result.skippedCount).toBe(0); expect(result.errors).toHaveLength(0);
  expect(result.folderCreated).toHaveLength(10); expect(result.folderReused).toHaveLength(0);
  const counts = Object.fromEntries(folders.map(folder => [folder.name, world.filter(doc => doc.folder === folder.id).length]));
  expect(counts).toEqual({ 'Adventuring Gear': 49, Ammunition: 5, Armor: 18, Clothing: 12, 'Containers & Storage': 23, Livestock: 14, 'Tack & Harness': 15, Treasure: 20, Vehicles: 6, Weapons: 38 });
  expect(world.map(({ folder, ...data }) => data)).toEqual(before.map(({ folder, ...data }) => data));
  expect(personal.folder).toBeNull();
  expect(options.updateItem).toHaveBeenCalledTimes(200);
  for (const [, patch] of options.updateItem.mock.calls) expect(Object.keys(patch)).toEqual(['folder']);
  const again = await applyInventoryPlan(buildInventoryPlan(groups, world, validTypes, folders), options);
  expect(again.organized).toHaveLength(0); expect(again.created).toHaveLength(0); expect(again.skippedCount).toBe(200);
  expect(options.createFolder).toHaveBeenCalledTimes(10); expect(options.updateItem).toHaveBeenCalledTimes(200);
});

it('organizes duplicate world matches and never matches unrelated undefined IDs', async () => {
  const world = [{ ...item('Sword', 'weapon'), id: 'a' }, { ...item('Arrow', 'ammunition'), _id: 'b' }, { ...item('Cloak', 'clothing'), id: 'c' }, { ...item('Sword', 'weapon'), _id: 'd' }];
  const options = folderOptions(world);
  const plan = buildInventoryPlan({ weapons: [item('Sword', 'weapon')], ammunition: [item('Arrow', 'ammunition')], clothing: [item('Cloak', 'clothing')] }, world, validTypes);
  expect(plan.toOrganize).toHaveLength(4);
  const result = await applyInventoryPlan(plan, options);
  expect(result.organized.map(doc => doc.id ?? doc._id).sort()).toEqual(['a', 'b', 'c', 'd']);
  expect(new Set(options.updateItem.mock.calls.map(([doc]) => doc.id ?? doc._id)).size).toBe(4);
});

it.each(['folder', 'rename', 'delete'])('skips root items changed after preview: %s', async change => {
  const doc = { ...item('Lantern'), id: 'lantern', folder: null };
  const world = [doc], options = folderOptions(world);
  const plan = buildInventoryPlan({ gear: [item('Lantern')] }, world, validTypes);
  if (change === 'folder') doc.folder = 'user-folder';
  if (change === 'rename') doc.name = 'Custom Lantern';
  if (change === 'delete') world.splice(0);
  const result = await applyInventoryPlan(plan, options);
  expect(result.skipped).toHaveLength(1); expect(result.organized).toHaveLength(0);
  expect(options.createFolder).not.toHaveBeenCalled(); expect(options.updateItem).not.toHaveBeenCalled();
});

it.each(['folder', 'rename', 'delete'])('rechecks a root item changed during folder creation: %s', async change => {
  const doc = { ...item('Lantern'), id: 'lantern', folder: null };
  const world = [doc], options = folderOptions(world);
  const plan = buildInventoryPlan({ gear: [item('Lantern')] }, world, validTypes);
  options.createFolder.mockImplementation(async name => {
    if (change === 'folder') doc.folder = 'user-folder';
    if (change === 'rename') doc.name = 'Custom Lantern';
    if (change === 'delete') world.splice(0);
    return { id: 'new-folder', name, type: 'Item' };
  });
  const result = await applyInventoryPlan(plan, options);
  expect(result.skipped).toHaveLength(1); expect(options.updateItem).not.toHaveBeenCalled();
});

it('skips a newly existing customized item added while its folder is being resolved', async () => {
  const world = [], options = folderOptions(world);
  const late = { ...item('Lantern'), id: 'late', img: 'custom.webp', folder: null };
  const plan = buildInventoryPlan({ gear: [item('Lantern')] }, world, validTypes);
  options.createFolder.mockImplementation(async name => { world.push(late); return { id: 'new-folder', name, type: 'Item' }; });
  const result = await applyInventoryPlan(plan, options);
  expect(result.skipped).toHaveLength(1); expect(options.createItem).not.toHaveBeenCalled(); expect(options.updateItem).not.toHaveBeenCalled();
  expect(late).toMatchObject({ img: 'custom.webp', folder: null });
});

it('reuses late-created root Item folders and ignores Actor or nested folders', async () => {
  const world = [], folders = [{ id: 'actor', name: 'Weapons', type: 'Actor' }, { id: 'nested', name: 'Weapons', type: 'Item', folder: 'parent' }];
  const plan = buildInventoryPlan({ weapons: [item('Sword', 'weapon')] }, world, validTypes, folders);
  expect(plan.folderSummary[0].create).toBe(true);
  folders.push({ id: 'root', name: ' weapons ', type: 'Item' });
  const options = folderOptions(world, folders), result = await applyInventoryPlan(plan, options);
  expect(options.createFolder).not.toHaveBeenCalled(); expect(result.folderReused).toHaveLength(1);
  expect(options.createItem.mock.calls[0][0].folder).toBe('root');
});

it('blocks ambiguous destination folders without any mutations', async () => {
  const world = [], folders = [{ id: 'a', name: 'Weapons', type: 'Item' }, { id: 'b', name: 'weapons', type: 'Item' }];
  const options = folderOptions(world, folders);
  await expect(applyInventoryPlan(buildInventoryPlan({ weapons: [item('Sword', 'weapon')] }, world, validTypes, folders), options)).rejects.toThrow('duplicate destination');
  expect(options.createFolder).not.toHaveBeenCalled(); expect(options.createItem).not.toHaveBeenCalled(); expect(options.updateItem).not.toHaveBeenCalled();
});

it('reports folder creation and folder-only update failures for safe retry', async () => {
  const world = [{ ...item('Lantern'), id: 'lantern', folder: null }], folders = [];
  const options = folderOptions(world, folders), groups = { gear: [item('Lantern')] };
  options.createFolder.mockRejectedValueOnce(new Error('Folder save failed'));
  const first = await applyInventoryPlan(buildInventoryPlan(groups, world, validTypes, folders), options);
  expect(first.errors).toHaveLength(1); expect(world[0].folder).toBeNull();
  options.updateItem.mockRejectedValueOnce(new Error('Item save failed'));
  const second = await applyInventoryPlan(buildInventoryPlan(groups, world, validTypes, folders), options);
  expect(second.errors).toHaveLength(1); expect(second.organized).toHaveLength(0); expect(world[0].folder).toBeNull();
  const third = await applyInventoryPlan(buildInventoryPlan(groups, world, validTypes, folders), options);
  expect(third.organized).toHaveLength(1); expect(third.folderCreated).toHaveLength(0); expect(third.folderReused).toHaveLength(1); expect(folders).toHaveLength(1);
});

it('does not create Items after GM authority is lost during folder creation', async () => {
  const world = [], options = folderOptions(world);
  let gm = true;
  options.isGM = () => gm;
  options.createFolder.mockImplementation(async name => { gm = false; return { id: 'folder', name, type: 'Item' }; });
  const result = await applyInventoryPlan(buildInventoryPlan({ gear: [item('Lantern')] }, [], validTypes), options);
  expect(result.errors).toHaveLength(1); expect(options.createItem).not.toHaveBeenCalled();
});

it('enables zero-missing organization and cancels without creating folders or updating items', async () => {
  const doc = { ...item('Lantern'), id: 'lantern', folder: null, update: vi.fn() };
  const h = await uiHarness({ gear: [item('Lantern')] }, [doc]);
  const opened = h.openInventoryImport();
  await vi.waitFor(() => expect(h.dialogs).toHaveLength(1));
  expect(h.dialogs[0].options.buttons.import.label).toBe('Organize 1 Items');
  expect(h.dialogs[0].options.content).toContain('Adventuring Gear');
  expect(h.disabled.has('button[data-button="import"]')).toBe(false);
  await h.dialogs[0].close(); await opened;
  expect(Folder.create).not.toHaveBeenCalled(); expect(Item.create).not.toHaveBeenCalled(); expect(doc.update).not.toHaveBeenCalled();
});

it('shows folder ambiguity errors and disables the action even without invalid catalog rows', async () => {
  const folders = [{ id: 'a', name: 'Adventuring Gear', type: 'Item' }, { id: 'b', name: 'Adventuring Gear', type: 'Item' }];
  const h = await uiHarness({ gear: [item('Lantern')] }, [], folders);
  const opened = h.openInventoryImport();
  await vi.waitFor(() => expect(h.dialogs).toHaveLength(1));
  expect(h.dialogs[0].options.content).toContain('multiple top-level Item folders found');
  expect(h.disabled.get('button[data-button="import"]').value).toBe(true);
  await h.dialogs[0].options.buttons.import.callback(); await h.dialogs[0].close(); await opened;
  expect(Folder.create).not.toHaveBeenCalled(); expect(Item.create).not.toHaveBeenCalled();
});

it('disables an already organized catalog and preserves custom folder assignments', async () => {
  const doc = { ...item('Lantern'), id: 'lantern', folder: 'custom-folder', update: vi.fn() };
  const h = await uiHarness({ gear: [item('Lantern')] }, [doc]);
  const opened = h.openInventoryImport();
  await vi.waitFor(() => expect(h.dialogs).toHaveLength(1));
  expect(h.disabled.get('button[data-button="import"]').value).toBe(true);
  await h.dialogs[0].close(); await opened;
  expect(Folder.create).not.toHaveBeenCalled(); expect(doc.update).not.toHaveBeenCalled();
});
