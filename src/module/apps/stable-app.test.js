import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { emptyStable } from '../inventory/stable.js';

const { ItemCardDialog } = vi.hoisted(() => ({ ItemCardDialog: vi.fn(function (item) { this.item = item; this.render = vi.fn(() => this); }) }));
vi.mock('../cards/item-card-dialog.js', () => ({ ItemCardDialog }));

let StableApp, data, document, actor;
beforeAll(async () => {
  class App { constructor() {} render() { return this; } async close() {} async _prepareContext() { return {}; } }
  globalThis.foundry = { applications: { api: { ApplicationV2: App, HandlebarsApplicationMixin: Base => Base } }, utils: { randomID: () => 'stable-op' } };
  globalThis.Item = { implementation: vi.fn(function (source) { this.source = source; }) };
  ({ StableApp } = await import('./stable-app.js'));
});
beforeEach(() => {
  vi.clearAllMocks();
  actor = { id: 'hero', uuid: 'Actor.hero', type: 'character', name: 'Hero', ownership: { player: 3 }, items: [], getFlag: () => true };
  data = { ...emptyStable('Red Mare'), accessible: true, entries: [{ id: 'horse', itemData: { name: 'Horse', type: 'livestock', system: { cost: 10 } }, stock: 2, customPrice: null, hidden: false, individual: false }] };
  document = { id: 'stable', name: data.name, flags: { 'osp-houserules': { stable: data } }, getFlag: () => data };
  globalThis.game = { system: { id: 'osp-houserules' }, user: { id: 'player', isGM: false, character: actor, getFlag: () => ({}), setFlag: vi.fn() }, time: { worldTime: 0 }, journal: new Map([['stable', document]]), actors: [actor], items: [], settings: { get: () => ({}) } };
  globalThis.canvas = { tokens: { controlled: [] } };
  globalThis.ui = { notifications: { error: vi.fn(), info: vi.fn() } };
});

it('adds the native player preview control only for GM creator and shop windows', () => {
  game.user.isGM = true;
  expect(new StableApp({ mode: 'creator', draft: data })._getHeaderControls()).toEqual([{ label: 'View as Player', action: 'viewAsPlayer', icon: 'fas fa-eye' }]);
  expect(new StableApp({ mode: 'shop', draft: data, preview: true })._getHeaderControls()).toEqual([]);
  game.user.isGM = false;
  expect(new StableApp({ mode: 'creator', draft: data })._getHeaderControls()).toEqual([]);
});

it('registers a guarded preview action and chooses the first supported preview tab', async () => {
  expect(StableApp.DEFAULT_OPTIONS.actions.viewAsPlayer).toBe(StableApp._viewAsPlayer);
  game.user.isGM = true;
  const app = new StableApp({ mode: 'creator', stableId: 'stable', draft: data });
  vi.spyOn(app, '_captureDraft');
  const child = await app._act('viewAsPlayer');
  expect(app._captureDraft).toHaveBeenCalled(); expect(child.preview).toBe(true); expect(child.actor).toBeNull();
  child.tab = 'animal'; await child._prepareContext({}); expect(child.tab).toBe('animal');
  data.entries[0].itemData.type = 'vehicle'; const preview = new StableApp({ mode: 'shop', draft: data, preview: true });
  await preview._prepareContext({}); expect(preview.tab).toBe('vehicle');
});

it('preserves supported boarding and sale preview tabs and ignores hidden-only products', async () => {
  game.user.isGM = true; data.boarding = { enabled: true, priceCp: 10 }; data.buysFromPlayers = true;
  const boarding = new StableApp({ mode: 'shop', draft: data, preview: true }); boarding.tab = 'boarding'; await boarding._prepareContext({}); expect(boarding.tab).toBe('boarding');
  const sale = new StableApp({ mode: 'shop', draft: data, preview: true }); sale.tab = 'sale'; await sale._prepareContext({}); expect(sale.tab).toBe('sale');
  data.entries[0].hidden = true; const hidden = new StableApp({ mode: 'shop', draft: data, preview: true }); hidden.tab = 'animal'; await hidden._prepareContext({}); expect(hidden.tab).toBe('boarding');
});

it('hides preview history and recovery and closes instead of opening the manager', async () => {
  game.user.isGM = true; data.history = [{ id: 'private', actorId: 'hero', totalCp: 1 }];
  const app = new StableApp({ mode: 'shop', stableId: 'stable', draft: data, preview: true });
  const context = await app._prepareContext({}); expect(context.gm).toBe(false); expect(context.history).toEqual([]); expect(context.recovery).toEqual([]);
  const close = vi.spyOn(app, 'close'); await app._act('back'); expect(close).toHaveBeenCalled();
});

it('opens the full-size shop sign for players and previews without changing inventory', async () => {
  const render = vi.fn();
  const Viewer = vi.fn(function () { this.render = render; });
  foundry.applications.apps = { ImagePopout: Viewer };
  data.img = 'systems/osp-houserules/assets/thumbs/images/misc/sign_thumb.webp';
  const before = structuredClone(data);
  const app = new StableApp({ mode: 'shop', stableId: 'stable' });
  await app._act('viewSign');
  expect(Viewer).toHaveBeenLastCalledWith({ src: 'systems/osp-houserules/assets/images/misc/sign.webp', window: { title: 'Red Mare — Shop sign' } });
  expect(render).toHaveBeenCalledWith({ force: true });
  game.user.isGM = true;
  await new StableApp({ mode: 'shop', draft: data, preview: true })._act('viewSign');
  expect(Viewer).toHaveBeenCalledTimes(2);
  expect(data).toEqual(before);
  expect(game.user.setFlag).not.toHaveBeenCalled();
  await new StableApp({ mode: 'shop', draft: { ...data, img: '' } })._act('viewSign');
  expect(Viewer).toHaveBeenCalledTimes(2);
});

it('opens proprietor portraits for players and previews without changing store data', async () => {
  const render = vi.fn();
  const Viewer = vi.fn(function () { this.render = render; });
  foundry.applications.apps = { ImagePopout: Viewer };
  data.proprietorImg = 'systems/osp-houserules/assets/thumbs/images/misc/elias_thumb.webp';
  data.proprietorName = 'Elias Band';
  const before = structuredClone(data);
  await new StableApp({ mode: 'shop', stableId: 'stable' })._act('viewProprietor');
  expect(Viewer).toHaveBeenLastCalledWith({ src: 'systems/osp-houserules/assets/images/misc/elias.webp', window: { title: 'Elias Band' } });
  expect(render).toHaveBeenCalledWith({ force: true });
  game.user.isGM = true;
  await new StableApp({ mode: 'shop', draft: data, preview: true })._act('viewProprietor');
  expect(Viewer).toHaveBeenCalledTimes(2);
  await new StableApp({ mode: 'shop', draft: { ...data, proprietorImg: '' } })._act('viewProprietor');
  expect(Viewer).toHaveBeenCalledTimes(2);
  expect(data).toEqual(before);
  expect(game.user.setFlag).not.toHaveBeenCalled();
});

it('opens visible product details without mutating the stable, including in preview', async () => {
  const before = structuredClone(data);
  const app = new StableApp({ mode: 'shop', draft: data, preview: true });
  await app._act('details', { dataset: { entryId: 'horse' } });
  expect(Item.implementation).toHaveBeenCalledWith(expect.objectContaining({ name: 'Horse' }));
  expect(ItemCardDialog).toHaveBeenCalledTimes(1);
  expect(ItemCardDialog.mock.instances[0].render).toHaveBeenCalledWith(true);
  expect(data).toEqual(before);
});

it('denies hidden or inaccessible product details for live players', async () => {
  const app = new StableApp({ mode: 'shop', stableId: 'stable' });
  data.accessible = false; data.entries[0].hidden = true;
  await app._act('details', { dataset: { entryId: 'horse' } });
  expect(ItemCardDialog).not.toHaveBeenCalled();
});

it('lets only the GM open creator stock cards, including hidden draft entries, without editing them', async () => {
  data.entries[0].hidden = true;
  const before = structuredClone(data);
  game.user.isGM = false;
  await new StableApp({ mode: 'creator', draft: data })._act('details', { dataset: { entryId: 'horse' } });
  expect(ItemCardDialog).not.toHaveBeenCalled();
  game.user.isGM = true;
  await new StableApp({ mode: 'creator', draft: data })._act('details', { dataset: { entryId: 'horse' } });
  expect(ItemCardDialog).toHaveBeenCalledTimes(1);
  expect(ItemCardDialog.mock.instances[0].render).toHaveBeenCalledWith(true);
  expect(data).toEqual(before);
});

it('decorates product prices with silver and copper coin art without duplicate decimal text', async () => {
  data.entries[0].itemData.system.cost = 7.4;
  const context = await new StableApp({ mode: 'shop', draft: data, preview: true })._prepareContext({});
  expect(context.products[0].priceCoins).toEqual([
    { quantity: 7, denomination: 'silver', label: 'sp', img: 'systems/osp-houserules/assets/images/treasure/silver-coins.webp' },
    { quantity: 4, denomination: 'copper', label: 'cp', img: 'systems/osp-houserules/assets/images/treasure/copper-coins.webp' },
  ]);
});

it('keeps preview purchases disabled and does not call checkout', async () => {
  game.user.isGM = true;
  const app = new StableApp({ mode: 'shop', stableId: 'stable', draft: data, preview: true });
  await app._prepareContext({}); app.cart = [{ entryId: 'horse', quantity: 1, destination: '' }]; await app._act('review');
  await expect(app._act('complete')).rejects.toThrow('Preview mode');
});

it('uses the assigned owned character when no token is selected', async () => {
  const app = new StableApp({ mode: 'shop', stableId: 'stable' }); await app._prepareContext({});
  expect(app.actor).toBe(actor);
});

it('blocks inaccessible live shopping while allowing an explicit preview draft', async () => {
  data.accessible = false;
  const live = new StableApp({ mode: 'shop', stableId: 'stable' });
  expect((await live._prepareContext({})).canShop).toBe(false);
  game.user.isGM = true;
  const preview = new StableApp({ mode: 'shop', stableId: 'stable', draft: data, preview: true });
  expect((await preview._prepareContext({})).canShop).toBe(true);
});

it('keeps preview boarding and sale reviews temporary and blocks both completion handlers', async () => {
  game.user.isGM = true; data.accessible = false; data.buysFromPlayers = true;
  const app = new StableApp({ mode: 'shop', draft: data, preview: true });
  app.cart = [{ kind: 'boarding', animalIds: [app.previewActor.items[0].id], nights: 2 }];
  await app._act('review'); expect(app.review.totalCp).toBe(20);
  app.sale = [{ itemId: app.previewActor.items[0].id, quantity: 1 }]; await app._act('saleReview'); expect(app.saleReview.totalCp).toBeGreaterThan(0);
  await expect(app._act('saleComplete')).rejects.toThrow('Preview mode'); await expect(app._act('retry')).rejects.toThrow('Preview mode');
  expect(game.user.setFlag).not.toHaveBeenCalled(); expect(data.bookings).toEqual([]);
});

it('changes carts by actor UUID, rejects non-party shoppers, and never guesses another owned actor', async () => {
  const flags = {}; game.user.getFlag = (_scope, flag) => flags[flag] || {}; game.user.setFlag = vi.fn(async (_scope, flag, value) => { flags[flag] = structuredClone(value); });
  const app = new StableApp({ mode: 'shop', stableId: 'stable' }); await app._prepareContext({});
  app.cart = [{ entryId: 'horse', quantity: 1 }]; await app._saveCart();
  const other = { ...actor, uuid: 'Actor.other', id: 'other' }; game.user.character = other; game.actors.push(other); await app._prepareContext({}); expect(app.cart).toEqual([]);
  game.user.character = actor; await app._prepareContext({}); expect(app.cart[0].quantity).toBe(1);
  actor.getFlag = () => false; await app._prepareContext({}); expect(app.actor).toBeNull(); expect(app.cart).toEqual([]);
});

it('preserves stock zero for individual animals and edits the delivered item name', async () => {
  game.user.isGM = true; const app = new StableApp({ mode: 'creator', draft: data }); app.draft.entries[0].stock = 0;
  await app._act('individualizeEntry', { dataset: { entryId: 'horse' } });
  expect(app.draft.entries[0]).toMatchObject({ individual: true, stock: 0, managed: false, itemData: { system: { unique: true } } });
  app.element = { querySelectorAll: selector => selector === '[data-entry-field]' ? [{ dataset: { entryId: 'horse', entryField: 'name' }, value: 'Bramble' }] : [] };
  app._captureDraft(); expect(app.draft.entries[0].itemData.name).toBe('Bramble');
});

it('uses the generated preview settings when applying, even if controls later differ', async () => {
  game.user.isGM = true; const parent = new StableApp({ mode: 'creator', draft: data }); const tools = new StableApp({ mode: 'tools', draft: data }); tools.creator = parent;
  tools.profile.profileId = 'saddler'; tools.generated = { success: true, entries: [], settings: { profileId: 'breeder' } }; await tools._act('applyGenerated');
  expect(parent.draft.profileId).toBe('breeder');
});

it('applies generated stock to the creator draft and records the restock time', async () => {
  globalThis.game.user.isGM = true;
  const parent = new StableApp({ mode: 'creator', stableId: 'stable', draft: data });
  const tools = new StableApp({ mode: 'tools', draft: data }); tools.creator = parent;
  tools.generated = { success: true, entries: [{ id: 'generated', itemData: { name: 'Mule', type: 'livestock', system: { cost: 5 } }, stock: 3 }], settings: { profileId: 'livestock' } };
  await tools._act('applyGenerated');
  expect(parent.draft.entries[0].id).toBe('generated');
  expect(parent.draft.stocking).toMatchObject({ profileId: 'livestock', lastRestockedWorldTime: 0 });
});

it('captures time and copper values as backend numeric fields', () => {
  const app = new StableApp({ mode: 'creator', draft: data });
  app.element = { querySelectorAll: selector => selector === '[data-stable-field]' ? [
    { dataset: { stableField: 'opening.openMinute' }, type: 'time', value: '09:30' },
    { dataset: { stableField: 'boarding.priceCp' }, type: 'number', value: '2.5' },
  ] : [] };
  app._captureDraft();
  expect(app.draft.openingHours.openMinute).toBe(570);
  expect(app.draft.boarding.priceCp).toBe(25);
});
