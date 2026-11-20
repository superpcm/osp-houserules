import { beforeAll, describe, expect, it, vi } from 'vitest';
import vehicles from '../../../data/vehicles.json';
import tack from '../../../data/tack.json';
import misc from '../../../data/misc.json';

const NEW_NAMES = [
  'Wheelbarrow', 'Handcart', 'Wagon, Open', 'Wagon, Heavy Freight',
  'Spare Wheel, Cart', 'Spare Wheel, Wagon', 'Axle, Cart', 'Axle, Wagon',
  'Yoke, Ox', 'Harness, Team', 'Wagon Cover', 'Cargo Net', 'Axle Grease',
];
const allCatalog = [...vehicles, ...tack, ...misc];

let stableItemKind;
let eligibleStableProfileItem;
let generateStableStock;
let planStablePlacement;
let eligibleStoreItem;
let quoteStable;
let quoteStableSale;

beforeAll(async () => {
  let serial = 0;
  globalThis.foundry = {
    applications: { sheets: { ActorSheetV2: class {} }, api: { HandlebarsApplicationMixin: Base => Base } },
    utils: { randomID: () => `wainwright-${++serial}`, duplicate: value => structuredClone(value) },
  };
  globalThis.Application = class {};
  globalThis.Dialog = class {};
  globalThis.ui = { notifications: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } };
  globalThis.game = { user: { isGM: false }, settings: { get: () => false }, system: { id: 'osp-houserules' }, items: [] };
  globalThis.TextEditor = { getDragEventData: () => ({ type: 'Item' }) };
  globalThis.Hooks = { call: () => true };
  const stable = await import('./stable.js');
  ({ stableItemKind, quoteStable, quoteStableSale } = stable);
  ({ planStablePlacement } = await import('./stable-placement.js'));
  ({ eligibleStableProfileItem, generateStableStock } = await import('./stable-profiles.js'));
  ({ eligibleStoreItem } = await import('./store.js'));
});

const itemByName = name => allCatalog.find(item => item.name === name);
const line = (id, item, destination = '') => ({ entryId: id, quantity: 1, itemData: structuredClone(item), destination });

function actor(initial = []) {
  const items = initial.map((item, index) => ({ ...structuredClone(item), id: item.id ?? `owned-${index}`, _id: item.id ?? `owned-${index}` }));
  return {
    id: 'wainwright-test', uuid: 'Actor.wainwright-test', type: 'character', isOwner: true,
    system: { class: 'fighter' },
    items: { contents: items, filter: fn => items.filter(fn), find: fn => items.find(fn), get: id => items.find(item => item.id === id), some: fn => items.some(fn), map: fn => items.map(fn), [Symbol.iterator]: function* () { yield* items; } },
  };
}

describe('Wainwright catalog', () => {
  it('contains thirteen unique records with explicit metadata and image mappings', () => {
    const records = NEW_NAMES.map(itemByName);
    expect(records.every(Boolean)).toBe(true);
    expect(new Set(records.map(item => item.name)).size).toBe(13);
    expect(records.every(item => item.type === 'item' || item.type === 'container')).toBe(true);
    expect(records.every(item => ['common', 'uncommon', 'rare', 'exceptional'].includes(item.system.storeAvailability))).toBe(true);
    expect(records.every(item => typeof item.system.blacksmithEligible === 'boolean')).toBe(true);
    expect(records.filter(item => item.system.storeAvailability === 'uncommon').map(item => item.name)).toEqual(['Wagon, Heavy Freight']);
    expect(records.filter(item => item.system.blacksmithEligible).length).toBe(0);
    expect(records.filter(item => item.system.tags?.includes('vehicle-parts')).length).toBe(9);
    for (const item of records) {
      const folder = item.system.tags?.includes('vehicle-parts') && ['Yoke, Ox', 'Harness, Team', 'Wagon Cover', 'Cargo Net'].includes(item.name) ? 'tack' : 'misc';
      const slug = ({
        'Wheelbarrow': 'wheelbarrow', 'Handcart': 'handcart', 'Wagon, Open': 'wagon-open', 'Wagon, Heavy Freight': 'wagon-heavy-freight',
        'Spare Wheel, Cart': 'wheel-spare-cart', 'Spare Wheel, Wagon': 'wheel-spare-wagon', 'Axle, Cart': 'axle-spare-cart', 'Axle, Wagon': 'axle-spare-wagon',
        'Yoke, Ox': 'yoke-ox', 'Harness, Team': 'harness-team', 'Wagon Cover': 'cover-wagon', 'Cargo Net': 'net-cargo', 'Axle Grease': 'grease-axle',
      })[item.name];
      expect(item.img).toBe(`systems/osp-houserules/assets/thumbs/images/${folder}/${slug}_thumb.webp`);
    }
  });

  it('preserves the covered Wagon and Cart catalog records', () => {
    expect(vehicles.filter(item => ['Cart', 'Wagon'].includes(item.name))).toEqual([
      {
        name: 'Cart', type: 'container', img: 'systems/osp-houserules/assets/images/misc/cart.webp',
        system: { description: 'A sturdy two-wheeled wooden cart with iron-banded wheels, a slatted cargo bed, and shafts for a beast of burden. Farmers, merchants, and travelers haul goods, supplies, and passengers in it.', cost: 115, unitWeight: 200, storedSize: 99, quantity: 1, equipped: false, lashable: false, tags: ['tack', 'vehicle', 'container', 'no-store'], capacity: 80, requiresAnimal: 'draft', vehicleKind: 'cart', storeAvailability: 'common', blacksmithEligible: false },
      },
      {
        name: 'Wagon', type: 'container', img: 'systems/osp-houserules/assets/images/misc/wagon-covered.webp',
        system: { description: 'A large four-wheeled covered wagon with a canvas top and reinforced axles, capable of transporting huge loads across country. Requires multiple draft animals to pull and is the primary means of moving goods, supplies, and even entire households overland.', cost: 200, unitWeight: 500, storedSize: 99, quantity: 1, equipped: false, lashable: false, tags: ['tack', 'vehicle', 'container', 'no-store'], capacity: 200, requiresAnimal: 'draft (2+)', vehicleKind: 'wagon', storeAvailability: 'common', blacksmithEligible: false },
      },
    ]);
  });

  it('limits automatic Wainwright stock to the approved goods', () => {
    const catalog = allCatalog.map((item, index) => ({ ...structuredClone(item), id: `catalog-${index}`, uuid: `Compendium.wainwright.${index}` }));
    const approved = new Set(['Cart', 'Wagon', 'Harness, Draft', ...NEW_NAMES]);
    for (let seed = 0; seed < 20; seed += 1) {
      const result = generateStableStock(catalog, { profileId: 'wainwright', minProducts: 16, maxProducts: 16, seed });
      expect(result.success).toBe(true);
      expect(result.generatedCount).toBe(16);
      expect(result.shortfall).toBe(0);
      expect(result.entries.every(entry => approved.has(entry.itemData.name))).toBe(true);
    }
    const nine = generateStableStock(catalog, { profileId: 'wainwright', minProducts: 9, maxProducts: 9, seed: 'nine-goods' });
    expect(nine.generatedCount).toBe(9);
    expect(nine.shortfall).toBe(0);
    const food = { id: 'food', uuid: 'Item.food', name: 'Rations', type: 'item', system: { cost: 1, tags: ['food'], storeAvailability: 'common' } };
    expect(eligibleStableProfileItem(food, { profileId: 'wainwright' })).toBe(false);
    expect(eligibleStableProfileItem(itemByName('Wheelbarrow'), { profileId: 'wainwright' })).toBe(true);
  });

  it('classifies parts separately and excludes them from ordinary stores', () => {
    expect(stableItemKind(itemByName('Axle Grease'))).toBe('parts');
    expect(eligibleStoreItem(itemByName('Axle Grease'))).toBe(false);
    expect(eligibleStoreItem(itemByName('Cart'))).toBe(false);
  });

  it('places parts in an owned or purchased vehicle but rejects an animal destination', async () => {
    const cart = itemByName('Cart');
    const horse = allCatalog.find(item => item.name === 'Horse, Draft');
    const ownedCart = { ...structuredClone(cart), id: 'owned-cart', _id: 'owned-cart', system: { ...cart.system, containerId: null } };
    const owned = await planStablePlacement(actor([ownedCart]), [line('grease', itemByName('Axle Grease'), 'owned-cart')]);
    expect(owned.success, owned.reason).toBe(true);
    expect(owned.draftState.items.find(item => item.name === 'Axle Grease').system.containerId).toBe('owned-cart');

    const purchased = await planStablePlacement(actor(), [line('wagon', cart === itemByName('Cart') ? itemByName('Wagon') : cart), line('axle', itemByName('Axle, Wagon'), 'cart:wagon')]);
    expect(purchased.success, purchased.reason).toBe(true);
    const wagon = purchased.draftState.items.find(item => item.name === 'Wagon');
    expect(purchased.draftState.items.find(item => item.name === 'Axle, Wagon').system.containerId).toBe(wagon.id);

    const animal = horse ? { ...structuredClone(horse), id: 'owned-horse', _id: 'owned-horse' } : null;
    if (animal) {
      const rejected = await planStablePlacement(actor([animal]), [line('grease', itemByName('Axle Grease'), 'owned-horse')]);
      expect(rejected.success).toBe(false);
    }
  });

  it('quotes purchases and buyback for vehicle parts without changing their classification', () => {
    const part = { ...structuredClone(itemByName('Axle Grease')), id: 'part-1', _id: 'part-1', system: { ...itemByName('Axle Grease').system, quantity: 1, containerId: null } };
    const stable = { accessible: true, entries: [{ id: 'grease', itemData: part, customPrice: 2, stock: 2, hidden: false }], buysFromPlayers: true, buybackRate: 50, revision: 0 };
    expect(quoteStable(stable, [{ entryId: 'grease', quantity: 1 }]).success).toBe(true);
    const seller = actor([part]);
    const sale = quoteStableSale(seller, stable, [{ itemId: 'part-1', quantity: 1 }]);
    expect(sale.success).toBe(true);
    expect(sale.totalCp).toBe(10);
  });
});
