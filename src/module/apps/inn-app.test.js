import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { checkoutInn, emptyInn, getInnData } from '../inventory/inn.js';
import { generateInnOfferings } from '../inventory/inn-profiles.js';
vi.mock('../inventory/inn.js', async original => ({ ...await original(), checkoutInn: vi.fn() }));
let InnApp, hero, guest, data, flags, document;
const copy = value => structuredClone(value);
beforeAll(async () => {
  class App { constructor() {} render() { return this; } async close() {} async _prepareContext() { return {}; } }
  globalThis.foundry = { applications: { api: { ApplicationV2: App, HandlebarsApplicationMixin: Base => Base } }, utils: { randomID: () => 'checkout-1' } };
  ({ InnApp } = await import('./inn-app.js'));
});
beforeEach(() => {
  vi.clearAllMocks(); flags = {};
  hero = { id: 'hero', uuid: 'Actor.hero', name: 'Hero', type: 'character', ownership: { player: 3 }, flags: { party: true }, items: [{ id: 'purse', name: 'Purse', type: 'container', system: { quantity: 1 } }, { id: 'silver', type: 'coin', name: 'Silver Coins', system: { quantity: 100, containerId: 'purse' } }], getFlag: (_scope, key) => hero.flags[key] };
  guest = { id: 'guest', uuid: 'Actor.guest', name: 'Guest', type: 'character', ownership: {}, getFlag: (_scope, key) => key === 'party' };
  data = { ...emptyInn('Lantern Inn'), offerings: [
    { id: 'meal', name: 'Stew', kind: 'meal', priceCp: 20, quantity: 6, capacity: 1, enabled: true, managed: false },
    { id: 'room', name: 'Private room', kind: 'room', priceCp: 100, quantity: 2, capacity: 2, enabled: true, managed: true },
  ] };
  document = { id: 'inn', name: data.name, flags: { 'osp-houserules': { inn: data } }, getFlag: () => data };
  globalThis.game = { user: { id: 'player', isGM: true, character: hero, getFlag: (_scope, key) => flags[key], setFlag: vi.fn(async (_scope, key, value) => { flags[key] = copy(value); }) }, system: { id: 'osp-houserules' }, time: { worldTime: 100 }, journal: new Map([['inn', document]]), actors: [hero, guest], items: [], settings: { get: () => ({}) } };
  globalThis.ui = { notifications: { error: vi.fn(), info: vi.fn() } };
  globalThis.Hooks = { on: vi.fn(() => 1), off: vi.fn() };
});
const target = offeringId => ({ dataset: { offeringId } });
const element = inputs => ({ querySelector: () => null, querySelectorAll: selector => inputs?.[selector] || [] });

it('adds the native player preview control only for GM creator and shop windows', () => {
  game.user.isGM = true;
  expect(new InnApp({ mode: 'creator', draft: data })._getHeaderControls()).toEqual([{ label: 'View as Player', action: 'viewAsPlayer', icon: 'fas fa-eye' }]);
  expect(new InnApp({ mode: 'shop', draft: data, preview: true })._getHeaderControls()).toEqual([]);
  game.user.isGM = false;
  expect(new InnApp({ mode: 'creator', draft: data })._getHeaderControls()).toEqual([]);
});

it('registers the guarded action, captures creator draft, and clones a preview without an actor', async () => {
  expect(InnApp.DEFAULT_OPTIONS.actions.viewAsPlayer).toBe(InnApp._viewAsPlayer);
  game.user.isGM = true; const app = new InnApp({ mode: 'creator', innId: 'inn', draft: data }); vi.spyOn(app, '_captureDraft');
  const child = await app._act('viewAsPlayer'); expect(app._captureDraft).toHaveBeenCalled(); expect(child.preview).toBe(true); expect(child.actor).toBeNull();
  child.draft.name = 'Preview only'; expect(app.draft.name).not.toBe('Preview only');
});

it('sanitizes preview context and closes without returning to the manager', async () => {
  game.user.isGM = true; data.history = [{ id: 'private' }];
  const app = new InnApp({ mode: 'shop', innId: 'inn', draft: data, preview: true }); const context = await app._prepareContext({});
  expect(context.gm).toBe(false); expect(context.history).toEqual([]); expect(context.recovery).toEqual([]); expect(context.privateDraft).toBeNull(); expect(context.actors).toEqual([]);
  const close = vi.spyOn(app, 'close'); await app._act('back'); expect(close).toHaveBeenCalled();
});

it('quotes a closed preview including nights and guests without persisting or purchasing', async () => {
  const app = new InnApp({ mode: 'shop', draft: data, innId: 'inn', preview: true });
  await app._prepareContext({});
  expect(app.actor).toBeNull();
  await app._act('add', target('meal')); await app._act('add', target('room'));
  app.cart[1].nights = 2; app.cart[1].guestIds = ['hero', 'guest'];
  await app._act('review'); const context = await app._prepareContext({});
  expect(context.review.total).toBe('22 sp');
  expect(context.review.lines[1].guestNames).toBe('Hero, Guest');
  await expect(app._act('complete')).rejects.toThrow('Preview mode');
  app.pending = { operationId: 'forged', quote: app.review }; app.actor = hero;
  await app._act('retry');
  expect(checkoutInn).not.toHaveBeenCalled(); expect(game.user.setFlag).not.toHaveBeenCalled(); expect(data.bookings).toEqual([]);
});
it('lists accessible inns for players and blocks closed real review even for GMs', async () => {
  game.user.isGM = false;
  const manager = new InnApp(); expect((await manager._prepareContext({})).inns).toEqual([]);
  expect(manager.mode).toBe('manager');
  data.accessible = true; expect((await manager._prepareContext({})).inns).toHaveLength(1);
  game.user.isGM = true; data.accessible = false;
  const shop = new InnApp({ mode: 'shop', innId: 'inn', actor: hero }); await shop._prepareContext({});
  shop.cart = [{ offeringId: 'meal', quantity: 1, nights: 1, guestIds: [] }];
  expect((await shop._prepareContext({})).canReview).toBe(false);
  await expect(shop._act('review')).rejects.toThrow('not accessible');
});
it('captures prices in silver exactly once and preserves offering types and null servings', () => {
  const app = new InnApp({ mode: 'creator', draft: data });
  app.element = element({ '[data-offering-field]': [
    { dataset: { offeringField: 'priceCp', offeringId: 'meal' }, type: 'number', value: '2.5' },
    { dataset: { offeringField: 'quantity', offeringId: 'meal' }, type: 'number', value: '' },
  ] }); app._captureDraft();
  expect(app.draft.offerings[0]).toMatchObject({ priceCp: 25, quantity: null, kind: 'meal' });
});
it('persists user carts under encoded actor-and-establishment keys without touching actors', async () => {
  data.accessible = true; const shop = new InnApp({ mode: 'shop', innId: 'inn', actor: hero }); await shop._prepareContext({});
  await shop._act('add', target('meal'));
  expect(Object.keys(flags.innCarts)).toEqual(['Actor%2Ehero:inn']);
  const reopened = new InnApp({ mode: 'shop', innId: 'inn', actor: hero }); await reopened._prepareContext({}); expect(reopened.cart).toHaveLength(1);
  expect(hero.flags).toEqual({ party: true });
});
it('preserves manual offerings and actively booked lodging when regenerating', async () => {
  data.bookings = [{ id: 'stay', checkedOut: false, endsAt: 1000, lines: [{ offeringId: 'room', quantity: 1 }] }];
  const creator = new InnApp({ mode: 'creator', draft: data });
  const tools = new InnApp({ mode: 'tools' }); tools.creator = creator; tools.generatorBase = JSON.stringify(creator.draft.offerings);
  tools.generator = { ...tools.generator, enabled: true, size: 'small' }; tools.generationResult = generateInnOfferings(tools.generator);
  await tools._act('applyGenerated');
  expect(creator.draft.offerings.find(entry => entry.id === 'meal')).toMatchObject({ priceCp: 20, managed: false });
  expect(creator.draft.offerings.find(entry => entry.id === 'room')).toEqual(data.offerings[1]);
  expect(creator.draft.replenishment).toMatchObject({ enabled: true, lastReplenishedWorldTime: 100 });
  expect(data.offerings).toHaveLength(2);
});
it('retains a pending operation id for retries and clears only after its receipt arrives', async () => {
  data.accessible = true;
  const shop = new InnApp({ mode: 'shop', innId: 'inn', actor: hero }); await shop._prepareContext({}); await shop._act('add', target('meal')); await shop._act('review');
  checkoutInn.mockResolvedValue({ success: false, retryable: true, reason: 'Connection interrupted' });
  await expect(shop._act('complete')).rejects.toThrow('Connection interrupted');
  expect(shop.pending.operationId).toBe('checkout-1');
  await shop._act('clear'); expect(shop.cart).toHaveLength(1);
  checkoutInn.mockResolvedValue({ success: true }); await shop._act('retry');
  expect(shop.pending.operationId).toBe('checkout-1'); expect(checkoutInn.mock.calls.map(call => call[3])).toEqual(['checkout-1', 'checkout-1']);
  hero.flags.innReceipts = [{ id: 'checkout-1', innId: 'inn', totalCp: 20, afterCp: 980, lines: [{ name: 'Stew', quantity: 1, kind: 'meal', lineTotalCp: 20 }] }];
  await shop._prepareContext({}); expect(shop.pending).not.toBeNull();
  data.history = copy(hero.flags.innReceipts);
  await shop._prepareContext({}); expect(shop.pending).toBeNull(); expect(shop.cart).toEqual([]); expect(shop.receipt.id).toBe('checkout-1');
});
it('shows remaining room capacity and releases UI subscriptions on close', async () => {
  data.accessible = true; data.bookings = [{ id: 'stay', checkedOut: false, endsAt: 1000, lines: [{ offeringId: 'room', quantity: 2, capacity: 2 }] }];
  const app = new InnApp({ mode: 'shop', innId: 'inn', actor: hero }); app.tab = 'room';
  const context = await app._prepareContext({}); expect(context.offerings[0]).toMatchObject({ available: '0 available', unavailable: true });
  app._onFirstRender(); await app.close(); expect(Hooks.off).toHaveBeenCalledTimes(8);
});

it('uses the one controlled owned party character and falls back to the assigned character', async () => {
  game.user.isGM = false;
  hero.ownership = { player: 3 };
  const other = { id: 'other', uuid: 'Actor.other', name: 'Other', type: 'character', ownership: { player: 3 }, getFlag: (_scope, key) => key === 'party' ? true : [] };
  hero.getFlag = (_scope, key) => key === 'party' ? true : [];
  game.actors = [hero, other]; game.user.character = hero; game.user.getFlag = () => ({ });
  globalThis.canvas = { tokens: { controlled: [{ actor: other }] } };
  data.accessible = true;
  const app = new InnApp({ mode: 'shop', innId: 'inn' });
  await app._prepareContext({}); expect(app.actor).toBe(other);
  globalThis.canvas.tokens.controlled = [{ actor: hero }, { actor: other }];
  await app._prepareContext({}); expect(app.actor).toBe(hero);
  globalThis.canvas.tokens.controlled = [];
  game.user.character = other;
  await app._prepareContext({}); expect(app.actor).toBe(other);
});

it('clears review when the controlled shopper changes and never reassigns a pending purchase', async () => {
  game.user.isGM = false;
  hero.ownership = { player: 3 };
  const other = { id: 'other', uuid: 'Actor.other', name: 'Other', type: 'character', ownership: { player: 3 }, getFlag: (_scope, key) => key === 'party' ? true : [] };
  hero.getFlag = (_scope, key) => key === 'party' ? true : (hero.flags.innReceipts || []);
  game.actors = [hero, other]; game.user.character = hero;
  globalThis.canvas = { tokens: { controlled: [{ actor: hero }] } };
  data.accessible = true;
  const app = new InnApp({ mode: 'shop', innId: 'inn' }); await app._prepareContext({});
  await app._act('add', target('meal')); await app._act('review'); expect(app.review).toBeTruthy();
  globalThis.canvas.tokens.controlled = [{ actor: other }];
  await app._prepareContext({}); expect(app.actor).toBe(other); expect(app.review).toBeNull();
  flags.innCarts = { 'Actor%2Ehero:inn': { lines: [{ offeringId: 'meal', quantity: 1, nights: 1, guestIds: [] }], pending: { operationId: 'pending-1', innId: 'inn', actorId: hero.id, actorUuid: hero.uuid, quote: { totalCp: 20 } } } };
  const pending = new InnApp({ mode: 'shop', innId: 'inn' }); await pending._prepareContext({});
  expect(pending.actor).toBe(hero); expect(pending.pending.operationId).toBe('pending-1');
});

it('chooses and removes an establishment image on the unsaved draft only', async () => {
  const picker = vi.fn(function Picker(options) { this.options = options; this.render = vi.fn(() => this); });
  globalThis.foundry.applications.apps = { FilePicker: { implementation: picker } };
  const app = new InnApp({ mode: 'creator', draft: { ...data, proprietorImg: 'proprietor.png', img: '' } });
  app.element = element();
  const captureDraft = vi.spyOn(app, '_captureDraft');
  await app._act('establishmentImage');
  expect(picker).toHaveBeenCalledWith(expect.objectContaining({ type: 'image', current: '' }));
  picker.mock.instances[0].options.callback('tavern-sign.webp');
  expect(app.draft.img).toBe('tavern-sign.webp');
  expect(captureDraft).toHaveBeenCalledTimes(2);
  await app._act('removeEstablishmentImage');
  expect(app.draft.img).toBe('');
  expect(app.draft.proprietorImg).toBe('proprietor.png');
});

it('does not allow non-GMs to invoke establishment image controls', async () => {
  const picker = vi.fn();
  globalThis.foundry.applications.apps = { FilePicker: { implementation: picker } };
  game.user.isGM = false;
  const draft = { ...data, img: 'existing.webp' };
  const app = new InnApp({ mode: 'creator', draft });
  app.element = element();
  await app._act('removeEstablishmentImage');
  await app._act('establishmentImage');
  expect(app.draft.img).toBe('existing.webp');
  expect(picker).not.toHaveBeenCalled();
});

it('shows a discounted today special and keeps the original price visible', async () => {
  data.accessible = true;
  data.todaySpecial = { offeringId: 'meal', discountPercent: 25 };
  const app = new InnApp({ mode: 'shop', innId: 'inn', actor: hero });
  const context = await app._prepareContext({});
  expect(context.todaySpecial).toMatchObject({ id: 'meal', name: 'Stew' });
  expect(context.offerings[0]).toMatchObject({ special: true, price: '1 sp 5 cp', originalPrice: '2 sp', specialDiscount: 25 });
});

it('keeps revealed rumors public while GM notes stay in the private draft', async () => {
  data.revealedRumors = [{ id: 'rumor', text: 'The cellar door is older than the inn.' }];
  const app = new InnApp({ mode: 'creator', innId: 'inn', draft: data });
  app.privateDraft = { revision: 0, notes: 'Secret ledger', rumors: [{ id: 'rumor', text: 'The cellar door is older than the inn.', revealed: true }, { id: 'secret', text: 'A sealed tunnel lies below.', revealed: false }] };
  app.element = element();
  app._syncPublicRumors();
  expect(app.draft.revealedRumors).toEqual([{ id: 'rumor', text: 'The cellar door is older than the inn.' }]);
  expect(app.privateDraft.notes).toBe('Secret ledger');
  expect(app.privateDraft.rumors).toHaveLength(2);
});


it('blocks closed service in the cart and review while preview remains usable', async () => {
  data.accessible = true; data.openingHours = { enabled: true, openMinute: 480, closeMinute: 1380, override: 'auto' };
  const app = new InnApp({ mode: 'shop', innId: 'inn' }); await app._prepareContext({});
  app.cart = [{ offeringId: 'meal', quantity: 1, nights: 1, guestIds: [] }];
  app.review = { revision: data.revision, lines: [], totalCp: 20 };
  const context = await app._prepareContext({});
  expect(context.opening.open).toBe(false); expect(context.canReview).toBe(false); expect(context.offerings[0].unavailable).toBe(true); expect(app.review).toBeNull();
  await expect(app._act('add', target('meal'))).rejects.toThrow('Closed for service');
  await expect(app._act('review')).rejects.toThrow('Closed for service');
  const preview = new InnApp({ mode: 'shop', innId: 'inn', draft: data, preview: true }); await preview._prepareContext({});
  await preview._act('add', target('meal')); await preview._act('review'); expect(preview.review.totalCp).toBe(20);
  expect(checkoutInn).not.toHaveBeenCalled();
});

it('clears a removed special and excludes private material from player and preview context', async () => {
  const creator = new InnApp({ mode: 'creator', draft: { ...data, todaySpecial: { offeringId: 'meal', discountPercent: 20 } } }); creator.element = element();
  await creator._act('removeOffering', target('meal')); expect(creator.draft.todaySpecial.offeringId).toBeNull();
  const shop = new InnApp({ mode: 'shop', innId: 'inn' }); shop.privateDraft = { notes: 'Hidden note', rumors: [{ id: 'secret', text: 'Hidden rumor', revealed: false }] };
  game.user.isGM = false;
  const context = await shop._prepareContext({}); expect(context.privateDraft).toBeNull(); expect(JSON.stringify(context)).not.toContain('Hidden note'); expect(JSON.stringify(context)).not.toContain('Hidden rumor');
});

it('shows active party stays with guests, payer, amenities, and in-game expiry even when closed', async () => {
  data.openingHours = { enabled: false, openMinute: 480, closeMinute: 1380, override: 'closed' };
  data.offerings[1].amenities = 'Private bath and locked chest';
  data.bookings = [{ id: 'stay', actorId: 'hero', actorName: 'Hero', createdAt: 0, endsAt: 86400, checkedOut: false, guests: [{ id: 'guest', name: 'Guest' }], lines: [{ offeringId: 'room', quantity: 1, capacity: 2, nights: 1, unitPriceCp: 100 }] }];
  const app = new InnApp({ mode: 'shop', innId: 'inn' }); const context = await app._prepareContext({});
  expect(context.bookings[0]).toMatchObject({ actorName: 'Hero', guestsLabel: 'Guest', offeringsLabel: '1 × Private room', endsLabel: 'Day 2, 00:00' });
  expect(context.draftOfferings.find(entry => entry.id === 'room').amenities).toBe('Private bath and locked chest');
});
