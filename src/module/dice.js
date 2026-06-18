/**
 * @file Central dice rolling module — virtual and manual physical dice paths.
 *
 * All roll sites import ospRoll() from here. It routes to the appropriate path
 * based on user/world settings. Returns a uniform result object so callers can
 * handle hit/miss, natural-20 detection, and chat posting without caring which
 * mode is active.
 */

// ── Formula parser ─────────────────────────────────────────────────────────────

/**
 * Parse a simple dice formula into structured parts.
 * Supports: XdY, XdY+N, XdY-N (case-insensitive).
 * Returns null for complex formulas (fall back to virtual roll).
 */
export function parseOspFormula(formula) {
  const f = formula.replace(/\s+/g, '');
  const match = f.match(/^(\d+)[dD](\d+)([+-]\d+)?$/);
  if (!match) return null;
  return {
    dice: [{ count: parseInt(match[1]), faces: parseInt(match[2]) }],
    modifier: match[3] ? parseInt(match[3]) : 0,
    raw: formula
  };
}

// ── Chat card builder ──────────────────────────────────────────────────────────

/**
 * Build the HTML body for a manual-roll chat card.
 * Called by roll sites when result.manual === true.
 */
export function buildManualChatContent(result, options = {}) {
  const { dice, total } = result;
  const modifier = result.modifier ?? 0;

  let diceLines = '';
  for (const { faces, results } of dice) {
    if (results.length === 1) {
      diceLines += `<div class="osp-manual-die">d${faces}: <strong>${results[0]}</strong></div>`;
    } else {
      results.forEach((r, i) => {
        diceLines += `<div class="osp-manual-die">d${faces} #${i + 1}: <strong>${r}</strong></div>`;
      });
    }
  }

  const allResults = dice.flatMap(d => d.results);
  let mathLine = '';
  if (allResults.length > 1 || modifier !== 0) {
    const diePart = allResults.join(' + ');
    const modPart = modifier > 0 ? ` + ${modifier}` : modifier < 0 ? ` − ${Math.abs(modifier)}` : '';
    mathLine = `<div class="osp-manual-math">${diePart}${modPart} = <strong>${total}</strong></div>`;
  }

  return `
    <div class="osp-manual-roll-card">
      <div class="osp-manual-roll-badge">
        <i class="fas fa-hand-paper"></i> Manual Physical Dice
      </div>
      ${diceLines}
      ${mathLine}
    </div>`;
}

// ── Dialog helpers (internal) ──────────────────────────────────────────────────

function _buildDialogHTML(parsed, options) {
  const { dice, modifier, raw } = parsed;
  const label = options.label || '';

  let inputsHTML = '';
  for (const { count, faces } of dice) {
    for (let i = 0; i < count; i++) {
      const dieLabel = count > 1 ? `d${faces} #${i + 1}` : `d${faces}`;
      inputsHTML += `
        <div class="osp-die-row">
          <label class="osp-die-label">${dieLabel}</label>
          <input type="number" class="osp-die-input"
                 min="1" max="${faces}"
                 data-faces="${faces}" data-index="${i}"
                 placeholder="1–${faces}" autocomplete="off" />
          <span class="osp-die-error"></span>
        </div>`;
    }
  }

  const modLine = modifier !== 0
    ? `<div class="osp-die-modifier">Modifier: <strong>${modifier > 0 ? '+' : ''}${modifier}</strong></div>`
    : '';

  return `
    <div class="osp-manual-roll-dialog">
      ${label ? `<div class="osp-dialog-roll-label">${label}</div>` : ''}
      <div class="osp-dialog-formula">Formula: <code>${raw}</code></div>
      <div class="osp-die-inputs">${inputsHTML}</div>
      ${modLine}
      <div class="osp-die-total">Total: <strong class="osp-total-display">—</strong></div>
    </div>`;
}

function _updateLiveTotal(html, parsed) {
  const inputs = html.find('.osp-die-input');
  let sum = parsed.modifier;
  let allFilled = true;
  for (const inp of inputs) {
    const v = parseInt(inp.value);
    if (isNaN(v)) { allFilled = false; break; }
    sum += v;
  }
  html.find('.osp-total-display').text(allFilled ? sum : '—');
}

function _validateAndCollect(html, parsed) {
  const inputs = html.find('.osp-die-input');
  let valid = true;
  const dieResults = [];

  inputs.each(function() {
    const inp = $(this);
    const raw = inp.val().trim();
    const val = parseInt(raw);
    const faces = parseInt(inp.data('faces'));
    const errorEl = inp.siblings('.osp-die-error');

    if (raw === '' || isNaN(val)) {
      errorEl.text('Required');
      inp.addClass('osp-die-invalid');
      valid = false;
    } else if (val < 1 || val > faces) {
      errorEl.text(`Must be 1–${faces}`);
      inp.addClass('osp-die-invalid');
      valid = false;
    } else {
      errorEl.text('');
      inp.removeClass('osp-die-invalid');
      dieResults.push(val);
    }
  });

  return valid ? dieResults : null;
}

function _showManualDialog(parsed, options = {}) {
  const content = _buildDialogHTML(parsed, options);

  return new Promise((resolve) => {
    let resolved = false;

    const dialog = new Dialog({
      title: options.label ? `Enter Physical Dice: ${options.label}` : 'Enter Physical Dice',
      content,
      buttons: {
        submit: {
          icon: '<i class="fas fa-dice"></i>',
          label: 'Submit Roll',
          callback: () => {}  // intercepted in render below
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Cancel',
          callback: () => { resolved = true; resolve(null); }
        }
      },
      default: 'submit',
      close: () => { if (!resolved) resolve(null); },
      render: (html) => {
        // Auto-focus the first input after the DOM settles
        setTimeout(() => html.find('.osp-die-input').first()[0]?.focus(), 60);

        // Live total + clear errors on keystroke
        html.find('.osp-die-input').on('input', () => {
          _updateLiveTotal(html, parsed);
        });
        html.find('.osp-die-input').on('input', function() {
          $(this).removeClass('osp-die-invalid').siblings('.osp-die-error').text('');
        });

        // Intercept Submit so we can validate before allowing close
        const submitBtn = html.find('[data-button="submit"]');
        submitBtn.off('click').on('click', (e) => {
          e.stopImmediatePropagation();
          const dieResults = _validateAndCollect(html, parsed);
          if (!dieResults) return;  // errors shown inline — keep dialog open

          resolved = true;
          dialog.close();

          // Build structured result
          const { dice, modifier } = parsed;
          let idx = 0;
          const resultDice = dice.map(({ faces, count }) => {
            const results = dieResults.slice(idx, idx + count);
            idx += count;
            return { faces, results };
          });
          const total = dieResults.reduce((s, v) => s + v, 0) + modifier;
          const d20Entry = resultDice.find(d => d.faces === 20);
          const naturalD20 = d20Entry ? d20Entry.results[0] : null;

          resolve({ total, naturalD20, dice: resultDice, modifier, manual: true, cancelled: false, foundryRoll: null });
        });

        // Enter key submits
        html.find('.osp-die-input').on('keydown', (e) => {
          if (e.key === 'Enter') submitBtn.trigger('click');
        });
      }
    });

    dialog.render(true);
  });
}

// ── Roll mode choice dialog ────────────────────────────────────────────────────

function _showAskDialog(label) {
  return new Promise((resolve) => {
    const desc = label ? ` for <em>${label}</em>` : '';
    new Dialog({
      title: 'How would you like to roll?',
      content: `<p style="margin:0 0 4px">Roll${desc}:</p>`,
      buttons: {
        virtual: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: 'Roll Virtually',
          callback: () => resolve('virtual')
        },
        manual: {
          icon: '<i class="fas fa-hand-paper"></i>',
          label: 'Enter Manually',
          callback: () => resolve('manual')
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Cancel',
          callback: () => resolve('cancel')
        }
      },
      default: 'virtual',
      close: () => resolve('cancel')
    }).render(true);
  });
}

// ── Roll paths ─────────────────────────────────────────────────────────────────

async function _virtualPath(formula) {
  const roll = await new Roll(formula).evaluate();
  const d20Die = roll.dice.find(d => d.faces === 20);
  return {
    total: roll.total,
    dice: roll.dice.map(d => ({ faces: d.faces, results: d.results.map(r => r.result) })),
    naturalD20: d20Die?.total ?? null,
    modifier: null,
    manual: false,
    cancelled: false,
    foundryRoll: roll
  };
}

async function _manualPath(formula, options) {
  const parsed = parseOspFormula(formula);
  if (!parsed) {
    ui.notifications.info(`"${formula}" is too complex for manual entry — rolling virtually instead.`);
    return await _virtualPath(formula);
  }
  const result = await _showManualDialog(parsed, options);
  if (!result) return { cancelled: true, manual: true, foundryRoll: null };
  return result;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Central roll wrapper used by all OSP roll sites.
 *
 * Returns:
 *   { total, naturalD20, dice, modifier, manual, cancelled, foundryRoll }
 *
 * - For virtual rolls: foundryRoll is the Foundry Roll object; caller passes it
 *   to roll.toMessage() to preserve Dice So Nice animation.
 * - For manual rolls: foundryRoll is null; caller must create a ChatMessage
 *   manually using buildManualChatContent().
 * - If cancelled: cancelled===true; caller should abort the roll action.
 */
export async function ospRoll(formula, options = {}) {
  // Player Lock active → force virtual path (preCreateChatMessage hook blocks it)
  const isLocked = game.settings.get('osp-houserules', 'playerLock') && !game.user.isGM;
  if (isLocked) return await _virtualPath(formula);

  const allowManual  = game.settings.get('osp-houserules', 'allowManualPhysicalRolls');
  const forceVirtual = game.settings.get('osp-houserules', 'gmRequireVirtualRolls');
  const diceMode     = game.settings.get('osp-houserules', 'diceMode');

  const canManual = allowManual && !forceVirtual;

  if (canManual && diceMode === 'ask') {
    const choice = await _showAskDialog(options.label);
    if (choice === 'cancel') return { cancelled: true, manual: false, foundryRoll: null };
    if (choice === 'manual') return await _manualPath(formula, options);
    // 'virtual' falls through
  }

  if (canManual && diceMode === 'manual') {
    return await _manualPath(formula, options);
  }

  return await _virtualPath(formula);
}
