import { emptyStable, listStables, getStableData, getStableDocument, createStable, saveStable, stableItemKind, entryFromStableItem, quoteStable, checkoutStable, quoteStableSale, completeStableSale, endStableBooking, availableStableBoarding, stableOpeningStatus, STABLE_SCOPE, STABLE_RECEIPTS_FLAG } from '../inventory/stable.js';
import { STABLE_PROFILES, SETTLEMENTS, STABLE_SIZES, generateStableStock, normalizeStableProfile } from '../inventory/stable-profiles.js';
import { carriedFunds } from '../inventory/store-payment.js';
import { formatSp } from '../inventory/store.js';
import { listInventoryOperations, recoverInventoryOperation } from '../inventory/inventory-authority.js';
import livestockCatalog from '../../../data/livestock.json';
import tackCatalog from '../../../data/tack.json';
import vehicleCatalog from '../../../data/vehicles.json';
import miscCatalog from '../../../data/misc.json';
import { resolveItemImagePath, resolveFullResolutionImagePath } from '../cards/item-image-path.js';
import { ItemCardDialog } from '../cards/item-card-dialog.js';
import { getVehicleAttachmentOptions, getVehicleKind, vehicleDestination } from '../inventory/vehicle-lashing.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const clone = value => structuredClone(value);
const values = collection => collection?.contents ?? (typeof collection?.values === 'function' ? [...collection.values()] : Array.isArray(collection) ? collection : []);
const now = () => Number(game.time?.worldTime) || 0;
const money = formatSp;
const identity = actor => actor?.uuid || actor?.id || '';
const labels = { animal: 'Animals', tack: 'Tack', vehicle: 'Vehicles', parts: 'Parts & Supplies', boarding: 'Boarding', sale: 'Sell to stable' };
const keyFor = (actor, id) => [identity(actor), id].map(value => encodeURIComponent(value || '').replace(/\./g, '%2E')).join(':');
const writes = new Map();
const owned = actor => Boolean(actor?.type === 'character' && (game.user.isGM || actor.getFlag?.(STABLE_SCOPE, 'party') === true && (actor.testUserPermission?.(game.user, 'OWNER') ?? (actor.ownership?.[game.user.id] ?? actor.ownership?.default ?? 0) >= 3)));
const actorByReference = reference => {
  const tokenActors = values(globalThis.canvas?.tokens?.placeables).map(token => token.actor).filter(Boolean);
  return [...values(game.actors), ...tokenActors].find(actor => identity(actor) === reference || actor.id === reference) ?? null;
};
export function currentStableShopper() {
  const selected = values(globalThis.canvas?.tokens?.controlled).map(token => token?.actor).filter(owned);
  if (selected.length === 1) return selected[0];
  const assigned = game.user?.character;
  return owned(assigned) ? assigned : null;
}
const profileLabel = id => STABLE_PROFILES.find(profile => profile.id === id)?.label || id;
const clock = minute => String(Math.floor(Number(minute || 0) / 60)).padStart(2, '0') + ':' + String(Number(minute || 0) % 60).padStart(2, '0');
const worldDate = value => 'Day ' + (Math.floor(Number(value) / 86400) + 1) + ', ' + clock(Math.floor(((Number(value) % 86400 + 86400) % 86400) / 60));
const committedReceipt = (actor, stable, pending) => pending && stable?.history?.some(receipt => receipt.id === pending.operationId) && (actor?.getFlag?.(STABLE_SCOPE, STABLE_RECEIPTS_FLAG) || []).find(receipt => receipt.id === pending.operationId);

// Bundled offerings remain available without creating or modifying world catalog items.
export function stableCatalog() {
  const world = values(game.items).filter(item => entryFromStableItem(item));
  const keys = new Set(world.map(item => item.name.trim().toLowerCase() + '|' + item.type));
  const bundled = [...livestockCatalog, ...tackCatalog, ...vehicleCatalog, ...miscCatalog.filter(item => item.system?.tags?.includes('tack') || item.system?.tags?.includes('vehicle-parts'))].filter(item => !keys.has(item.name.trim().toLowerCase() + '|' + item.type));
  return [...world, ...bundled.map(item => ({ ...clone(item), uuid: 'stable-catalog:' + encodeURIComponent(item.type + ':' + item.name) }))];
}

export class StableApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ mode = 'manager', stableId = null, draft = null, preview = false, ...rest } = {}) {
    super(rest);
    Object.assign(this, { mode, stableId, draft: draft && clone(draft), preview, actor: null, tab: 'animal', search: '', catalogFilter: '', cart: [], sale: [], review: null, saleReview: null, pending: null, receipt: null, error: '', busy: false, generated: null, catalogSelection: new Set(), cartKey: null });
    this.profile = normalizeStableProfile(draft?.stocking || {});
    this.previewActor = { id: 'preview', uuid: 'Preview.stable', type: 'character', name: 'Preview character', items: livestockCatalog.filter(item => ['Horse, Riding', 'Mule'].includes(item.name)).map((item, i) => ({ ...clone(item), id: 'preview-animal-' + i, system: { ...clone(item.system), quantity: 1 } })) };
  }
  static DEFAULT_OPTIONS = { classes: ['osp', 'osp-store-app', 'osp-stable-app'], window: { title: 'Stables & Livestock', resizable: true }, position: { width: 1240, height: 820 }, actions: { stableAction: StableApp._action, viewAsPlayer: StableApp._viewAsPlayer } };
  static PARTS = { app: { template: 'systems/osp-houserules/templates/apps/stable-app.html' } };
  _getHeaderControls() {
    const controls = super._getHeaderControls?.() || [];
    if (game.user?.isGM && !this.preview && ['creator', 'shop'].includes(this.mode) && this.stable) controls.unshift({ label: 'View as Player', action: 'viewAsPlayer', icon: 'fas fa-eye' });
    return controls;
  }
  get stable() { return this.draft || (this.stableId && getStableDocument(this.stableId) ? getStableData(getStableDocument(this.stableId)) : null); }
  get title() { return this.mode === 'creator' ? 'Stable & Livestock Creator' : this.mode === 'shop' ? this.stable?.name || 'Stable & Livestock' : 'Stables & Livestock'; }
  get shoppingActor() { return this.preview ? this.previewActor : this.actor; }
  async _saveCart() {
    if (this.preview || !this.actor || !this.stableId || !game.user?.setFlag) return;
    const user = game.user, key = keyFor(this.actor, this.stableId), snapshot = clone({ lines: this.cart, sale: this.sale, pending: this.pending });
    const previous = writes.get(user.id) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      const carts = clone(user.getFlag?.(STABLE_SCOPE, 'stableCarts') || {}); carts[key] = snapshot;
      await user.setFlag(STABLE_SCOPE, 'stableCarts', carts);
    });
    writes.set(user.id, write); await write;
  }
  async _syncShopper() {
    if (this.preview) return;
    const carts = game.user.getFlag?.(STABLE_SCOPE, 'stableCarts') || {};
    const pendingCart = Object.values(carts).find(saved => saved?.pending?.stableId === this.stableId && saved.pending.operationId);
    const original = pendingCart?.pending && actorByReference(pendingCart.pending.actorUuid || pendingCart.pending.actorId);
    const candidate = original || currentStableShopper(), key = candidate ? keyFor(candidate, this.stableId) : null;
    if (key !== this.cartKey && !this.busy) {
      this.actor = candidate; this.cartKey = key;
      const saved = key ? carts[key] : null;
      this.cart = clone(saved?.lines || []); this.sale = clone(saved?.sale || []); this.pending = clone(saved?.pending || null);
      this.review = null; this.saleReview = null;
    }
    const receipt = committedReceipt(this.actor, this.stable, this.pending);
    if (receipt) { this.receipt = receipt; this.pending = null; this.cart = []; this.sale = []; this.review = null; this.saleReview = null; await this._saveCart(); }
  }
  _destinations(line, entries) {
    const lineEntry = entries.find(entry => entry.id === line.entryId);
    const lineItemData = line.itemData || lineEntry?.itemData;
    const root = ['animal', 'vehicle'].includes(stableItemKind(lineItemData));
    if (root) return [{ id: '', label: 'Livestock & transport', selected: true }];
    const candidates = [{ id: '', label: 'Find a compatible location' }];
    for (const item of values(this.shoppingActor?.items)) {
      if (!['container', 'livestock'].includes(item.type)) continue;
      candidates.push({ id: item.id, label: item.name });
      if (getVehicleKind(item) !== 'none') for (const option of getVehicleAttachmentOptions(lineItemData, item, values(this.shoppingActor?.items))) {
        candidates.push({ id: vehicleDestination(item.id, option), label: `${item.name} — ${option.label}` });
      }
    }
    for (const other of this.cart) {
      const entry = entries.find(entry => entry.id === other.entryId);
      if (entry && other !== line && other.quantity === 1 && ['livestock', 'container'].includes(entry.itemData.type)) {
        const hostId = 'cart:' + entry.id;
        candidates.push({ id: hostId, label: entry.itemData.name + ' (in cart)' });
        if (getVehicleKind(entry.itemData) !== 'none' && Number(other.quantity) === 1) for (const option of getVehicleAttachmentOptions(lineItemData, { ...entry.itemData, id: hostId }, [...values(this.shoppingActor?.items), { ...entry.itemData, id: hostId }])) {
          candidates.push({ id: vehicleDestination(hostId, option), label: `${entry.itemData.name} (in cart) — ${option.label}` });
        }
      }
    }
    return candidates.map(option => ({ ...option, selected: option.id === (line.destination || '') }));
  }
  async _prepareContext(options) {
    const context = await super._prepareContext(options), realGM = Boolean(game.user?.isGM), gm = realGM && !this.preview;
    if (!realGM && !this.preview && ['creator', 'tools'].includes(this.mode)) { this.mode = 'manager'; this.draft = null; }
    if (this.mode === 'shop') await this._syncShopper();
    const stable = this.stable, entries = stable?.entries || [], opening = stable ? stableOpeningStatus(stable, now()) : { open: true };
    if (this.preview) {
      const productKinds = ['animal', 'tack', 'vehicle', 'parts'];
      const firstProductKind = entries.filter(entry => !entry.hidden).map(entry => stableItemKind(entry.itemData)).find(kind => productKinds.includes(kind));
      const tabSupported = productKinds.includes(this.tab) && entries.some(entry => !entry.hidden && stableItemKind(entry.itemData) === this.tab)
        || this.tab === 'boarding' && stable?.boarding?.enabled
        || this.tab === 'sale' && stable?.buysFromPlayers;
      if (!tabSupported) this.tab = firstProductKind || (stable?.boarding?.enabled ? 'boarding' : stable?.buysFromPlayers ? 'sale' : this.tab);
    }
    const canShop = Boolean(this.preview || stable?.accessible), canAct = canShop && (this.preview || opening.open && this.actor) && !this.busy && !this.pending;
    const catalogItems = stableCatalog().filter(item => (!this.catalogFilter || stableItemKind(item) === this.catalogFilter) && (!this.search || item.name.toLowerCase().includes(this.search.toLowerCase()))).map(item => {
      const id = item.uuid || item.id, policy = this.profile.neverStock.includes(id) ? 'never' : this.profile.alwaysStock.includes(id) ? 'always' : 'auto';
      return { id, name: item.name, kindLabel: labels[stableItemKind(item)], selected: this.catalogSelection.has(id), policy, availability: this.profile.availabilityOverrides[encodeURIComponent(id)] ?? this.profile.availabilityOverrides[id] ?? '' };
    });
    const priceCoins = priceCp => {
      const totalCp = Math.max(0, Math.trunc(Number(priceCp) || 0)), silver = Math.floor(totalCp / 10), copper = totalCp % 10;
      if (!silver && !copper) return [{ quantity: 0, denomination: 'silver', label: 'sp', img: 'systems/osp-houserules/assets/images/treasure/silver-coins.webp' }];
      return [
        silver ? { quantity: silver, denomination: 'silver', label: 'sp', img: 'systems/osp-houserules/assets/images/treasure/silver-coins.webp' } : null,
        copper ? { quantity: copper, denomination: 'copper', label: 'cp', img: 'systems/osp-houserules/assets/images/treasure/copper-coins.webp' } : null,
      ].filter(Boolean);
    };
    const decorate = entry => {
      const kind = stableItemKind(entry.itemData), priceCp = entry.customPrice != null ? Math.round(entry.customPrice * 10) : Math.round(Number(entry.itemData?.system?.cost || 0) * 10);
      return { ...entry, name: entry.itemData.name, animal: kind === 'animal', kindLabel: labels[kind], priceSp: entry.customPrice ?? '', basePrice: Number(entry.itemData.system.cost), price: money(priceCp), priceCoins: priceCoins(priceCp), stockLabel: entry.stock + ' available', canAdd: Boolean(canAct && entry.stock > (this.cart.find(line => line.entryId === entry.id)?.quantity || 0)) };
    };
    const products = entries.filter(entry => !entry.hidden && stableItemKind(entry.itemData) === this.tab && (!this.search || entry.itemData.name.toLowerCase().includes(this.search.toLowerCase()))).map(decorate);
    const quote = stable && this.cart.length ? quoteStable(stable, this.cart, { actor: this.shoppingActor }) : { success: false, totalCp: 0 };
    const cart = this.cart.map((line, index) => {
      if (line.kind === 'boarding') return { ...line, index, boarding: true, name: 'Boarding: ' + line.animalIds.map(id => values(this.shoppingActor?.items).find(item => item.id === id)?.name || 'Unavailable animal').join(', '), total: money(stable.boarding.priceCp * line.animalIds.length * line.nights), price: money(stable.boarding.priceCp) };
      const entry = entries.find(entry => entry.id === line.entryId), unit = entry ? decorate(entry).price : money(0);
      return { ...line, index, name: entry?.itemData.name || 'Unavailable product', price: unit, total: money((entry?.customPrice != null ? Math.round(entry.customPrice * 10) : Math.round(Number(entry?.itemData.system.cost || 0) * 10)) * line.quantity), destinations: this._destinations(line, entries) };
    });
    const animals = values(this.shoppingActor?.items).filter(item => item.type === 'livestock');
    const ownedAnimals = animals.filter(item => Number(item.system.quantity) === 1).map(item => ({ id: item.id, name: item.name }));
    const saleItems = values(this.shoppingActor?.items).filter(item => stableItemKind(item)).map(item => {
      const selected = this.sale.find(line => line.itemId === item.id), offer = stable ? quoteStableSale(this.shoppingActor, { ...stable, accessible: this.preview || stable.accessible }, [{ itemId: item.id, quantity: 1 }]) : null;
      return { id: item.id, name: item.name, available: Number(item.system?.quantity || 1), quantity: selected?.quantity || 1, selected: Boolean(selected), eligible: Boolean(offer?.success), offer: offer?.success ? money(offer.totalCp) : 'Empty and unequip before selling' };
    });
    const funds = this.actor ? carriedFunds(this.actor) : { success: false, totalCp: 0 };
    const review = this.review && { ...this.review, lines: this.review.lines.map(line => ({ ...line, total: money(line.lineTotalCp), placement: this.review.placements?.find(placed => placed.entryId === line.entryId)?.label })) };
    const saleReview = this.saleReview && { ...this.saleReview, lines: this.saleReview.lines.map(line => ({ ...line, total: money(line.unitPriceCp * line.quantity) })) };
    const totalCp = saleReview?.totalCp ?? review?.totalCp ?? quote.totalCp ?? 0;
    const bookings = (stable?.bookings || []).filter(booking => !booking.checkedOut && booking.endsAt > now()).map(booking => ({ ...booking, animals: booking.animalNames.join(', '), expires: worldDate(booking.endsAt), remaining: Math.ceil((booking.endsAt - now()) / 3600) + ' in-game hours', canEnd: gm && !this.preview }));
    const history = this.preview ? [] : (stable?.history || []).filter(receipt => gm || receipt.actorId === this.actor?.id).slice().reverse().map(receipt => ({ ...receipt, total: money(receipt.totalCp), after: money(receipt.afterCp), date: new Date(receipt.timestamp).toLocaleString(), sale: receipt.kind === 'sale' }));
    const generator = { ...this.profile };
    const generated = this.generated && { ...this.generated, entries: this.generated.entries?.map(decorate) };
    return Object.assign(context, { proprietorNameLines: String(stable?.proprietorName || '').trim().split(/\s+/).reduce((lines, word, index) => { if (!index) lines.push(word); else lines[1] = lines[1] ? `${lines[1]} ${word}` : word; return lines; }, []), gm, manager: this.mode === 'manager', creator: this.mode === 'creator', tools: this.mode === 'tools', shop: this.mode === 'shop', preview: this.preview, canShop, canAct, busy: this.busy, pending: Boolean(this.pending), stable, stableId: this.stableId,
      stables: listStables({ gm }).map(doc => ({ id: doc.id, ...getStableData(doc), profileLabel: profileLabel(getStableData(doc).profileId) })),
      profiles: STABLE_PROFILES.map(profile => ({ ...profile, selected: profile.id === (this.mode === 'tools' ? generator.profileId : stable?.profileId) })),
      settlements: SETTLEMENTS.map(id => ({ id, selected: id === generator.settlement })), sizes: STABLE_SIZES.map(id => ({ id, selected: id === generator.size })),
      entries: entries.map(decorate), products, catalogItems, selectedCount: this.catalogSelection.size, catalogFilter: this.catalogFilter, selectedTab: this.tab, search: this.search,
      tabs: Object.entries(labels).filter(([kind]) => kind === 'boarding' ? stable?.boarding.enabled : kind === 'sale' ? stable?.buysFromPlayers : entries.some(entry => !entry.hidden && stableItemKind(entry.itemData) === kind)).map(([id, label]) => ({ id, label, selected: this.tab === id })),
      isBoarding: this.tab === 'boarding', isSale: this.tab === 'sale', opening, openTime: clock(stable?.openingHours?.openMinute), closeTime: clock(stable?.openingHours?.closeMinute), boardingPriceSp: Number(stable?.boarding?.priceCp || 0) / 10, boardingPrice: money(stable?.boarding?.priceCp), availableBoarding: stable ? availableStableBoarding(stable, now()) : 0,
      actorName: this.preview ? 'Player preview' : (this.pending ? 'Pending order for ' : '') + (this.actor?.name || 'No party character assigned'), availableMoney: this.preview ? 'Preview — no payment' : money(funds.totalCp), cart, total: money(totalCp), cartError: this.cart.length && !quote.success ? quote.reason : '', shortfall: !this.preview && quote.success && quote.totalCp > funds.totalCp ? money(quote.totalCp - funds.totalCp) : null,
      canReview: Boolean(canAct && quote.success && (this.preview || funds.success && funds.totalCp >= quote.totalCp)), review, saleReview, saleItems, ownedAnimals, stackedAnimals: animals.some(item => Number(item.system.quantity) > 1), boarding: stable?.boarding, bookings, history, generator, generated, error: this.error,
      recovery: gm ? listInventoryOperations().filter(operation => String(operation.action).startsWith('stable')).map(operation => ({ ...operation, id: operation.operationId })) : [],
    });
  }
  _onFirstRender() {
    const refresh = () => { if (this.busy) return; if (this.mode === 'creator') this._captureDraft(); if (this.mode === 'tools') this._captureProfile(); this.review = null; this.saleReview = null; void this.render(); };
    this._hooks = ['updateJournalEntry', 'updateItem', 'createItem', 'deleteItem', 'controlToken', 'updateUser', 'updateWorldTime'].map(event => [event, globalThis.Hooks?.on?.(event, refresh)]);
  }
  async close(options) { for (const [event, id] of this._hooks || []) globalThis.Hooks?.off?.(event, id); return super.close(options); }
  async _guard(task) { try { this.error = ''; return await task(); } catch (error) { this.error = error.message || 'Unable to complete the action.'; globalThis.ui?.notifications?.warn?.(this.error); return this.render(); } }
  _onRender() {
    const root = this.element; if (!root) return;
    root.querySelectorAll('[data-stable-field], [data-entry-field]').forEach(input => input.addEventListener('change', () => { this._captureDraft(); void this.render(); }));
    root.querySelectorAll('[data-profile-field]').forEach(input => input.addEventListener('change', () => { const oldSize = this.profile.size; this._captureProfile(); if (oldSize !== this.profile.size) { const defaults = normalizeStableProfile({ size: this.profile.size }); for (const key of ['minProducts', 'maxProducts', 'minQuantity', 'maxQuantity']) this.profile[key] = defaults[key]; } this.generated = null; void this.render(); }));
    root.querySelectorAll('[data-stock-policy], [data-stock-availability]').forEach(input => input.addEventListener('change', () => {
      this._captureProfile(); const id = input.dataset.sourceId;
      if (input.hasAttribute('data-stock-policy')) {
        this.profile.neverStock = this.profile.neverStock.filter(value => value !== id); this.profile.alwaysStock = this.profile.alwaysStock.filter(value => value !== id);
        if (input.value === 'never') this.profile.neverStock.push(id); if (input.value === 'always') this.profile.alwaysStock.push(id);
      } else { delete this.profile.availabilityOverrides[id]; delete this.profile.availabilityOverrides[encodeURIComponent(id)]; if (input.value) this.profile.availabilityOverrides[encodeURIComponent(id)] = input.value; }
      this.generated = null; void this.render();
    }));
    root.querySelector('[data-stable-search]')?.addEventListener('change', event => { this._captureDraft(); this.search = event.target.value; void this.render(); });
    root.querySelector('[data-catalog-filter]')?.addEventListener('change', event => { this._captureDraft(); this.catalogFilter = event.target.value; void this.render(); });
    root.querySelectorAll('[data-cart-field]').forEach(input => input.addEventListener('change', () => this._guard(async () => {
      if (this.pending || this.busy) return; const line = this.cart[Number(input.dataset.cartIndex)]; if (!line) return;
      line[input.dataset.cartField] = input.dataset.cartField === 'destination' ? input.value : Number(input.value); this.review = null; await this._saveCart(); this.render();
    })));
    root.querySelectorAll('[data-sale-item], [data-sale-quantity]').forEach(input => input.addEventListener('change', () => this._guard(async () => {
      if (this.pending || this.busy) return; const id = input.dataset.saleItem || input.dataset.saleQuantity; let line = this.sale.find(line => line.itemId === id);
      if (input.dataset.saleItem) { if (input.checked && !line) this.sale.push({ itemId: id, quantity: 1 }); else if (!input.checked) this.sale = this.sale.filter(line => line.itemId !== id); }
      else if (line) line.quantity = Number(input.value);
      this.saleReview = null; await this._saveCart(); this.render();
    })));
    const drop = root.querySelector('[data-stable-sale-drop]');
    drop?.addEventListener('dragover', event => event.preventDefault());
    drop?.addEventListener('drop', event => this._guard(async () => {
      event.preventDefault(); if (this.preview || this.pending || this.busy) return;
      const data = globalThis.foundry?.applications?.ux?.TextEditor?.getDragEventData?.(event) ?? globalThis.TextEditor?.getDragEventData?.(event);
      const item = data?.uuid ? await globalThis.fromUuid?.(data.uuid) : null;
      if (!item || identity(item.actor) !== identity(this.actor) || !stableItemKind(item)) throw new Error('Drop an animal or equipment owned by the shopping character.');
      if (!this.sale.some(line => line.itemId === item.id)) this.sale.push({ itemId: item.id, quantity: 1 }); await this._saveCart(); this.render();
    }));
  }
  _captureDraft() {
    if (!this.draft || !this.element) return;
    for (const input of this.element.querySelectorAll('[data-stable-field]')) {
      const field = input.dataset.stableField, value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
      if (field.startsWith('boarding.')) this.draft.boarding[field.split('.')[1]] = field.endsWith('priceCp') ? Math.round(Number(value) * 10) : value;
      else if (field.startsWith('opening.')) { const key = field.split('.')[1]; if (input.type === 'time') { const [h, m] = input.value.split(':').map(Number); this.draft.openingHours[key] = h * 60 + m; } else this.draft.openingHours[key] = value; }
      else { this.draft[field] = value; if (field === 'profileId') this.draft.stocking.profileId = value; }
    }
    for (const input of this.element.querySelectorAll('[data-entry-field]')) {
      const entry = this.draft.entries.find(entry => entry.id === input.dataset.entryId); if (!entry) continue;
      const field = input.dataset.entryField;
      if (field === 'name') { entry.itemData.name = input.value; delete entry.name; }
      else if (['description', 'temperament'].includes(field)) entry.itemData.system[field] = input.value;
      else if (field === 'customPrice') { const price = input.value === '' ? null : Number(input.value); if (price !== entry.customPrice) entry.generatedPrice = false; entry.customPrice = price; }
      else if (field === 'stock') { const stock = Number(input.value); if (stock !== entry.stock) entry.customStock = true; entry.stock = stock; }
      else entry[field] = input.checked;
    }
  }
  _captureProfile() { if (!this.element) return; for (const input of this.element.querySelectorAll('[data-profile-field]')) this.profile[input.dataset.profileField] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value; }
  _requireCurrentShopper() { const actor = currentStableShopper(); if (!actor || identity(actor) !== identity(this.actor)) throw new Error('Control one owned party character, or assign your character, before reviewing or completing.'); return actor; }
  _dirty() { this._captureDraft(); const saved = getStableDocument(this.stableId); return !saved || JSON.stringify(this.draft) !== JSON.stringify(getStableData(saved)); }
  _pickImage(field, entryId = null) {
    this._captureDraft(); const entry = entryId && this.draft.entries.find(entry => entry.id === entryId);
    const Picker = globalThis.foundry?.applications?.apps?.FilePicker?.implementation || globalThis.FilePicker;
    if (!Picker) throw new Error('The image picker is unavailable.');
    return new Picker({ type: 'image', current: entry ? entry.itemData.img : this.draft[field], callback: path => { this._captureDraft(); if (entry) entry.itemData.img = path; else this.draft[field] = path; this.render(); } }).render(true);
  }
  static async _action(event, target) { return this._guard(() => this._act(target.dataset.verb, target)); }
  static async _viewAsPlayer(event, target) { return this._guard(() => this._act('viewAsPlayer', target)); }
  async _act(verb, target = { dataset: {} }) {
    if (this.busy) return;
    const gm = Boolean(game.user?.isGM) && !this.preview, stable = this.stable;
    this.error = '';
    if (['viewSign', 'viewProprietor'].includes(verb) && this.mode === 'shop') {
      const portrait = verb === 'viewProprietor';
      const image = portrait ? stable?.proprietorImg : stable?.img;
      if (!image) return;
      const Viewer = foundry.applications.apps?.ImagePopout;
      if (!Viewer) throw new Error('The image viewer is unavailable.');
      return new Viewer({ src: resolveFullResolutionImagePath(resolveItemImagePath(image)), window: { title: portrait ? (stable.proprietorName || `${stable.name} — Proprietor`) : `${stable.name} — Shop sign` } }).render({ force: true });
    }
    if (verb === 'details' && (this.mode === 'shop' || this.mode === 'creator' && gm)) {
      const entry = stable?.entries.find(entry => entry.id === target.dataset.entryId && (gm || !entry.hidden));
      if (entry && (this.preview || stable.accessible || gm)) return new ItemCardDialog(new Item.implementation(clone(entry.itemData))).render(true);
      return;
    }
    if (['close', 'cancel'].includes(verb)) return this.close();
    if (gm && verb === 'create') return new StableApp({ mode: 'creator', draft: emptyStable() }).render({ force: true });
    if (gm && verb === 'edit') { const document = getStableDocument(target.dataset.stableId); if (document) return new StableApp({ mode: 'creator', stableId: document.id, draft: getStableData(document) }).render({ force: true }); }
    if (verb === 'open') { const document = getStableDocument(target.dataset.stableId); if (!document || !getStableData(document).accessible) throw new Error('This stable is not accessible.'); return new StableApp({ mode: 'shop', stableId: document.id }).render({ force: true }); }
    if (verb === 'back') { await this.close(); return this.preview ? undefined : openStableManager(); }
    if (verb === 'directoryPreview' && gm && this.mode === 'manager') {
      const document = getStableDocument(target.dataset.stableId);
      if (!document) throw new Error('Establishment unavailable.');
      return new StableApp({ mode: 'shop', stableId: document.id, draft: getStableData(document), preview: true }).render({ force: true });
    }
    if (verb === 'viewAsPlayer' && gm && ['creator', 'shop'].includes(this.mode) && this.stable) {
      if (this.mode === 'creator') return this._act('preview', target);
      return new StableApp({ mode: 'shop', stableId: this.stableId, draft: clone(this.stable), preview: true }).render({ force: true });
    }
    if (gm && verb === 'save') {
      this._captureDraft(); this.busy = true; this.render();
      try { const result = this.stableId ? await saveStable(this.stableId, this.draft, this.draft.revision) : await createStable(this.draft); if (!result.success) throw new Error(result.reason); this.stableId ||= result.stable.id; this.draft = getStableData(getStableDocument(this.stableId)); }
      finally { this.busy = false; this.render(); } return;
    }
    if (gm && verb === 'reload') { if (this.stableId) this.draft = getStableData(getStableDocument(this.stableId)); return this.render(); }
    if (gm && verb === 'preview') { this._captureDraft(); return new StableApp({ mode: 'shop', stableId: this.stableId, draft: this.draft, preview: true }).render({ force: true }); }
    if (gm && verb === 'access') { const document = getStableDocument(target.dataset.stableId), data = getStableData(document); data.accessible = !data.accessible; const result = await saveStable(document.id, data, data.revision); if (!result.success) throw new Error(result.reason); return this.render(); }
    if (gm && ['establishmentImage', 'proprietorImage', 'entryImage'].includes(verb) && this.draft) return this._pickImage(verb === 'establishmentImage' ? 'img' : 'proprietorImg', verb === 'entryImage' ? target.dataset.entryId : null);
    if (gm && ['removeEstablishmentImage', 'removeProprietorImage'].includes(verb)) { this._captureDraft(); this.draft[verb === 'removeEstablishmentImage' ? 'img' : 'proprietorImg'] = ''; return this.render(); }
    if (gm && verb === 'catalogToggle') { this._captureDraft(); const id = target.dataset.catalogId; this.catalogSelection.has(id) ? this.catalogSelection.delete(id) : this.catalogSelection.add(id); return this.render(); }
    if (gm && verb === 'addSelected') { this._captureDraft(); const selected = stableCatalog().filter(item => this.catalogSelection.has(item.uuid || item.id)); if (this.draft.entries.length + selected.length > 200) throw new Error('A stable can have at most 200 products.'); for (const item of selected) { const entry = entryFromStableItem(item); if (entry) this.draft.entries.push(entry); } this.catalogSelection.clear(); return this.render(); }
    if (gm && verb === 'removeEntry') { this._captureDraft(); this.draft.entries = this.draft.entries.filter(entry => entry.id !== target.dataset.entryId); return this.render(); }
    if (gm && verb === 'individualizeEntry') { this._captureDraft(); const entry = this.draft.entries.find(entry => entry.id === target.dataset.entryId); if (entry && stableItemKind(entry.itemData) === 'animal') { entry.individual = !entry.individual; entry.itemData.system.unique = entry.individual; entry.managed = false; entry.stock = entry.individual ? Math.min(1, entry.stock) : entry.stock; } return this.render(); }
    if (gm && verb === 'tools') { this._captureDraft(); const app = new StableApp({ mode: 'tools', stableId: this.stableId, draft: this.draft }); app.creator = this; app.profile = normalizeStableProfile({ ...this.draft.stocking, profileId: this.draft.profileId }); return app.render({ force: true }); }
    if (gm && verb === 'generate') { this._captureProfile(); this.generated = generateStableStock(stableCatalog(), this.profile, this.draft?.entries || []); if (!this.generated.success) throw new Error(this.generated.reason); return this.render(); }
    if (gm && verb === 'applyGenerated') { if (!this.generated?.success) throw new Error('Preview stock first.'); const parent = this.creator || this; parent._captureDraft(); parent.draft.entries = clone(this.generated.entries); parent.draft.stocking = { ...clone(this.generated.settings), lastRestockedWorldTime: now() }; parent.draft.profileId = this.generated.settings.profileId; parent.render(); return this.close(); }
    if (gm && verb === 'replenish') { if (this._dirty()) throw new Error('Save or reload your draft before restocking saved stock.'); const { restockStable } = await import('../inventory/stable-replenishment.js'); const result = await restockStable(this.stableId, { force: true }); if (!result.success) throw new Error(result.reason); this.draft = getStableData(getStableDocument(this.stableId)); return this.render(); }
    if (gm && verb === 'endBooking') { if (this.preview) throw new Error('Preview cannot change boarding.'); if (this.mode === 'creator' && this._dirty()) throw new Error('Save or reload your draft before checking out an animal.'); const result = await endStableBooking(this.stableId, target.dataset.bookingId); if (!result.success) throw new Error(result.reason); if (this.draft) this.draft = getStableData(getStableDocument(this.stableId)); return this.render(); }
    if (gm && verb === 'recover') { if (this.preview) throw new Error('Preview cannot recover real transactions.'); const result = await recoverInventoryOperation(target.dataset.operationId); if (!result.success) throw new Error(result.reason); return this.render(); }
    if (this.mode !== 'shop') return;
    if (verb === 'retry') return this._retryCheckout();
    if (this.pending) throw new Error('Check the pending transaction before changing this order.');
    if (verb === 'tab') { this.tab = target.dataset.kind; return this.render(); }
    if (verb === 'backCart') { this.review = null; this.saleReview = null; return this.render(); }
    if (verb === 'clear') { this.cart = []; this.sale = []; this.review = null; this.saleReview = null; await this._saveCart(); return this.render(); }
    if (verb === 'removeLine') { this.cart.splice(Number(target.dataset.cartIndex), 1); this.review = null; await this._saveCart(); return this.render(); }
    if (!this.preview && (!stable?.accessible || !stableOpeningStatus(stable, now()).open)) throw new Error('This stable is not open for new transactions.');
    if (verb === 'add') { const entry = stable.entries.find(entry => entry.id === target.dataset.entryId); if (!entry || entry.hidden) return; const line = this.cart.find(line => line.entryId === entry.id); if ((line?.quantity || 0) >= entry.stock) throw new Error('There is no more stock available.'); if (line) line.quantity += 1; else this.cart.push({ entryId: entry.id, quantity: 1, destination: '' }); this.review = null; this.saleReview = null; await this._saveCart(); return this.render(); }
    if (verb === 'addBoarding') { const animalId = this.element?.querySelector('[data-boarding-animal]')?.value, nights = Number(this.element?.querySelector('[data-boarding-nights]')?.value || 1); if (!animalId) throw new Error('Choose an owned animal first.'); const line = this.cart.find(line => line.kind === 'boarding'); if (line) { line.animalIds = [...new Set([...line.animalIds, animalId])]; line.nights = nights; } else this.cart.push({ kind: 'boarding', animalIds: [animalId], nights }); this.review = null; await this._saveCart(); return this.render(); }
    if (verb === 'review') {
      if (!this.preview) this._requireCurrentShopper();
      const quote = quoteStable(stable, this.cart, { actor: this.shoppingActor }); if (!quote.success) throw new Error(quote.reason);
      if (!this.preview) {
        const funds = carriedFunds(this.actor); if (!funds.success || funds.totalCp < quote.totalCp) throw new Error('There are not enough carried coins.');
        const { planStablePlacement } = await import('../inventory/stable-placement.js');
        const lines = quote.lines.filter(line => line.kind !== 'boarding');
        const placed = lines.length ? await planStablePlacement(this.actor, lines) : { success: true, placements: [] };
        if (!placed.success) throw new Error(placed.reason);
        for (const line of quote.lines) { const destination = placed.placements.find(placed => placed.entryId === line.entryId); if (destination) line.destination = destination.destination; }
        quote.placements = placed.placements;
      }
      this.review = quote; this.saleReview = null; return this.render();
    }
    if (verb === 'saleReview') { if (!this.preview) this._requireCurrentShopper(); const quote = quoteStableSale(this.shoppingActor, { ...stable, accessible: this.preview || stable.accessible }, this.sale); if (!quote.success) throw new Error(quote.reason); this.saleReview = quote; this.review = null; return this.render(); }
    if (['complete', 'saleComplete'].includes(verb)) {
      if (this.preview) throw new Error('Preview mode cannot complete a purchase or sale.');
      this._requireCurrentShopper(); const quote = verb === 'saleComplete' ? this.saleReview : this.review;
      if (!quote) throw new Error('Review the order first.');
      this.pending = { operationId: foundry.utils.randomID(), kind: verb === 'saleComplete' ? 'sale' : 'purchase', stableId: this.stableId, actorId: this.actor.id, actorUuid: this.actor.uuid, quote: clone(quote) };
      await this._saveCart(); return this._retryCheckout();
    }
  }
  async _retryCheckout() {
    if (this.preview) throw new Error('Preview mode cannot complete a purchase or sale.');
    if (!this.pending || !this.actor || identity(this.actor) !== (this.pending.actorUuid || this.pending.actorId)) return;
    this.busy = true; this.render();
    try {
      const pending = this.pending, result = await (pending.kind === 'sale' ? completeStableSale : checkoutStable)(this.actor, this.stableId, pending.quote, pending.operationId);
      const receipt = committedReceipt(this.actor, this.stable, pending);
      if (receipt) { this.receipt = receipt; this.pending = null; this.review = null; this.saleReview = null; this.cart = []; this.sale = []; await this._saveCart(); }
      else if (!result.success) { if (!result.retryable && !result.recoveryRequired) { this.pending = null; this.review = null; this.saleReview = null; await this._saveCart(); } throw new Error(result.reason || 'The transaction did not complete.'); }
      else this.error = 'Waiting for the receipt. Use Check safely before making another transaction.';
    } finally { this.busy = false; this.render(); }
  }
}
export function openStableManager() { return new StableApp().render({ force: true }); }
