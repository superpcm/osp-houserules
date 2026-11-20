import { describe, it, expect } from 'vitest';
import { vehicleMetadataUpdate } from './vehicle-metadata-editor.js';
describe('vehicle fitting editor', () => {
  it('only returns permitted metadata and leaves item data untouched', () => {
    const item = { type: 'container', system: { cost: 12, quantity: 3, description: 'Keep me' } };
    const before = structuredClone(item);
    expect(vehicleMetadataUpdate(item, { vehicleKind: 'wagon', vehicleAttachmentKind: 'none', cost: 0, quantity: 1 })).toEqual({ 'system.vehicleKind': 'wagon', 'system.vehicleAttachmentKind': 'none' });
    expect(item).toEqual(before);
  });
  it('supports catalog defaults and rejects unsupported classifications', () => {
    expect(vehicleMetadataUpdate({type:'item'}, {vehicleKind:'',vehicleAttachmentKind:'tool'})).toEqual({'system.vehicleKind':null,'system.vehicleAttachmentKind':'tool'});
    expect(() => vehicleMetadataUpdate({type:'container'}, {vehicleKind:'spaceship'})).toThrow();
    expect(() => vehicleMetadataUpdate({type:'item'}, {vehicleKind:'wagon'})).toThrow();
    expect(() => vehicleMetadataUpdate({type:'item'}, {vehicleAttachmentKind:'anything'})).toThrow();
  });
});
