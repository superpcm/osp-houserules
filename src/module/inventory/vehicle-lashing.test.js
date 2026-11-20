import { describe, expect, it } from 'vitest';
import { checkVehicleAttachment, getVehicleAttachmentOptions, getVehicleKind, parseVehicleDestination, validateVehicleAttachments, vehicleDestination } from './vehicle-lashing.js';

const item = (id, name, type = 'item', system = {}) => ({ id, name, type, system: { quantity: 1, storedSize: 1, unitWeight: 1, containerId: null, ...system } });
const wagon = (id = 'wagon') => item(id, 'Wagon', 'container', { vehicleKind: 'wagon', capacity: 20 });
const attachment = (id, name, kind, system = {}) => item(id, name, 'item', { vehicleAttachmentKind: kind, ...system });

describe('vehicle lashing authority', () => {
  it('uses exact catalog fallback and explicit none opt-out', () => {
    expect(getVehicleKind({ name: 'Wagon', type: 'container', system: {} })).toBe('wagon');
    expect(getVehicleKind({ name: 'Wagon', type: 'container', system: { vehicleKind: 'none' } })).toBe('none');
    expect(getVehicleKind({ name: 'wagon-ish', type: 'container', system: {} })).toBe('none');
  });
  it('enforces wagon wheel sides and quantity one', () => {
    const host = wagon(); const wheel = attachment('wheel', 'Spare Wheel, Wagon', 'wagon-wheel'); const items = [host, wheel];
    expect(checkVehicleAttachment(wheel, host, items, { mode: 'lashed', position: 'left' }).allowed).toBe(true);
    expect(getVehicleAttachmentOptions(wheel, host, items)).toHaveLength(2);
    wheel.system.quantity = 2;
    expect(checkVehicleAttachment(wheel, host, items, { mode: 'lashed', position: 'left' }).allowed).toBe(false);
  });
  it('rejects wrong host, occupied slots, grease, and non-empty buckets', () => {
    const host = wagon(); const other = item('cart', 'Cart', 'container', { vehicleKind: 'cart', capacity: 20 });
    const wheel = attachment('wheel', 'Spare Wheel, Wagon', 'wagon-wheel');
    expect(checkVehicleAttachment(wheel, other, [host, other, wheel], { mode: 'lashed', position: 'rear-rail' }).allowed).toBe(false);
    const existing = attachment('old', 'Spare Wheel, Wagon', 'wagon-wheel', { containerId: host.id, vehicleAttachment: { mode: 'lashed', position: 'left' } });
    expect(checkVehicleAttachment(wheel, host, [host, existing, wheel], { mode: 'lashed', position: 'left' }).allowed).toBe(false);
    const grease = attachment('grease', 'Axle Grease', 'none');
    expect(checkVehicleAttachment(grease, host, [host, grease], { mode: 'lashed', position: 'left' }).allowed).toBe(false);
  });
  it('validates capacity, cycles, and destination round trips', () => {
    const host = wagon(); host.system.capacity = 1; const wheel = attachment('wheel', 'Spare Wheel, Wagon', 'wagon-wheel', { storedSize: 2, containerId: host.id, vehicleAttachment: { mode: 'lashed', position: 'left' } });
    expect(validateVehicleAttachments([host, wheel]).allowed).toBe(false);
    wheel.system.containerId = wheel.id;
    expect(validateVehicleAttachments([host, wheel]).allowed).toBe(false);
    const destination = vehicleDestination('wagon', { mode: 'lashed', position: 'left' });
    expect(parseVehicleDestination(destination)).toEqual({ hostId: 'wagon', mode: 'lashed', position: 'left' });
  });
  it('treats template null as catalog fallback but invalid enums as none', () => {
    expect(getVehicleKind({ name: 'Wagon', type: 'container', system: { vehicleKind: null } })).toBe('wagon');
    expect(getVehicleKind({ name: 'Wagon', type: 'container', system: { vehicleKind: 'bogus' } })).toBe('none');
  });
  it('keeps axles, yokes, tools, and ropes lashed-only', () => {
    const host = wagon();
    for (const [name, kind] of [['Axle, Wagon', 'wagon-axle'], ['Yoke, Ox', 'ox-yoke'], ['Crowbar', 'tool'], ['Rope, Hempen (50\')', 'rope']]) {
      const thing = attachment(name, name, kind);
      expect(getVehicleAttachmentOptions(thing, host, [host, thing]).every(x => x.mode === 'lashed')).toBe(true);
    }
  });
  it('counts all immediate children for capacity and rejects nested vehicle hosts', () => {
    const host = wagon(); host.system.capacity = 1;
    const loose = item('loose', 'Stone', 'item', { containerId: host.id, storedSize: 2 });
    expect(validateVehicleAttachments([host, loose]).allowed).toBe(false);
    const nested = wagon('nested'); nested.system.containerId = host.id;
    const wheel = attachment('wheel', 'Spare Wheel, Wagon', 'wagon-wheel');
    expect(checkVehicleAttachment(wheel, nested, [host, nested, wheel], { mode: 'lashed', position: 'left' }).allowed).toBe(false);
  });
  it('rejects malformed vehicle destinations', () => {
    expect(parseVehicleDestination('__vehicle__:%7B%22hostId%22%3A1%7D')).toBeNull();
    expect(parseVehicleDestination('__vehicle__:%7B%22hostId%22%3A%22x%22,%22mode%22%3A%22bad%22,%22position%22%3A%22left%22%7D')).toBeNull();
  });
});
