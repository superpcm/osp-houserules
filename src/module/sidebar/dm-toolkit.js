/**
 * @file DM's Toolkit — GM-only sidebar tab with party utility actions.
 */

import { AddItemDialog } from "../dialog/add-item/add-item-dialog.js";
import { AddMagicItemDialog } from "../dialog/add-magic-item-dialog.js";
import { getAbilityModifier } from "../../config/classes.js";
import { BankDmLedgersView } from "../apps/bank-dm-ledgers-view.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { AbstractSidebarTab } = foundry.applications.sidebar;

export default class DmToolkitTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  static tabName = "dmtoolkit";

  static DEFAULT_OPTIONS = {
    window: { title: "DM's Toolkit" },
    actions: {
      rest: DmToolkitTab._onRest,
      awardRest: DmToolkitTab._onAwardRest,
      exportCharacters: DmToolkitTab._onExportCharacters,
      giveXP: DmToolkitTab._onGiveXP,
      setXP: DmToolkitTab._onSetXP,
      setMaxHP: DmToolkitTab._onSetMaxHP,
      editAbilityScore: DmToolkitTab._onEditAbilityScore,
      editSkillValue: DmToolkitTab._onEditSkillValue,
      importMonsters:        DmToolkitTab._onImportMonsters,
      updateMonsterAttacks:  DmToolkitTab._onUpdateMonsterAttacks,
      addItem:                DmToolkitTab._onAddItem,
      addMagicItem:           DmToolkitTab._onAddMagicItem,
      togglePlayerLock:      DmToolkitTab._onTogglePlayerLock,
      toggleStoreLock:       DmToolkitTab._onToggleStoreLock,
      openBankLedgers:       DmToolkitTab._onOpenBankLedgers
    }
  };

  static PARTS = {
    app: {
      template: "systems/osp-houserules/templates/sidebar/dm-toolkit.html"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.playerLockActive = game.settings.get("osp-houserules", "playerLock");
    context.storeLockActive  = game.settings.get("osp-houserules", "storeLock");
    return context;
  }

  static async _onAddItem(_event, _target) {
    await AddItemDialog.prompt();
  }

  static async _onAddMagicItem(_event, _target) {
    await AddMagicItemDialog.prompt();
  }

  static async _onOpenBankLedgers(_event, _target) {
    new BankDmLedgersView().render(true);
  }

  static async _onTogglePlayerLock(_event, _target) {
    const current = game.settings.get("osp-houserules", "playerLock");
    await game.settings.set("osp-houserules", "playerLock", !current);
    const msg = current ? "Player Lock OFF — players can roll and move freely." : "Player Lock ON — dice rolling and token movement are blocked.";
    ui.notifications.info(msg);
  }

  static async _onToggleStoreLock(_event, _target) {
    const current = game.settings.get("osp-houserules", "storeLock");
    await game.settings.set("osp-houserules", "storeLock", !current);
    const msg = current ? "Store Lock OFF — players can drag items to their inventory." : "Store Lock ON — players cannot drag items from item lists.";
    ui.notifications.info(msg);
  }

  static async _onRest(_event, _target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Rest the Party" },
      content: "<p>Reset all spell slots for every player character?</p>",
      yes: { label: "Yes" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;

    const pcs = game.actors.filter(a => a.type === "character");
    await DmToolkitTab._resetSpellSlots(pcs);

    ui.notifications.info("Rest complete — all spell slots and memorized spells cleared.");
  }

  static async _resetSpellSlots(pcs) {
    const slotUpdates = {};
    for (let i = 1; i <= 6; i++) {
      slotUpdates[`system.spellSlots.${i}.used`] = 0;
    }

    for (const actor of pcs) {
      await actor.update(slotUpdates);
      await actor.unsetFlag("osp-houserules", "memorizedSpells");
    }
  }

  static async _onAwardRest(_event, _target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Award Rest" },
      content: "<p>Heal every player character (1d4 + CON modifier, minimum 1 HP, up to max HP) and reset all spell slots?</p>",
      yes: { label: "Yes" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;

    const pcs = game.actors.filter(a => a.type === "character");

    let totalHealed = 0;
    for (const actor of pcs) {
      const current = actor.system.hitpoints ?? 0;
      const max = actor.system.maxhitpoints ?? current;
      if (current >= max) continue;

      const conMod = getAbilityModifier(actor.system.attributes?.con?.value);
      const roll = await new Roll("1d4").evaluate();
      const healed = Math.max(1, roll.total + conMod);
      const newHP = Math.min(current + healed, max);
      totalHealed += newHP - current;

      await actor.update({ "system.hitpoints": newHP });

      const speaker = ChatMessage.getSpeaker({ actor });
      const flavor = `${actor.name} — Award Rest: <strong>+${newHP - current} HP</strong> (now ${newHP}/${max})`;
      await roll.toMessage({ speaker, flavor: DOMPurify.sanitize(flavor) });
    }

    await DmToolkitTab._resetSpellSlots(pcs);

    ui.notifications.info(`Award Rest complete — healed ${totalHealed} HP across ${pcs.length} character${pcs.length === 1 ? "" : "s"}; all spell slots restored.`);
  }

  static async _onExportCharacters(_event, _target) {
    const pcs = game.actors.filter(a => a.type === "character");
    if (pcs.length === 0) {
      ui.notifications.warn("No player characters found to export.");
      return;
    }

    const SKILL_KEYS = [
      'assassination', 'climbSheer', 'detectConstruction', 'detectRoomTraps',
      'findSecretDoor', 'findTraps', 'foragingHunting', 'hideDungeons',
      'hideShadows', 'hideUndergrowth', 'hiding', 'listeningAtDoors',
      'moveSilently', 'openLocks', 'openStuckDoors', 'pickPockets',
      'stealth', 'wildernessSurpriseAttack'
    ];

    const STORY_GEAR_TYPES = new Set(['weapon', 'armor', 'item', 'container', 'clothing', 'ammunition', 'coin']);

    const toInt = v => (v !== undefined && v !== null && v !== '') ? (parseInt(v) || null) : null;
    const toNum = v => (v !== undefined && v !== null && v !== '') ? (parseFloat(v) || null) : null;

    const data = pcs.map(a => {
      const s = a.system;
      const attrs = s.attributes || {};

      // Skills — only non-empty values, parsed to int
      const skills = {};
      for (const key of SKILL_KEYS) {
        const val = s[key];
        if (val !== undefined && val !== null && val !== '') skills[key] = parseInt(val) || null;
      }

      // Languages — stored as comma-separated string
      const languages = (s.languages || '').split(',').map(l => l.trim()).filter(Boolean);

      // Spells — known spell IDs and memorized counts are stored as actor flags
      const knownSpells = a.getFlag('osp-houserules', 'knownSpells') || {};
      const memorizedSpells = a.getFlag('osp-houserules', 'memorizedSpells') || {};
      const spellsKnown = Object.entries(knownSpells).filter(([, v]) => v === true).map(([id]) => id);

      // Gear items
      const storyGear = a.items
        .filter(i => STORY_GEAR_TYPES.has(i.type))
        .map(i => ({
          name: i.name,
          type: i.type,
          equipped: i.system.equipped ?? null,
          quantity: i.system.quantity ?? null,
          tags: i.system.tags || []
        }));

      // Livestock (companions and mounts share the same item type; split by animalType if needed)
      const companions = a.items
        .filter(i => i.type === 'livestock')
        .map(i => ({
          name: i.name,
          type: i.system.animalType || '',
          quantity: i.system.quantity ?? null,
          temperament: i.system.temperament || '',
          special: i.system.special || ''
        }));

      return {
        id: a.id,
        name: a.name,
        type: a.type,
        portrait: s.portrait || '',
        race: s.race || '',
        class: s.class || '',
        level: toInt(s.level),
        alignment: s.alignment || '',
        background: s.background || '',
        sex: s.sex || '',
        age: toInt(s.age),
        height: s.height || '',
        weight: toNum(s.weight),
        languages,
        attributes: {
          str: toInt(attrs.str?.value),
          dex: toInt(attrs.dex?.value),
          con: toInt(attrs.con?.value),
          int: toInt(attrs.int?.value),
          wis: toInt(attrs.wis?.value),
          cha: toInt(attrs.cha?.value),
        },
        hp: {
          current: s.hitpoints ?? null,
          max: s.maxhitpoints ?? null,
        },
        ac: s.ac ?? null,
        bio: {
          appearance: s.details?.appearance || '',
          personality: '',
          history: s.details?.background || '',
          goals: s.details?.goals || '',
          notes: s.tabNotes || '',
        },
        skills,
        spells: {
          known: spellsKnown,
          memorized: memorizedSpells,
        },
        storyGear,
        companions,
        mountsVehicles: [],
      };
    });

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().slice(0, 10);
    const el = document.createElement("a");
    el.href = url;
    el.download = `osp-characters-${timestamp}.json`;
    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
    URL.revokeObjectURL(url);

    ui.notifications.info(`Exported ${pcs.length} character${pcs.length === 1 ? "" : "s"}.`);
  }

  static async _onGiveXP(_event, _target) {
    const pcs = game.actors.filter(a => a.type === "character").sort((a, b) => a.name.localeCompare(b.name));
    if (pcs.length === 0) {
      ui.notifications.warn("No player characters found.");
      return;
    }

    const rows = pcs.map(a => `
      <label class="osp-xp-row">
        <input type="checkbox" class="osp-xp-pc" value="${a.id}" checked>
        <span>${a.name}</span>
      </label>`).join('');

    const content = `
      <div class="osp-give-xp-dialog">
        <div class="osp-xp-select-all-row">
          <label><input type="checkbox" id="osp-xp-select-all" checked> <em>Select all</em></label>
        </div>
        <div class="osp-xp-pc-list">${rows}</div>
        <div class="osp-xp-amount-row">
          <label for="osp-xp-amount">XP to Award</label>
          <input type="number" id="osp-xp-amount" value="0" min="0" style="width:100%;margin-top:4px;">
        </div>
      </div>`;

    new Dialog({
      title: "Give XP",
      content,
      buttons: {
        give: {
          icon: '<i class="fas fa-star"></i>',
          label: "Give",
          callback: async (html) => {
            const amount = parseInt(html.find('#osp-xp-amount').val()) || 0;
            if (amount <= 0) {
              ui.notifications.warn("XP amount must be greater than 0.");
              return;
            }

            const selectedIds = html.find('.osp-xp-pc:checked').map((_, el) => el.value).get();
            if (selectedIds.length === 0) {
              ui.notifications.warn("No characters selected.");
              return;
            }

            for (const id of selectedIds) {
              const actor = game.actors.get(id);
              if (!actor) continue;
              const current = parseInt(String(actor.system.xp ?? 0).replace(/,/g, '')) || 0;
              const modifier = actor.system.xpModifier || 0;
              const adjusted = Math.round(amount * (1 + modifier / 100));
              await actor.update({ 'system.xp': current + adjusted }, { ospXPAward: true, ospXPAmount: adjusted });
            }

            ui.notifications.info(`Awarded ${amount} XP (with individual modifiers) to ${selectedIds.length} character${selectedIds.length === 1 ? "" : "s"}.`);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "give",
      render: (html) => {
        html.find('#osp-xp-select-all').on('change', function () {
          html.find('.osp-xp-pc').prop('checked', this.checked);
        });
        html.find('.osp-xp-pc').on('change', function () {
          const all = html.find('.osp-xp-pc').length;
          const checked = html.find('.osp-xp-pc:checked').length;
          html.find('#osp-xp-select-all').prop('checked', all === checked);
        });
        html.find('#osp-xp-amount').focus();
      }
    }).render(true);
  }

  static async _onSetXP(_event, _target) {
    const pcs = game.actors.filter(a => a.type === "character").sort((a, b) => a.name.localeCompare(b.name));
    if (pcs.length === 0) {
      ui.notifications.warn("No player characters found.");
      return;
    }

    const options = pcs.map(a => {
      const current = parseInt(String(a.system.xp ?? 0).replace(/,/g, '')) || 0;
      return `<option value="${a.id}">${a.name} (${current.toLocaleString()} XP)</option>`;
    }).join('');

    const content = `
      <div class="osp-give-xp-dialog">
        <div class="osp-xp-amount-row" style="border-top:none;padding-top:0;">
          <label for="osp-set-xp-character">Character</label>
          <select id="osp-set-xp-character" style="width:100%;margin-top:4px;">${options}</select>
        </div>
        <div class="osp-xp-amount-row">
          <label for="osp-set-xp-value">New XP Value</label>
          <input type="number" id="osp-set-xp-value" value="0" min="0" style="width:100%;margin-top:4px;">
        </div>
      </div>`;

    new Dialog({
      title: "Set XP",
      content,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "OK",
          callback: async (html) => {
            const actorId = html.find('#osp-set-xp-character').val();
            const newXP   = parseInt(html.find('#osp-set-xp-value').val()) || 0;
            const actor   = game.actors.get(actorId);
            if (!actor) return;
            await actor.update({ 'system.xp': newXP });
            ui.notifications.info(`Set ${actor.name}'s XP to ${newXP.toLocaleString()}.`);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "ok",
      render: (html) => {
        const select = html.find('#osp-set-xp-character');
        const input  = html.find('#osp-set-xp-value');

        const prefill = () => {
          const actor = game.actors.get(select.val());
          if (actor) {
            const current = parseInt(String(actor.system.xp ?? 0).replace(/,/g, '')) || 0;
            input.val(current);
          }
        };

        select.on('change', prefill);
        prefill();
        input.focus().select();
      }
    }).render(true);
  }

  static async _onSetMaxHP(_event, _target) {
    const pcs = game.actors.filter(a => a.type === "character").sort((a, b) => a.name.localeCompare(b.name));
    if (pcs.length === 0) {
      ui.notifications.warn("No player characters found.");
      return;
    }

    const options = pcs.map(a => {
      const current = parseInt(a.system.maxhitpoints ?? 0) || 0;
      return `<option value="${a.id}">${a.name} (${current} maxHP)</option>`;
    }).join('');

    const content = `
      <div class="osp-give-xp-dialog">
        <div class="osp-xp-amount-row" style="border-top:none;padding-top:0;">
          <label for="osp-set-maxhp-character">Character</label>
          <select id="osp-set-maxhp-character" style="width:100%;margin-top:4px;">${options}</select>
        </div>
        <div class="osp-xp-amount-row">
          <label for="osp-set-maxhp-value">New Max HP Value</label>
          <input type="number" id="osp-set-maxhp-value" value="0" min="1" style="width:100%;margin-top:4px;">
        </div>
      </div>`;

    new Dialog({
      title: "Set Max HP",
      content,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "OK",
          callback: async (html) => {
            const actorId = html.find('#osp-set-maxhp-character').val();
            const newMaxHP = parseInt(html.find('#osp-set-maxhp-value').val()) || 0;
            const actor    = game.actors.get(actorId);
            if (!actor) return;
            await actor.update({ 'system.maxhitpoints': newMaxHP });
            ui.notifications.info(`Set ${actor.name}'s max HP to ${newMaxHP}.`);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "ok",
      render: (html) => {
        const select = html.find('#osp-set-maxhp-character');
        const input  = html.find('#osp-set-maxhp-value');

        const prefill = () => {
          const actor = game.actors.get(select.val());
          if (actor) {
            const current = parseInt(actor.system.maxhitpoints ?? 0) || 0;
            input.val(current);
          }
        };

        select.on('change', prefill);
        prefill();
        input.focus().select();
      }
    }).render(true);
  }

  static async _onEditSkillValue(_event, _target) {
    const pcs = game.actors.filter(a => a.type === "character").sort((a, b) => a.name.localeCompare(b.name));
    if (pcs.length === 0) {
      ui.notifications.warn("No player characters found.");
      return;
    }

    const SKILLS = [
      { key: 'assassination',          label: 'Assassination' },
      { key: 'climbSheer',             label: 'Climb Sheer Surfaces' },
      { key: 'detectConstruction',     label: 'Detect Construction' },
      { key: 'detectRoomTraps',        label: 'Detect Room Traps' },
      { key: 'findSecretDoor',         label: 'Find Secret Doors' },
      { key: 'findTraps',              label: 'Find Traps' },
      { key: 'foragingHunting',        label: 'Foraging / Hunting' },
      { key: 'hideDungeons',           label: 'Hide in Dungeons' },
      { key: 'hideShadows',            label: 'Hide in Shadows' },
      { key: 'hideUndergrowth',        label: 'Hide in Undergrowth' },
      { key: 'hiding',                 label: 'Hiding' },
      { key: 'listeningAtDoors',       label: 'Listening at Doors' },
      { key: 'moveSilently',           label: 'Move Silently' },
      { key: 'openLocks',              label: 'Open Locks' },
      { key: 'openStuckDoors',         label: 'Open Stuck Doors' },
      { key: 'pickPockets',            label: 'Pick Pockets' },
      { key: 'stealth',                label: 'Stealth' },
      { key: 'wildernessSurpriseAttack', label: 'Wilderness Surprise Attack' },
    ];

    const charOptions  = pcs.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    const skillOptions = SKILLS.map(sk => `<option value="${sk.key}">${sk.label}</option>`).join('');
    const valueOptions = ['', '1', '2', '3', '4', '5']
      .map(v => `<option value="${v}">${v === '' ? '— none —' : v + '-in-6'}</option>`).join('');

    const content = `
      <div class="osp-give-xp-dialog">
        <div class="osp-xp-amount-row" style="border-top:none;padding-top:0;">
          <label for="osp-skill-character">Character</label>
          <select id="osp-skill-character" style="width:100%;margin-top:4px;">${charOptions}</select>
        </div>
        <div class="osp-xp-amount-row">
          <label for="osp-skill-key">Skill</label>
          <select id="osp-skill-key" style="width:100%;margin-top:4px;">${skillOptions}</select>
        </div>
        <div class="osp-xp-amount-row">
          <label for="osp-skill-value">New Value</label>
          <select id="osp-skill-value" style="width:100%;margin-top:4px;">${valueOptions}</select>
        </div>
      </div>`;

    new Dialog({
      title: "Edit Skill Value",
      content,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "OK",
          callback: async (html) => {
            const actorId  = html.find('#osp-skill-character').val();
            const skillKey = html.find('#osp-skill-key').val();
            const value    = html.find('#osp-skill-value').val();
            const actor    = game.actors.get(actorId);
            if (!actor) return;
            await actor.update({ [`system.${skillKey}`]: value });
            const label = SKILLS.find(sk => sk.key === skillKey)?.label ?? skillKey;
            const display = value ? `${value}-in-6` : 'none';
            ui.notifications.info(`Set ${actor.name}'s ${label} to ${display}.`);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "ok",
      render: (html) => {
        const charSelect  = html.find('#osp-skill-character');
        const skillSelect = html.find('#osp-skill-key');
        const valueSelect = html.find('#osp-skill-value');

        const prefill = () => {
          const actor    = game.actors.get(charSelect.val());
          const skillKey = skillSelect.val();
          if (actor) {
            const current = actor.system[skillKey] ?? '';
            valueSelect.val(String(current));
          }
        };

        charSelect.on('change', prefill);
        skillSelect.on('change', prefill);
        prefill();
      }
    }).render(true);
  }

  static async _onEditAbilityScore(_event, _target) {
    const pcs = game.actors.filter(a => a.type === "character").sort((a, b) => a.name.localeCompare(b.name));
    if (pcs.length === 0) {
      ui.notifications.warn("No player characters found.");
      return;
    }

    const ABILITIES = [
      { key: "str", label: "Strength" },
      { key: "dex", label: "Dexterity" },
      { key: "con", label: "Constitution" },
      { key: "int", label: "Intelligence" },
      { key: "wis", label: "Wisdom" },
      { key: "cha", label: "Charisma" },
    ];

    const charOptions = pcs.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    const abilityOptions = ABILITIES.map(ab => `<option value="${ab.key}">${ab.label}</option>`).join('');

    const content = `
      <div class="osp-give-xp-dialog">
        <div class="osp-xp-amount-row" style="border-top:none;padding-top:0;">
          <label for="osp-ability-character">Character</label>
          <select id="osp-ability-character" style="width:100%;margin-top:4px;">${charOptions}</select>
        </div>
        <div class="osp-xp-amount-row">
          <label for="osp-ability-attr">Ability Score</label>
          <select id="osp-ability-attr" style="width:100%;margin-top:4px;">${abilityOptions}</select>
        </div>
        <div class="osp-xp-amount-row">
          <label for="osp-ability-value">New Value</label>
          <input type="number" id="osp-ability-value" value="10" min="3" max="18" style="width:100%;margin-top:4px;">
        </div>
      </div>`;

    new Dialog({
      title: "Edit Ability Score",
      content,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "OK",
          callback: async (html) => {
            const actorId = html.find('#osp-ability-character').val();
            const attr    = html.find('#osp-ability-attr').val();
            const value   = parseInt(html.find('#osp-ability-value').val());
            const actor   = game.actors.get(actorId);
            if (!actor || isNaN(value)) return;
            await actor.update({ [`system.attributes.${attr}.value`]: value });
            const label = ABILITIES.find(ab => ab.key === attr)?.label ?? attr;
            ui.notifications.info(`Set ${actor.name}'s ${label} to ${value}.`);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "ok",
      render: (html) => {
        const charSelect   = html.find('#osp-ability-character');
        const attrSelect   = html.find('#osp-ability-attr');
        const valueInput   = html.find('#osp-ability-value');

        const prefill = () => {
          const actor = game.actors.get(charSelect.val());
          const attr  = attrSelect.val();
          if (actor) {
            const current = actor.system.attributes?.[attr]?.value ?? 10;
            valueInput.val(current);
          }
        };

        charSelect.on('change', prefill);
        attrSelect.on('change', prefill);
        prefill();
        valueInput.focus().select();
      }
    }).render(true);
  }

  static async _onImportMonsters(_event, _target) {
    const content = `
      <div style="padding:4px 0;">
        <p style="margin:0 0 8px;font-size:12px;">Paste a monster JSON object or an array of monster objects.</p>
        <textarea id="osp-monster-json" rows="22"
          style="width:100%;font-family:monospace;font-size:10px;resize:vertical;"
          placeholder='[{ "name": "Goblin", ... }]'></textarea>
      </div>`;

    new Dialog({
      title: "Import Monsters",
      content,
      buttons: {
        import: {
          icon: '<i class="fas fa-file-import"></i>',
          label: "Import",
          callback: async (html) => {
            const raw = html.find('#osp-monster-json').val().trim();
            if (!raw) { ui.notifications.warn("No JSON provided."); return; }

            let monsters;
            try {
              const parsed = JSON.parse(raw);
              monsters = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
              ui.notifications.error(`JSON parse error: ${e.message}`);
              return;
            }

            let folder = game.folders.find(f => f.type === 'Actor' && f.name === 'Monsters');
            if (!folder) folder = await Folder.create({ name: 'Monsters', type: 'Actor' });

            let created = 0;
            const errors = [];
            for (const m of monsters) {
              try {
                await Actor.create({ ...DmToolkitTab._mapMonsterData(m), folder: folder.id });
                created++;
              } catch (e) {
                errors.push(m.name || '(unnamed)');
                console.error(`[OSP] Failed to import monster "${m.name}":`, e);
              }
            }

            if (created) ui.notifications.info(`Imported ${created} monster${created === 1 ? '' : 's'}.`);
            if (errors.length) ui.notifications.error(`Failed: ${errors.join(', ')}`);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "import"
    }).render(true);
  }

  static _mapMonsterData(m) {
    const src = m.system || {};
    const d   = src.details || {};

    const system = {
      hp: {
        hd:    src.hp?.hd    ?? '',
        value: src.hp?.value ?? 0,
        max:   src.hp?.max   ?? 0
      },
      ac: {
        value: src.ac?.value ?? 9,
        mod:   src.ac?.mod   ?? 0
      },
      aac: {
        value: src.aac?.value ?? 10,
        mod:   src.aac?.mod   ?? 0
      },
      thac0: {
        value: src.thac0?.value ?? 19,
        bba:   src.thac0?.bba   ?? 0,
        mod: {
          missile: src.thac0?.mod?.missile ?? 0,
          melee:   src.thac0?.mod?.melee   ?? 0
        }
      },
      saves: {
        death:     { value: src.saves?.death?.value     ?? 0 },
        wand:      { value: src.saves?.wand?.value      ?? 0 },
        paralysis: { value: src.saves?.paralysis?.value ?? 0 },
        breath:    { value: src.saves?.breath?.value    ?? 0 },
        spell:     { value: src.saves?.spell?.value     ?? 0 }
      },
      movement: {
        base:      src.movement?.base      ?? 0,
        encounter: src.movement?.encounter ?? 0
      },
      initiative: {
        value: src.initiative?.value ?? 0,
        mod:   src.initiative?.mod   ?? 0
      },
      details: {
        biography:        d.biography        ?? '',
        alignment:        d.alignment        ?? '',
        xp:               d.xp               ?? '',
        specialAbilities: d.specialAbilities ?? '',
        appearing: {
          d: d.appearing?.d ?? '',
          w: d.appearing?.w ?? ''
        },
        morale:   d.morale   ?? '',
        movement: d.movement ?? ''
      }
    };

    const items = (m.items || []).map(DmToolkitTab._mapMonsterItem);

    const pt = m.prototypeToken || {};
    const prototypeToken = {
      name:        m.name || 'Monster',
      displayName: pt.displayName ?? 20,
      width:       pt.width  ?? 1,
      height:      pt.height ?? 1,
      disposition: pt.disposition ?? -1,
      displayBars: pt.displayBars ?? 20,
      actorLink:   pt.actorLink   ?? false,
      bar1: { attribute: pt.bar1?.attribute ?? 'hp' },
      bar2: { attribute: pt.bar2?.attribute ?? null },
      // Token texture left as source-JSON value — FA tokens are managed separately
      texture: { src: pt.texture?.src || 'icons/svg/mystery-man.svg' }
    };

    return {
      name:           m.name  || 'Unnamed Monster',
      type:           'monster',
      img:            m.img   || 'icons/svg/mystery-man.svg',
      system,
      items,
      prototypeToken
    };
  }

  static async _onUpdateMonsterAttacks(_event, _target) {
    const content = `
      <div style="padding:4px 0;">
        <p style="margin:0 0 8px;font-size:12px;">
          Paste the same JSON used for the original monster import.<br>
          Each weapon's <code>counter.max</code> will be written to <strong>attacksPerRound</strong>
          on the matching actor already in the world. No actors are deleted or re-created.
        </p>
        <textarea id="osp-atkupdate-json" rows="20"
          style="width:100%;font-family:monospace;font-size:10px;resize:vertical;"
          placeholder='[{ "name": "Goblin", ... }]'></textarea>
      </div>`;

    new Dialog({
      title: "Update Monster Attack Counts",
      content,
      buttons: {
        update: {
          icon: '<i class="fas fa-sync-alt"></i>',
          label: "Update",
          callback: async (html) => {
            const raw = html.find('#osp-atkupdate-json').val().trim();
            if (!raw) { ui.notifications.warn("No JSON provided."); return; }

            let monsters;
            try {
              const parsed = JSON.parse(raw);
              monsters = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
              ui.notifications.error(`JSON parse error: ${e.message}`);
              return;
            }

            let weaponsUpdated = 0, alreadyCorrect = 0, notFound = 0;

            for (const m of monsters) {
              const sourceWeapons = (m.items || []).filter(i => i.type === 'weapon');
              if (!sourceWeapons.length) continue;

              const actors = game.actors.filter(a => a.type === 'monster' && a.name === m.name);
              if (!actors.length) { notFound++; continue; }

              for (const actor of actors) {
                for (const sw of sourceWeapons) {
                  const attacksPerRound = sw.system?.counter?.max ?? 1;
                  const weapon = actor.items.find(i => i.type === 'weapon' && i.name === sw.name);
                  if (!weapon) continue;

                  if ((weapon.system.attacksPerRound ?? 1) === attacksPerRound) {
                    alreadyCorrect++;
                  } else {
                    await weapon.update({ 'system.attacksPerRound': attacksPerRound });
                    weaponsUpdated++;
                  }
                }
              }
            }

            ui.notifications.info(
              `Attack counts updated: ${weaponsUpdated} changed, ${alreadyCorrect} already correct, ${notFound} monster name(s) not found in world.`
            );
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "update"
    }, { width: 560 }).render(true);
  }

  static _mapMonsterItem(item) {
    const s = item.system || {};
    const base = {
      name: item.name || 'Unnamed',
      type: item.type,
      img:  item.img  || null
      // _id intentionally omitted — Foundry generates new IDs on create
    };

    if (item.type === 'weapon') {
      base.system = {
        description: s.description || '',
        damage:      s.damage      || '',
        damageType:  s.damageType  || '',
        bonus:       s.bonus       ?? 0,
        tags:        s.tags        || [],
        melee:       s.melee       ?? true,
        missile:     s.missile     ?? false,
        slow:        s.slow        ?? false,
        range: {
          short:  s.range?.short  ?? 0,
          medium: s.range?.medium ?? 0,
          long:   s.range?.long   ?? 0
        },
        // source format stores quantity as {value, max}; ours is a plain number
        quantity:        (typeof s.quantity === 'object' ? s.quantity?.value : s.quantity) ?? 1,
        equipped:        s.equipped ?? false,
        // source format stores attacks-per-round in counter.max
        attacksPerRound: s.counter?.max ?? 1
      };
    } else {
      // ability, spell, and any other types — keep only description
      base.system = { description: s.description || '' };
    }

    return base;
  }
}
