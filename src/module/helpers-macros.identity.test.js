import { beforeEach, describe, expect, it, vi } from 'vitest';

const rollWeapon = vi.hoisted(() => vi.fn());
vi.mock('./actor/sheets/handlers/item-handler.js', () => ({
  ItemHandler: class { rollWeapon = rollWeapon; },
}));
vi.mock('./spells/spellcasting-ui.js', () => ({ castSpellItem: vi.fn() }));

const setupGlobals = () => {
  vi.stubGlobal('ui', { notifications: { warn: vi.fn(), error: vi.fn() } });
  vi.stubGlobal('ChatMessage', { getSpeaker: () => ({}) });
  vi.stubGlobal('canvas', { tokens: { placeables: [], controlled: [] } });
};

beforeEach(() => {
  rollWeapon.mockReset();
  setupGlobals();
});

describe('item macro document identity', () => {
  it('generates a stable reference command and reuses exact duplicates', async () => {
    const actor = { id: 'a1', uuid: 'Actor.a1', documentName: 'Actor' };
    const item = { id: 'i1', uuid: 'Actor.a1.Item.i1', name: 'Sword', img: 'sword.png', parent: actor };
    const created = [];
    const macros = { find: vi.fn(predicate => created.find(predicate)) };
    vi.stubGlobal('fromUuid', vi.fn(async () => item));
    vi.stubGlobal('game', {
      system: { id: 'osp-houserules' }, macros, user: { assignHotbarMacro: vi.fn() },
    });
    vi.stubGlobal('Macro', { create: vi.fn(async data => { const macro = { ...data }; created.push(macro); return macro; }) });
    const { createOspMacro } = await import('./helpers-macros.js');

    await createOspMacro({ type: 'Item', uuid: item.uuid }, 1);
    await createOspMacro({ type: 'Item', uuid: item.uuid }, 2);

    expect(created).toHaveLength(1);
    expect(created[0].command).toBe(`game.osp.rollItemMacro(${JSON.stringify({ itemUuid: item.uuid, actorUuid: actor.uuid, itemId: item.id, itemName: item.name })});`);
    expect(created[0].flags['osp-houserules']).toMatchObject({ itemUuid: item.uuid, actorUuid: actor.uuid, itemId: item.id });
  });

  it('resolves an unlinked token item by both UUIDs and refuses stale references', async () => {
    const actor = { id: 'synthetic', uuid: 'Scene.s.Token.t.Actor.synthetic', items: [] };
    const item = { id: 'i1', uuid: `${actor.uuid}.Item.i1`, name: 'Bite', type: 'weapon', parent: actor };
    const alternative = { id: 'i2', uuid: `${actor.uuid}.Item.i2`, name: 'Bite', type: 'weapon', parent: actor };
    actor.items = [item, alternative];
    const lookup = new Map([[actor.uuid, actor], [item.uuid, item], [alternative.uuid, alternative]]);
    vi.stubGlobal('fromUuid', vi.fn(async uuid => lookup.get(uuid) ?? null));
    vi.stubGlobal('game', { actors: new Map(), user: { id: 'u1' } });
    const { rollItemMacro } = await import('./helpers-macros.js');

    await rollItemMacro({ itemUuid: item.uuid, actorUuid: actor.uuid, itemId: item.id, itemName: item.name });
    expect(rollWeapon).toHaveBeenCalledWith(item);
    await rollItemMacro({ itemUuid: 'Scene.s.Token.t.Actor.synthetic.Item.old', actorUuid: actor.uuid, itemId: 'old', itemName: item.name });
    expect(ui.notifications.warn).toHaveBeenCalledWith('Could not find the item referenced by this macro');
    expect(rollWeapon).toHaveBeenCalledTimes(1);
  });

  it('keeps renamed and duplicate sibling references bound to their exact documents', async () => {
    const actor = { id: 'a1', uuid: 'Actor.a1', documentName: 'Actor' };
    const first = { id: 'i1', uuid: 'Actor.a1.Item.i1', name: 'Old Name', img: 'a.png', parent: actor };
    const sibling = { id: 'i2', uuid: 'Actor.a1.Item.i2', name: 'New Name', img: 'b.png', parent: actor };
    const docs = new Map([[first.uuid, first], [sibling.uuid, sibling]]);
    const created = [];
    vi.stubGlobal('fromUuid', vi.fn(async uuid => docs.get(uuid)));
    vi.stubGlobal('game', { system: { id: 'osp-houserules' }, macros: { find: predicate => created.find(predicate) }, user: { assignHotbarMacro: vi.fn() } });
    vi.stubGlobal('Macro', { create: vi.fn(async data => { created.push(data); return data; }) });
    const { createOspMacro } = await import('./helpers-macros.js');

    await createOspMacro({ type: 'Item', uuid: first.uuid }, 1);
    first.name = 'New Name';
    await createOspMacro({ type: 'Item', uuid: first.uuid }, 2);
    await createOspMacro({ type: 'Item', uuid: sibling.uuid }, 3);
    await createOspMacro({ type: 'Item', uuid: first.uuid }, 4);

    expect(created).toHaveLength(3);
    expect(created.map(macro => JSON.parse(macro.command.match(/rollItemMacro\((.*)\);/)[1]).itemUuid)).toEqual([first.uuid, first.uuid, sibling.uuid]);
    expect(created[1].command).toContain('"itemName":"New Name"');
  });

  it('warns instead of rejecting when a bound UUID resolver throws', async () => {
    vi.stubGlobal('fromUuid', vi.fn(async () => { throw new Error('stale'); }));
    vi.stubGlobal('game', { actors: new Map(), user: { id: 'u1' } });
    const { rollItemMacro } = await import('./helpers-macros.js');
    await expect(rollItemMacro({ itemUuid: 'bad', actorUuid: 'bad', itemId: 'bad', itemName: 'Sword' })).resolves.toBeUndefined();
    expect(ui.notifications.warn).toHaveBeenCalledWith('Could not find the item referenced by this macro');
  });

  it('rejects mismatched actor and item identities', async () => {
    const actor = { id: 'a1', uuid: 'Actor.a1', items: [] };
    const other = { id: 'a2', uuid: 'Actor.a2', items: [] };
    const item = { id: 'i1', uuid: 'Actor.a1.Item.i1', name: 'Sword', type: 'weapon', parent: actor };
    actor.items = [item];
    vi.stubGlobal('fromUuid', vi.fn(async uuid => ({ [actor.uuid]: actor, [other.uuid]: other, [item.uuid]: item }[uuid] ?? null)));
    vi.stubGlobal('game', { actors: new Map(), user: { id: 'u1' } });
    const { rollItemMacro } = await import('./helpers-macros.js');
    await rollItemMacro({ itemUuid: item.uuid, actorUuid: other.uuid, itemId: item.id, itemName: item.name });
    await rollItemMacro({ itemUuid: item.uuid, actorUuid: actor.uuid, itemId: 'wrong', itemName: item.name });
    expect(rollWeapon).not.toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalledWith('The actor referenced by this macro no longer matches');
    expect(ui.notifications.warn).toHaveBeenCalledWith('The item referenced by this macro no longer matches');
  });

  it('keeps unique legacy macros working but stops on ambiguous names', async () => {
    const item = { id: 'i1', name: 'Sword', type: 'weapon', parent: { id: 'a1' } };
    const actor = { id: 'a1', items: [item] };
    vi.stubGlobal('game', { actors: new Map([['a1', actor]]), user: { id: 'u1' } });
    const { rollItemMacro } = await import('./helpers-macros.js');
    await rollItemMacro('Sword', 'a1');
    expect(rollWeapon).toHaveBeenCalledWith(item);
    rollWeapon.mockClear();
    actor.items.push({ id: 'i2', name: 'Sword', type: 'weapon', parent: actor });
    await rollItemMacro('Sword', 'a1');
    expect(rollWeapon).not.toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining('Multiple items named'));
  });

  it('prefers the matching speaker synthetic actor and handles controlled-token ambiguity safely', async () => {
    const speakerActor = { id: 'synthetic', uuid: 'Scene.s.Token.one.Actor.synthetic', baseActor: { id: 'a1' }, items: [] };
    const item = { id: 'i1', name: 'Sword', type: 'weapon', parent: speakerActor };
    speakerActor.items = [item];
    const other = { id: 'synthetic-two', uuid: 'Scene.s.Token.two.Actor.synthetic', baseActor: { id: 'a1' }, items: [item] };
    vi.stubGlobal('ChatMessage', { getSpeaker: () => ({ token: 'one', scene: 's' }) });
    vi.stubGlobal('canvas', { tokens: { placeables: [{ id: 'one', actor: speakerActor }], controlled: [{ actor: speakerActor }, { actor: other }] } });
    vi.stubGlobal('game', { actors: new Map([['a1', { id: 'a1', items: [] }]]), user: { id: 'u1' } });
    const { rollItemMacro } = await import('./helpers-macros.js');
    await rollItemMacro('Sword', 'a1');
    expect(rollWeapon).toHaveBeenCalledWith(item);

    rollWeapon.mockClear();
    vi.stubGlobal('ChatMessage', { getSpeaker: () => ({}) });
    await rollItemMacro('Sword', 'a1');
    expect(rollWeapon).not.toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining('Multiple token actors'));
  });

  it('keeps world-item drops on the legacy speaker-name command', async () => {
    const item = { id: 'world-item', uuid: 'Item.world-item', name: 'World Sword', img: 'sword.png' };
    const created = [];
    vi.stubGlobal('fromUuid', vi.fn(async () => item));
    vi.stubGlobal('game', { system: { id: 'osp-houserules' }, macros: { find: predicate => created.find(predicate) }, user: { assignHotbarMacro: vi.fn() } });
    vi.stubGlobal('Macro', { create: vi.fn(async data => { created.push(data); return data; }) });
    const { createOspMacro } = await import('./helpers-macros.js');
    await createOspMacro({ type: 'Item', uuid: item.uuid }, 1);
    expect(created[0].command).toBe(`game.osp.rollItemMacro(${JSON.stringify(item.name)});`);
  });

  it('warns instead of rejecting when macro creation UUID resolution throws', async () => {
    vi.stubGlobal('fromUuid', vi.fn(async () => { throw new Error('stale'); }));
    const { createOspMacro } = await import('./helpers-macros.js');
    await expect(createOspMacro({ type: 'Item', uuid: 'Item.stale' }, 1)).resolves.toBeUndefined();
    expect(ui.notifications.warn).toHaveBeenCalledWith('Could not find item for macro');
  });
});
