import { describe, expect, it } from 'vitest';
import {
  cloneGearAuditView,
  createGearAuditContext,
  computeMissingGearItems,
  gearFallbackView,
  gearSourceSignature,
  parseGearAuditItemIds,
  auditRenderedGear
} from './gear-visibility.js';

const item = (id, type = 'item', system = {}) => ({
  id, type, name: id, img: 'item.webp', system: { unitWeight: 1, quantity: 1, ...system }
});

describe('gear visibility audit helpers', () => {
  it('preserves Foundry form metadata while expanding only detached inventory views', () => {
    const field = { toObject: () => false, render: () => 'input' };
    const actor = { id: 'actor', parent: null };
    const row = { id: 'coin', collapsed: true, storedItem: { id: 'child', storageCollapsed: true } };
    const source = { actor, fields: { equipped: field }, topLevelGearItems: [row], bodyCollapsed: true };
    const audit = createGearAuditContext(source);
    expect(audit.actor).toBe(actor);
    expect(audit.fields).toBe(source.fields);
    expect(audit.fields.equipped).toBe(field);
    expect(audit.topLevelGearItems[0]).not.toBe(row);
    expect(audit.topLevelGearItems[0].collapsed).toBe(false);
    expect(row.collapsed).toBe(true);
    expect(audit.topLevelGearItems[0].storedItem.storageCollapsed).toBe(false);
  });

  it('clones expanded views without changing live collapse state', () => {
    const source = { collapsed: true, storageCollapsed: true, nested: [{ lashedCollapsed: true }] };
    const copy = cloneGearAuditView(source);
    expect(copy).toEqual({ collapsed: false, storageCollapsed: false, nested: [{ lashedCollapsed: false }] });
    expect(source.collapsed).toBe(true);
  });

  it('detects only physical items absent from Gear and Combat', () => {
    const items = [item('coin', 'coin'), item('weapon', 'weapon'), item('actor-note', 'journal')];
    expect(computeMissingGearItems(items, new Set(['coin']), new Set(['weapon'])).map(i => i.id)).toEqual([]);
    expect(computeMissingGearItems(items, new Set(), new Set(['weapon'])).map(i => i.id)).toEqual(['coin']);
  });

  it('creates detached fallback rows with exact quantity and stack weight', () => {
    const source = item('coins', 'coin', { quantity: 0, unitWeight: 0.02 });
    const fallback = gearFallbackView(source, 'warning');
    expect(fallback).toMatchObject({ id: 'coins', _gearSection: 'item', displayQuantity: 0, displayWeight: 0, displayUnitWeight: 0.02, gearVisibilityWarning: 'warning' });
    expect(source.system.quantity).toBe(0);
  });

  it('reuses source signatures for collapse-only changes and changes on inventory changes', () => {
    const source = item('coin', 'coin', { quantity: 3 });
    const first = gearSourceSignature([source]);
    source.collapsed = true;
    expect(gearSourceSignature([source])).toBe(first);
    source.system.quantity = 4;
    expect(gearSourceSignature([source])).not.toBe(first);
  });

  it('parses explicit item rows only', () => {
    const html = '<li data-item-id="coin" class="item-entry"></li><button data-item-id="control"></button><div class="item-header lashed-deep-stored-item" data-item-id="weapon"></div>';
    expect([...parseGearAuditItemIds(html, new Set(['coin', 'weapon', 'control']))]).toEqual(['coin', 'weapon']);
  });

  it('clones document views through explicit fields without traversing document internals', () => {
    const document = {
      id: 'coin', name: 'Coin', type: 'coin', img: 'coin.webp', system: { quantity: 2 },
      toObject: () => ({ id: 'coin', name: 'Coin', type: 'coin', img: 'coin.webp', system: { quantity: 2 } })
    };
    Object.defineProperty(document, 'parent', { get: () => document, enumerable: true });
    expect(cloneGearAuditView(document)).toMatchObject({ id: 'coin', name: 'Coin', type: 'coin', system: { quantity: 2 } });
  });

  it('caches successful audits, invalidates source changes, and retries failures', async () => {
    const source = item('coin', 'coin', { quantity: 1 });
    let calls = 0;
    globalThis.foundry = { applications: { handlebars: { renderTemplate: async () => {
      calls += 1;
      return '<li class="item-entry" data-item-id="coin"></li>';
    } } } };
    const first = await auditRenderedGear({ context: {}, items: [source], revision: 'actor' });
    const cached = await auditRenderedGear({ context: {}, items: [source], cache: first, revision: 'actor' });
    expect(calls).toBe(1);
    expect(cached.coveredIds.has('coin')).toBe(true);
    source.system.quantity = 2;
    await auditRenderedGear({ context: {}, items: [source], cache: cached, revision: 'actor' });
    expect(calls).toBe(2);
    globalThis.foundry.applications.handlebars.renderTemplate = async () => { calls += 1; throw new Error('boom'); };
    const failed = await auditRenderedGear({ context: {}, items: [source], cache: cached, revision: 'actor' });
    expect(failed.warning).toMatch(/unavailable/);
    await auditRenderedGear({ context: {}, items: [source], cache: failed, revision: 'actor' });
    expect(calls).toBe(4);
    delete globalThis.foundry;
  });
});
