import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { checkoutStore } from '../inventory/store.js';

vi.mock('../inventory/store.js', async importOriginal => ({ ...await importOriginal(), checkoutStore: vi.fn() }));

vi.mock('../inventory/catalog-stocking.js', async importOriginal => ({ ...await importOriginal(), loadStockingCatalog: vi.fn(async () => []) }));

let StoreApp, hero, userFlags, store;
beforeAll(async () => {
  class App { constructor() {} async _prepareContext() { return {}; } render() { return this; } async close() {} }
  globalThis.foundry = { applications: { sheets: { ActorSheetV2: App }, api: { ApplicationV2: App, HandlebarsApplicationMixin: Base => Base } }, utils: { randomID: () => 'store-app-id', duplicate: value => structuredClone(value) } };
  globalThis.Application = App;
  globalThis.Dialog = App;
  ({ StoreApp } = await import('./store-app.js'));
});
beforeEach(() => {
  userFlags = {};
  store = { version: 1, revision: 0, name: 'Outfitter', description: '', accessible: true, adjustment: 0, history: [], entries: [{ id: 'rope', itemData: { name: 'Rope', type: 'item', system: { cost: 5, quantity: 1 } }, hidden: false, customPrice: null, stock: 3 }] };
  hero = { id: 'hero', uuid: 'Actor.hero', type: 'character', name: 'Hero', isOwner: true, items: [ { id: 'purse', name: 'Coin Purse', type: 'container', system: { quantity: 1 } }, { id: 'silver', name: 'Silver Coins', type: 'coin', system: { quantity: 10, containerId: 'purse' } } ], getFlag: (_scope, key) => key === 'party' ? true : hero.receipts || [] };
  const document = { id: 'store', name: store.name, getFlag: () => store };
  globalThis.game = { user: { id: 'user', isGM: false, character: hero, getFlag: (_scope, key) => userFlags[key], setFlag: vi.fn(async (_scope, key, value) => { userFlags[key] = structuredClone(value); }) }, actors: [hero], journal: new Map([['store', document]]), settings: { get: () => ({}) }, system: { id: 'osp-houserules' } };
  globalThis.Hooks = { on: vi.fn(() => 'hook'), off: vi.fn() };
  globalThis.ui = { notifications: { error: vi.fn(), info: vi.fn() } };
});

it('renders bolt receipt quantities as bundles for purchases and individual rounds for sales', () => {
  const app = new StoreApp();
  const purchase = app._presentReceipt({ kind: 'purchase', timestamp: Date.now(), totalCp: 200, lines: [{ name: 'Crossbow Bolt, Heavy', quantity: 2, bundleQuantity: 20, boltCount: 40, unitPriceCp: 100 }] });
  expect(purchase.lines[0].quantityLabel).toBe('2 bundles · 40 bolts');
  const protectedSale = app._presentReceipt({ kind: 'sale', timestamp: Date.now(), totalCp: 100, lines: [{ name: 'Crossbow Bolt, Heavy', quantity: 20, boltCount: 20, unitPriceCp: 5 }] });
  expect(protectedSale.lines[0].quantityLabel).toBe('20 bolts');
  const looseSale = app._presentReceipt({ kind: 'sale', timestamp: Date.now(), totalCp: 10, lines: [{ name: 'Crossbow Bolt, Heavy', quantity: 2, unitPriceCp: 5 }] });
  expect(looseSale.lines[0].quantityLabel).toBe('2 bolts');
});

it('shows the real carried balance, persistent editable cart and exact running totals', async () => {
  const app = new StoreApp({ mode: 'shop', storeId: 'store', actor: hero });
  await app._act('add', { dataset: { entryId: 'rope' } });
  await app._act('increment', { dataset: { entryId: 'rope' } });
  const context = await app._prepareContext({});
  expect(context.total).toBe('10 sp'); expect(context.remaining).toBe('0 sp'); expect(context.canReview).toBe(true);
  const reopened = new StoreApp({ mode: 'shop', storeId: 'store', actor: hero });
  expect((await reopened._prepareContext({})).lines[0].quantity).toBe(2);
  await app._act('increment', { dataset: { entryId: 'rope' } });
  const overBudget = await app._prepareContext({});
  expect(overBudget.canReview).toBe(false); expect(overBudget.shortfall).toBe('5 sp');
});

it('adds the native player preview control only for GM creator and shop windows', () => {
  game.user.isGM = true;
  expect(new StoreApp({ mode: 'creator', draft: store })._getHeaderControls()).toEqual([{ label: 'View as Player', action: 'viewAsPlayer', icon: 'fas fa-eye' }]);
  expect(new StoreApp({ mode: 'shop', draft: store, preview: true })._getHeaderControls()).toEqual([]);
  game.user.isGM = false;
  expect(new StoreApp({ mode: 'creator', draft: store })._getHeaderControls()).toEqual([]);
});

it('registers the guarded action, captures unsaved creator fields, and clones a shop preview without an actor', async () => {
  expect(StoreApp.DEFAULT_OPTIONS.actions.viewAsPlayer).toBe(StoreApp._viewAsPlayer);
  game.user.isGM = true; const app = new StoreApp({ mode: 'creator', storeId: 'store', draft: store }); app.element = { querySelectorAll: () => [] };
  vi.spyOn(app, '_capture'); const child = await app._act('viewAsPlayer');
  expect(app._capture).toHaveBeenCalled(); expect(child.preview).toBe(true); expect(child.actor).toBeNull();
  child.draft.name = 'Preview only'; expect(app.draft.name).not.toBe('Preview only');
});

it('sanitizes preview context and closes without returning to the manager', async () => {
  game.user.isGM = true; store.history = [{ id: 'private' }];
  const app = new StoreApp({ mode: 'shop', storeId: 'store', draft: store, preview: true }); const context = await app._prepareContext({});
  expect(context.gm).toBe(false); expect(context.history).toEqual([]); expect(context.recovery).toEqual([]); expect(context.actors).toEqual([]);
  const close = vi.spyOn(app, 'close'); await app._act('back'); expect(close).toHaveBeenCalled();
});
it('freezes a pending cart and reconciles its receipt after a lost acknowledgement', async () => {
  const app = new StoreApp({ mode: 'shop', storeId: 'store', actor: hero });
  await app._saveCart({ lines: [{ entryId: 'rope', quantity: 1 }], pending: { operationId: 'pending' } });
  await app._act('increment', { dataset: { entryId: 'rope' } });
  expect(app.cart.lines[0].quantity).toBe(1);
  hero.receipts = [{ id: 'pending', totalCp: 50, afterCp: 50, timestamp: Date.now(), lines: [{ name: 'Rope', quantity: 1, unitPriceCp: 50 }] }];
  const context = await app._prepareContext({});
  expect(context.receipt.total).toBe('5 sp'); expect(app.cart.pending).toBeNull(); expect(app.cart.lines).toEqual([]);
});
it('disables review immediately when access closes and preserves the cart', async () => {
  const app = new StoreApp({ mode: 'shop', storeId: 'store', actor: hero });
  await app._act('add', { dataset: { entryId: 'rope' } });
  store.accessible = false;
  const context = await app._prepareContext({});
  expect(context.available).toBe(false); expect(context.canReview).toBe(false); expect(context.lines).toHaveLength(1);
  expect(context.stores).toEqual([]);
  const reopened = new StoreApp({ mode: 'shop', storeId: 'store', actor: hero });
  expect((await reopened._prepareContext({})).available).toBe(false);
});
it('player preview uses temporary cart data and never persists it to a character', async () => {
  game.user.isGM = true;
  const app = new StoreApp({ mode: 'shop', storeId: 'store', draft: store, preview: true });
  await app._act('add', { dataset: { entryId: 'rope' } });
  expect(app.cart.lines).toHaveLength(1);
  expect((await app._prepareContext({})).canReview).toBe(true);
  expect(game.user.setFlag).not.toHaveBeenCalled();
});

it('reviews a closed-store preview without a character and blocks every purchase completion path', async () => {
  game.user.isGM = true; store.accessible = false;
  const before = structuredClone(store);
  const app = new StoreApp({ mode: 'shop', storeId: 'store', draft: store, preview: true });
  await app._act('add', { dataset: { entryId: 'rope' } });
  await app._act('increment', { dataset: { entryId: 'rope' } });
  expect((await app._prepareContext({})).canReview).toBe(true);
  await app._act('review', { dataset: {} });
  const context = await app._prepareContext({});
  expect(context.reviewLines).toMatchObject([{ name: 'Rope', quantity: 2, total: '10 sp' }]);
  expect(context.review.tendered).toBeUndefined();
  expect(context.shortfall).toBeNull();
  app.actor = hero;
  app.previewCart.pending = { operationId: 'forged', quote: {} };
  await app._act('complete', { dataset: {} });
  await app._act('retry', { dataset: {} });
  await app._complete(app.cart);
  expect(checkoutStore).not.toHaveBeenCalled();
  expect(game.user.setFlag).not.toHaveBeenCalled();
  expect(store).toEqual(before);
  app.previewCart.pending = null;
  await app._act('backCart', { dataset: {} });
  expect(app.review).toBeNull(); expect(app.cart.lines[0].quantity).toBe(2);
});

it('keeps unavailable stock and empty carts out of preview review', async () => {
  game.user.isGM = true;
  const app = new StoreApp({ mode: 'shop', storeId: 'store', draft: store, preview: true });
  expect((await app._prepareContext({})).canReview).toBe(false);
  await app._act('add', { dataset: { entryId: 'rope' } });
  app.draft.entries[0].stock = 0;
  expect((await app._prepareContext({})).canReview).toBe(false);
  await expect(app._act('review', { dataset: {} })).rejects.toThrow('unavailable');
  expect(app.review).toBeNull();
});
it('lets GMs shop as controlled characters outside the party without expanding player access', async () => {
  hero.getFlag = () => false;
  game.user.isGM = true;
  const gmShop = new StoreApp({ mode: 'shop', storeId: 'store', actor: hero });
  expect((await gmShop._prepareContext({})).actors).toEqual([{ id: 'hero', name: 'Hero', selected: true }]);
  game.user.isGM = false;
  const playerShop = new StoreApp({ mode: 'shop', storeId: 'store', actor: hero });
  expect((await playerShop._prepareContext({})).actors).toEqual([]);
  expect(playerShop.actor).toBeNull();
});
it('switching limited stock to unlimited cannot retain the old quantity input', () => {
  const app = new StoreApp({ mode: 'creator', storeId: 'store', draft: store });
  const inputs = [{ dataset: { entryField: 'stockMode', entryId: 'rope' }, value: 'unlimited' }, { dataset: { entryField: 'stock', entryId: 'rope' }, value: '3' }];
  Object.defineProperty(app, 'element', { value: { querySelectorAll: selector => selector === '[data-entry-field]' ? inputs : [] } });
  app._capture();
  expect(app.draft.entries[0].stock).toBeNull();
});
it('removes all live update subscriptions when its window closes', async () => {
  const app = new StoreApp();
  app._onFirstRender({}, {});
  expect(Hooks.on).toHaveBeenCalledTimes(8);
  await app.close();
  expect(Hooks.off).toHaveBeenCalledTimes(8);
});

it('previews random stock without changing the creator until Apply to Draft', async () => {
  game.user.isGM = true;
  const creator = new StoreApp({ mode: 'creator', storeId: 'store', draft: store });
  const tools = new StoreApp({ mode: 'tools' });
  tools.creator = creator;
  tools.generatorOptions = { ...tools.generatorOptions, minStock: 7, maxStock: 7, preserveLimited: false, seed: 'preview' };
  Object.defineProperty(tools, 'element', { value: { querySelectorAll: () => [] } });
  await tools._act('generate', { dataset: {} });
  expect(creator.draft.entries[0].stock).toBe(3);
  expect(tools.generationResult.entries[0].stock).toBe(7);
  await tools._act('applyGenerated', { dataset: {} });
  expect(creator.draft.entries[0].stock).toBe(7);
  expect(store.entries[0].stock).toBe(3);
});
it('refuses to apply a preview over a newly edited creator inventory', async () => {
  game.user.isGM = true;
  const tools = new StoreApp({ mode: 'tools' });
  tools.creator = new StoreApp({ mode: 'creator', storeId: 'store', draft: store });
  Object.defineProperty(tools, 'element', { value: { querySelectorAll: () => [] } });
  await tools._act('generate', { dataset: {} });
  tools.creator.draft.entries[0].stock = 99;
  await expect(tools._act('applyGenerated', { dataset: {} })).rejects.toThrow('inventory changed');
  expect(tools.creator.draft.entries[0].stock).toBe(99);
});
it('presents proprietor identity and merchant buying terms independently of the store image', async () => {
  Object.assign(store, { proprietorName: 'Tessa', proprietorImg: 'tessa.webp', img: 'shop.webp', buysFromPlayers: true, buybackRate: 50, buybackTypes: ['item'] });
  const context = await new StoreApp({ mode: 'shop', storeId: 'store', actor: hero })._prepareContext({});
  expect(context.proprietor).toEqual({ name: 'Tessa', img: 'tessa.webp' });
  expect(context.store.img).toBe('shop.webp');
  expect(context.saleEnabled).toBe(true);
  store.accessible = false;
  expect((await new StoreApp({ mode: 'shop', storeId: 'store', actor: hero })._prepareContext({})).saleEnabled).toBe(false);
});

it('keeps ongoing profile settings when applying a one-time stock randomization', async () => {
  game.user.isGM = true;
  store.stocking = { profileId: 'general', enabled: true, restockDays: 9, managedSources: ['Item.rope'] };
  const creator = new StoreApp({ mode: 'creator', storeId: 'store', draft: store });
  const tools = new StoreApp({ mode: 'tools' }); tools.creator = creator;
  tools.generatorOptions = { ...tools.generatorOptions, minStock: 7, maxStock: 7, preserveLimited: false };
  Object.defineProperty(tools, 'element', { value: { querySelectorAll: () => [] } });
  await tools._act('generate', { dataset: {} }); await tools._act('applyGenerated', { dataset: {} });
  expect(creator.draft.stocking).toEqual(store.stocking);
});
it('persists an ongoing profile in the draft while leaving manual products independent', async () => {
  game.user.isGM = true; game.time = { worldTime: 1234 };
  game.items = [{ id: 'torch', uuid: 'Item.torch', name: 'Torch', type: 'item', system: { cost: 1, tags: [], storeAvailability: 'common' } }];
  const creator = new StoreApp({ mode: 'creator', storeId: 'store', draft: store });
  const tools = new StoreApp({ mode: 'tools' }); tools.creator = creator; tools.toolMode = 'profile';
  tools.generatorOptions = { ...tools.generatorOptions, restockDays: 3, minStock: 5, maxStock: 5 };
  Object.defineProperty(tools, 'element', { value: { querySelectorAll: () => [] } });
  await tools._act('generate', { dataset: {} }); await tools._act('applyGenerated', { dataset: {} });
  expect(creator.draft.stocking).toMatchObject({ enabled: true, restockDays: 3, lastRestockWorldTime: 1234, managedSources: ['Item.torch'] });
  expect(creator.draft.entries.find(entry => entry.id === 'rope').stock).toBe(3);
  expect(creator.draft.entries.find(entry => entry.sourceUuid === 'Item.torch').stock).toBe(5);
  expect(store.stocking).toBeUndefined();
});

it('loads the full saved profile, previews protected manual items, and retains settings when applied', async () => {
  game.user.isGM = true; game.time = { worldTime: 50 };
  store.entries[0].sourceUuid = 'Item.rope';
  store.stocking = { profileId: 'blacksmith', restockDays: 7, enabled: true, economy: 'mining', wealth: 'wealthy', supply: 'unreliable', demand: 'military', event: 'war', alwaysStock: ['Item.torch'], neverStock: ['Item.rope'], rarityOverrides: { 'Item%2Etorch': 'rare' }, buybackRates: { weapon: 75 }, managedSources: [] };
  game.items = [{ id: 'torch', uuid: 'Item.torch', name: 'Torch', type: 'item', system: { cost: 1, tags: [], storeAvailability: 'common' } }, { id: 'rope', uuid: 'Item.rope', name: 'Rope', type: 'item', system: { cost: 5, tags: [] } }];
  const creator = new StoreApp({ mode: 'creator', storeId: 'store', draft: store });
  Object.defineProperty(creator, 'element', { value: { querySelectorAll: () => [] } });
  const before = structuredClone(store);
  const tools = await creator._act('profiles', { dataset: {} });
  tools.generatorOptions.minStock = 2; tools.generatorOptions.maxStock = 2;
  const context = await tools._prepareContext({});
  expect(context.economies.find(option => option.selected).id).toBe('mining');
  expect(context.stockProfiles.find(option => option.selected).id).toBe('blacksmith');
  expect(context.profileItems.find(item => item.uuid === 'Item.torch').rarities.find(option => option.selected).id).toBe('rare');
  Object.defineProperty(tools, 'element', { value: { querySelectorAll: () => [] } });
  await tools._act('generate', { dataset: {} });
  expect(store).toEqual(before);
  expect((await tools._prepareContext({})).generated.find(entry => entry.name === 'Rope')).toMatchObject({ stock: 3, price: '5 sp' });
  await tools._act('applyGenerated', { dataset: {} });
  expect(creator.draft.stocking).toMatchObject({ economy: 'mining', event: 'war', neverStock: ['Item.rope'], buybackRates: { weapon: 75 }, rarityOverrides: { 'Item%2Etorch': 'rare' } });
  expect(creator.draft.entries.find(entry => entry.id === 'rope')).toEqual(before.entries[0]);
  expect(creator.draft.entries.find(entry => entry.sourceUuid === 'Item.torch').stock).toBe(2);
  expect(store).toEqual(before);
});
it('captures item rules across filtered rows, encoded commonness keys, and explicit zero buying rates', () => {
  const tools = new StoreApp({ mode: 'tools' });
  const inputs = {
    '[data-profile-policy]': [{ dataset: { profilePolicy: 'Item.torch' }, value: 'always' }, { dataset: { profilePolicy: 'Item.rope' }, value: 'never', hidden: true }],
    '[data-profile-rarity]': [{ dataset: { profileRarity: 'Item.torch' }, value: 'rare' }],
    '[data-profile-buyback-rate]': [{ dataset: { profileBuybackRate: 'weapon' }, value: '0' }, { dataset: { profileBuybackRate: 'armor' }, value: '' }],
  };
  Object.defineProperty(tools, 'element', { value: { querySelectorAll: selector => inputs[selector] || [] } });
  tools._captureGenerator();
  expect(tools.generatorOptions).toMatchObject({ alwaysStock: ['Item.torch'], neverStock: ['Item.rope'], rarityOverrides: { 'Item%2Etorch': 'rare' }, buybackRates: { weapon: 0 } });
});

it('previews and applies explicit product counts independently of per-item quantities', async () => {
  game.user.isGM = true; game.time = { worldTime: 50 };
  game.items = Array.from({ length: 90 }, (_, index) => ({ id: `supply-${index}`, uuid: `Item.supply-${index}`, name: `Supply ${index}`, type: 'item', system: { cost: 1, tags: [], storeAvailability: 'common' } }));
  const creator = new StoreApp({ mode: 'creator', storeId: 'store', draft: store });
  Object.defineProperty(creator, 'element', { value: { querySelectorAll: () => [] } });
  const tools = await creator._act('profiles', { dataset: {} });
  Object.assign(tools.generatorOptions, { minProducts: 41, maxProducts: 41, minStock: 3, maxStock: 3, unavailableChance: 0, replaceInventory: true });
  Object.defineProperty(tools, 'element', { value: { querySelectorAll: () => [] } });
  await tools._act('generate', { dataset: {} });
  const context = await tools._prepareContext({});
  expect(context.generated).toHaveLength(41);
  expect(context.productCountSummary).toMatchObject({ requested: 41, generated: 41, shortfall: false });
  expect(context.generated.every(entry => entry.stock === 3)).toBe(true);
  expect(creator.draft.entries).toHaveLength(1);
  await tools._act('applyGenerated', { dataset: {} });
  expect(creator.draft.stocking).toMatchObject({ minProducts: 41, maxProducts: 41 });
  expect(creator.draft.entries).toHaveLength(41);
  expect(store.entries).toHaveLength(1);
});

it('reports unclassified products without changing the store and offers Exceptional overrides', async () => {
  game.user.isGM = true;
  game.items = [{ id: 'unknown', uuid: 'Item.unknown', name: 'Custom supply', type: 'item', system: { cost: 900 } }];
  const before = structuredClone(store);
  const creator = new StoreApp({ mode: 'creator', storeId: 'store', draft: store });
  const tools = new StoreApp({ mode: 'tools' }); tools.creator = creator; tools.toolMode = 'profile';
  Object.defineProperty(tools, 'element', { value: { querySelectorAll: () => [] } });
  await tools._act('generate', { dataset: {} });
  const context = await tools._prepareContext({});
  expect(context.productCountSummary).toMatchObject({ generated: 0, unclassified: 1, shortfall: true });
  expect(context.profileItems[0].rarities.some(value => value.id === 'exceptional')).toBe(true);
  expect(creator.draft).toEqual(before);
  expect(store).toEqual(before);
});
