import { VEHICLE_KINDS, VEHICLE_ATTACHMENT_KINDS } from './vehicle-lashing.js';

/** Only these two catalog metadata fields may be changed by the fittings editor. */
export function vehicleMetadataUpdate(item, values) {
  const update = {};
  for (const [field, choices] of [['vehicleKind', VEHICLE_KINDS], ['vehicleAttachmentKind', VEHICLE_ATTACHMENT_KINDS]]) {
    if (!Object.hasOwn(values, field)) continue;
    const value = values[field] === '' || values[field] == null ? null : values[field];
    if (value !== null && !choices.some(choice => choice.id === value)) throw new Error('Choose a supported vehicle or fitting type.');
    if (field === 'vehicleKind' && item?.type !== 'container' && value && value !== 'none') throw new Error('Only containers can be classified as vehicles.');
    update[`system.${field}`] = value;
  }
  return update;
}
