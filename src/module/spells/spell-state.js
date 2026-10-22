import { spellBookPages, spellFormKey, copyingChance, canRetryCopy, focusKindForItem, isEligibleFocusItem } from './spell-rules.js';

const clone = value => structuredClone(value);
const safeId = id => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) && !Object.hasOwn(Object.prototype, id);
const FOCUS_KINDS = new Set(['wand', 'staff']);
function count(value) {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0) throw new Error('Invalid spell count.');
  return n;
}
export function readSpellState(actor) {
  const flags = actor.flags?.['osp-houserules'] ?? {};
  if (flags.spellcastingState?.version === 1) {
    const state = clone(flags.spellcastingState);
    return state;
  }
  const prepared = {};
  for (const [id, n] of Object.entries(flags.memorizedSpells ?? {})) {
    if (!safeId(id)) throw new Error('Legacy spell needs GM review.');
    prepared[spellFormKey(id)] = count(n);
  }
  const used = {};
  for (const [level, slots] of Object.entries(actor.system.spellSlots ?? {})) used[level] = count(slots?.used);
  const focus = { itemId: '', available: false, classKey: '' };
  return { version: 1, known: clone(flags.knownSpells ?? {}), prepared, used, books: {}, focus, copyFailures: {}, restReady: false, operations: {} };
}
function spellFor(context, id) {
  if (!safeId(id) || !Object.hasOwn(context.spells, id)) throw new Error('Spell is not on this class list.');
  return context.spells[id];
}
function formFor(spell, reverse) {
  if (reverse && !spell.reversed) throw new Error('This spell has no reversed form.');
  return spellFormKey(spell.id, Boolean(reverse));
}
function totalPrepared(state, context, level) {
  let total = 0;
  for (const [key, n] of Object.entries(state.prepared)) {
    const id = key.split('::')[0];
    if (!context.spells[id] && count(n)) throw new Error('An existing prepared spell needs GM review.');
    if (Number(context.spells[id]?.level) === Number(level)) total += count(n);
  }
  return total;
}
export function availableBook(state, context, id) {
  return Object.entries(state.books).some(([key, book]) => context.bookIds.includes(key) && book.spellIds.includes(id));
}
export function bookPages(book, context) {
  return (book?.spellIds ?? []).reduce((sum, id) => sum + spellBookPages(spellFor(context, id)), 0);
}
export function transitionSpellState(original, command, context) {
  const state = clone(original);
  const action = command.action;
  state.operations ??= {};
  if (action === 'focus') {
    const classKey = String(command.focusClass ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const choices = context.focusPolicy?.choices;
    if (choices) {
      if (classKey !== String(context.focusPolicy.classKey ?? '').toLowerCase()) throw new Error('Confirm the exact focus requirement for the current class.');
      if (typeof command.itemId !== 'string' || !context.focusIds.includes(command.itemId)) throw new Error('Choose an available owned Wand or Staff as focus.');
      const item = context.items?.find(candidate => candidate.id === command.itemId);
      const kind = focusKindForItem(item);
      if (!FOCUS_KINDS.has(kind) || !choices.includes(kind)) throw new Error('Choose an eligible Wand or Staff item as the focus.');
      state.focus = { kind, itemId: command.itemId, available: true, classKey };
    } else {
      if (typeof command.itemId !== 'string' || !context.itemIds.includes(command.itemId)) throw new Error('Choose an actual inventory item as focus.');
      const item = context.items?.find(candidate => candidate.id === command.itemId);
      if (!isEligibleFocusItem(item, context.focusPolicy)) throw new Error('Choose an eligible inventory item as focus.');
      state.focus = { kind: focusKindForItem(item), itemId: command.itemId, available: true, classKey };
    }
  } else if (action === 'book') {
    if (!context.bookIds.includes(command.bookId)) throw new Error('Choose an actual Spellbook volume.');
    state.books[command.bookId] ??= { spellIds: [], available: true };
    state.books[command.bookId].available = true;
  } else if (action === 'rest') {
    if (command.confirmed !== true) throw new Error('Confirm uninterrupted sleep and one hour of preparation.');
    state.used = Object.fromEntries([...new Set([...Object.keys(state.used), ...Object.keys(context.slots)])].map(level => [level, 0]));
    state.restReady = true;
  } else if (action === 'copy' || action === 'grant' || action === 'link') {
    const spell = spellFor(context, command.spellId);
    if (context.mode !== 'arcane') throw new Error('Only arcane spells use a spellbook.');
    if (!Number(context.slots[spell.level])) throw new Error('That spell level is not unlocked.');
    if (!context.bookIds.includes(command.bookId)) throw new Error('The spellbook is unavailable.');
    const book = state.books[command.bookId] ??= { spellIds: [], available: true };
    if (book.spellIds.includes(spell.id)) throw new Error('This volume already contains the spell.');
    if (bookPages(book, context) + spellBookPages(spell) > 100) throw new Error('The spellbook has insufficient pages.');
    if (action === 'link' && !state.known[spell.id]) throw new Error('Only an already known spell can be linked.');
    if (action === 'copy') {
      if (command.sourceConfirmed !== true) throw new Error('Confirm an available source to copy.');
      if (!canRetryCopy(context.level, state.copyFailures[spell.id])) throw new Error('Retry this spell after gaining a level.');
      const roll = Number(command.percentile);
      if (!Number.isInteger(roll) || roll < 1 || roll > 100) throw new Error('Copying requires an integer d100 roll.');
      if (roll > copyingChance(context.int)) {
        state.copyFailures[spell.id] = context.level;
        return state;
      }
    }
    if (action === 'grant' && !context.gm) throw new Error('Only a GM can grant a starting or researched spell.');
    state.known[spell.id] = true;
    book.spellIds.push(spell.id);
  } else if (action === 'prepare') {
    const spell = spellFor(context, command.spellId);
    if (context.mode === 'divine' && command.reverse) throw new Error('Choose the divine reversed form when casting.');
    const key = formFor(spell, command.reverse);
    if (!state.restReady) throw new Error('Confirm a qualifying rest before preparing spells.');
    if (!['arcane', 'divine'].includes(context.mode)) throw new Error('This class does not prepare spells.');
    if (context.mode === 'arcane' && (!state.known[spell.id] || !availableBook(state, context, spell.id))) throw new Error('An available spellbook containing this spell is required.');
    const n = count(command.count);
    state.prepared[key] = n;
    const limit = count(context.slots[spell.level]);
    if (n && !limit || totalPrepared(state, context, spell.level) + count(state.used[spell.level]) > limit) throw new Error('Daily spell slots are full or unavailable.');
  } else if (action === 'cast') {
    const spell = spellFor(context, command.spellId);
    // Divine casters choose a reversed form at casting; arcane casters prepare that form.
    const key = formFor(spell, context.mode === 'divine' ? false : command.reverse);
    formFor(spell, command.reverse);
    if (!count(state.prepared[key])) throw new Error('No prepared copy remains.');
    if (count(state.used[spell.level]) >= count(context.slots[spell.level])) throw new Error('No daily spell slot remains.');
    state.prepared[key] = count(state.prepared[key]) - 1;
    state.used[spell.level] = count(state.used[spell.level]) + 1;
    state.restReady = false;
  } else if (action === 'external' || action === 'itemCast') {
    state.restReady = false;
  } else throw new Error('Unknown spell operation.');
  return state;
}
export function spellStateUpdate(state) {
  const memorized = {};
  for (const [key, n] of Object.entries(state.prepared)) {
    const id = key.split('::')[0];
    memorized[id] = (memorized[id] ?? 0) + count(n);
  }
  const update = { 'flags.osp-houserules.spellcastingState': state, 'flags.osp-houserules.knownSpells': state.known, 'flags.osp-houserules.memorizedSpells': memorized };
  for (const [level, n] of Object.entries(state.used)) {
    if (!/^[1-9][0-9]*$/.test(level)) throw new Error('Invalid spell level.');
    update[`system.spellSlots.${level}.used`] = count(n);
  }
  return update;
}
