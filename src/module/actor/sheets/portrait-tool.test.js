import { describe, expect, it, vi } from 'vitest';
import { PortraitTool } from './portrait-tool.js';

const makeRoot = fields => {
  const win = { setTimeout: vi.fn(), clearTimeout: vi.fn(), Event };
  const doc = { defaultView: win, createElement: vi.fn() };
  const root = {
    nodeType: 1,
    ownerDocument: doc,
    querySelector: selector => fields[selector] ?? null,
    appendChild: vi.fn(),
  };
  return { root, win, doc };
};

describe('PortraitTool native sheet scoping', () => {
  it('updates hidden portrait fields only in its own native sheet element', () => {
    const fieldsA = { scale: { value: '' }, x: { value: '' }, y: { value: '' } };
    const fieldsB = { scale: { value: '' }, x: { value: '' }, y: { value: '' } };
    const selectors = (fields) => ({ 'input[name="system.userPortrait.scale"]': fields.scale, 'input[name="system.userPortrait.x"]': fields.x, 'input[name="system.userPortrait.y"]': fields.y });
    const rootA = makeRoot(selectors(fieldsA));
    const rootB = makeRoot(selectors(fieldsB));
    const toolA = new PortraitTool({ element: rootA.root });
    const toolB = new PortraitTool({ element: rootB.root });
    const container = { style: { setProperty: vi.fn() } };

    toolA.scale = 1.2;
    toolB.scale = 1.8;
    toolA.updatePortrait(container);
    toolB.updatePortrait(container);

    expect(fieldsA.scale.value).toBe(1.2);
    expect(fieldsB.scale.value).toBe(1.8);
    expect(fieldsA.x.value).toBe(0);
    expect(fieldsB.x.value).toBe(0);
  });

  it('does not bind delayed initialization after destroy', () => {
    const portrait = { addEventListener: vi.fn() };
    const rootData = makeRoot({ '.portrait-display': portrait });
    const timer = vi.fn(() => 7);
    rootData.win.setTimeout = timer;
    const tool = new PortraitTool({ element: rootData.root, actor: { isOwner: true } });

    tool.initialize();
    tool.destroy();
    const callback = timer.mock.calls[0][0];
    callback();

    expect(rootData.win.clearTimeout).toHaveBeenCalledWith(7);
    expect(portrait.addEventListener).not.toHaveBeenCalled();
  });
});
