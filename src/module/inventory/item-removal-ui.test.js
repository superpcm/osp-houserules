import { beforeEach, describe, expect, it, vi } from 'vitest';

const removeInventoryItem = vi.fn(async () => ({ success: true }));
const inventoryRemovalFingerprint = vi.fn(() => 'pre-dialog-fingerprint');
const relocationTargets = vi.fn(() => [{ id: 'target', name: 'Target' }]);

vi.mock('./item-removal.js', () => ({ inventoryRemovalFingerprint, relocationTargets, removeInventoryItem }));
vi.mock('./containment.js', () => ({
  inventoryItems: actor => actor.items,
  containedSubtree: (items, rootId) => items.filter(item => item.system?.containerId === rootId),
  orphanedItems: items => items.filter(item => item.system?.containerId === 'missing')
}));
vi.mock('./encumbrance.js', () => ({
  normalizeQuantity: value => {
    const raw = value && typeof value === 'object' ? value.value : value;
    return raw === undefined || raw === null || raw === '' ? 1 : Number(raw);
  }
}));

let dialogResponses;
let dialogs;
let uiModule;
let actor;

const htmlWithValues = values => ({
  find: selector => ({ val: () => values[selector] })
});

const queueDialog = response => dialogResponses.push(response);

beforeEach(async () => {
  vi.resetModules();
  removeInventoryItem.mockClear();
  inventoryRemovalFingerprint.mockClear();
  relocationTargets.mockClear();
  dialogResponses = [];
  dialogs = [];
  actor = {
    id: 'actor-1',
    items: [],
    sheet: { render: vi.fn() }
  };
  globalThis.game = { scenes: { active: { id: 'scene-1' } } };
  globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
  globalThis.Dialog = class {
    constructor(options) {
      this.options = options;
      dialogs.push(options);
    }

    render() {
      const response = dialogResponses.shift();
      if (!response) throw new Error('No queued dialog response');
      if (response === 'close') this.options.close?.();
      else this.options.buttons[response.button].callback(response.html);
      return this;
    }
  };
  uiModule = await import('./item-removal-ui.js');
});

const item = (id, system = {}, type = 'item') => ({ id, name: id, type, system: { quantity: 1, ...system } });

describe('inventory removal UI', () => {
  it('does not remove when quantity or populated-container destination dialogs are cancelled or closed', async () => {
    const stack = item('stack', { quantity: 2 });
    actor.items = [stack];
    queueDialog({ button: 'cancel', html: htmlWithValues({}) });
    await uiModule.deleteInventoryItem(actor, stack);

    queueDialog('close');
    await uiModule.deleteInventoryItem(actor, stack);

    const container = item('container', { quantity: 1 }, 'container');
    const child = item('child', { containerId: 'container' });
    actor.items = [container, child];
    queueDialog({ button: 'cancel', html: htmlWithValues({}) });
    await uiModule.deleteInventoryItem(actor, container);

    queueDialog('close');
    await uiModule.deleteInventoryItem(actor, container);

    expect(removeInventoryItem).not.toHaveBeenCalled();
  });

  it('gathers all destinations before one service call with the pre-dialog fingerprint and scene', async () => {
    const container = item('container', { quantity: 1 }, 'container');
    const child = item('child', { containerId: 'container' });
    const loose = item('loose', { containerId: 'container' });
    actor.items = [container, child, loose];
    queueDialog({
      button: 'move',
      html: htmlWithValues({ '[name="destination-child"]': 'target', '[name="destination-loose"]': 'ground' })
    });

    await uiModule.deleteInventoryItem(actor, container);

    expect(removeInventoryItem).toHaveBeenCalledTimes(1);
    expect(removeInventoryItem).toHaveBeenCalledWith(actor, {
      action: 'delete',
      itemId: 'container',
      quantity: 1,
      destinations: [
        { itemId: 'child', targetId: 'target' },
        { itemId: 'loose', targetId: 'ground' }
      ],
      expected: 'pre-dialog-fingerprint',
      sceneId: 'scene-1'
    });
  });

  it('skips evacuation when deleting only part of a populated stack', async () => {
    const container = item('container', { quantity: 2 }, 'container');
    const child = item('child', { containerId: 'container' });
    actor.items = [container, child];
    queueDialog({ button: 'selected', html: htmlWithValues({ '[name="quantity"]': '1' }) });

    await uiModule.deleteInventoryItem(actor, container);

    expect(dialogs).toHaveLength(1);
    expect(removeInventoryItem).toHaveBeenCalledWith(actor, {
      action: 'delete', itemId: 'container', quantity: 1, destinations: [], expected: 'pre-dialog-fingerprint', sceneId: 'scene-1'
    });
  });

  it('does not write when nested ground-drop or orphan repair confirmation is cancelled', async () => {
    const parent = item('parent', {}, 'container');
    const nested = item('nested', { containerId: 'parent' });
    actor.items = [parent, nested];
    queueDialog({ button: 'cancel', html: htmlWithValues({}) });
    await uiModule.dropInventoryItem(actor, parent);

    const orphan = item('orphan', { containerId: 'missing' });
    actor.items = [orphan];
    queueDialog({ button: 'cancel', html: htmlWithValues({}) });
    await uiModule.repairInventoryLinks(actor);

    expect(removeInventoryItem).not.toHaveBeenCalled();
  });
});

describe('DM Toolkit inventory link repair', () => {
  const enableGM = () => {
    actor.type = 'character'; actor.name = 'Scout';
    game.user = { isGM: true };
    game.actors = { filter: fn => [actor].filter(fn), get: id => id === actor.id ? actor : undefined };
  };
  it('is restricted to GMs and supports cancelling character selection', async () => {
    enableGM(); game.user.isGM = false;
    await uiModule.repairInventoryLinksFromToolkit(); expect(dialogs).toHaveLength(0);
    game.user.isGM = true; queueDialog({ button:'cancel', html:htmlWithValues({}) });
    await uiModule.repairInventoryLinksFromToolkit(); expect(removeInventoryItem).not.toHaveBeenCalled();
  });
  it('routes the selected character through the existing preview and repair authority', async () => {
    enableGM(); actor.items = [item('orphan', {containerId:'missing'})];
    queueDialog({button:'choose',html:htmlWithValues({'[name="repair-actor"]':actor.id})});
    queueDialog({button:'repair',html:htmlWithValues({})});
    await uiModule.repairInventoryLinksFromToolkit();
    expect(dialogs[1].content).toContain('orphan');
    expect(removeInventoryItem).toHaveBeenCalledWith(actor,expect.objectContaining({action:'repair'}));
  });
  it('handles no characters and a character removed while choosing', async () => {
    enableGM(); game.actors.filter=()=>[];
    await uiModule.repairInventoryLinksFromToolkit();expect(dialogs).toHaveLength(0);
    game.actors.filter=()=>[actor];game.actors.get=()=>undefined;
    queueDialog({button:'choose',html:htmlWithValues({'[name="repair-actor"]':actor.id})});
    await uiModule.repairInventoryLinksFromToolkit();expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining('no longer available'));
    expect(removeInventoryItem).not.toHaveBeenCalled();
  });
});
