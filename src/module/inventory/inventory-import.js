/** Safe, preview-first import of the bundled equipment catalogs into world Items. */
export const INVENTORY_CATEGORIES = Object.freeze([
  'ammunition', 'archive', 'armor', 'clothing', 'gear', 'livestock', 'misc', 'tack', 'treasure', 'vehicles', 'weapons'
]);

export const INVENTORY_FOLDER_NAMES = Object.freeze({
  vehicles: 'Vehicles', tack: 'Tack & Harness', treasure: 'Treasure', weapon: 'Weapons', armor: 'Armor',
  ammunition: 'Ammunition', clothing: 'Clothing', livestock: 'Livestock', container: 'Containers & Storage',
  default: 'Adventuring Gear'
});

const keyPart = value => String(value ?? '').trim().toLocaleLowerCase();
export const inventoryKey = item => `${keyPart(item?.name)}|${keyPart(item?.type)}`;
const documentId = doc => doc?.id || doc?._id || null;
const hasFolder = doc => doc?.folder != null && doc.folder !== '';
const collectionArray = collection => collection == null ? [] : Array.isArray(collection) ? collection : collection.contents ? [...collection.contents] : [...collection.values()];

export function inventoryFolderName(category, item) {
  if (['vehicles', 'tack', 'treasure'].includes(category)) return INVENTORY_FOLDER_NAMES[category];
  return INVENTORY_FOLDER_NAMES[item?.type] ?? INVENTORY_FOLDER_NAMES.default;
}

function resolveFolders(folders, name) {
  const matches = collectionArray(folders).filter(folder => folder?.type === 'Item' && !hasFolder(folder) && keyPart(folder.name) === keyPart(name));
  return { matches, folder: matches.length === 1 ? matches[0] : null };
}

export function cloneItemData(item) {
  const copy = structuredClone(item ?? {});
  delete copy._id;
  delete copy.id;
  delete copy.folder;
  delete copy.sort;
  delete copy.ownership;
  if (copy.img && !copy.img.startsWith('systems/') && !copy.img.startsWith('icons/') && !copy.img.startsWith('http')) {
    copy.img = `systems/osp-houserules/${copy.img.replace(/^\//, '')}`;
  }
  return copy;
}

export function buildInventoryPlan(groups, worldItems = [], validTypes = null, folders = []) {
  const world = collectionArray(worldItems);
  const existing = new Map();
  for (const item of world) { const key = inventoryKey(item); existing.set(key, [...(existing.get(key) ?? []), item]); }
  const seen = new Set();
  const missing = [];
  const existingItems = [];
  const invalid = [];
  const duplicates = [];
  const categories = {};
  const toOrganize = [];
  const folderEntries = new Map();
  const allowed = validTypes ? new Set(validTypes) : null;

  for (const category of INVENTORY_CATEGORIES) {
    const entries = Array.isArray(groups?.[category]) ? groups[category] : [];
    const result = categories[category] = { total: entries.length, missing: 0, existing: 0, invalid: 0 };
    for (const item of entries) {
      const key = inventoryKey(item);
      if (!item?.name || !item?.type || (allowed && !allowed.has(item.type))) {
        invalid.push({ category, item, reason: !item?.name || !item?.type ? 'Missing name or type' : `Unsupported item type: ${item.type}` });
        result.invalid += 1;
      } else if (seen.has(key)) {
        duplicates.push({ category, item, key });
        result.invalid += 1;
      } else {
        seen.add(key);
        const entry = { category, item: structuredClone(item), key, folderName: inventoryFolderName(category, item) };
        if (existing.has(key)) {
          const matches = existing.get(key);
          entry.worldItem = matches[0]; entry.worldItems = matches;
          existingItems.push(entry); result.existing += 1;
          for (const worldItem of matches) if (!hasFolder(worldItem) && documentId(worldItem)) toOrganize.push({ ...entry, worldItemId: documentId(worldItem) });
        }
        else { missing.push(entry); result.missing += 1; }
      }
    }
  }
  for (const entry of [...missing, ...toOrganize]) {
    const target = folderEntries.get(entry.folderName) ?? { name: entry.folderName, count: 0 };
    target.count += 1; folderEntries.set(entry.folderName, target);
  }
  const folderSummary = [...folderEntries.values()].map(target => {
    const resolution = resolveFolders(folders, target.name);
    return { ...target, folderId: documentId(resolution.folder), reused: resolution.matches.length === 1, create: resolution.matches.length === 0, ambiguous: resolution.matches.length > 1 };
  });
  const folderByName = new Map(folderSummary.map(folder => [keyPart(folder.name), folder]));
  for (const entry of [...missing, ...toOrganize]) entry.folder = folderByName.get(keyPart(entry.folderName));
  return { categories, missing, existing: existingItems, existingWorldItemCount: existingItems.reduce((count, entry) => count + entry.worldItems.length, 0), toOrganize, rootMoves: toOrganize, folderSummary, folderAmbiguities: folderSummary.filter(folder => folder.ambiguous), invalid, duplicates, total: missing.length + existingItems.length + invalid.length + duplicates.length };
}

export async function loadBundledInventory({ fetchImpl = globalThis.fetch, systemId = globalThis.game?.system?.id ?? 'osp-houserules' } = {}) {
  const groups = {};
  for (const category of INVENTORY_CATEGORIES) {
    const response = await fetchImpl(`systems/${systemId}/data/${category}.json`);
    if (!response?.ok) throw new Error(`Unable to load ${category} inventory catalog.`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`Invalid ${category} inventory catalog: expected an array.`);
    groups[category] = data;
  }
  return groups;
}

export async function applyInventoryPlan(plan, {
  worldItems = [], getWorldItems = null, folders = [], getFolders = null,
  createFolder = name => Folder.create({ name, type: 'Item' }),
  createItem = data => Item.create(data), updateItem = (item, data) => item.update(data),
  isGM = () => globalThis.game?.user?.isGM === true
} = {}) {
  const requireGM = () => { if (!isGM()) throw new Error('Only the active GM can import inventory.'); };
  requireGM();
  if (plan?.invalid?.length || plan?.duplicates?.length) throw new Error('Resolve invalid or duplicate catalog entries before applying.');
  if (plan?.folderAmbiguities?.length) throw new Error(`Resolve duplicate destination folders before applying (${plan.folderAmbiguities.map(folder => folder.name).join(', ')}).`);
  const created = [], organized = [], skipped = [], errors = [];
  const createdFolders = new Map(), reusedFolders = new Map();
  let currentItems = collectionArray(worldItems), currentFolders = collectionArray(folders);
  const refreshItems = async () => { if (getWorldItems) currentItems = collectionArray(await getWorldItems()); };
  const findExisting = key => currentItems.some(item => inventoryKey(item) === key);
  const findRoot = entry => currentItems.find(item => documentId(item) === entry.worldItemId && inventoryKey(item) === entry.key && !hasFolder(item));
  const ensureFolder = async entry => {
    if (getFolders) currentFolders = collectionArray(await getFolders());
    const { matches, folder } = resolveFolders(currentFolders, entry.folderName);
    if (matches.length > 1) throw new Error(`Multiple top-level Item folders named “${entry.folderName}”. Resolve duplicates and retry.`);
    if (folder) {
      const id = documentId(folder);
      if (!id) throw new Error(`Folder “${entry.folderName}” has no document ID.`);
      if (!createdFolders.has(id)) reusedFolders.set(id, folder);
      return id;
    }
    requireGM();
    const made = await createFolder(entry.folderName);
    const id = documentId(made);
    if (!id) throw new Error(`Folder creation returned no document for “${entry.folderName}”.`);
    createdFolders.set(id, made);
    if (!currentFolders.some(candidate => documentId(candidate) === id)) currentFolders = [...currentFolders, made];
    return id;
  };
  for (const entry of plan?.missing ?? []) {
    requireGM();
    await refreshItems();
    if (findExisting(entry.key)) { skipped.push(entry); continue; }
    try {
      const folderId = await ensureFolder(entry);
      await refreshItems();
      requireGM();
      if (findExisting(entry.key)) { skipped.push(entry); continue; }
      const made = await createItem({ ...cloneItemData(entry.item), folder: folderId });
      if (made == null) throw new Error('Item creation returned no document.');
      created.push(made);
      if (!currentItems.includes(made)) currentItems = [...currentItems, made];
    } catch (error) { errors.push({ entry, error }); }
  }
  for (const entry of plan?.toOrganize ?? []) {
    requireGM();
    await refreshItems();
    if (!findRoot(entry)) { skipped.push(entry); continue; }
    try {
      const folderId = await ensureFolder(entry);
      await refreshItems();
      requireGM();
      const item = findRoot(entry);
      if (!item) { skipped.push(entry); continue; }
      const updated = await updateItem(item, { folder: folderId });
      if (updated == null) throw new Error('Item update returned no document.');
      organized.push(item);
    } catch (error) { errors.push({ entry, error }); }
  }
  const untouchedExisting = (plan?.existingWorldItemCount ?? plan?.existing?.length ?? 0) - (plan?.toOrganize?.length ?? 0);
  return { created, organized, skipped, skippedCount: untouchedExisting + skipped.length, errors, folderCreated: [...createdFolders.values()], folderReused: [...reusedFolders.values()] };
}
