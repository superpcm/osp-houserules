import { initialLevelUpData } from './level-up-state.js';
/**
 * @file Character Creation dialog — generic 4d6-drop-lowest pool with drag-to-assign,
 *       race ability modifiers applied dynamically, plus Class / Alignment / Background.
 *
 * Flow:
 *   1. User clicks "Roll" → six 4d6kh3 totals appear as draggable chips in the pool
 *   2. Drag each chip onto a Strength/Int/Wis/Dex/Con/Cha slot
 *   3. When all six slots are filled, the detail selects unlock and DONE enables
 *   4. Picking a Race applies racial ability modifiers to the displayed final values
 *      (chips still show the rolled base; saved values = base + race mod)
 */

import { ospRoll } from '../dice.js';
import { LanguageHandler, normalizeLanguageName } from './sheets/handlers/language-handler.js';
import { isClassAvailableForRace } from '../../config/progression.js';
import { ospDialogOptions } from '../dialog/dialog-theme.js';

const ABILITIES = ['str', 'int', 'wis', 'dex', 'con', 'cha'];
const LABELS = {
  str: 'Strength',
  int: 'Intelligence',
  wis: 'Wisdom',
  dex: 'Dexterity',
  con: 'Constitution',
  cha: 'Charisma'
};

const RACES = ['Dwarf', 'Elf', 'Gnome', 'Half-Elf', 'Hobbit', 'Half-Orc', 'Human'];

const RACE_MODS = {
  'Dwarf':    { con: 1, cha: -1 },
  'Elf':      { dex: 1, con: -1 },
  'Gnome':    {},
  'Half-Elf': {},
  'Hobbit':   { dex: 1, str: -1 },
  'Half-Orc': { str: 1, con: 1, cha: -2 },
  'Human':    { con: 1, cha: 1 }
};

const CLASSES = [
  'Assassin', 'Barbarian', 'Bard', 'Beast Master', 'Cleric', 'Druid',
  'Dwarf', 'Elf', 'Fighter', 'Gnome', 'Half-Elf', 'Half-Orc', 'Hobbit',
  'Illusionist', 'Knight', 'Magic-User', 'Mage', 'Paladin', 'Ranger',
  'Thief', 'Warden'
];

const RACE_AS_CLASS = ['Dwarf', 'Elf', 'Gnome', 'Hobbit', 'Half-Orc', 'Half-Elf'];

function meetsProfileRequirements(profile, finalScores) {
  return (profile?.requirements || []).every((requirement) => {
    const parsed = parseProfileRequirement(requirement);
    return !parsed || (finalScores[parsed[0]] || 0) >= parsed[1];
  });
}

export const CREATION_ABILITIES = ABILITIES;
export const CREATION_RACES = RACES;
export const CREATION_RACE_MODS = RACE_MODS;

/** Apply adjustments to the original rolls, with the approved upper cap. */
export function applyRacialModifiers(baseScores, race) {
  const mods = RACE_MODS[race] || {};
  return Object.fromEntries(ABILITIES.map((ability) => [
    ability,
    Math.min(18, Number(baseScores?.[ability] || 0) + Number(mods[ability] || 0))
  ]));
}

export function abilityModifier(score) {
  const value = Number(score) || 0;
  if (value <= 3) return -3;
  if (value <= 5) return -2;
  if (value <= 8) return -1;
  if (value <= 12) return 0;
  if (value <= 15) return 1;
  if (value <= 17) return 2;
  return 3;
}

export function firstLevelHitPointsFromProfile(classProfile, conScore) {
  const die = Number(String(classProfile?.hitDie || '').match(/d(\d+)/)?.[1]);
  if (!die) return null;
  return Math.max(1, die + abilityModifier(conScore));
}

export async function rollAbilityPool() {
  const rolls = [];
  for (let i = 0; i < 6; i += 1) {
    const result = await ospRoll('4d6', { label: LABELS[ABILITIES[i]] });
    if (!result || result.cancelled) return null;
    const dice = result.dice?.[0]?.results || [];
    if (dice.length !== 4 || dice.some(value => !Number.isInteger(value) || value < 1 || value > 6)) {
      throw new Error('Ability rolls require four valid d6 results.');
    }
    const total = dice.reduce((sum, value) => sum + value, 0) - Math.min(...dice);
    rolls.push({ ...result, total, dice: [{ faces: 6, results: dice }] });
  }
  return rolls;
}

export function profileLanguages(raceProfile, classProfile) {
  const languages = [...(raceProfile?.languages || []), ...(classProfile?.languages || [])]
    .map(normalizeLanguageName)
    .filter((language) => language && language !== 'Alignment');
  return [...new Set(languages)];
}

function parseProfileRequirement(requirement) {
  const match = String(requirement || '').match(/(STR|INT|WIS|DEX|CON|CHA)\s*(\d+)/i);
  return match ? [match[1].toLowerCase(), Number(match[2])] : null;
}

function profileNamed(profiles, name) {
  return profiles.find((profile) => String(profile.name).toLowerCase() === String(name).toLowerCase()
    || (name === 'Magic-User' && String(profile.name).toLowerCase() === 'magic-user'));
}

export function profileClassRequirements(profile) {
  return (profile?.requirements || []).map(parseProfileRequirement).filter(Boolean);
}

export function allowedCreationClasses(race, scores, profiles) {
  const raceProfile = profileNamed(profiles.races, race);
  if (!RACES.includes(race) || !raceProfile || !meetsProfileRequirements(raceProfile, scores)) return [];
  return CLASSES.filter(name => {
    const profile = profileNamed(profiles.classes, name);
    if (!profile || !meetsProfileRequirements(profile, scores)) return false;
    if (!isClassAvailableForRace(name, race)) return false;
    if (RACE_AS_CLASS.includes(name)) return name === race;
    if (['Beast Master', 'Mage', 'Warden'].includes(name)) return true;
    return (raceProfile.availableClasses || []).some(entry =>
      !entry.npcOnlyAtRefereeOption &&
      (String(entry.class).toLowerCase().startsWith('all non-') || String(entry.class).toLowerCase() === name.toLowerCase())
    );
  });
}

export function extraLanguageCount(intelligence) {
  if (intelligence >= 18) return 3;
  if (intelligence >= 16) return 2;
  if (intelligence >= 13) return 1;
  return 0;
}

/** Use the sheet's checkbox/custom language menu while preserving free starting languages. */
export async function promptCreationLanguages(baseLanguages, intelligence) {
  const count = extraLanguageCount(intelligence);
  if (!count) return baseLanguages;
  const model = { standardLanguages: ['Dwarvish', 'Elvish', 'Gnomish', 'Hobbiton', 'Orcish'], languages: baseLanguages };
  const content = `<p>Choose ${count} additional language${count === 1 ? '' : 's'} from Intelligence. Starting languages are retained.</p>`
    + LanguageHandler.prototype.buildDialogContent.call(model)
    + '<p class="creation-language-error" role="alert"></p>';
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    const dialog = new Dialog({
      title: 'Starting Languages', content,
      buttons: { submit: { label: 'OK', callback: () => {} }, cancel: { label: 'Cancel', callback: () => finish(null) } },
      default: 'submit', close: () => finish(null),
      render: html => {
        html.find('input[name="lang"]').each((_index, input) => {
          if (baseLanguages.includes(input.value)) input.disabled = true;
        });
        html.find('#customCheck').on('change', function () {
          html.find('#customInput').prop('disabled', !this.checked);
        });
        html.find('[data-button="submit"]').off('click').on('click', event => {
          event.stopImmediatePropagation();
          const selected = [];
          html.find('input[name="lang"]:checked').each((_index, input) => selected.push(input.value));
          if (html.find('#customCheck').is(':checked')) {
            selected.push(...String(html.find('#customInput').val() || '').split(',').map(value => value.trim()).filter(Boolean));
          }
          const additional = [...new Set(selected.map(normalizeLanguageName))].filter(value => !baseLanguages.includes(value));
          if (additional.length !== count || additional.some(value => value === 'Alignment')) {
            html.find('.creation-language-error').text(`Choose exactly ${count} additional language${count === 1 ? '' : 's'}.`);
            return;
          }
          finish([...baseLanguages, ...additional]);
          dialog.close();
        });
      }
    }, ospDialogOptions({ classes: ['osp-language-dialog', 'theme-parchment'] }));
    dialog.render(true);
  });
}

async function loadCreationProfiles() {
  const [races, classes] = await Promise.all([
    fetch('/systems/osp-houserules/data/race_profiles.json').then((r) => r.json()),
    fetch('/systems/osp-houserules/data/class_profiles.json').then((r) => r.json())
  ]);
  return { races: races.raceProfiles || races, classes: classes.classProfiles || classes };
}

async function loadCatalogItem(file, name) {
  const catalog = await fetch(`/systems/osp-houserules/data/${file}`).then((r) => r.json());
  const item = catalog.find((entry) => entry.name === name);
  if (!item) throw new Error(`Creation catalog item not found: ${name}`);
  return foundry.utils.deepClone(item);
}

export async function buildCreationItems(silverQuantity) {
  const [clothes, boots, belt, purse, silver, gold] = await Promise.all([
    loadCatalogItem('clothing.json', "Clothes, Commoner's"),
    loadCatalogItem('clothing.json', 'Boots'),
    loadCatalogItem('clothing.json', 'Belt'),
    loadCatalogItem('gear.json', 'Coin Purse'),
    loadCatalogItem('treasure.json', 'Silver Coins'),
    loadCatalogItem('treasure.json', 'Gold Coins')
  ]);
  const items = [clothes, boots, belt, purse];
  const purseId = foundry.utils.randomID();
  purse._id = purseId;
  const silverValue = Number(silverQuantity);
  const capacity = Number(purse.system.capacity);
  const coinSize = Number(silver.system.storedSize);
  const goldSize = Number(gold.system.storedSize);
  const silverCost = Number(silver.system.cost);
  const exchangeRate = Number(gold.system.cost) / silverCost;
  if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(coinSize) || coinSize <= 0
    || goldSize !== coinSize || silverCost !== 1 || exchangeRate !== 10) {
    throw new Error('Starting currency requires valid purse capacity and the approved 10:1 gold/silver catalog values');
  }
  const maxCoins = Math.floor(capacity / coinSize);
  // Each exchanged gold coin replaces ten silver coins, freeing nine coin spaces.
  const goldQuantity = Math.max(0, Math.ceil((silverValue - maxCoins) / (exchangeRate - 1)));
  const silverRemainder = silverValue - (goldQuantity * exchangeRate);
  if (!Number.isInteger(silverValue) || silverValue < 0 || silverRemainder < 0 || goldQuantity + silverRemainder > maxCoins) {
    throw new Error('Starting currency cannot fit in the catalog coin purse');
  }
  if (silverRemainder > 0) {
    silver.system.quantity = silverRemainder;
    silver.system.containerId = purseId;
    items.push(silver);
  }
  if (goldQuantity > 0) {
    gold.system.quantity = goldQuantity;
    gold.system.containerId = purseId;
    items.push(gold);
  }
  for (const item of items.slice(0, 4)) item.system.equipped = true;
  return items;
}

export function buildCreationActorData(sourceData, result) {
  const portrait = 'systems/osp-houserules/assets/images/icons/generic-portrait.webp';
  const progression = initialLevelUpData(result.class);
  return {
    ...sourceData,
    img: portrait,
    prototypeToken: {
      ...sourceData.prototypeToken,
      texture: { ...sourceData.prototypeToken?.texture, src: portrait },
      sight: { ...sourceData.prototypeToken?.sight, enabled: true, range: 0,
        visionMode: 'basic', brightness: result.vision === 'Dimvision' ? 1 : 0 }
    },
    system: {
      ...sourceData.system,
      attributes: result.attributes,
      race: result.race, class: result.class, alignment: result.alignment, background: result.background,
      languages: [...new Set(result.languages.map(normalizeLanguageName))].join(', '), vision: result.vision,
      hitpoints: result.hitpoints, maxhitpoints: result.maxhitpoints,
      level: 1, xp: 0,
      ...progression.skills
    },
    flags: { ...sourceData.flags,
      'osp-houserules': { ...sourceData.flags?.['osp-houserules'], lastKnownLevel: 1,
        levelUpState: progression.state, pendingSkillPoints: progression.pendingSkillPoints,
        skillPointFraction: progression.skillPointFraction || 0, skillPoolVersion: progression.skillPoolVersion || 0 }
    },
    items: [...(sourceData.items || []), ...result.items]
  };
}

export async function createCharacterFromPrompt(sourceData, {
  prompt = () => CharacterCreationDialog.prompt(),
  create = (data, options) => Actor.create(data, options)
} = {}) {
  const result = await prompt();
  if (!result) return null;
  return create(buildCreationActorData(sourceData, result), {
    osprSkipDialog: true, renderSheet: true, keepEmbeddedIds: true
  });
}

const ALIGNMENTS = ['Chaotic', 'Lawful', 'Neutral'];

export const BACKGROUNDS = [
  'Actor', 'Armorer', 'Artisan', 'Baker', 'Banker', 'Barber', 'Barkeep',
  'Beggar', 'Blacksmith', 'Bookbinder', 'Bouncer', 'Bowyer', 'Brewer',
  'Bricklayer', 'Butcher', 'Caretaker', 'Carpenter', 'Cartographer',
  'Charcoal Maker', 'Clerk', 'Coachman', 'Cobbler', 'Cook', 'Cooper',
  'Courier', 'Crier', 'Dairyboy', 'Distiller', 'Ditch Digger', 'Dyer',
  'Engraver', 'Entertainer', 'Falconer', 'Farmer', 'Ferrier', 'Fishmonger',
  'Fletcher', 'Fuller', 'Furrier', 'Gardener', 'Glassblower', 'Glazier',
  'Glover', 'Gong Farmer', 'Gravedigger', 'Groom', 'Guard', 'Hatmaker',
  'Herdsman', 'Houndsman', 'Innkeeper', 'Jailer', 'Jester', 'Joiner',
  'Juggler', 'Laborer', 'Launderer', 'Lector', 'Librarian', 'Lumberjack',
  'Maid/Butler', 'Mason', 'Merchant', 'Messenger', 'Miller', 'Millwright',
  'Mortician', 'Musician', "Ne'er-do-well", 'Page', 'Painter', 'Philosopher',
  'Porter', 'Potter', 'Printer', 'Prostitute', 'Rag & Bone', 'Ratter',
  'Runaway Slave', 'Scavenger', 'Scholar', 'Serf', 'Server', 'Sexton',
  'Squire', 'Stablehand', 'Stonecutter', 'Street Sweeper', 'Tailor',
  'Tallow Chandler', 'Tanner', 'Thatcher', 'Tobacconist', 'Trapper',
  'Wainwright', 'Washer', 'Weaver', 'Wheelwright', 'Winemaker', 'Woodcutter'
];

function makeSelect(id, label, options) {
  const opts = options.map(v => `<option value="${v}">${v}</option>`).join('');
  return `
    <div class="char-create-detail-row">
      <label class="char-create-detail-label" for="${id}">${label}</label>
      <select class="char-create-select" id="${id}" data-field="${id}">
        <option value="">-- Select --</option>
        ${opts}
      </select>
    </div>
  `;
}

export class CharacterCreationDialog {
  /**
   * Show the dialog and resolve with rolled+assigned scores and selected details, or null on cancel.
   * @returns {Promise<{attributes: object, race: string, class: string, alignment: string, background: string} | null>}
   */
  static async prompt() {
    let profiles;
    try { profiles = await loadCreationProfiles(); }
    catch (error) {
      console.error('OSP | Could not load creation rules', error);
      ui.notifications.error('Character creation rules could not be loaded. Please try again.');
      return null;
    }
    const abilityRows = ABILITIES.map(k => `
      <div class="char-create-row cc-ability-row">
        <span class="char-create-label">${LABELS[k]}</span>
        <span class="cc-drop-zone" data-target="slot" data-attr="${k}"></span>
        <span class="cc-ability-mod" data-attr="${k}"></span>
        <span class="char-create-value cc-ability-final" data-attr="${k}">--</span>
      </div>
    `).join('');

    const content = `
      <div class="osp-char-create">
        <p class="char-create-instructions">Click <strong>Roll</strong> to generate six totals, then drag each onto an ability.</p>
        <div class="cc-pool-section">
          <button type="button" class="cc-roll-btn">Roll</button>
          <div class="cc-pool" data-target="pool"></div>
          <p class="cc-roll-notice" style="display:none;"></p>
        </div>
        ${abilityRows}
        <div class="char-create-divider"></div>
        <div class="char-create-details">
          ${makeSelect('race',      'Race',       RACES)}
          ${makeSelect('class',     'Class',      [])}
          ${makeSelect('alignment', 'Alignment',  ALIGNMENTS)}
          ${makeSelect('background','Background', BACKGROUNDS)}
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      let resolved = false;
      let finalizing = false;
      const finish = value => { if (!resolved) { resolved = true; resolve(value); } };
      const dialog = new foundry.applications.api.DialogV2(ospDialogOptions({
        window: { title: "Create Character" },
        content,
        buttons: [
          {
            action: "done",
            label: "DONE",
            default: true,
            callback: async () => {
              if (resolved || finalizing || !el) return;
              const selectedRace = el.querySelector('select[data-field="race"]').value;
              const selectedClass = el.querySelector('select[data-field="class"]').value;
              const placed = ABILITIES.map((ability) => el.querySelector(`.cc-drop-zone[data-attr="${ability}"] .cc-chip`));
              if (!selectedRace || !selectedClass || placed.some((chip) => !chip)) {
                finish(null); return;
              }
              const bases = Object.fromEntries(ABILITIES.map((ability, index) => [ability, Number(placed[index].dataset.value)]));
              const scores = applyRacialModifiers(bases, selectedRace);
              if (Object.values(bases).some(value => !Number.isInteger(value) || value < 3 || value > 18)
                || Object.values(bases).reduce((sum, value) => sum + value, 0) < 66
                || !allowedCreationClasses(selectedRace, scores, profiles).includes(selectedClass)) {
                ui.notifications.warn('Choose a valid race and class for these ability scores.');
                finish(null); return;
              }
              finalizing = true;
              const attributes = Object.fromEntries(ABILITIES.map(ability => [ability, { value: scores[ability] }]));
              const race = selectedRace;
              const characterClass = selectedClass;
              const raceProfile = profileNamed(profiles.races, race);
              const classProfile = profileNamed(profiles.classes, characterClass);
              try {
                const languages = await promptCreationLanguages(profileLanguages(raceProfile, classProfile), scores.int);
                if (resolved) return;
                if (!languages) { finish(null); return; }
                const silverRoll = await ospRoll('3d6', { label: 'Starting silver (multiply by 10)' });
                if (resolved) return;
                if (!silverRoll || silverRoll.cancelled) { finish(null); return; }
                const items = await buildCreationItems(silverRoll.total * 10);
                if (resolved) return;
                const hitpoints = firstLevelHitPointsFromProfile(classProfile, attributes.con.value);
                if (!hitpoints) throw new Error(`Missing Hit Die for ${characterClass}`);
                finish({
                  attributes, race, class: characterClass,
                  alignment: el.querySelector('select[data-field="alignment"]').value || '',
                  background: el.querySelector('select[data-field="background"]').value || '',
                  languages,
                  vision: ['Dwarf', 'Gnome', 'Half-Orc'].includes(race) ? 'Dimvision' : 'Normal',
                  hitpoints, maxhitpoints: hitpoints, items
                });
              } catch (error) {
                console.error('[OSP] Character creation resources failed:', error);
                ui.notifications.error('Character creation could not finish. No character was created. Please try again.');
                finish(null);
              }
            }
          },
          {
            action: "cancel",
            label: "Cancel",
            callback: () => finish(null)
          }
        ],
        close: () => finish(null),
        rejectClose: false
      }));

      let el;
      dialog.render({ force: true }).then(() => {
        el = dialog.element;
        if (!el) return;

        const doneBtn       = el.querySelector('button[data-action="done"]');
        const detailSelects = el.querySelectorAll('.char-create-select');
        const rollBtn       = el.querySelector('.cc-roll-btn');
        const pool          = el.querySelector('.cc-pool');
        const raceSelect    = el.querySelector('select[data-field="race"]');

        doneBtn.disabled = true;
        detailSelects.forEach(s => { s.disabled = true; });

        // === Drag-and-drop ============================================
        function attachChipDrag(chip) {
          chip.addEventListener('dragstart', e => {
            chip.classList.add('dragging');
            e.dataTransfer.setData('text/plain', chip.dataset.chipId);
            e.dataTransfer.effectAllowed = 'move';
          });
          chip.addEventListener('dragend', () => {
            chip.classList.remove('dragging');
          });
        }

        el.querySelectorAll('[data-target]').forEach(t => {
          t.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            t.classList.add('cc-drag-over');
          });
          t.addEventListener('dragleave', () => {
            t.classList.remove('cc-drag-over');
          });
          t.addEventListener('drop', e => {
            e.preventDefault();
            t.classList.remove('cc-drag-over');
            const chipId = e.dataTransfer.getData('text/plain');
            const chip   = el.querySelector(`.cc-chip[data-chip-id="${chipId}"]`);
            if (!chip) return;
            const source = chip.parentNode;
            if (source === t) return;

            // Slot → swap if already occupied; Pool → just append
            if (t.dataset.target === 'slot' && t.firstChild) {
              const occupant = t.firstChild;
              source.appendChild(occupant);
            }
            t.appendChild(chip);

            updateFinals();
            checkComplete();
          });
        });

        // === Roll button ==============================================
        const rollNotice = el.querySelector('.cc-roll-notice');
        rollBtn.addEventListener('click', async () => {
          if (rollBtn.disabled) return;
          rollBtn.disabled = true;
          rollNotice.style.display = 'none';
          pool.innerHTML = '';
          el.querySelectorAll('.cc-drop-zone').forEach(slot => { slot.innerHTML = ''; });
          checkComplete();
          updateFinals();

          const FACE = ['one', 'two', 'three', 'four', 'five', 'six'];
          let rolls;
          try { rolls = await rollAbilityPool(); }
          catch (error) {
            console.error('OSP | Ability roll failed', error);
            if (!resolved) {
              rollNotice.textContent = 'Ability rolls could not finish. Please try again.';
              rollNotice.style.display = '';
              rollBtn.disabled = false;
            }
            return;
          }
          if (resolved) return;
          if (!rolls) {
            pool.innerHTML = '';
            rollBtn.disabled = false;
            return;
          }
          for (const [i, roll] of rolls.entries()) {
            const chip = document.createElement('span');
            chip.className      = 'cc-chip';
            chip.draggable      = true;
            chip.dataset.chipId = `chip-${i}`;
            chip.dataset.value  = String(roll.total);
            chip.textContent    = String(roll.total);
            chip.title          = `Rolled ${roll.dice[0].results.join(', ')} — drag to an ability`;
            pool.appendChild(chip);
            attachChipDrag(chip);
          }

          const poolTotal = rolls.reduce((sum, r) => sum + r.total, 0);
          if (poolTotal < 66) {
            pool.innerHTML = '';
            rollNotice.textContent = `Total was ${poolTotal} (minimum 66). Roll again.`;
            rollNotice.style.display = '';
            rollBtn.disabled = false;
            return;
          }

          rollNotice.style.display = 'none';

          // Single chat message summarizing all six rolls
          const lines = rolls.map((r, i) => {
            const dice = r.dice[0].results.map(d =>
              `<i class="fas fa-dice-${FACE[d - 1]}" style="margin-right:2px"></i>`
            ).join('');
            return `<div style="margin:2px 0">${LABELS[ABILITIES[i]]}: ${dice} (drop lowest) = <strong>${r.total}</strong></div>`;
          }).join('');
          ChatMessage.create({
            content: `<div><strong>Character creation — ability pool</strong></div>${lines}`,
            flavor: 'Roll: 4d6, drop lowest × 6'
          });
        });

        // === Race change → update displayed finals + class filter ====
        raceSelect.addEventListener('change', () => {
          updateFinals();
          checkComplete();
        });
        el.querySelector('select[data-field="class"]').addEventListener('change', checkComplete);

        // === Helpers ==================================================
        const classSelect = el.querySelector('select[data-field="class"]');

        function readFinalScores() {
          const out = {};
          for (const k of ABILITIES) {
            const chip = el.querySelector(`.cc-drop-zone[data-attr="${k}"] .cc-chip`);
            out[k] = chip ? Number(chip.dataset.value) : 0;
          }
          return applyRacialModifiers(out, raceSelect.value);
        }

        function updateFinals() {
          const mods = RACE_MODS[raceSelect.value] || {};
          for (const k of ABILITIES) {
            const slot  = el.querySelector(`.cc-drop-zone[data-attr="${k}"]`);
            const chip  = slot.querySelector('.cc-chip');
            const final = el.querySelector(`.cc-ability-final[data-attr="${k}"]`);
            const modEl = el.querySelector(`.cc-ability-mod[data-attr="${k}"]`);
            if (chip) {
              const base = parseInt(chip.dataset.value);
              const mod  = mods[k] || 0;
              final.textContent = String(Math.min(18, base + mod));
              modEl.textContent = mod === 0 ? '' : (mod > 0 ? `+${mod}` : String(mod));
              modEl.classList.toggle('positive', mod > 0);
              modEl.classList.toggle('negative', mod < 0);
            } else {
              final.textContent = '--';
              modEl.textContent = '';
              modEl.classList.remove('positive', 'negative');
            }
          }
        }

        function updateClassOptions() {
          const race = raceSelect.value;
          const current = classSelect.value;
          let valid = [];
          if (race) {
            const scores = readFinalScores();
            valid = allowedCreationClasses(race, scores, profiles);
          }
          classSelect.innerHTML = '<option value="">-- Select --</option>' +
            valid.map(c => `<option value="${c}">${c}</option>`).join('');
          classSelect.value = valid.includes(current) ? current : '';
          // Class is only enabled when a race is picked, all chips are placed, and at least one class qualifies
          const allFilled = ABILITIES.every(k =>
            el.querySelector(`.cc-drop-zone[data-attr="${k}"] .cc-chip`)
          );
          classSelect.disabled = !allFilled || !race || valid.length === 0;
        }

        function checkComplete() {
          const allFilled = ABILITIES.every(k =>
            el.querySelector(`.cc-drop-zone[data-attr="${k}"] .cc-chip`)
          );
          detailSelects.forEach(s => {
            if (s === classSelect) return; // class is gated by race + reqs (handled below)
            s.disabled = !allFilled;
          });
          updateClassOptions();
          doneBtn.disabled = !allFilled || !raceSelect.value || !classSelect.value;
        }
      });
    });
  }
}
