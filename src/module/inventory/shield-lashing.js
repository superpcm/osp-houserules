import { getLashSlotCost } from './lash-slot-cost.js';
const DEFAULT_SHIELD_LASH_HOSTS = new Set(['backpack', 'saddle', 'saddle, pack']);

export const isShieldItem = item => Boolean(item && item.type === 'armor' && (
  item.system?.type === 'shield' || String(item.name || '').toLowerCase().includes('shield')
));

export const isShieldLashingHost = container => {
  if (!container || container.type !== 'container') return false;
  if (container.system?.supportsShieldLashing === false) return false;
  if (container.system?.supportsShieldLashing === true) return true;
  return DEFAULT_SHIELD_LASH_HOSTS.has(String(container.name || '').trim().toLowerCase());
};

export const lashSlotUsage = (items, hostId, excludedId = null, host = null) => items
  .filter(item => item.id !== excludedId && item.system?.containerId === hostId && item.system?.lashed)
  .reduce((sum, item) => sum + getLashSlotCost(item, host), 0);

export const hasFreeLashSlots = (container, items, item, excludedId = null) => {
  const slots = Number(container?.system?.lashSlots) || 0;
  const cost = getLashSlotCost(item, container);
  return slots > 0 && (cost === 0 || lashSlotUsage(items, container.id, excludedId, container) + cost <= slots);
};
