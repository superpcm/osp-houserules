/** Pure BR-13 encumbrance and movement rules. */
export function normalizeQuantity(value, defaultValue = 1) {
  const raw = value && typeof value === 'object' ? value.value : value;
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

/** Return catalog unit weight in pounds; legacy item weight is recorded in coins (10 coins/lb). */
export function unitWeightPounds(item) {
  const system = item?.system ?? item ?? {};
  const hasUnitWeight = system.unitWeight !== undefined && system.unitWeight !== null && system.unitWeight !== '';
  const rawWeight = Number(hasUnitWeight ? system.unitWeight : system.weight);
  if (!Number.isFinite(rawWeight) || rawWeight < 0) return 0;
  return hasUnitWeight ? rawWeight : rawWeight / 10;
}

export function raceMovement(race) {
  return ['dwarf', 'gnome', 'hobbit', 'halfling'].includes(String(race || '').trim().toLowerCase()) ? 30 : 40;
}

export function isMountOrVehicle(item) {
  return item?.type === 'livestock' || (Array.isArray(item?.system?.tags) && item.system.tags.includes('vehicle'));
}

export function isCarriedByMountOrVehicle(item, getParent, visited = new Set()) {
  if (!item || visited.has(item.id)) return false;
  visited.add(item.id);
  if (isMountOrVehicle(item)) return true;
  const parentId = item.system?.containerId;
  if (!parentId) return false;
  const parent = getParent?.(parentId);
  return parent ? isCarriedByMountOrVehicle(parent, getParent, visited) : false;
}

export function calculatePersonalEncumbrance({ items = [], strength = 10, race = '', getParent } = {}) {
  const totalWeight = items.reduce((sum, item) => {
    if (isCarriedByMountOrVehicle(item, getParent)) return sum;
    const quantity = normalizeQuantity(item?.system?.quantity);
    const unitWeight = unitWeightPounds(item);
    return sum + unitWeight * quantity;
  }, 0);
  const rawStrength = Number(strength);
  const effectiveStrength = Number.isFinite(rawStrength) && rawStrength >= 0 ? rawStrength : 10;
  const maxWeight = effectiveStrength * 15;
  const third = maxWeight / 3;
  const twoThirds = maxWeight * 2 / 3;
  const epsilon = Math.max(1e-9, maxWeight * 1e-12);
  const level = totalWeight <= third + epsilon ? 'unencumbered' : totalWeight <= twoThirds + epsilon ? 'light' : totalWeight <= maxWeight + epsilon ? 'heavy' : 'overloaded';
  const base = raceMovement(race);
  const tactical = level === 'overloaded' ? 0 : Math.max(0, base + (level === 'light' ? -10 : level === 'heavy' ? -20 : 0));
  return { totalWeight, maxWeight, third, twoThirds, level, tactical, dash: tactical * 2, explore: tactical * 3, percentage: maxWeight ? Math.min(100, totalWeight / maxWeight * 100) : 100 };
}
