import { declareCombatEffect } from './combat-support-ui.js';
/** Foundry V2 combat tracker controls for OSP action declarations. */
import { actionSpeed } from "./initiative.js";
import { ospDialogOptions } from '../dialog/dialog-theme.js';

const itemsOf = actor => Array.from(actor?.items ?? []);
const weaponsOf = actor => itemsOf(actor).filter(item => item.type === "weapon" && item.system?.equipped === true);
const spellsOf = actor => itemsOf(actor).filter(item => item.type === "spell" || item.system?.type === "spell");
const speedLabel = item => { try { return actionSpeed({ kind: 'weapon', weaponIds: [item.id] }, [item]); } catch (_) { return 'speed needed'; } };
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

export default class OspCombatTracker extends foundry.applications.sidebar.tabs.CombatTracker {
  async _onRender(context, options) {
    await super._onRender?.(context, options);
    const root = this.element;
    const combat = this.viewed;
    if (!root || !combat) return;
    this.#renderRecoveryControl(root, combat);
    for (const li of root.querySelectorAll("li.combatant[data-combatant-id]")) {
      const combatant = combat.combatants.get(li.dataset.combatantId);
      if (!combatant || !(game.user?.isGM || combatant.isOwner || combatant.actor?.isOwner)) continue;
      this.#renderDeclarationControl(li, combat, combatant);
      if (!li.querySelector('.osp-combat-support')) {
        const control = document.createElement('button');
        control.type = 'button'; control.className = 'osp-combat-support';
        const state = combat.attackStateFor?.(combatant);
        control.textContent = state ? `Attacks ${Math.max(0,state.allowance-state.spent-Object.values(state.reservations).filter(r=>r.status==='reserved'&&!r.extra&&!r.offhand).length)}/${state.allowance}; offhand ${state.offhandSpent ? 0 : 1}` : 'Combat action';
        control.title = 'Confirm charge, aim or parry/dodge';
        control.addEventListener('click',event => {event.preventDefault();event.stopPropagation();void declareCombatEffect(combatant.actor,combat,combatant).catch(error => ui.notifications.error(error.message));});
        (li.querySelector('.combatant-controls, .controls') ?? li).appendChild(control);
      }
      if (game.user?.isGM) { this.#renderDefeatedControl(li, combat, combatant); this.#renderSurpriseControl(li, combat, combatant); }
    }
  }

  async _prepareTurnContext(combat, combatant, index) {
    const context = await super._prepareTurnContext(combat, combatant, index);
    context.initiative = Number.isFinite(combatant.initiative) ? Math.floor(combatant.initiative) : null;
    context.hasDecimals = false;
    context.isDefeated = Boolean(combatant.defeated);
    return context;
  }

  #renderRecoveryControl(root, combat) {
    if (!game.user?.isGM || combat.initiativeOperation?.status !== 'prepared' || root.querySelector('.osp-initiative-recover')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'osp-initiative-recover'; button.textContent = 'Recover initiative';
    button.addEventListener('click', event => { event.preventDefault(); void combat.recoverInitiative().catch(error => ui.notifications.error(error.message)); });
    (root.querySelector('header') ?? root).appendChild(button);
  }

  #renderSurpriseControl(li, combat, combatant) {
    if (li.querySelector('.osp-surprise-control')) return;
    const label = document.createElement('label');
    label.className = 'osp-surprise-control'; label.title = 'Skip this combatant in the opening round';
    label.innerHTML = `<input type="checkbox" ${combatant.isSurprised ? 'checked' : ''} ${combat.round > 1 ? 'disabled' : ''}> Surprise`;
    label.querySelector('input').addEventListener('change', event => {
      event.stopPropagation(); void combat.setSurprised(combatant.id, event.currentTarget.checked).catch(error => ui.notifications.error(error.message));
    });
    (li.querySelector('.combatant-controls, .controls') ?? li).appendChild(label);
  }

  #renderDeclarationControl(li, combat, combatant) {
    if (li.querySelector(".osp-action-declaration")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "osp-action-declaration combatant-control";
    button.dataset.control = "declareAction";
    button.title = "Declare action";
    button.setAttribute("aria-label", "Declare action");
    button.innerHTML = `<i class="fas fa-bullseye"></i>`;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      try { this.#openDeclaration(combat, combatant); } catch (error) { ui.notifications.error(error.message); }
    });
    const controls = li.querySelector(".combatant-controls, .controls");
    if (controls) controls.appendChild(button);
    else li.appendChild(button);
  }

  #renderDefeatedControl(li, combat, combatant) {
    if (li.querySelector(".osp-defeated-control")) return;
    const label = document.createElement("label");
    label.className = "osp-defeated-control combatant-control";
    label.title = "Mark defeated";
    label.innerHTML = `<input type="checkbox" ${combatant.isDefeated ? "checked" : ""} aria-label="Defeated">`;
    label.querySelector("input").addEventListener("change", event => {
      void combat.markDefeated(combatant.id, event.currentTarget.checked).catch(error => ui.notifications?.error(error.message));
    });
    const controls = li.querySelector(".combatant-controls, .controls");
    if (controls) controls.appendChild(label);
    else li.appendChild(label);
  }

  #openDeclaration(combat, combatant) {
    if (!globalThis.Dialog) {
      ui.notifications?.error("Action declaration dialog is unavailable.");
      return;
    }
    const actor = combatant.actor;
    const weapons = weaponsOf(actor);
    const spells = spellsOf(actor);
    const state = combatant.combatInitiativeState ?? {};
    const selected = state.declaration ?? {};
    const selectedWeapons = selected.weaponIds ?? selected.selectedWeaponIds ?? [];
    const selectedSpell = selected.spellId ?? "";
    const weaponOptions = weapons.map(item => `<option value="${esc(item.id)}" ${selectedWeapons.includes(item.id) ? "selected" : ""}>${esc(item.name)} (${speedLabel(item)})</option>`).join("");
    const spellOptions = spells.map(item => `<option value="${esc(item.id)}" ${selectedSpell === item.id ? "selected" : ""}>${esc(item.name)} (level ${esc(item.system?.lvl ?? item.system?.level ?? 0)})</option>`).join("");
    const kind = selected.kind ?? "unarmed";
    const content = `<form class="osp-declaration-form"><label>Action <select name="kind"><option value="weapon" ${kind === "weapon" ? "selected" : ""}>Weapon</option><option value="twoWeapon" ${kind === "twoWeapon" ? "selected" : ""}>Two weapons</option><option value="spell" ${kind === "spell" ? "selected" : ""}>Spell</option><option value="unarmed" ${kind === "unarmed" ? "selected" : ""}>Unarmed</option><option value="other" ${kind === "other" ? "selected" : ""}>Other</option></select></label><label>Weapons <select name="weaponIds" multiple>${weaponOptions}</select></label><label>Spell <select name="spellId"><option value="">Choose spell</option>${spellOptions}</select></label></form>`;
    new Dialog(ospDialogOptions({
      title: "Declare action",
      content,
      buttons: {
        submit: {
          label: "Apply",
          callback: html => {
            const root = html[0] ?? html;
            const kindValue = root.querySelector("[name=kind]").value;
            const weaponIds = [...root.querySelector("[name=weaponIds]").selectedOptions].map(option => option.value);
            const spellId = root.querySelector("[name=spellId]").value || null;
            const declaration = kindValue === 'spell' ? { kind: kindValue, spellId } : ['weapon', 'twoWeapon'].includes(kindValue) ? { kind: kindValue, weaponIds } : { kind: kindValue };
            return combat.setDeclaration(combatant.id, declaration).catch(error => ui.notifications?.error(error.message));
          },
        },
        cancel: { label: "Cancel" },
      },
      default: "submit",
    })).render(true);
  }
}

export { itemsOf, weaponsOf, spellsOf };
