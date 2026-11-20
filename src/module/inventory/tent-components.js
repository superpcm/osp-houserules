const SCOPE = 'osp-houserules';

export const TENT_COMPONENTS = Object.freeze({
  '1-person': Object.freeze({ wholeSize: 10, wholeWeight: 10, wholeCost: 5, fabricSize: 6, fabricWeight: 7, fabricCost: 3.5, polesSize: 4, polesWeight: 3, polesCost: 1.5 }),
  '2-person': Object.freeze({ wholeSize: 20, wholeWeight: 20, wholeCost: 10, fabricSize: 12, fabricWeight: 14, fabricCost: 7, polesSize: 8, polesWeight: 6, polesCost: 3 }),
  '4-person': Object.freeze({ wholeSize: 40, wholeWeight: 40, wholeCost: 20, fabricSize: 24, fabricWeight: 28, fabricCost: 14, polesSize: 16, polesWeight: 12, polesCost: 6 }),
});

const clone = value => structuredClone(value);
const itemData = item => clone(item?.toObject ? item.toObject() : item);
const baseName = name => String(name ?? '').replace(/\s*[+-]\d+\s*$/, '').trim();
const sizeKey = name => {
  const match = baseName(name).match(/^Tent,\s+(1|2|4)-person$/i);
  return match ? `${match[1]}-person` : null;
};
const suffix = name => {
  const match = String(name ?? '').match(/(\s*[+-]\d+\s*)$/);
  return match ? match[1].trim() : '';
};
const componentFlag = (kind, sourceName, size) => ({ kind, sourceName, size });

export function isCompleteTent(item) {
  const size = sizeKey(item?.name);
  if (!size || item?.type !== 'item') return false;
  return !item?.flags?.[SCOPE]?.tentComponent;
}

export function tentSizeKey(item) { return sizeKey(item?.name); }

function componentData(source, size, kind, quantity) {
  const values = TENT_COMPONENTS[size];
  const data = itemData(source);
  delete data._id; delete data.id;
  const extra = suffix(source.name);
  const isFabric = kind === 'fabric';
  const sourceSize = Number(source.system?.storedSize ?? values.wholeSize);
  const sourceWeight = Number(source.system?.unitWeight ?? values.wholeWeight);
  const sourceCost = Number(source.system?.cost ?? values.wholeCost);
  if (![sourceSize, sourceWeight, sourceCost].every(value => Number.isFinite(value) && value >= 0)) throw new Error('The tent has invalid size, weight, or cost.');
  const fabricSize = Number.isFinite(sourceSize) ? sourceSize * 0.6 : values.fabricSize;
  const fabricWeight = Number.isFinite(sourceWeight) ? sourceWeight * 0.7 : values.fabricWeight;
  const fabricCost = Number.isFinite(sourceCost) ? sourceCost * 0.7 : values.fabricCost;
  data.name = `Tent ${isFabric ? 'Fabric' : 'Poles'}, ${size}${extra ? ` ${extra}` : ''}`;
  data.system = {
    ...data.system,
    quantity,
    storedSize: isFabric ? fabricSize : sourceSize - fabricSize,
    unitWeight: isFabric ? fabricWeight : sourceWeight - fabricWeight,
    cost: isFabric ? fabricCost : sourceCost - fabricCost,
    description: isFabric
      ? `Folded canvas tent fabric for a ${size} tent; fabric only, without poles or stakes.`
      : `Bundled poles and stakes for a ${size} tent; the complete support bundle, without fabric.`,
  };
  const flags = { ...(data.flags ?? {}) };
  flags[SCOPE] = { ...(flags[SCOPE] ?? {}), tentComponent: componentFlag(kind, source.name, size) };
  data.flags = flags;
  const tags = new Set(data.system.tags ?? []); tags.add(isFabric ? 'tent-fabric' : 'tent-poles');
  data.system.tags = [...tags];
  return data;
}

export function separateTentData(source, quantity = Number(source?.system?.quantity) || 1) {
  if (!isCompleteTent(source)) throw new Error('Only a complete canonical tent can be separated.');
  const size = sizeKey(source.name);
  const total = Number(source.system?.quantity) || 0;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > total) throw new Error(`Choose 1-${total} tents.`);
  return { size, fabric: componentData(source, size, 'fabric', quantity), poles: componentData(source, size, 'poles', quantity) };
}

export { SCOPE };
