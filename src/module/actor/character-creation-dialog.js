/**
 * @file Character Creation dialog — rolls 4d6 drop lowest for each ability,
 *       and selects Race, Class, Alignment, and Background.
 *
 * Opens before a new character actor is created. The player clicks each set of
 * four dice once to roll that ability; DONE is gated until all six are filled.
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

const CLASSES = [
  'Assassin', 'Barbarian', 'Bard', 'Beast Master', 'Cleric', 'Drow', 'Druid',
  'Dwarf', 'Elf', 'Fighter', 'Gnome', 'Half-Elf', 'Half-Orc', 'Hobbit',
  'Illusionist', 'Knight', 'Magic-User', 'Mage', 'Paladin', 'Ranger',
  'Thief', 'Warden', 'Wood Elf'
];

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
   * Show the dialog and resolve with the rolled scores and selected details, or null on cancel.
   * @returns {Promise<{attributes: object, race: string, class: string, alignment: string, background: string} | null>}
   */
  static async prompt() {
    const scores = { str: null, int: null, wis: null, dex: null, con: null, cha: null };

    const abilityRows = ABILITIES.map(k => `
      <div class="char-create-row">
        <span class="char-create-label">${LABELS[k]}</span>
        <span role="button" tabindex="0" class="char-create-die" data-attr="${k}" title="Roll 4d6, drop the lowest">
          <i class="fas fa-dice-d6"></i><i class="fas fa-dice-d6"></i><i class="fas fa-dice-d6"></i><i class="fas fa-dice-d6"></i>
        </span>
        <span class="char-create-value" data-attr="${k}">--</span>
      </div>
    `).join('');

    const content = `
      <div class="osp-char-create">
        <p class="char-create-instructions">Click the dice next to each ability to roll <strong>4d6, drop lowest</strong>.</p>
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
              const attributes = {};
              for (const k of ABILITIES) attributes[k] = { value: scores[k] };
              const selVal = id => el.querySelector(`select[data-field="${id}"]`)?.value || '';
              resolve({
                attributes,
                race:       selVal('race'),
                class:      selVal('class'),
                alignment:  selVal('alignment'),
                background: selVal('background')
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
        const doneBtn = el.querySelector('button[data-action="done"]');
        if (doneBtn) doneBtn.disabled = true;

        const detailSelects = el.querySelectorAll('.char-create-select');
        detailSelects.forEach(s => { s.disabled = true; });

        const FACE_NAMES = ['one', 'two', 'three', 'four', 'five', 'six'];

        el.querySelectorAll('.char-create-die').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (btn.classList.contains('rolled')) return;
            const attr = btn.dataset.attr;
            const roll = await (new Roll('4d6kh3')).evaluate();
            scores[attr] = roll.total;

            const results = roll.dice[0].results;
            btn.innerHTML = results.map(r =>
              `<i class="fas fa-dice-${FACE_NAMES[r.result - 1]}${r.active ? '' : ' dropped'}"></i>`
            ).join('');

            btn.classList.add('rolled');
            const valEl = el.querySelector(`.char-create-value[data-attr="${attr}"]`);
            if (valEl) valEl.textContent = String(roll.total);
            await roll.toMessage({ flavor: `${LABELS[attr]} — 4d6 drop lowest` });
            if (Object.values(scores).every(v => v !== null)) {
              if (doneBtn) doneBtn.disabled = false;
              detailSelects.forEach(s => { s.disabled = false; });
            }
          });
        });
      });
    });
  }
}
