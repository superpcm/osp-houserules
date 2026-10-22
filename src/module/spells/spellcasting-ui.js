import { spellView, changeSpellState, resolveInterruptedSpell } from './spellcasting.js';
import { spellFormKey, focusKindForItem } from './spell-rules.js';
import { bookPages } from './spell-state.js';
import { filterSpellList, preparationStepCommand } from './spell-list.js';
import { spellbookAssignments, spellbookName } from './spellbook-names.js';
import { recoverProgressionOperation } from '../progression/progression-authority.js';
import { readItemSpell } from './item-spell.js';
import { createSheetDialog } from '../actor/sheets/sheet-dialog.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flights = new Map();
function dialog(actor, title, content, read = () => true, options = {}) {
  return new Promise(resolve => {
    createSheetDialog(actor?.sheet, { title, content, buttons: { ok: { label: 'Confirm', callback: html => resolve(read(html[0] ?? html)) }, cancel: { label: 'Cancel', callback: () => resolve(null) } }, default: 'cancel', close: () => resolve(null) }, options).render(true);
  });
}
function confirm(actor, title, text) { return dialog(actor, title, `<p>${esc(text)}</p>`, () => true, { classes: ['osp', 'osp-choose-spellbook'], width: 360 }); }
function report(result) {
  if (!result.success) ui.notifications.warn(result.reason ?? 'Spell operation failed.');
  else if (result.copied === false) ui.notifications.info('Copying failed. You can try this spell again after gaining a level.');
  return result;
}
export async function chooseBook(actor, action, spell) {
  const { context, state } = await spellView(actor);
  const keys = context.bookIds;
  if (!keys.length) throw new Error('Add a Spellbook to inventory first.');
  const options = keys.map(key => `<option value="${esc(key)}">${esc(spellbookName(context, state, key))} (${bookPages(state.books[key], context)}/100 pages)</option>`).join('');
  const content = `<div class="osp-choose-spellbook-field"><label for="osp-choose-spellbook">Choose Spellbook</label><select id="osp-choose-spellbook" name="book">${options}</select></div>`;
  const bookId = await dialog(actor, 'Add to Spellbook', content, root => root.querySelector('[name="book"]').value, { classes: ['osp', 'osp-choose-spellbook'], width: 320 });
  if (!bookId) return;
  return report(await changeSpellState(actor, { action, spellId: spell.id, bookId, ...(action === 'copy' ? { sourceConfirmed: true } : {}) }));
}
export async function castPreparedSpell(actor, spellId, reverse = false) {
  const key = `${actor.uuid}:${spellId}:${reverse}`;
  if (flights.has(key)) return flights.get(key);
  const run = (async () => {
    const { context, state } = await spellView(actor);
    const spell = context.spells[spellId];
    if (!spell) throw new Error('This spell is not on your class list.');
    if (context.mode === 'divine' && spell.reversed) {
      const choice = await dialog(actor, 'Choose spell form', `<select name="form"><option value="normal">${esc(spell.name)}</option><option value="reverse">${esc(spell.reversed.name)}</option></select>`, root => root.querySelector('[name="form"]').value);
      if (!choice) return;
      reverse = choice === 'reverse';
    }
    const focusKind = context.focusPolicy?.choices ? state.focus?.kind : undefined;
    if (context.focusPolicy?.choices && !context.focusPolicy.choices.includes(focusKind)) throw new Error('Choose Wand or Staff on the Spells page before casting.');
    if (!context.focusPolicy?.exempt && !await confirm(actor, 'Focus', `Confirm that you will hold or display ${focusKind === 'wand' ? 'the designated Wand' : focusKind === 'staff' ? 'the designated Staff' : context.focusPolicy.label} while casting.`)) return;
    if (!await confirm(actor, 'Cast spell', 'Confirm the caster can speak and move their hands, the target can be seen where required, and other casting conditions are satisfied. The GM will make the separate wild-magic check.')) return;
    return report(await changeSpellState(actor, { action: 'cast', spellId, reverse, confirmed: true, ...(focusKind ? { focusKind } : {}), focusHeldOrDisplayed: context.focusPolicy?.exempt ? false : true }));
  })().finally(() => flights.delete(key));
  flights.set(key, run);
  return run;
}
export async function castSpellItem(actor, item) {
  const linkedSpell = readItemSpell(item);
  if (linkedSpell) {
    const key = `${actor.uuid}:item:${item.id}`;
    if (flights.has(key)) return flights.get(key);
    const run = (async () => {
      const { context } = await spellView(actor);
      const baseSpell = context.allLists?.[linkedSpell.listKey]?.find(spell => spell.id === linkedSpell.spellId);
      if (!baseSpell) throw new Error('This item links to an invalid canonical spell.');
      if (linkedSpell.reverse && !baseSpell.reversed) throw new Error('This item requests a reversed form that the canonical spell does not provide.');
      const form = linkedSpell.reverse ? baseSpell.reversed : baseSpell;
      const details = [form.description, form.duration ?? baseSpell.duration].filter(Boolean).join(' ');
      if (!await confirm(actor, `Cast ${form.name}`, `${details} Confirm the item is held or displayed and the casting conditions are satisfied.`)) return;
      return report(await changeSpellState(actor, { action: 'itemCast', sourceId: item.id, confirmed: true, focusHeldOrDisplayed: true }));
    })().finally(() => flights.delete(key));
    flights.set(key, run);
    return run;
  }
  if (item?.type !== 'spell') throw new Error('This item is not configured as a spell source.');
  const { context } = await spellView(actor);
  const matches = Object.values(context.spells).filter(spell => spell.name === item.name);
  if (matches.length === 1) return castPreparedSpell(actor, matches[0].id);
}
export function spellbookFocusMarkup(context, state, canEdit = true, pending = false) {
  if (context.focusPolicy?.exempt) return '<div class="osp-spellbook-focus"><span>No casting focus required.</span></div>';
  const items = (context.focusItems ?? []).filter(item => context.focusIds?.includes(item.id));
  const selected = state.focus?.classKey === context.focusPolicy?.classKey
    ? items.find(item => item.id === state.focus.itemId && (!context.focusPolicy?.choices || focusKindForItem(item) === state.focus.kind)) : null;
  const disabled = !canEdit || pending ? ' disabled' : '';
  const picker = `<div data-book-focus-picker${selected ? ' hidden' : ''}><label for="osp-book-focus">Choose your casting focus</label>${items.length ? `<select id="osp-book-focus" data-book-focus${disabled}><option value="">Choose an inventory item</option>${items.map(item => `<option value="${esc(item.id)}"${selected?.id === item.id ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}</select>` : '<span>No eligible focus items found in inventory.</span>'}</div>`;
  const summary = selected ? `<div data-book-focus-summary><span>Your casting focus</span><img src="${esc(selected.img ?? '')}" alt=""><strong>${esc(selected.name)}</strong><button type="button" data-book-focus-change${disabled}>Change</button></div>` : '';
  return `<section class="osp-spellbook-focus" aria-label="Casting focus">${picker}${summary}</section>`;
}
export function preparedSlotsAtLevel(state, context, level) {
  return Object.entries(state.prepared ?? {}).reduce((total, [key, count]) => {
    const spell = context.spells[key.split('::')[0]];
    return Number(spell?.level) === Number(level) ? total + Math.max(0, Number(count) || 0) : total;
  }, 0);
}
export async function renderSpellcastingTab(sheet, html) {
  const root = html[0] ?? html;
  const slotEl = root.querySelector('.spell-slots-section');
  const listEl = root.querySelector('.spell-list-content');
  if (!slotEl || !listEl) return;
  const { context, state, pending } = await spellView(sheet.actor);
  const uiState = sheet._ospSpellcastingUi ??= { view: context.mode === 'arcane' ? 'book' : 'available', search: '', level: 'all', selectedId: null };
  if (context.mode !== 'arcane') uiState.view = 'available';
  root.querySelector('.spell-subtab-nav')?.replaceChildren();
  root.querySelectorAll('.spell-subtab-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.subtab === 'all'));
  const slots = Object.entries(context.slots).filter(([, n]) => n > 0).map(([level, max]) => {
    const prepared = preparedSlotsAtLevel(state, context, level);
    return `<div class="spell-slot-group" aria-label="Level ${esc(level)}: ${prepared} of ${max} spells prepared"><b>Level ${esc(level)}</b><span class="spell-slot-marks" aria-hidden="true">${Array.from({ length: max }, (_, index) => `<i class="spell-slot-mark${index >= prepared ? ' spent' : ''}"></i>`).join('')}</span><span class="spell-slot-remaining">${prepared}/${max}</span></div>`;
  }).join('');
  const recovery = pending && game.user.isGM ? '<button type="button" data-spell-recover>Recover interrupted spell operation</button>' : '';
  slotEl.innerHTML = `<div class="spell-slot-strip">${slots || '<p class="spell-empty">No daily spell slots at this level.</p>'}</div>${pending ? `<div class="spell-recovery-note">GM recovery is required before another spell operation.${recovery}</div>` : ''}`;
  slotEl.querySelector('[data-spell-recover]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      if (pending.stage === 'rolling') {
        const roll = await dialog(sheet.actor, 'Recover interrupted roll', '<p>Record the actual die result already rolled, or make the required roll now if it never occurred. This is a GM adjudication; do not reroll a known result.</p><input name="roll" type="number" min="1" step="1">', root => Number(root.querySelector('[name="roll"]').value));
        if (roll !== null) report(await resolveInterruptedSpell(sheet.actor, roll));
      } else report(await recoverProgressionOperation(pending.operationId));
      sheet.render(false);
    } catch (error) { ui.notifications.error(error.message); }
    finally { button.disabled = false; }
  });

  const allSpells = Object.values(context.spells).sort((a, b) => Number(a.level) - Number(b.level) || String(a.name).localeCompare(String(b.name)));
  const isArcane = context.mode === 'arcane';
  const library = isArcane && uiState.view === 'library';
  const visibleSpells = filterSpellList(allSpells, { mode: context.mode, view: uiState.view, known: state.known, search: uiState.search, level: uiState.level });
  if (!uiState.selectedId || !visibleSpells.some(spell => spell.id === uiState.selectedId)) uiState.selectedId = visibleSpells[0]?.id ?? null;
  const selected = allSpells.find(spell => spell.id === uiState.selectedId) ?? null;
  const unknown = Object.entries(state.prepared).some(([key, n]) => n > 0 && !context.spells[key.split('::')[0]]) || Object.keys(state.known).some(id => !context.spells[id]);
  const levelOptions = [...new Set(allSpells.map(spell => spell.level))].sort((a, b) => Number(a) - Number(b)).map(level => `<option value="${esc(level)}"${String(uiState.level) === String(level) ? ' selected' : ''}>Level ${esc(level)}</option>`).join('');
  const detailButton = (action, label, reverse = false, attributes = '') => selected ? `<button type="button" data-action="${action}" data-spell="${esc(selected.id)}" data-reverse="${reverse}"${sheet.actor.isOwner ? '' : ' disabled'}${attributes}>${label}</button>` : '';
  const normal = selected ? state.prepared[spellFormKey(selected.id)] ?? 0 : 0;
  const reversed = selected ? state.prepared[spellFormKey(selected.id, true)] ?? 0 : 0;
  const known = selected ? Boolean(state.known[selected.id]) : false;
  const stepper = (reverse = false, spell = selected, compact = false) => {
    if (!spell) return '';
    const count = state.prepared[spellFormKey(spell.id, reverse)] ?? 0;
    const label = reverse ? 'Prepared reversed' : 'Prepared';
    const locked = !sheet.actor.isOwner || Boolean(pending) || (isArcane && !state.known[spell.id]);
    const spellLabel = `${spell.name}${reverse ? ' reversed' : ''}`;
    const control = delta => `<button type="button" data-action="prepare-step" data-delta="${delta}" data-spell="${esc(spell.id)}" data-reverse="${reverse}" aria-label="${delta < 0 ? 'Decrease' : 'Increase'} ${esc(spellLabel)} prepared castings"${locked || (delta < 0 && count === 0) ? ' disabled' : ''}> <span class="spell-stepper-symbol" aria-hidden="true">${delta < 0 ? '−' : '+'}</span></button>`;
    return `<div class="spell-prepare-stepper spell-prepare-stepper--list${compact ? ' compact' : ''}"><span>${label}</span><div>${control(-1)}<output aria-label="${esc(spellLabel)} prepared castings count" aria-live="polite"><span class="spell-stepper-value">${count}</span></output>${control(1)}</div></div>`;
  };
  const assignments = selected && isArcane && known ? spellbookAssignments(context, state, selected.id) : [];
  const assignmentIndicator = assignments.length ? `<span class="spell-assignment" tabindex="0" aria-label="${esc(assignments.map(assignment => `${assignment.name}${assignment.current && assignment.available ? '' : ' (unavailable)'}`).join(', '))}"><img class="spell-book-icon" src="systems/osp-houserules/assets/images/gear/spellbook.webp" alt="" aria-hidden="true"><span class="spell-assignment-names" role="tooltip">${assignments.map(assignment => `${esc(assignment.name)}${assignment.current && assignment.available ? '' : ' <span class="spell-assignment-status">(unavailable)</span>'}`).join(', ')}</span></span>` : '';
  const assignmentAction = isArcane && known && !assignments.length
    ? detailButton('link', '<img class="spell-book-icon" src="systems/osp-houserules/assets/images/gear/spellbook.webp" alt="" aria-hidden="true">', false, ` class="spell-detail-book-action" aria-label="Assign ${esc(selected.name)} to a spellbook" title="Assign ${esc(selected.name)} to a spellbook"${pending ? ' disabled' : ''}`)
    : assignmentIndicator;
  const castIcon = reverse => detailButton('cast', '<img class="spell-cast-icon" src="systems/osp-houserules/assets/images/gear/cast-spell.png" alt="" aria-hidden="true">' + (reverse ? '<i class="fas fa-undo spell-cast-reverse" aria-hidden="true"></i>' : ''), reverse, ` class="spell-detail-cast-action" aria-label="Cast ${esc(selected.name)}${reverse ? ' reversed' : ''}" title="${reverse ? 'Cast reversed spell' : 'Cast spell'}"${pending ? ' disabled' : ''}`);
  const headerActions = `${assignmentAction}${normal ? castIcon(false) : ''}${reversed && isArcane ? castIcon(true) : ''}`;
  const detail = selected ? `<article class="spell-detail-card"><div class="spell-detail-heading"><h3>${esc(selected.name)}</h3>${headerActions}</div>${isArcane && known ? '' : `<div class="spell-detail-kicker">Level ${esc(selected.level)} · ${isArcane ? 'Available to learn' : 'Available to prepare'}</div>`}<dl><div><dt>Range</dt><dd>${esc(selected.range || '—')}</dd></div><div><dt>Duration</dt><dd>${esc(selected.duration || '—')}</dd></div></dl><p class="spell-detail-description">${esc(selected.description || 'No description recorded.')}</p><div class="spell-detail-actions">${isArcane && !known ? detailButton('copy', 'Add to spellbook') : ''}</div></article>` : '<div class="spell-empty-state"><strong>No spell selected</strong><span>Choose a spell from the list to inspect its details.</span></div>';
  const groups = Object.entries(visibleSpells.reduce((map, spell) => ((map[spell.level] ??= []).push(spell), map), {})).map(([level, spells]) => `<section class="spell-level-group"><h4>Level ${esc(level)}</h4>${spells.map(spell => { const knownSpell = Boolean(state.known[spell.id]); const showPreparation = !library && (!isArcane || knownSpell); const preparation = showPreparation ? `<div class="spell-row-preparation">${stepper(false, spell, true)}${isArcane && spell.reversed ? stepper(true, spell, true) : ''}</div>` : ''; return `<div class="spell-list-row${spell.id === uiState.selectedId ? ' selected' : ''}"><button type="button" class="spell-list-select" data-spell-select="${esc(spell.id)}"><span>${esc(spell.name)}</span></button>${preparation}</div>`; }).join('')}</section>`).join('');
  listEl.innerHTML = `<div class="spell-option-b"><div class="spell-option-toolbar"><div class="spell-option-toggle">${isArcane ? `<button type="button" data-spell-view="book" aria-label="Spellbook" title="Spellbook" class="${!library ? 'active' : ''}"><img class="spell-toolbar-book" src="systems/osp-houserules/assets/images/gear/spellbook.webp" alt="" aria-hidden="true"></button><button type="button" data-spell-view="library" aria-label="Add spells / Library" title="Add spells / Library" class="${library ? 'active' : ''}"><img class="spell-toolbar-book" src="systems/osp-houserules/assets/images/gear/spellbook.webp" alt="" aria-hidden="true"><span class="spell-library-plus" aria-hidden="true">+</span></button>` : '<span class="spell-list-label">Available spells</span>'}</div><label class="spell-search"><span class="sr-only">Search spells</span><input type="search" data-spell-search placeholder="Search spells" value="${esc(uiState.search)}"></label><span class="spell-level-filter${uiState.level !== 'all' ? ' is-filtered' : ''}"><i class="fas fa-filter" aria-hidden="true"></i><span class="spell-filter-tooltip" role="tooltip">Filter</span><select data-spell-level aria-label="Filter by spell level"><option value="all"${uiState.level === 'all' ? ' selected' : ''}>All levels</option>${levelOptions}</select></span></div>${!library ? spellbookFocusMarkup(context, state, sheet.actor.isOwner, Boolean(pending)) : ''}${unknown ? '<p class="spell-warning">Some existing prepared spells are outside this class list and have been preserved for GM review.</p>' : ''}<div class="spell-option-body"><div class="spell-list-pane">${groups || `<div class="spell-empty-state"><strong>${isArcane && !library ? 'Your spellbook is empty' : 'No matching spells'}</strong><span>${isArcane && !library ? 'Open the library to add an eligible spell.' : 'Try a different search or level filter.'}</span></div>`}</div><div class="spell-detail-pane">${detail}</div></div></div>`;
  listEl.querySelector('[data-book-focus]')?.addEventListener('change', async event => {
    if (!event.target.value || !sheet.actor.isOwner) return;
    event.target.disabled = true;
    try {
      report(await changeSpellState(sheet.actor, { action: 'focus', itemId: event.target.value, focusClass: context.focusPolicy.classKey }));
      sheet.render(false);
    } catch (error) { ui.notifications.error(error.message); }
    finally { await renderSpellcastingTab(sheet, html); }
  });
  listEl.querySelector('[data-book-focus-change]')?.addEventListener('click', () => {
    listEl.querySelector('[data-book-focus-picker]').hidden = false;
    listEl.querySelector('[data-book-focus-summary]').hidden = true;
  });
  listEl.querySelectorAll('[data-spell-view]').forEach(button => button.addEventListener('click', () => { uiState.view = button.dataset.spellView; renderSpellcastingTab(sheet, html); }));
  listEl.querySelector('[data-spell-search]').addEventListener('input', async event => { uiState.search = event.target.value; await renderSpellcastingTab(sheet, html); listEl.querySelector('[data-spell-search]')?.focus(); });
  listEl.querySelector('[data-spell-level]').addEventListener('change', event => { uiState.level = event.target.value; renderSpellcastingTab(sheet, html); });
  listEl.querySelectorAll('[data-spell-select]').forEach(button => button.addEventListener('click', () => { uiState.selectedId = button.dataset.spellSelect; renderSpellcastingTab(sheet, html); }));
  listEl.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
    if (button.disabled) return;
    if (sheet._ospSpellPreparationBusy) return;
    const preparing = button.dataset.action === 'prepare-step';
    if (preparing) { sheet._ospSpellPreparationBusy = true; listEl.querySelectorAll('[data-action="prepare-step"]').forEach(control => { control.disabled = true; }); }
    button.disabled = true;
    try {
      const spell = context.spells[button.dataset.spell];
      const reverse = button.dataset.reverse === 'true';
      const action = button.dataset.action;
      if (action === 'cast') await castPreparedSpell(sheet.actor, spell.id, reverse);
      else if (['copy','grant','link'].includes(action)) await chooseBook(sheet.actor, action, spell);
      else if (action === 'prepare-step') {
        const fresh = await spellView(sheet.actor);
        const value = fresh.state.prepared[spellFormKey(spell.id, reverse)] ?? 0;
        report(await changeSpellState(sheet.actor, preparationStepCommand({ spellId: spell.id, reverse, currentCount: value, delta: button.dataset.delta })));
      }
      sheet.render(false);
    } catch (error) { ui.notifications.error(error.message); }
    finally { if (preparing) { sheet._ospSpellPreparationBusy = false; await renderSpellcastingTab(sheet, html); } else button.disabled = false; }
  }));
}
