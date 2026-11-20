import gearCatalog from '../../../data/gear.json';
import weaponsCatalog from '../../../data/weapons.json';

const SYSTEM_ID = 'osp-houserules';
const REPAIR_FLAG = 'equipmentCatalogRepairV1';
const REPAIR_FIELDS = ['cost', 'unitWeight', 'storedSize'];
const asArray = collection => collection == null ? [] : Array.isArray(collection) ? collection : collection.contents ? [...collection.contents] : [...collection.values()];
const clone = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const entries = [...gearCatalog.filter(entry => ['Acid', 'Shovel'].includes(entry.name)), ...weaponsCatalog.filter(entry => entry.name === 'Falchion')];
const repairEntries = entries.filter(entry => ['Acid', 'Shovel'].includes(entry.name));
const byKey = new Map(repairEntries.map(entry => [`${entry.name}|${entry.type}`, entry]));
const itemKey = item => `${item?.name}|${item?.type}`;
const customItem = item => item?.flags?.[SYSTEM_ID]?.custom === true;

export async function repairEquipmentCatalog({ gameRef = globalThis.game, itemClass = globalThis.Item, folders = gameRef?.folders } = {}) {
  if (!gameRef?.user?.isGM) return { repaired: [], created: [], skipped: 'not-gm' };
  const repaired = [];
  const actorItems = asArray(gameRef.actors).flatMap(actor => asArray(actor.items));
  for (const item of [...asArray(gameRef.items), ...actorItems]) {
    if (item.type === 'weapon' && item.name?.replace(/\s*[+-]\d+$/, '') === "Butcher's Cleaver"
      && item.system?.lashable !== false) {
      await item.update({ 'system.lashable': false });
      repaired.push(item.name);
    }
    const entry = byKey.get(itemKey(item));
    if (!entry || customItem(item) || item.flags?.[SYSTEM_ID]?.[REPAIR_FLAG]) continue;
    const prior = Object.fromEntries(REPAIR_FIELDS.filter(field => item.system?.[field] !== undefined).map(field => [field, item.system[field]]));
    const receipt = { catalogKey: itemKey(entry), prior, repaired: Object.fromEntries(REPAIR_FIELDS.map(field => [field, entry.system[field]])) };
    const update = { system: {}, [`flags.${SYSTEM_ID}.${REPAIR_FLAG}`]: receipt };
    for (const field of REPAIR_FIELDS) update.system[field] = entry.system[field];
    await item.update(update);
    repaired.push(item.name);
  }
  // Any GM can repair these exact fields; only the elected GM creates missing world items.
  if (gameRef.user.id !== gameRef.users?.activeGM?.id) return { repaired, created: [], skipped: null };
  const worldItems = asArray(gameRef.items);
  const folderId = name => {
    const matches = asArray(folders).filter(folder => folder.type === 'Item' && folder.name === name);
    return matches.length === 1 ? matches[0].id : null;
  };
  const created = [];
  for (const entry of entries) {
    if (worldItems.some(item => itemKey(item) === itemKey(entry)) || typeof itemClass?.create !== 'function') continue;
    const folder = folderId(entry.name === 'Falchion' ? 'Weapons' : 'Adventuring Gear');
    const data = { ...clone(entry), folder };
    if (repairEntries.includes(entry)) {
      data.flags = {
        ...(data.flags ?? {}),
        [SYSTEM_ID]: {
          ...(data.flags?.[SYSTEM_ID] ?? {}),
          [REPAIR_FLAG]: {
            catalogKey: itemKey(entry),
            created: true,
            prior: {},
            repaired: Object.fromEntries(REPAIR_FIELDS.map(field => [field, entry.system[field]])),
          },
        },
      };
    }
    created.push(await itemClass.create(data));
  }
  return { repaired, created, skipped: null };
}

export { REPAIR_FLAG, REPAIR_FIELDS };
