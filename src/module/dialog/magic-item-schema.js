/**
 * @file Category/field metadata for the "Add Magic Item" dialog's
 * from-scratch mode (wand, ring, wondrous item, scroll, potion) — the
 * counterpart to magic-item-creator.js's "enchant an existing item" mode,
 * which has no equivalent catalog since these item types have no mundane
 * base to clone from. Mirrors catalog-schema.js's TYPE_FIELDS pattern.
 */

import { fieldsHtml } from "./add-item/catalog-schema.js";

export const MAGIC_CATEGORIES = [
  { key: 'wand',     label: 'Wand / Rod / Staff', folder: 'Wands & Rods',   imageDir: 'magic/wands',     tags: ['magic', 'wand'] },
  { key: 'ring',     label: 'Ring',               folder: 'Rings',          imageDir: 'magic/rings',     tags: ['magic', 'ring'] },
  { key: 'wondrous', label: 'Cloak / Wondrous Item', folder: 'Wondrous Items', imageDir: 'magic/wondrous', tags: ['magic', 'wondrous'] },
  { key: 'scroll',   label: 'Scroll',             folder: 'Scrolls',        imageDir: 'magic/scrolls',   tags: ['magic', 'scroll', 'consumable'] },
  { key: 'potion',   label: 'Potion',             folder: 'Potions',        imageDir: 'magic/potions',   tags: ['magic', 'potion', 'consumable'] },
];

const SPELL_CLASS_LABELS = {
  cleric: 'Cleric',
  druid: 'Druid',
  illusionist: 'Illusionist',
  'magic-user': 'Magic-User',
};

const MAGIC_TYPE_FIELDS = {
  wand: [
    { key: 'charges',      label: 'Charges',      kind: 'number', default: 20 },
    { key: 'rechargeable', label: 'Rechargeable', kind: 'checkbox', default: false },
    { key: 'activation',   label: 'Activation',   kind: 'select', default: '', options: [
      { value: 'command', label: 'Command Word' }, { value: 'action', label: 'Action' }, { value: 'use', label: 'Use-Activated' }
    ] },
    { key: 'effect',        label: 'Effect', kind: 'textarea', default: '', fullWidth: true },
  ],
  ring: [
    { key: 'attunement', label: 'Requires Attunement', kind: 'checkbox', default: false },
    { key: 'property',   label: 'Property', kind: 'textarea', default: '', fullWidth: true },
  ],
  wondrous: [
    { key: 'attunement', label: 'Requires Attunement', kind: 'checkbox', default: false },
    { key: 'property',   label: 'Property', kind: 'textarea', default: '', fullWidth: true },
  ],
  scroll: [
    { key: 'casterLevel', label: 'Caster Level', kind: 'number', default: 1 },
  ],
  potion: [
    { key: 'effect',   label: 'Effect', kind: 'textarea', default: '', fullWidth: true },
    { key: 'duration', label: 'Duration', kind: 'text', default: '' },
  ],
};

let _spellListsCache = null;
async function loadSpellLists() {
  if (!_spellListsCache) {
    try {
      const r = await fetch('/systems/osp-houserules/data/spells.json');
      const d = await r.json();
      _spellListsCache = d.spellLists || {};
    } catch (err) {
      console.warn('[osp-houserules] Failed to load spells.json for magic scroll picker', err);
      _spellListsCache = {};
    }
  }
  return _spellListsCache;
}

function renderScrollSpellPickerHtml() {
  const classOptions = Object.entries(SPELL_CLASS_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  return `
    <div class="add-item-fields-grid">
      <div class="add-item-field">
        <label>Spell Class</label>
        <select id="magic-scroll-class-select">
          <option value="">-- Select --</option>
          ${classOptions}
        </select>
      </div>
      <div class="add-item-field">
        <label>Spell</label>
        <select id="magic-scroll-spell-select" data-sys-field="spellKey" data-sys-kind="text" disabled>
          <option value="">-- Select a class first --</option>
        </select>
      </div>
    </div>
    <input type="hidden" id="magic-scroll-spell-name"  data-sys-field="spellName"  data-sys-kind="text">
    <input type="hidden" id="magic-scroll-spell-level" data-sys-field="spellLevel" data-sys-kind="number">
    <input type="hidden" id="magic-scroll-spell-class" data-sys-field="spellClass" data-sys-kind="text">
  `;
}

/** Renders the field HTML for a magic item category — spell picker + fields for scroll, plain fields for the rest. */
export function renderMagicCategoryFields(key) {
  const defs = MAGIC_TYPE_FIELDS[key] || [];
  const spellPicker = key === 'scroll' ? renderScrollSpellPickerHtml() : '';
  return spellPicker + (defs.length ? fieldsHtml(defs, 'Advanced fields') : '');
}

/**
 * Wires the dynamic behavior a category's fields need after being injected
 * into the DOM — currently only the scroll's class → spell cascading picker.
 * `onSpellChosen(spell|null)` fires whenever the spell selection changes, so
 * the caller can auto-fill the item name/description from spell data.
 */
export async function initMagicCategoryFields(root, key, { onSpellChosen } = {}) {
  if (key !== 'scroll') return;

  const classSelect = root.querySelector('#magic-scroll-class-select');
  const spellSelect = root.querySelector('#magic-scroll-spell-select');
  const nameHidden  = root.querySelector('#magic-scroll-spell-name');
  const levelHidden = root.querySelector('#magic-scroll-spell-level');
  const classHidden = root.querySelector('#magic-scroll-spell-class');
  if (!classSelect || !spellSelect) return;

  const spellLists = await loadSpellLists();

  classSelect.addEventListener('change', () => {
    const spells = (spellLists[classSelect.value] || [])
      .slice()
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    spellSelect.disabled = !spells.length;
    spellSelect.innerHTML = '<option value="">-- Select --</option>' +
      spells.map(s => `<option value="${s.id}">L${s.level} — ${s.name}</option>`).join('');
    nameHidden.value = '';
    levelHidden.value = '';
    classHidden.value = '';
    onSpellChosen?.(null);
  });

  spellSelect.addEventListener('change', () => {
    const spells = spellLists[classSelect.value] || [];
    const spell = spells.find(s => s.id === spellSelect.value) || null;
    nameHidden.value  = spell?.name ?? '';
    levelHidden.value = spell ? String(spell.level) : '';
    classHidden.value = classSelect.value;
    onSpellChosen?.(spell);
  });
}
