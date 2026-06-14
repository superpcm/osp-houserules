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
  'Human':    {}
};

const CLASSES = [
  'Assassin', 'Barbarian', 'Bard', 'Beast Master', 'Cleric', 'Drow', 'Druid',
  'Dwarf', 'Elf', 'Fighter', 'Gnome', 'Half-Elf', 'Half-Orc', 'Hobbit',
  'Illusionist', 'Knight', 'Magic-User', 'Mage', 'Paladin', 'Ranger',
  'Thief', 'Warden'
];

const RACE_AS_CLASS = ['Dwarf', 'Elf', 'Gnome', 'Hobbit', 'Half-Orc', 'Half-Elf', 'Drow'];

const RACE_CLASS_RESTRICTIONS = {
  'Dwarf':    ['Assassin', 'Cleric', 'Dwarf', 'Fighter', 'Thief'],
  'Elf':      ['Assassin', 'Cleric', 'Druid', 'Drow', 'Elf', 'Fighter', 'Knight', 'Magic-User', 'Ranger', 'Thief'],
  'Gnome':    ['Assassin', 'Cleric', 'Fighter', 'Gnome', 'Illusionist', 'Thief'],
  'Hobbit':   ['Druid', 'Fighter', 'Hobbit', 'Thief'],
  'Half-Orc': ['Assassin', 'Cleric', 'Fighter', 'Half-Orc', 'Thief'],
  'Half-Elf': ['Assassin', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Half-Elf', 'Knight', 'Magic-User', 'Paladin', 'Ranger', 'Thief']
  // Human computed dynamically: CLASSES minus RACE_AS_CLASS
};

// Class → minimum ability score requirements (parsed from data/class_profiles.json `requirements`)
const CLASS_REQS = {
  'Assassin':     {},
  'Barbarian':    { dex: 9 },
  'Bard':         { dex: 9, int: 9 },
  'Beast Master': {},
  'Cleric':       {},
  'Drow':         { int: 9 },
  'Druid':        {},
  'Dwarf':        { con: 9 },
  'Elf':          { int: 9 },
  'Fighter':      {},
  'Gnome':        { con: 9 },
  'Half-Elf':     { cha: 9, con: 9 },
  'Hobbit':       { con: 9, dex: 9 },
  'Half-Orc':     {},
  'Illusionist':  { dex: 9 },
  'Knight':       { con: 9, dex: 9 },
  'Magic-User':   {},
  'Mage':         {},
  'Paladin':      { cha: 9 },
  'Ranger':       { con: 9, wis: 9 },
  'Thief':        {},
  'Warden':       { con: 9, wis: 9 }
};

function classesAllowedForRace(race) {
  if (!race) return [];
  if (race === 'Human') return CLASSES.filter(c => !RACE_AS_CLASS.includes(c));
  return RACE_CLASS_RESTRICTIONS[race] || [];
}

function meetsAbilityReqs(cls, finalScores) {
  const reqs = CLASS_REQS[cls] || {};
  return Object.entries(reqs).every(([attr, min]) => (finalScores[attr] || 0) >= min);
}

const ALIGNMENTS = ['Chaotic', 'Lawful', 'Neutral'];

const BACKGROUNDS = [
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
          ${makeSelect('class',     'Class',      CLASSES)}
          ${makeSelect('alignment', 'Alignment',  ALIGNMENTS)}
          ${makeSelect('background','Background', BACKGROUNDS)}
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      let resolved = false;
      const dialog = new foundry.applications.api.DialogV2({
        window: { title: "Create Character" },
        content,
        buttons: [
          {
            action: "done",
            label: "DONE",
            default: true,
            callback: () => {
              resolved = true;
              const mods = RACE_MODS[el.querySelector('select[data-field="race"]').value] || {};
              const attributes = {};
              for (const k of ABILITIES) {
                const chip = el.querySelector(`.cc-drop-zone[data-attr="${k}"] .cc-chip`);
                const base = chip ? parseInt(chip.dataset.value) : 0;
                attributes[k] = { value: base + (mods[k] || 0) };
              }
              resolve({
                attributes,
                race:       el.querySelector('select[data-field="race"]').value       || '',
                class:      el.querySelector('select[data-field="class"]').value      || '',
                alignment:  el.querySelector('select[data-field="alignment"]').value  || '',
                background: el.querySelector('select[data-field="background"]').value || ''
              });
            }
          },
          {
            action: "cancel",
            label: "Cancel",
            callback: () => { resolved = true; resolve(null); }
          }
        ],
        close: () => { if (!resolved) resolve(null); },
        rejectClose: false
      });

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

          const FACE = ['one', 'two', 'three', 'four', 'five', 'six'];
          const rolls = [];
          for (let i = 0; i < 6; i++) {
            const roll = await (new Roll('4d6kh3')).evaluate();
            rolls.push(roll);
            const chip = document.createElement('span');
            chip.className      = 'cc-chip';
            chip.draggable      = true;
            chip.dataset.chipId = `chip-${i}`;
            chip.dataset.value  = String(roll.total);
            chip.textContent    = String(roll.total);
            chip.title          = `Rolled ${roll.dice[0].results.map(r => r.result).join(', ')} — drag to an ability`;
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
              `<i class="fas fa-dice-${FACE[d.result - 1]}" style="opacity:${d.active ? 1 : 0.3};margin-right:2px"></i>`
            ).join('');
            return `<div style="margin:2px 0">${dice} = <strong>${r.total}</strong></div>`;
          }).join('');
          ChatMessage.create({
            content: `<div><strong>Character creation — ability pool</strong></div>${lines}`,
            flavor: 'Roll: 4d6, drop lowest × 6'
          });
        });

        // === Race change → update displayed finals + class filter ====
        raceSelect.addEventListener('change', () => {
          updateFinals();
          updateClassOptions();
        });

        // === Helpers ==================================================
        const classSelect = el.querySelector('select[data-field="class"]');

        function readFinalScores() {
          const mods = RACE_MODS[raceSelect.value] || {};
          const out = {};
          for (const k of ABILITIES) {
            const chip = el.querySelector(`.cc-drop-zone[data-attr="${k}"] .cc-chip`);
            out[k] = (chip ? parseInt(chip.dataset.value) : 0) + (mods[k] || 0);
          }
          return out;
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
              final.textContent = String(base + mod);
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
            valid = classesAllowedForRace(race).filter(c => meetsAbilityReqs(c, scores));
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
          doneBtn.disabled = !allFilled;
          detailSelects.forEach(s => {
            if (s === classSelect) return; // class is gated by race + reqs (handled below)
            s.disabled = !allFilled;
          });
          updateClassOptions();
        }
      });
    });
  }
}
