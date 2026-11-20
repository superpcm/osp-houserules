import { emptyInn, getInnData, getInnDocument, listInns, createInn, saveInn, quoteInn, checkoutInn, endInnBooking, availableInnQuantity, innSpecialtyReservations, innOfferingPrice, innOpeningStatus } from '../inventory/inn.js';
import { getInnPrivate, saveInnPrivate } from '../inventory/inn-private.js';
import { generateInnOfferings, INN_TYPES, INN_SETTLEMENTS, INN_SIZES, INN_QUALITIES, INN_CHARACTERS, INN_SUPPLIES, innProfileDefaults } from '../inventory/inn-profiles.js';
import { replenishInn } from '../inventory/inn-replenishment.js';
import { carriedFunds } from '../inventory/store-payment.js';
import { eligibleStoreItem, formatSp } from '../inventory/store.js';
import { listInventoryOperations, recoverInventoryOperation } from '../inventory/inventory-authority.js';
import { formatWorldCalendarDate } from '../calendar/calendar-authority.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const SCOPE = 'osp-houserules';
const clone = value => structuredClone(value);
const money = formatSp;
const values = collection => collection?.contents ?? (typeof collection?.values === 'function' ? [...collection.values()] : Array.isArray(collection) ? collection : []);
const kinds = ['meal', 'drink', 'room', 'bed', 'stabling', 'takeaway'];
const labels = { meal: 'Meals', drink: 'Drinks', room: 'Rooms', bed: 'Beds', stabling: 'Stabling', takeaway: 'Takeaway' };
const nightKinds = ['room', 'bed', 'stabling'];
const now = () => Number(game.time?.worldTime) || 0;
const partyActors = () => values(game.actors).filter(actor => actor.type === 'character' && (game.user.isGM || actor.getFlag?.(SCOPE, 'party') === true));
const payers = () => partyActors().filter(actor => game.user.isGM || (actor.testUserPermission?.(game.user, 'OWNER') ?? ((actor.ownership?.[game.user.id] ?? actor.ownership?.default ?? 0) >= 3)));
const actorById = id => values(game.actors).find(actor => actor.id === id || actor.uuid === id) || null;
const ownedShopper = actor => actor?.type === 'character' && (game.user.isGM || ((actor.getFlag?.(SCOPE, 'party') === true) && (actor.testUserPermission?.(game.user, 'OWNER') ?? ((actor.ownership?.[game.user.id] ?? actor.ownership?.default ?? 0) >= 3))));
const currentShopper = () => {
  const candidates = values(globalThis.canvas?.tokens?.controlled).map(token => token?.actor).filter(ownedShopper);
  if (candidates.length === 1) return candidates[0];
  const assigned = actorById(game.user?.character?.id || game.user?.character?.uuid);
  return ownedShopper(assigned) ? assigned : null;
};
const keyFor = (actor, innId) => [actor.uuid || actor.id, innId].map(value => encodeURIComponent(value).replace(/\./g, '%2E')).join(':');
const cartWrites = new Map();
const options = (choices, selected) => choices.map(id => ({ id, label: id === 'both' ? 'Inn & Tavern' : id[0].toUpperCase() + id.slice(1), selected: id === selected }));
const stayLabel = end => `${Math.max(0, Math.ceil((end - now()) / 3600))} in-game hours remaining`;
const worldTimeLabel = value => formatWorldCalendarDate(Number(value || 0));
const committedReceipt = (actor, inn, pending) => pending && (inn?.history || []).some(receipt => receipt.id === pending.operationId) && (actor?.getFlag?.(SCOPE, 'innReceipts') || []).find(receipt => receipt.id === pending.operationId);

export class InnApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ mode = 'manager', innId = null, actor = null, draft = null, preview = false, ...rest } = {}) {
    super(rest);
    Object.assign(this, { mode, innId, actor, preview, draft: draft ? clone(draft) : null, privateDraft: { notes: '', rumors: [] }, privateLoaded: false, cart: [], review: null, pending: null, receipt: null, error: '', busy: false, tab: 'meal', search: '', cartKey: null, generationResult: null });
    this.generator = { ...innProfileDefaults(), enabled: false, includeManual: true, seed: String(Date.now()) };
  }
  static DEFAULT_OPTIONS = { classes: ['osp', 'osp-store-app', 'osp-inn-app'], window: { title: 'Inns & Taverns', resizable: true }, position: { width: 1240, height: 800 }, actions: { innAction: InnApp._action, viewAsPlayer: InnApp._viewAsPlayer } };
  static PARTS = { app: { template: 'systems/osp-houserules/templates/apps/inn-app.html' } };
  _getHeaderControls() {
    const controls = super._getHeaderControls?.() || [];
    if (game.user?.isGM && !this.preview && ['creator', 'shop'].includes(this.mode) && this.inn) controls.unshift({ label: 'View as Player', action: 'viewAsPlayer', icon: 'fas fa-eye' });
    return controls;
  }
  get title() { return this.mode === 'creator' ? 'Inn & Tavern Creator' : this.mode === 'shop' ? this.inn?.name || 'Inn & Tavern' : 'Inns & Taverns'; }
  get inn() { return this.draft || (getInnDocument(this.innId) ? getInnData(getInnDocument(this.innId)) : null); }
  async _saveCart() {
    if (this.preview || !this.actor || !this.innId) return;
    const user = game.user, key = keyFor(this.actor, this.innId), saved = clone({ lines: this.cart, pending: this.pending });
    const previous = cartWrites.get(user.id) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => { const carts = clone(user.getFlag(SCOPE, 'innCarts') || {}); carts[key] = saved; await user.setFlag(SCOPE, 'innCarts', carts); });
    cartWrites.set(user.id, write); await write;
  }
  async _prepareContext(opts) {
    const context = await super._prepareContext(opts), realGM = Boolean(game.user?.isGM), gm = realGM && !this.preview;
    if (!realGM && ['creator', 'tools'].includes(this.mode)) { this.mode = 'manager'; this.draft = null; }
    const inn = this.inn, opening = inn ? innOpeningStatus(inn, now()) : { open: true, label: 'Open 24 hours (in-game)', reason: 'Open 24 hours.' }, accessible = Boolean(this.preview || inn?.accessible), actors = payers(), party = partyActors();
    if (gm && ['creator', 'tools'].includes(this.mode) && this.innId && !this.privateLoaded) { this.privateDraft = clone(getInnPrivate(this.innId) || { notes: '', rumors: [] }); this.privateLoaded = true; }
    if (this.mode === 'shop' && !this.preview) {
      const carts = game.user.getFlag?.(SCOPE, 'innCarts') || {};
      const pendingEntry = Object.values(carts).find(saved => saved?.pending?.operationId && saved.pending.innId === this.innId);
      const pendingActor = pendingEntry?.pending?.actorUuid ? actorById(pendingEntry.pending.actorUuid) : pendingEntry?.pending?.actorId ? actorById(pendingEntry.pending.actorId) : null;
      const shopper = pendingActor || currentShopper();
      const shopperChanged = (shopper?.uuid || shopper?.id || null) !== (this.actor?.uuid || this.actor?.id || null);
      if (shopperChanged) this.review = null;
      this.actor = shopper;
      const key = this.actor && this.innId ? keyFor(this.actor, this.innId) : null;
      if (key !== this.cartKey) { const saved = key ? carts[key] : null; this.cart = clone(saved?.lines || []); this.pending = clone(saved?.pending || null); this.cartKey = key; this.review = null; }
      const receipt = committedReceipt(this.actor, inn, this.pending);
      if (receipt) { this.receipt = receipt; this.cart = []; this.pending = null; this.review = null; await this._saveCart(); }
    }
    const funds = !this.preview && this.actor ? carriedFunds(this.actor) : { success: true, totalCp: 0 };
    const quote = inn && this.cart.length ? quoteInn(inn, this.cart) : { success: false, reason: this.cart.length ? 'Establishment unavailable.' : '' };
    if (this.review && ((!this.preview && !opening.open) || !accessible || this.review.revision !== inn?.revision || !quote.success)) { this.review = null; this.error = 'The order or availability changed. Review your order again.'; }
    const guestChoices = party.length ? party : this.preview ? [{ id: '__preview_guest__', name: 'Preview guest' }] : [];
    const catalog = values(game.items).filter(eligibleStoreItem);
    const todaySpecial = inn?.offerings?.find(offering => offering.id === inn.todaySpecial?.offeringId && offering.enabled && ['meal', 'drink'].includes(offering.kind));
    const specialDiscount = todaySpecial ? inn.todaySpecial.discountPercent : 0;
    const specialOptions = (inn?.offerings || []).filter(offering => offering.enabled && ['meal', 'drink'].includes(offering.kind)).map(offering => ({ id: offering.id, name: offering.name, selected: offering.id === inn?.todaySpecial?.offeringId }));
    const offerings = (inn?.offerings || []).filter(offering => offering.enabled && accessible).map(offering => { const count = availableInnQuantity(inn, offering); const priceCp = innOfferingPrice(inn, offering); return { ...offering, kindLabel: labels[offering.kind], price: money(priceCp), originalPrice: money(offering.priceCp), special: todaySpecial?.id === offering.id, specialDiscount: todaySpecial?.id === offering.id ? specialDiscount : 0, nightly: nightKinds.includes(offering.kind), available: count === Infinity ? 'Unlimited' : `${count} available`, unavailable: count === 0 || (!this.preview && !opening.open) }; });
    if (!offerings.some(offering => offering.kind === this.tab)) this.tab = offerings[0]?.kind || 'meal';
    const cart = this.cart.map(line => { const offering = inn?.offerings.find(entry => entry.id === line.offeringId); const nightly = nightKinds.includes(offering?.kind); const unitPriceCp = offering ? innOfferingPrice(inn, offering) : 0; return { ...line, name: offering?.name || 'Unavailable offering', amenities: offering?.amenities || '', nightly, lodging: ['room', 'bed'].includes(offering?.kind), capacityLabel: `${line.quantity * (offering?.capacity || 1)} guest places`, total: money(unitPriceCp * line.quantity * (nightly ? line.nights : 1)), price: money(unitPriceCp), guests: guestChoices.map(actor => ({ id: actor.id, name: actor.name, checked: line.guestIds?.includes(actor.id) })) }; });
    const totalCp = quote.success ? quote.totalCp : this.cart.reduce((sum, line) => { const offering = inn?.offerings.find(entry => entry.id === line.offeringId); return sum + innOfferingPrice(inn, offering) * line.quantity * (nightKinds.includes(offering?.kind) ? line.nights : 1); }, 0);
    const draftOfferings = (inn?.offerings || []).map(offering => ({ ...offering, priceSp: offering.priceCp / 10, kindOptions: options(kinds, offering.kind), room: offering.kind === 'room', lodging: nightKinds.includes(offering.kind), takeaway: offering.kind === 'takeaway', catalogItems: catalog.map(item => ({ id: item.uuid || `Item.${item.id}`, name: item.name, selected: offering.catalogItemUuid === (item.uuid || `Item.${item.id}`) })) }));
    const liveInn = this.innId && getInnDocument(this.innId) ? getInnData(getInnDocument(this.innId)) : inn;
    const bookings = ((this.mode === 'creator' ? liveInn : inn)?.bookings || []).filter(booking => !booking.checkedOut && booking.endsAt > now()).map(booking => ({ ...booking, guestsLabel: booking.guests.map(guest => guest.name).join(', ') || 'Animals', remaining: stayLabel(booking.endsAt), endsLabel: worldTimeLabel(booking.endsAt), offeringsLabel: booking.lines.map(line => `${line.quantity} × ${inn?.offerings.find(offering => offering.id === line.offeringId)?.name || 'Lodging'}`).join(', ') }));
    const revealedRumors = (inn?.revealedRumors || []).filter(entry => entry.text?.trim());
    const clockValue = minute => `${String(Math.floor(Number(minute || 0) / 60)).padStart(2, '0')}:${String(Number(minute || 0) % 60).padStart(2, '0')}`;
    const history = this.preview ? [] : gm ? inn?.history || [] : this.actor?.getFlag?.(SCOPE, 'innReceipts')?.filter(entry => entry.innId === this.innId) || [];
    const presentReceipt = receipt => ({ ...receipt, total: money(receipt.totalCp), after: money(receipt.afterCp), lines: receipt.lines.map(line => ({ ...line, total: money(line.lineTotalCp), nightly: nightKinds.includes(line.kind), guestNames: (line.guestIds || []).map(id => party.find(actor => actor.id === id)?.name || (id === '__preview_guest__' ? 'Preview guest' : id)).join(', ') })) });
    const generatorFields = [['type', 'Establishment type', INN_TYPES], ['settlement', 'Settlement', INN_SETTLEMENTS], ['size', 'Size', INN_SIZES], ['quality', 'Quality', INN_QUALITIES], ['character', 'Local character', INN_CHARACTERS], ['supply', 'Supply', INN_SUPPLIES]].map(([field, label, choices]) => ({ field, label, choices: options(choices, this.generator[field]) }));
    Object.assign(context, { gm, manager: this.mode === 'manager', creator: this.mode === 'creator', shop: this.mode === 'shop', tools: this.mode === 'tools', inn, proprietorNameLines: String(inn?.proprietorName || '').trim().split(/\s+/).reduce((lines, word, index) => { if (!index) lines.push(word); else lines[1] = lines[1] ? `${lines[1]} ${word}` : word; return lines; }, []), innId: this.innId, accessible, preview: this.preview, busy: this.busy, pending: !!this.pending, error: this.error, search: this.search,
      inns: listInns({ gm }).map(document => ({ id: document.id, ...getInnData(document) })), typeOptions: options(INN_TYPES, inn?.type), kindOptions: kinds.map(kind => ({ id: kind, label: labels[kind] })), draftOfferings, bookings, opening, openTime: clockValue(inn?.openingHours?.openMinute), closeTime: clockValue(inn?.openingHours?.closeMinute), specialOptions, todaySpecial: todaySpecial ? { ...todaySpecial, price: money(innOfferingPrice(inn, todaySpecial)) } : null, privateDraft: gm && this.mode === 'creator' ? this.privateDraft : null, revealedRumors,
      actors: this.preview ? [] : actors.map(actor => ({ id: actor.id, name: actor.name, selected: actor.id === this.actor?.id })), actorName: this.preview ? 'Player preview' : this.pending ? `Pending purchase for ${this.actor?.name || 'the original character'}` : this.actor?.name || 'No party character assigned', availableMoney: money(funds.totalCp),
      offerings: offerings.filter(offering => offering.kind === this.tab && offering.name.toLowerCase().includes(this.search.toLowerCase())), tabs: kinds.filter(kind => offerings.some(offering => offering.kind === kind)).map(kind => ({ id: kind, label: labels[kind], selected: this.tab === kind, count: offerings.filter(offering => offering.kind === kind).length })), cart, total: money(totalCp), cartError: this.cart.length && !quote.success ? quote.reason : '',
      canReview: accessible && (this.preview || opening.open) && quote.success && !this.busy && !this.pending && (this.preview || !!this.actor && funds.success && funds.totalCp >= totalCp), remaining: money(Math.max(0, funds.totalCp - totalCp)), shortfall: !this.preview && totalCp > funds.totalCp ? money(totalCp - funds.totalCp) : null,
      review: this.review ? presentReceipt(this.review) : null, receipt: this.receipt ? presentReceipt(this.receipt) : null, history: [...history].reverse().map(presentReceipt),
      generator: this.generator, generatorFields, priceBounds: ['meal', 'drink', 'room', 'bed', 'stabling'].map(kind => ({ kind, label: labels[kind], minSp: (this.generator.priceBounds?.[kind]?.minCp ?? 0) / 10, maxSp: (this.generator.priceBounds?.[kind]?.maxCp ?? 10000) / 10 })),
      generated: (this.generationResult?.offerings || []).map(offering => ({ ...offering, kindLabel: labels[offering.kind], price: money(offering.priceCp) })), hasGenerated: !!this.generationResult,
      recovery: gm ? listInventoryOperations().filter(operation => ['innCheckout', 'innSave', 'innReplenish', 'innEndBooking'].includes(operation.action)) : [] });
    return context;
  }
  _onFirstRender() {
    this._hooks = ['updateJournalEntry', 'updateActor', 'updateItem', 'createItem', 'deleteItem', 'updateWorldTime'].map(event => [event, Hooks.on(event, () => { if (this.mode === 'creator' && !this.busy) { this._captureDraft(); this._capturePrivate(); } this.render(); })]);
    this._hooks.push(['controlToken', Hooks.on('controlToken', token => { if (this.mode === 'shop' && !this.preview && token?.actor && ownedShopper(token.actor)) this.render(); })]);
    this._hooks.push(['updateUser', Hooks.on('updateUser', user => { if (user?.id === game.user?.id && this.mode === 'shop' && !this.preview) this.render(); })]);
  }
  async close(options) { for (const [event, id] of this._hooks || []) Hooks.off(event, id); return super.close(options); }
  _onRender() {
    const root = this.element;
    root.querySelectorAll('form').forEach(form => form.addEventListener('submit', event => event.preventDefault()));
    root.querySelectorAll('[data-inn-field], [data-offering-field], [data-private-field]').forEach(input => input.addEventListener('change', () => { this._captureDraft(); this._capturePrivate(); if (input.dataset.offeringField === 'kind') this.render(); }));
    root.querySelector('[data-inn-search]')?.addEventListener('input', event => { this.search = event.target.value; this._filterMenu(); });
    root.querySelectorAll('[data-cart-field], [data-guest]').forEach(input => input.addEventListener('change', () => this._guard(async () => { if (this.pending || this.busy) return; const line = this.cart.find(entry => entry.offeringId === input.dataset.offeringId); if (!line) return; if (input.dataset.cartField) line[input.dataset.cartField] = Number(input.value); else line.guestIds = [...root.querySelectorAll('[data-guest]:checked')].filter(box => box.dataset.offeringId === line.offeringId).map(box => box.value); this.review = null; await this._saveCart(); this.render(); })));
    root.querySelectorAll('[data-generator-field], [data-price-bound]').forEach(input => input.addEventListener('change', () => { this._captureGenerator(); this.generationResult = null; }));
  }
  _filterMenu() { this.element.querySelectorAll('[data-menu-name]').forEach(row => { row.hidden = !row.dataset.menuName.toLowerCase().includes(this.search.toLowerCase()); }); }
  _captureDraft() {
    if (!this.draft || !this.element) return;
    for (const input of this.element.querySelectorAll('[data-inn-field]')) {
      const field = input.dataset.innField;
      if (field === 'todaySpecialOfferingId') { this.draft.todaySpecial ??= { offeringId: null, discountPercent: 0 }; this.draft.todaySpecial.offeringId = input.value || null; }
      else if (field === 'todaySpecialDiscount') { this.draft.todaySpecial ??= { offeringId: null, discountPercent: 0 }; this.draft.todaySpecial.discountPercent = Math.max(0, Math.min(100, Number(input.value) || 0)); }
      else if (field === 'openingEnabled') { this.draft.openingHours ??= { enabled: false, openMinute: 480, closeMinute: 1380, override: 'auto' }; this.draft.openingHours.enabled = input.checked; }
      else if (field === 'openingOverride') { this.draft.openingHours ??= { enabled: false, openMinute: 480, closeMinute: 1380, override: 'auto' }; this.draft.openingHours.override = input.value; }
      else if (field === 'openingOpenMinute' || field === 'openingCloseMinute') { this.draft.openingHours ??= { enabled: false, openMinute: 480, closeMinute: 1380, override: 'auto' }; const [hours, minutes] = String(input.value || '00:00').split(':').map(Number); this.draft.openingHours[field === 'openingOpenMinute' ? 'openMinute' : 'closeMinute'] = Math.max(0, Math.min(1439, (hours || 0) * 60 + (minutes || 0))); }
      else this.draft[field] = input.type === 'checkbox' ? input.checked : input.value;
    }
    for (const input of this.element.querySelectorAll('[data-offering-field]')) { const offering = this.draft.offerings.find(entry => entry.id === input.dataset.offeringId); if (!offering) continue; const field = input.dataset.offeringField; offering[field] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? (field === 'quantity' && input.value.trim() === '' ? null : field === 'priceCp' ? Math.round(Number(input.value) * 10) : Number(input.value)) : input.value; }
  }
  _clearInvalidSpecial() {
    if (this.draft?.todaySpecial?.offeringId && !this.draft.offerings.some(offering => offering.id === this.draft.todaySpecial.offeringId && offering.enabled && ['meal', 'drink'].includes(offering.kind))) this.draft.todaySpecial = { offeringId: null, discountPercent: 0 };
  }
  _capturePrivate() {
    if (!this.element || !this.privateDraft) return;
    const notes = this.element.querySelector('[data-private-field="notes"]');
    if (notes) this.privateDraft.notes = notes.value;
    this.element.querySelectorAll('[data-private-rumor-id]').forEach(input => {
      const rumor = this.privateDraft.rumors?.find(entry => entry.id === input.dataset.privateRumorId);
      if (rumor && input.dataset.privateField === 'text') rumor.text = input.value;
      if (rumor && input.dataset.privateField === 'revealed') rumor.revealed = input.checked;
    });
  }
  _syncPublicRumors() {
    this._capturePrivate();
    this.draft.revealedRumors = (this.privateDraft?.rumors || []).filter(entry => entry.revealed && String(entry.text || '').trim()).map(entry => ({ id: entry.id, text: String(entry.text).trim() }));
  }
  _captureGenerator() {
    if (!this.element) return;
    for (const input of this.element.querySelectorAll('[data-generator-field]')) this.generator[input.dataset.generatorField] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    for (const input of this.element.querySelectorAll('[data-price-bound]')) { this.generator.priceBounds ??= {}; this.generator.priceBounds[input.dataset.kind] ??= {}; this.generator.priceBounds[input.dataset.kind][input.dataset.priceBound] = Math.round(Number(input.value) * 10); }
  }
  static async _action(event, target) { await this._guard(() => this._act(target.dataset.verb, target)); }
  static async _viewAsPlayer(event, target) { await this._guard(() => this._act('viewAsPlayer', target)); }
  async _guard(action) { try { this.error = ''; await action(); } catch (error) { this.error = error.message || 'Unable to complete the action.'; ui.notifications.error(this.error); this.render(); } }
  _requireSavedDraft() { this._captureDraft(); if (!this.innId || JSON.stringify(this.draft) !== JSON.stringify(getInnData(getInnDocument(this.innId)))) throw new Error('Save or reload the draft before changing live bookings or replenishing.'); }
  async _act(verb, target = { dataset: {} }) {
    if (this.busy) return;
    if (!this.preview && ['add', 'review', 'complete'].includes(verb) && !(verb === 'complete' && this.pending) && !innOpeningStatus(this.inn, now()).open) throw new Error(innOpeningStatus(this.inn, now()).reason);
    const gm = Boolean(game.user.isGM) && !this.preview;
    if (verb === 'cancel' || verb === 'close') return this.close();
    if (verb === 'back') { await this.close(); return this.preview ? undefined : new InnApp().render({ force: true }); }
    if (verb === 'directoryPreview' && gm && this.mode === 'manager') {
      const document = getInnDocument(target.dataset.innId);
      if (!document) throw new Error('Establishment unavailable.');
      return new InnApp({ mode: 'shop', innId: document.id, draft: getInnData(document), preview: true }).render({ force: true });
    }
    if (verb === 'viewAsPlayer' && gm && ['creator', 'shop'].includes(this.mode) && this.inn) {
      if (this.mode === 'creator') return this._act('preview', target);
      return new InnApp({ mode: 'shop', innId: this.innId, draft: clone(this.inn), preview: true }).render({ force: true });
    }
    if (verb === 'create' && gm) return new InnApp({ mode: 'creator', draft: emptyInn() }).render({ force: true });
    if (verb === 'edit' && gm) { const document = getInnDocument(target.dataset.innId); if (!document) throw new Error('Establishment unavailable.'); return new InnApp({ mode: 'creator', innId: document.id, draft: getInnData(document) }).render({ force: true }); }
    if (verb === 'open') { const document = getInnDocument(target.dataset.innId); if (!document || !getInnData(document).accessible) throw new Error('This establishment is not accessible.'); return new InnApp({ mode: 'shop', innId: document.id }).render({ force: true }); }
    if (verb === 'reload' && gm) { this.draft = getInnData(getInnDocument(this.innId)); this.privateDraft = clone(getInnPrivate(this.innId)); this.privateLoaded = true; return this.render(); }
    if (verb === 'save' && gm && this.draft) {
      this._captureDraft(); this._clearInvalidSpecial(); this._syncPublicRumors(); this.busy = true; this.render();
      try { let result; const desiredAccess = this.draft.accessible; if (!this.innId) { result = await createInn(this.draft); if (!result.success) throw new Error(result.reason); this.innId = result.inn.id; this.draft = getInnData(result.inn); if (desiredAccess) { this.draft.accessible = true; result = await saveInn(this.innId, this.draft, this.draft.revision); if (!result.success) throw new Error(result.reason); } } else { result = await saveInn(this.innId, this.draft, this.draft.revision); if (!result.success) throw new Error(result.reason); }
        this.draft = getInnData(getInnDocument(this.innId));
        const privateResult = await saveInnPrivate(this.innId, this.privateDraft, this.privateDraft?.revision);
        if (!privateResult?.success) throw new Error(`The establishment was saved, but GM notes were not saved. ${privateResult?.reason || 'Try saving again.'}`);
        this.privateDraft = clone(privateResult.data || this.privateDraft); this.privateLoaded = true; ui.notifications.info('Establishment saved.'); }
      finally { this.busy = false; this.render(); } return;
    }
    if (verb === 'access' && gm) { const data = getInnData(getInnDocument(target.dataset.innId)); data.accessible = !data.accessible; const result = await saveInn(target.dataset.innId, data, data.revision); if (!result.success) throw new Error(result.reason); return this.render(); }
    if (verb === 'preview' && gm && this.draft) { this._captureDraft(); this._clearInvalidSpecial(); this._syncPublicRumors(); return new InnApp({ mode: 'shop', draft: this.draft, innId: this.innId, preview: true }).render({ force: true }); }
    if (verb === 'tools' && gm && this.draft) { this._captureDraft(); const app = new InnApp({ mode: 'tools' }); app.creator = this; app.generator = { ...this.generator, ...this.draft.replenishment, type: this.draft.type, seed: String(Date.now()) }; app.generatorBase = JSON.stringify(this.draft.offerings); return app.render({ force: true }); }
    if (verb === 'generate' && gm && this.mode === 'tools') { this._captureGenerator(); const result = generateInnOfferings({ ...this.generator, ...innSpecialtyReservations(this.creator?.innId ?? null, this.generator.includeManual !== false ? (this.creator?.draft.offerings ?? []).filter(offering => !offering.managed) : []) }); if (!result.success) throw new Error(result.reason); this.generationResult = result; return this.render(); }
    if (verb === 'applyGenerated' && gm && this.mode === 'tools' && this.creator) {
      if (!this.generationResult) throw new Error('Preview the menu first.');
      if (this.generatorBase !== JSON.stringify(this.creator.draft.offerings)) throw new Error('Offerings changed. Reopen generation and preview again.');
      const activeIds = new Set(this.creator.draft.bookings.filter(booking => !booking.checkedOut && booking.endsAt > now()).flatMap(booking => booking.lines.map(line => line.offeringId)));
      const preserved = this.creator.draft.offerings.filter(offering => activeIds.has(offering.id) || this.generator.includeManual !== false && !offering.managed);
      const keptIds = new Set(preserved.map(offering => offering.id));
      this.creator.draft.offerings = [...preserved, ...clone(this.generationResult.offerings).filter(offering => !keptIds.has(offering.id))];
      if (this.creator.draft.offerings.length > 200) throw new Error('An establishment supports at most 200 offerings.');
      this.creator._clearInvalidSpecial();
      this.creator.draft.type = this.generator.type;
      this.creator.draft.replenishment = { ...clone(this.generationResult.settings), enabled: this.generator.enabled === true, lastReplenishedWorldTime: now() };
      this.creator.render(); return this.close();
    }
    if (verb === 'addOffering' && gm && this.draft) { this._captureDraft(); const kind = target.dataset.kind; if (!kinds.includes(kind)) return; this.draft.offerings.push({ id: foundry.utils.randomID(), name: 'New offering', description: '', kind, priceCp: 10, quantity: nightKinds.includes(kind) ? 1 : null, capacity: 1, enabled: true, managed: false }); return this.render(); }
    if (verb === 'removeOffering' && gm && this.draft) { this._captureDraft(); if (this.draft.bookings.some(booking => !booking.checkedOut && booking.endsAt > now() && booking.lines.some(line => line.offeringId === target.dataset.offeringId))) throw new Error('An active booking protects this offering.'); this.draft.offerings = this.draft.offerings.filter(offering => offering.id !== target.dataset.offeringId); this._clearInvalidSpecial(); return this.render(); }
    if (verb === 'establishmentImage' && gm && this.draft) { this._captureDraft(); const Picker = foundry.applications.apps.FilePicker.implementation; return new Picker({ type: 'image', current: this.draft.img, callback: path => { this._captureDraft(); this.draft.img = path; this.render(); } }).render(true); }
    if (verb === 'removeEstablishmentImage' && gm && this.draft) { this._captureDraft(); this.draft.img = ''; return this.render(); }
    if (verb === 'addRumor' && gm && this.draft) { this._captureDraft(); this._capturePrivate(); this.privateDraft.rumors ??= []; this.privateDraft.rumors.push({ id: foundry.utils.randomID(), text: '', revealed: false }); return this.render(); }
    if (verb === 'removeRumor' && gm && this.draft) { this._captureDraft(); this._capturePrivate(); this.privateDraft.rumors = (this.privateDraft.rumors || []).filter(entry => entry.id !== target.dataset.rumorId); return this.render(); }
    if (verb === 'proprietorImage' && gm && this.draft) { this._captureDraft(); const Picker = foundry.applications.apps.FilePicker.implementation; return new Picker({ type: 'image', current: this.draft.proprietorImg, callback: path => { this.draft.proprietorImg = path; this.render(); } }).render(true); }
    if (verb === 'endBooking' && gm) { this._requireSavedDraft(); const result = await endInnBooking(this.innId, target.dataset.bookingId); if (!result.success) throw new Error(result.reason); this.draft = getInnData(getInnDocument(this.innId)); return this.render(); }
    if (verb === 'replenish' && gm) { this._requireSavedDraft(); const result = await replenishInn(this.innId, { force: true }); if (!result.success) throw new Error(result.reason); this.draft = getInnData(getInnDocument(this.innId)); return this.render(); }
    if (verb === 'recover' && gm) { const result = await recoverInventoryOperation(target.dataset.operationId); if (!result.success) throw new Error(result.reason); return this.render(); }
    if (this.mode !== 'shop') return;
    if (verb === 'retry') return this._retryCheckout();
    if (this.pending) return;
    if (['viewSign', 'viewProprietor'].includes(verb) && this.mode === 'shop') {
      const inn = this.preview ? this.draft : getInnData(getInnDocument(this.innId));
      const image = verb === 'viewSign' ? inn?.img : inn?.proprietorImg;
      if (!image || !this.preview && !inn.accessible && !gm) return;
      const Viewer = foundry.applications.apps?.ImagePopout;
      if (Viewer) return new Viewer({ src: image, window: { title: verb === 'viewSign' ? inn.name : inn.proprietorName || 'Proprietor' } }).render({ force: true });
      return;
    }
    if (verb === 'tab') { this.tab = target.dataset.kind; return this.render(); }
    if (verb === 'dismissReceipt') { this.receipt = null; return this.render(); }
    if (verb === 'backCart') { this.review = null; return this.render(); }
    if (['add', 'increment', 'decrement', 'removeLine', 'clear'].includes(verb)) {
      if (verb === 'add' && !(this.preview || this.inn?.accessible)) throw new Error('This establishment is not accessible.');
      const offering = this.inn?.offerings.find(entry => entry.id === target.dataset.offeringId);
      if (verb === 'add' && (!offering?.enabled || availableInnQuantity(this.inn, offering) === 0)) throw new Error('That offering is unavailable.');
      let line = this.cart.find(entry => entry.offeringId === target.dataset.offeringId);
      if (verb === 'clear') this.cart = [];
      else if (verb === 'removeLine') this.cart = this.cart.filter(entry => entry !== line);
      else if (line) line.quantity += verb === 'decrement' ? -1 : 1;
      else if (verb === 'add') { const guest = this.preview ? partyActors()[0]?.id || '__preview_guest__' : this.actor?.id; line = { offeringId: offering.id, quantity: 1, nights: 1, guestIds: ['room', 'bed'].includes(offering.kind) && guest ? [guest] : [] }; this.cart.push(line); }
      this.cart = this.cart.filter(entry => entry.quantity > 0); this.review = null; this.receipt = null; await this._saveCart(); return this.render();
    }
    if (verb === 'review') { if (!(this.preview || this.inn?.accessible)) throw new Error('This establishment is not accessible.'); if (!this.preview) { const shopper = currentShopper(); if (!shopper || (shopper.uuid || shopper.id) !== (this.actor?.uuid || this.actor?.id)) throw new Error('Select exactly one owned party character token before reviewing.'); this.actor = shopper; } const quote = quoteInn(this.inn, this.cart); if (!quote.success) throw new Error(quote.reason); if (!this.preview) { const funds = this.actor && carriedFunds(this.actor); if (!funds?.success || funds.totalCp < quote.totalCp) throw new Error('There are not enough carried coins for this order.'); } this.review = quote; return this.render(); }
    if (verb === 'complete') { if (this.preview) throw new Error('Preview mode cannot complete a purchase.'); if (this.pending) return this._retryCheckout(); const shopper = currentShopper(); if (!shopper || (shopper.uuid || shopper.id) !== (this.actor?.uuid || this.actor?.id)) throw new Error('Select exactly one owned party character token before completing the order.'); if (!this.review || !this.actor || !this.inn?.accessible) throw new Error('Review an accessible order first.'); this.pending = { operationId: foundry.utils.randomID(), innId: this.innId, actorId: this.actor.id, actorUuid: this.actor.uuid, quote: clone(this.review) }; await this._saveCart(); return this._retryCheckout(); }
  }
  async _retryCheckout() {
    if (this.preview || !this.pending || !this.actor) return;
    this.busy = true; this.render();
    try {
      const operationId = this.pending.operationId;
      const result = await checkoutInn(this.actor, this.innId, this.pending.quote, operationId);
      const receipt = committedReceipt(this.actor, this.inn, { operationId });
      if (receipt) { this.receipt = receipt; this.pending = null; this.review = null; this.cart = []; await this._saveCart(); }
      else if (!result.success) { if (!result.retryable && !result.recoveryRequired) { this.pending = null; this.review = null; await this._saveCart(); } throw new Error(result.reason || 'The order could not be completed.'); }
      else this.error = 'Waiting for the purchase receipt. Check safely before making another payment.';
    } finally { this.busy = false; this.render(); }
  }
}
export function openInnManager() { return new InnApp().render({ force: true }); }
