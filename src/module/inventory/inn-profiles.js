/** Deterministic inn and tavern menu generation.  This module has no Foundry dependencies. */

export const INN_TYPES = Object.freeze(['tavern', 'inn', 'both']);
export const INN_SETTLEMENTS = Object.freeze(['village', 'town', 'city']);
export const INN_SIZES = Object.freeze(['small', 'medium', 'large']);
export const INN_QUALITIES = Object.freeze(['modest', 'comfortable', 'fine']);
export const INN_CHARACTERS = Object.freeze(['rural', 'roadside', 'trading', 'wealthy']);
export const INN_SUPPLIES = Object.freeze(['disrupted', 'unreliable', 'reliable', 'abundant']);

const clone = value => structuredClone(value);
const integer = value => typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const random = seed => {
  let state = typeof seed === 'string' ? 2166136261 : (Number(seed) || 1) >>> 0;
  if (typeof seed === 'string') for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
};
const randomInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const shuffle = (items, rng) => { const result = [...items]; for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; };

const food = [
  ['stew', 'House stew', 'A hearty bowl of root vegetables, meat, and gravy.', 0.7, 'rural'],
  ['bread-cheese', 'Bread and cheese', 'Fresh bread with a wedge of local cheese.', 0.5, 'rural'],
  ['porridge', 'Morning porridge', 'Warm oats with honey and dried fruit.', 0.3, 'rural'],
  ['roast', 'Roast supper', 'A generous plate of roasted meat and seasonal vegetables.', 1.5, 'wealthy'],
  ['fish', 'River fish', 'Today’s catch with herbs and butter.', 1.2, 'trading'],
  ['meat-pie', 'Meat pie', 'A hot pastry filled with spiced meat.', 0.8, 'roadside'],
  ['travel-ration', 'Traveler’s plate', 'A filling plate designed for the road.', 1, 'roadside'],
  ['venison', 'Hunter’s venison', 'Roasted game with berry sauce.', 2.5, 'rural'],
  ['sausage', 'Sausage and mash', 'Local sausage with potatoes and onion gravy.', 1, 'rural'],
  ['vegetable-pottage', 'Vegetable pottage', 'A simple seasonal vegetable bowl.', 0.4, 'rural'],
  ['spiced-chicken', 'Spiced chicken', 'Roasted chicken with a fragrant spice crust.', 1.5, 'trading'],
  ['merchant-board', 'Merchant’s board', 'Cured meats, olives, and imported cheese.', 2, 'trading'],
  ['sweetcake', 'Honey cake', 'A small cake glazed with local honey.', 0.3, 'wealthy'],
  ['fruit-tart', 'Fruit tart', 'A crisp pastry filled with orchard fruit.', 0.5, 'wealthy'],
  ['fine-supper', 'Fine supper', 'Several courses prepared by the house cook.', 5, 'wealthy'],
  ['breakfast', 'Full breakfast', 'Eggs, bread, sausage, and a hot drink.', 1, 'roadside'],
  ['cold-lunch', 'Cold lunch', 'Bread, meat, fruit, and a wrapped portion for travel.', 0.8, 'roadside'],
  ['oat-cake', 'Oat cake', 'A portable cake of oats and dried fruit.', 0.2, 'rural'],
  ['spiced-beans', 'Spiced beans', 'Slow-cooked beans with herbs and onions.', 0.5, 'rural'],
  ['river-crayfish', 'River crayfish', 'A local delicacy served with butter.', 2, 'trading'],
  ['mara-millers-pot', 'Mara Miller’s pot', 'Barley, turnip, and smoked ham simmered until tender.', 0.8, 'rural', true],
  ['old-tom-trench-pie', 'Old Tom’s trench pie', 'A thick hand pie of onion, beef, and peppered gravy.', 1, 'roadside', true],
  ['mooncalf-hash', 'Mooncalf hash', 'Potatoes, eggs, and shredded beef browned with chives.', 1, 'rural', true],
  ['griffin-wing-roast', 'Griffin Wing roast', 'Herbed chicken wings with roasted roots and mustard.', 1.5, 'trading', true],
  ['three-sisters-stew', 'Three Sisters stew', 'Beans, squash, and corn with a little smoked pork.', 0.7, 'rural', true],
  ['brindle-boys-bowl', 'The Brindle Boys’ bowl', 'A generous bowl of noodles, greens, and sliced pork.', 1, 'roadside', true],
  ['selka-saltfish', 'Selka’s saltfish', 'Salted river fish with warm lentils and pickled onions.', 1.3, 'trading', true],
  ['wyvern-pepper-bread', 'Wyvern pepperbread', 'A savory loaf with peppers, cheese, and minced sausage.', 0.8, 'trading', true],
  ['hollow-hill-pudding', 'Hollow Hill pudding', 'A baked onion and root-vegetable pudding with cream.', 0.7, 'rural', true],
  ['red-cap-rabbit', 'Red Cap rabbit', 'Braised rabbit with carrots, thyme, and dark gravy.', 2, 'wealthy', true],
  ['thornapple-tart', 'Thornapple tart', 'A crisp tart of orchard apples, berries, and honey.', 0.6, 'wealthy', true],
  ['basilisk-breakfast', 'Basilisk breakfast', 'Eggs, crisp bacon, and bread with a sharp herb relish.', 1.2, 'roadside', true],
  ['nine-lives-noodles', 'Nine Lives noodles', 'Hand-cut noodles tossed with mushrooms and garlic butter.', 1, 'trading', true],
  ['copper-kettle-chowder', 'Copper Kettle chowder', 'Creamy fish chowder with leeks and cracked pepper.', 1.3, 'trading', true],
  ['hobb-wrights-cakes', 'Hobb Wright’s griddlecakes', 'Oat griddlecakes served with butter and berry jam.', 0.4, 'rural', true],
  ['stone-giant-stew', 'Stone Giant stew', 'Slow-cooked beef, carrots, and potatoes in a dark broth.', 1.5, 'roadside', true],
  ['lantern-lark-supper', 'Lantern Lark supper', 'Roast fowl, buttered greens, and a small fruit pudding.', 2, 'wealthy', true],
  ['blackmare-bean-bake', 'Blackmare bean bake', 'White beans baked with tomato, herbs, and crisp crumbs.', 0.6, 'rural', true],
  ['goblin-market-skewers', 'Goblin Market skewers', 'Grilled mushrooms, onions, and peppers with flatbread.', 1, 'trading', true],
  ['silver-stag-supper', 'Silver Stag supper', 'Venison medallions with juniper gravy and winter roots.', 3, 'wealthy', true],
];
const drinks = [
  ['stout', 'Black stout', 'A full-bodied dark stout with roasted malt and a creamy head.', 2, 'roadside'],
  ['mead', 'Honey mead', 'Golden fermented honey with a mellow floral finish.', 3, 'rural'],
  ['brandy', 'Orchard brandy', 'Apple brandy aged in oak, served by the measure.', 4, 'trading'],
  ['rye-spirit', 'Rye spirit', 'A warming measure of distilled rye with a peppery finish.', 3, 'roadside'],
  ['small-beer', 'Small beer', 'A light, everyday ale.', 0.5, 'rural'],
  ['ale', 'House ale', 'The tavern’s regular amber ale.', 1, 'roadside'],
  ['dark-ale', 'Dark ale', 'A malty brew from a nearby brewer.', 1.5, 'rural'],
  ['cider', 'Cider', 'Crisp cider from local orchards.', 1, 'rural'],
  ['wine', 'Table wine', 'A serviceable red or white wine.', 2, 'trading'],
  ['imported-wine', 'Imported wine', 'A better bottle for a prosperous table.', 6, 'wealthy'],
  ['spiced-wine', 'Spiced wine', 'Warm wine with cinnamon and clove.', 4, 'wealthy'],
  ['tea', 'Herbal tea', 'A calming infusion of local herbs.', 1, 'rural'],
  ['coffee', 'Coffee', 'A bitter imported drink served hot.', 3, 'trading'],
  ['milk', 'Fresh milk', 'Fresh milk from a nearby farm.', 0.5, 'rural'],
  ['honey-milk', 'Honeyed milk', 'Warm milk sweetened with honey.', 1, 'wealthy'],
  ['fruit-juice', 'Fruit juice', 'Pressed seasonal fruit.', 1, 'rural'],
  ['berry-shrub', 'Berry shrub', 'Tart berries, vinegar, and honey lengthened with cool water.', 1, 'rural'],
  ['mint-tea', 'Mint tea', 'Fresh mint leaves steeped with a little honey.', 1, 'rural'],
  ['spiced-cocoa', 'Spiced cocoa', 'Warm cocoa with cinnamon and a pinch of salt.', 2, 'wealthy'],
  ['spring-water', 'Spring water', 'Clear, cold water drawn from the nearest spring.', 0.25, 'rural'],
  ['apple-press', 'Apple press', 'Cloudy pressed apple juice served cold.', 1, 'rural'],
  ['ginger-tonic', 'Ginger tonic', 'Ginger, citrus peel, and honey in chilled water.', 1.5, 'trading'],
  ['hazel-nut-milk', 'Hazel-nut milk', 'A sweet nut drink whisked with warm milk.', 2, 'wealthy'],
  ['dragonfly-cider', 'Dragonfly cider', 'A bright orchard cider with a dry finish.', 2, 'rural'],
  ['blackbriar-mead', 'Blackbriar mead', 'Honey wine steeped with dark berries.', 3, 'wealthy'],
  ['red-rook-ale', 'Red Rook ale', 'A copper ale with toasted malt and a clean bite.', 1.5, 'roadside'],
  ['wayfarers-punch', 'Wayfarer’s punch', 'Citrus, spiced wine, and orchard juice served warm.', 3, 'roadside'],
  ['moonlit-lager', 'Moonlit lager', 'A pale lager with a crisp, lightly floral finish.', 2, 'trading'],
];

const signaturePreparations = [
  ['hearth-smoked', 'hearth-smoked', 'a curl of hearth smoke and cracked pepper'],
  ['juniper-braised', 'juniper-braised', 'juniper berries and a sharp herb relish'],
  ['ember-roasted', 'ember-roasted', 'embersweet onions and charred root vegetables'],
  ['honey-glazed', 'honey-glazed', 'a brush of local honey and toasted seeds'],
  ['moonlit', 'moonlit', 'night-blooming herbs and a cool berry glaze'],
  ['peppercorn', 'peppercorn', 'green peppercorns and a spoon of dark gravy'],
  ['winter-spiced', 'winter-spiced', 'winter spices and preserved orchard fruit'],
  ['riverstone', 'riverstone', 'river herbs and a warm stone-pot finish'],
];
const signatureRows = food.filter(([, , , , , signature]) => signature === true);
const curatedSignatureKeys = new Set(signatureRows.map(([sourceId]) => sourceId));
const normalizeNameInternal = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

/** Return a stable identity for a generated signature, including old saved menus. */
export function specialtyIdentity(offering) {
  if (!offering || typeof offering !== 'object') return null;
  if (typeof offering.specialtyKey === 'string' && offering.specialtyKey.trim()) return offering.specialtyKey.trim();
  if (typeof offering.sourceId === 'string' && curatedSignatureKeys.has(offering.sourceId)) return offering.sourceId;
  return null;
}
export function normalizeSpecialtyName(value) { return normalizeNameInternal(value); }

const signatureVariants = signatureRows.flatMap(([baseKey, baseName, baseDescription, baseSp, character]) => signaturePreparations.map(([variantKey, preparation, ingredients], index) => ({
  baseKey,
  specialtyKey: `${baseKey}::${variantKey}`,
  sourceId: `specialty-${baseKey}-${variantKey}`,
  name: `${baseName} — ${preparation}`,
  description: `${baseDescription} Finished with ${ingredients}.`,
  base: baseSp + (index % 3) * 0.1,
  character,
})));

const qualityFactor = { modest: 0.8, comfortable: 1, fine: 1.25 };
const settlementFactor = { village: 0.9, town: 1, city: 1.1 };
const supplyFactor = { disrupted: 0.65, unreliable: 0.85, reliable: 1, abundant: 1.15 };
const sizeCount = { small: 6, medium: 10, large: 15 };
const roomTypes = [
  { sourceId: 'bed-common', id: 'bed-common', name: 'Common-room bed', description: 'A simple bed in a shared room.', kind: 'bed', priceCp: 30, capacity: 1, quantities: { small: 4, medium: 8, large: 16 } },
  { sourceId: 'room-private', id: 'room-private', name: 'Private room', description: 'A private room with a sturdy bed.', kind: 'room', priceCp: 100, capacity: 2, quantities: { small: 2, medium: 4, large: 8 } },
  { sourceId: 'room-large', id: 'room-large', name: 'Large room', description: 'A larger room suitable for a group.', kind: 'room', priceCp: 200, capacity: 4, quantities: { small: 1, medium: 2, large: 4 } },
  { sourceId: 'stabling', id: 'stabling', name: 'Stabling', description: 'A stall, feed, and basic care for one animal.', kind: 'stabling', priceCp: 10, capacity: 1, quantities: { small: 2, medium: 6, large: 12 } },
];

function boundsFor(bounds, kind) {
  const raw = bounds?.[kind] ?? { minCp: 0, maxCp: 10000 };
  const minCp = integer(raw.minCp); const maxCp = integer(raw.maxCp);
  if (minCp == null || maxCp == null || minCp < 0 || maxCp < minCp || maxCp > 1000000) return null;
  return { minCp, maxCp };
}
function defaults(options) {
  const pick = (key, allowed, fallback) => options[key] === undefined ? fallback : options[key];
  const type = pick('type', INN_TYPES, 'both');
  const settlement = pick('settlement', INN_SETTLEMENTS, 'town');
  const size = pick('size', INN_SIZES, 'medium');
  const quality = pick('quality', INN_QUALITIES, 'comfortable');
  const character = pick('character', INN_CHARACTERS, 'roadside');
  const supply = pick('supply', INN_SUPPLIES, 'reliable');
  const bounds = {}; let invalidBounds = false;
  for (const kind of ['meal', 'drink', 'room', 'bed', 'stabling']) {
    const provided = options.priceBounds?.[kind]; const resolved = boundsFor(options.priceBounds, kind);
    if (provided != null && !resolved) invalidBounds = true;
    bounds[kind] = resolved ?? { minCp: 0, maxCp: 10000 };
  }
  return { type, settlement, size, quality, character, supply, seed: options.seed ?? 1, minStock: options.minStock === undefined ? 4 : integer(options.minStock), maxStock: options.maxStock === undefined ? 12 : integer(options.maxStock), enabled: options.enabled !== false, intervalDays: options.intervalDays === undefined ? 7 : integer(options.intervalDays), reprice: options.reprice === true, priceBounds: bounds, invalidBounds };
}
function validate(settings) {
  if (!INN_TYPES.includes(settings.type) || !INN_SETTLEMENTS.includes(settings.settlement) || !INN_SIZES.includes(settings.size) || !INN_QUALITIES.includes(settings.quality) || !INN_CHARACTERS.includes(settings.character) || !INN_SUPPLIES.includes(settings.supply)) return 'Choose a valid inn profile.';
  if (settings.minStock == null || settings.maxStock == null || settings.minStock < 1 || settings.maxStock < settings.minStock || settings.maxStock > 10000) return 'Stock bounds must be whole numbers from 1 to 10,000.';
  if (settings.intervalDays == null || settings.intervalDays < 1 || settings.intervalDays > 365) return 'Replenishment interval must be a whole number from 1 to 365 days.';
  if (settings.invalidBounds || Object.values(settings.priceBounds).some(value => !value)) return 'Price bounds are invalid.';
  return null;
}
function priceCp(base, kind, settings) {
  const factor = qualityFactor[settings.quality] * settlementFactor[settings.settlement];
  const bounds = settings.priceBounds[kind];
  return Math.max(bounds.minCp, Math.min(bounds.maxCp, Math.round(base * 10 * factor)));
}
function weightedPick(pool, settings, rng) {
  if (!pool.length) return null;
  const weighted = pool.map(entry => ({ entry, weight: entry.character === settings.character ? 3 : 1 }));
  const total = weighted.reduce((sum, value) => sum + value.weight, 0); let pick = rng() * total;
  return weighted.find(value => (pick -= value.weight) < 0)?.entry ?? weighted.at(-1).entry;
}
function reservedSpecialties(options) {
  const keys = new Set(Array.isArray(options.reservedSpecialtyKeys) ? options.reservedSpecialtyKeys.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()) : []);
  const names = new Set(Array.isArray(options.reservedSpecialtyNames) ? options.reservedSpecialtyNames.map(normalizeNameInternal).filter(Boolean) : []);
  return { keys, names };
}
function menuEntries(settings, rng, options = {}) {
  const includeMeals = settings.type === 'tavern' || settings.type === 'inn' || settings.type === 'both';
  const includeDrinks = settings.type === 'tavern' || settings.type === 'both' || settings.type === 'inn';
  const nonAlcoholic = new Set(['tea', 'milk', 'honey-milk', 'fruit-juice', 'berry-shrub', 'mint-tea', 'spiced-cocoa', 'spring-water', 'apple-press', 'ginger-tonic', 'hazel-nut-milk']);
  const drinkPool = settings.type === 'inn' ? drinks.filter(([sourceId]) => nonAlcoholic.has(sourceId)) : drinks;
  const ordinaryMeals = includeMeals ? food.filter(([, , , , , signature = false]) => signature !== true).map(([sourceId, name, description, sp, character]) => ({ sourceId, name, description, kind: 'meal', base: sp, character })) : [];
  const ordinaryDrinks = includeDrinks ? drinkPool.map(([sourceId, name, description, sp, character]) => ({ sourceId, name, description, kind: 'drink', base: sp, character })) : [];
  const { keys: reservedKeys, names: reservedNames } = reservedSpecialties(options);
  const signaturePool = signatureVariants.filter(entry => !reservedKeys.has(entry.specialtyKey) && !reservedKeys.has(entry.baseKey) && !reservedNames.has(normalizeNameInternal(entry.name)));
  const signatureCount = settings.size === 'small' ? 1 : 2;
  if (signaturePool.length < signatureCount) return { error: 'No unreserved signature offerings remain for this menu.' };
  const chosen = [];
  const availableSignatures = [...signaturePool];
  for (let index = 0; index < signatureCount; index += 1) {
    const selected = weightedPick(availableSignatures, settings, rng);
    chosen.push({ ...selected, kind: 'meal', signature: true });
    availableSignatures.splice(availableSignatures.indexOf(selected), 1);
  }
  // Food and drink have independent budgets; a food-heavy draw must not empty the cellar.
  const addFrom = (pool, count) => {
    const available = pool.filter(entry => !chosen.some(value => value.sourceId === entry.sourceId));
    for (let index = 0; index < count && available.length; index += 1) {
      const selected = weightedPick(available, settings, rng);
      chosen.push(selected);
      available.splice(available.indexOf(selected), 1);
    }
  };
  addFrom(ordinaryMeals, sizeCount[settings.size] - signatureCount);
  if (settings.type === 'inn') {
    addFrom(ordinaryDrinks, { small: 4, medium: 6, large: 8 }[settings.size]);
  } else {
    const drinkCount = Math.min(15, { small: 10, medium: 12, large: 14 }[settings.size] + { modest: 0, comfortable: 0, fine: 1 }[settings.quality]);
    // Guarantee a useful core before choosing the remaining regional variety.
    for (const sourceId of ['ale', 'dark-ale', 'stout', 'cider', 'wine', 'mead', 'brandy', 'tea']) {
      addFrom(ordinaryDrinks.filter(entry => entry.sourceId === sourceId), 1);
    }
    addFrom(ordinaryDrinks, drinkCount - chosen.filter(entry => entry.kind === 'drink').length);
  }
  return chosen.map(entry => { const resolvedPriceCp = priceCpFor(entry, settings); return { id: `menu-${entry.sourceId}`, sourceId: entry.sourceId, specialtyKey: entry.signature ? entry.specialtyKey : undefined, specialtyName: entry.signature ? entry.name : undefined, name: entry.name, description: entry.description, kind: entry.kind, signature: entry.signature === true, priceCp: resolvedPriceCp, originalBasePriceCp: resolvedPriceCp, quantity: randomInt(rng, settings.minStock, Math.max(settings.minStock, Math.min(settings.maxStock, Math.round(settings.maxStock * (supplyFactor[settings.supply] ?? 1))))), capacity: 1, enabled: true, managed: true }; });
}
function priceCpFor(entry, settings) { return priceCp(entry.base, entry.kind, settings); }

export function generateInnOfferings(options = {}) {
  const settings = defaults(options); const error = validate(settings); if (error) return { success: false, reason: error };
  const rng = random(settings.seed); const generatedMenu = menuEntries(settings, rng, options);
  if (generatedMenu?.error) return { success: false, reason: generatedMenu.error };
  const offerings = generatedMenu;
  if (settings.type === 'inn' || settings.type === 'both') for (const room of roomTypes) {
    if (room.kind === 'stabling' && settings.type === 'inn' && settings.size === 'small') continue;
    const price = priceCp(room.priceCp / 10, room.kind, settings);
    offerings.push({ id: room.id, sourceId: room.sourceId, name: room.name, description: room.description, kind: room.kind, priceCp: price, originalBasePriceCp: price, quantity: room.quantities[settings.size], capacity: room.capacity, enabled: true, managed: true });
  }
  return { success: true, offerings, settings: clone(settings) };
}

export function replenishInnOfferings(inn, options = {}) {
  const error = validate(defaults(options));
  if (error) return { success: false, reason: error };
  const data = clone(inn ?? {}); const offerings = Array.isArray(data.offerings) ? data.offerings : [];
  const minStock = options.minStock === undefined ? 4 : integer(options.minStock);
  const maxStock = options.maxStock === undefined ? 12 : integer(options.maxStock);
  if (minStock == null || maxStock == null || minStock < 1 || maxStock < minStock || maxStock > 10000) return { success: false, reason: 'Stock bounds must be whole numbers from 1 to 10,000.' };
  const seed = options.seed ?? 1; const rng = random(seed); const supply = supplyFactor[options.supply ?? 'reliable'] ?? 1; const effectiveMax = Math.min(maxStock, Math.max(minStock, Math.round(maxStock * supply)));
  const generated = offerings.map(offering => {
    const next = { ...offering };
    if (next.managed === true && ['meal', 'drink'].includes(next.kind) && next.quantity != null) {
      next.quantity = randomInt(rng, minStock, effectiveMax);
      if (options.reprice === true) {
        const bound = defaults(options).priceBounds[next.kind]; const base = Number(next.originalBasePriceCp ?? next.priceCp); const percent = randomInt(rng, 80, 120) / 100;
        next.priceCp = Math.max(bound.minCp, Math.min(bound.maxCp, Math.round(base * percent)));
      }
    }
    return next;
  });
  return { success: true, offerings: generated };
}

export const __test = { defaults, validate, roomTypes, food, drinks, random };
export function innProfileDefaults(options = {}) { return defaults(options); }
export function validateInnProfile(options = {}) { return validate(defaults(options)); }
