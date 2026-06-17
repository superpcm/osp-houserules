/**
 * @file Morale system — automatic 2d6 checks on first enemy casualty and 50% losses.
 */

const REACTIONS = [
  "Flee",
  "Surrender",
  "Retreat in good order",
  "Beg for mercy",
  "Try to parley",
  "Fall back and regroup",
  "Abandon treasure or allies",
  "Change tactics defensively"
];

// Per-combat state: combatId → { initialCount, firstCasualtyDone, halfLossesDone, deadIds }
const _state = new Map();

// ── State helpers ─────────────────────────────────────────────────────────────

function initState(combat) {
  const enemies = hostileCombatants(combat);
  _state.set(combat.id, {
    initialCount:      enemies.length,
    firstCasualtyDone: false,
    halfLossesDone:    false,
    deadIds:           new Set()
  });
  return _state.get(combat.id);
}

function getState(combat) {
  return _state.get(combat.id) ?? initState(combat);
}

// ── Combatant helpers ─────────────────────────────────────────────────────────

function hostileCombatants(combat) {
  return combat.combatants.filter(
    c => c.token?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE
  );
}

function livingHostiles(combat, state) {
  return hostileCombatants(combat).filter(c => {
    if (state.deadIds.has(c.id)) return false;
    const hp = c.actor?.system?.hp?.value ?? null;
    return hp === null || hp > 0;
  });
}

// ── Casualty handler ──────────────────────────────────────────────────────────

async function handleCasualty(combat, combatant) {
  const state = getState(combat);
  if (state.deadIds.has(combatant.id)) return;
  state.deadIds.add(combatant.id);

  const dead = state.deadIds.size;

  if (!state.firstCasualtyDone) {
    state.firstCasualtyDone = true;
    await runMoraleCheck(combat, state, "First Casualty");
  } else if (!state.halfLossesDone && dead >= Math.ceil(state.initialCount / 2)) {
    state.halfLossesDone = true;
    await runMoraleCheck(combat, state, "50% Losses");
  }
}

// ── Morale check ──────────────────────────────────────────────────────────────

async function runMoraleCheck(combat, state, trigger) {
  const candidates = livingHostiles(combat, state);
  if (!candidates.length) return;

  const results = await Promise.all(candidates.map(async c => {
    const morale = parseInt(c.actor?.system?.details?.morale ?? "0") || 0;
    const roll   = new Roll("2d6");
    await roll.evaluate();
    const total  = roll.total;
    const failed = total > morale;
    return {
      name:     c.name,
      roll:     total,
      morale,
      failed,
      reaction: failed ? REACTIONS[Math.floor(Math.random() * REACTIONS.length)] : null
    };
  }));

  showMoraleDialog(trigger, results, state);
}

// ── Dialog ────────────────────────────────────────────────────────────────────

function showMoraleDialog(trigger, results, state) {
  const failCount = results.filter(r => r.failed).length;

  const rows = results.map(r => `
    <tr class="${r.failed ? 'morale-fail' : 'morale-pass'}">
      <td class="morale-name">${r.name}</td>
      <td class="morale-roll">${r.roll}</td>
      <td class="morale-score">${r.morale || '—'}</td>
      <td class="morale-result">${r.failed ? '<strong>FAIL</strong>' : 'Pass'}</td>
      <td class="morale-reaction">${r.reaction ?? '—'}</td>
    </tr>`).join('');

  const summary = failCount === 0
    ? `<span class="morale-all-pass">All combatants hold.</span>`
    : `<span class="morale-some-fail">${failCount} of ${results.length} broke morale.</span>`;

  const content = `
    <div class="osp-morale-dialog">
      <div class="morale-header">
        <span class="morale-trigger">Trigger: <strong>${trigger}</strong></span>
        ${summary}
      </div>
      <table class="morale-table">
        <thead>
          <tr>
            <th>Combatant</th>
            <th title="2d6 roll">Roll</th>
            <th title="Morale score">Morale</th>
            <th>Result</th>
            <th>Reaction</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  new Dialog({
    title: "Morale Check",
    content,
    buttons: { close: { label: "Close" } },
    default: "close"
  }, { width: 560, classes: ["dialog", "osp-morale-popup"] }).render(true);
}

// ── Hook registration ─────────────────────────────────────────────────────────

export function registerMoraleHooks() {

  // Initialise state when combat begins
  Hooks.on("combatStart", (combat) => {
    initState(combat);
  });

  // Clean up on combat deletion
  Hooks.on("deleteCombat", (combat) => {
    _state.delete(combat.id);
  });

  // ── Unlinked token actors (most monsters) ──
  // HP for unlinked tokens is stored in the token delta; updateToken fires.
  Hooks.on("updateToken", async (tokenDoc, changes, _options, userId) => {
    if (!game.user.isGM) return;

    // HP lives at changes.delta.system.hp.value (nested) or as flat key
    const expanded = foundry.utils.expandObject(changes);
    const newHP    = foundry.utils.getProperty(expanded, "delta.system.hp.value");
    if (newHP === undefined || newHP > 0) return;

    const combat = game.combat;
    if (!combat?.started) return;

    const combatant = combat.combatants.find(c => c.tokenId === tokenDoc.id);
    if (!combatant) return;
    if (combatant.token?.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) return;

    await handleCasualty(combat, combatant);
  });

  // ── Linked actors ──
  Hooks.on("updateActor", async (actor, changes, _options, userId) => {
    if (!game.user.isGM) return;
    const newHP = changes.system?.hp?.value;
    if (newHP === undefined || newHP > 0) return;

    const combat = game.combat;
    if (!combat?.started) return;

    const combatants = combat.combatants.filter(c =>
      c.actor?.id === actor.id &&
      c.token?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE
    );

    for (const combatant of combatants) {
      await handleCasualty(combat, combatant);
    }
  });
}
