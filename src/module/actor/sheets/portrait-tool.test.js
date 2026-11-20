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
    const fieldsA = { scale: { value: '' }, x: { value: '' }, y: { value: '' }, rotation: { value: '' } };
    const fieldsB = { scale: { value: '' }, x: { value: '' }, y: { value: '' }, rotation: { value: '' } };
    const selectors = (fields) => ({ 'input[name="system.userPortrait.scale"]': fields.scale, 'input[name="system.userPortrait.x"]': fields.x, 'input[name="system.userPortrait.y"]': fields.y, 'input[name="system.userPortrait.rotation"]': fields.rotation });
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

  it.each([
    ['move-up', 'y', -1],
    ['move-down', 'y', 1],
    ['move-left', 'x', -1],
    ['move-right', 'x', 1],
  ])('moves %s by the documented increments', (action, axis, direction) => {
    const tool = new PortraitTool({ element: makeRoot({}).root });
    const container = { style: { setProperty: vi.fn() } };
    for (const [event, step] of [
      [{}, 1],
      [{ shiftKey: true }, 5],
      [{ ctrlKey: true }, 10],
      [{ shiftKey: true, ctrlKey: true }, 0.5],
    ]) {
      tool.x = 0;
      tool.y = 0;
      tool.handleButtonAction(action, event, {}, container);
      expect(tool[axis]).toBe(direction * step);
      expect(container.style.setProperty).toHaveBeenCalledWith(`--user-portrait-${axis}`, `${direction * step}px`);
    }
  });

  it('rotates in both directions with modifier increments and updates the portrait field', () => {
    const rotation = { value: '' };
    const rootData = makeRoot({ 'input[name="system.userPortrait.rotation"]': rotation });
    const tool = new PortraitTool({ element: rootData.root });
    const container = { style: { setProperty: vi.fn() } };

    tool.rotation = 0;
    tool.handleButtonAction('rotate-left', {}, {}, container);
    expect(tool.rotation).toBe(359);
    tool.handleButtonAction('rotate-right', { shiftKey: true }, {}, container);
    expect(tool.rotation).toBe(4);
    tool.handleButtonAction('rotate-right', { ctrlKey: true }, {}, container);
    expect(tool.rotation).toBe(19);
    tool.handleButtonAction('rotate-right', { shiftKey: true, ctrlKey: true }, {}, container);
    expect(tool.rotation).toBe(24);
    expect(rotation.value).toBe(24);
    expect(container.style.setProperty).toHaveBeenCalledWith('--user-portrait-rotation', '24deg');
  });

  it('resets rotation and persists it with the other portrait adjustments', async () => {
    const field = () => ({ value: '', setAttribute: vi.fn() });
    const fields = { scale: field(), x: field(), y: field(), rotation: field() };
    const rootData = makeRoot({
      'input[name="system.userPortrait.scale"]': fields.scale,
      'input[name="system.userPortrait.x"]': fields.x,
      'input[name="system.userPortrait.y"]': fields.y,
      'input[name="system.userPortrait.rotation"]': fields.rotation,
    });
    const actor = { update: vi.fn(() => Promise.resolve()) };
    const tool = new PortraitTool({ element: rootData.root, actor });
    const container = { style: { setProperty: vi.fn() } };
    tool.scale = 1.8;
    tool.x = 12;
    tool.y = -4;
    tool.rotation = 90;
    tool.handleButtonAction('reset', {}, {}, container);
    expect(tool.rotation).toBe(0);
    await tool.savePortraitData();
    expect(actor.update).toHaveBeenCalledWith({
      'system.userPortrait.scale': 1,
      'system.userPortrait.x': 0,
      'system.userPortrait.y': 0,
      'system.userPortrait.rotation': 0,
    }, { render: false });
    expect(fields.rotation.value).toBe(0);
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


describe('PortraitTool direct manipulation', () => {
  const fixture = () => {
    const events = new Map();
    const classes = new Set(['adjusting']);
    const container = { classList: { contains: name => classes.has(name) },
      offsetWidth: 100, offsetHeight: 200,
      getBoundingClientRect: () => ({ width: 150, height: 300 }),
      style: { setProperty: vi.fn() } };
    const display = { addEventListener: (type, fn) => events.set(type, fn),
      removeEventListener: (type) => events.delete(type),
      classList: { add: vi.fn(), remove: vi.fn() },
      setPointerCapture: vi.fn(), hasPointerCapture: () => true,
      releasePointerCapture: vi.fn() };
    const tool = new PortraitTool({ element: makeRoot({ '#portrait-container': container }).root });
    tool.setupPortraitGestures(display);
    const fire = (type, props = {}) => {
      const event = { button: 0, pointerId: 1, clientX: 10, clientY: 20,
        preventDefault: vi.fn(), stopPropagation: vi.fn(), ...props };
      events.get(type)(event);
      return event;
    };
    return { tool, fire, classes, display, events };
  };
  it('drags in screen coordinates at sheet and portrait zoom, and stops on cancellation', () => {
    const { tool, fire, display } = fixture();
    tool.scale = 2;
    fire('pointerdown');
    fire('pointermove', { clientX: 40, clientY: 80 });
    expect(tool.x).toBe(10);
    expect(tool.y).toBe(20);
    fire('pointercancel');
    fire('pointermove', { clientX: 100 });
    expect(tool.x).toBe(10);
    expect(display.releasePointerCapture).toHaveBeenCalledWith(1);
  });
  it('ignores gestures outside adjustment mode and clamps wheel zoom to 0.5–10', () => {
    const { tool, fire, classes } = fixture();
    classes.clear();
    expect(fire('wheel', { deltaY: -1 }).preventDefault).not.toHaveBeenCalled();
    fire('pointerdown');fire('pointermove', { clientX: 100 });
    expect(tool.x).toBe(0);
    classes.add('adjusting');
    tool.scale = 10;
    expect(fire('wheel', { deltaY: -1 }).preventDefault).toHaveBeenCalled();
    expect(tool.scale).toBe(10);
    tool.scale = 0.5;fire('wheel', { deltaY: 1 });expect(tool.scale).toBe(0.5);
    fire('wheel', { deltaY: -1 });expect(tool.scale).toBe(0.6);
  });
  it('releases capture and listeners when the sheet closes', () => {
    const { tool, fire, display, events } = fixture();
    fire('pointerdown');tool.destroy();
    expect(display.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(events.size).toBe(0);
  });
});


it('shows saved zoom and updates the readout for buttons and reset without rounding artifacts', () => {
  const readout = { textContent: '' };
  const tool = new PortraitTool({ element: makeRoot({ '[data-portrait-zoom]': readout }).root });
  const container = { style: { setProperty: vi.fn() } };
  tool.scale = 5.000000000000002;
  tool.updateZoomReadout();
  expect(readout.textContent).toBe('5×');
  tool.handleButtonAction('zoom-in', {}, {}, container);
  expect(readout.textContent).toBe('5.1×');
  tool.scale = 9.99;
  tool.handleButtonAction('zoom-in', {}, {}, container);
  expect(tool.scale).toBe(10);
  expect(readout.textContent).toBe('10×');
  tool.handleButtonAction('reset', {}, {}, container);
  expect(readout.textContent).toBe('1×');
});
