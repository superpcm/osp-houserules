/**
 * @file Catalog category/field metadata for the DM Toolkit "Add Item" dialog.
 * Pure data + HTML-string builders — no DOM side effects.
 */

export const CATALOG_CATEGORIES = [
  { key: 'gear',       label: 'Gear',       types: ['item', 'container', 'weapon'], thumbFolder: 'gear' },
  { key: 'weapons',    label: 'Weapons',    types: ['weapon'],     fixedType: 'weapon',     thumbFolder: 'weapons' },
  { key: 'armor',      label: 'Armor',      types: ['armor'],      fixedType: 'armor',      thumbFolder: 'armor' },
  { key: 'ammunition', label: 'Ammunition', types: ['ammunition'], fixedType: 'ammunition', thumbFolder: 'ammunition' },
  { key: 'clothing',   label: 'Clothing',   types: ['clothing'],   fixedType: 'clothing',   thumbFolder: 'clothing' },
  { key: 'tack',       label: 'Tack',       types: ['item', 'container'], thumbFolder: 'tack' },
  { key: 'misc',       label: 'Misc',       types: ['item', 'container'], thumbFolder: 'misc' },
  { key: 'livestock',  label: 'Livestock',  types: ['livestock'],  fixedType: 'livestock',  thumbFolder: 'livestock' },
  // Vehicles have no dedicated thumb/image subfolder on disk — Cart/Wagon art lives under misc/.
  { key: 'vehicles',   label: 'Vehicles',   types: ['container'],  fixedType: 'container',  thumbFolder: 'misc' },
  { key: 'treasure',   label: 'Treasure',   types: ['coin'],       fixedType: 'coin',       thumbFolder: 'treasure' },
];

/**
 * Names of every catalog item of type "container" (across gear/tack/misc/vehicles),
 * used to populate the "Allowed Containers" checkbox list. Keep alphabetized and in
 * sync with the container-type entries in data/*.json.
 */
export const CONTAINER_NAMES = [
  'Axe Sling', 'Backpack', 'Baldric', 'Belt Loop', 'Belt Pouch (L)', 'Belt Pouch (S)',
  'Bolt Case', 'Cart', 'Chest, Large', 'Chest, Small', 'Coin Purse', 'Flask/Potion Holder',
  'Panniers', 'Quiver', 'Quiver, Hip', 'Sack, Large', 'Sack, Small', 'Saddle', 'Saddle, Pack',
  'Saddlebags, Large', 'Saddlebags, Small', 'Scabbard, Dagger', 'Scabbard, Sword', 'Sidesack',
  'Skin Sling', 'Sword Frog', 'Wagon',
];

export const TYPE_LABELS = {
  item: 'Item',
  container: 'Container',
  weapon: 'Weapon',
  armor: 'Armor',
  ammunition: 'Ammunition',
  clothing: 'Clothing',
  livestock: 'Livestock',
  coin: 'Coin',
};

const TYPE_FIELDS = {
  weapon: [
    { key: 'damage',          label: 'Damage',              kind: 'text',   default: '1d6' },
    { key: 'damageL',         label: 'Damage (vs. Large)',  kind: 'text',   default: '' },
    { key: 'damageType',      label: 'Damage Type',         kind: 'select', default: '', options: [
      { value: 'S', label: 'Slashing (S)' }, { value: 'P', label: 'Piercing (P)' }, { value: 'B', label: 'Bludgeoning (B)' }
    ] },
    { key: 'size',            label: 'Size',                kind: 'select', default: '', options: [
      { value: 'S', label: 'Small' }, { value: 'M', label: 'Medium' }, { value: 'L', label: 'Large' }
    ] },
    { key: 'speedFactor',     label: 'Speed Factor',        kind: 'number', default: 0 },
    { key: 'rof',             label: 'Rate of Fire',        kind: 'number', default: 1 },
    { key: 'bonus',           label: 'Bonus',               kind: 'number', default: 0 },
    { key: 'melee',           label: 'Melee',               kind: 'checkbox', default: true },
    { key: 'missile',         label: 'Missile',             kind: 'checkbox', default: false },
    { key: 'range.short',     label: 'Range (Short)',       kind: 'number', default: 0 },
    { key: 'range.medium',    label: 'Range (Medium)',      kind: 'number', default: 0 },
    { key: 'range.long',      label: 'Range (Long)',        kind: 'number', default: 0 },
    { key: 'attacksPerRound', label: 'Attacks / Round',     kind: 'number', default: 1, advanced: true },
    { key: 'slungSlots',      label: 'Slung Slots',         kind: 'number', default: 0, advanced: true },
  ],
  armor: [
    { key: 'aac.value',  label: 'Ascending AC', kind: 'number', default: 10 },
    { key: 'type',       label: 'Armor Type',   kind: 'select', default: '', options: [
      { value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }, { value: 'heavy', label: 'Heavy' }, { value: 'shield', label: 'Shield' }
    ] },
    { key: 'donTime',    label: 'Don Time',     kind: 'text',   default: '' },
    { key: 'doffTime',   label: 'Doff Time',    kind: 'text',   default: '' },
    { key: 'maxDex',     label: 'Max Dex Bonus', kind: 'number', default: 0, advanced: true },
    { key: 'minStr',     label: 'Min Strength', kind: 'number', default: 0, advanced: true },
    { key: 'material',   label: 'Material',     kind: 'text',   default: '', advanced: true },
  ],
  ammunition: [
    { key: 'bonus',      label: 'Bonus', kind: 'number', default: 0 },
    { key: 'slow',       label: 'Slow',  kind: 'checkbox', default: false },
    { key: 'weaponType', label: 'Weapon Type', kind: 'text', default: '', advanced: true },
  ],
  container: [
    { key: 'capacity',      label: 'Capacity',       kind: 'number', default: 16 },
    { key: 'containerSize', label: 'Container Size',  kind: 'select', default: 'medium', options: [
      { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }
    ] },
    { key: 'lashSlots',     label: 'Lash Slots',      kind: 'number', default: 0 },
    { key: 'hideCapacity',  label: 'Hide Capacity',   kind: 'checkbox', default: false },
    { key: 'maxItems',      label: 'Max Items',       kind: 'number', default: 0, advanced: true },
    { key: 'allowedTypes',  label: 'Allowed Types',   kind: 'tags',   default: [], advanced: true },
    { key: 'allowedSizes',  label: 'Allowed Sizes',   kind: 'tags',   default: [], advanced: true },
    { key: 'allowedNames',  label: 'Allowed Names',   kind: 'tags',   default: [], advanced: true },
    { key: 'blockedTypes',  label: 'Blocked Types',   kind: 'tags',   default: [], advanced: true },
  ],
  clothing: [
    { key: 'capacity',         label: 'Capacity',           kind: 'number', default: 0 },
    { key: 'lashSlots',        label: 'Lash Slots',         kind: 'number', default: 0 },
    { key: 'maxItemSize',      label: 'Max Item Size',      kind: 'number', default: 0 },
    { key: 'lashAllowedSizes', label: 'Lash Allowed Sizes', kind: 'tags',   default: [], advanced: true },
  ],
  livestock: [
    { key: 'movement',     label: 'Movement',        kind: 'number', default: 0 },
    { key: 'carrying',     label: 'Carrying Capacity', kind: 'number', default: 0 },
    { key: 'feedCost',     label: 'Feed Cost',        kind: 'number', default: 0 },
    { key: 'hp',           label: 'HP',               kind: 'number', default: 0 },
    { key: 'ac',           label: 'AC',               kind: 'number', default: 9 },
    { key: 'hd',           label: 'Hit Dice',         kind: 'text',   default: '' },
    { key: 'numAttacks',   label: '# Attacks',        kind: 'number', default: 1 },
    { key: 'dmgPerAttack', label: 'Damage / Attack',  kind: 'text',   default: '' },
    { key: 'morale',       label: 'Morale',           kind: 'number', default: 0 },
    { key: 'xpValue',      label: 'XP Value',         kind: 'number', default: 0 },
    { key: 'animalSize',   label: 'Animal Size',      kind: 'text',   default: '', advanced: true },
    { key: 'temperament',  label: 'Temperament',      kind: 'text',   default: '', advanced: true },
    { key: 'attacks',      label: 'Attacks (notes)',  kind: 'textarea', default: '', advanced: true },
    { key: 'special',      label: 'Special',          kind: 'textarea', default: '', advanced: true },
  ],
  item: [],
  coin: [],
};

const CATEGORY_EXTRAS = {
  tack: [
    { key: 'armorBonus',         label: 'Armor Bonus',          kind: 'number', default: 0 },
    { key: 'movementPenalty',    label: 'Movement Penalty',     kind: 'number', default: 0 },
    { key: 'animalType',         label: 'Animal Type',          kind: 'text',   default: '' },
    { key: 'tackSlot',           label: 'Tack Slot',            kind: 'text',   default: '' },
    { key: 'minAnimalSize',      label: 'Min Animal Size',      kind: 'text',   default: '', advanced: true },
    { key: 'requiresMounted',    label: 'Requires Mounted',     kind: 'checkbox', default: false, advanced: true },
    { key: 'requiresSaddleType', label: 'Requires Saddle Type', kind: 'checkbox', default: false, advanced: true },
    { key: 'saddleType',         label: 'Saddle Type',          kind: 'text',   default: '', advanced: true },
  ],
  misc: [
    { key: 'burnTime',    label: 'Burn Time',    kind: 'text',   default: '' },
    { key: 'lightRadius', label: 'Light Radius', kind: 'number', default: 0 },
  ],
  vehicles: [
    { key: 'requiresAnimal', label: 'Requires Animal', kind: 'checkbox', default: false },
  ],
};

function fieldHtml(def) {
  const { key, label, kind, default: def0, options, fullWidth } = def;
  const cls = 'add-item-field' + (fullWidth ? ' add-item-field-full' : '');

  if (kind === 'checkbox') {
    const checked = def0 ? 'checked' : '';
    return `<div class="${cls} add-item-field-checkbox">
      <label><input type="checkbox" data-sys-field="${key}" data-sys-kind="checkbox" ${checked}> ${label}</label>
    </div>`;
  }
  if (kind === 'select') {
    const opts = options.map(o => `<option value="${o.value}"${o.value === def0 ? ' selected' : ''}>${o.label}</option>`).join('');
    return `<div class="${cls}">
      <label>${label}</label>
      <select data-sys-field="${key}" data-sys-kind="select"><option value="">--</option>${opts}</select>
    </div>`;
  }
  if (kind === 'textarea') {
    return `<div class="${cls} add-item-field-full">
      <label>${label}</label>
      <textarea data-sys-field="${key}" data-sys-kind="textarea" rows="2">${def0 ?? ''}</textarea>
    </div>`;
  }
  if (kind === 'tags') {
    const val = Array.isArray(def0) ? def0.join(', ') : (def0 ?? '');
    return `<div class="${cls}">
      <label>${label}</label>
      <input type="text" data-sys-field="${key}" data-sys-kind="tags" value="${val}" placeholder="comma, separated">
    </div>`;
  }
  if (kind === 'checkboxgroup') {
    const selected = Array.isArray(def0) ? def0 : [];
    const boxes = options.map(name => {
      const checked = selected.includes(name) ? 'checked' : '';
      return `<label class="add-item-checkbox-chip"><input type="checkbox" data-sys-field="${key}" data-sys-kind="checkboxgroup" value="${name}" ${checked}> ${name}</label>`;
    }).join('');
    return `<div class="${cls} add-item-field-full">
      <label>${label}</label>
      <div class="add-item-checkbox-group">${boxes}</div>
    </div>`;
  }
  const inputType = kind === 'number' ? 'number' : 'text';
  return `<div class="${cls}">
    <label>${label}</label>
    <input type="${inputType}" data-sys-field="${key}" data-sys-kind="${kind}" value="${def0 ?? ''}">
  </div>`;
}

function fieldsHtml(defs, advancedLabel) {
  const primary  = defs.filter(d => !d.advanced);
  const advanced = defs.filter(d => d.advanced);
  let html = `<div class="add-item-fields-grid">${primary.map(fieldHtml).join('')}</div>`;
  if (advanced.length) {
    html += `<details class="add-item-advanced"><summary>${advancedLabel}</summary>
      <div class="add-item-fields-grid">${advanced.map(fieldHtml).join('')}</div>
    </details>`;
  }
  return html;
}

export function renderTypeFields(type) {
  const defs = TYPE_FIELDS[type] || [];
  if (!defs.length) return '';
  return fieldsHtml(defs, 'Advanced fields');
}

/**
 * Renders the "Allowed Containers" checkbox group — shared across all item
 * types (weapon/item/container), gating which named containers an
 * oversized item may be stored in. See container-allowlist.js.
 */
export function renderAllowedContainersField() {
  return fieldHtml({
    key: 'allowedContainers',
    label: 'Allowed Containers (leave unchecked for no restriction)',
    kind: 'checkboxgroup',
    default: [],
    options: CONTAINER_NAMES,
  });
}

export function renderCategoryExtras(categoryKey) {
  const defs = CATEGORY_EXTRAS[categoryKey] || [];
  if (!defs.length) return '';
  return `<div class="add-item-section-label">House Rule Fields</div>` + fieldsHtml(defs, 'Advanced house rule fields');
}

/**
 * Reads every [data-sys-field] input currently in the DOM under `root` and
 * builds a nested `system` object (dotted keys like "range.short" expand via
 * foundry.utils.expandObject, same helper magic-item-creator.js uses).
 */
export function collectSystemData(root) {
  const flat = {};
  const checkboxGroups = {};
  root.querySelectorAll('[data-sys-field]').forEach((el) => {
    const key  = el.dataset.sysField;
    const kind = el.dataset.sysKind;
    // Multiple checkboxes share the same data-sys-field (e.g. allowedContainers) —
    // accumulate the checked ones into an array instead of overwriting flat[key].
    if (kind === 'checkboxgroup') {
      if (!checkboxGroups[key]) checkboxGroups[key] = [];
      if (el.checked) checkboxGroups[key].push(el.value);
      return;
    }
    let value;
    if (kind === 'checkbox') value = el.checked;
    else if (kind === 'number') value = el.value === '' ? 0 : (parseFloat(el.value) || 0);
    else if (kind === 'tags') value = el.value.split(',').map(s => s.trim()).filter(Boolean);
    else value = el.value;
    flat[key] = value;
  });
  Object.assign(flat, checkboxGroups);
  return foundry.utils.expandObject(flat);
}
