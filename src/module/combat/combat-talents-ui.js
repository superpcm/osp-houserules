import { talentSlots, validateTalentSelections } from './combat-support-ui.js';
import { requestProgressionMutation } from '../progression/progression-authority.js';

const talentEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function combatTalentMarkup(actor, weapons, editable, slots = talentSlots(actor), choiceDescriptions = {}) {
  if (!slots.length) return '';
  const stored = actor.getFlag(game.system.id, 'combatTalents') ?? [];
  const selections = Array.isArray(stored) ? stored : Object.values(stored);
  const disabled = editable ? '' : ' disabled';
  return `<section class="combat-talents-section" aria-label="Combat talent choices">${slots.map(slot => {
    const current = selections.find(t => t.level === slot.level);
    const name = current?.name ?? (slot.mandatory ? 'Weapon Specialization' : '');
    const radioName = `combat-talent-${actor.id}-${slot.level}`;
    const option = (value, description) => `<label class="combat-talent-option"><input type="radio" data-talent-name name="${talentEscape(radioName)}" form="${talentEscape(radioName)}-draft" value="${talentEscape(value)}" aria-label="Level ${slot.level}: ${talentEscape(value || 'Not selected')}"${name === value ? ' checked' : ''}${disabled}><span><strong>${talentEscape(value || 'Not selected')}</strong>${description ? `<span class="combat-talent-description">${talentEscape(description.replace(/^Combat Talent\.\s*/, ''))}</span>` : ''}</span></label>`;
    return `<fieldset class="combat-talent-slot" data-talent-level="${slot.level}">${slots.length > 1 ? `<legend>Level ${slot.level}</legend>` : ''}${slot.choices.map(n => option(n, choiceDescriptions[n] || '')).join('')}<label class="combat-talent-detail" data-talent-weapon-field${name === 'Weapon Specialization' ? '' : ' hidden'}>Specialized weapon<select data-talent-weapon aria-label="Level ${slot.level} specialized weapon"${disabled}><option value="">Choose weapon</option>${weapons.map(w => `<option value="${talentEscape(w.name)}"${current?.weapon === w.name ? ' selected' : ''}>${talentEscape(w.name)}</option>`).join('')}</select></label><label class="combat-talent-detail" data-talent-foe-field${name === 'Slayer' ? '' : ' hidden'}>Slayer foe type<input data-talent-foe aria-label="Level ${slot.level} Slayer foe type" maxlength="100" value="${talentEscape(current?.foeType)}"${disabled}></label></fieldset>`;
  }).join('')}${editable ? '<button type="button" data-save-talents><span class="combat-save-label">Save</span></button>' : ''}<p data-talent-status role="status" aria-live="polite"></p></section>`;
}

export function collectCombatTalents(section) {
  return Array.from(section.querySelectorAll('[data-talent-level]')).map(row => {
    const name = row.querySelector('[data-talent-name]:checked')?.value || '';
    return {level:Number(row.dataset.talentLevel), name, ...(name === 'Weapon Specialization' ? {weapon:row.querySelector('[data-talent-weapon]').value} : {}), ...(name === 'Slayer' ? {foeType:row.querySelector('[data-talent-foe]').value.trim()} : {})};
  }).filter(t => t.name);
}

export async function saveCombatTalents(actor, selections, weapons) {
  validateTalentSelections(actor, selections, weapons);
  const result = await requestProgressionMutation('combat.support', {kind:'talents', actorId:actor.id, actorUuid:actor.uuid, selections});
  if (!result.success) throw new Error(result.reason || 'Unable to save combat talents.');
  return result;
}

export function selectedCombatTalentRecords(actor) {
  const stored = actor.getFlag(game.system.id, 'combatTalents') ?? [];
  const slots = talentSlots(actor);
  return (Array.isArray(stored) ? stored : Object.values(stored)).filter(t => slots.some(slot => slot.level === t.level && slot.choices.includes(t.name)));
}

export async function activateCombatTalents(root, actor, editable, catalogDescriptions = {}) {
  const host = root.querySelector('.tab[data-tab="skills"] .skill-abilities-content');
  const slots = talentSlots(actor);
  if (!host || !slots.length || host.dataset.talentsIntegrated) return;
  const response = await fetch(`systems/${game.system.id}/data/weapons.json`);
  if (!response.ok) throw new Error('Weapon catalog unavailable.');
  const weapons = await response.json();
  if (!host.isConnected || host.dataset.talentsIntegrated) return;
  host.dataset.talentsIntegrated = 'true';
  const canEdit = Boolean(editable && (game.user.isGM || actor.isOwner));
  const entries = Array.from(host.querySelectorAll('.skill-ability-entry'));
  const names = new Set(['Weapon Specialization','Two-Weapon Fighting','Cleave','Defender','Leader','Slayer']);
  const descriptions = new Map();
  const choiceDescriptions = {...catalogDescriptions};
  for (const entry of entries) {
    const name = entry.dataset.abilityName;
    if (names.has(name)) {
      descriptions.set(name, entry.outerHTML);
      choiceDescriptions[name] = entry.querySelector('.skill-ability-effect')?.textContent || choiceDescriptions[name];
      entry.remove();
    }
  }
  const groups = [
    {name:'Combat Talent', slots:slots.filter(slot => slot.level === 1)},
    {name:'Additional Combat Talent', slots:slots.filter(slot => slot.level > 1)}
  ];
  const choiceEntries = [];
  for (const group of groups.filter(g => g.slots.length)) {
    let entry = entries.find(e => e.dataset.abilityName === group.name);
    if (!entry) {
      host.insertAdjacentHTML('afterbegin', `<div class="skill-ability-entry" data-ability-name="${talentEscape(group.name)}"><div class="skill-ability-name skill-ability-toggle"><span class="skill-ability-caret">&#9660;</span>${talentEscape(group.name)} <span class="skill-ability-tag skill-ability-tag--class">Class</span></div><div class="skill-ability-effect">Choose the talent granted by your class.</div></div>`);
      entry = host.firstElementChild;
    }
    choiceEntries.push(entry);
    const effect = entry.querySelector('.skill-ability-effect');
    effect.innerHTML = group.name === 'Combat Talent'
      ? '<div class="combat-talent-intro"><span class="skill-ability-trigger">Level 1.</span><br>Choose one:</div>'
      : '<div class="combat-talent-intro"><span class="skill-ability-trigger">Levels 3 and 7.</span><br>Choose one each time:</div>';
    effect.insertAdjacentHTML('beforeend', combatTalentMarkup(actor, weapons, canEdit, group.slots, choiceDescriptions));
    if (group.slots.some(slot => !selectedCombatTalentRecords(actor).some(t => t.level === slot.level))) {
      entry.classList.remove('skill-ability-collapsed');
      entry.querySelector('.skill-ability-caret').innerHTML = '&#9660;';
    }
  }
  for (const entry of [...choiceEntries].reverse()) host.prepend(entry);
  const selected = selectedCombatTalentRecords(actor);
  if (selected.length) {
    const skills = selected.map(t => {
      const detail = t.weapon || t.foeType;
      const context = detail ? `<p class="combat-skill-choice">${talentEscape(detail)} · Level ${t.level}</p>` : `<p class="combat-skill-choice">Level ${t.level}</p>`;
      const original = descriptions.get(t.name);
      return original ? original.replace('<div class="skill-ability-effect">', `<div class="skill-ability-effect">${context}`) : `<div class="skill-ability-entry"><div class="skill-ability-name">${talentEscape(t.name)}</div>${context}</div>`;
    }).join('');
    choiceEntries.at(-1).insertAdjacentHTML('afterend', `<section class="combat-skills-section" aria-label="Combat Skills"><h3>Combat Skills</h3>${skills}</section>`);
  }
  // Capture draft changes before Foundry's automatic sheet form handlers.
  host.addEventListener('change', event => {
    const section = event.target.closest('.combat-talents-section');
    if (!section) return;
    event.stopPropagation();
    if (event.target.matches('[data-talent-name]')) {
      const row = event.target.closest('[data-talent-level]');
      row.querySelector('[data-talent-weapon-field]').hidden = event.target.value !== 'Weapon Specialization';
      row.querySelector('[data-talent-foe-field]').hidden = event.target.value !== 'Slayer';
    }
    section.querySelector('[data-talent-status]').textContent = 'Unsaved changes';
  }, true);
  host.querySelectorAll('[data-save-talents]').forEach(button => button.addEventListener('click', async () => {
    if (button.disabled) return;
    const buttons = host.querySelectorAll('[data-save-talents]');
    buttons.forEach(b => { b.disabled = true; });
    const status = button.closest('.combat-talents-section').querySelector('[data-talent-status]');
    try {
      await saveCombatTalents(actor, collectCombatTalents(host), weapons);
      status.textContent = 'Choices saved';
      actor.sheet?.render(false);
    } catch (error) { status.textContent = error.message; }
    finally { buttons.forEach(b => { b.disabled = false; }); }
  }));
}
