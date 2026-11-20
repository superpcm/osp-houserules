import { describe, expect, it } from 'vitest';
import { dropQuantityPrompt, isCatalogQuantityItem } from './drop-quantity.js';

const item = (name, type = 'item', tags = []) => ({ name, type, system: { quantity: 1, tags } });

describe('drop quantity eligibility', () => {
  it('prompts for every ammunition type and approved repeatable supply', () => {
    expect(isCatalogQuantityItem(item('Crossbow Bolt, Light', 'ammunition', ['bolts']))).toBe(true);
    expect(isCatalogQuantityItem(item('Piton'))).toBe(true);
    expect(isCatalogQuantityItem(item('Rations, Standard'))).toBe(true);
    expect(isCatalogQuantityItem(item('Dart', 'weapon'))).toBe(true);
  });

  it('excludes non-repeatable equipment and uses bundle units for catalog arrows', () => {
    expect(isCatalogQuantityItem(item('Sword', 'weapon'))).toBe(false);
    const prompt = dropQuantityPrompt(item('Arrow', 'ammunition', ['arrows']), { catalog: true });
    expect(prompt).toMatchObject({ prompt: true, initial: 1, max: 1000, unitLabel: '20-arrow bundles', arrowBundles: true });
  });

  it('uses six-torch bundles for catalog torches while leaving owned stacks individual', () => {
    const sale = dropQuantityPrompt(item('Torch'), { catalog: true });
    expect(sale).toMatchObject({ prompt: true, initial: 1, max: 1000, unitLabel: '6-torch bundles', torchBundles: true });
    const owned = dropQuantityPrompt({ name: 'Torch', type: 'item', system: { quantity: 8, tags: ['light-source'] } }, { available: 8 });
    expect(owned).toMatchObject({ prompt: true, initial: 8, max: 8, unitLabel: 'items', torchBundles: false });
  });

  it('keeps owned stack prompts bounded by the live quantity', () => {
    const prompt = dropQuantityPrompt({ name: 'Piton', type: 'item', system: { quantity: 7 } }, { available: 7 });
    expect(prompt).toMatchObject({ prompt: true, initial: 7, max: 7, unitLabel: 'items', arrowBundles: false });
  });
});

for (const name of ['Copper Coins', 'Silver Coins', 'Gold Coins']) {
  it(`prompts for catalog ${name} in individual coins`, () => {
    expect(dropQuantityPrompt(item(name, 'coin'), {catalog: true})).toMatchObject({prompt:true, initial:1, max:Infinity, unitLabel:'coins', arrowBundles:false});
  });
  it(`bounds owned ${name} transfers by the actual stack`, () => {
    expect(dropQuantityPrompt({name,type:'coin',system:{quantity:37}}, {available:37})).toMatchObject({prompt:true, initial:37, max:37, unitLabel:'coins', arrowBundles:false});
  });
}
