import { isArrowAmmo, isProtectedArrowBundle, ARROW_SALE_BUNDLE_QUANTITY } from './arrow-bundle.js';
import { isProtectedTorchBundle, isTorch, TORCH_SALE_BUNDLE_QUANTITY } from './torch-bundle.js';
import { isBoltAmmo, isProtectedBoltBundle, BOLT_SALE_BUNDLE_QUANTITY } from './bolt-bundle.js';
import { canStackItems, isUniqueStackItem } from './stack-identity.js';

const REPEATABLE_SUPPLIES = new Set([
  'Piton', 'Iron Spike', 'Torch', 'Wooden Stake', 'Oil Flask', 'Holy Water',
  'Acid', 'Healing Potion', 'Rations, Iron', 'Rations, Standard', 'Garlic', 'Wolfsbane', 'Dart',
]);

export function isCatalogQuantityItem(item) {
  if (isUniqueStackItem(item)) return false;
  const name = String(item?.name ?? '').replace(/\s*[+-]\d+$/, '');
  if (item?.type === 'ammunition' || item?.type === 'coin') return true;
  if (!['item', 'weapon'].includes(item?.type)) return false;
  if (item.type === 'weapon' && !['Dart', 'Oil Flask', 'Holy Water'].includes(name)) return false;
  return REPEATABLE_SUPPLIES.has(name);
}

export function dropQuantityPrompt(item, { catalog = false, available = Infinity } = {}) {
  const arrowBundles = catalog && isCatalogQuantityItem(item) && isArrowAmmo(item);
  const torchBundles = catalog && isCatalogQuantityItem(item) && isTorch(item);
  const boltBundles = catalog && isCatalogQuantityItem(item) && isBoltAmmo(item);
  return {
    prompt: catalog ? isCatalogQuantityItem(item) : Number(available) > 1 && (canStackItems(item, item) || isProtectedArrowBundle(item) && !isUniqueStackItem(item) || isProtectedTorchBundle(item) && !isUniqueStackItem(item) || isProtectedBoltBundle(item) && !isUniqueStackItem(item)),
    initial: catalog && isCatalogQuantityItem(item) ? 1 : Math.max(1, Number(item?.system?.quantity) || 1),
    max: arrowBundles || torchBundles || boltBundles ? 1000 : available,
    unitLabel: arrowBundles ? '20-arrow bundles' : torchBundles ? `${TORCH_SALE_BUNDLE_QUANTITY}-torch bundles` : boltBundles ? `${BOLT_SALE_BUNDLE_QUANTITY}-bolt bundles` : item?.type === 'coin' ? 'coins' : isArrowAmmo(item) ? 'arrows' : 'items',
    arrowBundles,
    torchBundles,
    boltBundles,
  };
}

export const ARROW_BUNDLE_QUANTITY = ARROW_SALE_BUNDLE_QUANTITY;
