import { expect, it } from 'vitest';
import { collectSystemData, renderTypeFields } from './catalog-schema.js';

it('provides explicit availability and nullable blacksmith controls for new equipment', () => {
  for (const type of ['item', 'weapon', 'armor', 'ammunition', 'clothing', 'container']) {
    const html = renderTypeFields(type);
    expect(html).toContain('data-sys-field="storeAvailability"');
    expect(html).toContain('Exceptional');
    expect(html).toContain('data-sys-field="blacksmithEligible"');
    expect(html).toContain('Unset');
  }
  expect(renderTypeFields('coin')).not.toContain('storeAvailability');
});

it('serializes new item stocking fields as nullable values and actual booleans', () => {
  globalThis.foundry = { utils: { expandObject: value => value } };
  const collect = (availability, smith) => collectSystemData({ querySelectorAll: () => [
    { dataset: { sysField: 'storeAvailability', sysKind: 'select' }, value: availability },
    { dataset: { sysField: 'blacksmithEligible', sysKind: 'select' }, value: smith },
  ] });
  expect(collect('', '')).toEqual({ storeAvailability: null, blacksmithEligible: null });
  expect(collect('rare', 'false')).toEqual({ storeAvailability: 'rare', blacksmithEligible: false });
  expect(collect('common', 'true')).toEqual({ storeAvailability: 'common', blacksmithEligible: true });
});
