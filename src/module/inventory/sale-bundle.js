import { isArrowAmmo, ARROW_SALE_BUNDLE_QUANTITY, prepareArrowSaleBundle } from './arrow-bundle.js';
import { isTorch, TORCH_SALE_BUNDLE_QUANTITY, prepareTorchSaleBundle } from './torch-bundle.js';
import { isBoltAmmo, BOLT_SALE_BUNDLE_QUANTITY, prepareBoltSaleBundle } from './bolt-bundle.js';

/** Sale quantities count bundles; owned inventory quantities count individual items. */
export const saleBundleQuantity = item => isArrowAmmo(item) ? ARROW_SALE_BUNDLE_QUANTITY : isTorch(item) ? TORCH_SALE_BUNDLE_QUANTITY : isBoltAmmo(item) ? BOLT_SALE_BUNDLE_QUANTITY : 1;
export const isSaleBundle = item => saleBundleQuantity(item) > 1;
export const saleBundleUnit = item => isArrowAmmo(item) ? 'arrows' : isTorch(item) ? 'torches' : isBoltAmmo(item) ? 'bolts' : 'items';
export const prepareSaleBundle = item => isTorch(item) ? prepareTorchSaleBundle(item) : isBoltAmmo(item) ? prepareBoltSaleBundle(item) : prepareArrowSaleBundle(item);
