import { emptyStore, getStoreData, getStoreDocument, listStores, eligibleStoreItem, entryFromItem, unitPriceCp, quoteStore, formatSp, createStore, duplicateStore, saveStore, checkoutStore } from '../inventory/store.js';
import { carriedFunds, stageStorePayment } from '../inventory/store-payment.js';
import { loadStoreCart, saveStoreCart, receiptForPending, cartLineQuote } from '../inventory/store-cart.js';
import { planStorePlacement, validateStorePlacement } from '../inventory/store-placement.js';
import { listInventoryOperations, recoverInventoryOperation } from '../inventory/inventory-authority.js';
import { ItemCardDialog } from '../cards/item-card-dialog.js';
import { STOCK_PROFILES, SETTLEMENTS, STORE_SIZES, profileDefaults, generateStoreStock, randomizeStoreStock, randomizeStorePrices } from '../inventory/store-profiles.js';
import { ECONOMIES, MERCHANT_WEALTH, SUPPLY_LEVELS, DEMAND_LEVELS, STORE_EVENTS, profileEnvironmentDefaults, profileSourceKey, profileSourceUuid, profileRarityOverride } from '../inventory/store-profile-rules.js';
import { applyRestockPlan, restockStore } from '../inventory/store-restocking.js';
import { loadStockingCatalog } from '../inventory/catalog-stocking.js';
import { quoteStoreSale, completeStoreSale, loadStoreSaleIntent, saveStoreSaleIntent, receiptForSaleIntent } from '../inventory/store-sale.js';
import { isArrowAmmo } from '../inventory/arrow-bundle.js';
import { isSaleBundle, saleBundleUnit } from '../inventory/sale-bundle.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const clone = value => structuredClone(value);
const SCOPE = 'osp-houserules';
const FALLBACK = 'icons/svg/item-bag.svg';
const category = type => ({ weapon: 'Weapons', armor: 'Armor', ammunition: 'Ammunition', clothing: 'Clothing', container: 'Containers', item: 'Gear' }[type] || 'Gear');
const actorsForShopping = () => game.actors.filter(actor => actor.type === 'character' && actor.isOwner && (game.user.isGM || actor.getFlag(SCOPE, 'party') === true));
const money = cp => formatSp(cp);

/** One window family keeps the creator, catalog, review, and receipt in the same ledger. */
export class StoreApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ mode = 'manager', storeId = null, actor = null, draft = null, preview = false, ...options } = {}) {
    super(options);
    this.mode = mode;
    this.storeId = storeId;
    this.actor = actor;
    this.preview = preview;
    this.draft = draft ? clone(draft) : null;
    this.search = '';
    this.filter = 'All';
    this.error = '';
    this.busy = false;
    this.review = null;
    this.lastReceipt = null;
    this.previewCart = { lines: [], pending: null };
    this.tradeMode = 'buy';
    this.sellLine = null;
    this.saleReview = null;
    this.toolMode = 'stock';
    this.generatorOptions = { ...profileEnvironmentDefaults(), profileId: 'general', settlement: 'town', size: 'medium', seed: '', minStock: 1, maxStock: 12, unavailableChance: 0, minPricePercent: 80, maxPricePercent: 125, roundingCp: 1, preserveLimited: true, preserveCustomPrices: true, includeUnlimited: true, replaceInventory: false, enabled: true, restockDays: 7, repriceOnRestock: false };
    this.generationResult = null;
    this.advancedOpen = false;
    this.profileItemSearch = '';
  }

  static DEFAULT_OPTIONS = {
    classes: ['osp', 'osp-store-app'],
    window: { title: 'Stores', resizable: true },
    position: { width: 1240, height: 800 },
    actions: { storeAction: StoreApp._action, viewAsPlayer: StoreApp._viewAsPlayer },
  };
  static PARTS = { app: { template: 'systems/osp-houserules/templates/apps/store-app.html' } };
  _getHeaderControls() {
    const controls = super._getHeaderControls?.() || [];
    if (game.user?.isGM && !this.preview && ['creator', 'shop'].includes(this.mode) && this.store) controls.unshift({ label: 'View as Player', action: 'viewAsPlayer', icon: 'fas fa-eye' });
    return controls;
  }
  get title() { return this.mode === 'creator' ? 'Store Creator' : this.mode === 'manager' ? 'Stores' : this.store?.name || 'Store'; }
  get store() { return this.draft || (this.storeId && getStoreDocument(this.storeId) ? getStoreData(getStoreDocument(this.storeId)) : null); }
  get cart() { return this.preview || !this.actor ? clone(this.previewCart) : loadStoreCart(this.actor, this.storeId); }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const gm = Boolean(game.user.isGM) && !this.preview;
    // A crafted UI event cannot open creator/catalog modes for a player.
    if (!gm && ['creator', 'picker', 'tools'].includes(this.mode)) this.mode = 'manager';
    const stores = listStores({ gm });
    const store = this.store;
    const shop = this.mode === 'shop';
    const available = Boolean(this.preview || store?.accessible && stores.some(doc => doc.id === this.storeId));
    const actors = actorsForShopping();
    if (shop && !this.preview && (!this.actor || !actors.some(actor => actor.uuid === this.actor.uuid))) {
      this.actor = actors.find(actor => actor.id === game.user.character?.id) || actors[0] || null;
      this.review = null;
    }
    let cart = this.cart;
    const receipt = this.actor && receiptForPending(this.actor, cart);
    if (receipt) {
      this.lastReceipt = receipt;
      cart = { lines: [], pending: null };
      await this._saveCart(cart);
      this.review = null;
    }
    if (this.review && (!available || this.review.revision !== store?.revision)) {
      this.review = null;
      this.error = available ? 'The store changed. Review your cart again before purchasing.' : 'This store is no longer accessible. Your cart is saved.';
    }
    let saleIntent = this.actor && loadStoreSaleIntent(this.actor, this.storeId);
    const saleReceipt = this.actor && receiptForSaleIntent(this.actor, saleIntent);
    if (saleReceipt) {
      this.lastReceipt = saleReceipt; this.saleReview = null; this.sellLine = null;
      await saveStoreSaleIntent(this.actor, this.storeId, null); saleIntent = null;
    }
    if (saleIntent) this.tradeMode = 'sell';
    if (this.saleReview && (!available || !store?.buysFromPlayers || this.saleReview.revision !== store.revision)) this.saleReview = null;
    const funds = this.actor ? carriedFunds(this.actor) : { success: true, gold: 0, silver: 0, copper: 0, totalCp: 0 };
    const entries = (store?.entries || []).filter(entry => gm && this.mode === 'creator' || !entry.hidden).map(entry => ({
      ...entry, name: entry.itemData.name, img: entry.itemData.img || FALLBACK, category: category(entry.itemData.type),
      price: money(unitPriceCp(store, entry)), stockLabel: entry.stock === null ? 'Unlimited' : `${entry.stock} bundles left`, bundleQuantity: entry.bundleQuantity ?? 1, isSaleBundle: isSaleBundle(entry.itemData), saleUnit: saleBundleUnit(entry.itemData),
      isLimited: entry.stock !== null, custom: entry.customPrice !== null,
      basePrice: entry.itemData.system.cost ?? 0, unavailable: entry.stock === 0,
    }));
    const quote = store ? quoteStore(store, cart.lines) : null;
    const totalCp = quote?.success ? quote.totalCp : 0;
    const destinations = [
      { id: '', label: 'Suggest a location' }, { id: '__open_gear__', label: 'Wear or carry' },
      ...(this.actor?.items.filter(item => item.type === 'container' || item.type === 'clothing' && item.system.capacity || item.type === 'livestock') || []).map(item => ({ id: item.id, label: item.name })),
      ...cart.lines.filter(line => line.quantity === 1).map(line => store?.entries.find(entry => entry.id === line.entryId)).filter(entry => entry && (entry.itemData.type === 'container' || entry.itemData.type === 'clothing' && entry.itemData.system.capacity)).map(entry => ({ id: `cart:${entry.id}`, label: `${entry.itemData.name} (in cart)` })),
    ];
    const lines = cart.lines.map(line => {
      const entry = store?.entries.find(candidate => candidate.id === line.entryId && !candidate.hidden);
      const cp = entry ? unitPriceCp(store, entry) : null;
      const bundleQuantity = entry?.bundleQuantity ?? 1;
      return { ...line, name: entry?.itemData.name || line.name || 'Unavailable product', img: entry?.itemData.img || FALLBACK, bundleQuantity, isSaleBundle: Boolean(entry && isSaleBundle(entry.itemData)), saleUnit: entry ? saleBundleUnit(entry.itemData) : 'items', quantityLabel: isSaleBundle(entry?.itemData) ? `${line.quantity} bundles · ${line.quantity * bundleQuantity} ${saleBundleUnit(entry.itemData)}` : `${line.quantity}`,
        price: cp === null ? '—' : money(cp), priceLabel: isSaleBundle(entry?.itemData) ? `${money(cp)} / bundle` : `${money(cp)} each`, total: cp === null ? '—' : money(cp * line.quantity),
        unavailable: !entry || entry.stock !== null && line.quantity > entry.stock,
        destinations: destinations.filter(destination => destination.id !== `cart:${line.entryId}`).map(destination => ({ ...destination, selected: destination.id === (line.destination || '') })),
      };
    });
    const reviewLines = this.review?.lines.map(line => ({ ...line, name: line.itemData.name, bundleQuantity: line.bundleQuantity ?? 1, isSaleBundle: isSaleBundle(line.itemData), saleUnit: saleBundleUnit(line.itemData), quantityLabel: isSaleBundle(line.itemData) ? `${line.quantity} bundles · ${line.quantity * (line.bundleQuantity ?? 1)} ${saleBundleUnit(line.itemData)}` : `${line.quantity}`, total: money(line.unitPriceCp * line.quantity), placement: this.review.placements.find(placement => placement.entryId === line.entryId)?.label })) || [];
    const ownedReceipts = this.actor?.getFlag(SCOPE, 'storeReceipts') || [];
    const history = this.mode === 'history' ? gm ? store?.history || [] : ownedReceipts.filter(receipt => receipt.storeId === this.storeId) : [];
    const selectedOptions = (list, selected) => list.map(option => ({ ...option, selected: option.id === selected }));
    const ruleCatalog = this.mode === 'tools' && this.toolMode === 'profile' ? [...(game.items || [])].filter(eligibleStoreItem).map(item => ({ uuid: item.uuid || `Item.${item.id}`, name: item.name, category: category(item.type) })) : [];
    const configuredSources = [...new Set([...(this.generatorOptions.alwaysStock || []), ...(this.generatorOptions.neverStock || []), ...Object.keys(this.generatorOptions.rarityOverrides || {}).map(profileSourceUuid)])];
    for (const uuid of configuredSources) if (!ruleCatalog.some(item => item.uuid === uuid)) ruleCatalog.push({ uuid, name: `Unavailable catalog item (${uuid})`, category: 'Remove its rule or restore the Item' });
    const profileItems = ruleCatalog.sort((a, b) => a.name.localeCompare(b.name)).map(item => ({
      ...item,
      policies: selectedOptions([{ id: 'auto', label: 'Automatic' }, { id: 'always', label: 'Always stock' }, { id: 'never', label: 'Never stock' }], this.generatorOptions.neverStock?.includes(item.uuid) ? 'never' : this.generatorOptions.alwaysStock?.includes(item.uuid) ? 'always' : 'auto'),
      rarities: selectedOptions([{ id: '', label: 'Use item availability' }, { id: 'common', label: 'Common' }, { id: 'uncommon', label: 'Uncommon' }, { id: 'rare', label: 'Rare' }, { id: 'exceptional', label: 'Exceptional' }], profileRarityOverride(this.generatorOptions, item.uuid) || ''),
    }));
    Object.assign(context, {
      gm, mode: this.mode, manager: this.mode === 'manager', creator: this.mode === 'creator', picker: this.mode === 'picker', shop,
      historyMode: this.mode === 'history', tools: this.mode === 'tools', store, hasStore: !!store, entries, hasEntries: entries.length > 0, available,
      stores: stores.map(doc => { const data = getStoreData(doc); return { id: doc.id, ...data, productCount: data.entries.filter(entry => gm || !entry.hidden).length }; }),
      actors: this.preview ? [] : actors.map(actor => ({ id: actor.id, name: actor.name, selected: actor.id === this.actor?.id })), actorName: this.preview ? 'Player preview' : this.actor?.name || 'No party character assigned',
      actorMissing: shop && !this.preview && !this.actor, funds, availableMoney: money(funds.totalCp), preview: this.preview,
      lines, hasLines: lines.length > 0, total: money(totalCp), remaining: money(Math.max(0, funds.totalCp - totalCp)), shortfall: !this.preview && funds.success && totalCp > funds.totalCp ? money(totalCp - funds.totalCp) : null,
      cartError: quote && !quote.success && lines.length ? quote.reason : '', error: this.error, busy: this.busy, pending: !!cart.pending,
      canReview: available && quote?.success && lines.length > 0 && !this.busy && !cart.pending && (this.preview || !!this.actor && funds.success && funds.totalCp >= totalCp),
      review: this.review, reviewLines, receipt: this.lastReceipt ? this._presentReceipt(this.lastReceipt) : null,
      history: this.preview ? [] : [...history].reverse().map(receipt => this._presentReceipt(receipt)),
      recovery: gm ? listInventoryOperations().filter(operation => ['storeCheckout', 'storeSave', 'storeSale', 'storeRestock'].includes(operation.action)) : [],
      categories: ['All', 'Gear', 'Weapons', 'Armor', 'Ammunition', 'Containers', 'Clothing'].map(label => ({ label, selected: this.filter === label })),
      catalog: this.mode === 'picker' ? game.items.filter(eligibleStoreItem).map(item => ({ id: item.id, name: item.name, img: item.img || FALLBACK, category: category(item.type), price: `${item.system.cost ?? 0} sp` })) : [],
      proprietor: store?.proprietorName || store?.proprietorImg ? { name: store.proprietorName || 'Proprietor', img: store.proprietorImg } : null,
      buybackTypes: ['item', 'weapon', 'armor', 'ammunition', 'container', 'clothing'].map(type => ({ type, label: category(type), checked: (store?.buybackTypes || []).includes(type) })),
      sellMode: this.tradeMode === 'sell' && (store?.buysFromPlayers || saleIntent), saleIntent,
      saleEnabled: available && store?.buysFromPlayers && !!this.actor && !this.preview && !this.busy && !cart.pending,
      sellItems: this.actor ? this.actor.items.filter(eligibleStoreItem).map(item => ({ id: item.id, name: item.name, selected: item.id === this.sellLine?.itemId })) : [],
      sellLine: this.sellLine ? { ...this.sellLine, name: this.actor?.items.get?.(this.sellLine.itemId)?.name || this.actor?.items.find(item => item.id === this.sellLine.itemId)?.name } : null,
      saleReview: this.saleReview ? { ...this.saleReview, total: money(this.saleReview.totalCp), after: money(funds.totalCp + this.saleReview.totalCp), lines: this.saleReview.lines.map(line => ({ ...line, name: line.name || line.itemData?.name, total: money(line.unitPriceCp * line.quantity) })) } : null,
      advancedOpen: this.advancedOpen, profileItemSearch: this.profileItemSearch, profileItems,
      economies: selectedOptions(ECONOMIES, this.generatorOptions.economy),
      merchantWealth: selectedOptions(MERCHANT_WEALTH, this.generatorOptions.wealth),
      supplyLevels: selectedOptions(SUPPLY_LEVELS, this.generatorOptions.supply),
      demandLevels: selectedOptions(DEMAND_LEVELS, this.generatorOptions.demand),
      storeEvents: selectedOptions(STORE_EVENTS, this.generatorOptions.event),
      profileBuybackRates: ['item', 'weapon', 'armor', 'ammunition', 'container', 'clothing'].map(type => ({ type, label: category(type), rate: this.generatorOptions.buybackRates?.[type] ?? '' })),
      hasBuybackOverrides: Object.keys(store?.stocking?.buybackRates || {}).length > 0,
      generator: this.generatorOptions, randomStock: this.toolMode === 'stock', randomPrices: this.toolMode === 'prices', profileTool: this.toolMode === 'profile',
      toolTitle: this.toolMode === 'stock' ? 'Randomize Stock' : this.toolMode === 'prices' ? 'Randomize Prices' : 'Stocking Profiles',
      stockProfiles: STOCK_PROFILES.map(profile => ({ ...profile, selected: profile.id === this.generatorOptions.profileId })),
      settlements: SETTLEMENTS.map(value => ({ ...value, selected: value.id === this.generatorOptions.settlement })),
      storeSizes: STORE_SIZES.map(value => ({ ...value, selected: value.id === this.generatorOptions.size })),
      generated: (this.generationResult?.previewEntries || this.generationResult?.entries)?.map(entry => ({ name: entry.itemData.name, stock: entry.stock === null ? 'Unlimited' : entry.stock, price: money(unitPriceCp({ adjustment: this.creator?.draft?.adjustment || 0 }, entry)) })) || [],
      productCountSummary: this.toolMode === 'profile' && this.generationResult ? {
        requested: this.generationResult.requestedProducts,
        generated: this.generationResult.generatedProducts,
        eligible: this.generationResult.eligibleProducts,
        unclassified: this.generationResult.unclassifiedProducts || 0,
        shortfall: this.generationResult.generatedProducts < this.generationResult.requestedProducts,
      } : null,
      hasGenerated: !!this.generationResult,
    });
    return context;
  }

  _presentReceipt(receipt) {
    const isSale = receipt.kind === 'sale';
    const unitLabel = line => /bolt/i.test(line.name || '') ? 'bolts' : /torch/i.test(line.name || '') ? 'torches' : /arrow/i.test(line.name || '') ? 'arrows' : null;
    const quantityLabel = line => {
      const unit = unitLabel(line);
      if (isSale) return `${line.boltCount ?? line.torchCount ?? line.arrowCount ?? line.quantity}${unit ? ` ${unit}` : ''}`;
      if (line.arrowCount) return `${line.quantity} bundles · ${line.arrowCount} arrows`;
      if (line.torchCount) return `${line.quantity} bundles · ${line.torchCount} torches`;
      if (line.boltCount) return `${line.quantity} bundles · ${line.boltCount} bolts`;
      return line.bundleQuantity > 1 ? `${line.quantity} bundles · ${line.quantity * line.bundleQuantity}${unit ? ` ${unit}` : ''}` : `${line.quantity}`;
    };
    return { ...receipt, isSale, timestampLabel: new Date(receipt.timestamp).toLocaleString(), total: money(receipt.totalCp), tendered: money(receipt.tenderedCp ?? receipt.totalCp), change: money(receipt.changeCp ?? 0), after: money(receipt.afterCp), lines: receipt.lines.map(line => ({ ...line, quantityLabel: quantityLabel(line), total: money(line.unitPriceCp * line.quantity) })) };
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._hooks = ['createJournalEntry', 'updateJournalEntry', 'deleteJournalEntry', 'updateActor', 'createItem', 'updateItem', 'deleteItem', 'updateUser'].map(name => [name, Hooks.on(name, document => {
      // Creator edits are deliberately retained until Save or explicit reload.
      if (this.mode === 'creator' || this.mode === 'picker' || this.busy) return;
      if (name.endsWith('Item') && document.parent?.id !== this.actor?.id) return;
      if (name === 'updateActor' && document.id !== this.actor?.id) return;
      if (name === 'updateUser' && document.id !== game.user.id) return;
      this.render();
    })]);
  }

  async close(options) {
    for (const [name, id] of this._hooks || []) Hooks.off(name, id);
    this._hooks = [];
    return super.close(options);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelectorAll('form').forEach(form => form.addEventListener('submit', event => event.preventDefault()));
    this.element.querySelector('[data-store-search]')?.addEventListener('input', event => { this.search = event.target.value; this._filterRows(); });
    this.element.querySelectorAll('[data-store-field]').forEach(input => input.addEventListener('change', () => this._capture()));
    this.element.querySelectorAll('[data-entry-field]').forEach(input => input.addEventListener('change', () => { this._capture(); if (input.dataset.entryField === 'stockMode') this.render(); }));
    this.element.querySelectorAll('[data-buyback-type]').forEach(input => input.addEventListener('change', () => this._capture()));
    this.element.querySelector('[data-shop-actor]')?.addEventListener('change', event => { this.actor = actorsForShopping().find(actor => actor.id === event.target.value); this.review = null; this.saleReview = null; this.sellLine = null; this.lastReceipt = null; this.render(); });
    this.element.querySelectorAll('[data-catalog-item]').forEach(input => input.addEventListener('change', () => {
      const count = this.element.querySelector('[data-selected-count]');
      if (count) count.textContent = `${this.element.querySelectorAll('[data-catalog-item]:checked').length} selected`;
    }));
    this.element.querySelectorAll('[data-generator-field]').forEach(input => input.addEventListener('change', () => {
      this._captureGenerator();
      if (['profileId', 'settlement', 'size'].includes(input.dataset.generatorField)) {
        const productCounts = { minProducts: this.generatorOptions.minProducts, maxProducts: this.generatorOptions.maxProducts };
        Object.assign(this.generatorOptions, profileDefaults(this.generatorOptions));
        if (input.dataset.generatorField !== 'size') Object.assign(this.generatorOptions, productCounts);
      }
      this.generationResult = null; this.render();
    }));
    this.element.querySelector('[data-profile-advanced]')?.addEventListener('toggle', event => { this.advancedOpen = event.target.open; });
    this.element.querySelector('[data-profile-item-search]')?.addEventListener('input', event => { this.profileItemSearch = event.target.value; this._filterProfileItems(); });
    this.element.querySelectorAll('[data-profile-policy], [data-profile-rarity], [data-profile-buyback-rate]').forEach(input => input.addEventListener('change', () => {
      this._captureGenerator(); this.generationResult = null; this.render();
    }));
    this.element.querySelector('[data-sell-item]')?.addEventListener('change', event => {
      this.sellLine = event.target.value ? { itemId: event.target.value, quantity: 1 } : null;
      this.saleReview = null; this.lastReceipt = null; this.render();
    });
    this.element.querySelector('[data-sell-quantity]')?.addEventListener('change', event => {
      if (this.sellLine) this.sellLine.quantity = Number(event.target.value);
      this.saleReview = null;
    });
    this.element.querySelectorAll('[data-cart-quantity], [data-cart-destination]').forEach(input => input.addEventListener('change', async event => {
      await this._guard(async () => {
        const cart = this.cart;
        if (cart.pending || this.busy) return;
        const line = cart.lines.find(line => line.entryId === input.dataset.entryId);
        if (!line) return;
        if (input.hasAttribute('data-cart-quantity')) {
          const quantity = Number(event.target.value);
          if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantity must be a positive whole number.');
          line.quantity = quantity;
        } else line.destination = event.target.value;
        this.review = null; this.lastReceipt = null;
        await this._saveCart(cart); this.render();
      });
    }));
    const zone = this.element.querySelector('[data-store-drop]');
    if (zone && game.user.isGM) {
      zone.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
      zone.addEventListener('drop', event => this._guard(async () => {
        event.preventDefault(); this._capture();
        const data = TextEditor.getDragEventData(event);
        if (data.type !== 'Item') return;
        const item = await Item.implementation.fromDropData(data);
        if (!item || item.parent || !eligibleStoreItem(item)) throw new Error('Add physical equipment from the Items directory.');
        this.draft.entries.push(entryFromItem(item)); this.render();
      }));
    }
    const sellZone = this.element.querySelector('[data-store-sell-drop]');
    if (sellZone && this.actor && !this.preview && this.store?.accessible && this.store.buysFromPlayers) {
      sellZone.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
      sellZone.addEventListener('drop', event => this._guard(async () => {
        event.preventDefault();
        const data = TextEditor.getDragEventData(event);
        if (data.type !== 'Item') throw new Error('Drag equipment from this character’s inventory.');
        const item = await Item.implementation.fromDropData(data);
        if (!item?.parent || item.parent.uuid !== this.actor.uuid) throw new Error('Choose equipment owned by the shopping character.');
        if (loadStoreSaleIntent(this.actor, this.storeId)) throw new Error('Finish the pending sale first.');
        this.sellLine = { itemId: item.id, quantity: 1 }; this.saleReview = null; this.lastReceipt = null; this.render();
      }));
    }
    const search = this.element.querySelector('[data-store-search]');
    if (search) search.value = this.search;
    this._filterRows();
    this._filterProfileItems();
    for (const [selector, key] of [['.store-generation-settings', 'settingsScrollTop'], ['.store-profile-items', 'rulesScrollTop'], ['.store-generation-preview', 'previewScrollTop']]) {
      const panel = this.element.querySelector(selector);
      if (!panel) continue;
      panel.scrollTop = this[key] || 0;
      panel.addEventListener('scroll', () => { this[key] = panel.scrollTop; }, { passive: true });
    }
  }

  _filterProfileItems() {
    const term = this.profileItemSearch.toLocaleLowerCase().trim();
    this.element.querySelectorAll("[data-profile-item-row]").forEach(row => { row.hidden = !row.dataset.name.toLocaleLowerCase().includes(term); });
  }

  _filterRows() {
    const term = this.search.toLocaleLowerCase().trim();
    this.element.querySelectorAll('[data-product-row]').forEach(row => { row.hidden = !(this.filter === 'All' || row.dataset.category === this.filter) || !row.dataset.name.toLocaleLowerCase().includes(term); });
    this.element.querySelectorAll('[data-verb="filter"]').forEach(button => { const active = button.dataset.value === this.filter; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
  }

  _capture() {
    if (!this.draft || this.mode !== 'creator') return;
    for (const input of this.element.querySelectorAll('[data-store-field]')) {
      this.draft[input.dataset.storeField] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    }
    for (const input of this.element.querySelectorAll('[data-stocking-field]')) {
      this.draft.stocking[input.dataset.stockingField] = input.type === 'checkbox' ? input.checked : Number(input.value);
    }
    const types = [...this.element.querySelectorAll('[data-buyback-type]')];
    if (types.length) this.draft.buybackTypes = types.filter(input => input.checked).map(input => input.dataset.buybackType);
    const entryInputs = [...this.element.querySelectorAll('[data-entry-field]')];
    // Apply the mode last so changing Limited → Unlimited cannot be overwritten by
    // the old quantity input that is still in the form until its next render.
    entryInputs.sort((a, b) => Number(a.dataset.entryField === 'stockMode') - Number(b.dataset.entryField === 'stockMode'));
    for (const input of entryInputs) {
      const entry = this.draft.entries.find(entry => entry.id === input.dataset.entryId);
      if (!entry) continue;
      const field = input.dataset.entryField;
      if (field === 'customPrice') entry.customPrice = input.value.trim() === '' ? null : Number(input.value);
      if (field === 'stock') entry.stock = Number(input.value);
      if (field === 'stockMode') entry.stock = input.value === 'unlimited' ? null : entry.stock ?? 1;
    }
  }

  _captureGenerator() {
    for (const input of this.element.querySelectorAll('[data-generator-field]')) {
      this.generatorOptions[input.dataset.generatorField] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value;
    }
    const policies = [...this.element.querySelectorAll('[data-profile-policy]')];
    if (policies.length) {
      this.generatorOptions.alwaysStock = policies.filter(input => input.value === 'always').map(input => input.dataset.profilePolicy);
      this.generatorOptions.neverStock = policies.filter(input => input.value === 'never').map(input => input.dataset.profilePolicy);
    }
    const rarities = [...this.element.querySelectorAll('[data-profile-rarity]')];
    if (rarities.length) this.generatorOptions.rarityOverrides = Object.fromEntries(rarities.filter(input => input.value).map(input => [profileSourceKey(input.dataset.profileRarity), input.value]));
    const rates = [...this.element.querySelectorAll('[data-profile-buyback-rate]')];
    if (rates.length) this.generatorOptions.buybackRates = Object.fromEntries(rates.filter(input => input.value.trim() !== '').map(input => [input.dataset.profileBuybackRate, Number(input.value)]));
  }

  async _saveCart(cart) {
    if (this.preview || !this.actor) this.previewCart = clone(cart);
    else await saveStoreCart(this.actor, this.storeId, cart);
  }
  async _guard(fn) {
    try { await fn(); }
    catch (error) { this.error = error.message || 'The store action could not be completed.'; ui.notifications.error(this.error); this.render(); }
  }
  static async _action(event, target) { await this._guard(() => this._act(target.dataset.verb, target)); }
  static async _viewAsPlayer(event, target) { await this._guard(() => this._act('viewAsPlayer', target)); }

  async _act(verb, target) {
    if (this.busy && verb !== 'filter') return;
    const gm = Boolean(game.user.isGM) && !this.preview;
    if (verb === 'catalogStockingReview' && gm) {
      const { openCatalogStockingReview } = await import('../inventory/catalog-stocking-review.js');
      return openCatalogStockingReview();
    }
    if (verb === 'filter') { this.filter = target.dataset.value; this._filterRows(); return; }
    if (verb === 'back') { await this.close(); return this.preview ? undefined : new StoreApp().render({ force: true }); }
    if (verb === 'viewAsPlayer' && gm && ['creator', 'shop'].includes(this.mode) && this.store) {
      if (this.mode === 'creator') return this._act('preview', target);
      return new StoreApp({ mode: 'shop', storeId: this.storeId, draft: clone(this.store), preview: true }).render({ force: true });
    }
    if (verb === 'open') return new StoreApp({ mode: 'shop', storeId: target.dataset.storeId }).render({ force: true });
    if (verb === 'create' && gm) {
      const result = await createStore(emptyStore());
      if (!result.success) throw new Error(result.reason);
      return new StoreApp({ mode: 'creator', storeId: result.store.id, draft: getStoreData(result.store) }).render({ force: true });
    }
    if (verb === 'edit' && gm) return new StoreApp({ mode: 'creator', storeId: target.dataset.storeId, draft: getStoreData(getStoreDocument(target.dataset.storeId)) }).render({ force: true });
    if (verb === 'duplicate' && gm) { const result = await duplicateStore(target.dataset.storeId); if (!result.success) throw new Error(result.reason); this.render(); return; }
    if (verb === 'access' && gm) {
      const data = getStoreData(getStoreDocument(target.dataset.storeId)); data.accessible = !data.accessible;
      return this._runSave(target.dataset.storeId, data);
    }
    if (verb === 'save' && gm) { this._capture(); return this._runSave(this.storeId, this.draft); }
    if (verb === 'restock' && gm && this.mode === 'creator') {
      this._capture();
      if (JSON.stringify(this.draft) !== JSON.stringify(getStoreData(getStoreDocument(this.storeId)))) throw new Error('Save or reload your draft changes before restocking.');
      this.busy = true; this.error = ''; this.render();
      try {
        const result = await restockStore(this.storeId);
        if (!result.success) throw new Error(result.reason || 'Restocking could not be completed.');
        this.draft = getStoreData(getStoreDocument(this.storeId));
        ui.notifications.info('Store restocked.');
      } finally { this.busy = false; this.render(); }
      return;
    }
    if (verb === 'cancel') return this.close();
    if (verb === 'reload' && gm) { this.draft = getStoreData(getStoreDocument(this.storeId)); this.error = ''; return this.render(); }
    if (verb === 'preview' && gm) { this._capture(); return new StoreApp({ mode: 'shop', storeId: this.storeId, draft: this.draft, preview: true }).render({ force: true }); }
    if (verb === 'pick' && gm) { this._capture(); const picker = new StoreApp({ mode: 'picker' }); picker.creator = this; return picker.render({ force: true }); }
    if (['randomStock', 'randomPrices', 'profiles'].includes(verb) && gm && this.mode === 'creator') {
      this._capture();
      const tools = new StoreApp({ mode: 'tools' }); tools.creator = this;
      tools.toolMode = verb === 'randomStock' ? 'stock' : verb === 'randomPrices' ? 'prices' : 'profile';
      tools.generatorOptions = { ...tools.generatorOptions, ...profileDefaults(this.draft.stocking || {}), ...(this.draft.stocking || {}), seed: this.draft.stocking?.seed || String(Date.now()) };
      tools.generatorBase = clone(this.draft.entries);
      return tools.render({ force: true });
    }
    if (verb === 'generate' && gm && this.creator) {
      this._captureGenerator();
      const entries = clone(this.creator.draft.entries);
      if (this.toolMode === 'profile' && (!Number.isInteger(this.generatorOptions.restockDays) || this.generatorOptions.restockDays < 1 || this.generatorOptions.restockDays > 365)) throw new Error('Restock interval must be a whole number from 1 to 365 in-game days.');
      const result = this.toolMode === 'profile' ? generateStoreStock([...game.items], { ...this.generatorOptions, catalog: await loadStockingCatalog() })
        : this.toolMode === 'stock' ? randomizeStoreStock(entries, this.generatorOptions) : randomizeStorePrices(entries, this.generatorOptions);
      if (!result.success) throw new Error(result.reason);
      if (this.toolMode === 'profile' && !this.generatorOptions.replaceInventory) {
        const planned = applyRestockPlan(entries, result.entries, { ...this.creator.draft.stocking, ...this.generatorOptions, managedSources: this.creator.draft.stocking?.managedSources || [] }, this.generatorOptions.seed);
        if (!planned.success) throw new Error(planned.reason);
        result.previewEntries = planned.entries;
      }
      this.generatorBase = entries; this.generationResult = result; this.error = ''; return this.render();
    }
    if (verb === 'applyGenerated' && gm && this.creator) {
      if (!this.generationResult) throw new Error('Preview the generated inventory first.');
      if (JSON.stringify(this.creator.draft.entries) !== JSON.stringify(this.generatorBase)) throw new Error('The inventory changed. Preview again before applying.');
      let entries = clone(this.generationResult.entries);
      let managedSources = entries.map(entry => entry.sourceUuid).filter(Boolean);
      if (this.toolMode === 'profile' && !this.generatorOptions.replaceInventory) {
        const planned = applyRestockPlan(this.creator.draft.entries, entries, { ...this.creator.draft.stocking, ...this.generatorOptions, managedSources: this.creator.draft.stocking?.managedSources || [] }, this.generatorOptions.seed);
        if (!planned.success) throw new Error(planned.reason);
        entries = planned.entries; managedSources = planned.managedSources;
      }
      if (entries.length > 200) throw new Error('A store can stock at most 200 products.');
      this.creator.draft.entries = entries;
      if (this.toolMode === 'profile') this.creator.draft.stocking = {
        ...clone(this.generatorOptions), managedSources,
        lastRestockWorldTime: Number(game.time?.worldTime) || 0,
      };
      this.creator.render(); return this.close();
    }
    if (verb === 'addSelected' && gm && this.creator) {
      const selected = [...this.element.querySelectorAll('[data-catalog-item]:checked')].map(input => game.items.get(input.value)).filter(eligibleStoreItem);
      this.creator.draft.entries.push(...selected.map(entryFromItem)); this.creator.render(); return this.close();
    }
    if (verb === 'hide' && gm && this.draft) { this._capture(); const entry = this.draft.entries.find(entry => entry.id === target.dataset.entryId); entry.hidden = !entry.hidden; return this.render(); }
    if (verb === 'removeProduct' && gm && this.draft) { this._capture(); this.draft.entries = this.draft.entries.filter(entry => entry.id !== target.dataset.entryId); return this.render(); }
    if (verb === 'refreshProduct' && gm && this.draft) {
      this._capture(); const entry = this.draft.entries.find(entry => entry.id === target.dataset.entryId);
      const item = entry.sourceUuid && await fromUuid(entry.sourceUuid);
      if (!item || !eligibleStoreItem(item)) throw new Error('The source Item is no longer available. Add its replacement from the Items directory.');
      entry.itemData = entryFromItem(item).itemData; return this.render();
    }
    if (['image', 'proprietorImage'].includes(verb) && gm) {
      this._capture(); const Picker = foundry.applications.apps.FilePicker.implementation;
      const field = verb === 'image' ? 'img' : 'proprietorImg';
      return new Picker({ type: 'image', current: this.draft[field], callback: path => { this.draft[field] = path; this.render(); } }).render(true);
    }
    if (verb === 'details') {
      const entry = this.store?.entries.find(entry => entry.id === target.dataset.entryId && (gm || !entry.hidden));
      if (entry && (this.preview || this.store.accessible || gm)) new ItemCardDialog(new Item.implementation(entry.itemData)).render(true);
      return;
    }
    if (verb === 'history') return new StoreApp({ mode: 'history', storeId: this.storeId, actor: this.actor }).render({ force: true });
    if (verb === 'dismissReceipt') { this.lastReceipt = null; return this.render(); }
    if (verb === 'recover' && gm) {
      const result = await recoverInventoryOperation(target.dataset.operationId);
      if (!result.success) throw new Error(result.reason);
      this.error = ''; this.render(); return;
    }
    if (verb === 'tradeMode') { this.tradeMode = target.dataset.value; this.lastReceipt = null; return this.render(); }
    if (verb === 'reviewSale') return this._reviewSale();
    if (verb === 'backSale') { this.saleReview = null; return this.render(); }
    if (verb === 'completeSale' && this.saleReview && this.actor && !this.preview) {
      const intent = { storeId: this.storeId, operationId: foundry.utils.randomID(), quote: clone(this.saleReview) };
      await saveStoreSaleIntent(this.actor, this.storeId, intent);
      return this._completeSale(intent);
    }
    if (verb === 'retrySale') return this._completeSale(loadStoreSaleIntent(this.actor, this.storeId));
    const cart = this.cart;
    if (verb === 'retry') return this._complete(cart);
    if (cart.pending || !this.actor && !this.preview) return;
    if (verb === 'add' && (this.preview || this.store?.accessible)) {
      const entry = this.store.entries.find(entry => entry.id === target.dataset.entryId && !entry.hidden);
      if (!entry || entry.stock === 0) throw new Error('That product is unavailable.');
      const line = cart.lines.find(line => line.entryId === entry.id);
      if (line) line.quantity++; else cart.lines.push({ entryId: entry.id, name: entry.itemData.name, quantity: 1, destination: '' });
      this.review = null; this.lastReceipt = null; await this._saveCart(cart); return this.render();
    }
    if (['increment', 'decrement', 'removeLine', 'clear'].includes(verb)) {
      const line = cart.lines.find(line => line.entryId === target.dataset.entryId);
      if (verb === 'clear') cart.lines = [];
      else if (verb === 'removeLine' || verb === 'decrement' && line?.quantity === 1) cart.lines = cart.lines.filter(line => line.entryId !== target.dataset.entryId);
      else if (line) line.quantity += verb === 'increment' ? 1 : -1;
      this.review = null; this.lastReceipt = null; await this._saveCart(cart); return this.render();
    }
    if (verb === 'backCart') { this.review = null; return this.render(); }
    if (verb === 'review') return this._review(cart);
    if (verb === 'complete' && this.review && !this.preview) {
      cart.pending = { operationId: foundry.utils.randomID(), quote: cartLineQuote(this.review) };
      await this._saveCart(cart);
      return this._complete(cart);
    }
  }

  async _runSave(id, data) {
    this.busy = true; this.error = ''; this.render();
    try {
      const result = await saveStore(id, clone(data), data.revision);
      if (!result.success) throw new Error(result.reason);
      if (this.mode === 'creator') this.draft = getStoreData(getStoreDocument(id));
      ui.notifications.info('Store saved.');
    } finally { this.busy = false; this.render(); }
  }
  async _reviewSale() {
    if (this.preview || !this.actor || !this.store?.accessible || !this.store.buysFromPlayers) throw new Error('Selling is not available here.');
    if (this.cart.pending || loadStoreSaleIntent(this.actor, this.storeId)) throw new Error('Finish the pending transaction first.');
    const quantity = this.element?.querySelector?.('[data-sell-quantity]');
    if (quantity && this.sellLine) this.sellLine.quantity = Number(quantity.value);
    const quote = await quoteStoreSale(this.actor, this.store, this.sellLine ? [this.sellLine] : []);
    if (!quote.success) throw new Error(quote.reason);
    this.saleReview = quote; this.lastReceipt = null; this.error = ''; return this.render();
  }
  async _completeSale(intent) {
    if (!intent || !this.actor || this.preview) return;
    this.busy = true; this.error = ''; this.render();
    try {
      const result = await completeStoreSale(this.actor, this.storeId, intent.quote, intent.operationId);
      const receipt = receiptForSaleIntent(this.actor, intent);
      if (receipt) {
        this.lastReceipt = receipt; this.sellLine = null; this.saleReview = null;
        await saveStoreSaleIntent(this.actor, this.storeId, null);
      } else if (!result.success) {
        if (!result.retryable && !result.recoveryRequired) await saveStoreSaleIntent(this.actor, this.storeId, null);
        throw new Error(result.reason || 'The sale could not be completed.');
      } else this.error = 'Waiting for the sale receipt. Check safely before trying another sale.';
    } finally { this.busy = false; this.render(); }
  }
  async _review(cart) {
    this.busy = true; this.error = ''; this.render();
    try {
      const store = this.store;
      if (!this.preview && !store.accessible) throw new Error('This store is no longer accessible.');
      const quote = quoteStore(store, cart.lines);
      if (!quote.success) throw new Error(quote.reason);
      if (this.preview) {
        this.review = { ...quote, placements: quote.lines.map(line => ({ entryId: line.entryId, label: line.destination === '__open_gear__' ? 'Wear or carry (preview)' : 'Carrying destination checked with a character' })) };
        return;
      }
      const funds = carriedFunds(this.actor);
      if (!funds.success) throw new Error(funds.reason);
      if (funds.totalCp < quote.totalCp) throw new Error(`You need ${money(quote.totalCp - funds.totalCp)} more carried coins.`);
      const placement = await planStorePlacement(this.actor, quote.lines);
      if (!placement.success) throw new Error(placement.reason);
      const payment = await stageStorePayment(placement.draftState.actor, quote.totalCp);
      if (!payment.success) throw new Error(payment.reason);
      const finalPlacement = validateStorePlacement(placement.draftState);
      if (!finalPlacement.allowed) throw new Error(finalPlacement.reason);
      this.review = { ...quote, placements: placement.placements, tendered: money(payment.payment.paidCp), change: money(payment.payment.changeCp) };
      // Keep the exact suggested destinations in the quote the GM validates.
      this.review.lines = quote.lines.map(line => ({ ...line, destination: placement.placements.find(placed => placed.entryId === line.entryId)?.destination || line.destination }));
    } finally { this.busy = false; this.render(); }
  }
  async _complete(cart) {
    if (this.preview || !cart.pending || !this.actor) return;
    this.busy = true; this.error = ''; this.render();
    try {
      const { operationId, quote } = cart.pending;
      const result = await checkoutStore(this.actor, this.storeId, quote, operationId);
      const receipt = receiptForPending(this.actor, cart);
      if (receipt) {
        this.lastReceipt = receipt; this.review = null;
        await this._saveCart({ lines: [], pending: null });
        if (!result.success && result.recoveryRequired) this.error = result.reason;
      } else if (result.success) {
        // Wait for document synchronization; the pending id survives reloads and retries.
        this.error = 'Purchase acknowledged. Waiting for your receipt; retry safely if it does not appear.';
      } else {
        if (!result.retryable && !result.recoveryRequired) { cart.pending = null; await this._saveCart(cart); this.review = null; }
        throw new Error(result.reason || 'The purchase could not be completed.');
      }
    } finally { this.busy = false; this.render(); }
  }
}

export function openStoreManager() { return new StoreApp().render({ force: true }); }
